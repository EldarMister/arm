import { Router } from 'express'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pool from '../db.js'
import { getExchangeRateSnapshot } from '../lib/exchangeRate.js'
import { fetchEncarVehicleEnrichment } from '../lib/encarVehicle.js'
import { getPricingSettings, savePricingSettings } from '../lib/pricingSettings.js'
import {
  classifyVehicleOrigin,
  isWeakBodyType,
  normalizeColorName,
  normalizeDrive as normalizeDriveLabel,
  normalizeInteriorColorName,
  normalizeTrimLevel,
  resolveBodyType,
  resolveVehicleClass,
  VEHICLE_ORIGIN_LABELS,
} from '../lib/vehicleData.js'
import { createCarTextBackfillState, runCarTextBackfill } from '../lib/carTextBackfill.js'
import { normalizeCarTextFields } from '../lib/carRecordNormalization.js'
import { normalizeKnownBrandAlias } from '../../shared/brandAliases.js'
import { CAR_LISTING_TYPES, normalizeCarListingType } from '../../shared/catalogTypes.js'
import { isStandardVin, normalizeVin, sanitizeVin } from '../lib/vin.js'
import {
  createAdminSessionToken,
  isAdminPasswordConfigured,
  requireAdminSession,
  verifyAdminPassword,
} from '../lib/adminAuth.js'
import {
  applyNoStoreHeaders,
  createRateLimitMiddleware,
  createRateLimitStore,
} from '../lib/requestSecurity.js'

const router = Router()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '..', '..')
const MIN_CATALOG_YEAR = 2019
const ENRICH_SCOPE_ALL = 'all'
const ENRICH_SCOPE_LATEST = 'latest'
const DEFAULT_LATEST_ENRICH_LIMIT = 50
const MAX_LATEST_ENRICH_LIMIT = 50000
const BACKFILL_TARGET_ALL = 'all'
const BACKFILL_TARGET_VALUES = ['interior', 'drive', 'key', 'vin', 'trim', 'options', 'warranty', BACKFILL_TARGET_ALL]
const BACKFILL_INTERIOR_MODE_VALUES = ['missing', 'invalid', 'missing_or_invalid']
const DEFAULT_BACKFILL_TARGET = 'interior'
const DEFAULT_BACKFILL_INTERIOR_MODE = 'missing'
const DEFAULT_BACKFILL_LIMIT = 300
const MAX_BACKFILL_LIMIT = 50000
const DEFAULT_BACKFILL_CONCURRENCY = 3
const MAX_BACKFILL_CONCURRENCY = 8
const DEFAULT_CATALOG_EXPORT_LIMIT = 5000
const MAX_CATALOG_EXPORT_LIMIT = 50000
const WEAK_BODY_TYPES = new Set(['', '-', 'SUV', 'Вэн', 'Малый класс', 'Компактный класс', 'Средний класс', 'Бизнес-класс'])

function resolveRequestedListingType(value, { allowAll = false } = {}) {
  const normalized = String(value || '').trim().toLowerCase()
  if (allowAll && (normalized === 'all' || normalized === '*')) return 'all'
  return normalizeCarListingType(value, CAR_LISTING_TYPES.main)
}
const CANONICAL_DRIVE_TYPES = new Set(['Передний (FWD)', 'Задний (RWD)', 'Полный (AWD)', 'Полный (4WD)'])
const WEAK_KEY_INFO_VALUES = new Set(['Ключи есть', 'Есть запасной ключ', 'Пульт-ключ', 'Карта-ключ', 'Ключ-карта'])
const enrichState = {
  running: false,
  stop_requested: false,
  stopped: false,
  total: 0,
  processed: 0,
  updated: 0,
  removed: 0,
  skipped: 0,
  errors: 0,
  started_at: null,
  finished_at: null,
  current: null,
  last_error: '',
  report: [],
  scope: ENRICH_SCOPE_ALL,
  latest_limit: DEFAULT_LATEST_ENRICH_LIMIT,
}
const normalizeCarsState = createCarTextBackfillState()
const encarBackfillState = {
  running: false,
  stop_requested: false,
  stopped: false,
  target: DEFAULT_BACKFILL_TARGET,
  mode: DEFAULT_BACKFILL_INTERIOR_MODE,
  limit: DEFAULT_BACKFILL_LIMIT,
  concurrency: DEFAULT_BACKFILL_CONCURRENCY,
  total: 0,
  processed: 0,
  updated: 0,
  skipped: 0,
  errors: 0,
  started_at: null,
  finished_at: null,
  last_error: '',
  last_line: '',
  output: [],
  pid: null,
  exit_code: null,
  signal: null,
  process: null,
}
const DEFAULT_ENRICH_CONCURRENCY = (() => {
  const raw = Number.parseInt(globalThis.process?.env?.ENRICH_CONCURRENCY || '5', 10)
  if (!Number.isFinite(raw)) return 5
  return Math.min(Math.max(raw, 1), 6)
})()
const ENRICH_SUCCESS_COOLDOWN_HOURS = (() => {
  const raw = Number.parseInt(globalThis.process?.env?.ENRICH_SUCCESS_COOLDOWN_HOURS || '24', 10)
  if (!Number.isFinite(raw)) return 24
  return Math.min(Math.max(raw, 1), 720)
})()
const ENRICH_ERROR_RETRY_HOURS = (() => {
  const raw = Number.parseInt(globalThis.process?.env?.ENRICH_ERROR_RETRY_HOURS || '12', 10)
  if (!Number.isFinite(raw)) return 12
  return Math.min(Math.max(raw, 1), 168)
})()
const ADMIN_LOGIN_MAX_ATTEMPTS = 3
const ADMIN_LOGIN_LOCKOUT_HOURS = 1
const adminLoginRateLimitStore = createRateLimitStore('admin-login')
const adminRouteProtection = requireAdminSession()
const adminLoginRateLimit = createRateLimitMiddleware({
  store: adminLoginRateLimitStore,
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyFn: getAdminLoginIdentifier,
  message: 'Слишком много попыток входа в админку. Повторите позже.',
  logLabel: 'ADMIN_LOGIN_RATE_LIMIT',
})

router.use(applyNoStoreHeaders)

const HANGUL_RE = /[\uAC00-\uD7A3]/u
const ENRICH_TRIM_ROMANIZED_RE = /\b(choegogeuphyeong|gibonhyeong|kaelrigeuraepi|geuraebiti|bijeon|seupesyeol|direokseu|intelrijeonteu|maseuteojeu|koeo|rimujin|raunji|teurendi|kaempingka|camping\s+car|idongsamucha|hairimujin|hailimujin|peulreoseu|peurimieo|peurimio)\b/i

const COLOR_SWATCH = {
  Черный: { color: '#1a1a1a' },
  Белый: { color: '#f0f0f0', border: '#d1d5db' },
  Серый: { color: '#6b7280' },
  Серебристый: { color: '#d1d5db', border: '#9ca3af' },
  Синий: { color: '#1d4ed8' },
  Красный: { color: '#dc2626' },
  Зеленый: { color: '#16a34a' },
  Бежевый: { color: '#d4a96a' },
  Коричневый: { color: '#92400e' },
  Оранжевый: { color: '#f97316' },
  Желтый: { color: '#eab308' },
  Фиолетовый: { color: '#7c3aed' },
}

const EXTRA_COLOR_SWATCH = {
  'Мокрый асфальт': { color: '#5b6470' },
  'Графитовый': { color: '#505862' },
  'Серебристо-серый': { color: '#b8c0ca', border: '#94a3b8' },
  'Белый двухцветный': { color: '#f8fafc', border: '#111827' },
  'Темно-серый': { color: '#4b5563' },
  'Светло-серый': { color: '#dbe1e8', border: '#a8b3c2' },
  'Жемчужный': { color: '#e7eaef', border: '#cbd5e1' },
  'Жемчужно-белый': { color: '#f8fafc', border: '#cbd5e1' },
  'Жемчужно-черный': { color: '#1f2937' },
  'Снежный белый': { color: '#ffffff', border: '#d1d5db' },
  'Айвори': { color: '#f3ead8', border: '#d6c7aa' },
  'Винный': { color: '#7f1d1d' },
  'Темно-синий': { color: '#1e3a8a' },
  'Золотой': { color: '#c9971a' },
}

function getAdminLoginIdentifier(req) {
  const forwardedFor = String(req.get('x-forwarded-for') || '')
    .split(',')
    .map((value) => value.trim())
    .find(Boolean)

  return forwardedFor || req.ip || req.socket?.remoteAddress || 'unknown'
}

function buildAdminLockoutState(row) {
  const failedAttempts = Number(row?.failed_attempts || 0)
  const blockedUntil = row?.blocked_until ? new Date(row.blocked_until).toISOString() : null
  const blockedUntilMs = blockedUntil ? new Date(blockedUntil).getTime() : 0
  const remainingSeconds = blockedUntilMs > Date.now()
    ? Math.max(0, Math.ceil((blockedUntilMs - Date.now()) / 1000))
    : 0

  return {
    active: remainingSeconds > 0,
    failedAttempts,
    attemptsRemaining: Math.max(0, ADMIN_LOGIN_MAX_ATTEMPTS - failedAttempts),
    blockedUntil,
    remainingSeconds,
  }
}

async function getAdminLoginAttemptRow(identifier) {
  const result = await pool.query(
    `SELECT identifier, failed_attempts, last_failed_at, blocked_until, last_success_at
     FROM admin_login_attempts
     WHERE identifier = $1
     LIMIT 1`,
    [identifier],
  )

  const row = result.rows[0] || null
  if (!row) return null

  const now = Date.now()
  const blockedUntilMs = row.blocked_until ? new Date(row.blocked_until).getTime() : 0
  const lastFailedMs = row.last_failed_at ? new Date(row.last_failed_at).getTime() : 0
  const shouldResetExpiredBlock = blockedUntilMs > 0 && blockedUntilMs <= now
  const shouldResetStaleAttempts = blockedUntilMs === 0 && lastFailedMs > 0 && (now - lastFailedMs) >= (ADMIN_LOGIN_LOCKOUT_HOURS * 60 * 60 * 1000)

  if (!shouldResetExpiredBlock && !shouldResetStaleAttempts) {
    return row
  }

  const resetResult = await pool.query(
    `UPDATE admin_login_attempts
     SET failed_attempts = 0,
         last_failed_at = NULL,
         blocked_until = NULL,
         updated_at = NOW()
     WHERE identifier = $1
     RETURNING identifier, failed_attempts, last_failed_at, blocked_until, last_success_at`,
    [identifier],
  )

  return resetResult.rows[0] || null
}

async function recordAdminLoginFailure(identifier) {
  const current = await getAdminLoginAttemptRow(identifier)
  const nextFailedAttempts = Number(current?.failed_attempts || 0) + 1
  const shouldBlock = nextFailedAttempts >= ADMIN_LOGIN_MAX_ATTEMPTS
  const blockedUntil = shouldBlock
    ? new Date(Date.now() + ADMIN_LOGIN_LOCKOUT_HOURS * 60 * 60 * 1000).toISOString()
    : null

  const result = await pool.query(
    `INSERT INTO admin_login_attempts (
       identifier,
       failed_attempts,
       last_failed_at,
       blocked_until,
       created_at,
       updated_at
     )
     VALUES ($1, $2, NOW(), $3, NOW(), NOW())
     ON CONFLICT (identifier) DO UPDATE
     SET failed_attempts = $2,
         last_failed_at = NOW(),
         blocked_until = $3,
         updated_at = NOW()
     RETURNING identifier, failed_attempts, last_failed_at, blocked_until, last_success_at`,
    [identifier, nextFailedAttempts, blockedUntil],
  )

  return result.rows[0] || null
}

async function clearAdminLoginAttempts(identifier) {
  await pool.query(
    `INSERT INTO admin_login_attempts (
       identifier,
       failed_attempts,
       last_failed_at,
       blocked_until,
       last_success_at,
       created_at,
       updated_at
     )
     VALUES ($1, 0, NULL, NULL, NOW(), NOW(), NOW())
     ON CONFLICT (identifier) DO UPDATE
     SET failed_attempts = 0,
         last_failed_at = NULL,
         blocked_until = NULL,
         last_success_at = NOW(),
         updated_at = NOW()`,
    [identifier],
  )
}

const KO = {
  kia: '\uAE30\uC544',
  hyundai: '\uD604\uB300',
  genesis: '\uC81C\uB124\uC2DC\uC2A4',
  chevrolet: '\uC250\uBCF4\uB808',
  renault: '\uB974\uB178',
  samsung: '\uC0BC\uC131',
  ssangyong: '\uC30D\uC6A9',
  kgMobility: '\uBAA8\uBE4C\uB9AC\uD2F0',
  diesel: '\uB514\uC824',
  gasoline: '\uAC00\uC194\uB9B0',
  gasolineAlt: '\uD718\uBC1C\uC720',
  hybrid: '\uD558\uC774\uBE0C\uB9AC\uB4DC',
  electric: '\uC804\uAE30',
  lpg: '\uC5D8\uD53C\uC9C0',
  hydrogen: '\uC218\uC18C',
  fwd: '\uC804\uB95C',
  rwd: '\uD6C4\uB95C',
  awd4wd: '\uC0AC\uB95C',
  sedan: '\uC138\uB2E8',
  hatchback: '\uD574\uCE58\uBC31',
  wagon: '\uC65C\uAC74',
  minivan: '\uBBF8\uB2C8\uBC34',
  van: '\uBC34',
  coupe: '\uCFE0\uD398',
  truck: '\uD2B8\uB7ED',
  cargo: '\uD654\uBB3C',
  crossover: '\uD06C\uB85C\uC2A4\uC624\uBC84',
  black: '\uAC80\uC815',
  blackAlt: '\uD751\uC0C9',
  white: '\uD770\uC0C9',
  whiteAlt: '\uBC31\uC0C9',
  silver: '\uC740\uC0C9',
  gray: '\uD68C\uC0C9',
  grayAlt: '\uC950\uC0C9',
  blue: '\uCCAD\uC0C9',
  blueAlt: '\uD30C\uB791',
  red: '\uD64D\uC0C9',
  redAlt: '\uBE68\uAC15',
  green: '\uB179\uC0C9',
  greenAlt: '\uCD08\uB85D',
  brown: '\uAC08\uC0C9',
  beige: '\uBCA0\uC774\uC9C0',
  orange: '\uC8FC\uD669',
  yellow: '\uB178\uB791',
  purple: '\uBCF4\uB77C',
}

function hasAny(value, needles) {
  const src = String(value || '')
  return needles.some((needle) => src.includes(needle))
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalizeEvidenceSource(value) {
  const text = cleanText(value)
  return text || null
}

function serializeEvidenceDiagnostics(value) {
  return JSON.stringify(Array.isArray(value) ? value : [])
}

function getResolverReason(diagnostics = []) {
  if (!Array.isArray(diagnostics)) return ''
  return cleanText(
    diagnostics.find((entry) => entry?.source === 'resolver')?.reason
    || diagnostics.find((entry) => entry && entry.found === false)?.reason
    || '',
  )
}

function buildEnrichParseNotes(detail, car) {
  const notes = []

  if (shouldRefreshVin(car?.vin) && !sanitizeVin(detail?.vin)) {
    notes.push(`vin:${getResolverReason(detail?.vin_diagnostics) || 'value_not_found'}`)
  }

  if (shouldRefreshDriveType(car?.drive_type) && !cleanText(detail?.drive_type)) {
    notes.push(`drive_type:${getResolverReason(detail?.drive_type_diagnostics) || 'value_not_found'}`)
  }

  if (shouldRefreshKeyInfo(car?.key_info) && !cleanText(detail?.key_info)) {
    notes.push(`key_info:${getResolverReason(detail?.key_info_diagnostics) || 'value_not_found'}`)
  }

  if (shouldRefreshInteriorColor(car?.interior_color, car?.body_color) && !cleanText(detail?.interior_color)) {
    notes.push(`interior_color:${getResolverReason(detail?.interior_color_diagnostics) || 'value_not_found'}`)
  }

  return notes
}

function isVinConstraintError(error) {
  return error?.code === '23505' && error?.constraint === 'idx_cars_vin_unique'
}

async function getExistingCarIdByVin(vin, excludeId = null) {
  const normalized = normalizeVin(vin)
  if (!isStandardVin(normalized)) return null

  const params = [normalized]
  let sql = 'SELECT id FROM cars WHERE UPPER(BTRIM(vin)) = $1'
  if (excludeId) {
    params.push(excludeId)
    sql += ' AND id != $2'
  }
  sql += ' LIMIT 1'

  const result = await pool.query(sql, params)
  return result.rows[0]?.id || null
}

function getCurrentEnrichEncarId(car = {}) {
  return cleanText(car.encar_id)
}

function getEnrichCandidateWhereSql() {
  return `
    encar_id IS NOT NULL
    AND BTRIM(encar_id) != ''
    AND NOT (
      enrich_last_status = 'not_found'
      AND COALESCE(NULLIF(BTRIM(enrich_last_encar_id), ''), '') = COALESCE(NULLIF(BTRIM(encar_id), ''), '')
    )
    AND NOT (
      enrich_last_status IN ('updated', 'checked', 'duplicate_vin')
      AND enrich_checked_at IS NOT NULL
      AND enrich_checked_at > NOW() - INTERVAL '${ENRICH_SUCCESS_COOLDOWN_HOURS} hours'
      AND COALESCE(NULLIF(BTRIM(enrich_last_encar_id), ''), '') = COALESCE(NULLIF(BTRIM(encar_id), ''), '')
    )
    AND NOT (
      enrich_last_status = 'error'
      AND enrich_checked_at IS NOT NULL
      AND enrich_checked_at > NOW() - INTERVAL '${ENRICH_ERROR_RETRY_HOURS} hours'
      AND COALESCE(NULLIF(BTRIM(enrich_last_encar_id), ''), '') = COALESCE(NULLIF(BTRIM(encar_id), ''), '')
    )
  `
}

function pushEnrichReportItem(item) {
  enrichState.report.unshift(item)
  if (enrichState.report.length > 200) {
    enrichState.report = enrichState.report.slice(0, 200)
  }
}

function normalizeEnrichOptions(value = {}) {
  const scope = value?.scope === ENRICH_SCOPE_LATEST ? ENRICH_SCOPE_LATEST : ENRICH_SCOPE_ALL
  const latestLimitRaw = Number.parseInt(String(value?.latest_limit ?? value?.latestLimit ?? DEFAULT_LATEST_ENRICH_LIMIT), 10)
  const latestLimit = Number.isFinite(latestLimitRaw)
    ? Math.min(Math.max(latestLimitRaw, 1), MAX_LATEST_ENRICH_LIMIT)
    : DEFAULT_LATEST_ENRICH_LIMIT

  return { scope, latestLimit }
}

function normalizeBackfillTarget(value) {
  const raw = String(value || DEFAULT_BACKFILL_TARGET).trim().toLowerCase()
  return BACKFILL_TARGET_VALUES.includes(raw) ? raw : DEFAULT_BACKFILL_TARGET
}

function normalizeBackfillMode(value) {
  const raw = String(value || DEFAULT_BACKFILL_INTERIOR_MODE).trim().toLowerCase()
  return BACKFILL_INTERIOR_MODE_VALUES.includes(raw) ? raw : DEFAULT_BACKFILL_INTERIOR_MODE
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? fallback), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(parsed, min), max)
}

function normalizeBackfillOptions(value = {}) {
  return {
    target: normalizeBackfillTarget(value?.target),
    mode: normalizeBackfillMode(value?.mode),
    limit: clampInteger(value?.limit, DEFAULT_BACKFILL_LIMIT, 1, MAX_BACKFILL_LIMIT),
    concurrency: clampInteger(value?.concurrency, DEFAULT_BACKFILL_CONCURRENCY, 1, MAX_BACKFILL_CONCURRENCY),
  }
}

function hasActiveBackgroundTask() {
  return Boolean(enrichState.running || normalizeCarsState.running || encarBackfillState.running)
}

function createBackfillStatusSnapshot() {
  return {
    running: encarBackfillState.running,
    stop_requested: encarBackfillState.stop_requested,
    stopped: encarBackfillState.stopped,
    target: encarBackfillState.target,
    mode: encarBackfillState.mode,
    limit: encarBackfillState.limit,
    concurrency: encarBackfillState.concurrency,
    total: encarBackfillState.total,
    processed: encarBackfillState.processed,
    updated: encarBackfillState.updated,
    skipped: encarBackfillState.skipped,
    errors: encarBackfillState.errors,
    started_at: encarBackfillState.started_at,
    finished_at: encarBackfillState.finished_at,
    last_error: encarBackfillState.last_error,
    last_line: encarBackfillState.last_line,
    output: [...encarBackfillState.output],
    pid: encarBackfillState.pid,
    exit_code: encarBackfillState.exit_code,
    signal: encarBackfillState.signal,
  }
}

function pushBackfillOutputLine(line) {
  const text = cleanText(line)
  if (!text) return
  encarBackfillState.last_line = text
  encarBackfillState.output.push(text)
  if (encarBackfillState.output.length > 40) {
    encarBackfillState.output = encarBackfillState.output.slice(-40)
  }
}

function parseBackfillProgressLine(line) {
  const progressMatch = line.match(/Progress:\s*(\d+)\/(\d+)\s*\|\s*updated=(\d+)\s*skipped=(\d+)\s*errors=(\d+)/i)
  if (progressMatch) {
    encarBackfillState.processed = Number.parseInt(progressMatch[1], 10) || 0
    encarBackfillState.total = Number.parseInt(progressMatch[2], 10) || encarBackfillState.total
    encarBackfillState.updated = Number.parseInt(progressMatch[3], 10) || 0
    encarBackfillState.skipped = Number.parseInt(progressMatch[4], 10) || 0
    encarBackfillState.errors = Number.parseInt(progressMatch[5], 10) || 0
    return
  }

  const candidatesMatch = line.match(/Backfill candidates:\s*(\d+)/i)
  if (candidatesMatch) {
    encarBackfillState.total = Number.parseInt(candidatesMatch[1], 10) || 0
    return
  }

  if (/^Backfill error for ID /i.test(line)) {
    encarBackfillState.errors += 1
    encarBackfillState.last_error = line
  }
}

function bindBackfillStream(stream) {
  if (!stream) return

  let buffer = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    buffer += String(chunk || '')
    const parts = buffer.split(/\r?\n/)
    buffer = parts.pop() || ''
    for (const line of parts) {
      pushBackfillOutputLine(line)
      parseBackfillProgressLine(line)
    }
  })
  stream.on('end', () => {
    if (!buffer) return
    pushBackfillOutputLine(buffer)
    parseBackfillProgressLine(buffer)
  })
}

function resetBackfillState(options) {
  encarBackfillState.running = false
  encarBackfillState.stop_requested = false
  encarBackfillState.stopped = false
  encarBackfillState.target = options?.target ?? DEFAULT_BACKFILL_TARGET
  encarBackfillState.mode = options?.mode ?? DEFAULT_BACKFILL_INTERIOR_MODE
  encarBackfillState.limit = options?.limit ?? DEFAULT_BACKFILL_LIMIT
  encarBackfillState.concurrency = options?.concurrency ?? DEFAULT_BACKFILL_CONCURRENCY
  encarBackfillState.total = 0
  encarBackfillState.processed = 0
  encarBackfillState.updated = 0
  encarBackfillState.skipped = 0
  encarBackfillState.errors = 0
  encarBackfillState.started_at = null
  encarBackfillState.finished_at = null
  encarBackfillState.last_error = ''
  encarBackfillState.last_line = ''
  encarBackfillState.output = []
  encarBackfillState.pid = null
  encarBackfillState.exit_code = null
  encarBackfillState.signal = null
  encarBackfillState.process = null
}

function buildBackfillEnv(options) {
  const target = options.target === BACKFILL_TARGET_ALL
    ? 'interior,drive,key,vin,trim,options,warranty'
    : options.target

  return {
    ...process.env,
    BACKFILL_TARGETS: target,
    BACKFILL_INTERIOR_MODE: options.mode,
    BACKFILL_ENRICH_LIMIT: String(options.limit),
    BACKFILL_ENRICH_CONCURRENCY: String(options.concurrency),
  }
}

function requestBackfillStop() {
  if (!encarBackfillState.running || !encarBackfillState.process) return false

  encarBackfillState.stop_requested = true
  pushBackfillOutputLine('Остановка запрошена из админки')

  const child = encarBackfillState.process
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    })
    killer.on('error', (error) => {
      encarBackfillState.last_error = `Не удалось остановить PID ${child.pid}: ${error.message}`
    })
  } else {
    child.kill('SIGTERM')
  }

  return true
}

function normalizeCatalogExportLimit(value) {
  if (value === undefined || value === null || value === '') return null
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return DEFAULT_CATALOG_EXPORT_LIMIT
  return Math.min(Math.max(parsed, 1), MAX_CATALOG_EXPORT_LIMIT)
}

function isWeakBodyTypeForEnrichment(value) {
  return isWeakBodyType(value)
}

function shouldRefreshTrim(value) {
  const raw = cleanText(value)
  if (!raw) return true
  if (ENRICH_TRIM_ROMANIZED_RE.test(raw)) return true
  const normalized = normalizeTrimLevel(raw)
  return Boolean(normalized && normalized !== raw)
}

function shouldRefreshVin(value) {
  const raw = cleanText(value)
  if (!raw) return true
  return !isStandardVin(normalizeVin(raw))
}

function shouldRefreshBodyColor(value) {
  const raw = cleanText(value)
  if (!raw) return true
  const normalized = normalizeColorName(raw)
  return Boolean(normalized && normalized !== raw)
}

function shouldRefreshInteriorColor(interiorValue, bodyValue = '') {
  const raw = cleanText(interiorValue)
  if (!raw) return true
  const normalized = normalizeInteriorColorName(raw, bodyValue)
  return !normalized || normalized !== raw
}

function shouldRefreshDriveType(value) {
  const raw = cleanText(value)
  if (!raw) return true
  const normalized = normalizeDriveLabel(raw)
  if (!normalized) return true
  return normalized !== raw
}

function shouldRefreshKeyInfo(value) {
  const raw = cleanText(value)
  if (!raw) return true
  if (WEAK_KEY_INFO_VALUES.has(raw)) return true
  return /^Ключи:\s*\d+\s*шт\.$/i.test(raw)
}

function shouldRefreshOptionFeatures(value) {
  if (!Array.isArray(value)) return true
  return !value.some((item) => cleanText(item))
}

function parseCatalogYear(value) {
  const matched = String(value || '').match(/\d{4}/)
  if (!matched) return 0
  const year = Number.parseInt(matched[0], 10)
  return Number.isFinite(year) ? year : 0
}

function hasWarrantyData(car = {}) {
  return Boolean(
    cleanText(car.warranty_company) ||
    Number(car.warranty_body_months) > 0 ||
    Number(car.warranty_body_km) > 0 ||
    Number(car.warranty_transmission_months) > 0 ||
    Number(car.warranty_transmission_km) > 0
  )
}

function shouldRefreshWarranty(car = {}) {
  if (hasWarrantyData(car)) return false
  return parseCatalogYear(car.year) >= 2020
}

function shouldEnrichCar(car) {
  return (
    shouldRefreshVin(car.vin) ||
    shouldRefreshDriveType(car.drive_type) ||
    shouldRefreshKeyInfo(car.key_info) ||
    shouldRefreshBodyColor(car.body_color) ||
    shouldRefreshInteriorColor(car.interior_color, car.body_color) ||
    shouldRefreshWarranty(car) ||
    shouldRefreshOptionFeatures(car.option_features) ||
    isWeakBodyTypeForEnrichment(car.body_type) ||
    shouldRefreshTrim(car.trim_level)
  )
}

function getEnrichCandidatePriority(car) {
  if (shouldRefreshVin(car.vin)) return 0
  if (shouldRefreshDriveType(car.drive_type)) return 1
  if (shouldRefreshKeyInfo(car.key_info)) return 2
  if (shouldRefreshTrim(car.trim_level)) return 3
  if (isWeakBodyTypeForEnrichment(car.body_type)) return 4
  if (shouldRefreshBodyColor(car.body_color)) return 5
  if (shouldRefreshWarranty(car)) return 6
  if (shouldRefreshOptionFeatures(car.option_features)) return 7
  if (shouldRefreshInteriorColor(car.interior_color, car.body_color)) return 8
  return 9
}

function buildEnrichFetchTargets(car = {}) {
  return {
    vin: shouldRefreshVin(car.vin),
    interiorColor: shouldRefreshInteriorColor(car.interior_color, car.body_color),
    keyInfo: shouldRefreshKeyInfo(car.key_info),
    driveType: shouldRefreshDriveType(car.drive_type),
    optionFeatures: shouldRefreshOptionFeatures(car.option_features),
  }
}

async function updateCarFields(id, patch, meta = {}) {
  const fields = Object.entries(patch).filter(([, value]) => value !== undefined)

  const updates = []
  const params = []
  let index = 1

  for (const [field, value] of fields) {
    updates.push(`${field} = $${index++}`)
    params.push(value)
  }

  if (fields.length) {
    updates.push('updated_at = NOW()')
  }
  updates.push('enrich_checked_at = NOW()')
  updates.push(`enrich_last_status = $${index++}`)
  params.push(cleanText(meta.status) || 'checked')
  updates.push(`enrich_last_error = $${index++}`)
  params.push(cleanText(meta.error) || null)
  updates.push(`enrich_last_encar_id = $${index++}`)
  params.push(cleanText(meta.encarId || meta.encar_id) || null)
  params.push(id)

  await pool.query(`UPDATE cars SET ${updates.join(', ')} WHERE id = $${index}`, params)
  return Boolean(fields.length)
}

async function deleteCarById(id) {
  const result = await pool.query('DELETE FROM cars WHERE id = $1 RETURNING id', [id])
  return Boolean(result.rows.length)
}

async function enrichCar(car, context = {}) {
  enrichState.current = {
    id: car.id,
    encar_id: car.encar_id,
    name: car.name || car.model || '',
  }

  try {
    const detail = await fetchEncarVehicleEnrichment(car.encar_id, {
      targets: buildEnrichFetchTargets(car),
    })
    const normalizedDetail = normalizeCarTextFields({
      name: detail.name || car.name,
      model: detail.model || car.model,
      trim_level: detail.trim_level ?? car.trim_level,
      drive_type: detail.drive_type ?? car.drive_type,
      body_type: detail.body_type ?? car.body_type,
      vehicle_class: detail.vehicle_class ?? car.vehicle_class,
      body_color: detail.body_color ?? car.body_color,
      interior_color: detail.interior_color ?? car.interior_color,
      location: car.location,
      tags: car.tags ?? [],
    })
    const parseNotes = buildEnrichParseNotes(detail, car)
    const patch = {}

    if (shouldRefreshDriveType(car.drive_type)) {
      patch.drive_type_source = normalizeEvidenceSource(detail.drive_type_source)
      patch.drive_type_diagnostics = serializeEvidenceDiagnostics(detail.drive_type_diagnostics)
      if (cleanText(normalizedDetail.drive_type)) {
        patch.drive_type = normalizedDetail.drive_type
      }
    }

    if (shouldRefreshKeyInfo(car.key_info) && cleanText(detail.key_info)) {
      patch.key_info = detail.key_info
    }

    if (shouldRefreshBodyColor(car.body_color) && cleanText(normalizedDetail.body_color)) {
      patch.body_color = normalizedDetail.body_color
    }

    if (shouldRefreshInteriorColor(car.interior_color, patch.body_color || car.body_color)) {
      patch.interior_color_source = normalizeEvidenceSource(detail.interior_color_source)
      patch.interior_color_diagnostics = serializeEvidenceDiagnostics(detail.interior_color_diagnostics)
      if (cleanText(normalizedDetail.interior_color)) {
        patch.interior_color = normalizedDetail.interior_color
      }
    }

    if (shouldRefreshWarranty(car)) {
      if (cleanText(detail.warranty_company)) patch.warranty_company = detail.warranty_company
      if (Number(detail.warranty_body_months) > 0) patch.warranty_body_months = detail.warranty_body_months
      if (Number(detail.warranty_body_km) > 0) patch.warranty_body_km = detail.warranty_body_km
      if (Number(detail.warranty_transmission_months) > 0) patch.warranty_transmission_months = detail.warranty_transmission_months
      if (Number(detail.warranty_transmission_km) > 0) patch.warranty_transmission_km = detail.warranty_transmission_km
    }

    if (shouldRefreshOptionFeatures(car.option_features) && Array.isArray(detail.option_features) && detail.option_features.length) {
      patch.option_features = detail.option_features
    }

    if (isWeakBodyTypeForEnrichment(car.body_type) && cleanText(normalizedDetail.body_type)) {
      patch.body_type = normalizedDetail.body_type
    }

    const resolvedVehicleClass = resolveVehicleClass(
      normalizedDetail.vehicle_class || '',
      patch.body_type || normalizedDetail.body_type || car.body_type || '',
      normalizedDetail.name || car.name || '',
      normalizedDetail.model || car.model || '',
      normalizedDetail.trim_level || car.trim_level || '',
    )
    if (cleanText(resolvedVehicleClass) && resolvedVehicleClass !== cleanText(car.vehicle_class)) {
      patch.vehicle_class = resolvedVehicleClass
    }

    if (shouldRefreshTrim(car.trim_level) && cleanText(normalizedDetail.trim_level)) {
      patch.trim_level = normalizedDetail.trim_level
    }

    const sanitizedDetailVin = sanitizeVin(detail.vin)
    if (shouldRefreshVin(car.vin) && sanitizedDetailVin) {
      patch.vin = sanitizedDetailVin
    }

    if (Object.keys(patch).length) {
      let appliedPatch = { ...patch }
      let duplicateVinId = null

      try {
        await updateCarFields(car.id, appliedPatch, {
          status: 'updated',
          error: parseNotes.length ? parseNotes.join(' | ') : null,
          encarId: getCurrentEnrichEncarId(car),
        })
      } catch (updateError) {
        if (!isVinConstraintError(updateError) || !appliedPatch.vin) throw updateError

        const normalizedDuplicateVin = normalizeVin(appliedPatch.vin)
        if (context.vinLookupCache?.has(normalizedDuplicateVin)) {
          duplicateVinId = context.vinLookupCache.get(normalizedDuplicateVin)
        } else {
          duplicateVinId = await getExistingCarIdByVin(appliedPatch.vin, car.id)
          if (context.vinLookupCache && normalizedDuplicateVin) {
            context.vinLookupCache.set(normalizedDuplicateVin, duplicateVinId || null)
          }
        }
        delete appliedPatch.vin

        if (!Object.keys(appliedPatch).length) {
          await updateCarFields(car.id, {}, {
            status: 'duplicate_vin',
            error: `VIN already exists at ID ${duplicateVinId || '-'}`,
            encarId: getCurrentEnrichEncarId(car),
          })
          enrichState.skipped += 1
          pushEnrichReportItem({
            status: 'duplicate_vin',
            id: car.id,
            encar_id: car.encar_id,
            name: car.name || car.model || '',
            error: `VIN already exists at ID ${duplicateVinId || '-'}`,
            finished_at: new Date().toISOString(),
          })
          return
        }

        await updateCarFields(car.id, appliedPatch, {
          status: 'updated',
          error: [parseNotes.join(' | '), `VIN duplicate skipped: existing ID ${duplicateVinId || '-'}`]
            .filter(Boolean)
            .join(' | '),
          encarId: getCurrentEnrichEncarId(car),
        })
      }

      const changes = Object.entries(appliedPatch).map(([field, nextValue]) => ({
        field,
        before: car[field] ?? '',
        after: nextValue ?? '',
      }))

      if (context.vinLookupCache && appliedPatch.vin && isStandardVin(normalizeVin(appliedPatch.vin))) {
        context.vinLookupCache.set(normalizeVin(appliedPatch.vin), car.id)
      }

      enrichState.updated += 1
      pushEnrichReportItem({
        status: duplicateVinId ? 'updated_with_duplicate_vin' : 'updated',
        id: car.id,
        encar_id: car.encar_id,
        name: car.name || car.model || '',
        changes,
        ...(parseNotes.length ? { parse_notes: parseNotes } : {}),
        ...(duplicateVinId ? { error: `VIN already exists at ID ${duplicateVinId}` } : {}),
        finished_at: new Date().toISOString(),
      })
    } else {
      await updateCarFields(car.id, {}, {
        status: 'checked',
        error: parseNotes.length ? parseNotes.join(' | ') : null,
        encarId: getCurrentEnrichEncarId(car),
      })
      enrichState.skipped += 1
      if (parseNotes.length) {
        console.warn(`ENRICH_PARSE_NOTES | id=${car.id} | encar_id=${car.encar_id} | ${parseNotes.join(' | ')}`)
      }
      pushEnrichReportItem({
        status: 'checked',
        id: car.id,
        encar_id: car.encar_id,
        name: car.name || car.model || '',
        ...(parseNotes.length ? { parse_notes: parseNotes } : {}),
        finished_at: new Date().toISOString(),
      })
    }
  } catch (err) {
    const statusCode = Number(err?.response?.status) || 0
    const isNotFound = statusCode === 404

    try {
      await updateCarFields(car.id, {}, {
        status: isNotFound ? 'not_found' : 'error',
        error: isNotFound ? '404 Not Found' : err.message,
        encarId: getCurrentEnrichEncarId(car),
      })
    } catch (persistError) {
      console.warn('Failed to persist enrich status:', persistError.message)
    }

    if (isNotFound) {
      const deleted = await deleteCarById(car.id)
      if (deleted) {
        enrichState.removed += 1
      } else {
        enrichState.skipped += 1
      }
      pushEnrichReportItem({
        status: deleted ? 'removed' : 'not_found',
        id: car.id,
        encar_id: car.encar_id,
        name: car.name || car.model || '',
        error: deleted
          ? 'Объявление больше недоступно в Encar (404) и удалено из каталога'
          : 'Объявление больше недоступно в Encar (404)',
        finished_at: new Date().toISOString(),
      })
    } else {
      enrichState.errors += 1
      enrichState.last_error = `ID ${car.id} / Encar ${car.encar_id}: ${err.message}`
      pushEnrichReportItem({
        status: 'error',
        id: car.id,
        encar_id: car.encar_id,
        name: car.name || car.model || '',
        error: err.message,
        finished_at: new Date().toISOString(),
      })
    }
  } finally {
    enrichState.processed += 1
  }
}

async function runEmptyFieldEnrichment(options = {}) {
  const { scope, latestLimit } = normalizeEnrichOptions(options)
  enrichState.running = true
  enrichState.stop_requested = false
  enrichState.stopped = false
  enrichState.total = 0
  enrichState.processed = 0
  enrichState.updated = 0
  enrichState.removed = 0
  enrichState.skipped = 0
  enrichState.errors = 0
  enrichState.started_at = new Date().toISOString()
  enrichState.finished_at = null
  enrichState.current = null
  enrichState.last_error = ''
  enrichState.report = []
  enrichState.scope = scope
  enrichState.latest_limit = latestLimit

  try {
    const candidateWhereSql = getEnrichCandidateWhereSql()
    const result = scope === ENRICH_SCOPE_LATEST
      ? await pool.query(`
        SELECT id, encar_id, name, model, year, vin, body_type, vehicle_class, trim_level, body_color, interior_color,
               warranty_company, warranty_body_months, warranty_body_km, warranty_transmission_months, warranty_transmission_km, option_features,
               enrich_checked_at, enrich_last_status, enrich_last_error, enrich_last_encar_id
        FROM cars
        WHERE ${candidateWhereSql}
        ORDER BY created_at DESC NULLS LAST, id DESC
        LIMIT $1
      `, [latestLimit])
      : await pool.query(`
        SELECT id, encar_id, name, model, year, vin, body_type, vehicle_class, trim_level, body_color, interior_color,
               warranty_company, warranty_body_months, warranty_body_km, warranty_transmission_months, warranty_transmission_km, option_features,
               enrich_checked_at, enrich_last_status, enrich_last_error, enrich_last_encar_id
        FROM cars
        WHERE ${candidateWhereSql}
        ORDER BY enrich_checked_at ASC NULLS FIRST, updated_at ASC NULLS FIRST, id ASC
      `)

    const candidates = result.rows
      .filter(shouldEnrichCar)
      .sort((a, b) => {
        const priorityDelta = getEnrichCandidatePriority(a) - getEnrichCandidatePriority(b)
        if (priorityDelta !== 0) return priorityDelta

        const checkedA = a.enrich_checked_at ? new Date(a.enrich_checked_at).getTime() : 0
        const checkedB = b.enrich_checked_at ? new Date(b.enrich_checked_at).getTime() : 0
        if (checkedA !== checkedB) return checkedA - checkedB

        return Number(a.id || 0) - Number(b.id || 0)
      })
    enrichState.total = candidates.length

    let nextIndex = 0
    const workerCount = Math.min(DEFAULT_ENRICH_CONCURRENCY, candidates.length || 1)
    const enrichContext = {
      vinLookupCache: new Map(),
    }
    const workers = Array.from({ length: workerCount }, async () => {
      while (true) {
        if (enrichState.stop_requested) return
        const currentIndex = nextIndex++
        if (currentIndex >= candidates.length) return
        await enrichCar(candidates[currentIndex], enrichContext)
      }
    })

    await Promise.all(workers)
  } finally {
    enrichState.running = false
    enrichState.stopped = enrichState.stop_requested
    enrichState.current = null
    enrichState.finished_at = new Date().toISOString()
  }
}

function stripHangul(value) {
  return String(value || '')
    .replace(/[\uAC00-\uD7A3]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeBrand(value) {
  const src = String(value || '').trim()
  if (!src) return ''
  const low = src.toLowerCase()

  const aliased = normalizeKnownBrandAlias(src)
  if (aliased) return aliased
  if (low.includes('chevrolet') || src.includes(KO.chevrolet)) return 'Chevrolet'
  if (low.includes('renault') || src.includes(KO.renault) || src.includes(KO.samsung)) return 'Renault Korea'
  if (
    low.includes('kg mobility') ||
    low.includes('kgmobilriti') ||
    low.includes('ssangyong') ||
    src.includes(KO.ssangyong) ||
    src.includes(KO.kgMobility)
  ) {
    return 'KG Mobility (SsangYong)'
  }
  if (low.includes('mercedes')) return 'Mercedes-Benz'
  if (low.includes('bmw')) return 'BMW'
  if (low.includes('audi')) return 'Audi'
  if (low.includes('toyota')) return 'Toyota'
  if (low.includes('honda')) return 'Honda'
  if (low.includes('volkswagen')) return 'Volkswagen'
  if (low.includes('nissan')) return 'Nissan'
  if (low.includes('lexus')) return 'Lexus'

  const stripped = stripHangul(src)
  return stripped || src
}

function normalizeFuel(value) {
  const src = String(value || '').trim()
  if (!src) return ''
  const low = src.toLowerCase()

  if (low.includes('diesel') || low.includes('дизел') || src.includes(KO.diesel)) return 'Дизель'
  if (low.includes('electric') || low.includes('электро') || src.includes(KO.electric)) return 'Электро'
  if (low.includes('lpg') || low.includes('газ') || src.includes(KO.lpg)) return 'Газ (LPG)'
  if (low.includes('hybrid') || low.includes('гибрид') || src.includes(KO.hybrid)) return 'Бензин (гибрид)'
  if (
    low.includes('gasoline') ||
    low.includes('бензин') ||
    src.includes(KO.gasoline) ||
    src.includes(KO.gasolineAlt)
  ) {
    return 'Бензин'
  }
  if (low.includes('hydrogen') || low.includes('водород') || src.includes(KO.hydrogen)) return 'Водород'

  return ''
}

function UNUSEDNormalizeDrive(value) {
  const src = String(value || '').trim()
  if (!src) return ''
  const low = src.toLowerCase()

  if (low.includes('2wd') || low.includes('fwd') || low.includes('передн') || src.includes(KO.fwd)) return 'Передний (FWD)'
  if (low.includes('awd') || (low.includes('полный') && low.includes('awd'))) return 'Полный (AWD)'
  if (low.includes('4wd') || (low.includes('полный') && low.includes('4wd')) || src.includes(KO.awd4wd)) return 'Полный (4WD)'
  if (low.includes('rwd') || low.includes('задн') || src.includes(KO.rwd)) return 'Задний (RWD)'

  return ''
}

function UNUSEDNormalizeBody(value) {
  const src = String(value || '').trim()
  if (!src) return ''
  const low = src.toLowerCase()

  if (
    low.includes('diesel') ||
    low.includes('gasoline') ||
    low.includes('hybrid') ||
    low.includes('electric') ||
    low.includes('lpg') ||
    low.includes('бенз') ||
    low.includes('дизел') ||
    low.includes('газ') ||
    low.includes('электро') ||
    hasAny(src, [KO.diesel, KO.gasoline, KO.gasolineAlt, KO.hybrid, KO.electric, KO.lpg])
  ) {
    return ''
  }

  if (
    low.includes('suv') ||
    low.includes('crossover') ||
    low.includes('внедорож') ||
    low.includes('кроссов') ||
    src.includes(KO.crossover)
  ) {
    return 'Внедорожники и кроссоверы'
  }
  if (low.includes('sedan') || low.includes('седан') || src.includes(KO.sedan)) return 'Седан'
  if (low.includes('кабриолет') || low.includes('cabrio') || low.includes('cabriolet') || low.includes('convertible') || src.includes('컨버터블')) {
    return 'Кабриолет'
  }
  if (low.includes('hatch') || low.includes('хэтч') || src.includes(KO.hatchback)) return 'Хэтчбеки'
  if (low.includes('wagon') || low.includes('универсал') || src.includes(KO.wagon)) return 'Универсалы'
  if (low.includes('van') || low.includes('minivan') || low.includes('минивэн') || src.includes(KO.minivan) || src.includes(KO.van)) {
    return 'Минивэны'
  }
  if (low.includes('coupe') || low.includes('купе') || low.includes('спорт') || src.includes(KO.coupe)) return 'Купе'
  if (low.includes('truck') || low.includes('груз') || src.includes(KO.truck) || src.includes(KO.cargo)) return 'Грузовики'

  return ''
}

function normalizeDriveFilter(value, row = {}) {
  const direct = normalizeDriveLabel(value)
  if (direct) return direct

  return normalizeDriveLabel([
    row?.car_name,
    row?.model,
    row?.trim_level,
  ].filter(Boolean).join(' '))
}

function normalizeBodyFilter(value, row = {}) {
  return resolveBodyType(
    value,
    row?.car_name,
    row?.model,
    row?.trim_level,
  )
}

function normalizeColor(value) {
  const src = String(value || '').trim()
  if (!src) return ''
  const low = src.toLowerCase()
  const compact = low.replace(/[\s_-]/g, '')

  if (low.includes('black') || /^(geomeunsaek|geomjeongsaek|heugsaek)$/.test(compact) || hasAny(src, [KO.black, KO.blackAlt])) return 'Черный'
  if (/^geomjeongtuton$/.test(compact)) return 'Черный двухцветный'
  if (/^eunsaektuton$/.test(compact)) return 'Серебристый двухцветный'
  if (/^galsaektuton$/.test(compact)) return 'Коричневый двухцветный'
  if (/^(huinseaktuton|huinsaektuton)$/.test(compact)) return 'Белый двухцветный'
  if (/^myeongeunsaek$/.test(compact)) return 'Серебристый'
  if (low.includes('white') || /^(baegsaek|huinsaek)$/.test(compact) || hasAny(src, [KO.white, KO.whiteAlt])) return 'Белый'
  if (low.includes('silver') || /^(eunsaek)$/.test(compact) || src.includes(KO.silver)) return 'Серебристый'
  if (low.includes('gray') || low.includes('grey') || /^(hoesaek|jwisaek)$/.test(compact) || hasAny(src, [KO.gray, KO.grayAlt])) return 'Серый'
  if (low.includes('blue') || /^(cheongsaek|parangsaek)$/.test(compact) || hasAny(src, [KO.blue, KO.blueAlt])) return 'Синий'
  if (low.includes('red') || /^(ppalgangsaek|hongsaek)$/.test(compact) || hasAny(src, [KO.red, KO.redAlt])) return 'Красный'
  if (/^yeondusaek$/.test(compact)) return 'Светло-зеленый'
  if (low.includes('green') || /^(noksaek|choroksaek)$/.test(compact) || hasAny(src, [KO.green, KO.greenAlt])) return 'Зеленый'
  if (low.includes('brown') || /^(galsaek)$/.test(compact) || src.includes(KO.brown)) return 'Коричневый'
  if (low.includes('beige') || /^(beijisaek)$/.test(compact) || src.includes(KO.beige)) return 'Бежевый'
  if (low.includes('orange') || /^(juhwangsaek)$/.test(compact) || src.includes(KO.orange)) return 'Оранжевый'
  if (low.includes('yellow') || /^(norangsaek)$/.test(compact) || src.includes(KO.yellow)) return 'Желтый'
  if (low.includes('purple') || low.includes('violet') || /^(borasaek)$/.test(compact) || src.includes(KO.purple)) return 'Фиолетовый'

  return HANGUL_RE.test(src) ? '' : src
}

function inferAdditionalColorSwatch(name) {
  const text = String(name || '').toLowerCase()
  if (!text) return null

  if (/\u0440\u043e\u0437\u043e\u0432/i.test(text)) return { color: '#f472b6' }
  if (/\u0431\u0438\u0440\u044e\u0437/i.test(text)) return { color: '#14b8a6' }
  if (/\u043d\u0435\u0431\u0435\u0441\u043d\u043e-\u0433\u043e\u043b\u0443\u0431/i.test(text)) return { color: '#60a5fa' }
  if (/\u0431\u043e\u0440\u0434\u043e\u0432|\u0432\u0438\u043d\u043d/i.test(text)) return { color: '#7f1d1d' }
  if (/\u0447\u0435\u0440\u043d.*\u0434\u0432\u0443\u0445\u0446\u0432\u0435\u0442/i.test(text)) return { color: '#111827', border: '#374151' }
  if (/\u044f\u0440\u043a\u043e-\u0441\u0435\u0440\u0435\u0431\u0440/i.test(text)) return { color: '#e5e7eb', border: '#9ca3af' }
  if (/\u0441\u0435\u0440\u0435\u0431\u0440\u0438\u0441\u0442.*\u0434\u0432\u0443\u0445\u0446\u0432\u0435\u0442/i.test(text)) return { color: '#d1d5db', border: '#9ca3af' }
  if (/\u0431\u0435\u043b.*\u0434\u0432\u0443\u0445\u0446\u0432\u0435\u0442/i.test(text)) return { color: '#f8fafc', border: '#d1d5db' }
  if (/\u0441\u0432\u0435\u0442\u043b\u043e-\u0437\u0435\u043b\u0435\u043d/i.test(text)) return { color: '#86efac', border: '#16a34a' }
  if (/\u0437\u043e\u043b\u043e\u0442\u0438\u0441\u0442/i.test(text)) return { color: '#d4a72c' }

  return null
}

function aggregate(rows, normalizer) {
  const acc = new Map()
  for (const row of rows || []) {
    const rawName = row?.name ?? row?.tag ?? ''
    const normalized = normalizer(rawName, row)
    if (!normalized) continue
    const count = Number(row?.count) || 0
    acc.set(normalized, (acc.get(normalized) || 0) + count)
  }
  return [...acc.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }))
}

function aggregateBrands(rows) {
  const acc = new Map()
  for (const row of rows || []) {
    const fullName = String(row?.name || '').trim()
    if (!fullName) continue

    const firstToken = fullName.split(/\s+/)[0] || fullName
    const brand = normalizeBrand(firstToken) || normalizeBrand(fullName)
    if (!brand) continue

    const count = Number(row?.count) || 0
    acc.set(brand, (acc.get(brand) || 0) + count)
  }

  return [...acc.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([name, count]) => ({ name, count }))
}

function aggregateColors(rows) {
  const acc = new Map()
  for (const row of rows || []) {
    const name = normalizeColorName(row?.name) || normalizeColor(row?.name)
    if (!name) continue
    const count = Number(row?.count) || 0
    acc.set(name, (acc.get(name) || 0) + count)
  }

  return [...acc.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({
      name,
      count,
      ...(COLOR_SWATCH[name] || EXTRA_COLOR_SWATCH[name] || inferAdditionalColorSwatch(name) || { color: '#9ca3af' }),
    }))
}

function aggregateOrigins(rows) {
  const acc = new Map()
  for (const row of rows || []) {
    const name = classifyVehicleOrigin(row?.name || '', row?.model || '')
    if (!name) continue
    const count = Number(row?.count) || 0
    acc.set(name, (acc.get(name) || 0) + count)
  }

  const order = new Map([
    [VEHICLE_ORIGIN_LABELS.korean, 0],
    [VEHICLE_ORIGIN_LABELS.imported, 1],
  ])

  return [...acc.entries()]
    .sort((a, b) => {
      const aOrder = order.has(a[0]) ? order.get(a[0]) : Number.MAX_SAFE_INTEGER
      const bOrder = order.has(b[0]) ? order.get(b[0]) : Number.MAX_SAFE_INTEGER
      if (aOrder !== bOrder) return aOrder - bOrder
      return b[1] - a[1]
    })
    .map(([name, count]) => ({ name, count }))
}

router.get('/login/status', async (req, res) => {
  try {
    const identifier = getAdminLoginIdentifier(req)
    const row = await getAdminLoginAttemptRow(identifier)
    return res.json({ ok: true, lockout: buildAdminLockoutState(row) })
  } catch (error) {
    console.error('ADMIN_LOGIN_STATUS_ERROR |', error?.message || error)
    return res.status(500).json({
      ok: false,
      error: 'Не удалось проверить статус входа',
      lockout: buildAdminLockoutState(null),
    })
  }
})

router.post('/login', adminLoginRateLimit, async (req, res) => {
  const identifier = getAdminLoginIdentifier(req)
  const password = String(req.body?.password || '').slice(0, 256)

  try {
    if (!isAdminPasswordConfigured()) {
      console.error(`ADMIN_LOGIN_CONFIG_MISSING | identifier=${identifier}`)
      return res.status(503).json({
        ok: false,
        error: 'Вход администратора временно недоступен',
        lockout: buildAdminLockoutState(null),
      })
    }

    const currentRow = await getAdminLoginAttemptRow(identifier)
    const currentLockout = buildAdminLockoutState(currentRow)

    if (currentLockout.active) {
      console.warn(`ADMIN_LOGIN_LOCKED | identifier=${identifier} | remainingSeconds=${currentLockout.remainingSeconds}`)
      return res.status(423).json({
        ok: false,
        error: 'Слишком много неверных попыток. Повторите позже.',
        lockout: currentLockout,
      })
    }

    if (verifyAdminPassword(password)) {
      await clearAdminLoginAttempts(identifier)
      console.info(`ADMIN_LOGIN_SUCCESS | identifier=${identifier}`)
      return res.json({
        ok: true,
        token: createAdminSessionToken(),
        lockout: buildAdminLockoutState(null),
      })
    }

    const failedRow = await recordAdminLoginFailure(identifier)
    const failedLockout = buildAdminLockoutState(failedRow)

    console.warn(
      `ADMIN_LOGIN_FAILED | identifier=${identifier} | failedAttempts=${failedLockout.failedAttempts} | attemptsRemaining=${failedLockout.attemptsRemaining}`,
    )

    if (failedLockout.active) {
      console.warn(`ADMIN_LOGIN_LOCKOUT_STARTED | identifier=${identifier} | blockedUntil=${failedLockout.blockedUntil}`)
    }

    return res.status(failedLockout.active ? 423 : 401).json({
      ok: false,
      error: failedLockout.active
        ? 'Слишком много неверных попыток. Вход временно заблокирован.'
        : 'Неверный пароль',
      lockout: failedLockout,
    })
  } catch (error) {
    console.error('ADMIN_LOGIN_ERROR |', error?.message || error)
    return res.status(500).json({
      ok: false,
      error: 'Ошибка авторизации',
      lockout: buildAdminLockoutState(null),
    })
  }
})

router.get('/pricing-settings', adminRouteProtection, async (_req, res) => {
  try {
    const [pricingSettings, exchangeSnapshot] = await Promise.all([
      getPricingSettings(),
      getExchangeRateSnapshot(),
    ])

    return res.json({
      ...pricingSettings,
      exchange_rate_current: exchangeSnapshot.currentRate,
      exchange_rate_site: exchangeSnapshot.siteRate,
      exchange_rate_offset: exchangeSnapshot.offset,
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' })
  }
})

router.put('/pricing-settings', adminRouteProtection, async (req, res) => {
  try {
    const saved = await savePricingSettings(req.body || {})
    const exchangeSnapshot = await getExchangeRateSnapshot()

    return res.json({
      ...saved,
      exchange_rate_current: exchangeSnapshot.currentRate,
      exchange_rate_site: exchangeSnapshot.siteRate,
      exchange_rate_offset: exchangeSnapshot.offset,
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' })
  }
})

router.get('/filter-options', async (req, res) => {
  try {
    const requestedListingType = resolveRequestedListingType(req.query?.listingType, { allowAll: true })
    const exchangeSnapshot = await getExchangeRateSnapshot()
    const siteRateSql = Number((exchangeSnapshot.siteRate || 1).toFixed(2))
    const priceUsdSql = `ROUND((COALESCE(price_krw, 0)::numeric / ${siteRateSql})::numeric, 0)`
    const listingParams = requestedListingType === 'all' ? [] : [requestedListingType]
    const listingWhere = (alias = '') => (
      requestedListingType === 'all'
        ? ''
        : `WHERE ${alias ? `${alias}.` : ''}listing_type = $1`
    )
    const yearParams = requestedListingType === 'all'
      ? [MIN_CATALOG_YEAR]
      : [requestedListingType, MIN_CATALOG_YEAR]
    const yearWhere = requestedListingType === 'all'
      ? `WHERE year ~ '^[0-9]{4}$' AND year::integer >= $1`
      : `WHERE listing_type = $1 AND year ~ '^[0-9]{4}$' AND year::integer >= $2`

    const [nameCounts, originSourceRows, fuelCounts, tagCounts, driveSourceRows, bodySourceRows, bodyColorRows, interiorColorRows, yearRange, priceRange, mileageRange, total] = await Promise.all([
      pool.query(`
        SELECT name, COUNT(*)::int AS count
        FROM cars
        ${listingWhere()}
        ${requestedListingType === 'all' ? 'WHERE' : 'AND'} name IS NOT NULL AND name != ''
        GROUP BY name
      `, listingParams),
      pool.query(`
        SELECT
          COALESCE(NULLIF(name, ''), model) AS name,
          COALESCE(model, '') AS model,
          COUNT(*)::int AS count
        FROM cars
        ${listingWhere()}
        GROUP BY COALESCE(NULLIF(name, ''), model), COALESCE(model, '')
      `, listingParams),
      pool.query(`
        SELECT fuel_type AS name, COUNT(*)::int AS count
        FROM cars
        ${listingWhere()}
        ${requestedListingType === 'all' ? 'WHERE' : 'AND'} fuel_type IS NOT NULL AND fuel_type != ''
        GROUP BY fuel_type
      `, listingParams),
      pool.query(`
        SELECT tag AS name, COUNT(*)::int AS count
        FROM cars c
        CROSS JOIN LATERAL UNNEST(COALESCE(c.tags, '{}'::text[])) AS tag
        ${listingWhere('c')}
        GROUP BY tag
      `, listingParams),
      pool.query(`
        SELECT COALESCE(drive_type, '') AS name, COALESCE(name, '') AS car_name, COALESCE(model, '') AS model, COALESCE(trim_level, '') AS trim_level, COUNT(*)::int AS count
        FROM cars
        ${listingWhere()}
        GROUP BY COALESCE(drive_type, ''), COALESCE(name, ''), COALESCE(model, ''), COALESCE(trim_level, '')
      `, listingParams),
      pool.query(`
        SELECT COALESCE(body_type, '') AS name, COALESCE(name, '') AS car_name, COALESCE(model, '') AS model, COALESCE(trim_level, '') AS trim_level, COUNT(*)::int AS count
        FROM cars
        ${listingWhere()}
        GROUP BY COALESCE(body_type, ''), COALESCE(name, ''), COALESCE(model, ''), COALESCE(trim_level, '')
      `, listingParams),
      pool.query(`
        SELECT body_color AS name, COUNT(*)::int AS count
        FROM cars
        ${listingWhere()}
        ${requestedListingType === 'all' ? 'WHERE' : 'AND'} body_color IS NOT NULL AND body_color != ''
        GROUP BY body_color
      `, listingParams),
      pool.query(`
        SELECT interior_color AS name, COUNT(*)::int AS count
        FROM cars
        ${listingWhere()}
        ${requestedListingType === 'all' ? 'WHERE' : 'AND'} interior_color IS NOT NULL AND interior_color != ''
        GROUP BY interior_color
      `, listingParams),
      pool.query(`
        SELECT MIN(year::integer) AS min_year, MAX(year::integer) AS max_year
        FROM cars
        ${yearWhere}
      `, yearParams),
      pool.query(`SELECT MIN(${priceUsdSql}) AS min_price, MAX(${priceUsdSql}) AS max_price FROM cars ${listingWhere()}`, listingParams),
      pool.query(`SELECT MIN(mileage) AS min_mileage, MAX(mileage) AS max_mileage FROM cars ${listingWhere()}`, listingParams),
      pool.query(`SELECT COUNT(*)::int AS count FROM cars ${listingWhere()}`, listingParams),
    ])

    const brands = aggregateBrands(nameCounts.rows)
    const originTypes = aggregateOrigins(originSourceRows.rows)
    const fuelTypes = aggregate([...fuelCounts.rows, ...tagCounts.rows], normalizeFuel)
    const driveTypes = aggregate(driveSourceRows.rows, normalizeDriveFilter)
    const bodyTypes = aggregate(bodySourceRows.rows, normalizeBodyFilter)
    const bodyColors = aggregateColors(bodyColorRows.rows)
    const interiorColors = aggregateColors(interiorColorRows.rows)

    const rawYearRange = yearRange.rows[0] || {}
    const maxYear = Math.max(Number(rawYearRange.max_year) || new Date().getFullYear(), MIN_CATALOG_YEAR)

    return res.json({
      brands,
      originTypes,
      fuelTypes,
      driveTypes,
      bodyTypes,
      bodyColors,
      interiorColors,
      yearRange: {
        min_year: Math.max(Number(rawYearRange.min_year) || MIN_CATALOG_YEAR, MIN_CATALOG_YEAR),
        max_year: maxYear,
      },
      priceRange: priceRange.rows[0] || { min_price: 0, max_price: 100000 },
      mileageRange: mileageRange.rows[0] || { min_mileage: 0, max_mileage: 500000 },
      totalCars: total.rows[0]?.count || 0,
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Ошибка сервера' })
  }
})

router.get('/stats', adminRouteProtection, async (_req, res) => {
  try {
    const exchangeSnapshot = await getExchangeRateSnapshot()
    const siteRateSql = Number((exchangeSnapshot.siteRate || 1).toFixed(2))
    const priceUsdSql = `ROUND((COALESCE(price_krw, 0)::numeric / ${siteRateSql})::numeric, 0)`
    const [totalRows, recentRows, avgPriceRows, topBrandRows, listingTypeRows, totalPartsRows] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM cars'),
      pool.query("SELECT COUNT(*)::int AS count FROM cars WHERE created_at > NOW() - INTERVAL '7 days'"),
      pool.query(`SELECT ROUND(AVG(${priceUsdSql})::numeric, 0) AS avg FROM cars WHERE price_krw > 0`),
      pool.query('SELECT name, COUNT(*)::int AS count FROM cars GROUP BY name ORDER BY count DESC LIMIT 100'),
      pool.query('SELECT listing_type, COUNT(*)::int AS count FROM cars GROUP BY listing_type'),
      pool.query('SELECT COUNT(*)::int AS count FROM parts'),
    ])

    const topBrands = aggregateBrands(topBrandRows.rows).slice(0, 5)
    const byListingType = listingTypeRows.rows.reduce((acc, row) => {
      acc[normalizeCarListingType(row.listing_type)] = row.count || 0
      return acc
    }, {})

    return res.json({
      totalCars: totalRows.rows[0]?.count || 0,
      addedThisWeek: recentRows.rows[0]?.count || 0,
      avgPriceUSD: parseInt(avgPriceRows.rows[0]?.avg || 0, 10),
      totalParts: totalPartsRows.rows[0]?.count || 0,
      byListingType,
      topBrands,
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Ошибка сервера' })
  }
})

router.get('/enrich-empty-fields/status', adminRouteProtection, (_req, res) => {
  return res.json(enrichState)
})

router.post('/enrich-empty-fields/start', adminRouteProtection, async (_req, res) => {
  if (normalizeCarsState.running) {
    return res.status(409).json({ error: 'Normalization is already running' })
  }

  if (encarBackfillState.running) {
    return res.status(409).json({ error: 'Encar backfill is already running', status: createBackfillStatusSnapshot() })
  }

  if (enrichState.running) {
    return res.status(409).json({ error: 'Обогащение уже запущено', status: enrichState })
  }

  enrichState.running = true
  enrichState.stop_requested = false
  enrichState.stopped = false
  enrichState.started_at = new Date().toISOString()
  enrichState.finished_at = null
  enrichState.last_error = ''
  const options = normalizeEnrichOptions(_req.body || {})

  setTimeout(() => {
    runEmptyFieldEnrichment(options).catch((err) => {
      enrichState.running = false
      enrichState.last_error = err.message
      enrichState.finished_at = new Date().toISOString()
      console.error('Catalog enrichment error:', err)
    })
  }, 0)

  return res.json({
    ok: true,
    message: 'Enrichment started',
    scope: options.scope,
    latest_limit: options.latestLimit,
  })
})

router.post('/enrich-empty-fields/stop', adminRouteProtection, async (_req, res) => {
  if (!enrichState.running) {
    return res.status(409).json({ error: 'Enrichment is not running', status: enrichState })
  }

  enrichState.stop_requested = true

  return res.json({
    ok: true,
    message: 'Enrichment stop requested',
    status: enrichState,
  })
})

router.get('/normalize-existing-cars/status', adminRouteProtection, (_req, res) => {
  return res.json(normalizeCarsState)
})

router.post('/normalize-existing-cars/start', adminRouteProtection, async (_req, res) => {
  if (enrichState.running) {
    return res.status(409).json({ error: 'Enrichment is already running' })
  }

  if (encarBackfillState.running) {
    return res.status(409).json({ error: 'Encar backfill is already running', status: createBackfillStatusSnapshot() })
  }

  if (normalizeCarsState.running) {
    return res.status(409).json({ error: 'РќРѕСЂРјР°Р»РёР·Р°С†РёСЏ СѓР¶Рµ Р·Р°РїСѓС‰РµРЅР°', status: normalizeCarsState })
  }

  Object.assign(normalizeCarsState, createCarTextBackfillState(), {
    running: true,
    started_at: new Date().toISOString(),
    finished_at: null,
    last_error: '',
  })

  setTimeout(() => {
    runCarTextBackfill({
      onProgress: (snapshot) => {
        Object.assign(normalizeCarsState, snapshot)
      },
      shouldStop: () => Boolean(normalizeCarsState.stop_requested),
    }).catch((err) => {
      normalizeCarsState.running = false
      normalizeCarsState.last_error = err.message
      normalizeCarsState.finished_at = new Date().toISOString()
      console.error('Car text normalization error:', err)
    })
  }, 0)

  return res.json({ ok: true, message: 'РќРѕСЂРјР°Р»РёР·Р°С†РёСЏ СѓР¶Рµ СЃРѕС…СЂР°РЅРµРЅРЅС‹С… РјР°С€РёРЅ Р·Р°РїСѓС‰РµРЅР°' })
})

router.post('/normalize-existing-cars/stop', adminRouteProtection, async (_req, res) => {
  if (!normalizeCarsState.running) {
    return res.status(409).json({ error: 'Нормализация сейчас не выполняется', status: normalizeCarsState })
  }

  normalizeCarsState.stop_requested = true

  return res.json({
    ok: true,
    message: 'Остановка нормализации запрошена',
    status: normalizeCarsState,
  })
})

router.get('/encar-backfill/status', adminRouteProtection, (_req, res) => {
  return res.json(createBackfillStatusSnapshot())
})

router.post('/encar-backfill/start', adminRouteProtection, async (req, res) => {
  if (hasActiveBackgroundTask()) {
    return res.status(409).json({
      error: 'Сейчас уже выполняется другая фоновая задача',
      enrich: enrichState.running,
      normalize: normalizeCarsState.running,
      backfill: encarBackfillState.running,
    })
  }

  const options = normalizeBackfillOptions(req.body || {})
  const scriptPath = path.resolve(PROJECT_ROOT, 'scripts', 'backfill-encar-enrichment.js')

  resetBackfillState(options)
  encarBackfillState.running = true
  encarBackfillState.started_at = new Date().toISOString()

  const child = spawn(process.execPath, [scriptPath], {
    cwd: PROJECT_ROOT,
    env: buildBackfillEnv(options),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  encarBackfillState.process = child
  encarBackfillState.pid = child.pid || null

  bindBackfillStream(child.stdout)
  bindBackfillStream(child.stderr)

  child.on('error', (error) => {
    encarBackfillState.running = false
    encarBackfillState.finished_at = new Date().toISOString()
    encarBackfillState.last_error = error.message
    encarBackfillState.exit_code = -1
    encarBackfillState.process = null
    encarBackfillState.pid = null
  })

  child.on('exit', (code, signal) => {
    encarBackfillState.running = false
    encarBackfillState.stopped = encarBackfillState.stop_requested
    encarBackfillState.finished_at = new Date().toISOString()
    encarBackfillState.exit_code = Number.isFinite(code) ? code : null
    encarBackfillState.signal = signal || null
    if (!encarBackfillState.stopped && (code || signal)) {
      encarBackfillState.last_error = `Процесс backfill завершился с кодом ${code ?? 'null'}${signal ? ` (${signal})` : ''}`
    }
    encarBackfillState.process = null
    encarBackfillState.pid = null
  })

  return res.json({
    ok: true,
    message: 'Encar backfill запущен',
    status: createBackfillStatusSnapshot(),
  })
})

router.post('/encar-backfill/stop', adminRouteProtection, async (_req, res) => {
  if (!encarBackfillState.running) {
    return res.status(409).json({ error: 'Encar backfill сейчас не выполняется', status: createBackfillStatusSnapshot() })
  }

  requestBackfillStop()

  return res.json({
    ok: true,
    message: 'Остановка Encar backfill запрошена',
    status: createBackfillStatusSnapshot(),
  })
})

router.get('/catalog-export', adminRouteProtection, async (req, res) => {
  try {
    const exportLimit = normalizeCatalogExportLimit(req.query?.limit)
    const queryParams = []
    const limitSql = exportLimit
      ? (() => {
          queryParams.push(exportLimit)
          return `LIMIT $${queryParams.length}`
        })()
      : ''

    const result = await pool.query(`
      WITH export_ids AS (
        SELECT id
        FROM cars
        ORDER BY created_at DESC, id DESC
        ${limitSql}
      )
      SELECT
        c.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', ci.id,
              'url', ci.url,
              'position', ci.position
            )
            ORDER BY ci.position ASC
          ) FILTER (WHERE ci.id IS NOT NULL),
          '[]'::json
        ) AS images
      FROM export_ids export_ids
      JOIN cars c ON c.id = export_ids.id
      LEFT JOIN car_images ci ON ci.car_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC, c.id DESC
    `, queryParams)

    const exportedAt = new Date().toISOString()
    const payload = {
      exported_at: exportedAt,
      requested_limit: exportLimit,
      total: result.rows.length,
      cars: result.rows,
    }

    const fileStamp = exportedAt.replace(/[:.]/g, '-')
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    const filePrefix = exportLimit ? `catalog-export-latest-${exportLimit}` : 'catalog-export'
    res.setHeader('Content-Disposition', `attachment; filename="${filePrefix}-${fileStamp}.json"`)
    return res.status(200).send(JSON.stringify(payload, null, 2))
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Ошибка сервера' })
  }
})

export default router

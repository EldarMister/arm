import { Router } from 'express'
import pool from '../db.js'
import { getExchangeRateSnapshot } from '../lib/exchangeRate.js'
import { fetchEncarVehicleEnrichment } from '../lib/encarVehicle.js'
import { getPricingSettings, savePricingSettings } from '../lib/pricingSettings.js'
import {
  classifyVehicleOrigin,
  normalizeColorName,
  normalizeInteriorColorName,
  normalizeTrimLevel,
  VEHICLE_ORIGIN_LABELS,
} from '../lib/vehicleData.js'
import { createCarTextBackfillState, runCarTextBackfill } from '../lib/carTextBackfill.js'
import { normalizeKnownBrandAlias } from '../../shared/brandAliases.js'

const router = Router()
const ENRICH_SCOPE_ALL = 'all'
const ENRICH_SCOPE_LATEST = 'latest'
const DEFAULT_LATEST_ENRICH_LIMIT = 50
const MAX_LATEST_ENRICH_LIMIT = 300
const WEAK_BODY_TYPES = new Set(['', '-', 'SUV', 'Вэн', 'Малый класс', 'Компактный класс', 'Средний класс', 'Бизнес-класс'])
const enrichState = {
  running: false,
  total: 0,
  processed: 0,
  updated: 0,
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
const DEFAULT_ENRICH_CONCURRENCY = (() => {
  const raw = Number.parseInt(process.env.ENRICH_CONCURRENCY || '3', 10)
  if (!Number.isFinite(raw)) return 3
  return Math.min(Math.max(raw, 1), 6)
})()

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

function isWeakBodyTypeForEnrichment(value) {
  return WEAK_BODY_TYPES.has(cleanText(value))
}

function shouldRefreshTrim(value) {
  const raw = cleanText(value)
  if (!raw) return true
  if (ENRICH_TRIM_ROMANIZED_RE.test(raw)) return true
  const normalized = normalizeTrimLevel(raw)
  return Boolean(normalized && normalized !== raw)
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

function shouldEnrichCar(car) {
  return (
    shouldRefreshBodyColor(car.body_color) ||
    shouldRefreshInteriorColor(car.interior_color, car.body_color) ||
    isWeakBodyTypeForEnrichment(car.body_type) ||
    shouldRefreshTrim(car.trim_level)
  )
}

async function updateCarFields(id, patch) {
  const fields = Object.entries(patch).filter(([, value]) => value !== undefined)
  if (!fields.length) return false

  const updates = []
  const params = []
  let index = 1

  for (const [field, value] of fields) {
    updates.push(`${field} = $${index++}`)
    params.push(value)
  }

  updates.push('updated_at = NOW()')
  params.push(id)

  await pool.query(`UPDATE cars SET ${updates.join(', ')} WHERE id = $${index}`, params)
  return true
}

async function enrichCar(car) {
  enrichState.current = {
    id: car.id,
    encar_id: car.encar_id,
    name: car.name || car.model || '',
  }

  try {
    const detail = await fetchEncarVehicleEnrichment(car.encar_id)
    const patch = {}

    if (shouldRefreshBodyColor(car.body_color) && cleanText(detail.body_color)) {
      patch.body_color = detail.body_color
    }

    if (shouldRefreshInteriorColor(car.interior_color, patch.body_color || car.body_color) && cleanText(detail.interior_color)) {
      patch.interior_color = detail.interior_color
    }

    if (isWeakBodyTypeForEnrichment(car.body_type) && cleanText(detail.body_type)) {
      patch.body_type = detail.body_type
    }

    if (shouldRefreshTrim(car.trim_level) && cleanText(detail.trim_level)) {
      patch.trim_level = detail.trim_level
    }

    if (Object.keys(patch).length) {
      const changes = Object.entries(patch).map(([field, nextValue]) => ({
        field,
        before: car[field] ?? '',
        after: nextValue ?? '',
      }))

      await updateCarFields(car.id, patch)
      enrichState.updated += 1
      pushEnrichReportItem({
        status: 'updated',
        id: car.id,
        encar_id: car.encar_id,
        name: car.name || car.model || '',
        changes,
        finished_at: new Date().toISOString(),
      })
    } else {
      enrichState.skipped += 1
    }
  } catch (err) {
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
  } finally {
    enrichState.processed += 1
  }
}

async function runEmptyFieldEnrichment(options = {}) {
  const { scope, latestLimit } = normalizeEnrichOptions(options)
  enrichState.running = true
  enrichState.total = 0
  enrichState.processed = 0
  enrichState.updated = 0
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
    const result = scope === ENRICH_SCOPE_LATEST
      ? await pool.query(`
        SELECT id, encar_id, name, model, body_type, trim_level, body_color, interior_color
        FROM cars
        WHERE encar_id IS NOT NULL AND encar_id != ''
        ORDER BY created_at DESC NULLS LAST, id DESC
        LIMIT $1
      `, [latestLimit])
      : await pool.query(`
        SELECT id, encar_id, name, model, body_type, trim_level, body_color, interior_color
        FROM cars
        WHERE encar_id IS NOT NULL AND encar_id != ''
        ORDER BY updated_at ASC NULLS FIRST, id ASC
      `)

    const candidates = result.rows.filter(shouldEnrichCar)
    enrichState.total = candidates.length

    let nextIndex = 0
    const workerCount = Math.min(DEFAULT_ENRICH_CONCURRENCY, candidates.length || 1)
    const workers = Array.from({ length: workerCount }, async () => {
      while (true) {
        const currentIndex = nextIndex++
        if (currentIndex >= candidates.length) return
        await enrichCar(candidates[currentIndex])
      }
    })

    await Promise.all(workers)
  } finally {
    enrichState.running = false
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

function normalizeDrive(value) {
  const src = String(value || '').trim()
  if (!src) return ''
  const low = src.toLowerCase()

  if (low.includes('2wd') || low.includes('fwd') || low.includes('передн') || src.includes(KO.fwd)) return 'Передний (FWD)'
  if (low.includes('awd') || (low.includes('полный') && low.includes('awd'))) return 'Полный (AWD)'
  if (low.includes('4wd') || (low.includes('полный') && low.includes('4wd')) || src.includes(KO.awd4wd)) return 'Полный (4WD)'
  if (low.includes('rwd') || low.includes('задн') || src.includes(KO.rwd)) return 'Задний (RWD)'

  return ''
}

function normalizeBody(value) {
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

function normalizeColor(value) {
  const src = String(value || '').trim()
  if (!src) return ''
  const low = src.toLowerCase()
  const compact = low.replace(/[\s_-]/g, '')

  if (low.includes('black') || /^(geomeunsaek|geomjeongsaek|heugsaek)$/.test(compact) || hasAny(src, [KO.black, KO.blackAlt])) return 'Черный'
  if (/^geomjeongtuton$/.test(compact)) return 'Черный двухцветный'
  if (/^eunsaektuton$/.test(compact)) return 'Серебристый двухцветный'
  if (/^(huinseaktuton|huinsaektuton)$/.test(compact)) return 'Белый двухцветный'
  if (/^myeongeunsaek$/.test(compact)) return 'Ярко-серебристый'
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
    const normalized = normalizer(rawName)
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

router.post('/login', (req, res) => {
  const { password } = req.body || {}
  const correctPass = process.env.ADMIN_PASSWORD || 'admin123'
  if (password === correctPass) {
    return res.json({ ok: true, token: 'adm-ok' })
  }
  return res.status(401).json({ ok: false, error: 'Неверный пароль' })
})

router.get('/pricing-settings', async (_req, res) => {
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

router.put('/pricing-settings', async (req, res) => {
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

router.get('/filter-options', async (_req, res) => {
  try {
    const exchangeSnapshot = await getExchangeRateSnapshot()
    const siteRateSql = Number((exchangeSnapshot.siteRate || 1).toFixed(2))
    const priceUsdSql = `ROUND((COALESCE(price_krw, 0)::numeric / ${siteRateSql})::numeric, 0)`
    const [nameCounts, originSourceRows, fuelCounts, tagCounts, driveCounts, bodySourceRows, bodyColorRows, interiorColorRows, yearRange, priceRange, mileageRange, total] = await Promise.all([
      pool.query(`
        SELECT name, COUNT(*)::int AS count
        FROM cars
        WHERE name IS NOT NULL AND name != ''
        GROUP BY name
      `),
      pool.query(`
        SELECT
          COALESCE(NULLIF(name, ''), model) AS name,
          COALESCE(model, '') AS model,
          COUNT(*)::int AS count
        FROM cars
        GROUP BY COALESCE(NULLIF(name, ''), model), COALESCE(model, '')
      `),
      pool.query(`
        SELECT fuel_type AS name, COUNT(*)::int AS count
        FROM cars
        WHERE fuel_type IS NOT NULL AND fuel_type != ''
        GROUP BY fuel_type
      `),
      pool.query(`
        SELECT tag AS name, COUNT(*)::int AS count
        FROM cars c
        CROSS JOIN LATERAL UNNEST(COALESCE(c.tags, '{}'::text[])) AS tag
        GROUP BY tag
      `),
      pool.query(`
        SELECT drive_type AS name, COUNT(*)::int AS count
        FROM cars
        WHERE drive_type IS NOT NULL AND drive_type != ''
        GROUP BY drive_type
      `),
      pool.query(`
        SELECT source.name, SUM(source.count)::int AS count
        FROM (
          SELECT body_type AS name, COUNT(*)::int AS count
          FROM cars
          WHERE body_type IS NOT NULL AND body_type != ''
          GROUP BY body_type
          UNION ALL
          SELECT tag AS name, COUNT(*)::int AS count
          FROM cars c
          CROSS JOIN LATERAL UNNEST(COALESCE(c.tags, '{}'::text[])) AS tag
          GROUP BY tag
          UNION ALL
          SELECT model AS name, COUNT(*)::int AS count
          FROM cars
          WHERE model IS NOT NULL AND model != ''
          GROUP BY model
          UNION ALL
          SELECT name AS name, COUNT(*)::int AS count
          FROM cars
          WHERE name IS NOT NULL AND name != ''
          GROUP BY name
        ) AS source
        GROUP BY source.name
      `),
      pool.query(`
        SELECT body_color AS name, COUNT(*)::int AS count
        FROM cars
        WHERE body_color IS NOT NULL AND body_color != ''
        GROUP BY body_color
      `),
      pool.query(`
        SELECT interior_color AS name, COUNT(*)::int AS count
        FROM cars
        WHERE interior_color IS NOT NULL AND interior_color != ''
        GROUP BY interior_color
      `),
      pool.query(`
        SELECT MIN(year::integer) AS min_year, MAX(year::integer) AS max_year
        FROM cars
        WHERE year ~ '^[0-9]{4}$'
      `),
      pool.query(`SELECT MIN(${priceUsdSql}) AS min_price, MAX(${priceUsdSql}) AS max_price FROM cars`),
      pool.query(`SELECT MIN(mileage) AS min_mileage, MAX(mileage) AS max_mileage FROM cars`),
      pool.query(`SELECT COUNT(*)::int AS count FROM cars`),
    ])

    const brands = aggregateBrands(nameCounts.rows)
    const originTypes = aggregateOrigins(originSourceRows.rows)
    const fuelTypes = aggregate([...fuelCounts.rows, ...tagCounts.rows], normalizeFuel)
    const driveTypes = aggregate([...tagCounts.rows, ...driveCounts.rows], normalizeDrive)
    const bodyTypes = aggregate(bodySourceRows.rows, normalizeBody)
    const bodyColors = aggregateColors(bodyColorRows.rows)
    const interiorColors = aggregateColors(interiorColorRows.rows)

    return res.json({
      brands,
      originTypes,
      fuelTypes,
      driveTypes,
      bodyTypes,
      bodyColors,
      interiorColors,
      yearRange: yearRange.rows[0] || { min_year: 1990, max_year: new Date().getFullYear() },
      priceRange: priceRange.rows[0] || { min_price: 0, max_price: 100000 },
      mileageRange: mileageRange.rows[0] || { min_mileage: 0, max_mileage: 500000 },
      totalCars: total.rows[0]?.count || 0,
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Ошибка сервера' })
  }
})

router.get('/stats', async (_req, res) => {
  try {
    const exchangeSnapshot = await getExchangeRateSnapshot()
    const siteRateSql = Number((exchangeSnapshot.siteRate || 1).toFixed(2))
    const priceUsdSql = `ROUND((COALESCE(price_krw, 0)::numeric / ${siteRateSql})::numeric, 0)`
    const [totalRows, recentRows, avgPriceRows, topBrandRows] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM cars'),
      pool.query("SELECT COUNT(*)::int AS count FROM cars WHERE created_at > NOW() - INTERVAL '7 days'"),
      pool.query(`SELECT ROUND(AVG(${priceUsdSql})::numeric, 0) AS avg FROM cars WHERE price_krw > 0`),
      pool.query('SELECT name, COUNT(*)::int AS count FROM cars GROUP BY name ORDER BY count DESC LIMIT 100'),
    ])

    const topBrands = aggregateBrands(topBrandRows.rows).slice(0, 5)

    return res.json({
      totalCars: totalRows.rows[0]?.count || 0,
      addedThisWeek: recentRows.rows[0]?.count || 0,
      avgPriceUSD: parseInt(avgPriceRows.rows[0]?.avg || 0, 10),
      topBrands,
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Ошибка сервера' })
  }
})

router.get('/enrich-empty-fields/status', (_req, res) => {
  return res.json(enrichState)
})

router.post('/enrich-empty-fields/start', async (_req, res) => {
  if (normalizeCarsState.running) {
    return res.status(409).json({ error: 'Normalization is already running' })
  }

  if (enrichState.running) {
    return res.status(409).json({ error: 'Обогащение уже запущено', status: enrichState })
  }

  enrichState.running = true
  enrichState.started_at = new Date().toISOString()
  enrichState.finished_at = null
  enrichState.last_error = ''
  const options = normalizeEnrichOptions(_req.body || {})

  setImmediate(() => {
    runEmptyFieldEnrichment(options).catch((err) => {
      enrichState.running = false
      enrichState.last_error = err.message
      enrichState.finished_at = new Date().toISOString()
      console.error('Catalog enrichment error:', err)
    })
  })

  return res.json({
    ok: true,
    message: 'Enrichment started',
    scope: options.scope,
    latest_limit: options.latestLimit,
  })
})

router.get('/normalize-existing-cars/status', (_req, res) => {
  return res.json(normalizeCarsState)
})

router.post('/normalize-existing-cars/start', async (_req, res) => {
  if (enrichState.running) {
    return res.status(409).json({ error: 'Enrichment is already running' })
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

  setImmediate(() => {
    runCarTextBackfill({
      onProgress: (snapshot) => {
        Object.assign(normalizeCarsState, snapshot)
      },
    }).catch((err) => {
      normalizeCarsState.running = false
      normalizeCarsState.last_error = err.message
      normalizeCarsState.finished_at = new Date().toISOString()
      console.error('Car text normalization error:', err)
    })
  })

  return res.json({ ok: true, message: 'РќРѕСЂРјР°Р»РёР·Р°С†РёСЏ СѓР¶Рµ СЃРѕС…СЂР°РЅРµРЅРЅС‹С… РјР°С€РёРЅ Р·Р°РїСѓС‰РµРЅР°' })
})

router.get('/catalog-export', async (_req, res) => {
  try {
    const result = await pool.query(`
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
      FROM cars c
      LEFT JOIN car_images ci ON ci.car_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC, c.id DESC
    `)

    const exportedAt = new Date().toISOString()
    const payload = {
      exported_at: exportedAt,
      total: result.rows.length,
      cars: result.rows,
    }

    const fileStamp = exportedAt.replace(/[:.]/g, '-')
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="catalog-export-${fileStamp}.json"`)
    return res.status(200).send(JSON.stringify(payload, null, 2))
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Ошибка сервера' })
  }
})

export default router

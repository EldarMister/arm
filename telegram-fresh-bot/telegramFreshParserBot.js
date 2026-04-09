import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()

const TELEGRAM_API_BASE = 'https://api.telegram.org'
const TELEGRAM_TIMEOUT_MS = 15000
const TELEGRAM_FRESH_TABLE = 'telegram_fresh_parser_sessions'
const TELEGRAM_FRESH_INTERVAL_MS = 3 * 60 * 1000
const TELEGRAM_FRESH_RUN_LIMIT = 80
const PARSE_SCOPE_ALL = 'all'
const PARSE_SCOPE_DOMESTIC = 'domestic'
const PARSE_SCOPE_IMPORTED = 'imported'
const PARSE_SCOPE_JAPANESE = 'japanese'
const PARSE_SCOPE_GERMAN = 'german'
const SUPPORTED_PARSE_SCOPES = new Set([
  PARSE_SCOPE_ALL,
  PARSE_SCOPE_DOMESTIC,
  PARSE_SCOPE_IMPORTED,
  PARSE_SCOPE_JAPANESE,
  PARSE_SCOPE_GERMAN,
])
const JAPANESE_BRAND_ALIASES = [
  'toyota',
  'lexus',
  'honda',
  'nissan',
  'infiniti',
  'mazda',
  'subaru',
  'mitsubishi',
  'suzuki',
  'isuzu',
  'daihatsu',
  'acura',
]
const GERMAN_BRAND_ALIASES = [
  'bmw',
  'mercedesbenz',
  'mercedes',
  'benz',
  'audi',
  'volkswagen',
  'vw',
  'porsche',
  'mini',
  'smart',
  'maybach',
  'opel',
]
const BUTTON_START = '\uD83D\uDE80 \u0417\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u044c \u043f\u0430\u0440\u0441\u0438\u043d\u0433'
const BUTTON_STOP = '\u23F9\uFE0F \u041E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u043F\u0430\u0440\u0441\u0438\u043D\u0433'
const BUTTON_STATUS = '\uD83D\uDCCA \u0421\u0442\u0430\u0442\u0443\u0441'
const BUTTON_FILTERS = '\uD83C\uDFAF \u0424\u0438\u043B\u044C\u0442\u0440\u044B'
const BUTTON_BACK = '\u2B05\uFE0F \u041D\u0430\u0437\u0430\u0434'
const FILTER_BUTTONS = Object.freeze({
  [PARSE_SCOPE_ALL]: '\uD83D\uDE97 \u0412\u0441\u0435 \u043c\u0430\u0448\u0438\u043d\u044b',
  [PARSE_SCOPE_DOMESTIC]: '\uD83C\uDDF0\uD83C\uDDF7 \u041A\u043E\u0440\u0435\u0439\u0441\u043A\u0438\u0435',
  [PARSE_SCOPE_IMPORTED]: '\uD83C\uDF0D \u0412\u0441\u0435 \u0438\u043C\u043F\u043E\u0440\u0442\u043D\u044B\u0435',
  [PARSE_SCOPE_JAPANESE]: '\uD83C\uDDEF\uD83C\uDDF5 \u042F\u043F\u043E\u043D\u0441\u043A\u0438\u0435',
  [PARSE_SCOPE_GERMAN]: '\uD83C\uDDE9\uD83C\uDDEA \u041D\u0435\u043C\u0435\u0446\u043A\u0438\u0435',
})
const KEYBOARD_SECTION_MAIN = 'main'
const KEYBOARD_SECTION_FILTERS = 'filters'

let ensureTelegramFreshParserTablesPromise = null
let telegramFreshParserTimer = null
let telegramFreshParserRunPromise = null
let telegramFreshParserImmediateTimer = null
let telegramFreshParserRerunRequested = false
let telegramFreshParserDb = null
let telegramFreshParserRunFreshScrapeJob = null
let telegramFreshParserIsScraperRunning = null

const VEHICLE_ORIGIN_LABELS = Object.freeze({
  korean: '\u041a\u043e\u0440\u0435\u0439\u0441\u043a\u0438\u0435 \u0430\u0432\u0442\u043e',
  imported: '\u0418\u043c\u043f\u043e\u0440\u0442\u043d\u044b\u0435 \u0430\u0432\u0442\u043e',
})
const KOREAN_VEHICLE_BRAND_RE = /\b(kia|gia|hyundai|hyeondae|genesis|jenesiseu|daewoo|renault(?:\s+korea|\s+samsung)|renault samsung|reunokoria|samsung|samseong|ssangyong|kg\s*mobility|kgmobilriti)\b/i
const KOREAN_VEHICLE_BRAND_HANGUL_RE = /\uAE30\uC544|\uD604\uB300|\uC81C\uB124\uC2DC\uC2A4|\uB300\uC6B0|\uB974\uB178\uCF54\uB9AC\uC544|\uC0BC\uC131|\uC30D\uC6A9|\uBAA8\uBE4C\uB9AC\uD2F0/u
const KOREAN_VEHICLE_MODEL_RE = /\b(sm3|sm5|sm6|sm7|qm3|qm5|qm6|xm3|k3|k5|k7|k8|k9|g70|g80|g90|gv60|gv70|gv80|eq900|avante|elantra|sonata|grandeur|azera|santafe|santa\s*fe|tucson|palisade|staria|starex|porter|bongo|casper|morning|ray|carnival|sorento|sportage|seltos|mohave|niro|kona|orlando|trailblazer|trax|malibu|spark|matiz|damas|labo|rexton|actyon|korando|tivoli|torres|musso|bolteu|bolt|ioniq|aionik|veloster|stinger|soul|ssoul|ev3|ev4|ev5|ev6|ev9)\b/i

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalizeText(value) {
  return cleanText(value)
}

function normalizeManufacturer(value) {
  const raw = cleanText(value)
  if (!raw) return ''
  if (/renault[-\s]*korea\s*\(?\s*(samseong|samsung)?\s*\)?/i.test(raw)) return 'Renault Korea'
  if (/reunokoria\s*\(?\s*(samseong|samsung)?\s*\)?/i.test(raw)) return 'Renault Korea'

  const text = normalizeText(raw)
  if (!text) return ''
  if (/renault[-\s]*korea\s*\(?\s*(samseong|samsung)?\s*\)?/i.test(text)) return 'Renault Korea'
  if (/renault\s*samsung/i.test(text)) return 'Renault Korea'
  if (/reunokoria\s*\(?\s*(samseong|samsung)?\s*\)?/i.test(text)) return 'Renault Korea'
  if (/kgmobilriti/i.test(text) || /kg mobility/i.test(text)) return 'KG Mobility'
  if (/ssangyong/i.test(text)) return 'SsangYong'
  return text
}

function classifyVehicleOrigin(...values) {
  const text = values
    .map((value) => cleanText(value))
    .filter(Boolean)
    .join(' ')

  if (!text) return ''
  if (
    KOREAN_VEHICLE_BRAND_RE.test(text) ||
    KOREAN_VEHICLE_BRAND_HANGUL_RE.test(text) ||
    KOREAN_VEHICLE_MODEL_RE.test(text)
  ) {
    return VEHICLE_ORIGIN_LABELS.korean
  }

  return VEHICLE_ORIGIN_LABELS.imported
}

export function configureTelegramFreshParserService({
  db = null,
  runFreshScrapeJob = null,
  isScraperRunning = null,
} = {}) {
  if (db) telegramFreshParserDb = db
  if (typeof runFreshScrapeJob === 'function') telegramFreshParserRunFreshScrapeJob = runFreshScrapeJob
  if (typeof isScraperRunning === 'function') telegramFreshParserIsScraperRunning = isScraperRunning
}

function getTelegramFreshParserDb() {
  if (!telegramFreshParserDb?.query) {
    throw new Error('telegram fresh parser db is not configured')
  }
  return telegramFreshParserDb
}

function getTelegramFreshParserRunFreshScrapeJob() {
  if (typeof telegramFreshParserRunFreshScrapeJob !== 'function') {
    throw new Error('telegram fresh parser runner is not configured')
  }
  return telegramFreshParserRunFreshScrapeJob
}

function isTelegramFreshParserScraperRunning() {
  return typeof telegramFreshParserIsScraperRunning === 'function'
    ? Boolean(telegramFreshParserIsScraperRunning())
    : false
}

function readEnv() {
  return globalThis.process?.env || {}
}

function readPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeChatId(value) {
  const raw = cleanText(value)
  if (!raw) return ''

  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? String(parsed) : ''
}

function normalizeParseScope(value) {
  return SUPPORTED_PARSE_SCOPES.has(value) ? value : PARSE_SCOPE_ALL
}

function formatParseScopeLabel(parseScope) {
  if (parseScope === PARSE_SCOPE_DOMESTIC) return '\u041a\u043e\u0440\u0435\u0439\u0441\u043a\u0438\u0435'
  if (parseScope === PARSE_SCOPE_IMPORTED) return '\u0412\u0441\u0435 \u0438\u043c\u043f\u043e\u0440\u0442\u043d\u044b\u0435'
  if (parseScope === PARSE_SCOPE_JAPANESE) return '\u042f\u043f\u043e\u043d\u0441\u043a\u0438\u0435'
  if (parseScope === PARSE_SCOPE_GERMAN) return '\u041d\u0435\u043c\u0435\u0446\u043a\u0438\u0435'
  return '\u0412\u0441\u0435 \u043c\u0430\u0448\u0438\u043d\u044b'
}

function getFilterButtonLabel(parseScope, activeScope = '') {
  const baseLabel = FILTER_BUTTONS[parseScope] || FILTER_BUTTONS[PARSE_SCOPE_ALL]
  return parseScope === normalizeParseScope(activeScope)
    ? `\u2705 ${baseLabel}`
    : baseLabel
}

function getTelegramFreshParserConfig() {
  const env = readEnv()
  return {
    enabled: Boolean(cleanText(env.TELEGRAM_BOT_TOKEN)),
    botToken: cleanText(env.TELEGRAM_BOT_TOKEN),
    intervalMs: readPositiveInteger(env.TELEGRAM_FRESH_PARSER_INTERVAL_MS, TELEGRAM_FRESH_INTERVAL_MS),
    runLimit: readPositiveInteger(env.TELEGRAM_FRESH_PARSER_LIMIT, TELEGRAM_FRESH_RUN_LIMIT),
  }
}

function getTelegramApiUrl(botToken, method) {
  return `${TELEGRAM_API_BASE}/bot${botToken}/${method}`
}

function buildControlKeyboard(session = null, section = KEYBOARD_SECTION_MAIN) {
  const isActive = Boolean(session?.is_active)
  const toggleButtonLabel = isActive ? BUTTON_STOP : BUTTON_START
  const activeScope = normalizeParseScope(session?.parse_scope)

  if (section === KEYBOARD_SECTION_FILTERS) {
    return {
      keyboard: [
        [{ text: getFilterButtonLabel(PARSE_SCOPE_ALL, activeScope) }, { text: getFilterButtonLabel(PARSE_SCOPE_DOMESTIC, activeScope) }],
        [{ text: getFilterButtonLabel(PARSE_SCOPE_IMPORTED, activeScope) }, { text: getFilterButtonLabel(PARSE_SCOPE_JAPANESE, activeScope) }],
        [{ text: getFilterButtonLabel(PARSE_SCOPE_GERMAN, activeScope) }],
        [{ text: BUTTON_BACK }],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
    }
  }

  return {
    keyboard: [
      [{ text: toggleButtonLabel }],
      [{ text: BUTTON_STATUS }, { text: BUTTON_FILTERS }],
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
  }
}

async function sendTelegramControlMessage(
  botToken,
  chatId,
  text,
  session = null,
  section = KEYBOARD_SECTION_MAIN,
) {
  if (!botToken || !normalizeChatId(chatId)) return

  await axios.post(
    getTelegramApiUrl(botToken, 'sendMessage'),
    {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      reply_markup: buildControlKeyboard(session, section),
    },
    {
      timeout: TELEGRAM_TIMEOUT_MS,
    },
  )
}

async function ensureTelegramFreshParserTables() {
  if (!ensureTelegramFreshParserTablesPromise) {
    ensureTelegramFreshParserTablesPromise = (async () => {
      await getTelegramFreshParserDb().query(`
        CREATE TABLE IF NOT EXISTS ${TELEGRAM_FRESH_TABLE} (
          chat_id           BIGINT PRIMARY KEY,
          parse_scope       VARCHAR(20) NOT NULL DEFAULT 'all',
          is_active         BOOLEAN NOT NULL DEFAULT false,
          started_at        TIMESTAMPTZ,
          stopped_at        TIMESTAMPTZ,
          last_requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_run_at       TIMESTAMPTZ,
          last_error        TEXT,
          created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_telegram_fresh_parser_active
          ON ${TELEGRAM_FRESH_TABLE}(is_active, parse_scope, updated_at DESC);
      `)
    })().catch((error) => {
      ensureTelegramFreshParserTablesPromise = null
      throw error
    })
  }

  return ensureTelegramFreshParserTablesPromise
}

async function getTelegramFreshParserSession(chatId) {
  await ensureTelegramFreshParserTables()
  const normalizedChatId = normalizeChatId(chatId)
  if (!normalizedChatId) return null

  await getTelegramFreshParserDb().query(`
    INSERT INTO ${TELEGRAM_FRESH_TABLE} (chat_id)
    VALUES ($1::bigint)
    ON CONFLICT (chat_id) DO NOTHING
  `, [normalizedChatId])

  const result = await getTelegramFreshParserDb().query(`
    SELECT chat_id, parse_scope, is_active, started_at, stopped_at, last_requested_at, last_run_at, last_error
    FROM ${TELEGRAM_FRESH_TABLE}
    WHERE chat_id = $1::bigint
  `, [normalizedChatId])

  return result.rows[0] || null
}

async function updateTelegramFreshParserSession(chatId, { parseScope, isActive, clearError = false } = {}) {
  await ensureTelegramFreshParserTables()
  const normalizedChatId = normalizeChatId(chatId)
  if (!normalizedChatId) return null

  const current = await getTelegramFreshParserSession(normalizedChatId)
  const nextParseScope = normalizeParseScope(parseScope ?? current?.parse_scope)
  const nextIsActive = typeof isActive === 'boolean' ? isActive : Boolean(current?.is_active)

  await getTelegramFreshParserDb().query(`
    INSERT INTO ${TELEGRAM_FRESH_TABLE} (
      chat_id,
      parse_scope,
      is_active,
      started_at,
      stopped_at,
      last_requested_at,
      updated_at,
      last_error
    )
    VALUES (
      $1::bigint,
      $2,
      $3,
      CASE WHEN $3::boolean THEN NOW() ELSE NULL END,
      CASE WHEN $3::boolean THEN NULL ELSE NOW() END,
      NOW(),
      NOW(),
      NULL
    )
    ON CONFLICT (chat_id) DO UPDATE
    SET parse_scope = EXCLUDED.parse_scope,
        is_active = EXCLUDED.is_active,
        started_at = CASE
          WHEN EXCLUDED.is_active = true AND ${TELEGRAM_FRESH_TABLE}.is_active = false THEN NOW()
          ELSE ${TELEGRAM_FRESH_TABLE}.started_at
        END,
        stopped_at = CASE
          WHEN EXCLUDED.is_active = false THEN NOW()
          ELSE ${TELEGRAM_FRESH_TABLE}.stopped_at
        END,
        last_requested_at = NOW(),
        updated_at = NOW(),
        last_error = CASE
          WHEN $4::boolean THEN NULL
          ELSE ${TELEGRAM_FRESH_TABLE}.last_error
        END
  `, [normalizedChatId, nextParseScope, nextIsActive, clearError])

  return getTelegramFreshParserSession(normalizedChatId)
}

async function setTelegramFreshParserLastRunSuccess(chatIds = []) {
  const normalizedChatIds = [...new Set(chatIds.map((value) => normalizeChatId(value)).filter(Boolean))]
  if (!normalizedChatIds.length) return

  await getTelegramFreshParserDb().query(`
    UPDATE ${TELEGRAM_FRESH_TABLE}
    SET last_run_at = NOW(),
        last_error = NULL,
        updated_at = NOW()
    WHERE chat_id = ANY($1::bigint[])
  `, [normalizedChatIds])
}

async function setTelegramFreshParserLastError(chatIds = [], errorMessage = '') {
  const normalizedChatIds = [...new Set(chatIds.map((value) => normalizeChatId(value)).filter(Boolean))]
  if (!normalizedChatIds.length) return

  await getTelegramFreshParserDb().query(`
    UPDATE ${TELEGRAM_FRESH_TABLE}
    SET last_error = $2,
        updated_at = NOW()
    WHERE chat_id = ANY($1::bigint[])
  `, [normalizedChatIds, cleanText(errorMessage).slice(0, 500)])
}

async function getActiveTelegramFreshParserSessions() {
  await ensureTelegramFreshParserTables()
  const result = await getTelegramFreshParserDb().query(`
    SELECT chat_id, parse_scope
    FROM ${TELEGRAM_FRESH_TABLE}
    WHERE is_active = true
    ORDER BY chat_id ASC
  `)

  return result.rows.map((row) => ({
    chatId: normalizeChatId(row.chat_id),
    parseScope: normalizeParseScope(row.parse_scope),
  })).filter((row) => row.chatId)
}

function normalizeBrandSignal(value) {
  const normalized = normalizeManufacturer(value || '')
  return cleanText(normalized).toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function matchesAliases(values, aliases) {
  const signals = values
    .map((value) => normalizeBrandSignal(value))
    .filter(Boolean)

  return signals.some((signal) => aliases.some((alias) => signal === alias || signal.startsWith(alias)))
}

function matchesTelegramParseScope(car, parseScope) {
  const normalizedScope = normalizeParseScope(parseScope)
  if (normalizedScope === PARSE_SCOPE_ALL) return true

  const origin = classifyVehicleOrigin(
    car?.manufacturer,
    car?.name,
    car?.model,
  )

  if (normalizedScope === PARSE_SCOPE_DOMESTIC) {
    return origin === VEHICLE_ORIGIN_LABELS.korean
  }

  if (normalizedScope === PARSE_SCOPE_IMPORTED) {
    return origin === VEHICLE_ORIGIN_LABELS.imported
  }

  if (normalizedScope === PARSE_SCOPE_JAPANESE) {
    return matchesAliases([car?.manufacturer, car?.name, car?.model], JAPANESE_BRAND_ALIASES)
  }

  if (normalizedScope === PARSE_SCOPE_GERMAN) {
    return matchesAliases([car?.manufacturer, car?.name, car?.model], GERMAN_BRAND_ALIASES)
  }

  return true
}

function resolveRecipientChatIdsForCar(activeSessions, car) {
  return activeSessions
    .filter((session) => matchesTelegramParseScope(car, session.parseScope))
    .map((session) => session.chatId)
}

function buildTelegramFreshParserStatusText(session) {
  const isActive = Boolean(session?.is_active)
  const parseScope = normalizeParseScope(session?.parse_scope)
  const lastRunAt = cleanText(session?.last_run_at)
  const lastError = cleanText(session?.last_error)
  const toggleLabel = isActive ? BUTTON_STOP : BUTTON_START

  const lines = [
    '\uD83E\uDD16 Fresh-\u043F\u0430\u0440\u0441\u0438\u043D\u0433 Encar \u0447\u0435\u0440\u0435\u0437 Telegram',
    `\uD83D\uDCCA \u0421\u0442\u0430\u0442\u0443\u0441: ${isActive ? '\uD83D\uDFE2 \u0432\u043A\u043B\u044E\u0447\u0435\u043D' : '\uD83D\uDD34 \u0432\u044B\u043A\u043B\u044E\u0447\u0435\u043D'}`,
    `\u2705 \u0422\u0435\u043A\u0443\u0449\u0438\u0439 \u0444\u0438\u043B\u044C\u0442\u0440: ${formatParseScopeLabel(parseScope)}`,
    '\u2728 \u0420\u0435\u0436\u0438\u043C: \u0442\u043E\u043B\u044C\u043A\u043E \u0441\u0432\u0435\u0436\u0438\u0435 \u043E\u0431\u044A\u044F\u0432\u043B\u0435\u043D\u0438\u044F.',
  ]

  if (lastRunAt) {
    lines.push(`\u23F1\uFE0F \u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0439 \u0437\u0430\u043F\u0443\u0441\u043A: ${lastRunAt}`)
  }

  if (lastError) {
    lines.push(`\u26A0\uFE0F \u041F\u043E\u0441\u043B\u0435\u0434\u043D\u044F\u044F \u043E\u0448\u0438\u0431\u043A\u0430: ${lastError}`)
  }

  lines.push('')
  lines.push(`\uD83D\uDD18 \u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435: ${toggleLabel}`)
  lines.push('\uD83C\uDFAF \u0424\u0438\u043B\u044C\u0442\u0440\u044B:')
  lines.push('\uD83D\uDE97 \u0412\u0441\u0435 \u043C\u0430\u0448\u0438\u043D\u044B / \uD83C\uDDF0\uD83C\uDDF7 \u041A\u043E\u0440\u0435\u0439\u0441\u043A\u0438\u0435 / \uD83C\uDF0D \u0412\u0441\u0435 \u0438\u043C\u043F\u043E\u0440\u0442\u043D\u044B\u0435 / \uD83C\uDDEF\uD83C\uDDF5 \u042F\u043F\u043E\u043D\u0441\u043A\u0438\u0435 / \uD83C\uDDE9\uD83C\uDDEA \u041D\u0435\u043C\u0435\u0446\u043A\u0438\u0435')
  return lines.join('\n')
}

function buildTelegramFreshParserFiltersText(session) {
  const parseScope = normalizeParseScope(session?.parse_scope)

  return [
    '\uD83C\uDFAF \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0444\u0438\u043B\u044C\u0442\u0440:',
    `\u2705 \u0421\u0435\u0439\u0447\u0430\u0441 \u0430\u043A\u0442\u0438\u0432\u0435\u043D: ${formatParseScopeLabel(parseScope)}`,
    '',
    `${getFilterButtonLabel(PARSE_SCOPE_ALL, parseScope)}`,
    `${getFilterButtonLabel(PARSE_SCOPE_DOMESTIC, parseScope)}`,
    `${getFilterButtonLabel(PARSE_SCOPE_IMPORTED, parseScope)}`,
    `${getFilterButtonLabel(PARSE_SCOPE_JAPANESE, parseScope)}`,
    `${getFilterButtonLabel(PARSE_SCOPE_GERMAN, parseScope)}`,
  ].join('\n')
}

function resolveFilterButtonScope(text) {
  const normalizedText = cleanText(text).replace(/^\u2705\s*/u, '')
  return Object.entries(FILTER_BUTTONS).find(([, label]) => label === normalizedText)?.[0] || ''
}

function scheduleTelegramFreshParserImmediateRun(delayMs = 1000) {
  if (telegramFreshParserImmediateTimer) {
    clearTimeout(telegramFreshParserImmediateTimer)
  }

  telegramFreshParserImmediateTimer = setTimeout(() => {
    telegramFreshParserImmediateTimer = null
    void runTelegramFreshParserCycle({ force: true })
  }, Math.max(250, delayMs))
  telegramFreshParserImmediateTimer.unref?.()
}

function cancelTelegramFreshParserPendingRuns() {
  if (telegramFreshParserImmediateTimer) {
    clearTimeout(telegramFreshParserImmediateTimer)
    telegramFreshParserImmediateTimer = null
  }

  telegramFreshParserRerunRequested = false
}

export async function runTelegramFreshParserCycle({ force = false } = {}) {
  if (telegramFreshParserRunPromise) {
    if (force) {
      telegramFreshParserRerunRequested = true
    }
    return telegramFreshParserRunPromise
  }

  telegramFreshParserRunPromise = (async () => {
    const config = getTelegramFreshParserConfig()
    if (!config.enabled) {
      return { started: false, reason: 'telegram_not_configured' }
    }

    const activeSessions = await getActiveTelegramFreshParserSessions()
    if (!activeSessions.length) {
      return { started: false, reason: 'no_active_chats' }
    }

    if (isTelegramFreshParserScraperRunning()) {
      if (force) {
        scheduleTelegramFreshParserImmediateRun(Math.min(config.intervalMs, 30000))
      }
      return { started: false, reason: 'scraper_busy', activeChats: activeSessions.length }
    }

    try {
      await getTelegramFreshParserRunFreshScrapeJob()({
        limit: config.runLimit,
        activeSessions,
        recipientResolver: async ({ car }) => {
          const currentSessions = await getActiveTelegramFreshParserSessions()
          return resolveRecipientChatIdsForCar(currentSessions, car)
        },
      })

      await setTelegramFreshParserLastRunSuccess(activeSessions.map((session) => session.chatId))

      return {
        started: true,
        activeChats: activeSessions.length,
        runLimit: config.runLimit,
      }
    } catch (error) {
      await setTelegramFreshParserLastError(activeSessions.map((session) => session.chatId), error?.message)
      throw error
    }
  })()

  try {
    return await telegramFreshParserRunPromise
  } finally {
    telegramFreshParserRunPromise = null
    if (telegramFreshParserRerunRequested) {
      telegramFreshParserRerunRequested = false
      scheduleTelegramFreshParserImmediateRun(1500)
    }
  }
}

export function startTelegramFreshParserService() {
  const config = getTelegramFreshParserConfig()
  if (!config.enabled) {
    return { started: false, reason: 'telegram_not_configured' }
  }

  if (telegramFreshParserTimer) {
    return { started: false, reason: 'already_started', intervalMs: config.intervalMs }
  }

  const runCycle = () => {
    runTelegramFreshParserCycle()
      .catch((error) => {
        console.warn(`TELEGRAM_FRESH_PARSER_FAILED | ${cleanText(error?.message) || 'unknown error'}`)
      })
  }

  scheduleTelegramFreshParserImmediateRun(2000)
  telegramFreshParserTimer = setInterval(runCycle, config.intervalMs)
  telegramFreshParserTimer.unref?.()

  return {
    started: true,
    intervalMs: config.intervalMs,
  }
}

export async function handleTelegramFreshControlUpdate({
  botToken,
  chatId,
  message,
  action = '',
} = {}) {
  const normalizedChatId = normalizeChatId(chatId)
  if (!botToken || !normalizedChatId) {
    return { handled: false, skipDefaultAck: false }
  }

  await ensureTelegramFreshParserTables()

  const text = cleanText(message?.text)
  if (action === 'unsubscribe') {
    cancelTelegramFreshParserPendingRuns()
    const session = await updateTelegramFreshParserSession(normalizedChatId, {
      isActive: false,
      clearError: true,
    })

    await sendTelegramControlMessage(
      botToken,
      normalizedChatId,
      '\uD83D\uDD15 \u041F\u0430\u0440\u0441\u0438\u043D\u0433 \u0438 \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0430 \u043E\u0442\u043A\u043B\u044E\u0447\u0435\u043D\u044B. \u0427\u0442\u043E\u0431\u044B \u0441\u043D\u043E\u0432\u0430 \u043F\u043E\u043B\u0443\u0447\u0430\u0442\u044C \u043E\u0431\u044A\u044F\u0432\u043B\u0435\u043D\u0438\u044F, \u043E\u0442\u043F\u0440\u0430\u0432\u044C\u0442\u0435 /start.',
      session,
    )

    return { handled: true, skipDefaultAck: true }
  }

  if (action === 'subscribe') {
    const session = await getTelegramFreshParserSession(normalizedChatId)
    await sendTelegramControlMessage(
      botToken,
      normalizedChatId,
      buildTelegramFreshParserStatusText(session),
      session,
    )
    return { handled: true, skipDefaultAck: true }
  }

  if (!text) {
    return { handled: false, skipDefaultAck: false }
  }

  const filterScope = resolveFilterButtonScope(text)
  if (filterScope) {
    const session = await updateTelegramFreshParserSession(normalizedChatId, {
      parseScope: filterScope,
      clearError: true,
    })

    await sendTelegramControlMessage(
      botToken,
      normalizedChatId,
      [
        `\u2705 \u0424\u0438\u043B\u044C\u0442\u0440 \u0432\u044B\u0431\u0440\u0430\u043D: ${formatParseScopeLabel(filterScope)}.`,
        session?.is_active
          ? '\uD83D\uDE9A \u041F\u0430\u0440\u0441\u0438\u043D\u0433 \u0443\u0436\u0435 \u0432\u043A\u043B\u044E\u0447\u0435\u043D. \u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0435 \u043E\u0431\u044A\u044F\u0432\u043B\u0435\u043D\u0438\u044F \u043F\u0440\u0438\u0434\u0443\u0442 \u043F\u043E \u043D\u043E\u0432\u043E\u043C\u0443 \u0444\u0438\u043B\u044C\u0442\u0440\u0443.'
          : '\uD83D\uDCBE \u0424\u0438\u043B\u044C\u0442\u0440 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D. \u0422\u0435\u043F\u0435\u0440\u044C \u043C\u043E\u0436\u043D\u043E \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0442\u044C \u043F\u0430\u0440\u0441\u0438\u043D\u0433.',
      ].join('\n'),
      session,
      KEYBOARD_SECTION_FILTERS,
    )

    if (session?.is_active) {
      scheduleTelegramFreshParserImmediateRun(500)
    }

    return { handled: true, skipDefaultAck: false }
  }

  if (text === BUTTON_FILTERS) {
    const session = await getTelegramFreshParserSession(normalizedChatId)
    await sendTelegramControlMessage(
      botToken,
      normalizedChatId,
      buildTelegramFreshParserFiltersText(session),
      session,
      KEYBOARD_SECTION_FILTERS,
    )
    return { handled: true, skipDefaultAck: false }
  }

  if (text === BUTTON_BACK || text === '/menu') {
    const session = await getTelegramFreshParserSession(normalizedChatId)
    await sendTelegramControlMessage(
      botToken,
      normalizedChatId,
      buildTelegramFreshParserStatusText(session),
      session,
    )
    return { handled: true, skipDefaultAck: false }
  }

  if (text === BUTTON_START || text === '/fresh_on' || text === '/fresh') {
    const session = await updateTelegramFreshParserSession(normalizedChatId, {
      isActive: true,
      clearError: true,
    })

    await sendTelegramControlMessage(
      botToken,
      normalizedChatId,
      [
        '\uD83D\uDE80 \u041F\u0430\u0440\u0441\u0438\u043D\u0433 \u0437\u0430\u043F\u0443\u0449\u0435\u043D.',
        `\uD83C\uDFAF \u0424\u0438\u043B\u044C\u0442\u0440: ${formatParseScopeLabel(session?.parse_scope)}.`,
        '\u2728 \u041D\u043E\u0432\u044B\u0435 fresh-\u043E\u0431\u044A\u044F\u0432\u043B\u0435\u043D\u0438\u044F \u0431\u0443\u0434\u0443\u0442 \u043F\u0440\u0438\u0445\u043E\u0434\u0438\u0442\u044C \u043F\u043E \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u043C\u0443 \u0444\u0438\u043B\u044C\u0442\u0440\u0443.',
      ].join('\n'),
      session,
    )

    scheduleTelegramFreshParserImmediateRun(250)
    return { handled: true, skipDefaultAck: false }
  }

  if (text === BUTTON_STOP || text === '/fresh_off') {
    cancelTelegramFreshParserPendingRuns()
    const session = await updateTelegramFreshParserSession(normalizedChatId, {
      isActive: false,
      clearError: true,
    })

    await sendTelegramControlMessage(
      botToken,
      normalizedChatId,
      [
        '\u23F9\uFE0F \u041F\u0430\u0440\u0441\u0438\u043D\u0433 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D.',
        `\uD83C\uDFAF \u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0439 \u0444\u0438\u043B\u044C\u0442\u0440 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D: ${formatParseScopeLabel(session?.parse_scope)}.`,
        '\u270B \u041D\u043E\u0432\u044B\u0435 \u043E\u0431\u044A\u044F\u0432\u043B\u0435\u043D\u0438\u044F \u0431\u043E\u043B\u044C\u0448\u0435 \u043D\u0435 \u0431\u0443\u0434\u0443\u0442 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0442\u044C\u0441\u044F \u0432 \u044D\u0442\u043E\u0442 \u0447\u0430\u0442.',
      ].join('\n'),
      session,
    )

    return { handled: true, skipDefaultAck: false }
  }

  if (text === BUTTON_STATUS || text === '/status') {
    const session = await getTelegramFreshParserSession(normalizedChatId)
    await sendTelegramControlMessage(
      botToken,
      normalizedChatId,
      buildTelegramFreshParserStatusText(session),
      session,
    )
    return { handled: true, skipDefaultAck: false }
  }

  return { handled: false, skipDefaultAck: false }
}

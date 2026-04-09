import axios from 'axios'
import dotenv from 'dotenv'
import pool from '../db.js'
import { runScrapeJob } from '../scraper/job.js'
import { state as scraperState } from '../scraper/state.js'
import {
  classifyVehicleOrigin,
  normalizeManufacturer,
  VEHICLE_ORIGIN_LABELS,
} from './vehicleData.js'

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
const RUN_PRESET_FRESH_LOW_ENGAGEMENT = 'fresh_low_engagement'
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
const BUTTON_START = 'Запустить fresh-парсинг'
const BUTTON_STOP = 'Остановить fresh-парсинг'
const BUTTON_STATUS = 'Статус fresh-парсинга'
const FILTER_BUTTONS = Object.freeze({
  [PARSE_SCOPE_ALL]: 'Все машины',
  [PARSE_SCOPE_DOMESTIC]: 'Корейские',
  [PARSE_SCOPE_IMPORTED]: 'Все импортные',
  [PARSE_SCOPE_JAPANESE]: 'Японские',
  [PARSE_SCOPE_GERMAN]: 'Немецкие',
})

let ensureTelegramFreshParserTablesPromise = null
let telegramFreshParserTimer = null
let telegramFreshParserRunPromise = null
let telegramFreshParserImmediateTimer = null
let telegramFreshParserRerunRequested = false

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
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
  if (parseScope === PARSE_SCOPE_DOMESTIC) return 'Корейские'
  if (parseScope === PARSE_SCOPE_IMPORTED) return 'Все импортные'
  if (parseScope === PARSE_SCOPE_JAPANESE) return 'Японские'
  if (parseScope === PARSE_SCOPE_GERMAN) return 'Немецкие'
  return 'Все машины'
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

function buildControlKeyboard() {
  return {
    keyboard: [
      [{ text: BUTTON_START }, { text: BUTTON_STOP }],
      [{ text: FILTER_BUTTONS[PARSE_SCOPE_ALL] }, { text: FILTER_BUTTONS[PARSE_SCOPE_DOMESTIC] }],
      [{ text: FILTER_BUTTONS[PARSE_SCOPE_IMPORTED] }, { text: FILTER_BUTTONS[PARSE_SCOPE_JAPANESE] }],
      [{ text: FILTER_BUTTONS[PARSE_SCOPE_GERMAN] }, { text: BUTTON_STATUS }],
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
  }
}

async function sendTelegramControlMessage(botToken, chatId, text) {
  if (!botToken || !normalizeChatId(chatId)) return

  await axios.post(
    getTelegramApiUrl(botToken, 'sendMessage'),
    {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      reply_markup: buildControlKeyboard(),
    },
    {
      timeout: TELEGRAM_TIMEOUT_MS,
    },
  )
}

async function ensureTelegramFreshParserTables() {
  if (!ensureTelegramFreshParserTablesPromise) {
    ensureTelegramFreshParserTablesPromise = (async () => {
      await pool.query(`
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

  await pool.query(`
    INSERT INTO ${TELEGRAM_FRESH_TABLE} (chat_id)
    VALUES ($1::bigint)
    ON CONFLICT (chat_id) DO NOTHING
  `, [normalizedChatId])

  const result = await pool.query(`
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

  await pool.query(`
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

  await pool.query(`
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

  await pool.query(`
    UPDATE ${TELEGRAM_FRESH_TABLE}
    SET last_error = $2,
        updated_at = NOW()
    WHERE chat_id = ANY($1::bigint[])
  `, [normalizedChatIds, cleanText(errorMessage).slice(0, 500)])
}

async function getActiveTelegramFreshParserSessions() {
  await ensureTelegramFreshParserTables()
  const result = await pool.query(`
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

  const lines = [
    'Fresh-парсинг Encar в Telegram.',
    `Статус: ${isActive ? 'включен' : 'выключен'}`,
    `Фильтр: ${formatParseScopeLabel(parseScope)}`,
    'Режим: только свежие объявления',
  ]

  if (lastRunAt) {
    lines.push(`Последний цикл: ${lastRunAt}`)
  }

  if (lastError) {
    lines.push(`Последняя ошибка: ${lastError}`)
  }

  lines.push('')
  lines.push('Выберите фильтр и нажмите кнопку запуска. Пока режим включен, бот присылает только свежие объявления по выбранному фильтру.')
  return lines.join('\n')
}

function resolveFilterButtonScope(text) {
  const normalizedText = cleanText(text)
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

    if (scraperState.isRunning) {
      if (force) {
        scheduleTelegramFreshParserImmediateRun(Math.min(config.intervalMs, 30000))
      }
      return { started: false, reason: 'scraper_busy', activeChats: activeSessions.length }
    }

    try {
      await runScrapeJob(config.runLimit, {
        parseScope: PARSE_SCOPE_ALL,
        runPreset: RUN_PRESET_FRESH_LOW_ENGAGEMENT,
        suppressDefaultTelegramNotifications: true,
        onlyFreshLeadNotifications: true,
        telegramRecipientResolver: ({ car }) => resolveRecipientChatIdsForCar(activeSessions, car),
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
    await updateTelegramFreshParserSession(normalizedChatId, {
      isActive: false,
      clearError: true,
    })

    await sendTelegramControlMessage(
      botToken,
      normalizedChatId,
      'Уведомления и fresh-парсинг отключены. Чтобы включить снова, отправьте /start.',
    )

    return { handled: true, skipDefaultAck: true }
  }

  if (action === 'subscribe') {
    const session = await getTelegramFreshParserSession(normalizedChatId)
    await sendTelegramControlMessage(
      botToken,
      normalizedChatId,
      buildTelegramFreshParserStatusText(session),
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
        `Фильтр сохранен: ${formatParseScopeLabel(filterScope)}.`,
        session?.is_active
          ? 'Fresh-парсинг уже включен. Следующий цикл пойдет с новым фильтром.'
          : 'Fresh-парсинг пока выключен. Нажмите кнопку запуска.',
      ].join('\n'),
    )

    if (session?.is_active) {
      scheduleTelegramFreshParserImmediateRun()
    }

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
        'Fresh-парсинг включен.',
        `Фильтр: ${formatParseScopeLabel(session?.parse_scope)}.`,
        'Бот будет присылать только свежие объявления по этому фильтру.',
      ].join('\n'),
    )

    scheduleTelegramFreshParserImmediateRun()
    return { handled: true, skipDefaultAck: false }
  }

  if (text === BUTTON_STOP || text === '/fresh_off') {
    const session = await updateTelegramFreshParserSession(normalizedChatId, {
      isActive: false,
      clearError: true,
    })

    await sendTelegramControlMessage(
      botToken,
      normalizedChatId,
      [
        'Fresh-парсинг отключен.',
        `Текущий фильтр сохранен: ${formatParseScopeLabel(session?.parse_scope)}.`,
      ].join('\n'),
    )

    return { handled: true, skipDefaultAck: false }
  }

  if (text === BUTTON_STATUS || text === '/status' || text === '/menu') {
    const session = await getTelegramFreshParserSession(normalizedChatId)
    await sendTelegramControlMessage(
      botToken,
      normalizedChatId,
      buildTelegramFreshParserStatusText(session),
    )
    return { handled: true, skipDefaultAck: false }
  }

  return { handled: false, skipDefaultAck: false }
}

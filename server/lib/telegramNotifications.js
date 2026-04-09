import axios from 'axios'
import dotenv from 'dotenv'
import pool from '../db.js'
import { handleTelegramFreshControlUpdate } from '../../telegram-fresh-bot/telegramFreshParserBot.js'

const DEFAULT_SITE_URL = 'https://avt-autovtrade.com'
const TELEGRAM_API_BASE = 'https://api.telegram.org'
const TELEGRAM_TIMEOUT_MS = 15000
const TELEGRAM_UPDATE_LIMIT = 100
const TELEGRAM_SYNC_COOLDOWN_MS = 250
const TELEGRAM_SYNC_INTERVAL_MS = 500
const TELEGRAM_ALLOWED_UPDATES = ['message', 'edited_message', 'callback_query']

dotenv.config()

let telegramQueue = Promise.resolve()
let ensureTelegramTablesPromise = null
let telegramSubscriberSyncPromise = null
let lastTelegramSubscriberSyncAt = 0
let telegramSubscriberSyncTimer = null

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

function getTelegramConfig() {
  const env = readEnv()
  const botToken = cleanText(env.TELEGRAM_BOT_TOKEN)
  const directChatId = normalizeChatId(env.TELEGRAM_CHAT_ID)
  const siteUrl = cleanText(
    env.PUBLIC_SITE_URL
    || env.SITE_URL
    || env.BASE_URL
    || DEFAULT_SITE_URL,
  ).replace(/\/+$/, '')

  return {
    enabled: Boolean(botToken),
    botToken,
    directChatId,
    siteUrl: siteUrl || DEFAULT_SITE_URL,
    syncIntervalMs: readPositiveInteger(env.TELEGRAM_SYNC_INTERVAL_MS, TELEGRAM_SYNC_INTERVAL_MS),
  }
}

function formatInteger(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return ''
  return Math.round(number).toLocaleString('ru-RU')
}

function formatKrw(value) {
  const formatted = formatInteger(value)
  return formatted ? `${formatted} KRW` : ''
}

function formatUsd(value) {
  const formatted = formatInteger(value)
  return formatted ? `$${formatted}` : ''
}

function formatMileage(value) {
  const formatted = formatInteger(value)
  return formatted ? `${formatted} км` : ''
}

function formatIsoDateTime(value) {
  const text = cleanText(value)
  if (!text) return ''

  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return text

  return parsed.toISOString().replace('.000Z', 'Z')
}

function buildCatalogUrl(siteUrl, importedId) {
  const normalizedId = Number.parseInt(String(importedId || ''), 10)
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) return ''
  return `${siteUrl}/catalog/${normalizedId}`
}

function buildLeadMetrics(car) {
  const listingSync = car?.detail_flags?.listingSync
  const manageMetrics = car?.manage
  const source = listingSync && typeof listingSync === 'object' && !Array.isArray(listingSync)
    ? listingSync
    : (manageMetrics && typeof manageMetrics === 'object' && !Array.isArray(manageMetrics) ? manageMetrics : null)

  if (!source) return null

  const viewCount = Number(source.viewCount)
  const subscribeCount = Number(source.subscribeCount)
  const callCount = Number(source.callCount)

  return {
    viewCount: Number.isFinite(viewCount) && viewCount >= 0 ? Math.round(viewCount) : null,
    subscribeCount: Number.isFinite(subscribeCount) && subscribeCount >= 0 ? Math.round(subscribeCount) : null,
    callCount: Number.isFinite(callCount) && callCount >= 0 ? Math.round(callCount) : null,
    callCountSource: cleanText(source.callCountSource) || 'fallback_zero',
    firstAdvertisedDateTime: formatIsoDateTime(source.firstAdvertisedDateTime),
    modifyDateTime: formatIsoDateTime(source.modifyDateTime),
  }
}

function buildHeader(tag, car) {
  const title = cleanText(car?.name || car?.model || 'Без названия')
  const year = cleanText(car?.year)
  return year ? `${tag}\n${title} (${year})` : `${tag}\n${title}`
}

function buildFullLeadLine(leadMetrics) {
  if (!leadMetrics) return ''

  return [
    leadMetrics.viewCount !== null ? `просмотры ${leadMetrics.viewCount}` : '',
    leadMetrics.subscribeCount !== null ? `подписки ${leadMetrics.subscribeCount}` : '',
    leadMetrics.callCount !== null ? `звонки ${leadMetrics.callCount}` : '',
  ].filter(Boolean).join(' | ')
}

function buildFreshLeadLine(leadMetrics) {
  if (!leadMetrics) return ''

  return [
    leadMetrics.viewCount !== null ? `просмотры ${leadMetrics.viewCount}` : '',
    leadMetrics.callCount !== null ? `звонки ${leadMetrics.callCount}` : '',
  ].filter(Boolean).join(' | ')
}

function buildCommonLines({ tag, car, importedId, parseScopeLabel, runPresetLabel, notificationMode = 'full' }) {
  const config = getTelegramConfig()
  const leadMetrics = buildLeadMetrics(car)
  const lines = [buildHeader(tag, car)]

  if (notificationMode === 'fresh_list') {
    const trimLine = cleanText(car?.trim_level || car?.key_info)
    if (trimLine) lines.push(`Комплектация: ${trimLine}`)

    const fuelLine = cleanText(car?.fuel_type)
    if (fuelLine) lines.push(`Топливо: ${fuelLine}`)

    const yearLine = cleanText(car?.year)
    if (yearLine) lines.push(`Год: ${yearLine}`)

    const priceLine = formatKrw(car?.price_krw)
    if (priceLine) lines.push(`Цена: ${priceLine}`)

    const mileageLine = formatMileage(car?.mileage)
    if (mileageLine) lines.push(`Пробег: ${mileageLine}`)

    const leadLine = buildFreshLeadLine(leadMetrics)
    if (leadLine) lines.push(`Отклик: ${leadLine}`)

    const encarUrl = cleanText(car?.encar_url)
    if (encarUrl) lines.push(`Encar: ${encarUrl}`)

    return lines
  }

  const idLine = [
    importedId ? `AVT ID: ${importedId}` : '',
    cleanText(car?.encar_id) ? `Encar ID: ${cleanText(car.encar_id)}` : '',
  ].filter(Boolean).join(' | ')
  if (idLine) lines.push(idLine)

  const priceLine = [
    formatKrw(car?.price_krw),
    formatUsd(car?.price_usd),
  ].filter(Boolean).join(' | ')
  if (priceLine) lines.push(`Цена: ${priceLine}`)

  const metaLine = [
    formatMileage(car?.mileage),
    cleanText(car?.location),
  ].filter(Boolean).join(' | ')
  if (metaLine) lines.push(`Детали: ${metaLine}`)

  const leadLine = buildFullLeadLine(leadMetrics)
  if (leadLine) lines.push(`Отклик: ${leadLine}`)

  if (leadMetrics?.firstAdvertisedDateTime) {
    lines.push(`Первое размещение: ${leadMetrics.firstAdvertisedDateTime}`)
  }

  if (leadMetrics?.modifyDateTime) {
    lines.push(`Изменено: ${leadMetrics.modifyDateTime}`)
  }

  const modeLine = [
    cleanText(runPresetLabel),
    cleanText(parseScopeLabel),
  ].filter(Boolean).join(' | ')
  if (modeLine) lines.push(`Режим: ${modeLine}`)

  const catalogUrl = buildCatalogUrl(config.siteUrl, importedId)
  if (catalogUrl) lines.push(`Сайт: ${catalogUrl}`)

  const encarUrl = cleanText(car?.encar_url)
  if (encarUrl) lines.push(`Encar: ${encarUrl}`)

  return lines
}

function getTelegramApiUrl(botToken, method) {
  return `${TELEGRAM_API_BASE}/bot${botToken}/${method}`
}

function getTelegramMessageUpdate(update) {
  return update?.message || update?.edited_message || update?.callback_query?.message || null
}

function getTelegramSender(update) {
  return update?.message?.from || update?.edited_message?.from || update?.callback_query?.from || null
}

function getSubscriptionAction(text) {
  const command = cleanText(text).split(/\s+/, 1)[0].toLowerCase()
  if (!command) return ''
  if (command === '/start' || command === '/subscribe') return 'subscribe'
  if (command === '/stop' || command === '/unsubscribe') return 'unsubscribe'
  return ''
}

function shouldDeactivateSubscriber(error) {
  const httpStatus = Number(error?.response?.status) || 0
  const description = cleanText(error?.response?.data?.description || error?.message).toLowerCase()

  if (httpStatus === 403) return true
  return (
    description.includes('bot was blocked by the user')
    || description.includes('user is deactivated')
    || description.includes('chat not found')
  )
}

async function ensureTelegramTables() {
  if (!ensureTelegramTablesPromise) {
    ensureTelegramTablesPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS telegram_subscribers (
          chat_id             BIGINT PRIMARY KEY,
          chat_type           VARCHAR(20) NOT NULL DEFAULT 'private',
          username            VARCHAR(64),
          first_name          VARCHAR(120),
          last_name           VARCHAR(120),
          is_active           BOOLEAN NOT NULL DEFAULT true,
          subscribed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_seen_update_id BIGINT,
          last_delivered_at   TIMESTAMPTZ,
          last_delivery_error TEXT,
          created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_telegram_subscribers_active
          ON telegram_subscribers(is_active, last_seen_at DESC);

        CREATE TABLE IF NOT EXISTS telegram_bot_state (
          id             INTEGER PRIMARY KEY DEFAULT 1,
          last_update_id BIGINT NOT NULL DEFAULT 0,
          last_synced_at TIMESTAMPTZ,
          updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `)

      await pool.query(`
        INSERT INTO telegram_bot_state (id)
        VALUES (1)
        ON CONFLICT (id) DO NOTHING
      `)
    })().catch((error) => {
      ensureTelegramTablesPromise = null
      throw error
    })
  }

  return ensureTelegramTablesPromise
}

async function getTelegramBotState() {
  await ensureTelegramTables()
  const result = await pool.query(`
    SELECT last_update_id
    FROM telegram_bot_state
    WHERE id = 1
  `)

  return {
    lastUpdateId: Number(result.rows[0]?.last_update_id) || 0,
  }
}

async function setTelegramBotState(lastUpdateId) {
  await ensureTelegramTables()
  await pool.query(`
    INSERT INTO telegram_bot_state (id, last_update_id, last_synced_at, updated_at)
    VALUES (1, $1, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE
    SET last_update_id = EXCLUDED.last_update_id,
        last_synced_at = NOW(),
        updated_at = NOW()
  `, [Math.max(0, Number(lastUpdateId) || 0)])
}

async function upsertTelegramSubscriber({
  chatId,
  chatType = 'private',
  username = '',
  firstName = '',
  lastName = '',
  isActive = true,
  lastSeenUpdateId = null,
}) {
  await ensureTelegramTables()

  await pool.query(`
    INSERT INTO telegram_subscribers (
      chat_id,
      chat_type,
      username,
      first_name,
      last_name,
      is_active,
      subscribed_at,
      last_seen_at,
      last_seen_update_id,
      updated_at
    )
    VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), NULLIF($5, ''), $6, NOW(), NOW(), $7, NOW())
    ON CONFLICT (chat_id) DO UPDATE
    SET chat_type = EXCLUDED.chat_type,
        username = EXCLUDED.username,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        is_active = EXCLUDED.is_active,
        last_seen_at = NOW(),
        last_seen_update_id = EXCLUDED.last_seen_update_id,
        updated_at = NOW()
  `, [
    Number(chatId),
    cleanText(chatType) || 'private',
    cleanText(username),
    cleanText(firstName),
    cleanText(lastName),
    Boolean(isActive),
    Number(lastSeenUpdateId) || null,
  ])
}

async function markTelegramDeliverySuccess(chatId) {
  if (!normalizeChatId(chatId)) return
  await ensureTelegramTables()
  await pool.query(`
    UPDATE telegram_subscribers
    SET is_active = true,
        last_delivered_at = NOW(),
        last_delivery_error = NULL,
        updated_at = NOW()
    WHERE chat_id = $1::bigint
  `, [chatId])
}

async function markTelegramDeliveryFailure(chatId, error) {
  if (!normalizeChatId(chatId)) return
  await ensureTelegramTables()

  const shouldDeactivate = shouldDeactivateSubscriber(error)
  const errorMessage = cleanText(error?.response?.data?.description || error?.message || 'telegram delivery failed').slice(0, 500)

  await pool.query(`
    UPDATE telegram_subscribers
    SET is_active = CASE WHEN $2::boolean THEN false ELSE is_active END,
        last_delivery_error = $3,
        updated_at = NOW()
    WHERE chat_id = $1::bigint
  `, [chatId, shouldDeactivate, errorMessage])
}

async function getActiveTelegramRecipientIds() {
  await ensureTelegramTables()

  const result = await pool.query(`
    SELECT chat_id
    FROM telegram_subscribers
    WHERE is_active = true
    ORDER BY subscribed_at ASC, chat_id ASC
  `)

  return result.rows
    .map((row) => normalizeChatId(row.chat_id))
    .filter(Boolean)
}

async function sendTelegramMessageToChat(botToken, chatId, text) {
  const response = await axios.post(
    getTelegramApiUrl(botToken, 'sendMessage'),
    {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    },
    {
      timeout: TELEGRAM_TIMEOUT_MS,
    },
  )

  return {
    sent: true,
    messageId: response?.data?.result?.message_id ?? null,
    chatId,
  }
}

async function sendTelegramAck(botToken, chatId, action) {
  if (!normalizeChatId(chatId) || !botToken) return

  const text = action === 'unsubscribe'
    ? 'Подписка отключена. Чтобы снова получать свежие объявления, отправьте /start.'
    : 'Подписка включена. Новые fresh-объявления будут приходить в этот чат.'

  try {
    await sendTelegramMessageToChat(botToken, chatId, text)
  } catch {
    // best effort
  }
}

async function fetchTelegramUpdates(botToken, offset) {
  const response = await axios.get(
    getTelegramApiUrl(botToken, 'getUpdates'),
    {
      params: {
        offset,
        limit: TELEGRAM_UPDATE_LIMIT,
        timeout: 0,
        allowed_updates: JSON.stringify(TELEGRAM_ALLOWED_UPDATES),
      },
      timeout: TELEGRAM_TIMEOUT_MS,
    },
  )

  return Array.isArray(response?.data?.result) ? response.data.result : []
}

export async function syncTelegramSubscribers({ force = false } = {}) {
  const config = getTelegramConfig()
  if (!config.enabled) {
    return { synced: false, skipped: true, reason: 'telegram_not_configured' }
  }

  if (telegramSubscriberSyncPromise) {
    return telegramSubscriberSyncPromise
  }

  if (!force && Date.now() - lastTelegramSubscriberSyncAt < TELEGRAM_SYNC_COOLDOWN_MS) {
    return { synced: false, skipped: true, reason: 'sync_cooldown' }
  }

  telegramSubscriberSyncPromise = (async () => {
    const state = await getTelegramBotState()
    let lastUpdateId = state.lastUpdateId
    let processedUpdates = 0
    let registeredChats = 0
    let subscribedChats = 0
    let unsubscribedChats = 0

    for (let page = 0; page < 5; page += 1) {
      const updates = await fetchTelegramUpdates(config.botToken, lastUpdateId + 1)
      if (!updates.length) break

      for (const update of updates) {
        const updateId = Number(update?.update_id) || 0
        if (updateId > lastUpdateId) {
          lastUpdateId = updateId
        }

        const message = getTelegramMessageUpdate(update)
        const chat = message?.chat
        if (!chat) continue

        const chatId = normalizeChatId(chat.id)
        const chatType = cleanText(chat.type) || 'private'
        if (!chatId || chatType !== 'private') continue

        const sender = getTelegramSender(update)
        const action = getSubscriptionAction(message?.text || update?.callback_query?.data || '')
        const isActive = action === 'unsubscribe' ? false : true

        await upsertTelegramSubscriber({
          chatId,
          chatType,
          username: cleanText(sender?.username || chat?.username),
          firstName: cleanText(sender?.first_name || chat?.first_name),
          lastName: cleanText(sender?.last_name || chat?.last_name),
          isActive,
          lastSeenUpdateId: updateId,
        })

        registeredChats += 1

        let freshControlResult = null
        try {
          freshControlResult = await handleTelegramFreshControlUpdate({
            botToken: config.botToken,
            chatId,
            chatType,
            message,
            update,
            action,
            sender,
            updateId,
          })
        } catch (error) {
          console.warn(`TELEGRAM_FRESH_CONTROL_FAILED | chat_id=${chatId} | ${cleanText(error?.message) || 'unknown error'}`)
        }

        if (action === 'subscribe') {
          subscribedChats += 1
          if (!freshControlResult?.skipDefaultAck) {
            await sendTelegramAck(config.botToken, chatId, action)
          }
        } else if (action === 'unsubscribe') {
          unsubscribedChats += 1
          if (!freshControlResult?.skipDefaultAck) {
            await sendTelegramAck(config.botToken, chatId, action)
          }
        }

        processedUpdates += 1
      }

      if (updates.length < TELEGRAM_UPDATE_LIMIT) break
    }

    await setTelegramBotState(lastUpdateId)

    return {
      synced: true,
      processedUpdates,
      registeredChats,
      subscribedChats,
      unsubscribedChats,
      lastUpdateId,
    }
  })()

  try {
    return await telegramSubscriberSyncPromise
  } finally {
    telegramSubscriberSyncPromise = null
    lastTelegramSubscriberSyncAt = Date.now()
  }
}

function normalizeRecipientIds(chatIds = []) {
  return [...new Set(
    (Array.isArray(chatIds) ? chatIds : [chatIds])
      .map((value) => normalizeChatId(value))
      .filter(Boolean),
  )]
}

async function resolveTelegramRecipients(chatIds = null) {
  const config = getTelegramConfig()
  if (!config.enabled) return []

  let explicitRecipientSource = chatIds
  if (typeof explicitRecipientSource === 'function') {
    explicitRecipientSource = await explicitRecipientSource()
  } else if (explicitRecipientSource && typeof explicitRecipientSource.then === 'function') {
    explicitRecipientSource = await explicitRecipientSource
  }

  const explicitRecipients = normalizeRecipientIds(explicitRecipientSource)
  if (explicitRecipients.length) {
    return explicitRecipients
  }

  try {
    await syncTelegramSubscribers()
  } catch (error) {
    console.warn(`TELEGRAM_SUBSCRIBER_SYNC_FAILED | ${cleanText(error?.message) || 'unknown error'}`)
  }

  const recipients = new Set()
  if (config.directChatId) {
    recipients.add(config.directChatId)
  }

  const subscriberIds = await getActiveTelegramRecipientIds()
  for (const chatId of subscriberIds) {
    recipients.add(chatId)
  }

  return [...recipients]
}

async function sendTelegramMessageNow(text, options = {}) {
  const config = getTelegramConfig()
  if (!config.enabled) {
    return { sent: false, skipped: true, reason: 'telegram_not_configured' }
  }

  const recipients = await resolveTelegramRecipients(options.recipientChatIds)
  if (!recipients.length) {
    return { sent: false, skipped: true, reason: 'telegram_no_recipients' }
  }

  const results = []
  for (const chatId of recipients) {
    try {
      const delivery = await sendTelegramMessageToChat(config.botToken, chatId, text)
      await markTelegramDeliverySuccess(chatId)
      results.push(delivery)
    } catch (error) {
      await markTelegramDeliveryFailure(chatId, error)
      results.push({
        sent: false,
        chatId,
        error: cleanText(error?.response?.data?.description || error?.message || 'telegram delivery failed'),
      })
    }
  }

  const sentCount = results.filter((item) => item.sent).length
  const failedCount = results.length - sentCount

  if (!sentCount && failedCount > 0) {
    const aggregateError = new Error(`telegram delivery failed for ${failedCount} recipient(s)`)
    aggregateError.results = results
    throw aggregateError
  }

  return {
    sent: sentCount > 0,
    sentCount,
    failedCount,
    recipients: recipients.length,
    results,
  }
}

export function sendTelegramText(text, options = {}) {
  const normalizedText = String(text || '').trim()
  if (!normalizedText) {
    return Promise.resolve({ sent: false, skipped: true, reason: 'empty_text' })
  }

  telegramQueue = telegramQueue
    .catch(() => null)
    .then(() => sendTelegramMessageNow(normalizedText, options))

  return telegramQueue
}

export function startTelegramSubscriberSync() {
  const config = getTelegramConfig()
  if (!config.enabled) {
    return { started: false, reason: 'telegram_not_configured' }
  }

  if (telegramSubscriberSyncTimer) {
    return { started: false, reason: 'already_started', intervalMs: config.syncIntervalMs }
  }

  const runSync = () => {
    syncTelegramSubscribers({ force: true })
      .then((result) => {
        if (result?.processedUpdates) {
          console.log(
            `TELEGRAM_SUBSCRIBERS_SYNCED | processed=${result.processedUpdates} | chats=${result.registeredChats} | subscribed=${result.subscribedChats} | unsubscribed=${result.unsubscribedChats}`,
          )
        }
      })
      .catch((error) => {
        console.warn(`TELEGRAM_SUBSCRIBER_SYNC_FAILED | ${cleanText(error?.message) || 'unknown error'}`)
      })
  }

  runSync()
  telegramSubscriberSyncTimer = setInterval(runSync, config.syncIntervalMs)
  telegramSubscriberSyncTimer.unref?.()

  return {
    started: true,
    intervalMs: config.syncIntervalMs,
  }
}

function formatChangedFields(changedFields) {
  const labels = Array.isArray(changedFields)
    ? changedFields.map((field) => {
      if (field === 'price_krw') return 'цена KRW'
      if (field === 'price_usd') return 'цена USD'
      if (field === 'vat_refund') return 'возврат VAT'
      if (field === 'total') return 'итоговая стоимость'
      return cleanText(field)
    }).filter(Boolean)
    : []

  return labels.join(', ')
}

export function notifyTelegramNewListing({
  car,
  importedId,
  parseScopeLabel = '',
  runPresetLabel = '',
  notificationMode = 'full',
  recipientChatIds = null,
} = {}) {
  const lines = buildCommonLines({
    tag: 'Новое объявление',
    car,
    importedId,
    parseScopeLabel,
    runPresetLabel,
    notificationMode,
  })

  return sendTelegramText(lines.join('\n'), { recipientChatIds })
}

export function notifyTelegramChangedListing({
  car,
  importedId,
  previousPriceKrw,
  nextPriceKrw,
  changedFields = [],
  parseScopeLabel = '',
  runPresetLabel = '',
  notificationMode = 'full',
  recipientChatIds = null,
} = {}) {
  const lines = buildCommonLines({
    tag: 'Измененное объявление',
    car,
    importedId,
    parseScopeLabel,
    runPresetLabel,
    notificationMode,
  })

  const changedFieldsLabel = formatChangedFields(changedFields)
  if (changedFieldsLabel && notificationMode !== 'fresh_list') {
    lines.splice(2, 0, `Изменения: ${changedFieldsLabel}`)
  }

  const previousLine = formatKrw(previousPriceKrw)
  const nextLine = formatKrw(nextPriceKrw)
  if (previousLine || nextLine) {
    const priceDiffLine = `Цена: ${previousLine || '-'} -> ${nextLine || '-'}`
    if (notificationMode === 'fresh_list') {
      if (lines.length >= 2) {
        lines[1] = priceDiffLine
      } else {
        lines.push(priceDiffLine)
      }
    } else {
      lines.splice(3, 0, priceDiffLine)
    }
  }

  return sendTelegramText(lines.join('\n'), { recipientChatIds })
}

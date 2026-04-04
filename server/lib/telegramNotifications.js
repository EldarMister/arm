import axios from 'axios'
import dotenv from 'dotenv'

const DEFAULT_SITE_URL = 'https://avt-autovtrade.com'
const TELEGRAM_API_BASE = 'https://api.telegram.org'
const TELEGRAM_TIMEOUT_MS = 15000

dotenv.config()

let telegramQueue = Promise.resolve()

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function readEnv() {
  return globalThis.process?.env || {}
}

function getTelegramConfig() {
  const env = readEnv()
  const botToken = cleanText(env.TELEGRAM_BOT_TOKEN)
  const chatId = cleanText(env.TELEGRAM_CHAT_ID)
  const siteUrl = cleanText(
    env.PUBLIC_SITE_URL
    || env.SITE_URL
    || env.BASE_URL
    || DEFAULT_SITE_URL,
  ).replace(/\/+$/, '')

  return {
    enabled: Boolean(botToken && chatId),
    botToken,
    chatId,
    siteUrl: siteUrl || DEFAULT_SITE_URL,
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

async function sendTelegramMessageNow(text) {
  const config = getTelegramConfig()
  if (!config.enabled) {
    return { sent: false, skipped: true, reason: 'telegram_not_configured' }
  }

  const response = await axios.post(
    `${TELEGRAM_API_BASE}/bot${config.botToken}/sendMessage`,
    {
      chat_id: config.chatId,
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
  }
}

export function sendTelegramText(text) {
  const normalizedText = String(text || '').trim()
  if (!normalizedText) {
    return Promise.resolve({ sent: false, skipped: true, reason: 'empty_text' })
  }

  telegramQueue = telegramQueue
    .catch(() => null)
    .then(() => sendTelegramMessageNow(normalizedText))

  return telegramQueue
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
} = {}) {
  const lines = buildCommonLines({
    tag: 'Новое объявление',
    car,
    importedId,
    parseScopeLabel,
    runPresetLabel,
    notificationMode,
  })

  return sendTelegramText(lines.join('\n'))
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

  return sendTelegramText(lines.join('\n'))
}

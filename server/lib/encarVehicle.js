import axios from 'axios'
import { fetchEncarInspection } from './encarInspection.js'
import {
  buildEncarSourceDiagnostic,
  buildEncarSourceFailureSummary,
  decorateEncarSourceError,
  fetchViaEncarProxy,
  getPreferredEncarSource,
  hasEncarProxy,
  isEncarProxySuppressed,
  rememberHealthyEncarSource,
  shouldRetryViaAlternateEncarSource,
  suppressEncarProxy,
} from './encarSource.js'
import { computePricing, getExchangeRateSnapshot } from './exchangeRate.js'
import { getPricingSettings, resolveVehicleFees } from './pricingSettings.js'
import {
  appendTitleTrimSuffix,
  collectKeyCounts,
  detectKeyType,
  hasInteriorColorContext,
  hasKeyContext,
  hasNegativeKeyContext,
  hasPositiveKeyContext,
  isInteriorColorLabel,
  isInteriorColorRejectLabel,
  PARKING_ADDRESS_EN,
  PARKING_ADDRESS_KO,
  extractDriveFromPairs,
  extractKeyInfo,
  extractInteriorColorFromPairs,
  extractInteriorColorFromText,
  extractShortLocation,
  extractOptionFeatures,
  extractTrimLevelFromTitle,
  inferDrive,
  normalizeColorName,
  normalizeDrive,
  normalizeFuel,
  normalizeInteriorColorName,
  resolveManufacturerDisplayName,
  normalizeManufacturer,
  normalizeText,
  resolveBodyType,
  resolveVehicleClass,
  normalizeTransmission,
  normalizeTrimLevel,
} from './vehicleData.js'
import { resolveEncarOptionTexts } from './encarOptionDictionary.js'
import { sanitizeVin } from './vin.js'

const apiClient = axios.create({
  baseURL: 'https://api.encar.com',
  timeout: 20000,
  proxy: false,
  headers: {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    Origin: 'https://www.encar.com',
    Referer: 'https://www.encar.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  },
})

const femDetailClient = axios.create({
  baseURL: 'https://fem.encar.com',
  timeout: 20000,
  proxy: false,
  headers: {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    Referer: 'https://www.encar.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  },
})

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function decodeHtmlEntities(value) {
  return String(value || '').replace(/&(nbsp|amp|quot|lt|gt);|&#39;/gi, (match) => HTML_ENTITY_MAP[match] || match)
}

function stripHtmlTags(value) {
  return cleanText(
    decodeHtmlEntities(String(value || ''))
      .replace(HTML_COMMENT_RE, ' ')
      .replace(HTML_TAG_RE, ' '),
  )
}

function createVehicleDataError(message, meta = {}) {
  const error = new Error(message)
  error.encarDiagnostic = meta
  return error
}

function parsePreloadedState(html) {
  const marker = '__PRELOADED_STATE__ = '
  const start = html.indexOf(marker)
  if (start < 0) return null

  const end = html.indexOf('</script>', start)
  if (end < 0) return null

  const raw = html
    .slice(start + marker.length, end)
    .trim()
    .replace(/;\s*$/, '')

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function extractVehicleDataFromState(state) {
  return (
    state?.carInfo?.car
    || state?.cars?.base
    || state?.saleCar?.car
    || state?.cars?.detailServerDriven?.result
    || null
  )
}

function buildVehicleApiShape(data, source) {
  if (!data || typeof data !== 'object') {
    throw createVehicleDataError('Empty detail payload', {
      reason: String(source || '').includes('html_preloaded_state') ? 'detail_parse_failed' : 'detail_empty_payload',
      temporary: true,
      retryable: true,
      details: 'detail payload is empty',
    })
  }

  return {
    url: `https://fem.encar.com/cars/detail/${data?.vehicleId || data?.queryCarId || ''}`.replace(/\/$/, ''),
    data,
    category: data?.category || {},
    spec: data?.spec || {},
    ad: data?.advertisement || {},
    contact: data?.contact || {},
    manage: data?.manage || {},
    condition: data?.condition || {},
    contents: data?.contents || {},
    view: data?.view || {},
    partnership: data?.partnership || {},
    options: data?.options || {},
    html: '',
    preloadedState: null,
    source,
  }
}

async function fetchEncarVehicleApiPayload(encarId) {
  const { data } = await apiClient.get(`/v1/readside/vehicle/${encodeURIComponent(encarId)}`)
  return buildVehicleApiShape(data, 'api')
}

async function fetchEncarVehicleProxyPayload(encarId) {
  const data = await fetchViaEncarProxy(
    {
      endpoint: 'vehicle',
      id: encarId,
    },
    {
      timeout: 25000,
    },
  )

  return buildVehicleApiShape(data, 'proxy_api')
}

function parseEncarVehicleHtmlPayload(rawHtml, encarId, { source = 'html_preloaded_state', sourceUrl = '' } = {}) {
  const html = String(rawHtml || '')
  const fallbackSourceUrl = sourceUrl || `https://fem.encar.com/cars/detail/${encodeURIComponent(encarId)}`

  if (!cleanText(html)) {
    throw createVehicleDataError('Detail HTML is empty', {
      reason: 'detail_empty_html',
      temporary: true,
      retryable: true,
      details: `empty response from ${fallbackSourceUrl}`,
    })
  }

  const canonicalMatch = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i)
  const canonicalUrl = cleanText(canonicalMatch?.[1] || '')
  if (/\bindex(?:\.do)?\b/i.test(canonicalUrl)) {
    throw createVehicleDataError('Detail page redirected to index shell', {
      reason: 'detail_index_shell',
      temporary: true,
      retryable: true,
      details: canonicalUrl || 'canonical points to index',
    })
  }

  const state = parsePreloadedState(html)
  if (!state) {
    throw createVehicleDataError('Missing __PRELOADED_STATE__ in detail HTML', {
      reason: 'detail_preloaded_state_missing',
      temporary: true,
      retryable: true,
      details: `missing __PRELOADED_STATE__ for ${encarId}`,
    })
  }

  const data = extractVehicleDataFromState(state)
  if (!data) {
    throw createVehicleDataError('Failed to extract car object from __PRELOADED_STATE__', {
      reason: 'detail_parse_failed',
      temporary: true,
      retryable: true,
      details: 'car object missing in __PRELOADED_STATE__',
    })
  }

  const shaped = buildVehicleApiShape(data, 'html_preloaded_state')
  return {
    ...shaped,
    source,
    html,
    preloadedState: state,
    url: canonicalUrl || fallbackSourceUrl,
  }
}

async function fetchEncarVehicleHtmlPayload(encarId) {
  const url = `/cars/detail/${encodeURIComponent(encarId)}`
  const response = await femDetailClient.get(url)
  return parseEncarVehicleHtmlPayload(response.data, encarId, {
    source: 'html_preloaded_state',
    sourceUrl: `https://fem.encar.com${url}`,
  })
}

async function fetchEncarVehicleProxyHtmlPayload(encarId) {
  const html = await fetchViaEncarProxy(
    {
      endpoint: 'detail-html',
      id: encarId,
    },
    {
      timeout: 25000,
      responseType: 'text',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    },
  )

  return parseEncarVehicleHtmlPayload(html, encarId, {
    source: 'proxy_html_preloaded_state',
    sourceUrl: `https://fem.encar.com/cars/detail/${encodeURIComponent(encarId)}`,
  })
}

function getVehiclePayloadFetchers(encarId, { allowSuppressedProxyProbe = false } = {}) {
  const fetchers = [
    {
      name: 'direct_api',
      source: 'direct',
      run: () => fetchEncarVehicleApiPayload(encarId),
    },
  ]

  if (hasEncarProxy() && (!isEncarProxySuppressed() || allowSuppressedProxyProbe)) {
    fetchers.push({
      name: 'proxy_api',
      source: 'proxy',
      run: () => fetchEncarVehicleProxyPayload(encarId),
    })
  }

  fetchers.push({
    name: 'direct_html',
    source: 'direct',
    run: () => fetchEncarVehicleHtmlPayload(encarId),
  })

  if (hasEncarProxy() && (!isEncarProxySuppressed() || allowSuppressedProxyProbe)) {
    fetchers.push({
      name: 'proxy_html',
      source: 'proxy',
      run: () => fetchEncarVehicleProxyHtmlPayload(encarId),
    })
  }

  return fetchers
}

const VEHICLE_PAYLOAD_CACHE_TTL_MS = 5 * 60 * 1000
const VEHICLE_PAYLOAD_CACHE_LIMIT = 250
const vehiclePayloadCache = new Map()
const vehiclePayloadInFlight = new Map()
const ENRICHMENT_TARGET_KEYS = ['vin', 'interiorColor', 'keyInfo', 'driveType', 'optionFeatures']

function getVehiclePayloadCacheKey(encarId) {
  return String(encarId || '').trim()
}

function pruneVehiclePayloadCache(now = Date.now()) {
  for (const [key, entry] of vehiclePayloadCache.entries()) {
    if (!entry || Number(entry.expiresAt) <= now) {
      vehiclePayloadCache.delete(key)
    }
  }

  if (vehiclePayloadCache.size <= VEHICLE_PAYLOAD_CACHE_LIMIT) return

  const staleKeys = [...vehiclePayloadCache.entries()]
    .sort((left, right) => (Number(left[1]?.storedAt) || 0) - (Number(right[1]?.storedAt) || 0))
    .slice(0, vehiclePayloadCache.size - VEHICLE_PAYLOAD_CACHE_LIMIT)
    .map(([key]) => key)

  for (const key of staleKeys) {
    vehiclePayloadCache.delete(key)
  }
}

function readCachedVehiclePayload(encarId) {
  const key = getVehiclePayloadCacheKey(encarId)
  if (!key) return null

  pruneVehiclePayloadCache()
  const cached = vehiclePayloadCache.get(key)
  if (!cached || Number(cached.expiresAt) <= Date.now()) {
    vehiclePayloadCache.delete(key)
    return null
  }

  return cached.value
}

function rememberVehiclePayload(encarId, payload) {
  const key = getVehiclePayloadCacheKey(encarId)
  if (!key || !payload) return

  const now = Date.now()
  vehiclePayloadCache.set(key, {
    value: payload,
    storedAt: now,
    expiresAt: now + VEHICLE_PAYLOAD_CACHE_TTL_MS,
  })
  pruneVehiclePayloadCache(now)
}

function createSkippedEvidenceResult() {
  return {
    value: '',
    source: '',
    diagnostics: [],
  }
}

function normalizeEnrichmentTargets(targets, { includeInspection = false } = {}) {
  if (!targets || typeof targets !== 'object') {
    return {
      vin: true,
      interiorColor: true,
      keyInfo: true,
      driveType: true,
      optionFeatures: true,
      includeInspection: Boolean(includeInspection),
    }
  }

  const normalized = {
    vin: false,
    interiorColor: false,
    keyInfo: false,
    driveType: false,
    optionFeatures: false,
    includeInspection: Boolean(includeInspection),
  }

  for (const key of ENRICHMENT_TARGET_KEYS) {
    if (Object.prototype.hasOwnProperty.call(targets, key)) {
      normalized[key] = Boolean(targets[key])
    }
  }

  return normalized
}

function shouldLoadOptionTexts(targets) {
  return Boolean(targets?.optionFeatures || targets?.keyInfo || targets?.driveType || targets?.interiorColor)
}

async function fetchEncarVehicleApiData(encarId) {
  const cacheKey = getVehiclePayloadCacheKey(encarId)
  const cachedPayload = readCachedVehiclePayload(cacheKey)
  if (cachedPayload) return cachedPayload
  if (vehiclePayloadInFlight.has(cacheKey)) return vehiclePayloadInFlight.get(cacheKey)

  const request = (async () => {
  const preferredSource = hasEncarProxy() && !isEncarProxySuppressed()
    ? getPreferredEncarSource('detail')
    : 'direct'
  const sourceDiagnostics = []
  const fetchers = getVehiclePayloadFetchers(encarId)
  const orderedFetchers = [
    ...fetchers.filter((fetcher) => fetcher.source === preferredSource),
    ...fetchers.filter((fetcher) => fetcher.source !== preferredSource),
  ]

  let lastError = null

  for (const fetcher of orderedFetchers) {
    try {
      const payload = await fetcher.run()
      rememberHealthyEncarSource('detail', fetcher.source)
      rememberVehiclePayload(cacheKey, payload)
      return payload
    } catch (error) {
      const status = Number(error?.response?.status) || Number(error?.encarDiagnostic?.httpStatus) || 0
      if (fetcher.source === 'proxy') {
        suppressEncarProxy(status)
      }

      sourceDiagnostics.push(buildEncarSourceDiagnostic(fetcher.name, error))
      lastError = error

      if (status === 404 && fetcher.name === 'direct_api') {
        break
      }
    }
  }

  if (
    hasEncarProxy()
    && isEncarProxySuppressed()
    && !orderedFetchers.some((fetcher) => fetcher.source === 'proxy')
    && shouldRetryViaAlternateEncarSource(lastError)
  ) {
    for (const fetcher of getVehiclePayloadFetchers(encarId, { allowSuppressedProxyProbe: true }).filter((item) => item.source === 'proxy')) {
      try {
        const payload = await fetcher.run()
        rememberHealthyEncarSource('detail', 'proxy')
        rememberVehiclePayload(cacheKey, payload)
        return payload
      } catch (error) {
        suppressEncarProxy(Number(error?.response?.status) || Number(error?.encarDiagnostic?.httpStatus) || 0)
        sourceDiagnostics.push(buildEncarSourceDiagnostic(fetcher.name, error, 'suppressed_probe'))
        lastError = error
      }
    }
  }

  if (lastError) {
    lastError.fetchSourceDiagnostics = sourceDiagnostics
    const failureSummary = buildEncarSourceFailureSummary(sourceDiagnostics)

    if (lastError?.encarDiagnostic) {
      lastError.encarDiagnostic = {
        ...lastError.encarDiagnostic,
        sourceFailures: sourceDiagnostics,
        details: [cleanText(lastError.encarDiagnostic.details), failureSummary].filter(Boolean).join(' | '),
      }
    } else {
      const status = Number(lastError?.response?.status) || 0
      lastError.encarDiagnostic = {
        reason: status === 404 ? 'detail_not_found' : status ? 'detail_fetch_failed' : 'detail_network_error',
        temporary: status !== 404,
        retryable: status !== 404,
        httpStatus: status || null,
        details: [cleanText(lastError.message), failureSummary].filter(Boolean).join(' | '),
        sourceFailures: sourceDiagnostics,
      }
    }

    decorateEncarSourceError(lastError, 'detail')
  }

  throw lastError || new Error(`Failed to fetch Encar detail for ${encarId}`)
  })()

  vehiclePayloadInFlight.set(cacheKey, request)
  try {
    return await request
  } finally {
    vehiclePayloadInFlight.delete(cacheKey)
  }
}

function toAbsolutePhotoUrl(path) {
  if (!path) return null
  if (/^https?:\/\//i.test(path)) return path
  return `https://ci.encar.com${path.startsWith('/') ? '' : '/'}${path}`
}

function extractInteriorColorFromSpec(spec = {}) {
  const customColor = spec?.customColor
  if (customColor && typeof customColor === 'object' && !Array.isArray(customColor)) {
    return (
      customColor.interiorColorName ||
      customColor.interiorColor ||
      customColor.innerColorName ||
      customColor.innerColor ||
      customColor.seatColorName ||
      customColor.seatColor ||
      customColor.trimColorName ||
      customColor.trimColor ||
      ''
    )
  }

  return (
    spec?.interiorColorName ||
    spec?.interiorColor ||
    spec?.innerColorName ||
    spec?.innerColor ||
    spec?.trimColorName ||
    spec?.trimColor ||
    spec?.seatColorName ||
    spec?.seatColor ||
    ''
  )
}

function normalizeWarrantyMetric(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null
}

function buildWarrantyTerm(monthValue, mileageValue) {
  const months = normalizeWarrantyMetric(monthValue)
  const mileage = normalizeWarrantyMetric(mileageValue)
  if (!months && !mileage) return null

  return {
    months,
    mileage,
  }
}

export function extractWarrantyInfo(category = {}) {
  const warranty = category?.warranty
  if (!warranty || typeof warranty !== 'object' || Array.isArray(warranty)) {
    return null
  }

  const body = buildWarrantyTerm(warranty.bodyMonth, warranty.bodyMileage)
  const transmission = buildWarrantyTerm(warranty.transmissionMonth, warranty.transmissionMileage)
  if (!body && !transmission) {
    return null
  }

  return {
    provider: cleanText(warranty.companyName || ''),
    userDefined: Boolean(warranty.userDefined),
    body,
    transmission,
    source: 'category.warranty',
  }
}

function buildInspectionPairs(inspection) {
  if (!inspection) return []

  const basicPairs = Array.isArray(inspection?.basicInfo?.items)
    ? inspection.basicInfo.items.map((item) => ({ label: item?.label, value: item?.value }))
    : []
  const summaryPairs = Array.isArray(inspection?.summary)
    ? inspection.summary.map((row) => ({
        label: row?.label,
        value: [row?.detail, ...(row?.states || []), row?.amount, row?.note].filter(Boolean).join(' '),
      }))
    : []
  const detailPairs = Array.isArray(inspection?.detailStatus)
    ? inspection.detailStatus.map((row) => ({
        label: [row?.section, row?.label].filter(Boolean).join(' / '),
        value: [row?.detail, ...(row?.states || []), row?.amount, row?.note].filter(Boolean).join(' '),
      }))
    : []
  const historyPairs = inspection?.vehicleHistory
    ? [
        ...Object.entries(inspection.vehicleHistory.overview || {}).map(([label, value]) => ({ label, value })),
        ...Object.entries(inspection.vehicleHistory.statistics || {}).map(([label, value]) => ({ label, value })),
      ]
    : []

  return [...basicPairs, ...summaryPairs, ...detailPairs, ...historyPairs]
}

function collectObjectValuesByKeyPattern(input = {}, keyPattern = /.*/) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return []

  const values = []
  for (const [key, value] of Object.entries(input)) {
    if (!keyPattern.test(key)) continue

    if (typeof value === 'string' || typeof value === 'number') {
      const text = cleanText(value)
      if (text) values.push(text)
      continue
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) continue

    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      if (!keyPattern.test(`${key}.${nestedKey}`)) continue
      const text = cleanText(nestedValue)
      if (text) values.push(text)
    }
  }

  return values
}

function looksLikeFreeformOptionText(value) {
  const text = cleanText(value)
  if (!text || text.length < 2) return false
  if (/^\d+$/.test(text)) return false
  if (!/[\p{L}]/u.test(text)) return false
  if (text.length <= 8 && /^[A-Z0-9 _-]+$/.test(text)) return false
  return true
}

function collectFreeformOptionTexts(options = {}, pathPrefix = 'options') {
  if (!options || typeof options !== 'object') return []

  const texts = []
  for (const [bucketKey, bucketValue] of Object.entries(options)) {
    if (!Array.isArray(bucketValue)) continue

    bucketValue.forEach((item, index) => {
      const text = cleanText(item)
      if (!looksLikeFreeformOptionText(text)) return
      texts.push({
        path: `${pathPrefix}.${bucketKey}[${index}]`,
        text,
      })
    })
  }

  return texts
}

const MAX_STRUCTURED_SCAN_DEPTH = 8
const MAX_STRUCTURED_ARRAY_ITEMS = 60
const TWO_TONE_INTERIOR_COLOR = '\u0414\u0432\u0443\u0445\u0446\u0432\u0435\u0442\u043d\u044b\u0439'
const SKIPPED_STRUCTURED_PATH_RE = /(?:^|\.)(?:photos?|images?|img|url|path|thumbnail|thumb|video|icon|logo|banner)(?:$|\.|\[)/i
const VIN_EXPLICIT_KEY_RE = /(?:\bvin\b|\bchassis(?:\s*number)?\b|\bvehicle\s*identification(?:\s*number)?\b|\bframe(?:\s*number)?\b|\uCC28\uB300\uBC88\uD638)/i
const VIN_CONTEXT_LABEL_RE = /(?:\bvin\b|\bchassis(?:\s*number)?\b|\bvehicle(?:\s*identification)?\s*number\b|\bframe(?:\s*number)?\b|\uCC28\uB300\uBC88\uD638)/i
const VIN_REJECT_KEY_RE = /(?:vehicle\s*(?:no|number)\b|car\s*(?:no|number)\b|registration\b|plate\b|encar\s*id\b|listing\s*id\b|query\s*car\s*id\b|engine\s*code\b|grade\s*code\b|model\s*code\b|stock\s*(?:no|number)?\b|\uCC28\uB7C9\s*(?:\uBC88\uD638|no))/i
const VIN_INLINE_CAPTURE_RE = /(?:vin|chassis(?:\s*number)?|vehicle(?:\s*identification)?\s*number|frame(?:\s*number)?|\uCC28\uB300\uBC88\uD638)\s*[:#=-]?\s*([a-z0-9*?/_:-\s]{8,40})/ig
const VIN_EMBEDDED_RE = /\b[A-HJ-NPR-Z0-9]{17}\b/g
const VIN_MASK_HINT_RE = /[*?#]/
const INTERIOR_KEY_CONTEXT_RE = /(?:\b(?:interior|inner|seat|trim|upholstery|cabin|cockpit)\b.*\b(?:color|colour)\b|\b(?:color|colour)\b.*\b(?:interior|inner|seat|trim|upholstery|cabin|cockpit)\b|\b(?:naejang|inteorieo|silnae)\b)/i
const INTERIOR_KEY_REJECT_RE = /(?:\b(?:body|exterior|paint|outer)\b.*\b(?:color|colour)\b|\b(?:color|colour)\b.*\b(?:body|exterior|paint|outer)\b|\b(?:oejang|chaeche)\b)/i
const INTERIOR_MARKETING_RE = /\b(?:package|selection|edition|design|style|premium|luxury|comfort|mood|line)\b/i
const INTERIOR_MATERIAL_ONLY_RE = /^(?:\b(?:leather|nappa|alcantara|suede|quilted|perforated|premium|natural|seat(?:s)?|interior|trim|upholstery|headliner|door\s*trim)\b|(?:\uAC00\uC8FD|\uB098\uD30C|\uC2DC\uD2B8|\uB0B4\uC7A5|\uC778\uD14C\uB9AC\uC5B4))(?:[\s/+,&-]+(?:\b(?:leather|nappa|alcantara|suede|quilted|perforated|premium|natural|seat(?:s)?|interior|trim|upholstery|headliner|door\s*trim)\b|(?:\uAC00\uC8FD|\uB098\uD30C|\uC2DC\uD2B8|\uB0B4\uC7A5|\uC778\uD14C\uB9AC\uC5B4)))*$/i
const INTERIOR_COLOR_TOKEN_RE = /(?:\b(?:black|white|beige|brown|gray|grey|red|blue|green|orange|yellow|ivory|cream|burgundy|wine|tan|camel|caramel|cognac|charcoal|graphite|two[-\s]*tone|bi[-\s]*tone|dual[-\s]*tone)\b|(?:\uBE14\uB799|\uAC80\uC815|\uD751\uC0C9|\uD654\uC774\uD2B8|\uD770\uC0C9|\uBC31\uC0C9|\uBCA0\uC774\uC9C0|\uBE0C\uB77C\uC6B4|\uADF8\uB808\uC774|\uD68C\uC0C9|\uB808\uB4DC|\uC801\uC0C9|\uB124\uC774\uBE44|\uCCAD\uC0C9|\uADF8\uB9B0|\uC624\uB80C\uC9C0|\uC544\uC774\uBCF4\uB9AC|\uD06C\uB9BC|\uBC84\uAC74\uB514|\uC640\uC778|\uCE74\uBA5C|\uCE90\uB7EC\uBA5C|\uCF54\uB0D1|\uCC28\uCF5C|\uADF8\uB798\uD53C\uD2B8|\uD22C\uD1A4))/i
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g
const HTML_TAG_RE = /<[^>]+>/g
const HTML_ENTITY_MAP = Object.freeze({
  '&nbsp;': ' ',
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': '\'',
  '&lt;': '<',
  '&gt;': '>',
})
const HTML_PAIR_RE = /<(?:li|tr)[^>]*>\s*<(?:p|th|dt)[^>]*>([\s\S]*?)<\/(?:p|th|dt)>\s*<(?:p|td|dd)[^>]*>([\s\S]*?)<\/(?:p|td|dd)>\s*<\/(?:li|tr)>/gi
const HTML_BLIND_STATE_RE = /<li[^>]*>([\s\S]*?)<span[^>]*class="[^"]*\bblind\b[^"]*"[^>]*>([\s\S]*?)<\/span>\s*<\/li>/gi
const KEY_EXPLICIT_LABEL_RE = /(?:\b(?:key(?:\s*count)?|smart\s*key|smartkey|card\s*key|key\s*card|electronic\s*key|digital\s*key|flip\s*key|switchblade\s*key|fold(?:ing)?\s*key|remote\s*key|distance\s*key|mechanical\s*key|metal\s*key|standard\s*key|regular\s*key|plain\s*key)\b|\uCC28\uB7C9\s*\uD0A4\s*\uAC1C\uC218|\uD0A4\s*(?:\uAC1C\uC218|\uC218\uB7C9)|\uC2A4\uB9C8\uD2B8\s*\uD0A4|\uCE74\uB4DC\s*\uD0A4|\uC804\uC790\s*\uD0A4|\uD3F4\uB529\s*\uD0A4|\uB9AC\uBAA8\uCEE8\s*\uD0A4|\uB9AC\uBAA8\uCF58\s*\uD0A4|\uC77C\uBC18\s*\uD0A4|\uAE30\uBCF8\s*\uD0A4|\uCC28\uD0A4)/i
const KEY_EXPLICIT_PATH_RE = /(?:\b(?:smart\s*key|smartkey|card\s*key|key\s*card|electronic\s*key|digital\s*key|flip\s*key|switchblade\s*key|fold(?:ing)?\s*key|remote\s*key|distance\s*key|mechanical\s*key|metal\s*key|standard\s*key|regular\s*key|plain\s*key|key\s*count|number\s*of\s*keys)\b|\uCC28\uB7C9\s*\uD0A4\s*\uAC1C\uC218|\uD0A4\s*(?:\uAC1C\uC218|\uC218\uB7C9)|\uC2A4\uB9C8\uD2B8\s*\uD0A4|\uCE74\uB4DC\s*\uD0A4|\uC804\uC790\s*\uD0A4|\uD3F4\uB529\s*\uD0A4|\uB9AC\uBAA8\uCEE8\s*\uD0A4|\uB9AC\uBAA8\uCF58\s*\uD0A4|\uC77C\uBC18\s*\uD0A4|\uAE30\uBCF8\s*\uD0A4|\uCC28\uD0A4)/i
const KEY_COUNT_LABEL_RE = /(?:\b(?:number\s*of\s*keys|key\s*count)\b|\uCC28\uB7C9\s*\uD0A4\s*\uAC1C\uC218|\uD0A4\s*(?:\uAC1C\uC218|\uC218\uB7C9))/i
const DRIVE_KEY_CONTEXT_RE = /(?:\b(?:drive|drivetrain|traction|wheel\s*drive|drive\s*type)\b|\uAD6C\uB3D9(?:\uBC29\uC2DD)?|\uB3D9\uB825\uC804\uB2EC)/i
const DRIVE_TITLE_LABEL_RE = /(?:\b(?:name|title|vehicle\s*name|model\s*name|grade(?:\s*name)?|trim(?:\s*name)?)\b|\uC81C\uBAA9|\uCC28\uB7C9\uBA85|\uCC28\uBA85|\uBAA8\uB378\uBA85|Название)/i
const DRIVE_UNAMBIGUOUS_SIGNAL_RE = /(?:\b(?:awd|4wd|4x4|fwd|rwd|ff|fr|all4|quattro|q4|4matic\+?|4motion|allrad|syncro|sh-awd|e-awd|e-?4wd|e[-\s]*four|e-?4orce|4xe|htrac|xdrive(?:[a-z0-9]+)?)\b|(?:\uC0C1\uC2DC\s*\uC0AC\uB95C(?:\s*\uAD6C\uB3D9)?|\uC804\uCCB4\s*\uAD6C\uB3D9|\uC804\uB95C(?:\s*\uAD6C\uB3D9)?|\uD6C4\uB95C(?:\s*\uAD6C\uB3D9)?|\uC0AC\uB95C(?:\s*\uAD6C\uB3D9)?))/i
const DRIVE_AMBIGUOUS_SIGNAL_RE = /(?:\b2wd\b|\uC774\uB95C(?:\s*\uAD6C\uB3D9)?|\u0032\uB95C(?:\s*\uAD6C\uB3D9)?)/i
const CANONICAL_DRIVE_TYPES = new Set(['Передний (FWD)', 'Задний (RWD)', 'Полный (AWD)', 'Полный (4WD)'])
const WEAK_KEY_INFO_VALUES = new Set([
  'Ключи есть',
  'Есть запасной ключ',
  'Пульт-ключ',
  'Карта-ключ',
  'Ключ-карта',
])

function normalizePathSignal(value) {
  return cleanText(
    String(value || '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_.[\]-]+/g, ' '),
  ).toLowerCase()
}

function createDiagnosticEntry({
  field,
  source,
  found,
  value = '',
  reason = '',
  path_or_label = '',
  priority = null,
  confidence = null,
  normalization_notes = [],
  candidate_count = undefined,
}) {
  const entry = {
    field,
    source: cleanText(source) || 'unknown',
    found: Boolean(found),
    reason: cleanText(reason) || (found ? 'selected' : 'not_present'),
  }

  if (cleanText(value)) entry.value = cleanText(value)
  if (cleanText(path_or_label)) entry.path_or_label = cleanText(path_or_label)
  if (Number.isFinite(priority)) entry.priority = priority
  if (typeof confidence === 'number' && Number.isFinite(confidence)) entry.confidence = Number(confidence.toFixed(3))
  if (Array.isArray(normalization_notes) && normalization_notes.length) {
    entry.normalization_notes = [...new Set(normalization_notes.map((item) => cleanText(item)).filter(Boolean))]
  }
  if (Number.isFinite(candidate_count)) entry.candidate_count = candidate_count

  return entry
}

function pushUniqueDiagnostic(target, entry) {
  if (!entry) return
  const signature = JSON.stringify(entry)
  if (target.some((item) => JSON.stringify(item) === signature)) return
  target.push(entry)
}

function pushUniquePair(target, pair) {
  if (!pair?.label || !pair?.value) return
  const signature = `${pair.source}::${pair.path_or_label}::${pair.label}::${pair.value}`
  if (target.some((item) => `${item.source}::${item.path_or_label}::${item.label}::${item.value}` === signature)) return
  target.push(pair)
}

function extractHtmlStructuredPairs(html, source = 'html-structured') {
  const pairs = []
  const rawHtml = String(html || '')
  if (!cleanText(rawHtml)) return pairs

  const listPairRe = new RegExp(HTML_PAIR_RE.source, 'gi')
  let match
  while ((match = listPairRe.exec(rawHtml))) {
    const label = stripHtmlTags(match[1])
    const value = stripHtmlTags(match[2])
    if (!label || !value || label.length > 80 || value.length > 160) continue
    pushUniquePair(pairs, {
      source,
      label,
      value,
      path_or_label: label,
    })
  }

  const blindStateRe = new RegExp(HTML_BLIND_STATE_RE.source, 'gi')
  while ((match = blindStateRe.exec(rawHtml))) {
    const label = stripHtmlTags(match[1])
      .replace(/\s+/g, ' ')
      .replace(/[:\-–]+$/g, '')
      .trim()
    const value = stripHtmlTags(match[2])
    if (!label || !value || label.length > 80 || value.length > 60) continue
    pushUniquePair(pairs, {
      source,
      label,
      value,
      path_or_label: label,
    })
  }

  return pairs
}

function formatKeyInfoValue(keyType = '', keyCount = '') {
  const normalizedType = cleanText(keyType)
  const normalizedCount = cleanText(keyCount)
  if (normalizedType && normalizedCount) return `${normalizedType}: ${normalizedCount} шт.`
  if (normalizedType) return normalizedType
  if (normalizedCount) return `Ключи: ${normalizedCount} шт.`
  return ''
}

function getKeySpecificity(candidate = {}) {
  if (candidate.keyType && candidate.keyCount) return 3
  if (candidate.keyType) return 2
  if (candidate.keyCount) return 1
  return 0
}

function classifyKeyRejectReason(rawValue, label = '') {
  const raw = cleanText(rawValue)
  const normalizedLabel = cleanText(label)
  const combined = cleanText([normalizedLabel, raw].filter(Boolean).join(' '))

  if (!combined) return 'not_present'
  if (!hasKeyContext(combined) && !KEY_EXPLICIT_LABEL_RE.test(normalizedLabel)) return 'context_missing'
  if (hasNegativeKeyContext(combined)) return 'negative_context'
  if (KEY_COUNT_LABEL_RE.test(combined)) return /\d/.test(combined) ? 'invalid_count' : 'invalid_value'
  if (hasPositiveKeyContext(combined)) return 'invalid_value'
  return 'invalid_value'
}

function buildKeyCandidate(rawValue, options = {}) {
  const raw = cleanText(rawValue)
  const label = cleanText(options.label)
  const combined = cleanText([label, raw].filter(Boolean).join(': '))
  if (hasNegativeKeyContext(combined || raw)) {
    const rejected = buildEvidenceCandidate({
      field: 'key_info',
      source: options.source,
      priority: options.priority,
      confidence: options.confidence,
      rawValue: combined || raw,
      path_or_label: options.path_or_label || label,
      reject_reason: 'negative_context',
    })
    rejected.keyType = ''
    rejected.keyCount = ''
    rejected.keyTypes = []
    rejected.keyCounts = []
    rejected.specificity = 0
    return rejected
  }

  const signals = [...new Set([combined, raw, label].map((value) => cleanText(value)).filter(Boolean))]
  const keyTypes = [...new Set(signals.map((value) => detectKeyType(value)).filter(Boolean))]
  const keyCounts = collectKeyCounts(signals)
  const keyType = keyTypes.length === 1 ? keyTypes[0] : ''
  const keyCount = keyCounts.length === 1 ? keyCounts[0] : ''
  const normalizationNotes = []

  if (keyTypes.length > 1) normalizationNotes.push('multiple_key_types')
  if (keyCounts.length > 1) normalizationNotes.push('multiple_key_counts')

  const candidate = buildEvidenceCandidate({
    field: 'key_info',
    source: options.source,
    priority: options.priority,
    confidence: options.confidence,
    value: formatKeyInfoValue(keyType, keyCount),
    rawValue: combined || raw,
    path_or_label: options.path_or_label || label,
    normalization_notes: normalizationNotes,
    reject_reason: '',
  })

  candidate.keyType = keyType
  candidate.keyCount = keyCount
  candidate.keyTypes = keyTypes
  candidate.keyCounts = keyCounts
  candidate.specificity = getKeySpecificity(candidate)

  if (!candidate.value) {
    candidate.reject_reason = classifyKeyRejectReason(raw, label)
  }

  return candidate
}

function finalizeKeyInfoResolution(candidates = [], baseDiagnostics = []) {
  const diagnostics = [...baseDiagnostics]
  const accepted = candidates
    .filter((candidate) => candidate.value && !candidate.reject_reason)
    .sort((a, b) => (
      b.priority - a.priority
      || (b.specificity || 0) - (a.specificity || 0)
      || b.confidence - a.confidence
      || a.path_or_label.localeCompare(b.path_or_label)
    ))

  for (const candidate of candidates.filter((item) => item.reject_reason)) {
    pushUniqueDiagnostic(diagnostics, createDiagnosticEntry({
      field: 'key_info',
      source: candidate.source,
      found: false,
      value: candidate.rawValue,
      reason: candidate.reject_reason,
      path_or_label: candidate.path_or_label,
      priority: candidate.priority,
      confidence: candidate.confidence,
      normalization_notes: candidate.normalization_notes,
    }))
  }

  if (!accepted.length) {
    pushUniqueDiagnostic(diagnostics, createDiagnosticEntry({
      field: 'key_info',
      source: 'resolver',
      found: false,
      reason: 'value_not_found',
      candidate_count: candidates.length,
    }))

    return {
      value: '',
      source: '',
      diagnostics,
      candidates,
    }
  }

  const topPriority = accepted[0].priority
  const topCandidates = accepted.filter((candidate) => candidate.priority === topPriority)
  const fullyCompatible = topCandidates.find((candidate) => topCandidates.every((other) => (
    (!other.keyType || candidate.keyType === other.keyType)
    && (!other.keyCount || candidate.keyCount === other.keyCount)
  )))

  const topTypes = [...new Set(topCandidates.map((candidate) => candidate.keyType).filter(Boolean))]
  const topCounts = [...new Set(topCandidates.map((candidate) => candidate.keyCount).filter(Boolean))]
  let selectedValue = ''
  let selectedSource = ''
  let selectedReason = 'selected'
  let selectedPath = ''
  let selectedPriority = topPriority
  let selectedConfidence = topCandidates[0].confidence
  let selectedNotes = []

  if (fullyCompatible) {
    selectedValue = fullyCompatible.value
    selectedSource = fullyCompatible.source
    selectedPath = fullyCompatible.path_or_label
    selectedPriority = fullyCompatible.priority
    selectedConfidence = fullyCompatible.confidence
    selectedNotes = fullyCompatible.normalization_notes
  } else if (topTypes.length === 1 && topCounts.length === 1) {
    selectedValue = formatKeyInfoValue(topTypes[0], topCounts[0])
    selectedSource = topCandidates.map((candidate) => candidate.source).join(',')
    selectedReason = 'selected_merged'
    selectedPath = topCandidates.map((candidate) => candidate.path_or_label).filter(Boolean).join(' | ')
    selectedNotes = [...new Set(topCandidates.flatMap((candidate) => candidate.normalization_notes || []))]
  } else if (topTypes.length === 1 && topCounts.length > 1) {
    selectedValue = formatKeyInfoValue(topTypes[0], '')
    selectedSource = topCandidates.map((candidate) => candidate.source).join(',')
    selectedReason = 'selected_type_only_due_to_conflicting_counts'
    selectedPath = topCandidates.map((candidate) => candidate.path_or_label).filter(Boolean).join(' | ')
  } else if (topTypes.length > 1 && topCounts.length === 1) {
    selectedValue = formatKeyInfoValue('', topCounts[0])
    selectedSource = topCandidates.map((candidate) => candidate.source).join(',')
    selectedReason = 'selected_count_only_due_to_conflicting_types'
    selectedPath = topCandidates.map((candidate) => candidate.path_or_label).filter(Boolean).join(' | ')
  } else if (topTypes.length === 1) {
    selectedValue = formatKeyInfoValue(topTypes[0], '')
    selectedSource = topCandidates.map((candidate) => candidate.source).join(',')
    selectedReason = 'selected_type_only'
    selectedPath = topCandidates.map((candidate) => candidate.path_or_label).filter(Boolean).join(' | ')
  } else if (topCounts.length === 1) {
    selectedValue = formatKeyInfoValue('', topCounts[0])
    selectedSource = topCandidates.map((candidate) => candidate.source).join(',')
    selectedReason = 'selected_count_only'
    selectedPath = topCandidates.map((candidate) => candidate.path_or_label).filter(Boolean).join(' | ')
  }

  if (!selectedValue) {
    for (const candidate of topCandidates) {
      pushUniqueDiagnostic(diagnostics, createDiagnosticEntry({
        field: 'key_info',
        source: candidate.source,
        found: false,
        value: candidate.value,
        reason: 'conflicting_same_priority_no_decision',
        path_or_label: candidate.path_or_label,
        priority: candidate.priority,
        confidence: candidate.confidence,
        normalization_notes: candidate.normalization_notes,
      }))
    }
    pushUniqueDiagnostic(diagnostics, createDiagnosticEntry({
      field: 'key_info',
      source: 'resolver',
      found: false,
      reason: 'conflicting_same_priority_no_decision',
      candidate_count: candidates.length,
    }))

    return {
      value: '',
      source: '',
      diagnostics,
      candidates,
    }
  }

  pushUniqueDiagnostic(diagnostics, createDiagnosticEntry({
    field: 'key_info',
    source: selectedSource,
    found: true,
    value: selectedValue,
    reason: selectedReason,
    path_or_label: selectedPath,
    priority: selectedPriority,
    confidence: selectedConfidence,
    normalization_notes: selectedNotes,
  }))

  for (const candidate of accepted) {
    if (candidate.priority === topPriority && topCandidates.includes(candidate) && candidate.value === selectedValue) continue
    pushUniqueDiagnostic(diagnostics, createDiagnosticEntry({
      field: 'key_info',
      source: candidate.source,
      found: false,
      value: candidate.value,
      reason: candidate.priority < topPriority ? 'conflict_higher_priority_won' : 'not_selected',
      path_or_label: candidate.path_or_label,
      priority: candidate.priority,
      confidence: candidate.confidence,
      normalization_notes: candidate.normalization_notes,
    }))
  }

  pushUniqueDiagnostic(diagnostics, createDiagnosticEntry({
    field: 'key_info',
    source: 'resolver',
    found: true,
    value: selectedValue,
    reason: selectedReason,
    candidate_count: candidates.length,
  }))

  return {
    value: selectedValue,
    source: selectedSource,
    diagnostics,
    candidates,
  }
}

function isDriveTitleLike(label = '', pathOrLabel = '') {
  return DRIVE_TITLE_LABEL_RE.test(cleanText([label, pathOrLabel].filter(Boolean).join(' ')))
}

function hasDriveContext(label = '', pathOrLabel = '') {
  return DRIVE_KEY_CONTEXT_RE.test(cleanText([label, pathOrLabel].filter(Boolean).join(' ')))
}

function classifyDriveRejectReason(rawValue, options = {}) {
  const raw = cleanText(rawValue)
  const label = cleanText(options.label)
  const pathOrLabel = cleanText(options.path_or_label)
  const combined = cleanText([label, raw].filter(Boolean).join(' '))
  const explicitContext = hasDriveContext(label, pathOrLabel) || Boolean(options.explicitContext)
  const titleContext = isDriveTitleLike(label, pathOrLabel) || Boolean(options.titleContext)

  if (!combined) return 'not_present'
  if (DRIVE_AMBIGUOUS_SIGNAL_RE.test(combined) && !normalizeDrive(combined)) return 'ambiguous_2wd'
  if (!explicitContext && !titleContext && !DRIVE_UNAMBIGUOUS_SIGNAL_RE.test(combined)) return 'context_missing'
  return 'invalid_value'
}

function buildDriveCandidate(rawValue, options = {}) {
  const raw = cleanText(rawValue)
  const label = cleanText(options.label)
  const combined = cleanText([label, raw].filter(Boolean).join(' '))
  const explicitContext = hasDriveContext(label, options.path_or_label) || Boolean(options.explicitContext)
  const titleContext = isDriveTitleLike(label, options.path_or_label) || Boolean(options.titleContext)
  const normalized =
    (CANONICAL_DRIVE_TYPES.has(raw) && raw) ||
    (CANONICAL_DRIVE_TYPES.has(combined) && combined) ||
    normalizeDrive(raw) ||
    normalizeDrive(combined)
  const rejectReason = normalized
    ? (
      !explicitContext && !titleContext && !DRIVE_UNAMBIGUOUS_SIGNAL_RE.test(combined)
        ? 'context_missing'
        : ''
    )
    : classifyDriveRejectReason(raw, {
      label,
      path_or_label: options.path_or_label,
      explicitContext,
      titleContext,
    })

  return buildEvidenceCandidate({
    field: 'drive_type',
    source: options.source,
    priority: options.priority,
    confidence: options.confidence,
    value: rejectReason ? '' : normalized,
    rawValue: combined || raw,
    path_or_label: options.path_or_label || label,
    reject_reason: rejectReason,
  })
}

function walkStructuredValue(input, visit, state = {}) {
  const {
    path = '$',
    depth = 0,
    seen = new WeakSet(),
  } = state

  if (input === null || input === undefined) return
  if (depth > MAX_STRUCTURED_SCAN_DEPTH) return
  if (SKIPPED_STRUCTURED_PATH_RE.test(path)) return

  if (Array.isArray(input)) {
    for (let index = 0; index < Math.min(input.length, MAX_STRUCTURED_ARRAY_ITEMS); index += 1) {
      walkStructuredValue(input[index], visit, {
        path: `${path}[${index}]`,
        depth: depth + 1,
        seen,
      })
    }
    return
  }

  if (typeof input !== 'object') {
    visit({ path, key: path.split('.').pop() || '', value: input })
    return
  }

  if (seen.has(input)) return
  seen.add(input)

  visit({ path, key: path.split('.').pop() || '', value: input, isObject: true })

  for (const [key, value] of Object.entries(input)) {
    walkStructuredValue(value, visit, {
      path: path === '$' ? key : `${path}.${key}`,
      depth: depth + 1,
      seen,
    })
  }
}

function collectStructuredPrimitiveEntries(input, source) {
  const entries = []

  walkStructuredValue(input, ({ path, key, value, isObject }) => {
    if (isObject) return
    if (typeof value !== 'string' && typeof value !== 'number') return

    const text = cleanText(value)
    if (!text) return

    entries.push({
      source,
      path,
      pathSignal: normalizePathSignal(path),
      keySignal: normalizePathSignal(key),
      value: text,
    })
  })

  return entries
}

function collectStructuredLabelValuePairs(input, source) {
  const pairs = []
  const labelKeys = ['label', 'title', 'name', 'key', 'caption']
  const valueKeys = ['value', 'text', 'content', 'detail', 'description', 'desc']

  walkStructuredValue(input, ({ path, value, isObject }) => {
    if (!isObject || !value || typeof value !== 'object' || Array.isArray(value)) return

    const label = labelKeys
      .map((key) => cleanText(value?.[key]))
      .find(Boolean)
    const text = valueKeys
      .map((key) => cleanText(value?.[key]))
      .find(Boolean)

    if (!label || !text) return

    pairs.push({
      source,
      path,
      label,
      value: text,
      pathSignal: normalizePathSignal(path),
    })
  })

  return pairs
}

function createTextSource(source, path_or_label, text) {
  const cleaned = cleanText(text)
  if (!cleaned) return null
  return {
    source,
    path_or_label: cleanText(path_or_label) || source,
    text: cleaned,
  }
}

function appendTextSources(target, items = []) {
  for (const item of items) {
    if (!item?.text) continue
    const signature = `${item.source}::${item.path_or_label}::${item.text}`
    if (target.some((entry) => `${entry.source}::${entry.path_or_label}::${entry.text}` === signature)) continue
    target.push(item)
  }
}

function buildEvidenceCandidate({
  field,
  source,
  priority,
  confidence,
  value,
  rawValue = '',
  path_or_label = '',
  normalization_notes = [],
  reject_reason = '',
}) {
  return {
    field,
    source,
    priority,
    confidence,
    value: cleanText(value),
    rawValue: cleanText(rawValue),
    path_or_label: cleanText(path_or_label),
    normalization_notes: [...new Set(normalization_notes.map((item) => cleanText(item)).filter(Boolean))],
    reject_reason: cleanText(reject_reason),
  }
}

function finalizeEvidenceResolution(field, candidates = [], baseDiagnostics = [], options = {}) {
  const diagnostics = [...baseDiagnostics]
  const accepted = candidates
    .filter((candidate) => candidate.value && !candidate.reject_reason)
    .sort((a, b) => (
      b.priority - a.priority
      || b.confidence - a.confidence
      || a.path_or_label.localeCompare(b.path_or_label)
    ))

  for (const candidate of candidates.filter((item) => item.reject_reason)) {
    pushUniqueDiagnostic(diagnostics, createDiagnosticEntry({
      field,
      source: candidate.source,
      found: false,
      value: candidate.rawValue,
      reason: candidate.reject_reason,
      path_or_label: candidate.path_or_label,
      priority: candidate.priority,
      confidence: candidate.confidence,
      normalization_notes: candidate.normalization_notes,
    }))
  }

  if (!accepted.length) {
    pushUniqueDiagnostic(diagnostics, createDiagnosticEntry({
      field,
      source: 'resolver',
      found: false,
      reason: cleanText(options.emptyReason) || 'value_not_found',
      candidate_count: candidates.length,
    }))

    return {
      value: '',
      source: '',
      diagnostics,
      candidates,
    }
  }

  const top = accepted[0]
  const topPriorityCandidates = accepted.filter((candidate) => candidate.priority === top.priority)
  const topValues = [...new Set(topPriorityCandidates.map((candidate) => candidate.value))]

  if (options.allowTwoToneMerge && topValues.length > 1) {
    const selectedSource = topPriorityCandidates.map((candidate) => candidate.source).join(',')

    pushUniqueDiagnostic(diagnostics, createDiagnosticEntry({
      field,
      source: selectedSource,
      found: true,
      value: TWO_TONE_INTERIOR_COLOR,
      reason: 'selected_merged',
      path_or_label: topPriorityCandidates.map((candidate) => candidate.path_or_label).filter(Boolean).join(' | '),
      priority: top.priority,
      confidence: top.confidence,
    }))

    for (const candidate of accepted) {
      if (topPriorityCandidates.includes(candidate)) continue
      pushUniqueDiagnostic(diagnostics, createDiagnosticEntry({
        field,
        source: candidate.source,
        found: false,
        value: candidate.value,
        reason: 'conflict_higher_priority_won',
        path_or_label: candidate.path_or_label,
        priority: candidate.priority,
        confidence: candidate.confidence,
      }))
    }

    pushUniqueDiagnostic(diagnostics, createDiagnosticEntry({
      field,
      source: 'resolver',
      found: true,
      value: TWO_TONE_INTERIOR_COLOR,
      reason: 'selected',
      candidate_count: candidates.length,
    }))

    return {
      value: TWO_TONE_INTERIOR_COLOR,
      source: selectedSource,
      diagnostics,
      candidates,
    }
  }

  if (!options.allowTwoToneMerge && topValues.length > 1) {
    for (const candidate of topPriorityCandidates) {
      pushUniqueDiagnostic(diagnostics, createDiagnosticEntry({
        field,
        source: candidate.source,
        found: false,
        value: candidate.value,
        reason: 'conflicting_same_priority_no_decision',
        path_or_label: candidate.path_or_label,
        priority: candidate.priority,
        confidence: candidate.confidence,
      }))
    }
    pushUniqueDiagnostic(diagnostics, createDiagnosticEntry({
      field,
      source: 'resolver',
      found: false,
      reason: 'conflicting_same_priority_no_decision',
      candidate_count: candidates.length,
    }))

    return {
      value: '',
      source: '',
      diagnostics,
      candidates,
    }
  }

  pushUniqueDiagnostic(diagnostics, createDiagnosticEntry({
    field,
    source: top.source,
    found: true,
    value: top.value,
    reason: 'selected',
    path_or_label: top.path_or_label,
    priority: top.priority,
    confidence: top.confidence,
    normalization_notes: top.normalization_notes,
  }))

  for (const candidate of accepted.slice(1)) {
    pushUniqueDiagnostic(diagnostics, createDiagnosticEntry({
      field,
      source: candidate.source,
      found: false,
      value: candidate.value,
      reason: 'conflict_higher_priority_won',
      path_or_label: candidate.path_or_label,
      priority: candidate.priority,
      confidence: candidate.confidence,
      normalization_notes: candidate.normalization_notes,
    }))
  }

  pushUniqueDiagnostic(diagnostics, createDiagnosticEntry({
    field,
    source: 'resolver',
    found: true,
    value: top.value,
    reason: 'selected',
    candidate_count: candidates.length,
  }))

  return {
    value: top.value,
    source: top.source,
    diagnostics,
    candidates,
  }
}

function extractVinRawCandidatesFromText(value) {
  const text = cleanText(value)
  if (!text) return []

  const matches = new Set()
  const explicitRe = new RegExp(VIN_INLINE_CAPTURE_RE.source, 'ig')
  const embeddedRe = new RegExp(VIN_EMBEDDED_RE.source, 'g')

  let match
  while ((match = explicitRe.exec(text))) {
    const snippet = cleanText(match[1])
    if (snippet) matches.add(snippet)
  }

  while ((match = embeddedRe.exec(text.toUpperCase()))) {
    const snippet = cleanText(match[0])
    if (snippet) matches.add(snippet)
  }

  return [...matches]
}

function classifyVinRejectReason(rawValue, normalizedValue, context = {}) {
  if (!cleanText(rawValue)) return 'not_present'
  if (VIN_MASK_HINT_RE.test(rawValue)) return 'masked_or_partial'
  if (normalizedValue.length !== 17) return 'invalid_length'
  if (/[IOQ]/.test(normalizedValue)) return 'invalid_charset'
  if ((normalizedValue.match(/\d/g) || []).length < 3) return 'looks_like_text'
  if (!/[A-Z]/.test(normalizedValue)) return 'looks_like_listing_id'

  const vehicleNoSignal = String(context.vehicleNo || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
  if (vehicleNoSignal && normalizedValue === vehicleNoSignal) return 'looks_like_vehicle_number'

  const listingSignals = [
    context.encarId,
    context.vehicleId,
    context.queryCarId,
  ]
    .map((value) => cleanText(value).toUpperCase())
    .filter(Boolean)

  if (listingSignals.includes(normalizedValue)) return 'looks_like_listing_id'
  if (!sanitizeVin(normalizedValue)) return 'invalid_charset'

  return ''
}

function buildVinCandidate(rawValue, options = {}) {
  const raw = cleanText(rawValue)
  const normalized = raw.toUpperCase().replace(/[\s:/_-]+/g, '')
  const normalizationNotes = []

  if (raw && normalized !== raw.toUpperCase()) {
    normalizationNotes.push('removed_separators')
  }

  const rejectReason = classifyVinRejectReason(raw, normalized, options)
  return buildEvidenceCandidate({
    field: 'vin',
    source: options.source,
    priority: options.priority,
    confidence: options.confidence,
    value: rejectReason ? '' : sanitizeVin(normalized),
    rawValue: raw,
    path_or_label: options.path_or_label,
    normalization_notes: normalizationNotes,
    reject_reason: rejectReason,
  })
}

function classifyInteriorRejectReason(text, label = '', bodyColor = '', { explicit = false } = {}) {
  const rawText = cleanText(text)
  const rawLabel = cleanText(label)
  const combined = cleanText([rawLabel, rawText].filter(Boolean).join(' '))

  if (!rawText) return 'not_present'
  if (rawLabel && isInteriorColorRejectLabel(rawLabel)) return 'body_color_field'
  if (INTERIOR_KEY_REJECT_RE.test(normalizePathSignal(rawLabel))) return 'body_color_field'
  if (INTERIOR_MATERIAL_ONLY_RE.test(rawText)) return 'material_only'
  if (!explicit && !hasInteriorColorContext(combined) && !isInteriorColorLabel(rawLabel)) return 'no_interior_context'
  if (!INTERIOR_COLOR_TOKEN_RE.test(combined) && INTERIOR_MARKETING_RE.test(combined)) return 'marketing_phrase'

  const normalizedBody = normalizeInteriorColorName(bodyColor, '', { allowBodyDuplicate: true })
  const normalizedText = normalizeInteriorColorName(rawText, bodyColor, { allowBodyDuplicate: true })
  if (!explicit && normalizedBody && normalizedBody === normalizedText) return 'body_color_conflict'

  return 'invalid_or_ambiguous'
}

function buildInteriorRawCandidate(rawValue, options = {}) {
  const raw = cleanText(rawValue)
  const normalized = normalizeInteriorColorName(raw, options.bodyColor, { allowBodyDuplicate: true })
  const rejectReason = normalized
    ? ''
    : classifyInteriorRejectReason(raw, options.path_or_label, options.bodyColor, { explicit: true })

  return buildEvidenceCandidate({
    field: 'interior_color',
    source: options.source,
    priority: options.priority,
    confidence: options.confidence,
    value: normalized,
    rawValue: raw,
    path_or_label: options.path_or_label,
    reject_reason: rejectReason,
  })
}

function buildInteriorPairCandidate(pairs = [], options = {}) {
  const filteredPairs = pairs
    .map((pair) => ({
      label: cleanText(pair?.label),
      value: cleanText(pair?.value),
      path_or_label: cleanText(pair?.path_or_label || pair?.path || pair?.label),
    }))
    .filter((pair) => pair.label && pair.value)

  if (!filteredPairs.length) {
    return buildEvidenceCandidate({
      field: 'interior_color',
      source: options.source,
      priority: options.priority,
      confidence: options.confidence,
      reject_reason: 'not_present',
    })
  }

  const relevantPairs = filteredPairs.filter((pair) => (
    isInteriorColorLabel(pair.label)
    || (
      hasInteriorColorContext(pair.label)
      && !isInteriorColorRejectLabel(pair.label)
      && !INTERIOR_KEY_REJECT_RE.test(normalizePathSignal(pair.path_or_label))
    )
  ))

  if (!relevantPairs.length) {
    return buildEvidenceCandidate({
      field: 'interior_color',
      source: options.source,
      priority: options.priority,
      confidence: options.confidence,
      reject_reason: 'no_interior_context',
    })
  }

  const normalized = extractInteriorColorFromPairs(
    relevantPairs.map((pair) => ({ label: pair.label, value: pair.value })),
    options.bodyColor,
  )

  return buildEvidenceCandidate({
    field: 'interior_color',
    source: options.source,
    priority: options.priority,
    confidence: options.confidence,
    value: normalized,
    rawValue: relevantPairs.map((pair) => `${pair.label}: ${pair.value}`).join(' | '),
    path_or_label: relevantPairs.map((pair) => pair.path_or_label).filter(Boolean).join(' | '),
    reject_reason: normalized
      ? ''
      : classifyInteriorRejectReason(
        relevantPairs.map((pair) => `${pair.label} ${pair.value}`).join(' '),
        relevantPairs.map((pair) => pair.label).join(' / '),
        options.bodyColor,
        { explicit: true },
      ),
  })
}

function buildInteriorTextCandidate(textSources = [], options = {}) {
  const relevantTexts = textSources
    .map((source) => ({
      ...source,
      text: cleanText(source?.text),
      path_or_label: cleanText(source?.path_or_label),
      pathSignal: normalizePathSignal(source?.path_or_label || source?.label || ''),
    }))
    .filter((source) => source.text)
    .map((source) => {
      const textHasContext = hasInteriorColorContext(source.text)
      const pathHasContext =
        (!!source.pathSignal && INTERIOR_KEY_CONTEXT_RE.test(source.pathSignal))
        || isInteriorColorLabel(source.path_or_label)
      const hasReject =
        isInteriorColorRejectLabel(source.text)
        || (!!source.pathSignal && INTERIOR_KEY_REJECT_RE.test(source.pathSignal))
        || isInteriorColorRejectLabel(source.path_or_label)

      return {
        ...source,
        textHasContext,
        pathHasContext,
        contextualText: pathHasContext && !textHasContext
          ? cleanText([source.path_or_label, source.text].filter(Boolean).join(' '))
          : source.text,
        hasReject,
      }
    })
    .filter((source) => !source.hasReject && (source.textHasContext || source.pathHasContext))

  if (!relevantTexts.length) {
    return buildEvidenceCandidate({
      field: 'interior_color',
      source: options.source,
      priority: options.priority,
      confidence: options.confidence,
      reject_reason: 'no_interior_context',
    })
  }

  const perSourceMatches = [...new Set(
    relevantTexts
      .map((source) => extractInteriorColorFromText(source.contextualText || source.text, options.bodyColor))
      .filter(Boolean),
  )]
  const mergedText = relevantTexts.map((source) => source.contextualText || source.text).join(' | ')
  const normalized = perSourceMatches.includes('Двухцветный')
    ? 'Двухцветный'
    : perSourceMatches.length > 1
      ? 'Двухцветный'
      : perSourceMatches[0] || extractInteriorColorFromText(mergedText, options.bodyColor)

  return buildEvidenceCandidate({
    field: 'interior_color',
    source: options.source,
    priority: options.priority,
    confidence: options.confidence,
    value: normalized,
    rawValue: mergedText,
    path_or_label: relevantTexts.map((source) => source.path_or_label).filter(Boolean).join(' | '),
    reject_reason: normalized
      ? ''
      : classifyInteriorRejectReason(mergedText, '', options.bodyColor),
  })
}

function buildFieldDiagnostics(field, context, options = {}) {
  const diagnostics = []

  for (const entry of context?.diagnostics || []) {
    if (!options.includeSources || options.includeSources.some((pattern) => String(entry.source || '').includes(pattern))) {
      pushUniqueDiagnostic(diagnostics, createDiagnosticEntry({
        field,
        source: entry.source,
        found: false,
        reason: entry.reason,
        path_or_label: entry.path_or_label,
      }))
    }
  }

  return diagnostics
}

function buildEvidenceContext(encarId, primaryPayload, options = {}) {
  const supplementalPayload = options.supplementalPayload || null
  const inspection = options.inspection || null
  const optionTexts = Array.isArray(options.optionTexts) ? options.optionTexts : []
  const payloads = [primaryPayload, supplementalPayload].filter(Boolean)
  const structuredEntries = []
  const structuredPairs = []
  const htmlPairs = []
  const textSources = []
  const diagnostics = []

  const primaryData = primaryPayload?.data || {}
  const bodyColor = normalizeColorName(primaryPayload?.spec?.colorName || supplementalPayload?.spec?.colorName || '')

  for (const payload of payloads) {
    const payloadSource = payload?.source === 'html_preloaded_state'
      ? 'official-preloaded-state'
      : 'official-api'
    structuredEntries.push(...collectStructuredPrimitiveEntries(payload?.data || {}, `${payloadSource}.data`))
    structuredPairs.push(...collectStructuredLabelValuePairs(payload?.data || {}, `${payloadSource}.data`))

    if (payload?.preloadedState) {
      structuredEntries.push(...collectStructuredPrimitiveEntries(payload.preloadedState, `${payloadSource}.state`))
      structuredPairs.push(...collectStructuredLabelValuePairs(payload.preloadedState, `${payloadSource}.state`))
    }

    if (payload?.html) {
      htmlPairs.push(...extractHtmlStructuredPairs(payload.html, `${payloadSource}.html-structured`))
    }

    appendTextSources(textSources, [
      createTextSource(payloadSource, 'advertisement.memo', payload?.ad?.memo),
      createTextSource(payloadSource, 'advertisement.title', payload?.ad?.title),
      createTextSource(payloadSource, 'advertisement.subTitle', payload?.ad?.subTitle),
      createTextSource(payloadSource, 'advertisement.oneLineText', payload?.ad?.oneLineText),
      createTextSource(payloadSource, 'contents.text', payload?.contents?.text),
      createTextSource(payloadSource, 'spec.customColor', typeof payload?.spec?.customColor === 'string' ? payload.spec.customColor : ''),
      createTextSource(payloadSource, 'html', payload?.html || ''),
    ])
  }

  appendTextSources(
    textSources,
    optionTexts.map((text, index) => createTextSource('option-dictionary', `optionTexts[${index}]`, text)),
  )

  for (const payload of payloads) {
    const payloadSource = payload?.source === 'html_preloaded_state'
      ? 'official-preloaded-option-text'
      : 'official-api-option-text'
    appendTextSources(
      textSources,
      collectFreeformOptionTexts(payload?.options || {})
        .map((item) => createTextSource(payloadSource, item.path, item.text)),
    )
  }

  const inspectionPairs = buildInspectionPairs(inspection).map((pair) => ({
    ...pair,
    source: 'inspection-report',
    path_or_label: cleanText(pair?.label),
  }))
  const inspectionTexts = inspection
    ? [
      ...(inspection.summary || []).map((row) => [row?.label, row?.detail, row?.note, ...(row?.states || [])].join(' ')),
      ...(inspection.detailStatus || []).map((row) => [row?.section, row?.label, row?.detail, row?.note, ...(row?.states || [])].join(' ')),
      ...(inspection.repairHistory || []).map((row) => [row?.label, row?.value].join(' ')),
      ...(inspection?.vehicleHistory?.uninsuredPeriods || []).map((item) => [item?.raw, item?.start, item?.end].join(' ')),
      ...(inspection?.vehicleHistory?.ownerChanges || []).map((item) => [item?.index, item?.date].join(' ')),
      ...(inspection?.opinion || []).map((row) => [row?.label, row?.text].join(' ')),
    ]
    : []

  structuredPairs.push(...inspectionPairs)
  appendTextSources(
    textSources,
    inspectionTexts.map((text, index) => createTextSource('inspection-report', `inspectionTexts[${index}]`, text)),
  )

  const supplementalDiagnostic = options?.supplementalError?.encarDiagnostic
  if (supplementalDiagnostic) {
    diagnostics.push({
      source: 'html_preloaded_state',
      reason: supplementalDiagnostic.reason || 'detail_fetch_failed',
      path_or_label: cleanText(supplementalDiagnostic.details || ''),
    })
  }

  if (Array.isArray(inspection?.parserDiagnostics)) {
    for (const entry of inspection.parserDiagnostics) {
      if (!entry || entry.found) continue
      diagnostics.push({
        source: cleanText(entry.field || 'inspection'),
        reason: cleanText(entry.reason || 'selector_no_match'),
        path_or_label: cleanText(entry.field || ''),
      })
    }
  }

  return {
    encarId: cleanText(encarId),
    bodyColor,
    primaryData,
    supplementalPayload,
    inspection,
    optionTexts,
    structuredEntries,
    structuredPairs,
    htmlPairs,
    textSources,
    diagnostics,
    vehicleNo: primaryData?.vehicleNo || supplementalPayload?.data?.vehicleNo || '',
    vehicleId: primaryData?.vehicleId || supplementalPayload?.data?.vehicleId || '',
    queryCarId: primaryData?.queryCarId || supplementalPayload?.data?.queryCarId || '',
    primaryPayload,
  }
}

export function resolveVinEvidence(context = {}) {
  const candidates = []
  const diagnostics = buildFieldDiagnostics('vin', context, {
    includeSources: ['html_preloaded_state', 'inspection.fetch', 'inspection.basicInfo.items'],
  })
  const payloads = [context.primaryPayload, context.supplementalPayload].filter(Boolean)

  for (const payload of payloads) {
    const isPrimaryApi = payload?.source === 'api'
    const source = isPrimaryApi ? 'official-structured' : 'official-preloaded'
    const candidate = buildVinCandidate(payload?.data?.vin, {
      source,
      priority: isPrimaryApi ? 400 : 390,
      confidence: isPrimaryApi ? 1 : 0.99,
      path_or_label: `${source}.data.vin`,
      vehicleNo: context.vehicleNo,
      encarId: context.encarId,
      vehicleId: context.vehicleId,
      queryCarId: context.queryCarId,
    })
    if (candidate.rawValue || candidate.reject_reason) candidates.push(candidate)
  }

  for (const pair of context.structuredPairs || []) {
    const label = cleanText(pair?.label)
    const value = cleanText(pair?.value)
    if (!label || !value || !VIN_CONTEXT_LABEL_RE.test(label) || VIN_REJECT_KEY_RE.test(label)) continue

    const rawCandidates = extractVinRawCandidatesFromText(`${label}: ${value}`)
    if (!rawCandidates.length) rawCandidates.push(value)

    for (const rawCandidate of rawCandidates) {
      candidates.push(buildVinCandidate(rawCandidate, {
        source: pair?.source === 'inspection-report' ? 'inspection-report' : 'structured-pair',
        priority: pair?.source === 'inspection-report' ? 300 : 260,
        confidence: pair?.source === 'inspection-report' ? 0.88 : 0.8,
        path_or_label: pair?.path_or_label || label,
        vehicleNo: context.vehicleNo,
        encarId: context.encarId,
        vehicleId: context.vehicleId,
        queryCarId: context.queryCarId,
      }))
    }
  }

  for (const entry of context.structuredEntries || []) {
    if (!VIN_EXPLICIT_KEY_RE.test(entry.pathSignal) || VIN_REJECT_KEY_RE.test(entry.pathSignal)) continue

    candidates.push(buildVinCandidate(entry.value, {
      source: entry.source.startsWith('official') ? 'structured-official-json' : 'structured-json',
      priority: entry.source.startsWith('official')
        ? (entry.source.includes('api') ? 360 : 340)
        : 220,
      confidence: entry.source.startsWith('official') ? 0.82 : 0.7,
      path_or_label: entry.path,
      vehicleNo: context.vehicleNo,
      encarId: context.encarId,
      vehicleId: context.vehicleId,
      queryCarId: context.queryCarId,
    }))
  }

  for (const textSource of context.textSources || []) {
    if (!VIN_CONTEXT_LABEL_RE.test(textSource?.text || '')) continue
    const rawCandidates = extractVinRawCandidatesFromText(textSource.text)

    for (const rawCandidate of rawCandidates) {
      candidates.push(buildVinCandidate(rawCandidate, {
        source: textSource.source === 'inspection-report' ? 'inspection-text' : 'text-fallback',
        priority: textSource.source === 'inspection-report' ? 180 : 140,
        confidence: textSource.source === 'inspection-report' ? 0.62 : 0.52,
        path_or_label: textSource.path_or_label,
        vehicleNo: context.vehicleNo,
        encarId: context.encarId,
        vehicleId: context.vehicleId,
        queryCarId: context.queryCarId,
      }))
    }
  }

  return finalizeEvidenceResolution('vin', candidates, diagnostics, {
    emptyReason: 'value_not_found',
  })
}

export function resolveInteriorColorEvidence(context = {}) {
  const candidates = []
  const diagnostics = buildFieldDiagnostics('interior_color', context, {
    includeSources: ['html_preloaded_state', 'inspection.fetch', 'inspection.summary', 'inspection.detailStatus', 'inspection.basicInfo.items'],
  })
  const payloads = [context.primaryPayload, context.supplementalPayload].filter(Boolean)
  const bodyColor = context.bodyColor || ''

  for (const payload of payloads) {
    const rawValue = extractInteriorColorFromSpec(payload?.spec || {})
    const source = payload?.source === 'api' ? 'official-spec' : 'official-preloaded-spec'
    const candidate = buildInteriorRawCandidate(rawValue, {
      source,
      priority: payload?.source === 'api' ? 400 : 390,
      confidence: payload?.source === 'api' ? 1 : 0.98,
      path_or_label: `${source}.spec`,
      bodyColor,
    })
    if (candidate.rawValue || candidate.reject_reason) candidates.push(candidate)
  }

  const inspectionPairCandidate = buildInteriorPairCandidate(
    (context.structuredPairs || []).filter((pair) => pair?.source === 'inspection-report'),
    {
      source: 'inspection-report',
      priority: 320,
      confidence: 0.88,
      bodyColor,
    },
  )
  if (inspectionPairCandidate.value || inspectionPairCandidate.reject_reason) candidates.push(inspectionPairCandidate)

  const structuredPairCandidate = buildInteriorPairCandidate(
    (context.structuredPairs || []).filter((pair) => pair?.source !== 'inspection-report'),
    {
      source: 'structured-pair',
      priority: 260,
      confidence: 0.8,
      bodyColor,
    },
  )
  if (structuredPairCandidate.value || structuredPairCandidate.reject_reason) candidates.push(structuredPairCandidate)

  const structuredKeyCandidate = buildInteriorPairCandidate(
    (context.structuredEntries || [])
      .filter((entry) => INTERIOR_KEY_CONTEXT_RE.test(entry.pathSignal) && !INTERIOR_KEY_REJECT_RE.test(entry.pathSignal))
      .map((entry) => ({
        label: entry.path,
        value: entry.value,
        path_or_label: entry.path,
      })),
    {
      source: 'structured-json',
      priority: 240,
      confidence: 0.72,
      bodyColor,
    },
  )
  if (structuredKeyCandidate.value || structuredKeyCandidate.reject_reason) candidates.push(structuredKeyCandidate)

  const optionFreeformCandidate = buildInteriorTextCandidate(
    (context.textSources || []).filter((source) => String(source?.source || '').includes('option-text')),
    {
      source: 'raw-option-text',
      priority: 220,
      confidence: 0.76,
      bodyColor,
    },
  )
  if (optionFreeformCandidate.value || optionFreeformCandidate.reject_reason) candidates.push(optionFreeformCandidate)

  const optionDictionaryCandidate = buildInteriorTextCandidate(
    (context.textSources || []).filter((source) => source?.source === 'option-dictionary'),
    {
      source: 'option-dictionary',
      priority: 180,
      confidence: 0.66,
      bodyColor,
    },
  )
  if (optionDictionaryCandidate.value || optionDictionaryCandidate.reject_reason) candidates.push(optionDictionaryCandidate)

  const textCandidate = buildInteriorTextCandidate(
    (context.textSources || []).filter((source) => !String(source?.source || '').includes('option-text') && source?.source !== 'option-dictionary'),
    {
    source: 'text-fallback',
    priority: 140,
    confidence: 0.58,
    bodyColor,
    },
  )
  if (textCandidate.value || textCandidate.reject_reason) candidates.push(textCandidate)

  return finalizeEvidenceResolution('interior_color', candidates, diagnostics, {
    allowTwoToneMerge: true,
    emptyReason: 'value_not_found',
  })
}

export function resolveKeyInfoEvidence(context = {}) {
  const candidates = []
  const diagnostics = buildFieldDiagnostics('key_info', context, {
    includeSources: ['html_preloaded_state', 'inspection.fetch', 'inspection.summary', 'inspection.detailStatus', 'inspection.basicInfo.items'],
  })

  for (const entry of context.structuredEntries || []) {
    if (!KEY_EXPLICIT_PATH_RE.test(entry.pathSignal)) continue

    const source = entry.source.startsWith('official')
      ? (entry.source.includes('api') ? 'official-structured-key' : 'official-preloaded-key')
      : 'structured-json-key'
    const priority = entry.source.startsWith('official')
      ? (entry.source.includes('api') ? 400 : 390)
      : 240
    const confidence = entry.source.startsWith('official') ? 0.92 : 0.72
    const candidate = buildKeyCandidate(entry.value, {
      source,
      priority,
      confidence,
      label: entry.path,
      path_or_label: entry.path,
    })
    if (candidate.value || candidate.reject_reason) candidates.push(candidate)
  }

  for (const pair of context.structuredPairs || []) {
    const label = cleanText(pair?.label)
    const value = cleanText(pair?.value)
    if (!label && !value) continue
    if (!KEY_EXPLICIT_LABEL_RE.test(label) && !hasKeyContext(`${label} ${value}`)) continue

    const source = pair?.source === 'inspection-report'
      ? 'inspection-report'
      : 'structured-pair-key'
    const priority = pair?.source === 'inspection-report' ? 320 : 260
    const confidence = pair?.source === 'inspection-report' ? 0.88 : 0.78
    const candidate = buildKeyCandidate(value, {
      source,
      priority,
      confidence,
      label,
      path_or_label: pair?.path_or_label || label,
    })
    if (candidate.value || candidate.reject_reason) candidates.push(candidate)
  }

  for (const pair of context.htmlPairs || []) {
    const label = cleanText(pair?.label)
    const value = cleanText(pair?.value)
    if (!label && !value) continue
    if (!KEY_EXPLICIT_LABEL_RE.test(label) && !hasKeyContext(`${label} ${value}`)) continue

    const candidate = buildKeyCandidate(value, {
      source: 'html-structured-key',
      priority: 300,
      confidence: 0.84,
      label,
      path_or_label: pair?.path_or_label || label,
    })
    if (candidate.value || candidate.reject_reason) candidates.push(candidate)
  }

  for (const textSource of context.textSources || []) {
    const text = cleanText(textSource?.text)
    if (!text) continue
    if (!hasKeyContext(text) && !KEY_EXPLICIT_LABEL_RE.test(textSource?.path_or_label || '')) continue

    const source = textSource?.source === 'inspection-report' ? 'inspection-text' : 'text-fallback-key'
    const priority = textSource?.source === 'inspection-report' ? 180 : 140
    const confidence = textSource?.source === 'inspection-report' ? 0.6 : 0.48
    const candidate = buildKeyCandidate(text, {
      source,
      priority,
      confidence,
      label: textSource?.path_or_label,
      path_or_label: textSource?.path_or_label,
    })
    if (candidate.value || candidate.reject_reason) candidates.push(candidate)
  }

  const payload = context.primaryPayload || {}
  const supplementalPayload = context.supplementalPayload || {}
  const inspectionPairs = (context.structuredPairs || []).filter((pair) => pair?.source === 'inspection-report')
  const inspectionRows = context.inspection
    ? [
      ...(context.inspection?.summary || []),
      ...(context.inspection?.detailStatus || []),
    ]
    : []
  const legacyValue = extractKeyInfo({
    contentsText: payload?.contents?.text,
    texts: [
      payload?.ad?.memo,
      payload?.ad?.title,
      payload?.ad?.subTitle,
      payload?.ad?.oneLineText,
      supplementalPayload?.ad?.memo,
      supplementalPayload?.ad?.title,
      supplementalPayload?.ad?.subTitle,
      supplementalPayload?.ad?.oneLineText,
      ...((context.optionTexts || []).map((value) => cleanText(value))),
      ...((context.textSources || [])
        .filter((source) => source?.source === 'inspection-report')
        .map((source) => source.text)),
    ],
    pairs: inspectionPairs,
    inspectionRows,
  })
  if (legacyValue) {
    candidates.push(buildKeyCandidate(legacyValue, {
      source: 'legacy-key-parser',
      priority: 90,
      confidence: 0.42,
      path_or_label: 'extractKeyInfo()',
    }))
  }

  return finalizeKeyInfoResolution(candidates, diagnostics)
}

export function resolveDriveTypeEvidence(context = {}) {
  const candidates = []
  const diagnostics = buildFieldDiagnostics('drive_type', context, {
    includeSources: ['html_preloaded_state', 'inspection.fetch', 'inspection.summary', 'inspection.detailStatus', 'inspection.basicInfo.items'],
  })

  for (const entry of context.structuredEntries || []) {
    const hasExplicitPathContext = DRIVE_KEY_CONTEXT_RE.test(entry.pathSignal)
    const hasTitlePathContext = false
    const text = cleanText(entry.value)
    if (!text) continue
    if (!hasExplicitPathContext && !hasTitlePathContext && !DRIVE_UNAMBIGUOUS_SIGNAL_RE.test(text) && !DRIVE_AMBIGUOUS_SIGNAL_RE.test(text)) continue

    const source = entry.source.startsWith('official')
      ? (entry.source.includes('api') ? 'official-structured-drive' : 'official-preloaded-drive')
      : 'structured-json-drive'
    const priority = hasExplicitPathContext
      ? (entry.source.startsWith('official') ? (entry.source.includes('api') ? 400 : 390) : 250)
      : 220
    const confidence = hasExplicitPathContext
      ? (entry.source.startsWith('official') ? 0.94 : 0.74)
      : 0.66
    const candidate = buildDriveCandidate(text, {
      source,
      priority,
      confidence,
      label: entry.path,
      path_or_label: entry.path,
      explicitContext: hasExplicitPathContext,
      titleContext: hasTitlePathContext,
    })
    if (candidate.value || candidate.reject_reason) candidates.push(candidate)
  }

  for (const pair of context.structuredPairs || []) {
    const label = cleanText(pair?.label)
    const value = cleanText(pair?.value)
    if (!label && !value) continue

    const explicitContext = hasDriveContext(label, pair?.path_or_label)
    const titleContext = isDriveTitleLike(label, pair?.path_or_label)
    const combined = cleanText([label, value].filter(Boolean).join(' '))
    if (!explicitContext && !titleContext && !DRIVE_UNAMBIGUOUS_SIGNAL_RE.test(combined) && !DRIVE_AMBIGUOUS_SIGNAL_RE.test(combined)) continue

    const source = pair?.source === 'inspection-report'
      ? (explicitContext ? 'inspection-report' : 'inspection-title')
      : (explicitContext ? 'structured-pair-drive' : 'structured-title-drive')
    const priority = explicitContext
      ? (pair?.source === 'inspection-report' ? 320 : 260)
      : (pair?.source === 'inspection-report' ? 230 : 210)
    const confidence = explicitContext
      ? (pair?.source === 'inspection-report' ? 0.88 : 0.78)
      : (pair?.source === 'inspection-report' ? 0.72 : 0.62)
    const candidate = buildDriveCandidate(value, {
      source,
      priority,
      confidence,
      label,
      path_or_label: pair?.path_or_label || label,
      explicitContext,
      titleContext,
    })
    if (candidate.value || candidate.reject_reason) candidates.push(candidate)
  }

  for (const pair of context.htmlPairs || []) {
    const label = cleanText(pair?.label)
    const value = cleanText(pair?.value)
    if (!label && !value) continue

    const explicitContext = hasDriveContext(label, pair?.path_or_label)
    const titleContext = isDriveTitleLike(label, pair?.path_or_label)
    const combined = cleanText([label, value].filter(Boolean).join(' '))
    if (!explicitContext && !titleContext && !DRIVE_UNAMBIGUOUS_SIGNAL_RE.test(combined) && !DRIVE_AMBIGUOUS_SIGNAL_RE.test(combined)) continue

    const candidate = buildDriveCandidate(value, {
      source: explicitContext ? 'html-structured-drive' : 'html-title-drive',
      priority: explicitContext ? 300 : 220,
      confidence: explicitContext ? 0.82 : 0.68,
      label,
      path_or_label: pair?.path_or_label || label,
      explicitContext,
      titleContext,
    })
    if (candidate.value || candidate.reject_reason) candidates.push(candidate)
  }

  for (const textSource of context.textSources || []) {
    const text = cleanText(textSource?.text)
    if (!text) continue

    const explicitContext = hasDriveContext(textSource?.path_or_label, textSource?.path_or_label)
    const titleContext = isDriveTitleLike(textSource?.path_or_label, textSource?.path_or_label)
    if (!explicitContext && !titleContext && !DRIVE_UNAMBIGUOUS_SIGNAL_RE.test(text) && !DRIVE_AMBIGUOUS_SIGNAL_RE.test(text)) continue

    const candidate = buildDriveCandidate(text, {
      source: textSource?.source === 'inspection-report'
        ? (explicitContext ? 'inspection-text' : 'inspection-title-text')
        : (titleContext ? 'title-text' : 'text-fallback-drive'),
      priority: textSource?.source === 'inspection-report'
        ? (explicitContext ? 180 : 170)
        : (titleContext ? 160 : 140),
      confidence: textSource?.source === 'inspection-report'
        ? (explicitContext ? 0.62 : 0.58)
        : (titleContext ? 0.56 : 0.48),
      label: textSource?.path_or_label,
      path_or_label: textSource?.path_or_label,
      explicitContext,
      titleContext,
    })
    if (candidate.value || candidate.reject_reason) candidates.push(candidate)
  }

  const payload = context.primaryPayload || {}
  const supplementalPayload = context.supplementalPayload || {}
  const inspectionPairs = (context.structuredPairs || []).filter((pair) => pair?.source === 'inspection-report')
  const legacyDrive = extractDriveFromPairs(inspectionPairs) || inferDrive(
    collectObjectValuesByKeyPattern(payload?.spec || {}, /(?:drive|drivetrain|traction|wheel)/i),
    collectObjectValuesByKeyPattern(supplementalPayload?.spec || {}, /(?:drive|drivetrain|traction|wheel)/i),
    [
      payload?.category?.gradeDetailEnglishName,
      payload?.category?.gradeDetailName,
      payload?.category?.gradeEnglishName,
      payload?.category?.gradeName,
      payload?.category?.modelGroupEnglishName,
      payload?.category?.modelGroupName,
      payload?.category?.modelEnglishName,
      payload?.category?.modelName,
      payload?.ad?.title,
      payload?.ad?.subTitle,
      payload?.ad?.memo,
      supplementalPayload?.ad?.title,
      supplementalPayload?.ad?.subTitle,
      supplementalPayload?.ad?.memo,
      ...((context.optionTexts || []).map((value) => cleanText(value))),
      ...inspectionPairs.map((pair) => cleanText([pair?.label, pair?.value].filter(Boolean).join(' '))),
      ...((context.textSources || []).filter((source) => source?.source === 'inspection-report').map((source) => source.text)),
    ],
  )
  if (legacyDrive) {
    candidates.push(buildDriveCandidate(legacyDrive, {
      source: 'legacy-drive-parser',
      priority: 90,
      confidence: 0.4,
      path_or_label: 'extractDriveFromPairs()|inferDrive()',
      explicitContext: true,
    }))
  }

  return finalizeEvidenceResolution('drive_type', candidates, diagnostics, {
    emptyReason: 'value_not_found',
  })
}

async function fetchSupplementalVehiclePayload(encarId) {
  try {
    return {
      payload: await fetchEncarVehicleHtmlPayload(encarId),
      error: null,
    }
  } catch (error) {
    return {
      payload: null,
      error,
    }
  }
}

async function prepareVehicleEvidence(encarId, primaryPayload, { includeInspection = false, optionTexts = [], targets = null } = {}) {
  const requestedTargets = normalizeEnrichmentTargets(targets, { includeInspection })
  const shouldResolveVin = requestedTargets.vin
  const shouldResolveInteriorColor = requestedTargets.interiorColor
  const shouldResolveKeyInfo = requestedTargets.keyInfo
  const shouldResolveDriveType = requestedTargets.driveType
  let supplementalPayload = null
  let supplementalError = null

  let context = buildEvidenceContext(encarId, primaryPayload, {
    supplementalPayload,
    supplementalError,
    optionTexts,
  })

  let vinResult = shouldResolveVin ? resolveVinEvidence(context) : createSkippedEvidenceResult()
  let interiorColorResult = shouldResolveInteriorColor ? resolveInteriorColorEvidence(context) : createSkippedEvidenceResult()
  let keyInfoResult = shouldResolveKeyInfo ? resolveKeyInfoEvidence(context) : createSkippedEvidenceResult()
  let driveTypeResult = shouldResolveDriveType ? resolveDriveTypeEvidence(context) : createSkippedEvidenceResult()
  let inspection = null

  const needsEvidenceFallback = (
    (shouldResolveVin && !vinResult.value)
    || (shouldResolveInteriorColor && !interiorColorResult.value)
    || (shouldResolveKeyInfo && !keyInfoResult.value)
    || (shouldResolveDriveType && !driveTypeResult.value)
  )

  const needsSupplementalPayload = primaryPayload?.source === 'api'
    && (!supplementalPayload)
    && needsEvidenceFallback

  if (needsSupplementalPayload) {
    const supplementalResult = await fetchSupplementalVehiclePayload(encarId)
    supplementalPayload = supplementalResult.payload
    supplementalError = supplementalResult.error

    context = buildEvidenceContext(encarId, primaryPayload, {
      supplementalPayload,
      supplementalError,
      optionTexts,
    })
    vinResult = shouldResolveVin ? resolveVinEvidence(context) : vinResult
    interiorColorResult = shouldResolveInteriorColor ? resolveInteriorColorEvidence(context) : interiorColorResult
    keyInfoResult = shouldResolveKeyInfo ? resolveKeyInfoEvidence(context) : keyInfoResult
    driveTypeResult = shouldResolveDriveType ? resolveDriveTypeEvidence(context) : driveTypeResult
  }

  const needsInspectionFallback = (
    requestedTargets.includeInspection
    || (shouldResolveVin && !vinResult.value)
    || (shouldResolveInteriorColor && !interiorColorResult.value)
    || (shouldResolveKeyInfo && !keyInfoResult.value)
    || (shouldResolveDriveType && !driveTypeResult.value)
  )

  if (needsInspectionFallback) {
    try {
      inspection = await fetchEncarInspection(encarId, {
        vehicleNo: primaryPayload?.data?.vehicleNo || supplementalPayload?.data?.vehicleNo || '',
        includeHtml: requestedTargets.includeInspection
          || Boolean(primaryPayload?.ad?.diagnosisCar || primaryPayload?.view?.encarDiagnosis)
          || Array.isArray(primaryPayload?.condition?.inspection?.formats),
      })
    } catch (inspectionError) {
      console.warn('Encar inspection parse warning:', inspectionError.message)
    }

    if (inspection) {
      context = buildEvidenceContext(encarId, primaryPayload, {
        supplementalPayload,
        supplementalError,
        inspection,
        optionTexts,
      })
      vinResult = shouldResolveVin ? resolveVinEvidence(context) : vinResult
      interiorColorResult = shouldResolveInteriorColor ? resolveInteriorColorEvidence(context) : interiorColorResult
      keyInfoResult = shouldResolveKeyInfo ? resolveKeyInfoEvidence(context) : keyInfoResult
      driveTypeResult = shouldResolveDriveType ? resolveDriveTypeEvidence(context) : driveTypeResult
    }
  }

  return {
    context,
    inspection: requestedTargets.includeInspection ? inspection : null,
    vinResult,
    interiorColorResult,
    keyInfoResult,
    driveTypeResult,
  }
}

export async function fetchEncarVehicleDetail(encarId, { includeInspection = false, targets = null } = {}) {
  const requestedTargets = normalizeEnrichmentTargets(targets, { includeInspection })
  const vehiclePayload = await fetchEncarVehicleApiData(encarId)
  const {
    url,
    data,
    category,
    spec,
    ad,
    contact,
    manage,
    condition,
    contents,
    view,
    partnership,
    options,
    source,
  } = vehiclePayload
  const exchangeSnapshot = await getExchangeRateSnapshot()
  const pricingSettings = await getPricingSettings()
  const priceKRW = (Number(ad.price) || 0) * 10000

  const yearMonth = String(category.yearMonth || '')
  const year = yearMonth.length >= 6
    ? `${yearMonth.slice(0, 4)}-${yearMonth.slice(4, 6)}`
    : (yearMonth.slice(0, 4) || '')

  const manufacturerRaw = category.manufacturerEnglishName || category.manufacturerName || ''
  const modelGroupRaw = category.modelGroupEnglishName || category.modelGroupName || category.modelName || ''
  const gradeNameRaw = category.gradeDetailEnglishName || category.gradeDetailName || category.gradeName || ''

  const manufacturer = normalizeManufacturer(manufacturerRaw)
  const modelGroup = normalizeText(modelGroupRaw)
  const gradeName = normalizeText(gradeNameRaw)
  const trimLevel = normalizeTrimLevel(
    category.gradeDetailEnglishName,
    category.gradeDetailName,
    category.gradeName,
    category.gradeEnglishName,
  ) || extractTrimLevelFromTitle(
    category.gradeDetailEnglishName,
    category.gradeDetailName,
    category.gradeName,
    category.gradeEnglishName,
    ad.title,
    ad.subTitle,
  )

  const displayManufacturer = resolveManufacturerDisplayName(
    manufacturerRaw,
    manufacturer,
    modelGroupRaw,
    modelGroup,
    gradeNameRaw,
    gradeName,
    ad.title,
    ad.subTitle,
  )
  const name = appendTitleTrimSuffix(
    [displayManufacturer, modelGroup, gradeName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(),
    category.gradeDetailEnglishName,
    category.gradeDetailName,
    trimLevel,
  )
  const model = appendTitleTrimSuffix(
    [modelGroup, gradeName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(),
    category.gradeDetailEnglishName,
    category.gradeDetailName,
    trimLevel,
  )
  const bodyType = resolveBodyType(
    spec.bodyName,
    name,
    model,
    category.modelGroupEnglishName,
    category.modelGroupName,
    ad.title,
    ad.subTitle,
  )
  const vehicleClass = resolveVehicleClass(
    category.className || category.vehicleClassName || '',
    bodyType,
    name,
    model,
    trimLevel,
    category.modelGroupEnglishName,
    category.modelGroupName,
    ad.title,
    ad.subTitle,
  )

  const photos = Array.isArray(data?.photos) ? data.photos : []
  const normalizedPhotos = photos
    .map((photo, idx) => {
      const rawPath = photo?.path || photo?.location || photo?.url
      const abs = toAbsolutePhotoUrl(rawPath)
      if (!abs) return null
      return {
        id: `${photo?.code || 'photo'}-${idx}`,
        url: abs,
        type: photo?.type || null,
        updateDateTime: photo?.updateDateTime || null,
        desc: photo?.desc || null,
      }
    })
    .filter(Boolean)

  const imageUrls = normalizedPhotos.map((photo) => photo.url)
  const locationRaw = String(contact.address || '').trim()
  const bodyColor = normalizeColorName(spec.colorName)
  const warrantyInfo = extractWarrantyInfo(category)
  const optionTexts = shouldLoadOptionTexts(requestedTargets)
    ? await resolveEncarOptionTexts(options)
    : []
  const {
    inspection,
    vinResult,
    interiorColorResult,
    keyInfoResult,
    driveTypeResult,
  } = await prepareVehicleEvidence(encarId, vehiclePayload, {
    includeInspection,
    optionTexts,
    targets: requestedTargets,
  })
  const driveType = driveTypeResult.value
  const fees = resolveVehicleFees({
    name,
    model,
    body_type: bodyType,
    vehicle_class: vehicleClass,
    trim_level: trimLevel,
    drive_type: driveType,
    pricing_locked: false,
  }, pricingSettings)
  const pricing = computePricing({
    priceKrw: priceKRW,
    commission: fees.commission,
    delivery: fees.delivery,
    loading: fees.loading,
    unloading: fees.unloading,
    storage: fees.storage,
  }, exchangeSnapshot)
  const keyInfo = keyInfoResult.value
  const optionFeatures = requestedTargets.optionFeatures
    ? extractOptionFeatures({
      contentsText: contents.text,
      memoText: ad.memo,
      titleText: ad.title,
      subtitleText: ad.subTitle,
      oneLineText: ad.oneLineText,
      optionTexts,
      inspectionRows: inspection?.detailStatus || [],
    })
    : []

  return {
    encar_id: String(encarId),
    vehicle_id: data?.vehicleId || null,
    encar_url: url,
    name: name || `Encar ${encarId}`,
    model,
    year,
    mileage: Number(spec.mileage) || 0,
    body_color: bodyColor,
    interior_color: interiorColorResult.value,
    interior_color_source: interiorColorResult.source,
    interior_color_diagnostics: interiorColorResult.diagnostics,
    warranty: warrantyInfo,
    warranty_company: warrantyInfo?.provider || '',
    warranty_body_months: warrantyInfo?.body?.months || null,
    warranty_body_km: warrantyInfo?.body?.mileage || null,
    warranty_transmission_months: warrantyInfo?.transmission?.months || null,
    warranty_transmission_km: warrantyInfo?.transmission?.mileage || null,
    location: locationRaw,
    location_short: extractShortLocation(locationRaw),
    vin: vinResult.value,
    vin_source: vinResult.source,
    vin_diagnostics: vinResult.diagnostics,
    vehicle_no: data?.vehicleNo || '',
    price_krw: priceKRW,
    price_usd: pricing.price_usd,
    fuel_type: normalizeFuel(spec.fuelName),
    transmission: normalizeTransmission(spec.transmissionName),
    drive_type: driveType,
    drive_type_source: driveTypeResult.source,
    drive_type_diagnostics: driveTypeResult.diagnostics,
    body_type: bodyType,
    vehicle_class: vehicleClass,
    trim_level: trimLevel,
    key_info: keyInfo,
    key_info_source: keyInfoResult.source,
    key_info_diagnostics: keyInfoResult.diagnostics,
    option_features: optionFeatures,
    seat_count: Number(spec.seatCount) || null,
    displacement: Number(spec.displacement) || 0,
    images: imageUrls,
    photos: normalizedPhotos,
    manage: {
      registDateTime: manage.registDateTime || null,
      firstAdvertisedDateTime: manage.firstAdvertisedDateTime || null,
      modifyDateTime: manage.modifyDateTime || null,
      viewCount: Number(manage.viewCount) || 0,
      subscribeCount: Number(manage.subscribeCount) || 0,
    },
    condition: {
      seizingCount: Number(condition?.seizing?.seizingCount) || 0,
      pledgeCount: Number(condition?.seizing?.pledgeCount) || 0,
      accidentRecordView: Boolean(condition?.accident?.recordView),
      accidentResumeView: Boolean(condition?.accident?.resumeView),
      inspectionFormats: Array.isArray(condition?.inspection?.formats) ? condition.inspection.formats : [],
    },
    flags: {
      diagnosis: Boolean(ad.diagnosisCar || view.encarDiagnosis),
      meetGo: Boolean(view.encarMeetGo),
      hasEvBatteryInfo: Boolean(view.hasEvBatteryInfo),
      isPartneredVehicle: Boolean(partnership.isPartneredVehicle),
    },
    inspection,
    pricing_locked: false,
    delivery_profile_code: fees.delivery_profile_code,
    delivery_profile_label: fees.delivery_profile_label,
    delivery_profile_description: fees.delivery_profile_description,
    commission: fees.commission,
    delivery: fees.delivery,
    loading: fees.loading,
    unloading: fees.unloading,
    storage: fees.storage,
    vat_refund: pricing.vat_refund,
    total: pricing.total,
    exchange_rate_current: pricing.exchange_rate_current,
    exchange_rate_site: pricing.exchange_rate_site,
    exchange_rate_offset: pricing.exchange_rate_offset,
    vat_rate: pricing.vat_rate,
    parking_address_ko: PARKING_ADDRESS_KO,
    parking_address_en: PARKING_ADDRESS_EN,
    source,
  }
}

export async function fetchEncarVehicleEnrichment(encarId, { targets = null } = {}) {
  const requestedTargets = normalizeEnrichmentTargets(targets)
  const vehiclePayload = await fetchEncarVehicleApiData(encarId)
  const { data, category, spec, ad, contact, contents, options, source } = vehiclePayload
  const manufacturerRaw = category.manufacturerEnglishName || category.manufacturerName || ''
  const modelGroupRaw = category.modelGroupEnglishName || category.modelGroupName || category.modelName || ''
  const gradeNameRaw = category.gradeDetailEnglishName || category.gradeDetailName || category.gradeName || ''

  const manufacturer = normalizeManufacturer(manufacturerRaw)
  const modelGroup = normalizeText(modelGroupRaw)
  const gradeName = normalizeText(gradeNameRaw)
  const trimLevel = normalizeTrimLevel(
    category.gradeDetailEnglishName,
    category.gradeDetailName,
    category.gradeName,
    category.gradeEnglishName,
  ) || extractTrimLevelFromTitle(
    category.gradeDetailEnglishName,
    category.gradeDetailName,
    category.gradeName,
    category.gradeEnglishName,
    ad.title,
    ad.subTitle,
  )

  const displayManufacturer = resolveManufacturerDisplayName(
    manufacturerRaw,
    manufacturer,
    modelGroupRaw,
    modelGroup,
    gradeNameRaw,
    gradeName,
    ad.title,
    ad.subTitle,
  )
  const name = appendTitleTrimSuffix(
    [displayManufacturer, modelGroup, gradeName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(),
    category.gradeDetailEnglishName,
    category.gradeDetailName,
    trimLevel,
  )
  const model = appendTitleTrimSuffix(
    [modelGroup, gradeName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(),
    category.gradeDetailEnglishName,
    category.gradeDetailName,
    trimLevel,
  )

  const bodyColor = normalizeColorName(spec.colorName)
  const bodyType = resolveBodyType(
    spec.bodyName,
    name,
    model,
    category.modelGroupEnglishName,
    category.modelGroupName,
    ad.title,
    ad.subTitle,
  )
  const vehicleClass = resolveVehicleClass(
    category.className || category.vehicleClassName || '',
    bodyType,
    name,
    model,
    trimLevel,
    category.modelGroupEnglishName,
    category.modelGroupName,
    ad.title,
    ad.subTitle,
  )
  const warrantyInfo = extractWarrantyInfo(category)
  const optionTexts = shouldLoadOptionTexts(requestedTargets)
    ? await resolveEncarOptionTexts(options)
    : []
  const {
    inspection,
    vinResult,
    interiorColorResult,
    keyInfoResult,
    driveTypeResult,
  } = await prepareVehicleEvidence(encarId, vehiclePayload, {
    optionTexts,
    targets: requestedTargets,
  })
  const driveType = driveTypeResult.value
  const keyInfo = keyInfoResult.value
  const optionFeatures = requestedTargets.optionFeatures
    ? extractOptionFeatures({
      contentsText: contents?.text,
      memoText: ad.memo,
      titleText: ad.title,
      subtitleText: ad.subTitle,
      oneLineText: ad.oneLineText,
      optionTexts,
      inspectionRows: inspection?.detailStatus || [],
    })
    : []

  return {
    name,
    model,
    location: String(contact.address || '').trim(),
    vin: vinResult.value,
    vin_source: vinResult.source,
    vin_diagnostics: vinResult.diagnostics,
    vehicle_no: data?.vehicleNo || '',
    price_krw: (Number(ad.price) || 0) * 10000,
    fuel_type: normalizeFuel(spec.fuelName),
    transmission: normalizeTransmission(spec.transmissionName),
    drive_type: driveType,
    drive_type_source: driveTypeResult.source,
    drive_type_diagnostics: driveTypeResult.diagnostics,
    body_color: bodyColor,
    interior_color: interiorColorResult.value,
    interior_color_source: interiorColorResult.source,
    interior_color_diagnostics: interiorColorResult.diagnostics,
    key_info: keyInfo,
    key_info_source: keyInfoResult.source,
    key_info_diagnostics: keyInfoResult.diagnostics,
    warranty: warrantyInfo,
    warranty_company: warrantyInfo?.provider || '',
    warranty_body_months: warrantyInfo?.body?.months || null,
    warranty_body_km: warrantyInfo?.body?.mileage || null,
    warranty_transmission_months: warrantyInfo?.transmission?.months || null,
    warranty_transmission_km: warrantyInfo?.transmission?.mileage || null,
    option_features: optionFeatures,
    image_urls: Array.isArray(data?.photos)
      ? data.photos
        .map((photo) => toAbsolutePhotoUrl(photo?.path || photo?.location || photo?.url))
        .filter(Boolean)
      : [],
    body_type: bodyType,
    vehicle_class: vehicleClass,
    trim_level: trimLevel,
    vehicle_id: data?.vehicleId || data?.id || null,
    encar_url: `https://fem.encar.com/cars/detail/${encarId}`,
    source,
  }
}

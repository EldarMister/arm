import axios from 'axios'

const LIST_PAGE_SIZE = 20
const MIN_YEAR = 2019
const DEFAULT_MAX_PAGES = 25
const DEFAULT_STALE_PAGE_LIMIT = 4
const FRESH_RULES = Object.freeze({
  maxViewCount: 6,
  maxCallCount: 0,
  maxSubscribeCount: 0,
})

const PARSE_SCOPE_ALL = 'all'
const PARSE_SCOPE_DOMESTIC = 'domestic'
const PARSE_SCOPE_IMPORTED = 'imported'
const PARSE_SCOPE_JAPANESE = 'japanese'
const PARSE_SCOPE_GERMAN = 'german'

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

const KOREAN_VEHICLE_BRAND_RE = /\b(kia|gia|hyundai|hyeondae|genesis|jenesiseu|daewoo|renault(?:\s+korea|\s+samsung)|renault samsung|reunokoria|samsung|samseong|ssangyong|kg\s*mobility|kgmobilriti)\b/i
const KOREAN_VEHICLE_BRAND_HANGUL_RE = /\uAE30\uC544|\uD604\uB300|\uC81C\uB124\uC2DC\uC2A4|\uB300\uC6B0|\uB974\uB178\uCF54\uB9AC\uC544|\uC0BC\uC131|\uC30D\uC6A9|\uBAA8\uBE4C\uB9AC\uD2F0/u
const KOREAN_VEHICLE_MODEL_RE = /\b(sm3|sm5|sm6|sm7|qm3|qm5|qm6|xm3|k3|k5|k7|k8|k9|g70|g80|g90|gv60|gv70|gv80|eq900|avante|elantra|sonata|grandeur|azera|santafe|santa\s*fe|tucson|palisade|staria|starex|porter|bongo|casper|morning|ray|carnival|sorento|sportage|seltos|mohave|niro|kona|orlando|trailblazer|trax|malibu|spark|matiz|damas|labo|rexton|actyon|korando|tivoli|torres|musso|bolteu|bolt|ioniq|aionik|veloster|stinger|soul|ssoul|ev3|ev4|ev5|ev6|ev9)\b/i

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function readPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeManufacturer(value) {
  const raw = cleanText(value)
  if (!raw) return ''
  if (/renault[-\s]*korea\s*\(?\s*(samseong|samsung)?\s*\)?/i.test(raw)) return 'Renault Korea'
  if (/reunokoria\s*\(?\s*(samseong|samsung)?\s*\)?/i.test(raw)) return 'Renault Korea'
  if (/kgmobilriti/i.test(raw) || /kg mobility/i.test(raw)) return 'KG Mobility'
  if (/ssangyong/i.test(raw)) return 'SsangYong'
  return raw
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

function classifyVehicleOrigin(...values) {
  const text = values
    .map((value) => cleanText(value))
    .filter(Boolean)
    .join(' ')

  if (!text) return 'imported'
  if (
    KOREAN_VEHICLE_BRAND_RE.test(text)
    || KOREAN_VEHICLE_BRAND_HANGUL_RE.test(text)
    || KOREAN_VEHICLE_MODEL_RE.test(text)
  ) {
    return 'korean'
  }

  return 'imported'
}

function normalizeParseScope(value) {
  return value === PARSE_SCOPE_DOMESTIC
    || value === PARSE_SCOPE_IMPORTED
    || value === PARSE_SCOPE_JAPANESE
    || value === PARSE_SCOPE_GERMAN
    ? value
    : PARSE_SCOPE_ALL
}

function parseListYear(rawYear) {
  const match = cleanText(rawYear).match(/\d{4}/)
  return match ? Number.parseInt(match[0], 10) : 0
}

function buildListQuery() {
  return '(And.Hidden.N._.Year.range(201900..).)'
}

function buildVehicleTitle(category = {}, ad = {}, encarId = '') {
  const manufacturer = cleanText(category?.manufacturerEnglishName || category?.manufacturerName)
  const modelGroup = cleanText(category?.modelGroupEnglishName || category?.modelGroupName || category?.modelName)
  const grade = cleanText(category?.gradeDetailEnglishName || category?.gradeDetailName || category?.gradeName || category?.gradeEnglishName)
  return [manufacturer, modelGroup, grade].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
    || cleanText(ad?.title)
    || `Encar ${encarId}`
}

function buildTrimLevel(category = {}) {
  return cleanText(
    category?.gradeDetailEnglishName
    || category?.gradeDetailName
    || category?.gradeName
    || category?.gradeEnglishName,
  )
}

function parseYear(category = {}, fallbackRaw = {}) {
  const yearMonth = cleanText(category?.yearMonth)
  if (yearMonth.length >= 4) {
    return yearMonth.slice(0, 4)
  }
  return cleanText(fallbackRaw?.Year).slice(0, 4)
}

function buildManageMetrics(manage = {}, contact = {}) {
  const callMetricCandidates = [
    ['manage.callCount', manage?.callCount],
    ['manage.consultCount', manage?.consultCount],
    ['manage.inquiryCount', manage?.inquiryCount],
    ['manage.contactCount', manage?.contactCount],
    ['contact.callCount', contact?.callCount],
    ['contact.consultCount', contact?.consultCount],
    ['contact.inquiryCount', contact?.inquiryCount],
    ['contact.contactCount', contact?.contactCount],
  ]

  let callCount = 0
  for (const [, rawValue] of callMetricCandidates) {
    const numeric = Number(rawValue)
    if (Number.isFinite(numeric) && numeric >= 0) {
      callCount = numeric
      break
    }
  }

  return {
    viewCount: Math.max(0, Number(manage?.viewCount) || 0),
    subscribeCount: Math.max(0, Number(manage?.subscribeCount) || 0),
    callCount: Math.max(0, Number(callCount) || 0),
  }
}

function matchesParseScope(listing, parseScope) {
  const normalizedScope = normalizeParseScope(parseScope)
  if (normalizedScope === PARSE_SCOPE_ALL) return true

  const origin = classifyVehicleOrigin(
    listing?.manufacturer,
    listing?.name,
    listing?.model,
  )

  if (normalizedScope === PARSE_SCOPE_DOMESTIC) return origin === 'korean'
  if (normalizedScope === PARSE_SCOPE_IMPORTED) return origin === 'imported'
  if (normalizedScope === PARSE_SCOPE_JAPANESE) {
    return matchesAliases([listing?.manufacturer, listing?.name, listing?.model], JAPANESE_BRAND_ALIASES)
  }
  if (normalizedScope === PARSE_SCOPE_GERMAN) {
    return matchesAliases([listing?.manufacturer, listing?.name, listing?.model], GERMAN_BRAND_ALIASES)
  }

  return true
}

function passesFreshRules(manage) {
  const viewCount = Math.max(0, Number(manage?.viewCount) || 0)
  const callCount = Math.max(0, Number(manage?.callCount) || 0)
  const subscribeCount = Math.max(0, Number(manage?.subscribeCount) || 0)

  return viewCount <= FRESH_RULES.maxViewCount
    && callCount <= FRESH_RULES.maxCallCount
    && subscribeCount <= FRESH_RULES.maxSubscribeCount
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createApiClient(timeoutMs) {
  return axios.create({
    baseURL: 'https://api.encar.com',
    timeout: timeoutMs,
    proxy: false,
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      Origin: 'https://www.encar.com',
      Referer: 'https://www.encar.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  })
}

export function createStandaloneEncarClient(env = {}) {
  const apiClient = createApiClient(readPositiveInteger(env.ENCAR_REQUEST_TIMEOUT_MS, 25000))
  const maxPages = readPositiveInteger(env.TELEGRAM_FRESH_MAX_PAGES, DEFAULT_MAX_PAGES)
  const stalePageLimit = readPositiveInteger(env.TELEGRAM_FRESH_STALE_PAGE_LIMIT, DEFAULT_STALE_PAGE_LIMIT)
  const detailDelayMs = Math.max(0, Number.parseInt(String(env.TELEGRAM_FRESH_DETAIL_DELAY_MS || '150'), 10) || 150)
  const pageDelayMs = Math.max(0, Number.parseInt(String(env.TELEGRAM_FRESH_PAGE_DELAY_MS || '250'), 10) || 250)

  async function fetchListPage(offset = 0) {
    const response = await apiClient.get('/search/car/list/premium', {
      params: {
        count: true,
        q: buildListQuery(),
        sr: `|ModifiedDate|${offset}|${LIST_PAGE_SIZE}`,
      },
    })

    return {
      total: Number(response?.data?.Count) || 0,
      cars: Array.isArray(response?.data?.SearchResults) ? response.data.SearchResults : [],
    }
  }

  async function fetchVehicleDetail(encarId, fallbackRaw = {}) {
    const response = await apiClient.get(`/v1/readside/vehicle/${encodeURIComponent(encarId)}`)
    const data = response?.data || {}
    const category = data?.category || {}
    const spec = data?.spec || {}
    const ad = data?.advertisement || {}
    const contact = data?.contact || {}
    const manage = data?.manage || {}

    return {
      encarId: cleanText(encarId),
      manufacturer: normalizeManufacturer(category?.manufacturerEnglishName || category?.manufacturerName || fallbackRaw?.Manufacturer),
      name: buildVehicleTitle(category, ad, encarId),
      model: cleanText(category?.modelGroupEnglishName || category?.modelGroupName || category?.modelName || fallbackRaw?.Model),
      trimLevel: buildTrimLevel(category),
      fuelType: cleanText(spec?.fuelName),
      year: parseYear(category, fallbackRaw),
      mileage: Math.max(0, Number(spec?.mileage) || Number(fallbackRaw?.Mileage) || 0),
      priceKrw: Math.max(0, (Number(ad?.price) || Number(fallbackRaw?.Price) || 0) * 10000),
      manage: buildManageMetrics(manage, contact),
      encarUrl: `https://fem.encar.com/cars/detail/${encodeURIComponent(encarId)}`,
    }
  }

  async function scanFreshListings({
    getActiveSessions,
    stateStore,
    onFreshListing,
    onLog = () => {},
  } = {}) {
    let offset = 0
    let pagesProcessed = 0
    let stalePages = 0
    let newFreshCount = 0

    while (pagesProcessed < maxPages) {
      const currentSessions = getActiveSessions()
      if (!currentSessions.length) break

      const page = await fetchListPage(offset)
      const pageCars = Array.isArray(page.cars) ? page.cars : []
      if (!pageCars.length) break

      pagesProcessed += 1
      offset += pageCars.length
      let pageFreshHits = 0

      for (const raw of pageCars) {
        const activeSessions = getActiveSessions()
        if (!activeSessions.length) break

        const encarId = cleanText(raw?.Id)
        if (!encarId) continue
        if (stateStore.getSeenListing(encarId)) continue

        const rawYear = parseListYear(raw?.Year)
        if (!Number.isFinite(rawYear) || rawYear < MIN_YEAR) {
          stateStore.rememberListing(encarId, { qualifiesFresh: false })
          continue
        }

        const rawListing = {
          manufacturer: normalizeManufacturer(raw?.Manufacturer),
          name: cleanText(raw?.Name),
          model: cleanText(raw?.Model || raw?.Badge),
        }

        const sessionsMatchingRaw = activeSessions.filter((session) => matchesParseScope(rawListing, session.parseScope))
        if (!sessionsMatchingRaw.length) continue

        let detail = null
        try {
          detail = await fetchVehicleDetail(encarId, raw)
        } catch (error) {
          onLog(`DETAIL_FETCH_FAILED | encar_id=${encarId} | ${cleanText(error?.message) || 'unknown error'}`)
          continue
        }

        const qualifiesFresh = passesFreshRules(detail.manage)
        stateStore.rememberListing(encarId, {
          priceKrw: detail.priceKrw,
          viewCount: detail.manage.viewCount,
          callCount: detail.manage.callCount,
          subscribeCount: detail.manage.subscribeCount,
          qualifiesFresh,
        })

        if (!qualifiesFresh) continue

        const latestSessions = getActiveSessions()
        const matchingChatIds = latestSessions
          .filter((session) => matchesParseScope(detail, session.parseScope))
          .map((session) => session.chatId)

        if (!matchingChatIds.length) continue

        pageFreshHits += 1
        newFreshCount += 1
        await onFreshListing(detail, matchingChatIds)
        stateStore.rememberListing(encarId, {
          priceKrw: detail.priceKrw,
          viewCount: detail.manage.viewCount,
          callCount: detail.manage.callCount,
          subscribeCount: detail.manage.subscribeCount,
          qualifiesFresh: true,
          notifiedAt: new Date().toISOString(),
        })

        if (detailDelayMs > 0) {
          await sleep(detailDelayMs)
        }
      }

      if (pageFreshHits === 0) {
        stalePages += 1
      } else {
        stalePages = 0
      }

      if (stalePages >= stalePageLimit) break
      if (pageCars.length < LIST_PAGE_SIZE) break

      if (pageDelayMs > 0) {
        await sleep(pageDelayMs)
      }
    }

    return {
      pagesProcessed,
      newFreshCount,
    }
  }

  return {
    scanFreshListings,
  }
}

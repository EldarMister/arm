import axios from 'axios'
import { isBlockedCatalogPrice } from '../lib/catalogPriceRules.js'
import { classifyVehicleOrigin, VEHICLE_ORIGIN_LABELS } from '../lib/vehicleData.js'

export function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }

export function jitter(min = 1500, max = 3500) {
  return sleep(min + Math.random() * (max - min))
}

function toAbsoluteEncarPhotoUrl(url) {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('/')) return `https://ci.encar.com${url}`
  return `https://ci.encar.com/${url}`
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
]

let uaIdx = 0
function nextUA() { return USER_AGENTS[uaIdx++ % USER_AGENTS.length] }

const ENCAR_PROXY_URL = (globalThis.process?.env?.ENCAR_PROXY_URL || '').trim().replace(/\/$/, '')
const ENCAR_DEFAULT_SORT = 'ModifiedDate'
const MIN_LIST_YEAR = 2019
const MAX_LIST_TOP_UP_PAGES = 6
const PAGE_FETCH_SIZE = 20
const PARSE_SCOPE_ALL = 'all'
const PARSE_SCOPE_IMPORTED = 'imported'
const PARSE_SCOPE_JAPANESE = 'japanese'
const PARSE_SCOPE_GERMAN = 'german'
const IMPORT_ONLY_SCOPES = new Set([
  PARSE_SCOPE_IMPORTED,
  PARSE_SCOPE_JAPANESE,
  PARSE_SCOPE_GERMAN,
])

function normalizeParseScope(parseScope = PARSE_SCOPE_ALL) {
  return IMPORT_ONLY_SCOPES.has(parseScope) ? parseScope : PARSE_SCOPE_ALL
}

function buildEncarListQuery(parseScope = PARSE_SCOPE_ALL) {
  const normalizedScope = normalizeParseScope(parseScope)
  const carType = IMPORT_ONLY_SCOPES.has(normalizedScope) ? 'N' : 'Y'
  return `(And.Hidden.N._.CarType.${carType}._.Year.range(201900..).)`
}

const apiClient = axios.create({
  baseURL: 'https://api.encar.com',
  timeout: 25000,
  proxy: false,
  headers: {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    Origin: 'https://www.encar.com',
    Referer: 'https://www.encar.com/',
  },
})

function asListResult(data) {
  return {
    total: Number(data?.Count) || 0,
    cars: Array.isArray(data?.SearchResults) ? data.SearchResults : [],
  }
}

function parseListYear(rawYear) {
  const match = String(rawYear || '').match(/\d{4}/)
  return match ? Number.parseInt(match[0], 10) : 0
}

function parseListPriceKrw(rawPrice) {
  const numeric = Number(rawPrice) || 0
  return numeric > 0 ? numeric * 10000 : 0
}

function isUsableListCar(raw) {
  const year = parseListYear(raw?.Year)
  if (!Number.isFinite(year) || year < MIN_LIST_YEAR) return false

  const priceKrw = parseListPriceKrw(raw?.Price)
  if (isBlockedCatalogPrice({ priceKrw })) return false

  return true
}

function buildOriginSignal(raw) {
  return [
    raw?.Manufacturer,
    raw?.Model,
    raw?.Badge,
    raw?.Name,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
}

function getImportedOriginRatio(cars = []) {
  const sample = cars
    .map((raw) => buildOriginSignal(raw))
    .filter(Boolean)
    .slice(0, 10)

  if (!sample.length) return 1

  const importedCount = sample.filter((value) => classifyVehicleOrigin(value) === VEHICLE_ORIGIN_LABELS.imported).length
  return importedCount / sample.length
}

function createListScopeMismatchError(parseScope, source, cars = []) {
  const ratio = getImportedOriginRatio(cars)
  const sample = cars.slice(0, 3).map((raw) => `${raw?.Manufacturer || '-'} ${raw?.Model || ''}`.trim()).join(' | ')
  const error = new Error(`List source mismatch for scope=${parseScope} via ${source}; importedRatio=${ratio.toFixed(2)}; sample=${sample}`)
  error.code = 'LIST_SCOPE_MISMATCH'
  error.parseScope = parseScope
  error.source = source
  error.importedRatio = ratio
  return error
}

function isListScopeMismatch(parseScope, cars = []) {
  if (!IMPORT_ONLY_SCOPES.has(parseScope)) return false
  if (!Array.isArray(cars) || cars.length < 5) return false
  return getImportedOriginRatio(cars) < 0.6
}

async function fetchListViaProxy(offset, pageLimit, parseScope = PARSE_SCOPE_ALL) {
  const resp = await axios.get(ENCAR_PROXY_URL, {
    timeout: 25000,
    proxy: false,
    params: {
      endpoint: 'list',
      offset,
      limit: pageLimit,
      count: true,
      q: buildEncarListQuery(parseScope),
      sr: `|${ENCAR_DEFAULT_SORT}|${offset}|${pageLimit}`,
      sort: ENCAR_DEFAULT_SORT,
    },
    headers: {
      'User-Agent': nextUA(),
      Accept: 'application/json, text/plain, */*',
    },
  })

  return asListResult(resp.data)
}

async function fetchListDirect(offset, pageLimit, parseScope = PARSE_SCOPE_ALL) {
  const resp = await apiClient.get('/search/car/list/premium', {
    params: {
      count: true,
      q: buildEncarListQuery(parseScope),
      sr: `|${ENCAR_DEFAULT_SORT}|${offset}|${pageLimit}`,
    },
    headers: { 'User-Agent': nextUA() },
  })
  return asListResult(resp.data)
}

function getListFetchers() {
  const fetchers = []
  if (ENCAR_PROXY_URL) {
    fetchers.push({
      name: 'proxy',
      run: (offset, pageLimit, parseScope) => fetchListViaProxy(offset, pageLimit, parseScope),
    })
  }
  fetchers.push({
    name: 'direct',
    run: (offset, pageLimit, parseScope) => fetchListDirect(offset, pageLimit, parseScope),
  })
  return fetchers
}

async function fetchBatchWithFallback(offset, pageLimit, parseScope, preferredSource) {
  const fetchers = getListFetchers()
  const orderedFetchers = [
    ...fetchers.filter((fetcher) => fetcher.name === preferredSource),
    ...fetchers.filter((fetcher) => fetcher.name !== preferredSource),
  ]

  let lastError = null

  for (const fetcher of orderedFetchers) {
    try {
      const batch = await fetcher.run(offset, pageLimit, parseScope)
      if (isListScopeMismatch(parseScope, batch.cars)) {
        lastError = createListScopeMismatchError(parseScope, fetcher.name, batch.cars)
        continue
      }

      return { batch, source: fetcher.name }
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error(`Failed to fetch Encar list for scope=${parseScope}`)
}

function withProxyHint(err) {
  const status = err?.response?.status
  if (status === 407) {
    err.message = `Proxy auth required (407). Set ENCAR_PROXY_URL=https://<your-vercel-domain>/api/proxy. ${err.message}`
  }
  return err
}

/**
 * Fetch paginated car list from Encar API (via Vercel proxy if ENCAR_PROXY_URL is set)
 * @param {number} offset
 * @param {number} limit max 20 per page
 * @param {number} retries
 * @param {{ parseScope?: 'all' | 'imported' | 'japanese' | 'german' }} options
 * @returns {{ total: number, cars: object[] }}
 */
export async function fetchCarList(offset = 0, limit = 20, retries = 3, options = {}) {
  const pageLimit = Math.min(limit, 20)
  const parseScope = normalizeParseScope(options?.parseScope)

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      let activeSource = ENCAR_PROXY_URL ? 'proxy' : 'direct'
      let total = 0
      let scanned = 0
      let nextOffset = offset
      let pagesFetched = 0
      const collected = []

      while (collected.length < pageLimit && pagesFetched < MAX_LIST_TOP_UP_PAGES) {
        const { batch, source } = await fetchBatchWithFallback(nextOffset, PAGE_FETCH_SIZE, parseScope, activeSource)
        activeSource = source

        if (!total) total = batch.total
        const batchCars = Array.isArray(batch.cars) ? batch.cars : []
        if (!batchCars.length) break

        pagesFetched += 1
        nextOffset += batchCars.length
        scanned += batchCars.length

        for (const raw of batchCars) {
          if (!isUsableListCar(raw)) continue
          collected.push(raw)
          if (collected.length >= pageLimit) break
        }

        if (batchCars.length < PAGE_FETCH_SIZE) break
      }

      return {
        total,
        cars: collected.slice(0, pageLimit),
        scanned,
        listSource: activeSource,
      }
    } catch (err) {
      withProxyHint(err)
      if (attempt === retries) throw err
      await sleep(3000 * attempt)
    }
  }
}

/**
 * Extract photo URLs directly from Encar list payload.
 * Prefers explicit Photos[] locations, then falls back to Photo prefix pattern.
 */
export function extractPhotoUrls(raw, maxPhotos = 8) {
  const urls = []

  if (Array.isArray(raw?.Photos)) {
    const sorted = [...raw.Photos].sort((a, b) => (a?.ordering || 0) - (b?.ordering || 0))
    for (const p of sorted) {
      const abs = toAbsoluteEncarPhotoUrl(p?.location)
      if (abs && !urls.includes(abs)) urls.push(abs)
      if (urls.length >= maxPhotos) return urls
    }
    if (urls.length > 0) return urls
  }

  if (typeof raw?.Photo === 'string' && raw.Photo) {
    const prefix = toAbsoluteEncarPhotoUrl(raw.Photo)
    if (prefix) {
      for (let i = 1; i <= maxPhotos; i++) {
        const num = String(i).padStart(3, '0')
        const candidate = `${prefix}${num}.jpg`
        if (!urls.includes(candidate)) urls.push(candidate)
      }
    }
  }

  return urls.slice(0, maxPhotos)
}

/**
 * Build photo URLs by Encar's CDN pattern:
 * https://ci.encar.com/carpicture{id[0:2]}/{id[2:5]}/{id}{num:03d}.jpg
 */
export function buildPhotoUrls(carId, maxPhotos = 12) {
  const id = String(carId)
  if (id.length < 6) return []

  const prefix = id.substring(0, 2)
  const mid = id.substring(2, 5)
  const urls = []

  for (let i = 1; i <= maxPhotos; i++) {
    const num = String(i).padStart(3, '0')
    urls.push(`https://ci.encar.com/carpicture${prefix}/${mid}/${id}${num}.jpg`)
  }
  return urls
}

/**
 * Probe which photo URLs actually exist (HEAD request)
 * Returns only valid ones (up to maxPhotos)
 */
export async function probePhotoUrls(carId, maxPhotos = 8) {
  const urls = buildPhotoUrls(carId, maxPhotos + 4)
  const valid = []

  for (const url of urls) {
    if (valid.length >= maxPhotos) break
    try {
      const resp = await axios.head(url, {
        timeout: 6000,
        proxy: false,
        headers: {
          'User-Agent': nextUA(),
          Referer: 'https://www.encar.com/',
        },
        validateStatus: (status) => status < 500,
      })
      if (resp.status === 200) {
        valid.push(url)
      } else if (valid.length > 0) {
        // Stop probing after first miss once at least one real image was found.
        break
      }
    } catch {
      if (valid.length > 0) break
    }
    await sleep(300)
  }

  return valid
}

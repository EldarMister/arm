import axios from 'axios'
import { isBlockedCatalogPrice } from '../lib/catalogPriceRules.js'

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

const ENCAR_PROXY_URL = (process.env.ENCAR_PROXY_URL || '').trim().replace(/\/$/, '')
const ENCAR_DEFAULT_QUERY = '(And.Hidden.N._.CarType.Y._.Year.range(201900..).)'
const ENCAR_DEFAULT_SORT = 'ModifiedDate'
const MIN_LIST_YEAR = 2019
const MAX_LIST_TOP_UP_PAGES = 6
const PAGE_FETCH_SIZE = 20

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

async function fetchListViaProxy(offset, pageLimit) {
  const resp = await axios.get(ENCAR_PROXY_URL, {
    timeout: 25000,
    proxy: false,
    params: {
      endpoint: 'list',
      offset,
      limit: pageLimit,
      count: true,
      q: ENCAR_DEFAULT_QUERY,
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

async function fetchListDirect(offset, pageLimit) {
  const resp = await apiClient.get('/search/car/list/premium', {
    params: {
      count: true,
      q: ENCAR_DEFAULT_QUERY,
      sr: `|${ENCAR_DEFAULT_SORT}|${offset}|${pageLimit}`,
    },
    headers: { 'User-Agent': nextUA() },
  })
  return asListResult(resp.data)
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
 * @returns {{ total: number, cars: object[] }}
 */
export async function fetchCarList(offset = 0, limit = 20, retries = 3) {
  const pageLimit = Math.min(limit, 20)

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      let total = 0
      let scanned = 0
      let nextOffset = offset
      let pagesFetched = 0
      const collected = []

      while (collected.length < pageLimit && pagesFetched < MAX_LIST_TOP_UP_PAGES) {
        const batch = ENCAR_PROXY_URL
          ? await fetchListViaProxy(nextOffset, PAGE_FETCH_SIZE)
          : await fetchListDirect(nextOffset, PAGE_FETCH_SIZE)

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

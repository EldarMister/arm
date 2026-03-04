import axios from 'axios'

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

export function jitter(min = 1500, max = 3500) {
  return sleep(min + Math.random() * (max - min))
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

const apiClient = axios.create({
  baseURL: 'https://api.encar.com',
  timeout: 25000,
  headers: {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    Origin: 'https://www.encar.com',
    Referer: 'https://www.encar.com/',
  },
})

/**
 * Fetch paginated car list from Encar public API
 * @param {number} offset
 * @param {number} limit  max 20 per page
 * @returns {{ total: number, cars: object[] }}
 */
export async function fetchCarList(offset = 0, limit = 20, retries = 3) {
  const pageLimit = Math.min(limit, 20)
  const params = new URLSearchParams({
    count: 'true',
    q:    '(And.Hidden.N._.SellType.일반.)',
    sr:   `|RegDate|${offset}|${pageLimit}`,
  })

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resp = await apiClient.get(`/search/car/list/premium?${params}`, {
        headers: { 'User-Agent': nextUA() },
      })
      return {
        total: resp.data.Count || 0,
        cars:  resp.data.SearchResults || [],
      }
    } catch (err) {
      if (attempt === retries) throw err
      await sleep(3000 * attempt)
    }
  }
}

/**
 * Build photo URLs by Encar's CDN pattern:
 * https://ci.encar.com/carpicture{id[0:2]}/{id[2:5]}/{id}{num:03d}.jpg
 */
export function buildPhotoUrls(carId, maxPhotos = 12) {
  const id = String(carId)
  if (id.length < 6) return []

  const prefix = id.substring(0, 2)
  const mid    = id.substring(2, 5)
  const urls   = []

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
  const urls  = buildPhotoUrls(carId, maxPhotos + 4)
  const valid = []

  for (const url of urls) {
    if (valid.length >= maxPhotos) break
    try {
      const resp = await axios.head(url, {
        timeout: 6000,
        headers: {
          'User-Agent': nextUA(),
          Referer: 'https://www.encar.com/',
        },
        validateStatus: (s) => s < 500,
      })
      if (resp.status === 200) {
        valid.push(url)
      } else {
        // After first 404 following a successful photo, stop probing
        if (valid.length > 0) break
      }
    } catch {
      if (valid.length > 0) break
    }
    await sleep(300)
  }

  return valid
}

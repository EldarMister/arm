import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import axios from 'axios'
import { fileURLToPath } from 'url'

const __dirname  = path.dirname(fileURLToPath(import.meta.url))
const UPLOADS_DIR = path.resolve(__dirname, '..', 'uploads', 'cars')

// Ensure directory exists on module load
fs.mkdirSync(UPLOADS_DIR, { recursive: true })

/**
 * Download a single image from URL and save it to /uploads/cars/
 * Returns local URL path or null on failure
 */
export async function downloadImage(url, carId) {
  if (!url || !url.startsWith('http')) return null

  // Filename: car_{id}_{md5(url)}.jpg — deduplication by URL
  const hash     = crypto.createHash('md5').update(url).digest('hex').substring(0, 10)
  const ext      = (path.extname(url.split('?')[0]) || '.jpg').toLowerCase()
  const filename = `car_${carId}_${hash}${ext}`
  const filepath = path.join(UPLOADS_DIR, filename)

  // Already downloaded — skip
  if (fs.existsSync(filepath)) return `/uploads/cars/${filename}`

  try {
    const resp = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 20000,
      maxContentLength: 25 * 1024 * 1024, // 25 MB max per image
      headers: {
        'User-Agent':  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer':     'https://www.encar.com/',
        'Accept':      'image/webp,image/apng,image/*,*/*;q=0.8',
      },
      validateStatus: (s) => s === 200,
    })

    const ct = resp.headers['content-type'] || ''
    if (!ct.startsWith('image/')) return null

    fs.writeFileSync(filepath, Buffer.from(resp.data))
    return `/uploads/cars/${filename}`
  } catch {
    return null
  }
}

/**
 * Download multiple images for a car.
 * Returns array of local URL paths (only successful ones).
 */
export async function downloadPhotos(photoUrls, carId, maxPhotos = 8) {
  const results = []
  const toDownload = photoUrls.slice(0, maxPhotos)

  for (const url of toDownload) {
    const local = await downloadImage(url, carId)
    if (local) results.push(local)
  }

  return results
}

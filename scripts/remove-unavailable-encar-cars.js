import axios from 'axios'
import pool from '../server/db.js'

const apiClient = axios.create({
  baseURL: 'https://api.encar.com',
  timeout: 15000,
  proxy: false,
  validateStatus: (status) => status === 200 || status === 404,
  headers: {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    Origin: 'https://www.encar.com',
    Referer: 'https://www.encar.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  },
})

const DEFAULT_CONCURRENCY = (() => {
  const raw = Number.parseInt(process.env.ENCAR_CLEANUP_CONCURRENCY || '6', 10)
  if (!Number.isFinite(raw)) return 6
  return Math.min(Math.max(raw, 1), 10)
})()

async function fetchCars() {
  const { rows } = await pool.query(`
    SELECT id, encar_id, name
    FROM cars
    WHERE encar_id IS NOT NULL AND BTRIM(encar_id) != ''
    ORDER BY id ASC
  `)

  return rows
}

async function existsInEncar(encarId) {
  const response = await apiClient.get(`/v1/readside/vehicle/${encodeURIComponent(encarId)}`)
  return response.status === 200
}

async function deleteCar(id) {
  await pool.query('DELETE FROM cars WHERE id = $1', [id])
}

async function main() {
  const cars = await fetchCars()
  const stats = {
    total: cars.length,
    checked: 0,
    removed: 0,
    kept: 0,
    errors: 0,
  }

  let nextIndex = 0
  let lastLogAt = 0

  const workers = Array.from({ length: Math.min(DEFAULT_CONCURRENCY, cars.length || 1) }, async () => {
    while (true) {
      const currentIndex = nextIndex++
      if (currentIndex >= cars.length) return

      const car = cars[currentIndex]

      try {
        const exists = await existsInEncar(car.encar_id)
        if (!exists) {
          await deleteCar(car.id)
          stats.removed += 1
        } else {
          stats.kept += 1
        }
      } catch (error) {
        stats.errors += 1
        console.warn(`ERR id=${car.id} encar=${car.encar_id}: ${error.message}`)
      } finally {
        stats.checked += 1
        if (stats.checked === stats.total || stats.checked - lastLogAt >= 100) {
          lastLogAt = stats.checked
          console.log(`progress ${stats.checked}/${stats.total} | removed=${stats.removed} kept=${stats.kept} errors=${stats.errors}`)
        }
      }
    }
  })

  await Promise.all(workers)
  console.log(JSON.stringify(stats, null, 2))
}

try {
  await main()
} finally {
  await pool.end()
}

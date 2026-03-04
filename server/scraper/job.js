import pool from '../db.js'
import { fetchCarList, probePhotoUrls, jitter, sleep } from './encarApi.js'
import { downloadPhotos } from './downloader.js'
import {
  MANUFACTURER_MAP, FUEL_MAP, GEAR_MAP, COLOR_MAP,
  tr, parseYear, priceToKRW, krwToUsd,
} from './translator.js'
import { state } from './state.js'

const PAGE_SIZE = 20

// ─── Map raw Encar car to our DB shape ───────────────────────────────────────
function mapCar(raw) {
  const manufacturer = tr(MANUFACTURER_MAP, raw.Manufacturer || '')
  const model        = raw.Model   || ''
  const badge        = raw.Badge   || ''
  const year         = parseYear(raw.Year)
  const mileage      = Number(raw.Mileage) || 0
  const price_krw    = priceToKRW(raw.Price)
  const price_usd    = krwToUsd(price_krw)
  const fuel_type    = tr(FUEL_MAP,  raw.FuelType  || '')
  const gear_type    = tr(GEAR_MAP,  raw.GearType  || '')
  const body_color   = tr(COLOR_MAP, raw.Color     || '')
  const encar_id     = String(raw.Id || '')
  const encar_url    = `https://www.encar.com/dc/dc_cardetailview.do?carid=${raw.Id}`

  const name = [manufacturer, model, badge].filter(Boolean).join(' ')

  const tags = []
  if (gear_type) tags.push(gear_type)
  if (fuel_type) tags.push(fuel_type)

  return {
    name, model: [model, badge].filter(Boolean).join(' '),
    year: year ? String(year) : null,
    mileage, price_krw, price_usd,
    fuel_type, body_color, location: 'Корея',
    encar_url, encar_id, tags,
    can_negotiate: true,
    thumbnail: raw.Thumbnail || raw.Photo || null,
  }
}

// ─── DB helpers ───────────────────────────────────────────────────────────────
async function getExistingId(encarId) {
  const res = await pool.query(
    'SELECT id FROM cars WHERE encar_id = $1',
    [String(encarId)]
  )
  return res.rows.length ? res.rows[0].id : null
}

async function insertCar(car, photoUrls) {
  const res = await pool.query(
    `INSERT INTO cars
       (name, model, year, mileage, price_krw, price_usd, fuel_type,
        body_color, location, encar_url, encar_id, tags, can_negotiate)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id`,
    [
      car.name, car.model, car.year, car.mileage,
      car.price_krw, car.price_usd, car.fuel_type,
      car.body_color, car.location, car.encar_url,
      car.encar_id, car.tags, car.can_negotiate,
    ]
  )
  const carId = res.rows[0].id

  for (let i = 0; i < photoUrls.length; i++) {
    await pool.query(
      'INSERT INTO car_images (car_id, url, position) VALUES ($1,$2,$3)',
      [carId, photoUrls[i], i]
    )
  }
  return carId
}

async function updateScrapeStats(added) {
  try {
    await pool.query(
      `UPDATE scraper_config
       SET total_scraped = total_scraped + $1,
           today_scraped = today_scraped + $1,
           last_run      = NOW()
       WHERE id = 1`,
      [added]
    )
  } catch { /* non-critical */ }
}

// ─── Main job ─────────────────────────────────────────────────────────────────
export async function runScrapeJob(limit = 100) {
  if (state.isRunning) throw new Error('Парсер уже запущен')

  state.isRunning  = true
  state.stopReq    = false
  state.startedAt  = new Date().toISOString()
  state.lastRun    = state.startedAt
  state.progress   = { done: 0, total: limit, failed: 0, skipped: 0, photos: 0 }

  state.info(`🚀 Запуск парсера — лимит ${limit} машин`)

  let offset    = 0
  let processed = 0
  let addedThisRun = 0

  try {
    while (processed < limit && !state.stopReq) {
      // ── Fetch page ──────────────────────────────────────────────────────────
      const pageLimit = Math.min(PAGE_SIZE, limit - processed)
      state.info(`📋 Получаю список (offset=${offset}, count=${pageLimit})...`)

      let listResult
      try {
        listResult = await fetchCarList(offset, pageLimit)
      } catch (err) {
        state.error(`❌ Ошибка API: ${err.message}`)
        await sleep(8000)
        continue
      }

      const { cars, total } = listResult
      if (!cars.length) {
        state.info('📭 Больше машин нет — завершаю')
        break
      }
      state.info(`📦 Получено ${cars.length} машин (Encar всего: ${total.toLocaleString()})`)

      // ── Process each car ────────────────────────────────────────────────────
      for (const raw of cars) {
        if (state.stopReq) {
          state.warn('⏹ Остановлено пользователем')
          break
        }

        const car = mapCar(raw)

        // Skip if already in DB
        const existId = await getExistingId(raw.Id)
        if (existId) {
          state.info(`⏭ Пропуск ${car.name} (${car.year}) — уже в базе`)
          state.setProgress({ skipped: state.progress.skipped + 1 })
          processed++
          continue
        }

        state.info(`🔍 ${car.name} (${car.year}, ${car.mileage.toLocaleString()} км, $${car.price_usd.toLocaleString()})`)

        // ── Probe + download photos ────────────────────────────────────────
        let photoUrls = []
        try {
          const validUrls = await probePhotoUrls(raw.Id, 8)
          if (validUrls.length) {
            state.info(`📸 Скачиваю ${validUrls.length} фото для ${car.name}...`)
            photoUrls = await downloadPhotos(validUrls, raw.Id, 8)
            state.setProgress({ photos: state.progress.photos + photoUrls.length })
          }
        } catch (photoErr) {
          state.warn(`⚠️ Ошибка фото: ${photoErr.message}`)
        }

        // ── Save to DB ─────────────────────────────────────────────────────
        try {
          const newId = await insertCar(car, photoUrls)
          state.success(`✅ Сохранено: ${car.name} → id=${newId}, фото=${photoUrls.length}`)
          state.setProgress({ done: state.progress.done + 1 })
          addedThisRun++
        } catch (dbErr) {
          state.error(`❌ БД: ${car.name} — ${dbErr.message}`)
          state.setProgress({ failed: state.progress.failed + 1 })
        }

        processed++

        // Rate-limit between cars
        if (processed < limit && !state.stopReq) {
          await jitter(1200, 2800)
        }
      }

      offset += cars.length

      // Delay between pages
      if (processed < limit && !state.stopReq) {
        await jitter(3000, 5000)
      }
    }

    await updateScrapeStats(addedThisRun)

    if (state.stopReq) {
      state.warn(`⏹ Остановлено. Добавлено: ${state.progress.done}`)
    } else {
      state.success(
        `🎉 Готово! Добавлено: ${state.progress.done} | ` +
        `Пропущено: ${state.progress.skipped} | ` +
        `Ошибок: ${state.progress.failed} | ` +
        `Фото: ${state.progress.photos}`
      )
    }
  } catch (err) {
    state.error(`💥 Критическая ошибка: ${err.message}`)
  } finally {
    state.isRunning = false
    state.stopReq   = false
    state.emit('update', { type: 'done', progress: { ...state.progress } })
  }
}

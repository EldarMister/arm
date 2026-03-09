import pool from '../db.js'
import { computePricing, getExchangeRateSnapshot } from '../lib/exchangeRate.js'
import { getPricingSettings, resolveVehicleFees } from '../lib/pricingSettings.js'
import {
  appendTitleTrimSuffix,
  extractShortLocation,
  extractTrimLevelFromTitle,
  inferDrive,
  normalizeColorName,
  normalizeFuel,
  normalizeInteriorColorName,
  resolveManufacturerDisplayName,
  normalizeManufacturer,
  resolveBodyType,
  normalizeTransmission,
  normalizeTrimLevel,
} from '../lib/vehicleData.js'
import { fetchCarList, extractPhotoUrls, probePhotoUrls, sleep } from './encarApi.js'
import { downloadPhotos } from './downloader.js'
import {
  MANUFACTURER_MAP,
  tr,
  parseYear,
  priceToKRW,
  translateVehicleText,
  hasHangul,
} from './translator.js'
import { state } from './state.js'

const PAGE_SIZE = 20
const MIN_SCRAPER_YEAR = 2019

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripTrailingTrim(text, trimLevel) {
  const value = String(text || '').replace(/\s+/g, ' ').trim()
  const trim = String(trimLevel || '').replace(/\s+/g, ' ').trim()
  if (!value || !trim) return value

  const pattern = new RegExp(`(?:\\s+|[(/-])${escapeRegex(trim)}\\)?$`, 'i')
  return value.replace(pattern, '').replace(/\s+/g, ' ').trim()
}

function mapCar(raw, exchangeSnapshot, pricingSettings) {
  const rawManufacturer = String(raw.Manufacturer || '').trim()
  const model = translateVehicleText(raw.Model || '')
  const badge = translateVehicleText(raw.Badge || '')
  const rawName = translateVehicleText(raw.Name || '')
  const year = parseYear(raw.Year)
  const mileage = Number(raw.Mileage) || 0
  const price_krw = priceToKRW(raw.Price)
  const fuel_type = normalizeFuel(raw.FuelType || '')
  const transmission = normalizeTransmission(raw.Transmission || raw.GearType || '')
  const drive_type = inferDrive(
    [raw.Badge, raw.BadgeDetail, raw.Model].filter(Boolean).join(' '),
    raw.Grade,
    raw.GradeDetail,
    raw.SubModel,
    raw.Name,
  )
  const body_color = normalizeColorName(raw.Color || '')
  const body_type = resolveBodyType(
    raw.BodyType || raw.Body || raw.Shape || '',
    raw.Model,
    raw.Badge,
    raw.Name,
    raw.SubModel,
    raw.Grade,
    raw.BadgeDetail,
  )
  const interior_raw =
    raw.InteriorColor ||
    raw.InteriorColorName ||
    raw.InnerColor ||
    raw.InnerColorName ||
    raw.TrimColor ||
    raw.TrimColorName ||
    raw.SeatColor ||
    raw.SeatColorName ||
    ''
  const interior_color = normalizeInteriorColorName(interior_raw, raw.Color || '')
  const encar_id = String(raw.Id || '')
  const encar_url = `https://www.encar.com/dc/dc_cardetailview.do?carid=${raw.Id}`
  const translatedManufacturer = tr(MANUFACTURER_MAP, rawManufacturer)
  const manufacturer = hasHangul(translatedManufacturer)
    ? translateVehicleText(translatedManufacturer)
    : translatedManufacturer
  const normalizedManufacturer = normalizeManufacturer(manufacturer || '')
  const displayManufacturer = resolveManufacturerDisplayName(
    rawManufacturer,
    manufacturer,
    normalizedManufacturer,
    raw.Model,
    raw.Badge,
    raw.Name,
    raw.SubModel,
    raw.Grade,
    raw.GradeDetail,
  )
  const trim_level = normalizeTrimLevel(raw.BadgeDetail, raw.GradeDetail) || extractTrimLevelFromTitle(
    raw.BadgeDetail,
    raw.GradeDetail,
    raw.Badge,
    raw.Model,
    raw.Name,
  )
  const rawLocation = String(raw.OfficeCityState || raw.OfficeName || '').trim()

  let name = [displayManufacturer, model, badge].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
  let modelName = [model, badge].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()

  if (/^\((?:gm|sm|daewoo)\)\b/i.test(name) || /^\((?:gm|sm|daewoo)\)\b/i.test(modelName)) {
    const fallbackName = String(rawName || '').replace(/\s+/g, ' ').trim()
    if (fallbackName) {
      name = fallbackName
      modelName = normalizedManufacturer && fallbackName.toLowerCase().startsWith(normalizedManufacturer.toLowerCase())
        ? fallbackName.slice(normalizedManufacturer.length).trim()
        : fallbackName
    }
  }

  name = stripTrailingTrim(name, trim_level)
  modelName = stripTrailingTrim(modelName, trim_level)
  name = appendTitleTrimSuffix(name, raw.BadgeDetail, raw.GradeDetail, trim_level)
  modelName = appendTitleTrimSuffix(modelName, raw.BadgeDetail, raw.GradeDetail, trim_level)

  const fees = resolveVehicleFees({
    name,
    model: modelName,
    body_type,
    trim_level,
    drive_type,
    pricing_locked: false,
  }, pricingSettings)
  const pricing = computePricing({
    priceKrw: price_krw,
    commission: fees.commission,
    delivery: fees.delivery,
    loading: fees.loading,
    unloading: fees.unloading,
    storage: fees.storage,
  }, exchangeSnapshot)

  const tags = []
  if (drive_type) tags.push(drive_type)
  if (transmission) tags.push(transmission)
  if (fuel_type) tags.push(fuel_type)

  return {
    name,
    model: modelName,
    year: year ? String(year) : null,
    mileage,
    price_krw,
    price_usd: pricing.price_usd,
    fuel_type,
    transmission,
    drive_type,
    body_type: body_type || '',
    trim_level,
    pricing_locked: false,
    delivery_profile_code: fees.delivery_profile_code,
    key_info: '',
    body_color,
    interior_color,
    location: rawLocation || extractShortLocation(rawLocation) || 'Корея',
    encar_url,
    encar_id,
    tags,
    can_negotiate: true,
    commission: fees.commission,
    delivery: fees.delivery,
    loading: fees.loading,
    unloading: fees.unloading,
    storage: fees.storage,
    vat_refund: pricing.vat_refund,
    total: pricing.total,
    thumbnail: raw.Thumbnail || raw.Photo || null,
  }
}

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
       (name, model, year, mileage, price_krw, price_usd, fuel_type, transmission, drive_type,
        body_type, trim_level, key_info, body_color, interior_color, location, encar_url, encar_id,
        tags, can_negotiate, commission, delivery, delivery_profile_code, loading, unloading, storage, pricing_locked, vat_refund, total)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
     RETURNING id`,
    [
      car.name, car.model, car.year, car.mileage,
      car.price_krw, car.price_usd, car.fuel_type, car.transmission, car.drive_type,
      car.body_type || null, car.trim_level || null, car.key_info || null,
      car.body_color, car.interior_color, car.location, car.encar_url, car.encar_id,
      car.tags, car.can_negotiate, car.commission, car.delivery, car.delivery_profile_code || null, car.loading, car.unloading,
      car.storage, car.pricing_locked || false, car.vat_refund, car.total,
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
  } catch {
    // non-critical
  }
}

export async function runScrapeJob(limit = 100) {
  if (state.isRunning) throw new Error('Парсер уже запущен')

  state.isRunning = true
  state.stopReq = false
  state.startedAt = new Date().toISOString()
  state.lastRun = state.startedAt
  state.progress = { done: 0, total: limit, failed: 0, skipped: 0, photos: 0 }

  state.info(`🚀 Запуск парсера — лимит ${limit} новых машин`)

  const sourceMode = process.env.ENCAR_PROXY_URL ? 'Vercel proxy' : 'direct Encar API'
  state.info(`Source mode: ${sourceMode}`)
  const exchangeSnapshot = await getExchangeRateSnapshot()
  const pricingSettings = await getPricingSettings()

  let offset = 0
  let addedThisRun = 0

  try {
    while (addedThisRun < limit && !state.stopReq) {
      const remainingToAdd = limit - addedThisRun
      const pageLimit = Math.min(PAGE_SIZE, remainingToAdd)
      state.info(`📋 Получаю список (offset=${offset}, count=${pageLimit})...`)

      let listResult
      try {
        listResult = await fetchCarList(offset, pageLimit)
      } catch (err) {
        state.error(`❌ Ошибка API: ${err.message}`)
        if (state.stopReq) break
        await sleep(8000)
        continue
      }

      const { cars, total } = listResult
      if (!cars.length) {
        state.info('📭 Больше машин нет — завершаю')
        break
      }
      state.info(`📦 Получено ${cars.length} машин (Encar всего: ${total.toLocaleString()})`)

      for (const raw of cars) {
        if (state.stopReq) {
          state.warn('⏹ Остановлено пользователем')
          break
        }

        const car = mapCar(raw, exchangeSnapshot, pricingSettings)
        const carYear = Number.parseInt(String(car.year || ''), 10)
        if (!Number.isFinite(carYear) || carYear < MIN_SCRAPER_YEAR) {
          const yearLabel = car.year || 'unknown year'
          state.info(`⏭ Пропуск ${car.name} (${yearLabel}) — год раньше ${MIN_SCRAPER_YEAR}`)
          state.setProgress({ skipped: state.progress.skipped + 1 })
          continue
        }

        const existId = await getExistingId(raw.Id)
        if (existId) {
          state.info(`⏭ Пропуск ${car.name} (${car.year}) — уже в базе`)
          state.setProgress({ skipped: state.progress.skipped + 1 })
          continue
        }

        state.info(`🔍 ${car.name} (${car.year}, ${car.mileage.toLocaleString()} км, $${car.price_usd.toLocaleString()})`)

        let photoUrls = []
        try {
          const extracted = extractPhotoUrls(raw, 8)
          const validUrls = extracted.length ? extracted : await probePhotoUrls(raw.Id, 8)
          if (validUrls.length) {
            state.info(`Processing ${validUrls.length} photos for ${car.name}...`)
            await downloadPhotos(validUrls, raw.Id, 8)
            photoUrls = validUrls
            state.setProgress({ photos: state.progress.photos + photoUrls.length })
          }
        } catch (photoErr) {
          state.warn(`Photo error: ${photoErr.message}`)
        }

        try {
          const newId = await insertCar(car, photoUrls)
          state.success(`✅ Сохранено: ${car.name} → id=${newId}, фото=${photoUrls.length}`)
          addedThisRun++
          state.setProgress({ done: state.progress.done + 1 })
        } catch (dbErr) {
          state.error(`❌ БД: ${car.name} — ${dbErr.message}`)
          state.setProgress({ failed: state.progress.failed + 1 })
        }

        if (addedThisRun >= limit) {
          state.info(`✅ Достигнут лимит новых машин: ${limit}`)
          break
        }
      }

      offset += cars.length
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
    state.stopReq = false
    state.emit('update', { type: 'done', progress: { ...state.progress } })
  }
}

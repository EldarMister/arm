import pool from '../db.js'
import { getBlockedGenericVehicleReason } from '../lib/catalogVehicleRules.js'
import { computePricing, getExchangeRateSnapshot } from '../lib/exchangeRate.js'
import { getBlockedCatalogPriceReason } from '../lib/catalogPriceRules.js'
import { normalizeCarTextFields } from '../lib/carRecordNormalization.js'
import { fetchEncarVehicleEnrichment } from '../lib/encarVehicle.js'
import { getPricingSettings, resolveVehicleFees } from '../lib/pricingSettings.js'
import {
  appendTitleTrimSuffix,
  classifyVehicleOrigin,
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
  VEHICLE_ORIGIN_LABELS,
} from '../lib/vehicleData.js'
import { isStandardVin, normalizeVin } from '../lib/vin.js'
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
const PARSE_SCOPE_ALL = 'all'
const PARSE_SCOPE_IMPORTED = 'imported'

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
    option_features: [],
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

async function getExistingEncarIdMap(encarIds = []) {
  const normalized = [...new Set(encarIds.map((item) => String(item || '').trim()).filter(Boolean))]
  if (!normalized.length) return new Map()

  const res = await pool.query(
    'SELECT id, encar_id FROM cars WHERE encar_id = ANY($1::text[])',
    [normalized]
  )

  return new Map(res.rows.map((row) => [String(row.encar_id || '').trim(), row.id]))
}

async function getExistingIdByVin(vin) {
  const normalizedVin = normalizeVin(vin)
  if (!isStandardVin(normalizedVin)) return null

  const res = await pool.query(
    'SELECT id FROM cars WHERE UPPER(BTRIM(vin)) = $1 LIMIT 1',
    [normalizedVin]
  )
  return res.rows.length ? res.rows[0].id : null
}

function rebuildTags(car) {
  const tags = []
  if (car.drive_type) tags.push(car.drive_type)
  if (car.transmission) tags.push(car.transmission)
  if (car.fuel_type) tags.push(car.fuel_type)
  return tags
}

function applyPricingToCar(car, exchangeSnapshot, pricingSettings) {
  const fees = resolveVehicleFees({
    name: car.name,
    model: car.model,
    body_type: car.body_type,
    trim_level: car.trim_level,
    drive_type: car.drive_type,
    pricing_locked: car.pricing_locked,
    delivery_profile_code: car.delivery_profile_code,
    commission: car.commission,
    delivery: car.delivery,
    loading: car.loading,
    unloading: car.unloading,
    storage: car.storage,
  }, pricingSettings)
  const pricing = computePricing({
    priceKrw: car.price_krw,
    commission: fees.commission,
    delivery: fees.delivery,
    loading: fees.loading,
    unloading: fees.unloading,
    storage: fees.storage,
  }, exchangeSnapshot)

  return {
    ...car,
    tags: rebuildTags(car),
    delivery_profile_code: fees.delivery_profile_code,
    commission: fees.commission,
    delivery: fees.delivery,
    loading: fees.loading,
    unloading: fees.unloading,
    storage: fees.storage,
    price_usd: pricing.price_usd,
    vat_refund: pricing.vat_refund,
    total: pricing.total,
  }
}

function normalizeImportedCar(car) {
  const normalizedText = normalizeCarTextFields(car)

  return {
    ...car,
    name: normalizedText.name ?? car.name,
    model: normalizedText.model ?? car.model,
    trim_level: normalizedText.trim_level ?? car.trim_level,
    body_color: normalizedText.body_color ?? car.body_color,
    interior_color: normalizedText.interior_color ?? car.interior_color,
    option_features: Array.isArray(car.option_features)
      ? [...new Set(car.option_features.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, 12)
      : [],
    location: normalizedText.location || car.location || 'Корея',
    vin: normalizeVin(car.vin) || null,
  }
}

function mergeCarEnrichment(car, enrichment, exchangeSnapshot, pricingSettings) {
  const merged = normalizeImportedCar({
    ...car,
    name: enrichment.name || car.name,
    model: enrichment.model || car.model,
    fuel_type: enrichment.fuel_type || car.fuel_type,
    transmission: enrichment.transmission || car.transmission,
    drive_type: enrichment.drive_type || car.drive_type,
    body_type: enrichment.body_type || car.body_type,
    trim_level: enrichment.trim_level || car.trim_level,
    body_color: enrichment.body_color || car.body_color,
    interior_color: enrichment.interior_color || car.interior_color,
    option_features: Array.isArray(enrichment.option_features) && enrichment.option_features.length
      ? enrichment.option_features
      : car.option_features,
    location: enrichment.location || car.location,
    vin: enrichment.vin || car.vin,
    price_krw: Number(enrichment.price_krw) > 0 ? Number(enrichment.price_krw) : car.price_krw,
  })

  return applyPricingToCar(merged, exchangeSnapshot, pricingSettings)
}

async function insertCar(car, photoUrls) {
  const res = await pool.query(
    `INSERT INTO cars
       (name, model, year, mileage, price_krw, price_usd, fuel_type, transmission, drive_type,
        body_type, trim_level, key_info, body_color, interior_color, option_features, location, vin, encar_url, encar_id,
        tags, can_negotiate, commission, delivery, delivery_profile_code, loading, unloading, storage, pricing_locked, vat_refund, total)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
     RETURNING id`,
    [
      car.name, car.model, car.year, car.mileage,
      car.price_krw, car.price_usd, car.fuel_type, car.transmission, car.drive_type,
      car.body_type || null, car.trim_level || null, car.key_info || null,
      car.body_color, car.interior_color, car.option_features || [], car.location, car.vin, car.encar_url, car.encar_id,
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

export async function runScrapeJob(limit = 100, options = {}) {
  if (state.isRunning) throw new Error('Парсер уже запущен')

  const parseScope = options?.parseScope === PARSE_SCOPE_IMPORTED ? PARSE_SCOPE_IMPORTED : PARSE_SCOPE_ALL

  state.isRunning = true
  state.stopReq = false
  state.startedAt = new Date().toISOString()
  state.lastRun = state.startedAt
  state.progress = { done: 0, total: limit, failed: 0, skipped: 0, photos: 0 }

  state.info(`🚀 Запуск парсера — ${parseScope === PARSE_SCOPE_IMPORTED ? 'только импортные' : 'все машины'}, лимит ${limit} новых машин`)

  const sourceMode = process.env.ENCAR_PROXY_URL ? 'Vercel proxy / direct detail' : 'direct Encar API'
  state.info(`Source mode: ${sourceMode}`)
  const exchangeSnapshot = await getExchangeRateSnapshot()
  const pricingSettings = await getPricingSettings()
  const seenEncarIds = new Set()

  let offset = 0
  let addedThisRun = 0

  try {
    while (addedThisRun < limit && !state.stopReq) {
      const pageLimit = PAGE_SIZE
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

      const { cars, total, scanned = cars.length } = listResult
      if (!cars.length) {
        if (scanned > 0) {
          state.info(`📭 В этой пачке нет подходящих машин, пропускаю ещё ${scanned} позиций`)
          offset += scanned
          continue
        }
        state.info('📭 Больше машин нет — завершаю')
        break
      }
      state.info(`📦 Получено ${cars.length} машин из ${scanned} просмотренных (Encar всего: ${total.toLocaleString()})`)
      const existingEncarIds = await getExistingEncarIdMap(cars.map((raw) => raw?.Id))

      for (const raw of cars) {
        if (state.stopReq) {
          state.warn('⏹ Остановлено пользователем')
          break
        }

        const car = mapCar(raw, exchangeSnapshot, pricingSettings)
        const genericVehicleReason = getBlockedGenericVehicleReason({
          name: car.name,
          model: car.model,
          rawManufacturer: raw.Manufacturer,
          rawModel: raw.Model,
        })
        if (genericVehicleReason) {
          state.info(`⏭ Пропуск ${car.name || raw.Name || raw.Id} — ${genericVehicleReason}`)
          state.setProgress({ skipped: state.progress.skipped + 1 })
          continue
        }

        const carYear = Number.parseInt(String(car.year || ''), 10)
        if (!Number.isFinite(carYear) || carYear < MIN_SCRAPER_YEAR) {
          const yearLabel = car.year || 'unknown year'
          state.info(`⏭ Пропуск ${car.name} (${yearLabel}) — год раньше ${MIN_SCRAPER_YEAR}`)
          state.setProgress({ skipped: state.progress.skipped + 1 })
          continue
        }

        const preDetailPriceReason = getBlockedCatalogPriceReason({
          priceKrw: car.price_krw,
          priceUsd: car.price_usd,
        })
        if (preDetailPriceReason) {
          state.info(`⏭ Пропуск ${car.name} (${car.year}) — ${preDetailPriceReason}`)
          state.setProgress({ skipped: state.progress.skipped + 1 })
          continue
        }

        const currentEncarId = String(raw.Id || '').trim()
        const existId = existingEncarIds.get(currentEncarId) || (seenEncarIds.has(currentEncarId) ? 'seen' : null)
        if (existId) {
          state.info(`⏭ Пропуск ${car.name} (${car.year}) — уже в базе`)
          state.setProgress({ skipped: state.progress.skipped + 1 })
          continue
        }

        if (parseScope === PARSE_SCOPE_IMPORTED) {
          const origin = classifyVehicleOrigin(car.name, car.model)
          if (origin !== VEHICLE_ORIGIN_LABELS.imported) {
            state.info(`⏭ Пропуск ${car.name} (${car.year}) — корейская машина, режим: только импортные`)
            state.setProgress({ skipped: state.progress.skipped + 1 })
            continue
          }
        }

        let preparedCar = car
        try {
          const enrichment = await fetchEncarVehicleEnrichment(raw.Id)
          preparedCar = mergeCarEnrichment(car, enrichment, exchangeSnapshot, pricingSettings)
        } catch (enrichmentError) {
          state.warn(`⏭ Пропуск ${car.name} — не удалось проверить VIN/detail: ${enrichmentError.message}`)
          state.setProgress({ skipped: state.progress.skipped + 1 })
          continue
        }

        const enrichedGenericVehicleReason = getBlockedGenericVehicleReason({
          name: preparedCar.name,
          model: preparedCar.model,
        })
        if (enrichedGenericVehicleReason) {
          state.info(`⏭ Пропуск ${preparedCar.name || preparedCar.encar_id} (${preparedCar.year}) — ${enrichedGenericVehicleReason}`)
          state.setProgress({ skipped: state.progress.skipped + 1 })
          continue
        }

        if (Number(preparedCar.price_krw || 0) <= 0) {
          state.info(`⏭ Пропуск ${preparedCar.name} (${preparedCar.year}) — цена в Encar отсутствует или равна 0`)
          state.setProgress({ skipped: state.progress.skipped + 1 })
          continue
        }

        const postDetailPriceReason = getBlockedCatalogPriceReason({
          priceKrw: preparedCar.price_krw,
          priceUsd: preparedCar.price_usd,
        })
        if (postDetailPriceReason) {
          state.info(`⏭ Пропуск ${preparedCar.name} (${preparedCar.year}) — ${postDetailPriceReason}`)
          state.setProgress({ skipped: state.progress.skipped + 1 })
          continue
        }

        const duplicateVinId = await getExistingIdByVin(preparedCar.vin)
        if (duplicateVinId) {
          state.info(`⏭ Пропуск ${preparedCar.name} (${preparedCar.year}) — VIN уже есть у ID ${duplicateVinId}`)
          state.setProgress({ skipped: state.progress.skipped + 1 })
          continue
        }

        state.info(`🔍 ${preparedCar.name} (${preparedCar.year}, ${preparedCar.mileage.toLocaleString()} км, $${preparedCar.price_usd.toLocaleString()})`)

        let photoUrls = []
        try {
          const extracted = extractPhotoUrls(raw, 8)
          const validUrls = extracted.length ? extracted : await probePhotoUrls(raw.Id, 8)
          if (validUrls.length) {
            state.info(`Processing ${validUrls.length} photos for ${preparedCar.name}...`)
            await downloadPhotos(validUrls, raw.Id, 8)
            photoUrls = validUrls
            state.setProgress({ photos: state.progress.photos + photoUrls.length })
          }
        } catch (photoErr) {
          state.warn(`Photo error: ${photoErr.message}`)
        }

        try {
          const newId = await insertCar(preparedCar, photoUrls)
          seenEncarIds.add(preparedCar.encar_id)
          state.success(`✅ Сохранено: ${preparedCar.name} → id=${newId}, фото=${photoUrls.length}`)
          addedThisRun++
          state.setProgress({ done: state.progress.done + 1 })
        } catch (dbErr) {
          state.error(`❌ БД: ${preparedCar.name} — ${dbErr.message}`)
          state.setProgress({ failed: state.progress.failed + 1 })
        }

        if (addedThisRun >= limit) {
          state.info(`✅ Достигнут лимит новых машин: ${limit}`)
          break
        }
      }

      offset += scanned
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

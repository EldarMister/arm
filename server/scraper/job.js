import pool from '../db.js'
import { repairTextEncoding } from '../lib/textEncoding.js'
import { getBlockedGenericVehicleReason } from '../lib/catalogVehicleRules.js'
import { computePricing, getExchangeRateSnapshot } from '../lib/exchangeRate.js'
import { getBlockedCatalogPriceReason } from '../lib/catalogPriceRules.js'
import { normalizeCarTextFields } from '../lib/carRecordNormalization.js'
import { fetchEncarVehicleEnrichment } from '../lib/encarVehicle.js'
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
import { isStandardVin, normalizeVin } from '../lib/vin.js'
import { fetchCarList, extractPhotoUrls, probePhotoUrls, sleep } from './encarApi.js'
import { downloadPhotosDetailed } from './downloader.js'
import {
  buildCarDiagnostic,
  classifyDetailError,
  formatDiagnosticMessage,
  retryOperation,
} from './diagnostics.js'
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
const PARSE_SCOPE_DOMESTIC = 'domestic'
const PARSE_SCOPE_IMPORTED = 'imported'
const PARSE_SCOPE_JAPANESE = 'japanese'
const PARSE_SCOPE_GERMAN = 'german'
const SUPPORTED_PARSE_SCOPES = new Set([
  PARSE_SCOPE_ALL,
  PARSE_SCOPE_DOMESTIC,
  PARSE_SCOPE_IMPORTED,
  PARSE_SCOPE_JAPANESE,
  PARSE_SCOPE_GERMAN,
])
const IMPORT_ONLY_SCOPES = new Set([PARSE_SCOPE_IMPORTED, PARSE_SCOPE_JAPANESE, PARSE_SCOPE_GERMAN])
const DETAIL_RETRY_ATTEMPTS = 3
const DETAIL_SOFT_RECHECK_ATTEMPTS = 2
const PHOTO_LIMIT = 8
const STALE_KNOWN_PAGE_LIMIT = 2
const LOW_YIELD_PAGE_LIMIT = 4
const LOW_YIELD_MAX_FRESH = 1
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

function cleanText(value) {
  return repairTextEncoding(String(value || '')).replace(/\s+/g, ' ').trim()
}

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

function normalizeParseScope(parseScope) {
  return SUPPORTED_PARSE_SCOPES.has(parseScope) ? parseScope : PARSE_SCOPE_ALL
}

function formatParseScopeLabel(parseScope) {
  if (parseScope === PARSE_SCOPE_DOMESTIC) return 'только корейские (domestic)'
  if (parseScope === PARSE_SCOPE_IMPORTED) return 'только импортные'
  if (parseScope === PARSE_SCOPE_JAPANESE) return 'только японские'
  if (parseScope === PARSE_SCOPE_GERMAN) return 'только немецкие'
  return 'все машины'
}

function normalizeBrandSignal(value) {
  const normalized = normalizeManufacturer(value || '')
  return cleanText(normalized).toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function collectBrandSignals(car, raw) {
  return [...new Set(
    [
      car?.manufacturer,
      car?.name,
      car?.model,
      raw?.Manufacturer,
      raw?.Maker,
      raw?.Brand,
      raw?.Name,
      raw?.Model,
      raw?.Badge,
    ]
      .map((value) => normalizeBrandSignal(value))
      .filter(Boolean),
  )]
}

function resolveBrandAliasesForScope(parseScope) {
  if (parseScope === PARSE_SCOPE_JAPANESE) return JAPANESE_BRAND_ALIASES
  if (parseScope === PARSE_SCOPE_GERMAN) return GERMAN_BRAND_ALIASES
  return []
}

function matchesScopedImportedBrand(car, raw, parseScope) {
  if (!IMPORT_ONLY_SCOPES.has(parseScope) || parseScope === PARSE_SCOPE_IMPORTED) return true

  const aliases = resolveBrandAliasesForScope(parseScope)
  if (!aliases.length) return true

  const signals = collectBrandSignals(car, raw)
  return signals.some((signal) => aliases.some((alias) => signal === alias || signal.startsWith(alias)))
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
    manufacturer: displayManufacturer,
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
    vehicle_id: '',
    vehicle_no: '',
    image_urls: [],
  }
}

async function getExistingEncarIdMap(encarIds = []) {
  const normalized = [...new Set(encarIds.map((item) => String(item || '').trim()).filter(Boolean))]
  if (!normalized.length) return new Map()

  const res = await pool.query(
    'SELECT id, encar_id FROM cars WHERE encar_id = ANY($1::text[])',
    [normalized],
  )

  return new Map(res.rows.map((row) => [String(row.encar_id || '').trim(), row.id]))
}

async function getExistingIdByVin(vin) {
  const normalizedVin = normalizeVin(vin)
  if (!isStandardVin(normalizedVin)) return null

  const res = await pool.query(
    'SELECT id FROM cars WHERE UPPER(BTRIM(vin)) = $1 LIMIT 1',
    [normalizedVin],
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
      ? [...new Set(car.option_features.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, 16)
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
    warranty_company: enrichment.warranty_company || car.warranty_company || null,
    warranty_body_months: enrichment.warranty_body_months ?? car.warranty_body_months ?? null,
    warranty_body_km: enrichment.warranty_body_km ?? car.warranty_body_km ?? null,
    warranty_transmission_months: enrichment.warranty_transmission_months ?? car.warranty_transmission_months ?? null,
    warranty_transmission_km: enrichment.warranty_transmission_km ?? car.warranty_transmission_km ?? null,
    option_features: Array.isArray(enrichment.option_features) && enrichment.option_features.length
      ? enrichment.option_features
      : car.option_features,
    location: enrichment.location || car.location,
    vin: enrichment.vin || car.vin,
    price_krw: Number(enrichment.price_krw) > 0 ? Number(enrichment.price_krw) : car.price_krw,
    vehicle_id: enrichment.vehicle_id || car.vehicle_id || '',
    vehicle_no: enrichment.vehicle_no || car.vehicle_no || '',
    image_urls: Array.isArray(enrichment.image_urls) && enrichment.image_urls.length
      ? enrichment.image_urls
      : car.image_urls,
    encar_url: enrichment.encar_url || car.encar_url,
  })

  return applyPricingToCar(merged, exchangeSnapshot, pricingSettings)
}

function createDuplicateError(code, duplicateId) {
  const error = new Error(code)
  error.code = code
  error.duplicateId = duplicateId
  return error
}

async function insertCar(car, photoUrls) {
  const existingByEncar = await pool.query(
    'SELECT id FROM cars WHERE encar_id = $1 LIMIT 1',
    [car.encar_id],
  )
  if (existingByEncar.rows.length) {
    throw createDuplicateError('DUPLICATE_ENCAR', existingByEncar.rows[0].id)
  }

  if (car.vin && isStandardVin(car.vin)) {
    const existingByVin = await pool.query(
      'SELECT id FROM cars WHERE UPPER(BTRIM(vin)) = $1 LIMIT 1',
      [normalizeVin(car.vin)],
    )
    if (existingByVin.rows.length) {
      throw createDuplicateError('DUPLICATE_VIN', existingByVin.rows[0].id)
    }
  }

  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    const res = await client.query(
      `INSERT INTO cars
         (name, model, year, mileage, price_krw, price_usd, fuel_type, transmission, drive_type,
          body_type, trim_level, key_info, body_color, interior_color, warranty_company, warranty_body_months, warranty_body_km,
          warranty_transmission_months, warranty_transmission_km, option_features, location, vin, encar_url, encar_id,
          tags, can_negotiate, commission, delivery, delivery_profile_code, loading, unloading, storage, pricing_locked, vat_refund, total)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35)
       RETURNING id`,
      [
        car.name, car.model, car.year, car.mileage,
        car.price_krw, car.price_usd, car.fuel_type, car.transmission, car.drive_type,
        car.body_type || null, car.trim_level || null, car.key_info || null,
        car.body_color, car.interior_color, car.warranty_company || null, car.warranty_body_months ?? null, car.warranty_body_km ?? null,
        car.warranty_transmission_months ?? null, car.warranty_transmission_km ?? null, car.option_features || [], car.location, car.vin,
        car.encar_url, car.encar_id, car.tags, car.can_negotiate, car.commission, car.delivery, car.delivery_profile_code || null,
        car.loading, car.unloading, car.storage, car.pricing_locked || false, car.vat_refund, car.total,
      ],
    )
    const carId = res.rows[0].id

    for (let i = 0; i < photoUrls.length; i += 1) {
      await client.query(
        'INSERT INTO car_images (car_id, url, position) VALUES ($1,$2,$3)',
        [carId, photoUrls[i], i],
      )
    }

    await client.query('COMMIT')
    return carId
  } catch (error) {
    await client.query('ROLLBACK')
    if (error?.code === '23505') {
      throw createDuplicateError('DUPLICATE_VIN', null)
    }
    throw error
  } finally {
    client.release()
  }
}

async function updateScrapeStats(added) {
  try {
    await pool.query(
      `UPDATE scraper_config
       SET total_scraped = total_scraped + $1,
           today_scraped = today_scraped + $1,
           last_run      = NOW()
       WHERE id = 1`,
      [added],
    )
  } catch {
    // non-critical
  }
}

function addSkipProgress(classification) {
  const resolvedClassification = typeof classification === 'object'
    ? String(classification?.classification || '').trim()
    : String(classification || '').trim()
  const reason = String(classification?.reason || '').trim()
  if (reason === 'duplicate_encar_id' || reason === 'duplicate_vin') {
    state.setProgress({
      alreadyKnown: state.progress.alreadyKnown + 1,
    })
    return
  }

  const next = {
    skipped: state.progress.skipped + 1,
  }

  if (resolvedClassification === 'normal') {
    next.normalSkipped = state.progress.normalSkipped + 1
  } else {
    next.discarded = state.progress.discarded + 1
  }

  state.setProgress(next)
}

function recordSkip(diagnostic) {
  addSkipProgress(diagnostic)
  state.recordSkipDiagnostic(diagnostic)

  const level = diagnostic.classification === 'normal' ? 'info' : 'warn'
  state[level](formatDiagnosticMessage('SKIP', diagnostic), { diagnostic })
}

function recordFailure(diagnostic) {
  state.setProgress({
    failed: state.progress.failed + 1,
    discarded: state.progress.discarded + 1,
  })
  state.recordSkipDiagnostic(diagnostic)
  state.error(formatDiagnosticMessage('FAIL', diagnostic), { diagnostic })
}

function recordRetryRecovered(stage, car, attempts, details = '') {
  state.setProgress({ retryRecovered: state.progress.retryRecovered + 1 })
  state.success(
    [
      'RECOVERED',
      `stage=${stage}`,
      `carId=${cleanText(car?.encar_id || '')}`,
      `attempts=${attempts}`,
      details ? `details=${cleanText(details)}` : '',
    ].filter(Boolean).join(' | '),
    {
      stage,
      carId: cleanText(car?.encar_id || ''),
      attempts,
      details: cleanText(details),
    },
  )
}

function shouldUseTailStopGuard(parseScope) {
  return IMPORT_ONLY_SCOPES.has(parseScope)
}

function formatSourceFailures(sourceDiagnostics = []) {
  return sourceDiagnostics
    .map((item) => {
      const bits = [
        cleanText(item?.source || 'unknown'),
        item?.httpStatus ? `http=${item.httpStatus}` : '',
        cleanText(item?.code || ''),
        cleanText(item?.reason || ''),
      ].filter(Boolean)
      return bits.join(':')
    })
    .filter(Boolean)
    .join(',')
}

async function softRecheckEnrichment(raw, car, exchangeSnapshot, pricingSettings) {
  const currentEncarId = cleanText(raw?.Id)
  state.warn(`SOFT_RECHECK | stage=detail_enrichment | carId=${currentEncarId} | action=retry`)

  const result = await retryOperation(
    () => fetchEncarVehicleEnrichment(raw.Id),
    {
      maxAttempts: DETAIL_SOFT_RECHECK_ATTEMPTS,
      baseDelayMs: 2500,
      factor: 2,
      classifyError: (error) => classifyDetailError(error, 'detail_fetch_failed'),
      onRetry: async ({ attempt, nextAttempt, maxAttempts, delayMs, classification }) => {
        state.warn(
          [
            'SOFT_RECHECK_RETRY',
            'stage=detail_enrichment',
            `carId=${currentEncarId}`,
            `reason=${classification.reason}`,
            `attempt=${attempt}/${maxAttempts}`,
            `next=${nextAttempt}`,
            `delayMs=${delayMs}`,
            classification.httpStatus ? `http=${classification.httpStatus}` : '',
            classification.details ? `details=${classification.details}` : '',
          ].filter(Boolean).join(' | '),
        )
      },
    },
  )

  if (result.recovered || result.attempts > 0) {
    recordRetryRecovered('detail_soft_recheck', car, result.attempts, result.value?.source || '')
  }

  return mergeCarEnrichment(car, result.value, exchangeSnapshot, pricingSettings)
}

function buildFilterDiagnostic({ stage, reason, details, car, raw }) {
  return buildCarDiagnostic({
    stage,
    reason,
    details,
    car,
    raw,
    retryable: false,
    temporary: false,
  })
}

function hasMinimumCarFields(car) {
  return Boolean(
    cleanText(car?.encar_id)
    && cleanText(car?.name || car?.model)
    && Number(car?.price_krw) > 0
    && cleanText(car?.year),
  )
}

function canImportPartialCar(car, diagnostic) {
  if (!hasMinimumCarFields(car)) return false
  if (diagnostic.reason === 'detail_not_found') return false
  return true
}

function buildDetailDiagnostic(error, car, raw) {
  const classification = classifyDetailError(error, 'detail_fetch_failed')
  const attempts = Number(error?.retryMeta?.attempts) || 1
  return buildCarDiagnostic({
    stage: 'detail_enrichment',
    reason: classification.reason,
    details: classification.details,
    retryable: classification.retryable,
    temporary: classification.temporary,
    attempts,
    httpStatus: classification.httpStatus,
    car,
    raw,
    technical: {
      source: cleanText(error?.encarDiagnostic?.source || ''),
      fallbackFailure: cleanText(error?.encarDiagnostic?.fallbackFailure || ''),
      error: cleanText(error?.message),
    },
  })
}

function buildDbDiagnostic(error, car, raw) {
  return buildCarDiagnostic({
    stage: 'db_insert',
    reason: 'db_insert_error',
    details: cleanText(error?.message) || 'DB insert failed',
    retryable: false,
    temporary: false,
    car,
    raw,
    technical: {
      error: cleanText(error?.message),
      code: cleanText(error?.code),
    },
  })
}

function buildDuplicateDiagnostic(reason, details, car, raw, duplicateId = null) {
  return buildCarDiagnostic({
    stage: 'dedupe',
    reason,
    details,
    retryable: false,
    temporary: false,
    car,
    raw,
    technical: duplicateId ? { duplicateId } : {},
  })
}

function buildPhotoDiagnostic(reason, details, car, raw, technical = {}) {
  return buildCarDiagnostic({
    stage: 'photo_download',
    reason,
    details,
    retryable: true,
    temporary: true,
    car,
    raw,
    technical,
  })
}

function getSummaryLines() {
  const summary = state.sessionSummary
  const topReasons = summary.topReasons.slice(0, 8)

  const lines = [
    `SESSION_SUMMARY | found=${summary.found} | imported=${summary.imported} | skipped_total=${summary.totalSkipped} | skipped=${summary.skipped} | already_known=${summary.alreadyKnown} | failed=${summary.failed} | recovered=${summary.retryRecovered} | discarded=${summary.discarded} | normal_skips=${summary.normalSkipped} | photos=${summary.photos}`,
  ]

  for (const item of topReasons) {
    lines.push(`SESSION_REASON | ${item.code}=${item.count} (${item.percent}%) | label=${item.label || item.code}`)
  }

  return lines
}

export async function runScrapeJob(limit = 100, options = {}) {
  if (state.isRunning) throw new Error('Парсер уже запущен')

  const parseScope = normalizeParseScope(options?.parseScope)

  state.isRunning = true
  state.stopReq = false
  state.startedAt = new Date().toISOString()
  state.lastRun = state.startedAt
  state.resetSession({ total: limit, parseScope, limit })
  state.info(`Parse scope: ${formatParseScopeLabel(parseScope)}, limit=${limit}`)
  state.info(`SCRAPER_START | scope=${parseScope} | limit=${limit}`)

  state.info(`🚀 Запуск парсера: режим ${formatParseScopeLabel(parseScope)}, лимит ${limit} новых машин`)

  const sourceMode = globalThis.process?.env?.ENCAR_PROXY_URL ? 'Vercel proxy / direct detail' : 'direct Encar API + detail HTML fallback'
  state.info(`Source mode: ${sourceMode}`)
  const exchangeSnapshot = await getExchangeRateSnapshot()
  const pricingSettings = await getPricingSettings()
  const seenEncarIds = new Set()

  let offset = 0
  let addedThisRun = 0
  let consecutiveKnownOnlyPages = 0
  let consecutiveLowYieldPages = 0

  try {
    while (addedThisRun < limit && !state.stopReq) {
      state.info(`LIST_FETCH | offset=${offset} | count=${PAGE_SIZE} | scope=${parseScope}`)
      state.info(`📋 Получаю список (offset=${offset}, count=${PAGE_SIZE})...`)

      let listResult
      try {
        listResult = await fetchCarList(offset, PAGE_SIZE, 3, { parseScope })
      } catch (err) {
        state.error(
          `LIST_FETCH_ERROR | scope=${parseScope} | code=${cleanText(err?.code || '') || 'unknown'} | message=${cleanText(err?.message || 'list fetch failed')} | sourceErrors=${formatSourceFailures(err?.fetchSourceDiagnostics || []) || 'none'}`,
        )
        state.error(`❌ Ошибка list API: ${cleanText(err?.message || 'list fetch failed')}`)
        if (state.stopReq) break
        await sleep(8000)
        continue
      }

      if (Array.isArray(listResult.sourceDiagnostics) && listResult.sourceDiagnostics.length) {
        state.warn(
          `LIST_SOURCE_FALLBACK | scope=${parseScope} | offset=${offset} | source=${listResult.listSource || 'unknown'} | failures=${formatSourceFailures(listResult.sourceDiagnostics)}`,
        )
      }

      const { cars, total, scanned = cars.length } = listResult
      state.setProgress({
        scanned: state.progress.scanned + scanned,
        found: state.progress.found + cars.length,
      })

      if (!cars.length) {
        if (scanned > 0) {
          state.info(`📭 В этой пачке нет подходящих машин, пропускаю ещё ${scanned} позиций`)
          offset += scanned
          continue
        }
        state.info('📭 Больше машин нет, завершаю')
        break
      }

      state.info(`📦 Получено ${cars.length} машин из ${scanned} просмотренных (Encar всего: ${Number(total || 0).toLocaleString()})`)
      state.info(`LIST_FETCH_OK | cars=${cars.length} | scanned=${scanned} | total=${Number(total || 0).toLocaleString()} | scope=${parseScope} | source=${listResult.listSource || 'unknown'}`)
      const existingEncarIds = await getExistingEncarIdMap(cars.map((raw) => raw?.Id))
      const pageKnownCars = cars.reduce((count, raw) => {
        const rawId = cleanText(raw?.Id)
        return existingEncarIds.has(rawId) || seenEncarIds.has(rawId) ? count + 1 : count
      }, 0)
      const pageFreshCars = Math.max(cars.length - pageKnownCars, 0)
      const useTailStopGuard = shouldUseTailStopGuard(parseScope)

      if (pageKnownCars === cars.length) {
        if (useTailStopGuard) {
          consecutiveKnownOnlyPages += 1
          consecutiveLowYieldPages += 1
        } else {
          consecutiveKnownOnlyPages = 0
          consecutiveLowYieldPages = 0
        }
        state.setProgress({
          alreadyKnown: state.progress.alreadyKnown + pageKnownCars,
        })
        state.info(`LIST_ALL_KNOWN_PAGE | scope=${parseScope} | offset=${offset} | known=${pageKnownCars} | consecutive=${consecutiveKnownOnlyPages}`)

        if (useTailStopGuard && (consecutiveKnownOnlyPages >= STALE_KNOWN_PAGE_LIMIT || consecutiveLowYieldPages >= LOW_YIELD_PAGE_LIMIT)) {
          state.info(`LIST_STALE_STOP | scope=${parseScope} | offset=${offset} | consecutiveKnownPages=${consecutiveKnownOnlyPages} | consecutiveLowYield=${consecutiveLowYieldPages}`)
          break
        }

        if (!useTailStopGuard) {
          state.info(`LIST_TAIL_GUARD_BYPASSED | scope=${parseScope} | offset=${offset} | reason=known_only_page | known=${pageKnownCars}`)
        }

        offset += scanned
        continue
      }

      consecutiveKnownOnlyPages = 0
      if (useTailStopGuard && pageFreshCars <= LOW_YIELD_MAX_FRESH) {
        consecutiveLowYieldPages += 1
        state.info(`LIST_LOW_YIELD_PAGE | scope=${parseScope} | offset=${offset} | fresh=${pageFreshCars} | known=${pageKnownCars} | consecutive=${consecutiveLowYieldPages}`)
        if (consecutiveLowYieldPages >= LOW_YIELD_PAGE_LIMIT) {
          state.info(`LIST_STALE_STOP | scope=${parseScope} | offset=${offset} | consecutiveKnownPages=${consecutiveKnownOnlyPages} | consecutiveLowYield=${consecutiveLowYieldPages}`)
          break
        }
      } else if (!useTailStopGuard && pageFreshCars <= LOW_YIELD_MAX_FRESH) {
        state.info(`LIST_TAIL_GUARD_BYPASSED | scope=${parseScope} | offset=${offset} | reason=low_yield_page | fresh=${pageFreshCars} | known=${pageKnownCars}`)
        consecutiveLowYieldPages = 0
      } else {
        consecutiveLowYieldPages = 0
      }

      for (const raw of cars) {
        if (state.stopReq) {
          state.warn('STOP_REQUESTED')
          state.warn('⏹️ Остановлено пользователем')
          break
        }

        const car = mapCar(raw, exchangeSnapshot, pricingSettings)
        const currentEncarId = cleanText(raw.Id)

        const genericVehicleReason = getBlockedGenericVehicleReason({
          name: car.name,
          model: car.model,
          rawManufacturer: raw.Manufacturer,
          rawModel: raw.Model,
        })
        if (genericVehicleReason) {
          recordSkip(buildFilterDiagnostic({
            stage: 'list_filter',
            reason: 'filtered_generic_vehicle',
            details: genericVehicleReason,
            car,
            raw,
          }))
          continue
        }

        const carYear = Number.parseInt(String(car.year || ''), 10)
        if (!Number.isFinite(carYear) || carYear < MIN_SCRAPER_YEAR) {
          recordSkip(buildFilterDiagnostic({
            stage: 'list_filter',
            reason: 'filtered_year',
            details: `year=${car.year || 'unknown'} < ${MIN_SCRAPER_YEAR}`,
            car,
            raw,
          }))
          continue
        }

        const preDetailPriceReason = getBlockedCatalogPriceReason({
          priceKrw: car.price_krw,
          priceUsd: car.price_usd,
        })
        if (preDetailPriceReason) {
          recordSkip(buildFilterDiagnostic({
            stage: 'list_filter',
            reason: 'filtered_price',
            details: preDetailPriceReason,
            car,
            raw,
          }))
          continue
        }

        const existId = existingEncarIds.get(currentEncarId) || (seenEncarIds.has(currentEncarId) ? 'seen' : null)
        if (existId) {
          recordSkip(buildDuplicateDiagnostic(
            'duplicate_encar_id',
            `existing car with encar_id=${currentEncarId}`,
            car,
            raw,
            existId,
          ))
          continue
        }

        if (!matchesScopedImportedBrand(car, raw, parseScope)) {
          recordSkip(buildFilterDiagnostic({
            stage: 'scope_filter',
            reason: 'parse_scope_filtered',
            details: `manufacturer=${cleanText(car.manufacturer || raw?.Manufacturer || 'unknown')}, scope=${parseScope}`,
            car,
            raw,
          }))
          continue
        }

        seenEncarIds.add(currentEncarId)

        let preparedCar = car
        let enrichment = null

        try {
          const result = await retryOperation(
            () => fetchEncarVehicleEnrichment(raw.Id),
            {
              maxAttempts: DETAIL_RETRY_ATTEMPTS,
              baseDelayMs: 1500,
              factor: 2,
              classifyError: (error) => classifyDetailError(error, 'detail_fetch_failed'),
              onRetry: async ({ attempt, nextAttempt, maxAttempts, delayMs, classification }) => {
                state.warn(
                  [
                    'RETRY',
                    'stage=detail_enrichment',
                    `carId=${currentEncarId}`,
                    `reason=${classification.reason}`,
                    `attempt=${attempt}/${maxAttempts}`,
                    `next=${nextAttempt}`,
                    `delayMs=${delayMs}`,
                    classification.httpStatus ? `http=${classification.httpStatus}` : '',
                    classification.details ? `details=${classification.details}` : '',
                  ].filter(Boolean).join(' | '),
                )
              },
            },
          )
          enrichment = result.value
          if (result.recovered) {
            recordRetryRecovered('detail_enrichment', car, result.attempts, enrichment?.source || '')
          }
          preparedCar = mergeCarEnrichment(car, enrichment, exchangeSnapshot, pricingSettings)
        } catch (enrichmentError) {
          const detailDiagnostic = buildDetailDiagnostic(enrichmentError, car, raw)

          if (detailDiagnostic.retryable && detailDiagnostic.temporary) {
            try {
              preparedCar = await softRecheckEnrichment(raw, car, exchangeSnapshot, pricingSettings)
              state.success(`SOFT_RECHECK_RECOVERED | stage=detail_enrichment | carId=${currentEncarId} | source=${preparedCar.vehicle_id ? 'detail' : 'list'}`)
            } catch (recheckError) {
              const recheckDiagnostic = buildDetailDiagnostic(recheckError, car, raw)
              state.warn(formatDiagnosticMessage('FAIL', recheckDiagnostic), {
                diagnostic: recheckDiagnostic,
                softRecheck: true,
              })
            }
          }

          if (preparedCar !== car) {
            // Soft re-check recovered the detail payload, continue with enriched data.
          } else if (!canImportPartialCar(car, detailDiagnostic)) {
            recordSkip(detailDiagnostic)
            continue
          } else {
            state.warn(formatDiagnosticMessage('PARTIAL_IMPORT', detailDiagnostic), {
              diagnostic: detailDiagnostic,
              partialImport: true,
            })
            preparedCar = normalizeImportedCar(car)
          }
        }

        const enrichedGenericVehicleReason = getBlockedGenericVehicleReason({
          name: preparedCar.name,
          model: preparedCar.model,
        })
        if (enrichedGenericVehicleReason) {
          recordSkip(buildFilterDiagnostic({
            stage: 'post_detail_filter',
            reason: 'filtered_generic_vehicle',
            details: enrichedGenericVehicleReason,
            car: preparedCar,
            raw,
          }))
          continue
        }

        if (Number(preparedCar.price_krw || 0) <= 0) {
          recordSkip(buildFilterDiagnostic({
            stage: 'post_detail_filter',
            reason: 'filtered_price',
            details: 'price_krw <= 0 after detail merge',
            car: preparedCar,
            raw,
          }))
          continue
        }

        const postDetailPriceReason = getBlockedCatalogPriceReason({
          priceKrw: preparedCar.price_krw,
          priceUsd: preparedCar.price_usd,
        })
        if (postDetailPriceReason) {
          recordSkip(buildFilterDiagnostic({
            stage: 'post_detail_filter',
            reason: 'filtered_price',
            details: postDetailPriceReason,
            car: preparedCar,
            raw,
          }))
          continue
        }

        const duplicateVinId = await getExistingIdByVin(preparedCar.vin)
        if (duplicateVinId) {
          recordSkip(buildDuplicateDiagnostic(
            'duplicate_vin',
            `VIN already exists at ID ${duplicateVinId}`,
            preparedCar,
            raw,
            duplicateVinId,
          ))
          continue
        }

        state.info(`🔍 ${preparedCar.name} (${preparedCar.year}, ${Number(preparedCar.mileage || 0).toLocaleString()} км, $${Number(preparedCar.price_usd || 0).toLocaleString()})`)

        let photoUrls = []
        try {
          const extracted = extractPhotoUrls(raw, PHOTO_LIMIT)
          const detailPhotos = Array.isArray(preparedCar.image_urls) ? preparedCar.image_urls.slice(0, PHOTO_LIMIT) : []
          const validUrls = extracted.length
            ? extracted
            : detailPhotos.length
              ? detailPhotos
              : await probePhotoUrls(raw.Id, PHOTO_LIMIT)

          photoUrls = validUrls

          if (photoUrls.length) {
            state.info(`PHOTO_FETCH | carId=${currentEncarId} | count=${photoUrls.length} | source=${extracted.length ? 'list' : detailPhotos.length ? 'detail' : 'probe'}`)
            const photoDownload = await downloadPhotosDetailed(photoUrls, raw.Id, PHOTO_LIMIT)
            state.setProgress({ photos: state.progress.photos + photoUrls.length })

            if (photoDownload.failed && photoDownload.failed === photoDownload.attempted) {
              state.warn(formatDiagnosticMessage(
                'PHOTO_WARN',
                buildPhotoDiagnostic('photo_all_failed', 'all photo downloads failed, keeping car import', preparedCar, raw, {
                  attempted: photoDownload.attempted,
                  saved: photoDownload.saved,
                }),
              ))
            } else if (photoDownload.failed) {
              state.warn(formatDiagnosticMessage(
                'PHOTO_WARN',
                buildPhotoDiagnostic('photo_partial_failure', `${photoDownload.failed} photo(s) failed, keeping partial photo set`, preparedCar, raw, {
                  attempted: photoDownload.attempted,
                  saved: photoDownload.saved,
                }),
              ))
            }
          }
        } catch (photoErr) {
          state.warn(formatDiagnosticMessage(
            'PHOTO_WARN',
            buildPhotoDiagnostic('photo_all_failed', cleanText(photoErr.message), preparedCar, raw),
          ))
        }

        try {
          const newId = await insertCar(preparedCar, photoUrls)
          seenEncarIds.add(preparedCar.encar_id)
          addedThisRun += 1
          state.setProgress({ done: state.progress.done + 1 })
          state.success(`IMPORTED | name=${preparedCar.name} | id=${newId} | photos=${photoUrls.length}`, {
            carId: currentEncarId,
            importedId: newId,
          })
          state.success(`✅ Сохранено: ${preparedCar.name} -> id=${newId}, фото=${photoUrls.length}`, {
            carId: currentEncarId,
            importedId: newId,
          })
        } catch (dbErr) {
          if (dbErr?.code === 'DUPLICATE_ENCAR') {
            recordSkip(buildDuplicateDiagnostic(
              'duplicate_encar_id',
              `late duplicate by encar_id, existing ID ${dbErr.duplicateId || '-'}`,
              preparedCar,
              raw,
              dbErr.duplicateId,
            ))
            continue
          }

          if (dbErr?.code === 'DUPLICATE_VIN') {
            recordSkip(buildDuplicateDiagnostic(
              'duplicate_vin',
              `late duplicate by VIN, existing ID ${dbErr.duplicateId || '-'}`,
              preparedCar,
              raw,
              dbErr.duplicateId,
            ))
            continue
          }

          recordFailure(buildDbDiagnostic(dbErr, preparedCar, raw))
        }

        if (addedThisRun >= limit) {
          state.info(`LIMIT_REACHED | limit=${limit}`)
          state.info(`✅ Достигнут лимит новых машин: ${limit}`)
          break
        }
      }

      offset += scanned
    }

    await updateScrapeStats(addedThisRun)

    if (state.stopReq) {
      state.warn(`STOPPED | imported=${state.progress.done}`)
      state.warn(`⏹️ Остановлено. Добавлено: ${state.progress.done}`)
    } else {
      state.success(
        `SCRAPER_DONE | imported=${state.progress.done} | skipped=${state.progress.skipped} | failed=${state.progress.failed} | recovered=${state.progress.retryRecovered} | photos=${state.progress.photos}`,
      )
      state.success(
        `🎉 Готово! Добавлено: ${state.progress.done} | Пропущено: ${state.progress.skipped} | Ошибок: ${state.progress.failed} | Восстановлено retry: ${state.progress.retryRecovered} | Фото: ${state.progress.photos}`,
      )
    }

    for (const line of getSummaryLines()) {
      state.info(line)
    }
  } catch (err) {
    state.error(`SCRAPER_FATAL | message=${cleanText(err?.message || 'unknown error')}`)
    state.error(`💥 Критическая ошибка: ${cleanText(err?.message || 'unknown error')}`)
  } finally {
    state.finishSession()
    state.isRunning = false
    state.stopReq = false
    state.emit('update', {
      type: 'done',
      progress: { ...state.progress },
      sessionSummary: {
        ...state.sessionSummary,
        reasons: { ...state.sessionSummary.reasons },
        topReasons: state.sessionSummary.topReasons.slice(0, 20),
      },
    })
  }
}

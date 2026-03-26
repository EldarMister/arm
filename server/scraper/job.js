import pool from '../db.js'
import { repairTextEncoding } from '../lib/textEncoding.js'
import { getBlockedGenericVehicleReason } from '../lib/catalogVehicleRules.js'
import { computePricing, getExchangeRateSnapshot } from '../lib/exchangeRate.js'
import { getBlockedCatalogPriceReason } from '../lib/catalogPriceRules.js'
import { normalizeCarTextFields } from '../lib/carRecordNormalization.js'
import { fetchEncarVehicleEnrichment } from '../lib/encarVehicle.js'
import {
  buildStoredDetailFlags,
  ensureCarListingMetadataColumns,
  normalizeInspectionFormats,
} from '../lib/carListingMetadata.js'
import { getPricingSettings, resolveVehicleFees } from '../lib/pricingSettings.js'
import { BODY_TYPE_LABELS } from '../../shared/vehicleTaxonomy.js'
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
  resolveVehicleClass,
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
  getListPageSnapshot,
  loadScraperRuntimeCache,
  rememberListPageSnapshot,
} from './runtimeCache.js'
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
const DETAIL_SUCCESS_PACING_MIN_MS = 300
const DETAIL_SUCCESS_PACING_MAX_MS = 900
const STALE_KNOWN_PAGE_LIMIT = 2
const LOW_YIELD_PAGE_LIMIT = 4
const LOW_YIELD_MAX_FRESH = 1
const STABLE_KNOWN_PAGE_LIMIT = 2
const STABLE_LOW_YIELD_PAGE_LIMIT = 3
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

const BUSINESS_SEDAN_MODEL_RE = [
  /\bAudi\s+A6\b/i,
  /\bMercedes[-\s]?Benz\s+E-Class\b/i,
  /\bBMW\s+5\s*Series\b/i,
  /\bHyundai\s+Grandeur\b/i,
  /\bGenesis\s+G80\b/i,
  /\bKia\s+K7\b/i,
  /\bKia\s+K8\b/i,
  /\bVolvo\s+S90\b/i,
  /\bLexus\s+ES\b/i,
]

const EXECUTIVE_SEDAN_MODEL_RE = [
  /\bBMW\s+7\s*Series\b/i,
  /\bBMW\s+i7\b/i,
  /\bMercedes[-\s]?Benz\s+S-Class\b/i,
  /\bAudi\s+A8\b/i,
  /\bGenesis\s+G90\b/i,
  /\bLexus\s+LS\b/i,
  /\bRolls-?Royce\s+Ghost(?:\s+EWB)?\b/i,
  /\bBentley\s+Flying\s+Spur\b/i,
]

const BODY_TYPE_MODEL_OVERRIDES = [
  { pattern: /\bRay\b/i, body: BODY_TYPE_LABELS.microvan },
  { pattern: /\bPorsche\s+Taycan\b/i, body: BODY_TYPE_LABELS.liftback },
  { pattern: /\bAudi\s+e-?tron\s+GT\b/i, body: BODY_TYPE_LABELS.liftback },
  { pattern: /\bAudi\s+RS7\b/i, body: BODY_TYPE_LABELS.liftback },
  { pattern: /\bAudi\s+S7\b/i, body: BODY_TYPE_LABELS.liftback },
  { pattern: /\bPorsche\s+718\b/i, body: BODY_TYPE_LABELS.coupe },
  { pattern: /\bJaguar\s+F-?TYPE\b/i, body: BODY_TYPE_LABELS.coupe },
  { pattern: /\bMaserati\s+MC20\b/i, body: BODY_TYPE_LABELS.coupe },
  { pattern: /\bRolls-?Royce\s+Wraith\b/i, body: BODY_TYPE_LABELS.coupe },
  { pattern: /\bRolls-?Royce\s+Spectre\b.*\bCoupe\b/i, body: BODY_TYPE_LABELS.coupe },
  { pattern: /\bBentley\s+Continental\b.*\bGTC\b/i, body: BODY_TYPE_LABELS.cabriolet },
  { pattern: /\bHyundai\s+Solati\b/i, body: BODY_TYPE_LABELS.minivan },
  { pattern: /\bMercedes[-\s]?Benz\s+V-Class\b/i, body: BODY_TYPE_LABELS.minivan },
  { pattern: /\bDodge\s+Ram\s+Pick\s+Up\b/i, body: BODY_TYPE_LABELS.pickup },
  { pattern: /\bGMC\s+Sierra\b/i, body: BODY_TYPE_LABELS.pickup },
  { pattern: /\bChevrolet\s+Colorado\b/i, body: BODY_TYPE_LABELS.pickup },
  { pattern: /\bSsangYong\s+Musso\b/i, body: BODY_TYPE_LABELS.pickup },
  { pattern: /\bSsangYong\s+Rexton\b/i, body: BODY_TYPE_LABELS.suv },
  { pattern: /\bSuzuki\s+Jimny\b/i, body: BODY_TYPE_LABELS.suv },
  { pattern: /\bIneos\s+Grenadier\b.*\bStation\s+Wagon\b/i, body: BODY_TYPE_LABELS.suv },
  { pattern: /\bRolls-?Royce\s+Cullinan\b/i, body: BODY_TYPE_LABELS.suv },
  { pattern: /\bBMW\s+X5\b/i, body: BODY_TYPE_LABELS.suv },
  { pattern: /\bLamborghini\s+Revuelto\b/i, body: BODY_TYPE_LABELS.coupe },
  { pattern: /\bLamborghini\s+Huracan\b.*\bSTO\b/i, body: BODY_TYPE_LABELS.coupe },
]

const RE_HYUNDAI_IONIQ5 = /\bHyundai\s+Ioniq\s*5\b/i
const RE_BMW_GRAN_TURISMO = /\bBMW\b.*\bGran\s+Turismo\b/i
const RE_BMW_1_SERIES = /\bBMW\s+1\s*Series\b/i
const RE_BENTLEY_CONTINENTAL_GTC = /\bBentley\s+Continental\b.*\bGTC\b/i
const RE_BENTLEY_CONTINENTAL_GT = /\bBentley\s+Continental\b.*\bGT\b/i
const RE_PORSCHE_911 = /\bPorsche\s+911\b/i
const RE_PORSCHE_911_OPEN = /\b(Cabriolet|Targa)\b/i
const RE_MERCEDES_SL_CLASS = /\bMercedes[-\s]?Benz\s+SL-Class\b/i
const RE_ASTON_VANTAGE_ROADSTER = /\bAston\s+Martin\s+Vantage\b.*\bRoadster\b/i
const RE_AUDI_RS6_AVANT = /\bAudi\s+RS6\b.*\bAvant\b/i
const RE_JEEP_GLADIATOR = /\bJeep\s+Gladiator\b/i
const RE_KIA_TASMAN = /\bKia\s+Tasman\b/i
const RE_CHEVROLET_DAMAS = /\bChevrolet\s+Damas\b/i
const RE_LEXUS_LM = /\bLexus\s+LM\b/i
const RENTAL_PLATE_RE = /\d{2,3}\s*[허하호]\s*\d{4}/u
const COMMERCIAL_USE_TEXT_RE = /(?:\b(?:rent|rental|lease|leasing|taxi)\b|렌트카|렌터카|렌트|리스|영업용|택시)/iu

function matchesAny(patterns, text) {
  return patterns.some((pattern) => pattern.test(text))
}

function applyBodyTypeOverrides(bodyType, context) {
  const text = cleanText(context)
  if (!text) return bodyType

  const isExecutive = matchesAny(EXECUTIVE_SEDAN_MODEL_RE, text)
  const isBusiness = matchesAny(BUSINESS_SEDAN_MODEL_RE, text)
  const isSf90 = /\bFerrari\s+SF90\b/i.test(text)
  const isSpider = /\bSpider\b/i.test(text)
  const isBodyEmpty = !bodyType || String(bodyType).trim() === '-'

  for (const rule of BODY_TYPE_MODEL_OVERRIDES) {
    if (rule.pattern.test(text)) return rule.body
  }

  if (RE_HYUNDAI_IONIQ5.test(text) && bodyType === BODY_TYPE_LABELS.sedan) {
    return BODY_TYPE_LABELS.suv
  }

  if (RE_BMW_GRAN_TURISMO.test(text) && bodyType === BODY_TYPE_LABELS.sedan) {
    return BODY_TYPE_LABELS.liftback
  }

  if (RE_BMW_1_SERIES.test(text) && bodyType === BODY_TYPE_LABELS.sedan) {
    return BODY_TYPE_LABELS.hatchback
  }

  if (isBodyEmpty && RE_BENTLEY_CONTINENTAL_GTC.test(text)) {
    return BODY_TYPE_LABELS.cabriolet
  }

  if (isBodyEmpty && RE_BENTLEY_CONTINENTAL_GT.test(text) && !RE_BENTLEY_CONTINENTAL_GTC.test(text)) {
    return BODY_TYPE_LABELS.coupe
  }

  if (isBodyEmpty && RE_PORSCHE_911.test(text) && !RE_PORSCHE_911_OPEN.test(text)) {
    return BODY_TYPE_LABELS.coupe
  }

  if (isBodyEmpty && RE_MERCEDES_SL_CLASS.test(text)) {
    return BODY_TYPE_LABELS.roadster
  }

  if (isBodyEmpty && RE_ASTON_VANTAGE_ROADSTER.test(text)) {
    return BODY_TYPE_LABELS.roadster
  }

  if (isBodyEmpty && RE_AUDI_RS6_AVANT.test(text)) {
    return BODY_TYPE_LABELS.wagon
  }

  if (isBodyEmpty && RE_JEEP_GLADIATOR.test(text)) {
    return BODY_TYPE_LABELS.pickup
  }

  if (isBodyEmpty && RE_KIA_TASMAN.test(text)) {
    return BODY_TYPE_LABELS.pickup
  }

  if (isBodyEmpty && RE_CHEVROLET_DAMAS.test(text)) {
    return BODY_TYPE_LABELS.minivan
  }

  if (isBodyEmpty && RE_LEXUS_LM.test(text)) {
    return BODY_TYPE_LABELS.minivan
  }

  if (isSf90) {
    if (isSpider) return BODY_TYPE_LABELS.cabriolet
    if (!bodyType || bodyType === BODY_TYPE_LABELS.sedan) return BODY_TYPE_LABELS.coupe
  }

  if (bodyType === BODY_TYPE_LABELS.executiveSedan && !isExecutive) {
    return BODY_TYPE_LABELS.sedan
  }
  if (bodyType === BODY_TYPE_LABELS.businessSedan && !isBusiness) {
    return BODY_TYPE_LABELS.sedan
  }

  if (!bodyType || bodyType === BODY_TYPE_LABELS.sedan) {
    if (isExecutive) return BODY_TYPE_LABELS.executiveSedan
    if (isBusiness) return BODY_TYPE_LABELS.businessSedan
  }

  return bodyType
}

function cleanText(value) {
  return repairTextEncoding(String(value || '')).replace(/\s+/g, ' ').trim()
}

function getBlockedCommercialUseReason({ raw, car }) {
  const vehicleNoSignals = [
    car?.vehicle_no,
    raw?.VehicleNo,
    raw?.vehicleNo,
    raw?.CarNo,
    raw?.carNo,
  ]
    .map((value) => cleanText(value))
    .filter(Boolean)

  for (const vehicleNo of vehicleNoSignals) {
    if (RENTAL_PLATE_RE.test(vehicleNo)) {
      return `commercial plate detected: ${vehicleNo}`
    }
  }

  const textSignals = [
    car?.name,
    car?.model,
    car?.trim_level,
    raw?.Name,
    raw?.Model,
    raw?.Badge,
    raw?.BadgeDetail,
    raw?.Grade,
    raw?.GradeDetail,
    raw?.SubModel,
    raw?.Title,
    raw?.title,
    raw?.Memo,
    raw?.memo,
    raw?.OneLineText,
    raw?.oneLineText,
  ]
    .map((value) => cleanText(value))
    .filter(Boolean)

  for (const signal of textSignals) {
    const match = signal.match(COMMERCIAL_USE_TEXT_RE)
    if (match) {
      return `commercial use marker "${match[0]}" detected`
    }
  }

  return ''
}

function normalizeEvidenceSource(value) {
  const text = cleanText(value)
  return text || null
}

function serializeEvidenceDiagnostics(value) {
  return JSON.stringify(Array.isArray(value) ? value : [])
}

function buildListPageFingerprint(cars = [], scanned = 0) {
  const ids = cars
    .map((raw) => cleanText(raw?.Id))
    .filter(Boolean)
    .slice(0, PAGE_SIZE)

  return `${Number(scanned) || 0}|${ids.join(',')}`
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

function getDetailSuccessPacingMs() {
  if (DETAIL_SUCCESS_PACING_MAX_MS <= DETAIL_SUCCESS_PACING_MIN_MS) {
    return DETAIL_SUCCESS_PACING_MIN_MS
  }

  return Math.round(
    DETAIL_SUCCESS_PACING_MIN_MS + Math.random() * (DETAIL_SUCCESS_PACING_MAX_MS - DETAIL_SUCCESS_PACING_MIN_MS),
  )
}

async function paceAfterDetailFlow() {
  await sleep(getDetailSuccessPacingMs())
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
  let body_type = resolveBodyType(
    raw.BodyType || raw.Body || raw.Shape || '',
    raw.Model,
    raw.Badge,
    raw.Name,
    raw.SubModel,
    raw.Grade,
    raw.BadgeDetail,
  )
  const vehicle_class = resolveVehicleClass(
    raw.VehicleClass || raw.Class || '',
    body_type,
    raw.Model,
    raw.Badge,
    raw.Name,
    raw.SubModel,
    raw.Grade,
    raw.BadgeDetail,
  )
  body_type = applyBodyTypeOverrides(
    body_type,
    [model, badge, rawName, raw.SubModel, raw.Grade, raw.BadgeDetail, raw.GradeDetail].filter(Boolean).join(' ')
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
    vehicle_class,
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
    vehicle_class,
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
    `SELECT id, encar_id, name, model, price_krw, price_usd, commission, delivery, loading, unloading, storage, vat_refund, total
     FROM cars
     WHERE encar_id = ANY($1::text[])`,
    [normalized],
  )

  return new Map(res.rows.map((row) => [String(row.encar_id || '').trim(), row]))
}

async function getExistingIdByVin(vin, cache = null) {
  const normalizedVin = normalizeVin(vin)
  if (!isStandardVin(normalizedVin)) return null

  if (cache && cache.has(normalizedVin)) {
    const cached = cache.get(normalizedVin)
    return {
      id: cached,
      fromCache: true,
      normalizedVin,
    }
  }

  const res = await pool.query(
    'SELECT id FROM cars WHERE UPPER(BTRIM(vin)) = $1 LIMIT 1',
    [normalizedVin],
  )
  const id = res.rows.length ? res.rows[0].id : null
  if (cache) cache.set(normalizedVin, id)
  return {
    id,
    fromCache: false,
    normalizedVin,
  }
}

function buildPriceRefreshPatch(existingCar, nextPriceKrw, exchangeSnapshot) {
  const normalizedNextPriceKrw = Math.round(Number(nextPriceKrw) || 0)
  if (normalizedNextPriceKrw <= 0) return null

  const currentPriceKrw = Math.round(Number(existingCar?.price_krw) || 0)
  const hasPriceChanged = normalizedNextPriceKrw !== currentPriceKrw
  const hasBrokenDerivedPricing = (
    currentPriceKrw <= 0
    || Number(existingCar?.price_usd || 0) <= 0
    || Number(existingCar?.vat_refund || 0) < 0
    || Number(existingCar?.total || 0) <= 0
  )

  if (!hasPriceChanged && !hasBrokenDerivedPricing) return null

  const pricing = computePricing({
    priceKrw: normalizedNextPriceKrw,
    commission: existingCar?.commission,
    delivery: existingCar?.delivery,
    loading: existingCar?.loading,
    unloading: existingCar?.unloading,
    storage: existingCar?.storage,
  }, exchangeSnapshot)

  const patch = {}
  if (hasPriceChanged) patch.price_krw = normalizedNextPriceKrw
  if (hasPriceChanged || Number(existingCar?.price_usd) !== Number(pricing.price_usd)) {
    patch.price_usd = pricing.price_usd
  }
  if (hasPriceChanged || Number(existingCar?.vat_refund) !== Number(pricing.vat_refund)) {
    patch.vat_refund = pricing.vat_refund
  }
  if (hasPriceChanged || Number(existingCar?.total) !== Number(pricing.total)) {
    patch.total = pricing.total
  }

  return Object.keys(patch).length ? patch : null
}

async function refreshKnownCarPricing(existingCar, nextPriceKrw, exchangeSnapshot) {
  const patch = buildPriceRefreshPatch(existingCar, nextPriceKrw, exchangeSnapshot)
  const previousPriceKrw = Math.round(Number(existingCar?.price_krw) || 0)
  if (!patch) {
    return {
      updated: false,
      previousPriceKrw,
      nextPriceKrw: previousPriceKrw,
      updatedFields: [],
    }
  }

  const entries = Object.entries(patch)
  const updates = []
  const params = []
  let index = 1

  for (const [field, value] of entries) {
    updates.push(`${field} = $${index++}`)
    params.push(value)
  }

  updates.push('updated_at = NOW()')
  params.push(existingCar.id)

  await pool.query(
    `UPDATE cars
     SET ${updates.join(', ')}
     WHERE id = $${index}`,
    params,
  )

  Object.assign(existingCar, patch)

  return {
    updated: true,
    previousPriceKrw,
    nextPriceKrw: Math.round(Number(existingCar?.price_krw) || previousPriceKrw),
    updatedFields: entries.map(([field]) => field),
  }
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
    vehicle_class: car.vehicle_class,
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
  const nextFuelType = normalizedText.fuel_type ?? car.fuel_type
  const nextDriveType = normalizedText.drive_type ?? car.drive_type

  return {
    ...car,
    name: normalizedText.name ?? car.name,
    model: normalizedText.model ?? car.model,
    fuel_type: nextFuelType,
    drive_type: nextDriveType,
    body_type: normalizedText.body_type ?? car.body_type,
    vehicle_class: normalizedText.vehicle_class ?? car.vehicle_class,
    trim_level: normalizedText.trim_level ?? car.trim_level,
    body_color: normalizedText.body_color ?? car.body_color,
    interior_color: normalizedText.interior_color ?? car.interior_color,
    option_features: Array.isArray(car.option_features)
      ? [...new Set(car.option_features.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, 16)
      : [],
    location: normalizedText.location || car.location || 'Корея',
    tags: normalizedText.tags ?? rebuildTags({
      ...car,
      fuel_type: nextFuelType,
      drive_type: nextDriveType,
    }),
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
    drive_type_source: normalizeEvidenceSource(enrichment.drive_type_source) || normalizeEvidenceSource(car.drive_type_source),
    drive_type_diagnostics: Array.isArray(enrichment.drive_type_diagnostics)
      ? enrichment.drive_type_diagnostics
      : (Array.isArray(car.drive_type_diagnostics) ? car.drive_type_diagnostics : []),
    body_type: enrichment.body_type || car.body_type,
    vehicle_class: enrichment.vehicle_class || car.vehicle_class,
    trim_level: enrichment.trim_level || car.trim_level,
    body_color: enrichment.body_color || car.body_color,
    interior_color: enrichment.interior_color || car.interior_color,
    interior_color_source: normalizeEvidenceSource(enrichment.interior_color_source) || normalizeEvidenceSource(car.interior_color_source),
    interior_color_diagnostics: Array.isArray(enrichment.interior_color_diagnostics)
      ? enrichment.interior_color_diagnostics
      : (Array.isArray(car.interior_color_diagnostics) ? car.interior_color_diagnostics : []),
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
    detail_flags: buildStoredDetailFlags({
      ...(car.detail_flags || {}),
      ...(enrichment.flags || {}),
      galleryReady: Array.isArray(enrichment.image_urls) && enrichment.image_urls.length > 0
        ? true
        : (car.detail_flags?.galleryReady === true),
    }),
    inspection_formats: normalizeInspectionFormats(enrichment.condition?.inspectionFormats || car.inspection_formats),
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
  await ensureCarListingMetadataColumns()
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
         (name, model, year, mileage, price_krw, price_usd, fuel_type, transmission, drive_type, drive_type_source, drive_type_diagnostics,
          body_type, vehicle_class, trim_level, key_info, body_color, interior_color, interior_color_source, interior_color_diagnostics, warranty_company, warranty_body_months, warranty_body_km,
         warranty_transmission_months, warranty_transmission_km, option_features, location, vin, encar_url, encar_id,
          tags, can_negotiate, commission, delivery, delivery_profile_code, loading, unloading, storage, pricing_locked, vat_refund, total,
          detail_flags, inspection_formats)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42)
       RETURNING id`,
      [
        car.name, car.model, car.year, car.mileage,
        car.price_krw, car.price_usd, car.fuel_type, car.transmission, car.drive_type,
        normalizeEvidenceSource(car.drive_type_source), serializeEvidenceDiagnostics(car.drive_type_diagnostics),
        car.body_type || null, car.vehicle_class || null, car.trim_level || null, car.key_info || null,
        car.body_color, car.interior_color, normalizeEvidenceSource(car.interior_color_source), serializeEvidenceDiagnostics(car.interior_color_diagnostics),
        car.warranty_company || null, car.warranty_body_months ?? null, car.warranty_body_km ?? null,
        car.warranty_transmission_months ?? null, car.warranty_transmission_km ?? null, car.option_features || [], car.location, car.vin,
        car.encar_url, car.encar_id, car.tags, car.can_negotiate, car.commission, car.delivery, car.delivery_profile_code || null,
        car.loading, car.unloading, car.storage, car.pricing_locked || false, car.vat_refund, car.total,
        buildStoredDetailFlags(car.detail_flags), normalizeInspectionFormats(car.inspection_formats),
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
  state.recordRetryRecovered()
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
  void parseScope
  // Encar feed is newest-first, so several consecutive low-yield pages
  // are a reliable signal that we are already in the stale tail.
  return true
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
      sourceFailures: Array.isArray(error?.fetchSourceDiagnostics) ? error.fetchSourceDiagnostics : [],
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
  await loadScraperRuntimeCache()

  state.info(`🚀 Запуск парсера: режим ${formatParseScopeLabel(parseScope)}, лимит ${limit} новых машин`)

  const sourceMode = globalThis.process?.env?.ENCAR_PROXY_URL
    ? 'auto direct/proxy failover for list and detail'
    : 'direct Encar API + detail HTML fallback'
  state.info(`Source mode: ${sourceMode}`)
  state.info(`Request pacing: ${DETAIL_SUCCESS_PACING_MIN_MS}-${DETAIL_SUCCESS_PACING_MAX_MS}ms between detail requests`)
  const exchangeSnapshot = await getExchangeRateSnapshot()
  const pricingSettings = await getPricingSettings()
  const seenEncarIds = new Set()

  let offset = 0
  let addedThisRun = 0
  let consecutiveKnownOnlyPages = 0
  let consecutiveLowYieldPages = 0
  let consecutiveStableKnownPages = 0
  let consecutiveStableLowYieldPages = 0
  const vinLookupCache = new Map()

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
      const pageFingerprint = buildListPageFingerprint(cars, scanned)
      const cachedPage = getListPageSnapshot(parseScope, offset)
      const pageKnownCars = cars.reduce((count, raw) => {
        const rawId = cleanText(raw?.Id)
        return existingEncarIds.has(rawId) || seenEncarIds.has(rawId) ? count + 1 : count
      }, 0)
      const pageFreshCars = Math.max(cars.length - pageKnownCars, 0)
      const isStableKnownOnlyPage = Boolean(
        cachedPage
        && cachedPage.fingerprint
        && cachedPage.fingerprint === pageFingerprint
        && pageKnownCars === cars.length,
      )
      const isStableLowYieldPage = Boolean(
        cachedPage
        && cachedPage.fingerprint
        && cachedPage.fingerprint === pageFingerprint
        && pageFreshCars <= LOW_YIELD_MAX_FRESH,
      )
      const useTailStopGuard = shouldUseTailStopGuard(parseScope)

      if (pageKnownCars === cars.length) {
        consecutiveStableKnownPages = isStableKnownOnlyPage ? consecutiveStableKnownPages + 1 : 0
        consecutiveStableLowYieldPages = isStableKnownOnlyPage ? consecutiveStableLowYieldPages + 1 : 0
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
        rememberListPageSnapshot(parseScope, offset, {
          fingerprint: pageFingerprint,
          knownOnly: true,
          freshCount: pageFreshCars,
          scanned,
          total,
          source: listResult.listSource || 'unknown',
        })
        state.info(`LIST_ALL_KNOWN_PAGE | scope=${parseScope} | offset=${offset} | known=${pageKnownCars} | consecutive=${consecutiveKnownOnlyPages}`)

        if (useTailStopGuard && (consecutiveKnownOnlyPages >= STALE_KNOWN_PAGE_LIMIT || consecutiveLowYieldPages >= LOW_YIELD_PAGE_LIMIT)) {
          state.info(`LIST_STALE_STOP | scope=${parseScope} | offset=${offset} | consecutiveKnownPages=${consecutiveKnownOnlyPages} | consecutiveLowYield=${consecutiveLowYieldPages}`)
          state.recordOptimizationHit('listTailStops')
          break
        }

        if (!useTailStopGuard && consecutiveStableKnownPages >= STABLE_KNOWN_PAGE_LIMIT) {
          state.info(`LIST_STABLE_STOP | scope=${parseScope} | offset=${offset} | stableKnownPages=${consecutiveStableKnownPages}`)
          state.recordOptimizationHit('listTailStops')
          break
        }

        if (!useTailStopGuard) {
          state.info(`LIST_TAIL_GUARD_BYPASSED | scope=${parseScope} | offset=${offset} | reason=known_only_page | known=${pageKnownCars}`)
        }

        offset += scanned
        continue
      }

      consecutiveKnownOnlyPages = 0
      consecutiveStableKnownPages = 0
      if (useTailStopGuard && pageFreshCars <= LOW_YIELD_MAX_FRESH) {
        consecutiveLowYieldPages += 1
        consecutiveStableLowYieldPages = isStableLowYieldPage ? consecutiveStableLowYieldPages + 1 : 0
        state.info(`LIST_LOW_YIELD_PAGE | scope=${parseScope} | offset=${offset} | fresh=${pageFreshCars} | known=${pageKnownCars} | consecutive=${consecutiveLowYieldPages}`)
        if (consecutiveLowYieldPages >= LOW_YIELD_PAGE_LIMIT) {
          state.info(`LIST_STALE_STOP | scope=${parseScope} | offset=${offset} | consecutiveKnownPages=${consecutiveKnownOnlyPages} | consecutiveLowYield=${consecutiveLowYieldPages}`)
          state.recordOptimizationHit('listTailStops')
          break
        }
      } else if (!useTailStopGuard && pageFreshCars <= LOW_YIELD_MAX_FRESH) {
        state.info(`LIST_TAIL_GUARD_BYPASSED | scope=${parseScope} | offset=${offset} | reason=low_yield_page | fresh=${pageFreshCars} | known=${pageKnownCars}`)
        consecutiveLowYieldPages = 0
        consecutiveStableLowYieldPages = isStableLowYieldPage ? consecutiveStableLowYieldPages + 1 : 0
        if (consecutiveStableLowYieldPages >= STABLE_LOW_YIELD_PAGE_LIMIT) {
          rememberListPageSnapshot(parseScope, offset, {
            fingerprint: pageFingerprint,
            knownOnly: false,
            freshCount: pageFreshCars,
            scanned,
            total,
            source: listResult.listSource || 'unknown',
          })
          state.info(`LIST_STABLE_LOW_YIELD_STOP | scope=${parseScope} | offset=${offset} | stableLowYieldPages=${consecutiveStableLowYieldPages} | fresh=${pageFreshCars}`)
          state.recordOptimizationHit('listTailStops')
          break
        }
      } else {
        consecutiveLowYieldPages = 0
        consecutiveStableLowYieldPages = 0
      }

      rememberListPageSnapshot(parseScope, offset, {
        fingerprint: pageFingerprint,
        knownOnly: false,
        freshCount: pageFreshCars,
        scanned,
        total,
        source: listResult.listSource || 'unknown',
      })

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

        const existingCar = existingEncarIds.get(currentEncarId) || null
        const seenDuplicate = seenEncarIds.has(currentEncarId)
        if (existingCar || seenDuplicate) {
          const duplicateId = existingCar?.id || null
          let duplicateDetails = existingCar
            ? `existing car with encar_id=${currentEncarId}`
            : `duplicate encounter in current scrape for encar_id=${currentEncarId}`

          if (existingCar) {
            try {
              const refreshResult = await refreshKnownCarPricing(existingCar, car.price_krw, exchangeSnapshot)
              if (refreshResult.updated) {
                duplicateDetails = `${duplicateDetails}; price synced ${refreshResult.previousPriceKrw} -> ${refreshResult.nextPriceKrw}`
                state.info(
                  `KNOWN_PRICE_REFRESH | id=${duplicateId} | encar_id=${currentEncarId} | price_krw ${refreshResult.previousPriceKrw} -> ${refreshResult.nextPriceKrw}`,
                )
              }
            } catch (refreshError) {
              state.warn(
                `KNOWN_PRICE_REFRESH_FAILED | id=${duplicateId || '-'} | encar_id=${currentEncarId} | error=${cleanText(refreshError?.message) || 'unknown error'}`,
              )
            }
          }

          recordSkip(buildDuplicateDiagnostic(
            'duplicate_encar_id',
            duplicateDetails,
            car,
            raw,
            duplicateId,
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
            await paceAfterDetailFlow()
            continue
          } else {
            state.warn(formatDiagnosticMessage('PARTIAL_IMPORT', detailDiagnostic), {
              diagnostic: detailDiagnostic,
              partialImport: true,
            })
            state.recordPartialImport()
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
          await paceAfterDetailFlow()
          continue
        }

        const commercialUseReason = getBlockedCommercialUseReason({
          raw,
          car: preparedCar,
        })
        if (commercialUseReason) {
          recordSkip(buildFilterDiagnostic({
            stage: 'post_detail_filter',
            reason: 'filtered_commercial_use',
            details: commercialUseReason,
            car: preparedCar,
            raw,
          }))
          await paceAfterDetailFlow()
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
          await paceAfterDetailFlow()
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
          await paceAfterDetailFlow()
          continue
        }

        const vinLookup = await getExistingIdByVin(preparedCar.vin, vinLookupCache)
        if (vinLookup?.fromCache) {
          state.recordOptimizationHit('vinCacheHits')
        }
        const duplicateVinId = vinLookup?.id || null
        if (duplicateVinId) {
          recordSkip(buildDuplicateDiagnostic(
            'duplicate_vin',
            `VIN already exists at ID ${duplicateVinId}`,
            preparedCar,
            raw,
            duplicateVinId,
          ))
          await paceAfterDetailFlow()
          continue
        }

        state.info(`🔍 ${preparedCar.name} (${preparedCar.year}, ${Number(preparedCar.mileage || 0).toLocaleString()} км, $${Number(preparedCar.price_usd || 0).toLocaleString()})`)

        let photoUrls = []
        try {
          const extracted = extractPhotoUrls(raw, PHOTO_LIMIT)
          const detailPhotos = Array.isArray(preparedCar.image_urls) ? preparedCar.image_urls.slice(0, PHOTO_LIMIT) : []
          const mergedPhotoCandidates = [...detailPhotos, ...extracted]
            .map((item) => String(item || '').trim())
            .filter(Boolean)
            .filter((item, index, list) => list.indexOf(item) === index)
            .slice(0, PHOTO_LIMIT)
          const validUrls = mergedPhotoCandidates.length
            ? mergedPhotoCandidates
            : await probePhotoUrls(raw.Id, PHOTO_LIMIT)

          photoUrls = validUrls
          preparedCar.detail_flags = {
            ...(preparedCar.detail_flags || {}),
            galleryReady: detailPhotos.length > 0,
          }

          if (photoUrls.length) {
            state.info(`PHOTO_FETCH | carId=${currentEncarId} | count=${photoUrls.length} | source=${detailPhotos.length ? 'detail' : extracted.length ? 'list' : 'probe'}`)
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
          if (preparedCar.vin && isStandardVin(preparedCar.vin)) {
            vinLookupCache.set(normalizeVin(preparedCar.vin), newId)
          }
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
            await paceAfterDetailFlow()
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
            await paceAfterDetailFlow()
            continue
          }

          recordFailure(buildDbDiagnostic(dbErr, preparedCar, raw))
        }

        if (addedThisRun >= limit) {
          state.info(`LIMIT_REACHED | limit=${limit}`)
          state.info(`✅ Достигнут лимит новых машин: ${limit}`)
          break
        }

        await paceAfterDetailFlow()
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

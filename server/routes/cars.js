import { Router } from 'express'
import pool from '../db.js'
import { DEFAULT_FEES, VAT_REFUND_RATE, computePricing, getExchangeRateSnapshot } from '../lib/exchangeRate.js'
import { buildBlockedCatalogPriceSql, getBlockedCatalogPriceReason } from '../lib/catalogPriceRules.js'
import { buildBlockedGenericVehicleSql, getBlockedGenericVehicleReason } from '../lib/catalogVehicleRules.js'
import { getPricingSettings, resolveVehicleFees } from '../lib/pricingSettings.js'
import {
  buildStoredDetailFlags,
  ensureCarListingMetadataColumns,
  normalizeDetailFlags,
  normalizeInspectionFormats,
} from '../lib/carListingMetadata.js'
import { getKnownBrandSqlPatterns } from '../../shared/brandAliases.js'
import {
  extractShortLocation,
  extractTrimLevelFromTitle,
  KOREAN_VEHICLE_SQL_PATTERNS,
  normalizeColorName,
  normalizeInteriorColorName,
  normalizeLocationName,
  normalizeTrimLevel,
  resolveVehicleClass,
} from '../lib/vehicleData.js'
import { normalizeCarTextFields } from '../lib/carRecordNormalization.js'
import { isStandardVin, normalizeVin, sanitizeVin } from '../lib/vin.js'
import { requireAdminSession } from '../lib/adminAuth.js'
import { CAR_LISTING_TYPES, normalizeCarListingType } from '../../shared/catalogTypes.js'
import { BODY_TYPE_LABELS } from '../../shared/vehicleTaxonomy.js'

const router = Router()
const MIN_CAR_YEAR = 2019
const adminMutationProtection = requireAdminSession()

function resolveRequestedListingType(value, { allowAll = false } = {}) {
  const normalized = String(value || '').trim().toLowerCase()
  if (allowAll && (normalized === 'all' || normalized === '*')) return 'all'
  return normalizeCarListingType(value, CAR_LISTING_TYPES.main)
}

function parseCatalogYear(value) {
  const match = String(value ?? '').match(/\d{4}/)
  if (!match) return null

  const year = Number.parseInt(match[0], 10)
  return Number.isFinite(year) ? year : null
}

function normalizeCatalogYear(value) {
  const year = parseCatalogYear(value)
  if (!year || year < MIN_CAR_YEAR) return null
  return String(year)
}

function normalizeOptionFeatures(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, 16)
}

function getPayloadPriceBlockReason(payload = {}) {
  return getBlockedCatalogPriceReason({
    priceKrw: payload?.price_krw,
    priceUsd: payload?.price_usd,
  })
}

function getPayloadVehicleBlockReason(payload = {}) {
  return getBlockedGenericVehicleReason({
    name: payload?.name,
    model: payload?.model,
  })
}

async function findDuplicateVinId(vin, excludeId = null) {
  const normalizedVin = normalizeVin(vin)
  if (!isStandardVin(normalizedVin)) return null

  const params = [normalizedVin]
  let sql = 'SELECT id FROM cars WHERE UPPER(BTRIM(vin)) = $1'

  if (excludeId !== null && excludeId !== undefined) {
    params.push(Number(excludeId))
    sql += ' AND id <> $2'
  }

  sql += ' LIMIT 1'

  const result = await pool.query(sql, params)
  return result.rows[0]?.id ?? null
}

const KO = {
  kia: '\uAE30\uC544',
  hyundai: '\uD604\uB300',
  genesis: '\uC81C\uB124\uC2DC\uC2A4',
  chevrolet: '\uC250\uBCF4\uB808',
  renault: '\uB974\uB178',
  samsung: '\uC0BC\uC131',
  ssangyong: '\uC30D\uC6A9',
  kgMobility: '\uBAA8\uBE4C\uB9AC\uD2F0',
  diesel: '\uB514\uC824',
  gasoline: '\uAC00\uC194\uB9B0',
  gasolineAlt: '\uD718\uBC1C\uC720',
  hybrid: '\uD558\uC774\uBE0C\uB9AC\uB4DC',
  electric: '\uC804\uAE30',
  lpg: '\uC5D8\uD53C\uC9C0',
  fwd: '\uC804\uB95C',
  rwd: '\uD6C4\uB95C',
  awd4wd: '\uC0AC\uB95C',
  sedan: '\uC138\uB2E8',
  hatchback: '\uD574\uCE58\uBC31',
  wagon: '\uC65C\uAC74',
  minivan: '\uBBF8\uB2C8\uBC34',
  van: '\uBC34',
  coupe: '\uCFE0\uD398',
  truck: '\uD2B8\uB7ED',
  cargo: '\uD654\uBB3C',
  crossover: '\uD06C\uB85C\uC2A4\uC624\uBC84',
  black: '\uAC80\uC815',
  blackAlt: '\uD751\uC0C9',
  white: '\uD770\uC0C9',
  whiteAlt: '\uBC31\uC0C9',
  silver: '\uC740\uC0C9',
  gray: '\uD68C\uC0C9',
  grayAlt: '\uC950\uC0C9',
  blue: '\uCCAD\uC0C9',
  blueAlt: '\uD30C\uB791',
  red: '\uD64D\uC0C9',
  redAlt: '\uBE68\uAC15',
  green: '\uB179\uC0C9',
  greenAlt: '\uCD08\uB85D',
  brown: '\uAC08\uC0C9',
  beige: '\uBCA0\uC774\uC9C0',
  orange: '\uC8FC\uD669',
  yellow: '\uB178\uB791',
  purple: '\uBCF4\uB77C',
}

function uniqPatterns(patterns) {
  return [...new Set(patterns.filter(Boolean))]
}

function rawPattern(value) {
  const term = String(value || '').trim()
  if (!term) return []
  return [`%${term}%`]
}

function parseListFilter(value) {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => String(item || '').split(','))
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function brandPatterns(value) {
  const low = String(value || '').toLowerCase().trim()
  if (!low) return []

  const knownPatterns = getKnownBrandSqlPatterns(value)
  if (knownPatterns.length) return knownPatterns
  if (low.includes('chevrolet')) return ['%chevrolet%', `%${KO.chevrolet}%`]
  if (low.includes('renault')) return ['%renault%', `%${KO.renault}%`, `%${KO.samsung}%`]
  if (low.includes('ssang') || low.includes('kg mobility') || low.includes('kgmobilriti')) {
    return ['%ssangyong%', '%kg mobility%', '%kgmobilriti%', `%${KO.ssangyong}%`, `%${KO.kgMobility}%`]
  }

  return rawPattern(value)
}

function fuelPatterns(value) {
  const low = String(value || '').toLowerCase().trim()
  if (!low) return []

  if (low.includes('дизел') || low.includes('diesel')) return ['%дизел%', '%diesel%', `%${KO.diesel}%`]
  if (low.includes('электро') || low.includes('electric')) return ['%электро%', '%electric%', `%${KO.electric}%`]
  if (low.includes('газ') || low.includes('lpg')) return ['%газ%', '%lpg%', `%${KO.lpg}%`]
  if (low.includes('гибрид') || low.includes('hybrid')) return ['%гибрид%', '%hybrid%', `%${KO.hybrid}%`]
  if (low.includes('бенз') || low.includes('gasoline')) return ['%бенз%', '%gasoline%', `%${KO.gasoline}%`, `%${KO.gasolineAlt}%`]

  return rawPattern(value)
}

function drivePatterns(value) {
  const low = String(value || '').toLowerCase().trim()
  if (!low) return []

  if (low.includes('2wd') || low.includes('fwd') || low.includes('перед')) return ['%2wd%', '%fwd%', '%перед%', `%${KO.fwd}%`]
  if (low.includes('awd')) return ['%awd%', '%полный (awd)%']
  if (low.includes('4wd') || low.includes('полный')) return ['%4wd%', '%полный (4wd)%', `%${KO.awd4wd}%`]
  if (low.includes('rwd') || low.includes('задн')) return ['%rwd%', '%задн%', `%${KO.rwd}%`]

  return rawPattern(value)
}

function bodyPatterns(value) {
  const raw = String(value || '').trim()
  const low = raw.toLowerCase()
  if (!low) return []

  const normalized = raw.replace(/\s+/g, ' ').trim()
  if (normalized.toLowerCase() === BODY_TYPE_LABELS.businessSedan.toLowerCase() || low.includes('бизнес')) {
    return [BODY_TYPE_LABELS.businessSedan]
  }
  if (normalized.toLowerCase() === BODY_TYPE_LABELS.executiveSedan.toLowerCase() || low.includes('представитель')) {
    return [BODY_TYPE_LABELS.executiveSedan]
  }

  if (low.includes('кроссов') || low.includes('внедорож') || low.includes('suv')) {
    return ['%suv%', '%внедорож%', '%кроссов%', `%${KO.crossover}%`, '%rv%']
  }
  if (low.includes('седан') || low.includes('sedan')) return ['%sedan%', '%седан%', `%${KO.sedan}%`]
  if (low.includes('кабриолет') || low.includes('cabrio') || low.includes('cabriolet') || low.includes('convertible')) {
    return ['%кабриолет%', '%cabrio%', '%cabriolet%', '%convertible%', '%컨버터블%']
  }
  if (low.includes('хэтч') || low.includes('hatch')) return ['%hatch%', '%хэтч%', `%${KO.hatchback}%`]
  if (low.includes('универсал') || low.includes('wagon')) return ['%wagon%', '%универсал%', `%${KO.wagon}%`]
  if (low.includes('микровэн') || low.includes('microvan')) return ['%microvan%', '%микровэн%', '%van%', '%minivan%', '%минивэн%', `%${KO.minivan}%`, `%${KO.van}%`]
  if (low.includes('минивэн') || low.includes('van')) return ['%van%', '%minivan%', '%минивэн%', '%microvan%', '%микровэн%', `%${KO.minivan}%`, `%${KO.van}%`]
  if (low.includes('купе') || low.includes('спорт') || low.includes('coupe')) return ['%coupe%', '%купе%', '%спорт%', `%${KO.coupe}%`]
  if (low.includes('груз') || low.includes('truck')) return ['%truck%', '%груз%', `%${KO.truck}%`, `%${KO.cargo}%`]

  return rawPattern(value)
}

function colorPatterns(value) {
  const low = String(value || '').toLowerCase().trim()
  const compact = low.replace(/[\s_-]/g, '')
  if (!low) return []

  if (low.includes('черн') || low.includes('black') || /^(geomeunsaek|geomjeongsaek|heugsaek)$/.test(compact)) {
    return ['%черн%', '%black%', `%${KO.black}%`, `%${KO.blackAlt}%`]
  }
  if (low.includes('бел') || low.includes('white') || /^(baegsaek|huinsaek)$/.test(compact)) {
    return ['%бел%', '%white%', `%${KO.white}%`, `%${KO.whiteAlt}%`]
  }
  if (low.includes('сереб') || low.includes('silver') || /^(eunsaek)$/.test(compact)) {
    return ['%сереб%', '%silver%', `%${KO.silver}%`]
  }
  if (low.includes('сер') || low.includes('gray') || low.includes('grey') || /^(hoesaek|jwisaek)$/.test(compact)) {
    return ['%сер%', '%gray%', '%grey%', `%${KO.gray}%`, `%${KO.grayAlt}%`, '%jwiseak%', '%hoesaek%']
  }
  if (low.includes('син') || low.includes('blue') || /^(cheongsaek|parangsaek)$/.test(compact)) {
    return ['%син%', '%blue%', `%${KO.blue}%`, `%${KO.blueAlt}%`, '%cheongsaek%', '%parangsaek%']
  }
  if (low.includes('крас') || low.includes('red') || /^(ppalgangsaek|hongsaek)$/.test(compact)) {
    return ['%крас%', '%red%', `%${KO.red}%`, `%${KO.redAlt}%`]
  }
  if (low.includes('зел') || low.includes('green') || /^(noksaek|choroksaek)$/.test(compact)) {
    return ['%зел%', '%green%', `%${KO.green}%`, `%${KO.greenAlt}%`]
  }
  if (low.includes('корич') || low.includes('brown') || /^(galsaek)$/.test(compact)) {
    return ['%корич%', '%brown%', `%${KO.brown}%`]
  }
  if (low.includes('беж') || low.includes('beige') || /^(beijisaek)$/.test(compact)) {
    return ['%беж%', '%beige%', `%${KO.beige}%`]
  }
  if (low.includes('оранж') || low.includes('orange') || /^(juhwangsaek)$/.test(compact)) {
    return ['%оранж%', '%orange%', `%${KO.orange}%`]
  }
  if (low.includes('желт') || low.includes('yellow') || /^(norangsaek)$/.test(compact)) {
    return ['%желт%', '%yellow%', `%${KO.yellow}%`]
  }
  if (low.includes('фиолет') || low.includes('purple') || low.includes('violet') || /^(borasaek)$/.test(compact)) {
    return ['%фиолет%', '%purple%', '%violet%', `%${KO.purple}%`]
  }

  return rawPattern(value)
}

function normalizeOriginFilterValue(value) {
  const low = String(value || '').toLowerCase().trim()
  if (!low) return ''
  if (low.includes('корей') || low === 'korean' || low === 'domestic') return 'korean'
  if (low.includes('импорт') || low === 'imported' || low === 'foreign') return 'imported'
  return ''
}

function buildOriginScopeSql(alias, parameterIndex) {
  return `(\n    COALESCE(${alias}.name, '') ILIKE ANY($${parameterIndex}::text[])\n    OR COALESCE(${alias}.model, '') ILIKE ANY($${parameterIndex}::text[])\n    OR COALESCE(${alias}.trim_level, '') ILIKE ANY($${parameterIndex}::text[])\n    OR EXISTS (SELECT 1 FROM UNNEST(${alias}.tags) AS t WHERE t ILIKE ANY($${parameterIndex}::text[]))\n  )`
}

const SEARCH_ALIASES = [
  ['kia-alias', ['kia', 'gia', KO.kia]],
  ['hyundai-alias', ['hyundai', 'hyeondae', KO.hyundai]],
  ['genesis-alias', ['genesis', 'jenesiseu', KO.genesis]],
  ['kia', ['kia', 'киа', KO.kia]],
  ['hyundai', ['hyundai', 'хендэ', 'хундай', KO.hyundai]],
  ['genesis', ['genesis', 'дженезис', KO.genesis]],
  ['chevrolet', ['chevrolet', 'chevy', 'шевроле', KO.chevrolet]],
  ['renault', ['renault', 'reno', 'рено', KO.renault, KO.samsung]],
  ['samsung', ['samsung', 'самсунг', KO.samsung]],
  ['ssangyong', ['ssangyong', 'сангйонг', 'ссангйонг', KO.ssangyong, 'kg mobility', 'kgmobilriti', KO.kgMobility]],
  ['kg mobility', ['kg mobility', 'kgmobilriti', 'kg', KO.kgMobility, KO.ssangyong]],
  ['rexton', ['rexton', 'рекстон', 'rekseuteon', '렉스턴']],
  ['sports', ['sports', 'спорт', 'seupocheu', '스포츠']],
  ['sorento', ['sorento', 'соренто', '쏘렌토']],
  ['grandeur', ['grandeur', 'azera', 'granger', '그랜저', 'geuraenjeo']],
  ['sonata', ['sonata', 'соната', '쏘나타', 'ssonata']],
  ['casper', ['casper', 'каспер', '캐스퍼', 'kaeseupeo']],
  ['mohave', ['mohave', 'мохаве', '모하비', 'mohabi']],
  ['carnival', ['carnival', 'карнивал', '카니발']],
  ['staria', ['staria', 'стария', '스타리아']],
  ['tucson', ['tucson', 'туксон', '투싼']],
]

function normalizeSearchValue(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[._-]+/g, ' ')
    .replace(/[#:/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function compactSearchValue(value) {
  return normalizeSearchValue(value).replace(/\s+/g, '')
}

function extractSearchId(value) {
  const matched = String(value || '').trim().match(/^(?:#\s*|id[\s:#-]*)?(\d+)$/i)
  if (!matched) return null

  const parsed = Number.parseInt(matched[1], 10)
  return Number.isFinite(parsed) ? parsed : null
}

function tokenizeSearchValue(value) {
  return normalizeSearchValue(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
}

function searchPatterns(value) {
  const raw = String(value || '').trim()
  const normalized = normalizeSearchValue(value)
  if (!normalized) return []

  const variants = new Set([raw, normalized, normalized.replace(/\s+/g, '')])
  const tokens = tokenizeSearchValue(value)
  const rawLiters = [...raw.matchAll(/\b(\d(?:\.\d)?)\b/g)]

  for (const match of rawLiters) {
    const liters = Number(match[1])
    if (liters >= 0.8 && liters <= 8.0) {
      variants.add(match[1])
      variants.add(String(Math.round(liters * 1000)))
    }
  }

  for (const token of tokens) {
    variants.add(token)
    if (/^\d(?:\.\d)?$/.test(token)) {
      variants.add(String(Math.round(Number(token) * 1000)))
    }
    for (const [, aliases] of SEARCH_ALIASES) {
      if (aliases.some((alias) => normalizeSearchValue(alias).includes(token) || token.includes(normalizeSearchValue(alias)))) {
        aliases.forEach((alias) => variants.add(alias))
      }
    }
  }

  return [...variants]
    .map((variant) => String(variant || '').trim())
    .filter(Boolean)
    .map((variant) => `%${variant}%`)
}

function decorateCarRow(row, exchangeSnapshot, pricingSettings) {
  const normalizedText = normalizeCarTextFields(row)
  const normalizedName = normalizedText.name ?? row.name
  const normalizedModel = normalizedText.model ?? row.model
  const normalizedDriveType = normalizedText.drive_type ?? row.drive_type
  const normalizedBodyType = normalizedText.body_type ?? row.body_type
  const normalizedFuelType = normalizedText.fuel_type ?? row.fuel_type
  const normalizedBodyColor = normalizedText.body_color ?? normalizeColorName(row.body_color || '')
  const normalizedTags = normalizedText.tags ?? row.tags ?? []
  const sanitizedVin = sanitizeVin(row.vin)
  const fees = resolveVehicleFees(row, pricingSettings)
  const pricing = computePricing({
    priceKrw: row.price_krw,
    commission: fees.commission,
    delivery: fees.delivery,
    loading: fees.loading,
    unloading: fees.unloading,
    storage: fees.storage,
  }, exchangeSnapshot)

  return {
    ...row,
    detail_flags: normalizeDetailFlags(row.detail_flags),
    inspection_formats: normalizeInspectionFormats(row.inspection_formats),
    listing_type: resolveRequestedListingType(row.listing_type),
    name: normalizedName,
    model: normalizedModel,
    drive_type: normalizedDriveType,
    body_type: normalizedBodyType,
    fuel_type: normalizedFuelType,
    vehicle_class: resolveVehicleClass(
      row.vehicle_class || '',
      normalizedBodyType || '',
      normalizedName || '',
      normalizedModel || '',
      row.trim_level || '',
      row.name || '',
      row.model || '',
    ),
    body_color: normalizedBodyColor,
    interior_color: normalizedText.interior_color || normalizeInteriorColorName(row.interior_color || '', normalizedBodyColor || '', { allowBodyDuplicate: true }),
    option_features: normalizeOptionFeatures(row.option_features),
    trim_level: normalizedText.trim_level || normalizeTrimLevel(row.trim_level || '') || extractTrimLevelFromTitle(normalizedName || '', normalizedModel || ''),
    key_info: String(row.key_info || '').trim(),
    location: normalizedText.location || normalizeLocationName(row.location || '') || row.location || '',
    location_short: extractShortLocation(normalizedText.location ?? row.location ?? ''),
    tags: normalizedTags,
    pricing_locked: fees.pricing_locked,
    delivery_profile_code: fees.delivery_profile_code,
    delivery_profile_label: fees.delivery_profile_label,
    delivery_profile_description: fees.delivery_profile_description,
    commission: fees.commission,
    delivery: fees.delivery,
    loading: fees.loading,
    unloading: fees.unloading,
    storage: fees.storage,
    vin: sanitizedVin || null,
    price_usd: pricing.price_usd,
    vat_refund: pricing.vat_refund,
    total: pricing.total,
    exchange_rate_current: pricing.exchange_rate_current,
    exchange_rate_site: pricing.exchange_rate_site,
    exchange_rate_offset: pricing.exchange_rate_offset,
    vat_rate: pricing.vat_rate,
  }
}

router.get('/', async (req, res) => {
  try {
    await ensureCarListingMetadataColumns()
    const {
      brand, q, minPrice, maxPrice,
      minYear, maxYear,
      minMileage, maxMileage,
      fuel, drive, body, color, interiorColor, origin,
      listingType,
      adminSearch,
      sort = 'newest',
      page = 1, limit = 20,
    } = req.query
    const exchangeSnapshot = await getExchangeRateSnapshot()
    const pricingSettings = await getPricingSettings()
    const siteRateSql = Number((exchangeSnapshot.siteRate || 1).toFixed(2))
    const priceUsdSql = `ROUND((COALESCE(c.price_krw, 0)::numeric / ${siteRateSql})::numeric, 0)`

    const conditions = []
    const params = []
    let p = 1

    const qText = String(q || '').trim()
    const requestedListingType = resolveRequestedListingType(listingType, { allowAll: true })
    const isAdminSearch = ['1', 'true', 'yes'].includes(String(adminSearch || '').toLowerCase())
    const brandValues = parseListFilter(brand)
    const fuelValues = parseListFilter(fuel)
    const driveValues = parseListFilter(drive)
    const bodyValues = parseListFilter(body)
    const colorValues = parseListFilter(color)
    const interiorColorValues = parseListFilter(interiorColor)
    const originValues = parseListFilter(origin)
    const yearSql = `COALESCE(NULLIF(SUBSTRING(c.year FROM 1 FOR 4), ''), '0')::int`
    const requestedMinYear = Number.parseInt(String(minYear || ''), 10)
    const effectiveMinYear = Number.isFinite(requestedMinYear)
      ? Math.max(requestedMinYear, MIN_CAR_YEAR)
      : MIN_CAR_YEAR

    if (qText) {
      const patterns = uniqPatterns(searchPatterns(qText))
      const tokens = tokenizeSearchValue(qText)

      conditions.push(`(
        c.name ILIKE ANY($${p}::text[])
        OR c.model ILIKE ANY($${p}::text[])
        OR REPLACE(COALESCE(c.name, ''), ' ', '') ILIKE ANY($${p}::text[])
        OR REPLACE(COALESCE(c.model, ''), ' ', '') ILIKE ANY($${p}::text[])
        ${isAdminSearch ? `OR COALESCE(c.id::text, '') ILIKE ANY($${p}::text[])` : ''}
        OR COALESCE(c.vin::text, '') ILIKE ANY($${p}::text[])
        OR REPLACE(COALESCE(c.vin::text, ''), ' ', '') ILIKE ANY($${p}::text[])
        OR COALESCE(c.encar_id::text, '') ILIKE ANY($${p}::text[])
        OR REPLACE(COALESCE(c.encar_id::text, ''), ' ', '') ILIKE ANY($${p}::text[])
        OR COALESCE(c.body_type, '') ILIKE ANY($${p}::text[])
        OR COALESCE(c.vehicle_class, '') ILIKE ANY($${p}::text[])
        OR COALESCE(c.drive_type, '') ILIKE ANY($${p}::text[])
        OR COALESCE(c.fuel_type, '') ILIKE ANY($${p}::text[])
        OR COALESCE(c.transmission, '') ILIKE ANY($${p}::text[])
        OR COALESCE(c.body_color, '') ILIKE ANY($${p}::text[])
        OR COALESCE(c.interior_color, '') ILIKE ANY($${p}::text[])
        OR COALESCE(c.location, '') ILIKE ANY($${p}::text[])
        OR COALESCE(c.trim_level, '') ILIKE ANY($${p}::text[])
        OR COALESCE(c.key_info, '') ILIKE ANY($${p}::text[])
        OR COALESCE(c.year, '') ILIKE ANY($${p}::text[])
        OR COALESCE(c.displacement::text, '') ILIKE ANY($${p}::text[])
        OR EXISTS (SELECT 1 FROM UNNEST(c.tags) AS t WHERE t ILIKE ANY($${p}::text[]))
      )`)
      params.push(patterns)
      p++

      for (const token of tokens) {
        conditions.push(`(
          c.name ILIKE $${p}
          OR c.model ILIKE $${p}
          OR REPLACE(COALESCE(c.name, ''), ' ', '') ILIKE $${p}
          OR REPLACE(COALESCE(c.model, ''), ' ', '') ILIKE $${p}
          ${isAdminSearch ? `OR COALESCE(c.id::text, '') ILIKE $${p}` : ''}
          OR COALESCE(c.vin::text, '') ILIKE $${p}
          OR REPLACE(COALESCE(c.vin::text, ''), ' ', '') ILIKE $${p}
          OR COALESCE(c.encar_id::text, '') ILIKE $${p}
          OR REPLACE(COALESCE(c.encar_id::text, ''), ' ', '') ILIKE $${p}
          OR COALESCE(c.body_type, '') ILIKE $${p}
          OR COALESCE(c.vehicle_class, '') ILIKE $${p}
          OR COALESCE(c.drive_type, '') ILIKE $${p}
          OR COALESCE(c.fuel_type, '') ILIKE $${p}
          OR COALESCE(c.transmission, '') ILIKE $${p}
          OR COALESCE(c.body_color, '') ILIKE $${p}
          OR COALESCE(c.interior_color, '') ILIKE $${p}
          OR COALESCE(c.location, '') ILIKE $${p}
          OR COALESCE(c.trim_level, '') ILIKE $${p}
          OR COALESCE(c.key_info, '') ILIKE $${p}
          OR COALESCE(c.year, '') ILIKE $${p}
          OR COALESCE(c.displacement::text, '') ILIKE $${p}
          OR EXISTS (SELECT 1 FROM UNNEST(c.tags) AS t WHERE t ILIKE $${p})
        )`)
        params.push(`%${token}%`)
        p++
      }
    }

    conditions.push(`NOT ${buildBlockedCatalogPriceSql('c')}`)
    conditions.push(`NOT ${buildBlockedGenericVehicleSql('c')}`)

    if (requestedListingType !== 'all') {
      conditions.push(`c.listing_type = $${p++}`)
      params.push(requestedListingType)
    }

    if (brandValues.length) {
      const patterns = uniqPatterns(brandValues.flatMap(brandPatterns))
      conditions.push(`(c.name ILIKE ANY($${p}::text[]) OR c.model ILIKE ANY($${p}::text[]) OR COALESCE(c.trim_level, '') ILIKE ANY($${p}::text[]))`)
      params.push(patterns)
      p++
    }
    if (originValues.length) {
      const normalizedOrigins = new Set(originValues.map(normalizeOriginFilterValue).filter(Boolean))
      const wantsKorean = normalizedOrigins.has('korean')
      const wantsImported = normalizedOrigins.has('imported')

      if (wantsKorean !== wantsImported) {
        const originScopeSql = buildOriginScopeSql('c', p)
        if (wantsKorean) {
          conditions.push(originScopeSql)
        } else {
          conditions.push(`NOT ${originScopeSql}`)
        }
        params.push(KOREAN_VEHICLE_SQL_PATTERNS)
        p++
      }
    }
    if (minPrice) { conditions.push(`${priceUsdSql} >= $${p++}`); params.push(Number(minPrice)) }
    if (maxPrice) { conditions.push(`${priceUsdSql} <= $${p++}`); params.push(Number(maxPrice)) }
    conditions.push(`${yearSql} >= $${p++}`)
    params.push(effectiveMinYear)
    if (maxYear) { conditions.push(`${yearSql} <= $${p++}`); params.push(Number(maxYear)) }
    if (minMileage) { conditions.push(`c.mileage >= $${p++}`); params.push(Number(minMileage)) }
    if (maxMileage) { conditions.push(`c.mileage <= $${p++}`); params.push(Number(maxMileage)) }

    if (fuelValues.length) {
      const patterns = uniqPatterns(fuelValues.flatMap(fuelPatterns))
      conditions.push(`(
        COALESCE(c.fuel_type, '') ILIKE ANY($${p}::text[])
        OR EXISTS (SELECT 1 FROM UNNEST(c.tags) AS t WHERE t ILIKE ANY($${p}::text[]))
      )`)
      params.push(patterns)
      p++
    }

    if (driveValues.length) {
      const patterns = uniqPatterns(driveValues.flatMap(drivePatterns))
      conditions.push(`(
        COALESCE(c.drive_type, '') ILIKE ANY($${p}::text[])
        OR COALESCE(c.name, '') ILIKE ANY($${p}::text[])
        OR COALESCE(c.model, '') ILIKE ANY($${p}::text[])
        OR EXISTS (SELECT 1 FROM UNNEST(c.tags) AS t WHERE t ILIKE ANY($${p}::text[]))
      )`)
      params.push(patterns)
      p++
    }

    if (bodyValues.length) {
      const patterns = uniqPatterns(bodyValues.flatMap(bodyPatterns))
      conditions.push(`(
        COALESCE(c.body_type, '') ILIKE ANY($${p}::text[])
        OR EXISTS (SELECT 1 FROM UNNEST(c.tags) AS t WHERE t ILIKE ANY($${p}::text[]))
        OR COALESCE(c.model, '') ILIKE ANY($${p}::text[])
        OR COALESCE(c.name, '') ILIKE ANY($${p}::text[])
      )`)
      params.push(patterns)
      p++
    }

    if (colorValues.length) {
      const patterns = uniqPatterns(colorValues.flatMap(colorPatterns))
      conditions.push(`COALESCE(c.body_color, '') ILIKE ANY($${p}::text[])`)
      params.push(patterns)
      p++
    }

    if (interiorColorValues.length) {
      const patterns = uniqPatterns(interiorColorValues.flatMap(colorPatterns))
      conditions.push(`COALESCE(c.interior_color, '') ILIKE ANY($${p}::text[])`)
      params.push(patterns)
      p++
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const filterParams = [...params]

    const sortMap = {
      newest: 'c.created_at DESC',
      oldest: 'c.created_at ASC',
      price_asc: `${priceUsdSql} ASC`,
      price_desc: `${priceUsdSql} DESC`,
      mileage: 'c.mileage ASC',
      mileage_desc: 'c.mileage DESC',
      year_desc: 'c.year DESC',
      year_asc: 'c.year ASC',
    }
    const orderBy = sortMap[sort] || 'c.created_at DESC'
    let orderBySql = orderBy

    if (qText) {
      const exactSearchId = isAdminSearch ? extractSearchId(qText) : null
      const exactLower = qText.toLowerCase()
      const exactCompact = compactSearchValue(qText) || exactLower
      const prefix = `${qText}%`
      const contains = `%${qText}%`
      const ranking = []
      let rank = 0

      if (exactSearchId !== null) {
        ranking.push(`WHEN c.id = $${p} THEN ${rank++}`)
        params.push(exactSearchId)
        p++
      }

      ranking.push(`WHEN LOWER(COALESCE(c.encar_id::text, '')) = $${p} THEN ${rank++}`)
      params.push(exactCompact)
      p++

      ranking.push(`WHEN LOWER(COALESCE(c.vin::text, '')) = $${p} THEN ${rank++}`)
      params.push(exactCompact)
      p++

      ranking.push(`WHEN c.name ILIKE $${p} THEN ${rank++}`)
      params.push(prefix)
      p++

      ranking.push(`WHEN c.model ILIKE $${p} THEN ${rank++}`)
      params.push(prefix)
      p++

      ranking.push(`WHEN c.name ILIKE $${p} THEN ${rank++}`)
      params.push(contains)
      p++

      ranking.push(`WHEN c.model ILIKE $${p} THEN ${rank++}`)
      params.push(contains)
      p++

      ranking.push(`ELSE ${rank}`)
      orderBySql = `CASE
        ${ranking.join('\n        ')}
      END, ${orderBy}`
    }

    const offset = (Number(page) - 1) * Number(limit)

    const countResult = await pool.query(`SELECT COUNT(*) FROM cars c ${where}`, filterParams)
    const total = parseInt(countResult.rows[0].count, 10)

    const carsResult = await pool.query(
      `SELECT c.*,
        COALESCE(
          json_agg(ci ORDER BY ci.position ASC) FILTER (WHERE ci.id IS NOT NULL),
          '[]'
        ) AS images
       FROM cars c
       LEFT JOIN car_images ci ON ci.car_id = c.id
       ${where}
       GROUP BY c.id
       ORDER BY ${orderBySql}
       LIMIT $${p++} OFFSET $${p++}`,
      [...params, Number(limit), offset]
    )

    return res.json({
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / Number(limit)),
      exchange_rate_current: exchangeSnapshot.currentRate,
      exchange_rate_site: exchangeSnapshot.siteRate,
      exchange_rate_offset: exchangeSnapshot.offset,
      vat_rate: VAT_REFUND_RATE,
      cars: carsResult.rows.map((row) => decorateCarRow(row, exchangeSnapshot, pricingSettings)),
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Ошибка сервера' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    await ensureCarListingMetadataColumns()
    const requestedListingType = resolveRequestedListingType(req.query?.listingType, { allowAll: true })
    const exchangeSnapshot = await getExchangeRateSnapshot()
    const pricingSettings = await getPricingSettings()
    const detailParams = [req.params.id]
    let detailListingSql = ''

    if (requestedListingType !== 'all') {
      detailParams.push(requestedListingType)
      detailListingSql = ` AND c.listing_type = $${detailParams.length}`
    }

    const result = await pool.query(
      `SELECT c.*,
        COALESCE(
          json_agg(ci ORDER BY ci.position ASC) FILTER (WHERE ci.id IS NOT NULL),
          '[]'
        ) AS images
       FROM cars c
       LEFT JOIN car_images ci ON ci.car_id = c.id
       WHERE c.id = $1
         ${detailListingSql}
         AND NOT ${buildBlockedCatalogPriceSql('c')}
         AND NOT ${buildBlockedGenericVehicleSql('c')}
       GROUP BY c.id`,
      detailParams
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Не найдено' })
    return res.json(decorateCarRow(result.rows[0], exchangeSnapshot, pricingSettings))
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Ошибка сервера' })
  }
})

router.post('/', adminMutationProtection, async (req, res) => {
  try {
    await ensureCarListingMetadataColumns()
    const normalizedYear = normalizeCatalogYear(req.body?.year)
    if (!normalizedYear) {
      return res.status(400).json({ error: `Год выпуска должен быть не раньше ${MIN_CAR_YEAR}` })
    }

    const {
      name, model, mileage,
      listing_type,
      fuel_type, transmission, drive_type, body_type, vehicle_class, trim_level, key_info, displacement,
      body_color, body_color_dots,
      interior_color, interior_color_dots,
      warranty_company, warranty_body_months, warranty_body_km, warranty_transmission_months, warranty_transmission_km,
      option_features,
      location, vin,
      price_krw, price_usd,
      commission, delivery, delivery_profile_code, loading, unloading, storage, pricing_locked, vat_refund, total,
      encar_url, encar_id, can_negotiate, tags, detail_flags, inspection_formats,
    } = req.body
    const normalizedVin = sanitizeVin(vin)
    const normalizedListingType = resolveRequestedListingType(listing_type)
    const duplicateVinId = await findDuplicateVinId(normalizedVin)
    if (duplicateVinId) {
      return res.status(409).json({ error: `VIN уже привязан к автомобилю #${duplicateVinId}` })
    }

    const priceBlockReason = getPayloadPriceBlockReason({ price_krw, price_usd })
    if (priceBlockReason) {
      return res.status(400).json({ error: `Автомобиль не будет сохранён: ${priceBlockReason}` })
    }

    const vehicleBlockReason = getPayloadVehicleBlockReason({ name, model })
    if (vehicleBlockReason) {
      return res.status(400).json({ error: `Автомобиль не будет сохранён: ${vehicleBlockReason}` })
    }

    const normalizedText = normalizeCarTextFields({
      name,
      model,
      fuel_type,
      transmission,
      trim_level,
      drive_type,
      body_type,
      vehicle_class,
      body_color,
      interior_color,
      location,
      tags,
    })

    const result = await pool.query(
      `INSERT INTO cars
        (listing_type, name, model, year, mileage,
         fuel_type, transmission, drive_type, body_type, vehicle_class, trim_level, key_info, displacement,
         body_color, body_color_dots, interior_color, interior_color_dots,
         warranty_company, warranty_body_months, warranty_body_km, warranty_transmission_months, warranty_transmission_km, option_features,
         location, vin, price_krw, price_usd,
         commission, delivery, delivery_profile_code, loading, unloading, storage, pricing_locked, vat_refund, total,
         encar_url, encar_id, can_negotiate, tags, detail_flags, inspection_formats)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42)
       RETURNING *`,
      [
        normalizedListingType,
        normalizedText.name ?? name, normalizedText.model ?? model, normalizedYear, mileage || 0,
        normalizedText.fuel_type ?? fuel_type, transmission, normalizedText.drive_type ?? drive_type, normalizedText.body_type ?? body_type,
        normalizedText.vehicle_class ?? vehicle_class ?? null, normalizedText.trim_level ?? trim_level, key_info, displacement || 0,
        normalizedText.body_color ?? body_color, body_color_dots || [], normalizedText.interior_color ?? interior_color, interior_color_dots || [],
        warranty_company || null, warranty_body_months ?? null, warranty_body_km ?? null, warranty_transmission_months ?? null, warranty_transmission_km ?? null,
        normalizeOptionFeatures(option_features), normalizedText.location || location, normalizedVin || null, price_krw || 0, price_usd || 0,
        commission ?? DEFAULT_FEES.commission, delivery ?? 0, delivery_profile_code || null, loading ?? DEFAULT_FEES.loading,
        unloading ?? DEFAULT_FEES.unloading, storage ?? DEFAULT_FEES.storage, pricing_locked || false, vat_refund || 0, total || 0,
        encar_url, encar_id, can_negotiate || false, normalizedText.tags ?? tags ?? [], buildStoredDetailFlags(detail_flags), normalizeInspectionFormats(inspection_formats),
      ]
    )
    const exchangeSnapshot = await getExchangeRateSnapshot()
    const pricingSettings = await getPricingSettings()
    return res.status(201).json(decorateCarRow(result.rows[0], exchangeSnapshot, pricingSettings))
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Ошибка сервера' })
  }
})

router.put('/:id', async (req, res) => {
  try {
    await ensureCarListingMetadataColumns()
    const payload = { ...(req.body || {}) }
    if (payload.listing_type !== undefined) {
      payload.listing_type = resolveRequestedListingType(payload.listing_type)
    }
    if (payload.year !== undefined) {
      const normalizedYear = normalizeCatalogYear(payload.year)
      if (!normalizedYear) {
        return res.status(400).json({ error: `Год выпуска должен быть не раньше ${MIN_CAR_YEAR}` })
      }
      payload.year = normalizedYear
    }
    if (payload.detail_flags !== undefined) {
      payload.detail_flags = buildStoredDetailFlags(payload.detail_flags)
    }
    if (payload.inspection_formats !== undefined) {
      payload.inspection_formats = normalizeInspectionFormats(payload.inspection_formats)
    }

    if (payload.vin !== undefined) {
      payload.vin = sanitizeVin(payload.vin) || null
      const duplicateVinId = await findDuplicateVinId(payload.vin, req.params.id)
      if (duplicateVinId) {
        return res.status(409).json({ error: `VIN уже привязан к автомобилю #${duplicateVinId}` })
      }
    }

    const priceBlockReason = getPayloadPriceBlockReason(payload)
    if (priceBlockReason) {
      return res.status(400).json({ error: `Автомобиль не будет обновлён: ${priceBlockReason}` })
    }

    const vehicleBlockReason = getPayloadVehicleBlockReason(payload)
    if (vehicleBlockReason) {
      return res.status(400).json({ error: `Автомобиль не будет обновлён: ${vehicleBlockReason}` })
    }

    const fields = [
      'listing_type', 'name', 'model', 'year', 'mileage',
      'fuel_type', 'transmission', 'drive_type', 'body_type', 'vehicle_class', 'trim_level', 'key_info', 'displacement',
      'body_color', 'body_color_dots', 'interior_color', 'interior_color_dots',
      'warranty_company', 'warranty_body_months', 'warranty_body_km', 'warranty_transmission_months', 'warranty_transmission_km',
      'option_features',
      'location', 'vin', 'price_krw', 'price_usd',
      'commission', 'delivery', 'delivery_profile_code', 'loading', 'unloading', 'storage', 'pricing_locked', 'vat_refund', 'total',
      'encar_url', 'encar_id', 'can_negotiate', 'tags', 'detail_flags', 'inspection_formats',
    ]

    const updates = []
    const params = []
    let p = 1
    const images = payload.images
    const normalizedText = normalizeCarTextFields(payload)

    for (const field of fields) {
      if (payload[field] !== undefined) {
        updates.push(`${field} = $${p++}`)
        params.push(normalizedText[field] !== undefined ? normalizedText[field] : payload[field])
      }
    }

    if (
      payload.tags === undefined &&
      normalizedText.tags !== undefined &&
      (payload.drive_type !== undefined || payload.transmission !== undefined || payload.fuel_type !== undefined)
    ) {
      updates.push(`tags = $${p++}`)
      params.push(normalizedText.tags)
    }

    if (!updates.length && images === undefined) return res.status(400).json({ error: 'Нет данных для обновления' })

    if (images !== undefined) {
      let exists = false

      if (updates.length) {
        const imageUpdateFields = [...updates, 'updated_at = NOW()']
        const imageUpdateParams = [...params, req.params.id]
        const result = await pool.query(
          `UPDATE cars SET ${imageUpdateFields.join(', ')} WHERE id = $${p} RETURNING id`,
          imageUpdateParams
        )
        exists = Boolean(result.rows.length)
      } else {
        const result = await pool.query('SELECT id FROM cars WHERE id = $1', [req.params.id])
        exists = Boolean(result.rows.length)
      }

      if (!exists) return res.status(404).json({ error: 'Не найдено' })

      const normalizedImages = Array.isArray(images)
        ? images
          .map((item) => {
            if (!item) return ''
            if (typeof item === 'string') return String(item).trim()
            return String(item.url || item.path || item.location || '').trim()
          })
          .filter(Boolean)
        : []

      await pool.query('DELETE FROM car_images WHERE car_id = $1', [req.params.id])

      for (let index = 0; index < normalizedImages.length; index += 1) {
        await pool.query(
          'INSERT INTO car_images (car_id, url, position) VALUES ($1, $2, $3)',
          [req.params.id, normalizedImages[index], index]
        )
      }

      const refreshed = await pool.query(
        `SELECT c.*, COALESCE(json_agg(json_build_object('id', ci.id, 'url', ci.url) ORDER BY ci.position)
                 FILTER (WHERE ci.id IS NOT NULL), '[]') AS images
         FROM cars c
         LEFT JOIN car_images ci ON ci.car_id = c.id
         WHERE c.id = $1
         GROUP BY c.id`,
        [req.params.id]
      )

      const exchangeSnapshot = await getExchangeRateSnapshot()
      const pricingSettings = await getPricingSettings()
      return res.json(decorateCarRow(refreshed.rows[0], exchangeSnapshot, pricingSettings))
    }

    updates.push('updated_at = NOW()')
    params.push(req.params.id)

    const result = await pool.query(
      `UPDATE cars SET ${updates.join(', ')} WHERE id = $${p} RETURNING *`,
      params
    )

    if (!result.rows.length) return res.status(404).json({ error: 'Не найдено' })
    const exchangeSnapshot = await getExchangeRateSnapshot()
    const pricingSettings = await getPricingSettings()
    return res.json(decorateCarRow(result.rows[0], exchangeSnapshot, pricingSettings))
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Ошибка сервера' })
  }
})

router.delete('/:id', adminMutationProtection, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM cars WHERE id=$1 RETURNING id', [req.params.id])
    if (!result.rows.length) return res.status(404).json({ error: 'Не найдено' })
    return res.json({ deleted: result.rows[0].id })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Ошибка сервера' })
  }
})

export default router

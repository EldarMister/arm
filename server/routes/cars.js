import { Router } from 'express'
import pool from '../db.js'
import { DEFAULT_FEES, VAT_REFUND_RATE, computePricing, getExchangeRateSnapshot } from '../lib/exchangeRate.js'
import { getPricingSettings, resolveVehicleFees } from '../lib/pricingSettings.js'
import { getKnownBrandSqlPatterns } from '../../shared/brandAliases.js'
import {
  extractShortLocation,
  extractTrimLevelFromTitle,
  KOREAN_VEHICLE_SQL_PATTERNS,
  normalizeColorName,
  normalizeInteriorColorName,
  normalizeTrimLevel,
} from '../lib/vehicleData.js'
import { normalizeCarTextFields } from '../lib/carRecordNormalization.js'

const router = Router()

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
  const low = String(value || '').toLowerCase().trim()
  if (!low) return []

  if (low.includes('кроссов') || low.includes('внедорож') || low.includes('suv')) {
    return ['%suv%', '%внедорож%', '%кроссов%', `%${KO.crossover}%`, '%rv%']
  }
  if (low.includes('седан') || low.includes('sedan')) return ['%sedan%', '%седан%', `%${KO.sedan}%`]
  if (low.includes('кабриолет') || low.includes('cabrio') || low.includes('cabriolet') || low.includes('convertible')) {
    return ['%кабриолет%', '%cabrio%', '%cabriolet%', '%convertible%', '%컨버터블%']
  }
  if (low.includes('хэтч') || low.includes('hatch')) return ['%hatch%', '%хэтч%', `%${KO.hatchback}%`]
  if (low.includes('универсал') || low.includes('wagon')) return ['%wagon%', '%универсал%', `%${KO.wagon}%`]
  if (low.includes('минивэн') || low.includes('van')) return ['%van%', '%minivan%', '%минивэн%', `%${KO.minivan}%`, `%${KO.van}%`]
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
    .replace(/\s+/g, ' ')
    .trim()
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
  const normalizedBodyColor = normalizedText.body_color ?? normalizeColorName(row.body_color || '')
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
    name: normalizedName,
    model: normalizedModel,
    body_color: normalizedBodyColor,
    interior_color: normalizedText.interior_color ?? normalizeInteriorColorName(row.interior_color || '', normalizedBodyColor || ''),
    trim_level: normalizedText.trim_level || normalizeTrimLevel(row.trim_level || '') || extractTrimLevelFromTitle(normalizedName || '', normalizedModel || ''),
    key_info: String(row.key_info || '').trim(),
    location_short: extractShortLocation(row.location || ''),
    pricing_locked: fees.pricing_locked,
    delivery_profile_code: fees.delivery_profile_code,
    delivery_profile_label: fees.delivery_profile_label,
    delivery_profile_description: fees.delivery_profile_description,
    commission: fees.commission,
    delivery: fees.delivery,
    loading: fees.loading,
    unloading: fees.unloading,
    storage: fees.storage,
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
    const {
      brand, q, minPrice, maxPrice,
      minYear, maxYear,
      minMileage, maxMileage,
      fuel, drive, body, color, interiorColor, origin,
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
    const brandValues = parseListFilter(brand)
    const fuelValues = parseListFilter(fuel)
    const driveValues = parseListFilter(drive)
    const bodyValues = parseListFilter(body)
    const colorValues = parseListFilter(color)
    const interiorColorValues = parseListFilter(interiorColor)
    const originValues = parseListFilter(origin)
    const yearSql = `COALESCE(NULLIF(SUBSTRING(c.year FROM 1 FOR 4), ''), '0')::int`

    if (qText) {
      const patterns = uniqPatterns(searchPatterns(qText))
      const tokens = tokenizeSearchValue(qText)

      conditions.push(`(
        c.name ILIKE ANY($${p}::text[])
        OR c.model ILIKE ANY($${p}::text[])
        OR REPLACE(COALESCE(c.name, ''), ' ', '') ILIKE ANY($${p}::text[])
        OR REPLACE(COALESCE(c.model, ''), ' ', '') ILIKE ANY($${p}::text[])
        OR COALESCE(c.vin::text, '') ILIKE ANY($${p}::text[])
        OR COALESCE(c.encar_id::text, '') ILIKE ANY($${p}::text[])
        OR COALESCE(c.body_type, '') ILIKE ANY($${p}::text[])
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
          OR COALESCE(c.vin::text, '') ILIKE $${p}
          OR COALESCE(c.encar_id::text, '') ILIKE $${p}
          OR COALESCE(c.body_type, '') ILIKE $${p}
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
        if (wantsKorean) {
          conditions.push(`(COALESCE(c.name, '') ILIKE ANY($${p}::text[]) OR COALESCE(c.model, '') ILIKE ANY($${p}::text[]))`)
        } else {
          conditions.push(`NOT (COALESCE(c.name, '') ILIKE ANY($${p}::text[]) OR COALESCE(c.model, '') ILIKE ANY($${p}::text[]))`)
        }
        params.push(KOREAN_VEHICLE_SQL_PATTERNS)
        p++
      }
    }
    if (minPrice) { conditions.push(`${priceUsdSql} >= $${p++}`); params.push(Number(minPrice)) }
    if (maxPrice) { conditions.push(`${priceUsdSql} <= $${p++}`); params.push(Number(maxPrice)) }
    if (minYear) { conditions.push(`${yearSql} >= $${p++}`); params.push(Number(minYear)) }
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
      year_desc: 'c.year DESC',
      year_asc: 'c.year ASC',
    }
    const orderBy = sortMap[sort] || 'c.created_at DESC'
    let orderBySql = orderBy

    if (qText) {
      const exactLower = qText.toLowerCase()
      const prefix = `${qText}%`
      orderBySql = `CASE
        WHEN LOWER(COALESCE(c.encar_id::text, '')) = $${p} THEN 0
        WHEN LOWER(COALESCE(c.vin::text, '')) = $${p} THEN 1
        WHEN c.name ILIKE $${p + 1} THEN 2
        WHEN c.model ILIKE $${p + 1} THEN 3
        WHEN c.name ILIKE $${p + 2} THEN 4
        WHEN c.model ILIKE $${p + 2} THEN 5
        ELSE 6
      END, ${orderBy}`
      params.push(exactLower, prefix, `%${qText}%`)
      p += 3
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
    const exchangeSnapshot = await getExchangeRateSnapshot()
    const pricingSettings = await getPricingSettings()
    const result = await pool.query(
      `SELECT c.*,
        COALESCE(
          json_agg(ci ORDER BY ci.position ASC) FILTER (WHERE ci.id IS NOT NULL),
          '[]'
        ) AS images
       FROM cars c
       LEFT JOIN car_images ci ON ci.car_id = c.id
       WHERE c.id = $1
       GROUP BY c.id`,
      [req.params.id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Не найдено' })
    return res.json(decorateCarRow(result.rows[0], exchangeSnapshot, pricingSettings))
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Ошибка сервера' })
  }
})

router.post('/', async (req, res) => {
  try {
    const {
      name, model, year, mileage,
      fuel_type, transmission, drive_type, body_type, trim_level, key_info, displacement,
      body_color, body_color_dots,
      interior_color, interior_color_dots,
      location, vin,
      price_krw, price_usd,
      commission, delivery, delivery_profile_code, loading, unloading, storage, pricing_locked, vat_refund, total,
      encar_url, encar_id, can_negotiate, tags,
    } = req.body
    const normalizedText = normalizeCarTextFields({ name, model, trim_level, body_color, interior_color })

    const result = await pool.query(
      `INSERT INTO cars
        (name, model, year, mileage,
         fuel_type, transmission, drive_type, body_type, trim_level, key_info, displacement,
         body_color, body_color_dots, interior_color, interior_color_dots,
         location, vin, price_krw, price_usd,
         commission, delivery, delivery_profile_code, loading, unloading, storage, pricing_locked, vat_refund, total,
         encar_url, encar_id, can_negotiate, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)
       RETURNING *`,
      [
        normalizedText.name ?? name, normalizedText.model ?? model, year, mileage || 0,
        fuel_type, transmission, drive_type, body_type, normalizedText.trim_level ?? trim_level, key_info, displacement || 0,
        normalizedText.body_color ?? body_color, body_color_dots || [], normalizedText.interior_color ?? interior_color, interior_color_dots || [],
        location, vin, price_krw || 0, price_usd || 0,
        commission ?? DEFAULT_FEES.commission, delivery ?? 0, delivery_profile_code || null, loading ?? DEFAULT_FEES.loading, unloading ?? DEFAULT_FEES.unloading,
        storage ?? DEFAULT_FEES.storage, pricing_locked || false, vat_refund || 0, total || 0,
        encar_url, encar_id, can_negotiate || false, tags || [],
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
    const fields = [
      'name', 'model', 'year', 'mileage',
      'fuel_type', 'transmission', 'drive_type', 'body_type', 'trim_level', 'key_info', 'displacement',
      'body_color', 'body_color_dots', 'interior_color', 'interior_color_dots',
      'location', 'vin', 'price_krw', 'price_usd',
      'commission', 'delivery', 'delivery_profile_code', 'loading', 'unloading', 'storage', 'pricing_locked', 'vat_refund', 'total',
      'encar_url', 'encar_id', 'can_negotiate', 'tags',
    ]

    const updates = []
    const params = []
    let p = 1
    const images = req.body.images
    const normalizedText = normalizeCarTextFields(req.body)

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${p++}`)
        params.push(normalizedText[field] !== undefined ? normalizedText[field] : req.body[field])
      }
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

router.delete('/:id', async (req, res) => {
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

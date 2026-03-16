import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { applyVehicleTitleFixes } from '../../shared/vehicleTextFixes.js'
import { sanitizeVin } from '../../shared/vin.js'
import FilterSidebar from '../components/catalog/FilterSidebar'
import CarCard from '../components/catalog/CarCard'
import DeliveryCountrySelect from '../components/shared/DeliveryCountrySelect.jsx'
import { CAR_SECTION_CONFIG, buildCarDetailsPath } from '../lib/catalogSections.js'
import {
  appendDisplayTrimSuffix,
  classifyVehicleOrigin,
  extractTrimLabelFromTitle,
  VAT_REFUND_RATE,
  VEHICLE_ORIGIN_LABELS,
  getShortLocationLabel,
  isWeakBodyTypeLabel,
  isWeakColorValue,
  normalizeColorLabel as normalizeVehicleColorLabel,
  normalizeInteriorColorLabel,
  normalizeKeyInfoLabel,
  normalizeTrimLabel,
  resolveDisplayBodyTypeLabel,
  resolveVehicleClassLabelForDisplay,
  stripTrailingTrimLabel,
} from '../lib/vehicleDisplay'

const HANGUL_RE = /[\uAC00-\uD7A3]/u
const MIN_CATALOG_YEAR = '2019'
const CATALOG_FILTER_APPLY_DELAY_MS = 320
const CATALOG_REQUEST_SETTLE_MS = 90
const CATALOG_RETRY_DELAYS_MS = [1000, 2200, 4500]
const CATALOG_PAGE_SIZE = 20
const CATALOG_AUTOLOAD_MAX_CARS = 300
const CATALOG_AUTOLOAD_MAX_PAGES = Math.max(1, Math.floor(CATALOG_AUTOLOAD_MAX_CARS / CATALOG_PAGE_SIZE))
const CATALOG_SCROLL_AUTOLOAD_THRESHOLD_PX = 320
const CATALOG_DETAIL_ENRICH_CONCURRENCY = 4
const TRANSIENT_CATALOG_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])
const encarDetailCache = new Map()
const encarDetailInFlight = new Map()
const KO = {
  diesel: '\uB514\uC824',
  gasoline: '\uAC00\uC194\uB9B0',
  gasolineAlt: '\uD718\uBC1C\uC720',
  hybrid: '\uD558\uC774\uBE0C\uB9AC\uB4DC',
  electric: '\uC804\uAE30',
  lpg: '\uC5D8\uD53C\uC9C0',
  auto: '\uC624\uD1A0',
  automatic: '\uC790\uB3D9',
  manual: '\uC218\uB3D9',
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
  sedan: '\uC138\uB2E8',
  hatchback: '\uD574\uCE58\uBC31',
  wagon: '\uC65C\uAC74',
  minivan: '\uBBF8\uB2C8\uBC34',
  van: '\uBC34',
  coupe: '\uCFE0\uD398',
  truck: '\uD2B8\uB7ED',
  cargo: '\uD654\uBB3C',
  crossover: '\uD06C\uB85C\uC2A4\uC624\uBC84',
}

function hasHangul(value) {
  return HANGUL_RE.test(String(value || ''))
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function shouldReplaceText(value) {
  const text = String(value || '').trim()
  return !text || text === '-' || hasHangul(text)
}

function normalizeDisplayText(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (!hasHangul(text)) return text
  return text.replace(/[\uAC00-\uD7A3]+/gu, ' ').replace(/\s+/g, ' ').trim()
}

const VEHICLE_NAME_FIXES = [
  [/\bgia\b/gi, 'Kia'],
  [/\bhyeondae\b/gi, 'Hyundai'],
  [/\bjenesiseu\b/gi, 'Genesis'],
  [/\bssoul\b/gi, 'Soul'],
  [/\bev\s+ev\b/gi, 'EV'],
  [/\(\s*sinhyeong\s*\)/gi, ''],
  [/\bsinhyeong\b/gi, ''],
  [/renault[-\s]*korea\s*\(\s*samseong\s*\)/gi, 'Renault Korea'],
  [/renault[-\s]*korea\s*samsung/gi, 'Renault Korea'],
  [/renault samsung/gi, 'Renault Korea'],
  [/kgmobilriti\s*\(\s*ssangyong\s*\)/gi, 'KG Mobility (SsangYong)'],
  [/kgmobilriti/gi, 'KG Mobility'],
  [/ssangyong/gi, 'SsangYong'],
  [/keuroseuobeo/gi, 'Crossover'],
  [/peulreoseu/gi, 'Plus'],
  [/rekseuteon/gi, 'Rexton'],
  [/seupocheu/gi, 'Sports'],
  [/kaeseupeo/gi, 'Casper'],
  [/aionik/gi, 'Ioniq'],
  [/geuraenjeo/gi, 'Grandeur'],
  [/mohabi/gi, 'Mohave'],
  [/santa[\s-]*fe/gi, 'Santafe'],
  [/ssonata/gi, 'Sonata'],
  [/\b([2-9])\s*sedae\b/gi, (_, n) => `${n}th Gen`],
]

const SUSPICIOUS_NAME_PATTERNS = [
  /^\((?:gm|sm|daewoo)\)\s*\d/i,
  /kgmobilriti/i,
  /rekseuteon/i,
  /seupocheu/i,
  /kaeseupeo/i,
  /geuraenjeo/i,
  /mohabi/i,
  /\b[2-9]\s*sedae\b/i,
]

const TITLE_MARKETING_PREFIXES = ['The New', 'All New', 'New Rise', 'The Bold']
const SPEC_ONLY_TITLE_TOKEN_RE = /^(?:l?\d+(?:\.\d+)?|[24]wd|awd|fwd|rwd|diesel|gasoline|lpg|hybrid|turbo|auto|automatic|manual|cvt|dct|at|mt)$/i
const LEGACY_RENAULT_SAMSUNG_MODEL_RE = /\b(?:sm3|sm5|sm6|sm7|qm3|qm5|qm6|xm3)\b/i

function stripVehicleTitleNoise(value) {
  let text = String(value || '').trim()
  if (!text) return ''

  const isLegacyRenaultSamsung = LEGACY_RENAULT_SAMSUNG_MODEL_RE.test(text)
  text = text
    .replace(
      /^(?:reunokoria|renault[-\s]*korea|renault\s*samsung)\s*\(?\s*(?:samseong|samsung)?\s*\)?\s*/gi,
      isLegacyRenaultSamsung ? 'Renault Samsung ' : ''
    )
    .replace(/\bRenault Korea\s*\((?:Samseong|Samsung)\)/gi, 'Renault Korea')
    .replace(/\b(KG Mobility)\s*\((?:SsangYong)\)/gi, '$1')

  if (isLegacyRenaultSamsung) {
    text = text
      .replace(/\bRenault Korea\b/gi, 'Renault Samsung')
      .replace(/\bRenault Samsung\s+Renault Samsung\b/gi, 'Renault Samsung')
  }

  const prefixGroup = TITLE_MARKETING_PREFIXES.map((item) => item.replace(/\s+/g, '\\s+')).join('|')
  const leadingMarketingRe = new RegExp(`^(?:${prefixGroup})\\s+`, 'i')
  const marketingAfterBrandRe = new RegExp(`^((?:[A-Z0-9][A-Za-z0-9&.+/-]*\\s+){0,3})(?:${prefixGroup})\\s+`, 'i')

  text = text.replace(leadingMarketingRe, '')
  text = text.replace(marketingAfterBrandRe, '$1')
  return text.replace(/\s+/g, ' ').trim()
}

function normalizeVehicleTitle(value) {
  let text = normalizeDisplayText(value)
  if (!text) return ''
  for (const [pattern, replacement] of VEHICLE_NAME_FIXES) {
    text = text.replace(pattern, replacement)
  }
  text = applyVehicleTitleFixes(text)
  text = stripVehicleTitleNoise(text)
  const signal = text.replace(/[\s()[\]{}\\/|+_.:-]+/g, '')
  if (!signal || !/[A-Za-zА-Яа-я0-9]/u.test(signal) || signal.length < 2) return ''
  return text
}

function isBrokenVehicleTitle(value) {
  const text = String(value || '').trim()
  if (!text) return true
  return !normalizeVehicleTitle(text)
}

function isSpecOnlyTitle(value) {
  const tokens = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (!tokens.length || tokens.length > 6) return false
  return tokens.every((token) => SPEC_ONLY_TITLE_TOKEN_RE.test(token))
}

function shouldUpgradeVehicleTitle(value) {
  const text = String(value || '').trim()
  if (shouldReplaceText(text)) return true
  if (isBrokenVehicleTitle(text)) return true
  if (isSpecOnlyTitle(text)) return true
  return SUSPICIOUS_NAME_PATTERNS.some((pattern) => pattern.test(text))
}

function hasAnyToken(value, tokens) {
  const src = String(value || '')
  return tokens.some((token) => src.includes(token))
}

function normalizeTagLabel(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const low = text.toLowerCase()

  if (low.includes('diesel') || low.includes('\u0434\u0438\u0437\u0435\u043b') || hasAnyToken(text, [KO.diesel])) return '\u0414\u0438\u0437\u0435\u043b\u044c'
  if (low.includes('gasoline') || low.includes('\u0431\u0435\u043d\u0437') || hasAnyToken(text, [KO.gasoline, KO.gasolineAlt])) return '\u0411\u0435\u043d\u0437\u0438\u043d'
  if (low.includes('hybrid') || low.includes('\u0433\u0438\u0431\u0440\u0438\u0434') || hasAnyToken(text, [KO.hybrid])) return '\u0411\u0435\u043d\u0437\u0438\u043d (\u0433\u0438\u0431\u0440\u0438\u0434)'
  if (low.includes('electric') || low.includes('\u044d\u043b\u0435\u043a\u0442\u0440\u043e') || hasAnyToken(text, [KO.electric])) return '\u042d\u043b\u0435\u043a\u0442\u0440\u043e'
  if (low.includes('lpg') || low.includes('\u0433\u0430\u0437') || hasAnyToken(text, [KO.lpg])) return '\u0413\u0430\u0437 (LPG)'
  if (low.includes('auto') || low.includes('\u0430\u0432\u0442\u043e\u043c\u0430\u0442') || hasAnyToken(text, [KO.auto, KO.automatic])) return '\u0410\u0432\u0442\u043e\u043c\u0430\u0442'
  if (low.includes('manual') || low.includes('\u043c\u0435\u0445\u0430\u043d') || hasAnyToken(text, [KO.manual])) return '\u041c\u0435\u0445\u0430\u043d\u0438\u043a\u0430'
  if (low.includes('cvt')) return 'CVT'
  if (low.includes('dct') || low.includes('dual') || low.includes('\u0440\u043e\u0431\u043e\u0442')) return '\u0420\u043e\u0431\u043e\u0442'

  if (hasHangul(text)) return ''
  return normalizeDisplayText(text)
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return []
  const out = []
  for (const tag of tags) {
    const normalized = normalizeTagLabel(tag)
    if (!normalized) continue
    if (!out.includes(normalized)) out.push(normalized)
  }
  return out
}

function pickFuelFromTags(tags) {
  return tags.find((tag) => /бензин|дизель|электро|газ|гибрид/i.test(String(tag))) || ''
}

function pickTransmissionFromTags(tags) {
  return tags.find((tag) => /автомат|механика|робот|cvt/i.test(String(tag))) || ''
}

function pickDriveFromTags(tags) {
  return tags.find((tag) => /2wd|fwd|awd|4wd|rwd|передн|полный|задн/i.test(String(tag))) || ''
}

function normalizeDriveLabel(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const low = text.toLowerCase()

  if (/(?:all[-\s]*wheel|allrad|4matic\+?|xdrive|quattro|4motion|syncro|sh-awd|e-awd|e[-\s]*four|htrac|awd)/i.test(low)) return '\u041f\u043e\u043b\u043d\u044b\u0439 (AWD)'
  if (/(?:4wd|4x4|e-?4wd|4wd\s*system)/i.test(low)) return '\u041f\u043e\u043b\u043d\u044b\u0439 (4WD)'
  if (/(?:rear[-\s]*wheel(?:\s*drive)?)/i.test(low) || /\b(?:fr|rwd)\b/i.test(low) || low.includes('\u0437\u0430\u0434\u043d')) return '\u0417\u0430\u0434\u043d\u0438\u0439 (RWD)'
  if (/(?:front[-\s]*wheel(?:\s*drive)?)/i.test(low) || /\b(?:ff|fwd)\b/i.test(low) || low.includes('\u043f\u0435\u0440\u0435\u0434\u043d')) return '\u041f\u0435\u0440\u0435\u0434\u043d\u0438\u0439 (FWD)'

  return ''
}

function inferDriveType(...values) {
  for (const value of values) {
    const normalized = normalizeDriveLabel(value)
    if (normalized) return normalized
  }
  return ''
}

function UNUSEDNormalizeBodyTypeLabel(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const low = text.toLowerCase()

  if (/gyeong(?:hyeong)?cha/i.test(text) || text.includes('\uACBD\uCC28')) return '\u041C\u0438\u043D\u0438'
  if (/sohyeongcha/i.test(text) || text.includes('\uC18C\uD615\uCC28')) return '\u041C\u0430\u043B\u044B\u0439 \u043A\u043B\u0430\u0441\u0441'
  if (/junjunghyeongcha/i.test(text) || text.includes('\uC900\uC911\uD615\uCC28')) return '\u041A\u043E\u043C\u043F\u0430\u043A\u0442\u043D\u044B\u0439 \u043A\u043B\u0430\u0441\u0441'
  if (/junghyeongcha/i.test(text) || text.includes('\uC911\uD615\uCC28')) return '\u0421\u0440\u0435\u0434\u043D\u0438\u0439 \u043A\u043B\u0430\u0441\u0441'
  if (/daehyeongcha/i.test(text) || text.includes('\uB300\uD615\uCC28')) return '\u0411\u0438\u0437\u043D\u0435\u0441-\u043A\u043B\u0430\u0441\u0441'
  if (low.includes('pickup') || text.includes('\uD53D\uC5C5')) return '\u041F\u0438\u043A\u0430\u043F'
  if (low.includes('truck') || low.includes('cargo') || low.includes('\u0433\u0440\u0443\u0437') || hasAnyToken(text, [KO.truck, KO.cargo])) return '\u0413\u0440\u0443\u0437\u043E\u0432\u043E\u0439 / \u043F\u0438\u043A\u0430\u043F'
  if (low === 'rv') return '\u041A\u0440\u043E\u0441\u0441\u043E\u0432\u0435\u0440 / \u0432\u043D\u0435\u0434\u043E\u0440\u043E\u0436\u043D\u0438\u043A'
  if (low.includes('suv') || low.includes('\u0432\u043d\u0435\u0434\u043e\u0440\u043e\u0436') || low.includes('\u043a\u0440\u043e\u0441\u0441') || hasAnyToken(text, [KO.crossover])) return '\u041A\u0440\u043E\u0441\u0441\u043E\u0432\u0435\u0440 / \u0432\u043D\u0435\u0434\u043E\u0440\u043E\u0436\u043D\u0438\u043A'
  if (low.includes('sedan') || low.includes('\u0441\u0435\u0434\u0430\u043d') || hasAnyToken(text, [KO.sedan])) return '\u0421\u0435\u0434\u0430\u043d'
  if (low.includes('cabrio') || low.includes('cabriolet') || low.includes('convertible') || low.includes('\u043a\u0430\u0431\u0440\u0438\u043e\u043b\u0435\u0442') || text.includes('\uCEE8\uBC84\uD130\uBE14')) return '\u041A\u0430\u0431\u0440\u0438\u043E\u043B\u0435\u0442'
  if (low.includes('hatch') || low.includes('\u0445\u044d\u0442\u0447') || hasAnyToken(text, [KO.hatchback])) return '\u0425\u044d\u0442\u0447\u0431\u0435\u043a'
  if (low.includes('wagon') || low.includes('\u0443\u043d\u0438\u0432\u0435\u0440\u0441') || hasAnyToken(text, [KO.wagon])) return '\u0423\u043d\u0438\u0432\u0435\u0440\u0441\u0430\u043b'
  if (low.includes('van') || low.includes('minivan') || low.includes('\u0432\u044d\u043d') || low.includes('\u043c\u0438\u043d\u0438\u0432') || hasAnyToken(text, [KO.minivan, KO.van])) return '\u041C\u0438\u043D\u0438\u0432\u044D\u043D'
  if (low.includes('coupe') || low.includes('\u043a\u0443\u043f\u0435') || hasAnyToken(text, [KO.coupe])) return '\u041a\u0443\u043f\u0435'

  return normalizeDisplayText(text)
}

function hasUntranslatedTags(tags) {
  if (!Array.isArray(tags) || !tags.length) return true
  return tags.some((tag) => shouldReplaceText(tag))
}

function normalizeColorLabel(value) {
  return normalizeVehicleColorLabel(value)
}

function shouldReplaceColor(value) {
  return isWeakColorValue(value)
}

function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function buildCatalogResponseError(response, fallbackMessage) {
  let message = String(fallbackMessage || '').trim() || 'Ошибка загрузки'

  try {
    const payload = await response.clone().json()
    if (payload?.error) {
      message = String(payload.error).trim() || message
    }
  } catch {
    try {
      const text = await response.clone().text()
      if (text) message = text.slice(0, 140)
    } catch {
      // Ignore body parsing issues for non-JSON responses.
    }
  }

  const error = new Error(message)
  error.httpStatus = Number(response.status) || 0
  return error
}

function isTransientCatalogError(error) {
  if (!error || error?.name === 'AbortError') return false

  const status = Number(error?.httpStatus || error?.status || 0)
  if (!status) return true
  return TRANSIENT_CATALOG_HTTP_STATUSES.has(status)
}

function getCatalogTransientMessage(hasSearchQuery, willRetry) {
  if (hasSearchQuery) {
    return willRetry
      ? 'Временная ошибка поиска. Повторяем автоматически...'
      : 'Временная ошибка поиска. Попробуйте повторить.'
  }

  return willRetry
    ? 'Временная ошибка загрузки. Повторяем автоматически...'
    : 'Ошибка загрузки. Попробуйте повторить.'
}

function normalizeDisplacementValue(value) {
  const num = Number(value) || 0
  if (num >= 800) return Number((num / 1000).toFixed(1))
  if (num >= 0.8 && num <= 8.0) return Number(num.toFixed(1))
  return 0
}

function appendFilterParams(params, filters) {
  for (const [key, value] of Object.entries(filters || {})) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      value
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .forEach((item) => params.append(key, item))
      continue
    }
    params.set(key, String(value))
  }
  return params
}

function inferEngineLiters(...values) {
  const text = values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')

  if (!text) return 0

  const decimalMatches = [...text.matchAll(/\b([0-7]\.\d)\b/g)]
  for (const match of decimalMatches) {
    const candidate = Number(match[1])
    if (candidate >= 0.8 && candidate <= 8.0) return candidate
  }

  return 0
}

function formatEngineVolume(value) {
  const liters = normalizeDisplacementValue(value)
  if (!liters) return ''
  return `${liters.toFixed(1)} л`
}

function resolveEngineVolume({ displacement, fuelType, name, model }) {
  if (String(fuelType || '').toLowerCase().includes('электро')) return ''
  const liters = normalizeDisplacementValue(displacement) || inferEngineLiters(name, model)
  return formatEngineVolume(liters)
}

function carMatchesSearch(car, query) {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return true

  const searchValues = [
    car.name,
    car.model,
    car.year,
    car.vin,
    car.encarId,
    car.bodyType,
    car.vehicleClass,
    car.driveType,
    car.fuelType,
    car.transmission,
    car.bodyColor,
    car.interiorColor,
    car.location,
    car.trimLevel,
    car.keyInfo,
    car.engineVolume,
    car.displacement,
    ...(Array.isArray(car.tags) ? car.tags : []),
  ]
    .map((value) => normalizeSearchText(value))
    .filter(Boolean)

  const haystack = searchValues.join(' ')
  const compactHaystack = searchValues
    .map((value) => value.replace(/\s+/g, ''))
    .filter(Boolean)
    .join(' ')

  return normalizedQuery
    .split(' ')
    .filter(Boolean)
    .every((token) => haystack.includes(token) || compactHaystack.includes(token.replace(/\s+/g, '')))
}

function normalizeOriginFilterValues(value) {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : []

  return values
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean)
    .map((item) => {
      if (item === VEHICLE_ORIGIN_LABELS.imported.toLowerCase() || item.includes('imported') || item.includes('foreign')) {
        return 'imported'
      }
      if (item === VEHICLE_ORIGIN_LABELS.korean.toLowerCase() || item.includes('korean') || item.includes('domestic')) {
        return 'korean'
      }
      return ''
    })
    .filter(Boolean)
}

function filterCarsByOriginSelection(cars, originFilter) {
  const normalizedOrigins = normalizeOriginFilterValues(originFilter)
  const wantsImported = normalizedOrigins.includes('imported')
  const wantsKorean = normalizedOrigins.includes('korean')

  if (wantsImported === wantsKorean) return cars

  return cars.filter((car) => {
    const origin = classifyVehicleOrigin(car.name, car.model, car.trimLevel)
    return wantsImported
      ? origin === VEHICLE_ORIGIN_LABELS.imported
      : origin === VEHICLE_ORIGIN_LABELS.korean
  })
}

function buildCarUpdatePatch(prevCar, nextCar) {
  const patch = {}

  if (nextCar.name && nextCar.name !== prevCar.name) patch.name = nextCar.name
  if (nextCar.model && nextCar.model !== prevCar.model) patch.model = nextCar.model
  if (nextCar.transmission && nextCar.transmission !== prevCar.transmission) patch.transmission = nextCar.transmission
  if (nextCar.driveType && nextCar.driveType !== prevCar.driveType) patch.drive_type = nextCar.driveType
  if (nextCar.bodyType && nextCar.bodyType !== (prevCar.rawBodyType || prevCar.bodyType)) patch.body_type = nextCar.bodyType
  if (nextCar.vehicleClass && nextCar.vehicleClass !== prevCar.vehicleClass) patch.vehicle_class = nextCar.vehicleClass
  if (nextCar.displacement && nextCar.displacement !== prevCar.displacement) patch.displacement = nextCar.displacement
  if (nextCar.trimLevel && nextCar.trimLevel !== prevCar.trimLevel) patch.trim_level = nextCar.trimLevel
  if (nextCar.keyInfo && nextCar.keyInfo !== prevCar.keyInfo) patch.key_info = nextCar.keyInfo
  if (nextCar.bodyColor && nextCar.bodyColor !== prevCar.bodyColor) patch.body_color = nextCar.bodyColor
  if (nextCar.interiorColor !== prevCar.interiorColor) patch.interior_color = nextCar.interiorColor || ''
  if (nextCar.location && nextCar.location !== prevCar.location) patch.location = nextCar.location
  if (nextCar.vin && nextCar.vin !== prevCar.vin) patch.vin = nextCar.vin

  const prevTags = Array.isArray(prevCar.tags) ? prevCar.tags : []
  const nextTags = Array.isArray(nextCar.tags) ? nextCar.tags : []
  if (JSON.stringify(nextTags) !== JSON.stringify(prevTags)) patch.tags = nextTags

  const prevDetailFlags = prevCar.detailFlags && typeof prevCar.detailFlags === 'object' ? prevCar.detailFlags : {}
  const nextDetailFlags = nextCar.detailFlags && typeof nextCar.detailFlags === 'object' ? nextCar.detailFlags : {}
  if (JSON.stringify(nextDetailFlags) !== JSON.stringify(prevDetailFlags)) {
    patch.detail_flags = nextDetailFlags
  }

  const prevInspectionFormats = Array.isArray(prevCar.inspectionFormats) ? prevCar.inspectionFormats : []
  const nextInspectionFormats = Array.isArray(nextCar.inspectionFormats) ? nextCar.inspectionFormats : []
  if (JSON.stringify(nextInspectionFormats) !== JSON.stringify(prevInspectionFormats)) {
    patch.inspection_formats = nextInspectionFormats
  }

  const prevImages = normalizeImages(prevCar.images)
  const nextImages = normalizeImages(nextCar.images)
  if (JSON.stringify(nextImages) !== JSON.stringify(prevImages)) patch.images = nextImages

  return patch
}

function mergeCatalogCars(existingCars, incomingCars) {
  const nextCars = Array.isArray(existingCars) ? [...existingCars] : []
  const indexById = new Map(nextCars.map((car, index) => [car.id, index]))

  for (const car of incomingCars || []) {
    const existingIndex = indexById.get(car.id)
    if (existingIndex === undefined) {
      indexById.set(car.id, nextCars.length)
      nextCars.push(car)
      continue
    }
    nextCars[existingIndex] = car
  }

  return nextCars
}

function toAbsoluteImageUrl(raw) {
  if (!raw) return ''
  const url = String(raw).trim()
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('/carpicture') || url.startsWith('carpicture')) {
    return `https://ci.encar.com${url.startsWith('/') ? '' : '/'}${url}`
  }
  return url
}

function normalizeImages(rawImages) {
  if (!Array.isArray(rawImages)) return []
  return rawImages
    .map((img, idx) => {
      if (!img) return null
      if (typeof img === 'string') return { id: `img-${idx}`, url: toAbsoluteImageUrl(img) }
      return {
        id: img.id ?? `img-${idx}`,
        url: toAbsoluteImageUrl(img.url || img.path || img.location || ''),
      }
    })
    .filter((img) => img?.url)
}

function hasWeakImages(car) {
  const images = Array.isArray(car.images) ? car.images : []
  if (!images.length) return true
  return images.every((img) => String(img?.url || '').startsWith('/uploads/'))
}

function needsEncarEnrichment(car) {
  if (!car?.encarId || car.encarId === '-') return false
  const detailMetaReady = car.detailFlags?.metaReady === true
  return (
    !detailMetaReady ||
    !car.transmission || car.transmission === '-' ||
    !car.driveType || car.driveType === '-' ||
    isWeakBodyTypeLabel(car.rawBodyType || car.bodyType) ||
    !car.trimLevel ||
    !car.keyInfo ||
    (!car.engineVolume && !String(car.fuelType || '').toLowerCase().includes('электро')) ||
    hasWeakImages(car) ||
    shouldUpgradeVehicleTitle(car.name) ||
    shouldUpgradeVehicleTitle(car.model) ||
    hasUntranslatedTags(car.tags) ||
    shouldReplaceColor(car.bodyColor) ||
    shouldReplaceColor(car.interiorColor) ||
    shouldReplaceText(car.location) ||
    shouldReplaceText(car.vin)
  )
}

async function fetchEncarDetail(encarId) {
  const key = String(encarId || '').trim()
  if (!key || key === '-') return null
  if (encarDetailCache.has(key)) return encarDetailCache.get(key)
  if (encarDetailInFlight.has(key)) return encarDetailInFlight.get(key)

  const promise = (async () => {
    try {
      let detail = null
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const res = await fetch(`/api/encar/${encodeURIComponent(key)}`)
          if (res.ok) {
            detail = await res.json()
            break
          }
          if (!TRANSIENT_CATALOG_HTTP_STATUSES.has(res.status) || attempt === 2) {
            return null
          }
        } catch {
          if (attempt === 2) return null
        }
        await sleep(CATALOG_RETRY_DELAYS_MS[Math.min(attempt, CATALOG_RETRY_DELAYS_MS.length - 1)])
      }

      if (!detail) return null

      const detailTrim = normalizeTrimLabel(detail?.trim_level || '') || extractTrimLabelFromTitle(detail?.name || '', detail?.model || '')
      const normalized = {
        images: normalizeImages(detail?.photos?.length ? detail.photos : detail?.images),
        name: appendDisplayTrimSuffix(stripTrailingTrimLabel(normalizeVehicleTitle(detail?.name || ''), detailTrim), detailTrim),
        model: appendDisplayTrimSuffix(stripTrailingTrimLabel(normalizeVehicleTitle(detail?.model || ''), detailTrim), detailTrim),
        fuelType: normalizeTagLabel(detail?.fuel_type || ''),
        transmission: normalizeTagLabel(detail?.transmission || ''),
        driveType: normalizeDriveLabel(detail?.drive_type || ''),
        bodyType: resolveDisplayBodyTypeLabel(detail?.body_type || '', detail?.name || '', detail?.model || ''),
        vehicleClass: resolveVehicleClassLabelForDisplay(detail?.vehicle_class || '', detail?.body_type || '', detail?.name || '', detail?.model || ''),
        trimLevel: detailTrim,
        keyInfo: normalizeKeyInfoLabel(detail?.key_info || ''),
        displacement: Number(detail?.displacement) || 0,
        bodyColor: normalizeColorLabel(detail?.body_color || ''),
        interiorColor: normalizeInteriorColorLabel(detail?.interior_color || '', detail?.body_color || '', { allowBodyDuplicate: true }),
        location: getShortLocationLabel(detail?.location_short || detail?.location || ''),
        vin: sanitizeVin(detail?.vin) || '',
        flags: { ...(detail?.flags || {}), metaReady: true },
        inspectionFormats: detail?.condition?.inspectionFormats || [],
      }
      normalized.engineVolume = resolveEngineVolume(normalized)
      encarDetailCache.set(key, normalized)
      return normalized
    } catch {
      return null
    } finally {
      encarDetailInFlight.delete(key)
    }
  })()

  encarDetailInFlight.set(key, promise)
  return promise
}

const HomeIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" strokeWidth={2} />
  </svg>
)
const ChevronRightIcon = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <polyline points="9 18 15 12 9 6" strokeWidth={2} strokeLinecap="round" />
  </svg>
)
const FilterIcon = () => (
  <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <line x1="4" y1="6" x2="20" y2="6" strokeWidth={2} strokeLinecap="round" />
    <line x1="8" y1="12" x2="16" y2="12" strokeWidth={2} strokeLinecap="round" />
    <line x1="11" y1="18" x2="13" y2="18" strokeWidth={2} strokeLinecap="round" />
  </svg>
)
const SearchIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35m1.35-5.15a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
)
const ChevronDownIcon = () => (
  <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <polyline points="6 9 12 15 18 9" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const CheckIcon = () => (
  <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <polyline points="4 12 9 17 20 6" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const EncarIcon = () => (
  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" strokeWidth={2} />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h8M12 8l4 4-4 4" />
  </svg>
)
const WaGroupIcon = () => (
  <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
  </svg>
)

function mapCar(c) {
  const priceUSD = Number(c.price_usd) || 0
  const commission = Number(c.commission ?? 200) || 200
  const delivery = Number(c.delivery ?? 1750) || 1750
  const loading = Number(c.loading) || 0
  const unloading = Number(c.unloading ?? 100) || 100
  const storage = Number(c.storage ?? 310) || 310
  const vatRefund = Number(c.vat_refund) || Math.round(priceUSD * VAT_REFUND_RATE)
  const total = Number(c.total) || Math.round(priceUSD + commission + delivery + loading + unloading + storage - vatRefund)
  const images = normalizeImages(c.images)

  const normalizedName = normalizeVehicleTitle(c.name || '')
  const normalizedModel = normalizeVehicleTitle(c.model || '')
  const normalizedLocation = getShortLocationLabel(c.location_short || c.location || '\u041a\u043e\u0440\u0435\u044f')
  const tags = normalizeTags(c.tags || [])
  const fuelType = normalizeTagLabel(c.fuel_type || '') || pickFuelFromTags(tags) || '-'
  const transmission = normalizeTagLabel(c.transmission || '') || pickTransmissionFromTags(tags) || '-'
  const driveSource = c.drive_type || pickDriveFromTags(tags)
  const driveType = inferDriveType(
    driveSource,
    c.name,
    c.model,
    normalizedName,
    normalizedModel,
    ...(Array.isArray(c.tags) ? c.tags : []),
  ) || normalizeDisplayText(driveSource) || '-'
  const bodyType = resolveDisplayBodyTypeLabel(c.body_type || '', normalizedName, normalizedModel, c.name || '', c.model || '') || '-'
  const vehicleClass = resolveVehicleClassLabelForDisplay(c.vehicle_class || '', c.body_type || bodyType, normalizedName, normalizedModel, c.name || '', c.model || '') || '-'
  const trimLevel = normalizeTrimLabel(c.trim_level || '') || extractTrimLabelFromTitle(normalizedName, normalizedModel, c.name || '', c.model || '')
  const displacement = Number(c.displacement) || 0
  const engineVolume = resolveEngineVolume({
    displacement,
    fuelType,
    name: normalizedName,
    model: normalizedModel,
  })

  return {
    id: c.id,
    name: appendDisplayTrimSuffix(normalizedName || normalizedModel || '\u0410\u0432\u0442\u043e\u043c\u043e\u0431\u0438\u043b\u044c', trimLevel),
    model: appendDisplayTrimSuffix(normalizedModel || normalizedName || '-', trimLevel),
    year: c.year,
    mileage: c.mileage || 0,
    tags,
    fuelType,
    transmission,
    driveType,
    bodyType,
    vehicleClass,
    rawBodyType: String(c.body_type || '').trim(),
    trimLevel,
    keyInfo: normalizeKeyInfoLabel(c.key_info || ''),
    displacement,
    engineVolume,
    bodyColor: normalizeColorLabel(c.body_color || '-'),
    bodyColorDots: c.body_color_dots || [],
    interiorColor: normalizeInteriorColorLabel(c.interior_color || '', c.body_color || '', { allowBodyDuplicate: true }),
    interiorColorDots: c.interior_color_dots || [],
    location: normalizedLocation || '\u041a\u043e\u0440\u0435\u044f',
    vin: sanitizeVin(c.vin) || '-',
    priceKRW: Number(c.price_krw) || 0,
    priceUSD,
    commission,
    delivery,
    loading,
    unloading,
    storage,
    vatRefund,
    total,
    deliveryProfileCode: c.delivery_profile_code || '',
    deliveryProfileLabel: c.delivery_profile_label || '',
    pricingLocked: Boolean(c.pricing_locked),
    encarUrl: c.encar_url,
    encarId: c.encar_id || '-',
    canNegotiate: c.can_negotiate,
    imageCount: images.length || 1,
    images,
    detailFlags: c.detail_flags || c.flags || {},
    inspectionFormats: Array.isArray(c.inspection_formats)
      ? c.inspection_formats
      : (Array.isArray(c.condition?.inspectionFormats) ? c.condition.inspectionFormats : []),
  }
}

const SORT_OPTIONS = [
  { value: 'newest', label: 'Новые объявления' },
  { value: 'price_asc', label: 'Цена: от дешевых' },
  { value: 'price_desc', label: 'Цена: от дорогих' },
  { value: 'year_desc', label: 'Год: новые' },
  { value: 'year_asc', label: 'Год: старые' },
  { value: 'mileage', label: 'Пробег: меньше' },
  { value: 'mileage_desc', label: 'Пробег: больше' },
]

export default function CatalogPage({ section = CAR_SECTION_CONFIG.main, introContent = null }) {
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sort, setSort] = useState('newest')
  const [sortOpen, setSortOpen] = useState(false)
  const [cars, setCars] = useState([])
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isAutoLoadingMore, setIsAutoLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [hasRetryableError, setHasRetryableError] = useState(false)
  const [meta, setMeta] = useState({ total: 0, page: 1, pages: 1 })
  const [filters, setFilters] = useState({ minYear: MIN_CATALOG_YEAR })
  const [appliedFilters, setAppliedFilters] = useState({ minYear: MIN_CATALOG_YEAR })
  const [page, setPage] = useState(1)
  const [loadedPageEnd, setLoadedPageEnd] = useState(1)
  const sortRef = useRef(null)
  const listAbortControllerRef = useRef(null)
  const activeCatalogRequestRef = useRef(0)
  const carsRef = useRef([])
  const retryTimerRef = useRef(null)
  const fetchCarsRef = useRef(null)
  const activeCatalogQueryKeyRef = useRef('')
  const autoLoadSentinelRef = useRef(null)
  const autoLoadLockRef = useRef(false)
  const autoLoadStateRef = useRef({
    canAutoLoadMore: false,
    visiblePageEnd: 1,
    metaPages: 1,
    autoLoadPageLimit: 1,
  })
  const location = useLocation()
  const searchQuery = new URLSearchParams(location.search).get('q')?.trim() || ''
  const hasSearchQuery = Boolean(searchQuery)
  const activeSortOption = SORT_OPTIONS.find((option) => option.value === sort) || SORT_OPTIONS[0]
  const filtersKey = appendFilterParams(new URLSearchParams(), filters).toString()
  const appliedFiltersKey = appendFilterParams(new URLSearchParams(), appliedFilters).toString()
  const normalizedOriginFilters = normalizeOriginFilterValues(filters.origin)
  const hasImportedOriginFilter = normalizedOriginFilters.includes('imported')
  const hasKoreanOriginFilter = normalizedOriginFilters.includes('korean')
  const isImportedQuickFilterActive = hasImportedOriginFilter && !hasKoreanOriginFilter
  const isKoreanQuickFilterActive = hasKoreanOriginFilter && !hasImportedOriginFilter
  const isAllCarsQuickFilterActive = normalizedOriginFilters.length === 0 || (hasImportedOriginFilter && hasKoreanOriginFilter)
  const catalogRequestKey = `${appliedFiltersKey}|sort=${sort}|page=${page}|q=${searchQuery}`
  const visiblePageStart = Math.min(meta.page || 1, loadedPageEnd || 1)
  const visiblePageEnd = Math.max(meta.page || 1, loadedPageEnd || 1)
  const autoLoadPageLimit = Math.min(meta.pages || 1, (meta.page || 1) + CATALOG_AUTOLOAD_MAX_PAGES - 1)
  const canAutoLoadMore = (
    cars.length > 0
    && !loading
    && !isRefreshing
    && !isAutoLoadingMore
    && !error
    && visiblePageEnd < meta.pages
    && visiblePageEnd < autoLoadPageLimit
  )

  useEffect(() => {
    carsRef.current = cars
  }, [cars])

  useEffect(() => {
    activeCatalogQueryKeyRef.current = catalogRequestKey
  }, [catalogRequestKey])

  useEffect(() => {
    autoLoadStateRef.current = {
      canAutoLoadMore,
      visiblePageEnd,
      metaPages: meta.pages || 1,
      autoLoadPageLimit,
    }
  }, [autoLoadPageLimit, canAutoLoadMore, meta.pages, visiblePageEnd])

  useEffect(() => {
    if (filtersKey === appliedFiltersKey) return undefined

    const timeoutId = window.setTimeout(() => {
      setPage(1)
      setAppliedFilters(filters)
    }, CATALOG_FILTER_APPLY_DELAY_MS)

    return () => window.clearTimeout(timeoutId)
  }, [appliedFiltersKey, filters, filtersKey])

  const clearScheduledRetry = useCallback(() => {
    if (!retryTimerRef.current) return
    window.clearTimeout(retryTimerRef.current)
    retryTimerRef.current = null
  }, [])

  const scheduleCatalogRetry = useCallback((requestKey, nextAttempt, retryOptions = {}) => {
    const retryDelay = CATALOG_RETRY_DELAYS_MS[nextAttempt - 1]
    if (!retryDelay) return false

    clearScheduledRetry()
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null
      if (activeCatalogQueryKeyRef.current !== requestKey) return
      fetchCarsRef.current?.({ retryAttempt: nextAttempt, settleMs: 0, ...retryOptions })
    }, retryDelay)

    return true
  }, [clearScheduledRetry])

  const applyQuickOriginFilter = useCallback((mode) => {
    setFilters((prev) => {
      const next = { ...prev }

      if (mode === 'imported') {
        next.origin = [VEHICLE_ORIGIN_LABELS.imported]
        return next
      }
      if (mode === 'korean') {
        next.origin = [VEHICLE_ORIGIN_LABELS.korean]
        return next
      }


      delete next.origin
      return next
    })
  }, [])

  const fetchCarsFallback = useCallback(async ({ signal, requestId } = {}) => {
    const fallbackLimit = 250
    const fallbackPages = 4
    const fallbackCars = []
    let loadedAnyPage = false

    for (let currentPage = 1; currentPage <= fallbackPages; currentPage += 1) {
      if (signal?.aborted || requestId !== activeCatalogRequestRef.current) return false

      const params = appendFilterParams(new URLSearchParams(), appliedFilters)
      params.set('listingType', section.listingType)
      params.set('sort', sort)
      params.set('page', String(currentPage))
      params.set('limit', String(fallbackLimit))

      const res = await fetch(`/api/cars?${params}`, { signal })
      if (!res.ok) {
        if (loadedAnyPage) break
        throw await buildCatalogResponseError(
          res,
          '\u0412\u0440\u0435\u043c\u0435\u043d\u043d\u0430\u044f \u043e\u0448\u0438\u0431\u043a\u0430 \u043f\u043e\u0438\u0441\u043a\u0430. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u043f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u044c.'
        )
      }

      const data = await res.json()
      const mappedCars = Array.isArray(data.cars) ? data.cars.map(mapCar) : []
      loadedAnyPage = true
      fallbackCars.push(...mappedCars)

      if (!mappedCars.length || mappedCars.length < fallbackLimit) break
    }

    if (signal?.aborted || requestId !== activeCatalogRequestRef.current) return false

    const filteredCars = filterCarsByOriginSelection(
      fallbackCars.filter((car) => carMatchesSearch(car, searchQuery)),
      appliedFilters.origin
    )
    setCars(filteredCars)
    setMeta({ total: filteredCars.length, page: 1, pages: 1 })
    setLoadedPageEnd(1)
    setHasRetryableError(false)
    setError(filteredCars.length ? null : '\u041d\u0438\u0447\u0435\u0433\u043e \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e')
    return true
  }, [sort, appliedFilters, searchQuery, section.listingType])

  const runCatalogEnrichment = useCallback(async ({ carsToEnrich, requestId, append = false } = {}) => {
    if (!Array.isArray(carsToEnrich) || !carsToEnrich.some(needsEncarEnrichment)) return

    const isStale = () => requestId !== activeCatalogRequestRef.current
    const patchesToPersist = []
    const enrichedCars = [...carsToEnrich]
    const sourceIdsKey = carsToEnrich.map((car) => car.id).join(',')

    for (let index = 0; index < carsToEnrich.length; index += CATALOG_DETAIL_ENRICH_CONCURRENCY) {
      if (isStale()) return

      const batch = carsToEnrich.slice(index, index + CATALOG_DETAIL_ENRICH_CONCURRENCY)
      const enrichedBatch = await Promise.all(
        batch.map(async (car) => {
          if (isStale() || !needsEncarEnrichment(car)) return car

          const detail = await fetchEncarDetail(car.encarId)
          if (isStale() || !detail) return car

          const next = { ...car }
          if (shouldUpgradeVehicleTitle(car.name) && detail.name) next.name = detail.name
          if (shouldUpgradeVehicleTitle(car.model) && detail.model) next.model = detail.model
          if (hasUntranslatedTags(car.tags)) {
            const detailTags = normalizeTags([detail.driveType, detail.fuelType, detail.transmission])
            if (detailTags.length) next.tags = detailTags
          }
          if ((!car.fuelType || car.fuelType === '-') && detail.fuelType) next.fuelType = detail.fuelType
          if ((!car.transmission || car.transmission === '-') && detail.transmission) next.transmission = detail.transmission
          if (!next.driveType || next.driveType === '-') {
            const inferredDrive = detail.driveType || inferDriveType(
              car.name,
              car.model,
              detail.name,
              detail.model,
              ...(Array.isArray(car.tags) ? car.tags : []),
            )
            if (inferredDrive) next.driveType = inferredDrive
          }
          if (isWeakBodyTypeLabel(car.rawBodyType || car.bodyType) && detail.bodyType) {
            next.bodyType = detail.bodyType
            next.rawBodyType = detail.bodyType
          }
          if ((!car.vehicleClass || car.vehicleClass === '-') && detail.vehicleClass) {
            next.vehicleClass = detail.vehicleClass
          }
          if (!car.trimLevel && detail.trimLevel) next.trimLevel = detail.trimLevel
          if (!car.keyInfo && detail.keyInfo) next.keyInfo = detail.keyInfo
          if ((!car.displacement || !car.engineVolume) && detail.displacement) {
            next.displacement = detail.displacement
            next.engineVolume = detail.engineVolume || resolveEngineVolume({
              displacement: detail.displacement,
              fuelType: next.fuelType || detail.fuelType,
              name: next.name,
              model: next.model,
            })
          }
          if (hasWeakImages(car) && detail.images.length) next.images = detail.images
          if (shouldReplaceColor(car.bodyColor) && detail.bodyColor) next.bodyColor = detail.bodyColor
          if (shouldReplaceColor(car.interiorColor) && detail.interiorColor) next.interiorColor = detail.interiorColor
          if (detail.location) next.location = detail.location
          if (shouldReplaceText(car.vin) && detail.vin) next.vin = sanitizeVin(detail.vin) || next.vin
          if (!next.engineVolume) {
            next.engineVolume = resolveEngineVolume({
              displacement: next.displacement,
              fuelType: next.fuelType,
              name: next.name,
              model: next.model,
            })
          }
          next.detailFlags = detail.flags || next.detailFlags
          next.inspectionFormats = detail.inspectionFormats || next.inspectionFormats
          next.imageCount = next.images.length || 1

          const patch = buildCarUpdatePatch(car, next)
          if (Object.keys(patch).length) {
            patchesToPersist.push({ id: car.id, patch })
          }
          return next
        })
      )

      if (isStale()) return

      enrichedBatch.forEach((car, offset) => {
        enrichedCars[index + offset] = car
      })
    }

    if (isStale()) return

    if (append) {
      setCars((prev) => mergeCatalogCars(prev, enrichedCars))
    } else {
      setCars((prev) => {
        const prevIdsKey = prev.map((car) => car.id).join(',')
        if (prevIdsKey !== sourceIdsKey) return prev
        return enrichedCars
      })
    }

    if (patchesToPersist.length && !isStale()) {
      Promise.allSettled(
        patchesToPersist.map(({ id, patch }) =>
          fetch(`/api/cars/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
          })
        )
      ).catch(() => {})
    }
  }, [])

  const triggerAutoLoadNextPage = useCallback(() => {
    if (autoLoadLockRef.current) return false

    const {
      canAutoLoadMore: canLoad,
      visiblePageEnd: currentPageEnd,
      metaPages,
      autoLoadPageLimit: pageLimit,
    } = autoLoadStateRef.current

    if (!canLoad) return false

    const nextPage = currentPageEnd + 1
    if (nextPage > metaPages || nextPage > pageLimit) return false

    autoLoadLockRef.current = true
    fetchCarsRef.current?.({
      retryAttempt: 0,
      settleMs: 0,
      pageOverride: nextPage,
      append: true,
    })
    return true
  }, [])

  const fetchCars = useCallback(async ({
    retryAttempt = 0,
    settleMs = CATALOG_REQUEST_SETTLE_MS,
    pageOverride,
    append = false,
  } = {}) => {
    const requestId = activeCatalogRequestRef.current + 1
    activeCatalogRequestRef.current = requestId
    clearScheduledRetry()
    listAbortControllerRef.current?.abort()
    const controller = new AbortController()
    listAbortControllerRef.current = controller
    const isStale = () => controller.signal.aborted || requestId !== activeCatalogRequestRef.current
    const hasVisibleCars = carsRef.current.length > 0
    const targetPage = Math.max(1, Number(pageOverride || page) || 1)
    const requestKey = catalogRequestKey

    if (append) {
      autoLoadLockRef.current = true
      setIsAutoLoadingMore(true)
      setLoading(false)
      setIsRefreshing(false)
    } else if (hasVisibleCars) {
      autoLoadLockRef.current = false
      setIsAutoLoadingMore(false)
      setIsRefreshing(true)
      setLoading(false)
    } else {
      autoLoadLockRef.current = false
      setIsAutoLoadingMore(false)
      setLoading(true)
      setIsRefreshing(false)
    }
    setHasRetryableError(false)
    setError(null)
    try {
      if (settleMs > 0) {
        await sleep(settleMs)
        if (isStale()) return
      }

      const params = appendFilterParams(new URLSearchParams(), appliedFilters)
      params.set('listingType', section.listingType)
      params.set('sort', sort)
      params.set('page', String(targetPage))
      params.set('limit', String(CATALOG_PAGE_SIZE))
      if (searchQuery) params.set('q', searchQuery)
      const res = await fetch(`/api/cars?${params}`, { signal: controller.signal })
      if (!res.ok) {
        if (searchQuery && !append) {
          await fetchCarsFallback({ signal: controller.signal, requestId })
          return
        }
        throw await buildCatalogResponseError(res, '\u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438')
      }
      const data = await res.json()

      const mappedCars = filterCarsByOriginSelection(data.cars.map(mapCar), appliedFilters.origin)
      if (searchQuery && data.total === 0 && !append) {
        await fetchCarsFallback({ signal: controller.signal, requestId })
        return
      }
      if (isStale()) return

      if (append) {
        setCars((prev) => mergeCatalogCars(prev, mappedCars))
        setMeta((prev) => ({ ...prev, total: data.total, pages: data.pages }))
      } else {
        setCars(mappedCars)
        setMeta({ total: data.total, page: data.page, pages: data.pages })
      }
      setLoadedPageEnd(targetPage)
      setHasRetryableError(false)
      void runCatalogEnrichment({ carsToEnrich: mappedCars, requestId, append })
    } catch (e) {
      if (e?.name === 'AbortError' || isStale()) return

      if (searchQuery && !append) {
        try {
          await fetchCarsFallback({ signal: controller.signal, requestId })
          return
        } catch (fallbackError) {
          if (isStale()) return
          const nextAttempt = retryAttempt + 1
          const willRetry = isTransientCatalogError(fallbackError)
            && scheduleCatalogRetry(requestKey, nextAttempt, { pageOverride: targetPage, append })
          setHasRetryableError(willRetry)
          setError(getCatalogTransientMessage(true, willRetry))
        }
      } else if (!isStale()) {
        const nextAttempt = retryAttempt + 1
        const willRetry = isTransientCatalogError(e)
          && scheduleCatalogRetry(requestKey, nextAttempt, { pageOverride: targetPage, append })
        setHasRetryableError(willRetry)
        setError(willRetry
          ? getCatalogTransientMessage(Boolean(searchQuery), true)
          : (e.message || getCatalogTransientMessage(Boolean(searchQuery), false)))
      }
    } finally {
      if (listAbortControllerRef.current === controller) {
        listAbortControllerRef.current = null
      }
      if (!append) {
        autoLoadLockRef.current = false
        setIsAutoLoadingMore(false)
      } else if (!isStale()) {
        autoLoadLockRef.current = false
      }
      if (!isStale()) {
        setLoading(false)
        setIsRefreshing(false)
        setIsAutoLoadingMore(false)
      }
    }
  }, [sort, page, appliedFilters, searchQuery, fetchCarsFallback, clearScheduledRetry, scheduleCatalogRetry, catalogRequestKey, runCatalogEnrichment, section.listingType])

  useEffect(() => {
    fetchCarsRef.current = fetchCars
  }, [fetchCars])

  useEffect(() => {
    fetchCars()
  }, [fetchCars])

  useEffect(() => () => {
    clearScheduledRetry()
    listAbortControllerRef.current?.abort()
  }, [clearScheduledRetry])

  useEffect(() => {
    setPage(1)
  }, [searchQuery])

  useEffect(() => {
    const retryFailedLoad = () => {
      if (!hasRetryableError) return
      clearScheduledRetry()
      fetchCarsRef.current?.({ retryAttempt: 0, settleMs: 0 })
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      retryFailedLoad()
    }

    window.addEventListener('online', retryFailedLoad)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('online', retryFailedLoad)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [hasRetryableError, clearScheduledRetry])

  useEffect(() => {
    const sentinel = autoLoadSentinelRef.current
    if (!sentinel || !canAutoLoadMore) return undefined

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (!entry?.isIntersecting) return
      triggerAutoLoadNextPage()
    }, {
      rootMargin: '240px 0px',
    })

    observer.observe(sentinel)

    return () => observer.disconnect()
  }, [canAutoLoadMore, triggerAutoLoadNextPage])

  useEffect(() => {
    if (!canAutoLoadMore) return undefined

    const maybeAutoLoadOnScroll = () => {
      if (autoLoadLockRef.current) return
      const doc = document.documentElement
      const scrollTop = window.scrollY || doc.scrollTop || 0
      const viewportBottom = scrollTop + window.innerHeight
      const thresholdPoint = Math.max(0, doc.scrollHeight - CATALOG_SCROLL_AUTOLOAD_THRESHOLD_PX)
      if (viewportBottom < thresholdPoint) return
      triggerAutoLoadNextPage()
    }

    maybeAutoLoadOnScroll()
    window.addEventListener('scroll', maybeAutoLoadOnScroll, { passive: true })
    window.addEventListener('resize', maybeAutoLoadOnScroll)

    return () => {
      window.removeEventListener('scroll', maybeAutoLoadOnScroll)
      window.removeEventListener('resize', maybeAutoLoadOnScroll)
    }
  }, [canAutoLoadMore, triggerAutoLoadNextPage])

  useEffect(() => {
    if (!sortOpen) return undefined

    const handlePointerDown = (event) => {
      if (sortRef.current && !sortRef.current.contains(event.target)) {
        setSortOpen(false)
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setSortOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [sortOpen])

  const clearSearch = () => {
    navigate(section.path, { replace: true })
  }

  const pageRangeLabel = visiblePageStart === visiblePageEnd
    ? String(visiblePageStart)
    : `${visiblePageStart}-${visiblePageEnd}`

  const goToNextPageChunk = () => {
    setPage(Math.min(meta.pages, visiblePageEnd + 1))
  }

  const goToPreviousPageChunk = () => {
    setPage(Math.max(1, visiblePageStart - CATALOG_AUTOLOAD_MAX_PAGES))
  }

  return (
    <div className={`catalog-page catalog-page-${section.heroTone || 'main'}`}>
      <div className="cat-breadcrumb">
        <div className="cat-breadcrumb-inner">
          <Link to="/" className="cat-bc-link"><HomeIcon /> Главная</Link>
          <span className="cat-bc-sep"><ChevronRightIcon /></span>
          <span className="cat-bc-current">{section.breadcrumbLabel}</span>
        </div>
      </div>

      <div className="cat-layout">
        <aside className={`cat-sidebar${sidebarOpen ? ' cat-sidebar-open' : ''}`}>
          <FilterSidebar
            filters={filters}
            catalogCars={cars}
            listingType={section.listingType}
            onFiltersChange={setFilters}
            onClose={() => setSidebarOpen(false)}
          />
        </aside>


        {sidebarOpen && <div className="cat-sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

        <main className="cat-main">
          <div className="cat-filter-toolbar">
            <button className="cat-filter-btn" onClick={() => setSidebarOpen(true)}>
              <FilterIcon /> {'\u0424\u0438\u043b\u044c\u0442\u0440\u044b'}
            </button>
            <div className="cat-quick-filter-group" aria-label={'\u0411\u044b\u0441\u0442\u0440\u044b\u0435 \u0444\u0438\u043b\u044c\u0442\u0440\u044b \u043a\u0430\u0442\u0430\u043b\u043e\u0433\u0430'}>
              <button
                type="button"
                className={`cat-quick-filter-btn cat-quick-filter-btn-all${isAllCarsQuickFilterActive ? ' is-active' : ''}`}
                onClick={() => applyQuickOriginFilter('all')}
              >
                {'\u0412\u0441\u0435 \u043c\u0430\u0448\u0438\u043d\u044b'}
              </button>
              <button
                type="button"
                className={`cat-quick-filter-btn${isKoreanQuickFilterActive ? ' is-active is-clearable' : ''}`}
                onClick={() => applyQuickOriginFilter(isKoreanQuickFilterActive ? 'all' : 'korean')}
              >
                <span>{'\u041a\u043e\u0440\u0435\u0439\u0446\u044b'}</span>
                {isKoreanQuickFilterActive ? <span className="cat-quick-filter-clear" aria-hidden="true">{'\u274c'}</span> : null}
              </button>
              <button
                type="button"
                className={`cat-quick-filter-btn${isImportedQuickFilterActive ? ' is-active is-clearable' : ''}`}
                onClick={() => applyQuickOriginFilter(isImportedQuickFilterActive ? 'all' : 'imported')}
              >
                <span>{'\u0418\u043c\u043f\u043e\u0440\u0442'}</span>
                {isImportedQuickFilterActive ? <span className="cat-quick-filter-clear" aria-hidden="true">{'\u274c'}</span> : null}
              </button>
            </div>
          </div>

          <div className="cat-top-btns">
              <a href="https://www.encar.com" target="_blank" rel="noreferrer" className="btn-encar btn-encar-primary">
                <EncarIcon /> Encar
              </a>
            <a href="https://chat.whatsapp.com/CVUnqkak74z1cBipvF4Vea?mode=gi_t" target="_blank" rel="noreferrer" className="btn-wa-group">
              <WaGroupIcon /> WhatsApp группы
            </a>
          </div>

          {introContent}
          <h1 className="cat-title">{section.title}</h1>
          <p className="cat-subtitle">{section.subtitle}</p>

          {hasSearchQuery && (
            <div className="cat-search-summary">
              <div className="cat-search-summary-main">
                <span className="cat-search-summary-icon" aria-hidden="true">
                  <SearchIcon />
                </span>
                <div className="cat-search-summary-copy">
                  <div className="cat-search-summary-label">Поиск: &quot;{searchQuery}&quot;</div>
                </div>
              </div>
              <button type="button" className="cat-search-summary-clear" onClick={clearSearch}>
                Очистить
              </button>
            </div>
          )}

          <div className="cat-results-bar">
            <div>
              <div className="cat-results-heading">{section.resultsHeading}</div>
              <div className="cat-results-count">
                {loading && cars.length === 0
                  ? 'Загрузка...'
                  : `Найдено: ${meta.total.toLocaleString()} • Стр. ${pageRangeLabel} из ${meta.pages}`}
              </div>
            </div>
            <div className="cat-results-actions">
              <DeliveryCountrySelect compact label="Страна доставки" />
              <div className={`cat-sort-wrap${sortOpen ? ' is-open' : ''}`} ref={sortRef}>
                <button
                  type="button"
                  className="cat-sort-trigger"
                  aria-haspopup="listbox"
                  aria-expanded={sortOpen}
                  onClick={() => setSortOpen((open) => !open)}
                >
                  <span className="cat-sort-trigger-label">{activeSortOption.label}</span>
                  <span className="cat-sort-trigger-icon" aria-hidden="true"><ChevronDownIcon /></span>
                </button>
                {sortOpen && (
                  <div className="cat-sort-menu" role="listbox" aria-label="Сортировка">
                    {SORT_OPTIONS.map((option) => {
                      const isActive = option.value === sort
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          className={`cat-sort-option${isActive ? ' is-active' : ''}`}
                          onClick={() => {
                            setSort(option.value)
                            setPage(1)
                            setSortOpen(false)
                          }}
                        >
                          <span className="cat-sort-option-check" aria-hidden="true">
                            {isActive ? <CheckIcon /> : null}
                          </span>
                          <span className="cat-sort-option-label">{option.label}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {isRefreshing && cars.length > 0 && (
            <div className="cat-refreshing">
              <div className="cat-refreshing-spinner" />
              <span>Обновляем результаты...</span>
            </div>
          )}

          {error && (
            <div className="cat-error">
              ⚠️ {error} — <button onClick={() => fetchCars({ retryAttempt: 0, settleMs: 0 })}>Повторить</button>
            </div>
          )}

          {loading && cars.length === 0 ? (
            <div className="cat-loading">
              <div className="cat-loading-spinner" />
              <span>{section.loadingMessage}</span>
            </div>
          ) : (
            <>
              <div className="cars-list">
                {cars.length === 0
                  ? <div className="cat-empty">{section.emptyMessage}</div>
                  : cars.map((car) => (
                    <CarCard
                      key={car.id}
                      car={car}
                      detailsHref={buildCarDetailsPath(section, car.id)}
                      listingBadgeLabel={section.cardBadgeLabel}
                    />
                  ))}
              </div>

              {(canAutoLoadMore || isAutoLoadingMore) && (
                <div ref={autoLoadSentinelRef} className="cat-autoload-status" aria-live="polite">
                  <div className="cat-autoload-spinner" />
                  <span>{isAutoLoadingMore ? 'Загружаем ещё автомобили...' : 'Прокрутите ниже, чтобы подгрузить ещё машины'}</span>
                </div>
              )}

              {meta.pages > 1 && (
                <div className="cat-pagination">
                  <button className="cat-page-btn" disabled={visiblePageStart <= 1} onClick={goToPreviousPageChunk}>← Назад</button>
                  <span className="cat-page-info">Стр. {pageRangeLabel} / {meta.pages}</span>
                  <button className="cat-page-btn" disabled={visiblePageEnd >= meta.pages} onClick={goToNextPageChunk}>Вперёд →</button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import FilterSidebar from '../components/catalog/FilterSidebar'
import CarCard from '../components/catalog/CarCard'
import {
  appendDisplayTrimSuffix,
  extractTrimLabelFromTitle,
  VAT_REFUND_RATE,
  getShortLocationLabel,
  isWeakBodyTypeLabel,
  isWeakColorValue,
  normalizeColorLabel as normalizeVehicleColorLabel,
  normalizeInteriorColorLabel,
  normalizeKeyInfoLabel,
  normalizeTrimLabel,
  resolveDisplayBodyTypeLabel,
  stripTrailingTrimLabel,
} from '../lib/vehicleDisplay'

const HANGUL_RE = /[\uAC00-\uD7A3]/u
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

  if (low.includes('awd')) return 'Полный (AWD)'
  if (low.includes('4wd')) return 'Полный (4WD)'
  if (low.includes('rwd') || low.includes('задн')) return 'Задний (RWD)'
  if (low.includes('2wd') || low.includes('fwd') || low.includes('передн')) return 'Передний (FWD)'

  return ''
}

function inferDriveType(...values) {
  for (const value of values) {
    const normalized = normalizeDriveLabel(value)
    if (normalized) return normalized
  }
  return ''
}

function normalizeBodyTypeLabel(value) {
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

function normalizeDisplacementValue(value) {
  const num = Number(value) || 0
  if (num >= 800) return Number((num / 1000).toFixed(1))
  if (num >= 0.8 && num <= 8.0) return Number(num.toFixed(1))
  return 0
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

function buildCarUpdatePatch(prevCar, nextCar) {
  const patch = {}

  if (nextCar.name && nextCar.name !== prevCar.name) patch.name = nextCar.name
  if (nextCar.model && nextCar.model !== prevCar.model) patch.model = nextCar.model
  if (nextCar.transmission && nextCar.transmission !== prevCar.transmission) patch.transmission = nextCar.transmission
  if (nextCar.driveType && nextCar.driveType !== prevCar.driveType) patch.drive_type = nextCar.driveType
  if (nextCar.bodyType && nextCar.bodyType !== (prevCar.rawBodyType || prevCar.bodyType)) patch.body_type = nextCar.bodyType
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

  const prevImages = normalizeImages(prevCar.images)
  const nextImages = normalizeImages(nextCar.images)
  if (JSON.stringify(nextImages) !== JSON.stringify(prevImages)) patch.images = nextImages

  return patch
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
  return (
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
      const res = await fetch(`/api/encar/${encodeURIComponent(key)}`)
      if (!res.ok) return null
      const detail = await res.json()
      const detailTrim = normalizeTrimLabel(detail?.trim_level || '') || extractTrimLabelFromTitle(detail?.name || '', detail?.model || '')
      const normalized = {
        images: normalizeImages(detail?.photos?.length ? detail.photos : detail?.images),
        name: appendDisplayTrimSuffix(stripTrailingTrimLabel(normalizeVehicleTitle(detail?.name || ''), detailTrim), detailTrim),
        model: appendDisplayTrimSuffix(stripTrailingTrimLabel(normalizeVehicleTitle(detail?.model || ''), detailTrim), detailTrim),
        fuelType: normalizeTagLabel(detail?.fuel_type || ''),
        transmission: normalizeTagLabel(detail?.transmission || ''),
        driveType: normalizeDriveLabel(detail?.drive_type || ''),
        bodyType: resolveDisplayBodyTypeLabel(detail?.body_type || '', detail?.name || '', detail?.model || ''),
        trimLevel: detailTrim,
        keyInfo: normalizeKeyInfoLabel(detail?.key_info || ''),
        displacement: Number(detail?.displacement) || 0,
        bodyColor: normalizeColorLabel(detail?.body_color || ''),
        interiorColor: normalizeInteriorColorLabel(detail?.interior_color || '', detail?.body_color || ''),
        location: getShortLocationLabel(detail?.location_short || detail?.location || ''),
        vin: String(detail?.vin || detail?.vehicle_no || '').trim(),
        flags: detail?.flags || {},
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
const SortIcon = () => (
  <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
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
    rawBodyType: String(c.body_type || '').trim(),
    trimLevel,
    keyInfo: normalizeKeyInfoLabel(c.key_info || ''),
    displacement,
    engineVolume,
    bodyColor: normalizeColorLabel(c.body_color || '-'),
    bodyColorDots: c.body_color_dots || [],
    interiorColor: normalizeInteriorColorLabel(c.interior_color || '', c.body_color || ''),
    interiorColorDots: c.interior_color_dots || [],
    location: normalizedLocation || '\u041a\u043e\u0440\u0435\u044f',
    vin: String(c.vin || c.vehicle_no || '').trim() || '-',
    priceKRW: Number(c.price_krw) || 0,
    priceUSD,
    commission,
    delivery,
    loading,
    unloading,
    storage,
    vatRefund,
    total,
    encarUrl: c.encar_url,
    encarId: c.encar_id || '-',
    canNegotiate: c.can_negotiate,
    imageCount: images.length || 1,
    images,
    detailFlags: {},
    inspectionFormats: [],
  }
}

export default function CatalogPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sort, setSort] = useState('newest')
  const [cars, setCars] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [meta, setMeta] = useState({ total: 0, page: 1, pages: 1 })
  const [filters, setFilters] = useState({})
  const [page, setPage] = useState(1)
  const location = useLocation()
  const searchQuery = new URLSearchParams(location.search).get('q')?.trim() || ''

  const fetchCarsFallback = useCallback(async () => {
    const params = new URLSearchParams({ sort, page: 1, limit: 1000, ...filters })
    const res = await fetch(`/api/cars?${params}`)
    if (!res.ok) throw new Error('Search fallback failed')
    const data = await res.json()
    const mappedCars = data.cars.map(mapCar)
    const filteredCars = mappedCars.filter((car) => carMatchesSearch(car, searchQuery))
    setCars(filteredCars)
    setMeta({ total: filteredCars.length, page: 1, pages: 1 })
    setError(filteredCars.length ? null : 'Ничего не найдено')
  }, [sort, filters, searchQuery])

  const fetchCars = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ sort, page, limit: 20, ...filters })
      if (searchQuery) params.set('q', searchQuery)
      const res = await fetch(`/api/cars?${params}`)
      if (!res.ok) {
        if (searchQuery) {
          await fetchCarsFallback()
          return
        }
        throw new Error('Ошибка загрузки')
      }
      const data = await res.json()

      const mappedCars = data.cars.map(mapCar)
      if (searchQuery && data.total === 0) {
        await fetchCarsFallback()
        return
      }
      setCars(mappedCars)
      setMeta({ total: data.total, page: data.page, pages: data.pages })

      const missingDataCars = mappedCars.filter(needsEncarEnrichment)
      if (missingDataCars.length) {
        const patchesToPersist = []
        const enrichedCars = await Promise.all(
          mappedCars.map(async (car) => {
            if (!needsEncarEnrichment(car)) return car

            const detail = await fetchEncarDetail(car.encarId)
            if (!detail) return car

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
            if (shouldReplaceText(car.vin) && detail.vin) next.vin = detail.vin
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

        setCars((prev) => {
          const prevIds = prev.map((c) => c.id).join(',')
          const enrichedIds = enrichedCars.map((c) => c.id).join(',')
          if (prevIds !== enrichedIds) return prev
          return enrichedCars
        })

        if (patchesToPersist.length) {
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
      }
    } catch (e) {
      if (searchQuery) {
        try {
          await fetchCarsFallback()
          return
        } catch {
          setError(e.message)
        }
      } else {
        setError(e.message)
      }
    } finally {
      setLoading(false)
    }
  }, [sort, page, filters, searchQuery, fetchCarsFallback])

  useEffect(() => {
    fetchCars()
  }, [fetchCars])

  useEffect(() => {
    setPage(1)
  }, [searchQuery])

  return (
    <div className="catalog-page">
      <div className="cat-breadcrumb">
        <div className="cat-breadcrumb-inner">
          <Link to="/" className="cat-bc-link"><HomeIcon /> Главная</Link>
          <span className="cat-bc-sep"><ChevronRightIcon /></span>
          <span className="cat-bc-current">Каталог</span>
        </div>
      </div>

      <div className="cat-layout">
        <aside className={`cat-sidebar${sidebarOpen ? ' cat-sidebar-open' : ''}`}>
          <FilterSidebar
            filters={filters}
            catalogCars={cars}
            onFiltersChange={(f) => { setFilters(f); setPage(1) }}
            onClose={() => setSidebarOpen(false)}
          />
        </aside>

        {sidebarOpen && <div className="cat-sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

        <main className="cat-main">
          <button className="cat-filter-btn" onClick={() => setSidebarOpen(true)}>
            <FilterIcon /> Фильтры
          </button>

          <div className="cat-top-btns">
            <a href="https://www.encar.com" target="_blank" rel="noreferrer" className="btn-encar">
              <EncarIcon /> Encar
            </a>
            <a href="https://chat.whatsapp.com/KYOi5t749ZT16iyqAzbkSd" target="_blank" rel="noreferrer" className="btn-wa-group">
              <WaGroupIcon /> WhatsApp группы
            </a>
          </div>

          <h1 className="cat-title">Каталог автомобилей — Корея</h1>
          <p className="cat-subtitle">Список машин с Encar (переводы ru/en/ko)</p>

          <div className="cat-results-bar">
            <div>
              <div className="cat-results-heading">Доступные автомобили</div>
              <div className="cat-results-count">
                {loading ? 'Загрузка...' : `Найдено: ${meta.total.toLocaleString()} • Стр. ${meta.page} из ${meta.pages}`}
              </div>
            </div>
            <div className="cat-sort-wrap">
              <SortIcon />
              <select className="cat-sort" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1) }}>
                <option value="newest">Новые объявления</option>
                <option value="price_asc">Цена ↑</option>
                <option value="price_desc">Цена ↓</option>
                <option value="mileage">Пробег ↑</option>
                <option value="year_desc">Год ↓</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="cat-error">
              ⚠️ {error} — <button onClick={fetchCars}>Повторить</button>
            </div>
          )}

          {loading ? (
            <div className="cat-loading">
              <div className="cat-loading-spinner" />
              <span>Загрузка автомобилей...</span>
            </div>
          ) : (
            <>
              <div className="cars-list">
                {cars.length === 0
                  ? <div className="cat-empty">Автомобили не найдены. Измените фильтры.</div>
                  : cars.map((car) => <CarCard key={car.id} car={car} />)}
              </div>

              {meta.pages > 1 && (
                <div className="cat-pagination">
                  <button className="cat-page-btn" disabled={meta.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Назад</button>
                  <span className="cat-page-info">Стр. {meta.page} / {meta.pages}</span>
                  <button className="cat-page-btn" disabled={meta.page >= meta.pages} onClick={() => setPage((p) => Math.min(meta.pages, p + 1))}>Вперёд →</button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}


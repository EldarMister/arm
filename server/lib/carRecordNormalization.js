import { applyTrimFixes, applyVehicleTitleFixes } from '../../shared/vehicleTextFixes.js'
import {
  extractTrimLevelFromTitle,
  inferDrive,
  normalizeColorName,
  normalizeDrive,
  normalizeFuel,
  normalizeInteriorColorName,
  normalizeLocationName,
  normalizeText,
  normalizeTransmission,
  resolveBodyType,
  resolveVehicleClass,
  normalizeTrimLevel,
} from './vehicleData.js'
import { normalizeCarIdentityFields } from './carIdentityNormalization.js'
import { BODY_TYPE_LABELS } from '../../shared/vehicleTaxonomy.js'

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
  { pattern: /\bKia\s+RAY\b/i, body: BODY_TYPE_LABELS.minivan },
  { pattern: /\bKia\s+Morning\b/i, body: BODY_TYPE_LABELS.hatchback },
  { pattern: /\bChevrolet\s+Spark\b/i, body: BODY_TYPE_LABELS.hatchback },
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
  { pattern: /\bKia\s+Soul\s+Booster\b/i, body: BODY_TYPE_LABELS.suv },
  { pattern: /\bKia\s+EV6\b/i, body: BODY_TYPE_LABELS.suv },
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
const HYBRID_FUEL_HINT_RE = /(?:\b(?:hybrid|hev|phev)\b|\uD558\uC774\uBE0C\uB9AC\uB4DC)/i
const CANONICAL_FUEL_TYPES = new Set(['Бензин', 'Дизель', 'Гибрид', 'Электро', 'Газ (LPG)'])
const CANONICAL_TRANSMISSION_TYPES = new Set(['Автомат', 'Механика', 'Робот', 'CVT'])
const CANONICAL_DRIVE_TYPES = new Set(['Передний (FWD)', 'Задний (RWD)', 'Полный (AWD)', 'Полный (4WD)'])
const CANONICAL_TAG_VALUES = new Set([
  ...CANONICAL_FUEL_TYPES,
  ...CANONICAL_TRANSMISSION_TYPES,
  ...CANONICAL_DRIVE_TYPES,
])

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text))
}

function applyBodyTypeOverrides(bodyType, context) {
  const text = String(context || '').trim()
  if (!text) return bodyType

  const isExecutive = matchesAny(text, EXECUTIVE_SEDAN_MODEL_RE)
  const isBusiness = matchesAny(text, BUSINESS_SEDAN_MODEL_RE)
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

function normalizeNullableText(value, normalizer) {
  if (value === undefined) return undefined
  if (value === null) return null
  return normalizer(value)
}

function resolveFuelType(value, ...contextValues) {
  const normalized = normalizeFuel(value)
  const context = [value, ...contextValues]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join(' ')

  if (HYBRID_FUEL_HINT_RE.test(context)) return 'Гибрид'
  return normalized
}

function rebuildNormalizedTags(tags, { drive_type, transmission, fuel_type }) {
  const preserved = Array.isArray(tags)
    ? tags
      .map((tag) => String(tag || '').trim())
      .filter(Boolean)
      .filter((tag) => {
        if (CANONICAL_TAG_VALUES.has(tag)) return false

        const normalizedFuelTag = normalizeFuel(tag)
        if (CANONICAL_FUEL_TYPES.has(normalizedFuelTag)) return false

        const normalizedTransmissionTag = normalizeTransmission(tag)
        if (CANONICAL_TRANSMISSION_TYPES.has(normalizedTransmissionTag)) return false

        const normalizedDriveTag = normalizeDrive(tag)
        if (CANONICAL_DRIVE_TYPES.has(normalizedDriveTag)) return false

        if (HYBRID_FUEL_HINT_RE.test(tag)) return false
        if (/(?:электро|electric|бензин|gasoline|дизель|diesel|газ|lpg)/i.test(tag)) return false

        return true
      })
    : []

  const next = []
  for (const value of [drive_type, transmission, fuel_type]) {
    const text = String(value || '').trim()
    if (!text || next.includes(text)) continue
    next.push(text)
  }

  for (const tag of preserved) {
    if (!next.includes(tag)) next.push(tag)
  }

  return next
}

export function normalizeCarTextFields(input = {}) {
  const normalizedName = normalizeNullableText(input.name, (value) => applyVehicleTitleFixes(normalizeText(value)))
  const normalizedModel = normalizeNullableText(input.model, (value) => applyVehicleTitleFixes(normalizeText(value)))
  const bodyColor = normalizeNullableText(input.body_color, (value) => normalizeColorName(value))
  const bodyColorForInterior = bodyColor === undefined ? (input.body_color ?? '') : (bodyColor ?? '')
  const normalizedTransmission = normalizeNullableText(input.transmission, (value) => normalizeTransmission(value))
  const rawTrimValue = input.trim_level
  const normalizedDirectTrim =
    (rawTrimValue === undefined || rawTrimValue === null
      ? ''
      : normalizeTrimLevel(rawTrimValue) || applyTrimFixes(rawTrimValue))
  const derivedTrim =
    extractTrimLevelFromTitle(
      normalizedName ?? input.name,
      normalizedModel ?? input.model,
      input.name,
      input.model,
    )
  const trimCandidate = normalizedDirectTrim || derivedTrim
  const normalizedTrim = trimCandidate || (rawTrimValue === null ? null : rawTrimValue === undefined ? undefined : '')
  const driveSource = input.drive_type
  const normalizedDriveValue = driveSource === undefined
    ? undefined
    : (normalizeDrive(driveSource) || inferDrive(
      driveSource,
      normalizedTrim ?? rawTrimValue ?? '',
      normalizedName ?? input.name ?? '',
      normalizedModel ?? input.model ?? '',
      input.tags ?? [],
    ))
  const identityNormalized = normalizeCarIdentityFields({
    name: normalizedName,
    model: normalizedModel,
    trim_level: normalizedTrim,
    drive_type: normalizedDriveValue,
  })
  const finalName = identityNormalized.name ?? normalizedName
  const finalModel = identityNormalized.model ?? normalizedModel
  const finalTrim = identityNormalized.trim_level ?? normalizedTrim
  const finalDrive = identityNormalized.drive_type === undefined ? normalizedDriveValue : identityNormalized.drive_type
  const normalizedFuelValue = normalizeNullableText(
    input.fuel_type,
    (value) => resolveFuelType(
      value,
      finalName ?? input.name ?? '',
      finalModel ?? input.model ?? '',
      finalTrim ?? rawTrimValue ?? '',
      input.name ?? '',
      input.model ?? '',
      rawTrimValue ?? '',
    ),
  )
  let normalizedBodyType = resolveBodyType(
    input.body_type ?? '',
    finalName ?? input.name ?? '',
    finalModel ?? input.model ?? '',
    finalTrim ?? rawTrimValue ?? '',
    input.name ?? '',
    input.model ?? '',
  )
  normalizedBodyType = applyBodyTypeOverrides(
    normalizedBodyType,
    [finalName ?? input.name ?? '', finalModel ?? input.model ?? '', finalTrim ?? rawTrimValue ?? ''].join(' ')
  )
  const normalizedVehicleClass = resolveVehicleClass(
    input.vehicle_class ?? '',
    normalizedBodyType || input.body_type || '',
    finalName ?? input.name ?? '',
    finalModel ?? input.model ?? '',
    finalTrim ?? rawTrimValue ?? '',
    input.name ?? '',
    input.model ?? '',
  )
  const shouldNormalizeTags =
    input.tags !== undefined ||
    input.drive_type !== undefined ||
    input.transmission !== undefined ||
    input.fuel_type !== undefined
  const normalizedTags = !shouldNormalizeTags
    ? undefined
    : rebuildNormalizedTags(input.tags, {
      drive_type: finalDrive,
      transmission: normalizedTransmission ?? input.transmission ?? '',
      fuel_type: normalizedFuelValue ?? input.fuel_type ?? '',
    })

  return {
    name: finalName,
    model: finalModel,
    drive_type: finalDrive,
    fuel_type: normalizedFuelValue,
    body_type: normalizedBodyType,
    vehicle_class: normalizedVehicleClass,
    trim_level: finalTrim,
    body_color: bodyColor,
    interior_color: normalizeNullableText(input.interior_color, (value) => normalizeInteriorColorName(value, bodyColorForInterior, { allowBodyDuplicate: true })),
    location: normalizeNullableText(input.location, (value) => normalizeLocationName(value)),
    tags: normalizedTags,
  }
}

export function diffNormalizedCarTextFields(input = {}) {
  const normalized = normalizeCarTextFields(input)
  const changes = {}

  for (const [field, after] of Object.entries(normalized)) {
    if (after === undefined) continue

    const before = input[field]
    if (Array.isArray(before) || Array.isArray(after)) {
      if (JSON.stringify(before ?? null) === JSON.stringify(after ?? null)) continue
    } else if (before === after) {
      continue
    }

    changes[field] = { before, after }
  }

  return {
    normalized,
    changes,
    changedFields: Object.keys(changes),
  }
}

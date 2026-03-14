import { normalizeDrive } from './vehicleData.js'

const CANONICAL_DRIVE_TYPES = new Set([
  'Передний (FWD)',
  'Задний (RWD)',
  'Полный (AWD)',
  'Полный (4WD)',
])

const SAFE_WORD_REPLACEMENTS = Object.freeze([
  [/\bMaibaheu\b/gi, 'Maybach'],
  [/\bAekseolreonseu\b/gi, 'Excellence'],
  [/\bEodeubaentiji\b/gi, 'Advantage'],
  [/\bPaekiji\b/gi, 'Package'],
  [/\bPeulraedeu\b/gi, 'Plaid'],
  [/\bObeoraendeu\b/gi, 'Overland'],
  [/\bPawo\b/gi, 'Power'],
  [/\bRonjityudeu\b/gi, 'Longitude'],
  [/\bKeonbeoteobeul\b/gi, 'Convertible'],
  [/\bHaechibaek\b/gi, 'Hatchback'],
  [/\bKabeuriolre\b/gi, 'Cabriolet'],
  [/\bReibeul\b/gi, 'Label'],
  [/\bRijeobeu\b/gi, 'Reserve'],
  [/\bGeuraebiti\b/gi, 'Gravity'],
  [/\bRedeurain\b/gi, 'Redline'],
  [/\bKeuroseu\b/gi, 'Cross'],
  [/\bAltityudeu\b/gi, 'Altitude'],
  [/\bGeuranrusso\b/gi, 'GranLusso'],
  [/\bBeiseu\b/gi, 'Base'],
  [/\bReonchi\b/gi, 'Launch'],
  [/\bKweseuteu\b/gi, 'Quest'],
  [/\bBijeuniseu\b/gi, 'Business'],
  [/\bEeo\b/gi, 'Air'],
  [/\bUlteura\b/gi, 'Ultra'],
  [/\bDakeu\b/gi, 'Dark'],
  [/\bDyueolmoteo\b/gi, 'Dual Motor'],
  [/\bSinggeulmoteo\b/gi, 'Single Motor'],
  [/\bAuteo\b/gi, 'Outer'],
  [/\bBaengkeuseu\b/gi, 'Banks'],
  [/\bEkobuseuteu\b/gi, 'EcoBoost'],
  [/\bKarera\b/gi, 'Carrera'],
  [/\bNobleless\b/gi, 'Noblesse'],
  [/\bManupaktueo\b/gi, 'MANUFAKTUR'],
])

const EXPLICIT_NAME_RULES = Object.freeze([
  {
    test: /\bPeugeot\s+3008\b.*\b1\.2\b.*\bPure\s*Tech\b.*\bAlrwireu\b/i,
    replacements: [[/\bAlrwireu\b/gi, 'Allure']],
  },
  {
    test: /\bBentley\s+Continental\b.*\b4\.0\b.*\bGT\b.*\bAjureu\b/i,
    replacements: [[/\bAjureu\b/gi, 'Azure']],
  },
  {
    test: /\bFord\s+Mondeo\b.*\b2\.0\b.*\bTeurendeu\b/i,
    replacements: [[/\bTeurendeu\b/gi, 'Trend']],
  },
  {
    test: /\bMaserati\s+Levante\b.*\b3\.0\b.*\bAWD\b.*\bGeuranSports\b/i,
    replacements: [[/\bGeuranSports\b/gi, 'GranSport']],
  },
  {
    test: /\bAstonmartin\s+Vantage\b.*\b4\.0\b.*\bV8\b.*\bRodeuseuteo\b/i,
    replacements: [
      [/\bAstonmartin\b/gi, 'Aston Martin'],
      [/\bRodeuseuteo\b/gi, 'Roadster'],
    ],
  },
  {
    test: /\bMercedes[-\s]?Benz\s+AMG\s+GT\b.*\b4\.0\b.*\bC\b.*\bRodeuseuteo\b/i,
    replacements: [[/\bRodeuseuteo\b/gi, 'Roadster']],
  },
  {
    test: /\bAudi\s+RS6\b.*\b4\.0\b.*\bTFSI\b.*\bquattro\b.*\bAbanteu\b.*\bPerformance\b/i,
    replacements: [[/\bAbanteu\b/gi, 'Avant']],
  },
  {
    test: /\bHyundai\s+Venue\b.*\b1\.6\b.*\bPeulreokseu\b/i,
    replacements: [[/\bPeulreokseu\b/gi, 'Flux']],
  },
  {
    test: /\bChevrolet\s+Colorado\b.*\b3\.6\b.*\bIkseuteurim-X\b.*\b4WD\b/i,
    replacements: [[/\bIkseuteurim-X\b/gi, 'Extreme-X']],
  },
  {
    test: /\bChevrolet\s+Colorado\b.*\b3\.6\b.*\bIkseuteurim\b.*\b4WD\b/i,
    replacements: [[/\bIkseuteurim\b/gi, 'Extreme']],
  },
])

const BRAND_RULES = Object.freeze([
  {
    brand: 'Honda',
    matcher: /\bHonda\b/i,
    replacements: [
      [/\bTueoring\b/gi, 'Touring'],
    ],
  },
  {
    brand: 'BMW',
    matcher: /\bBMW\b/i,
    replacements: [
      [/\bTueoring\b/gi, 'Touring'],
      [/\bOnrain\b/gi, 'Online'],
      [/\bxDrive\s+(\d{2,3}[A-Za-z]?)\b/g, 'xDrive$1'],
    ],
  },
  {
    brand: 'Chevrolet',
    matcher: /\bChevrolet\b/i,
    replacements: [
      [/\bPeurimi(?:eo|o)\b/gi, 'Premiere'],
    ],
  },
  {
    brand: 'Hyundai',
    matcher: /\bHyundai\b/i,
    replacements: [
      [/\bSantafe\b/gi, 'Santa Fe'],
    ],
  },
  {
    brand: 'Kia',
    matcher: /\bKia\b/i,
    replacements: [],
  },
  {
    brand: 'Polestar',
    matcher: /\bPolestar\b/i,
    replacements: [
      [/\bPolestar\s+Polestar\b/gi, 'Polestar'],
    ],
  },
])

const HONDA_ACCORD_HYBRID_TOURING_RE = /\bAccord\b.*\bHybrid\b.*\bTouring\b|\bTouring\b.*\bHybrid\b.*\bAccord\b/i
const HONDA_CRV_RE = /\bCR[\s-]?V\b/i
const HONDA_CRV_2WD_RE = /\b2WD\b/i
const BMW_IX3_RE = /\biX3\b/i
const KIA_CARNIVAL_RE = /\bCarnival\b/i
const KIA_CARNIVAL_FWD_HINT_RE = /\b(?:Gasoline|HEV|Signature|Noblesse|Prestige|Luxury|Gravity)\b|\bX\s*Line\b|\bHi[-\s]*Limousine\b|\b(?:4|7|9|11)\s*seats?\b/i
const HYUNDAI_INSPIRATION_RE = /\bInspiration\b/i
const HYUNDAI_INSPIRE_RE = /\bInspire\b/gi
const EXPLICIT_AWD_RE = /\bAWD\b|\bxDrive\b|\bquattro\b|\b4MATIC(?:\+)?\b/i
const EXPLICIT_4WD_RE = /\b4WD\b/i
const EXPLICIT_2WD_RE = /\b2WD\b/i
const IDENTITY_2WD_DRIVE_RULES = Object.freeze([
  { matcher: /\bHonda\b.*\bAccord\b/i, drive: 'Передний (FWD)' },
  { matcher: /\bHonda\b.*\bCR[\s-]?V\b/i, drive: 'Передний (FWD)' },
  { matcher: /\bToyota\b.*\bRAV4\b/i, drive: 'Передний (FWD)' },
  { matcher: /\bToyota\b.*\bSienna\b/i, drive: 'Передний (FWD)' },
  { matcher: /\bLexus\b.*\bUX\b/i, drive: 'Передний (FWD)' },
  { matcher: /\bKia\b.*\bCarnival\b/i, drive: 'Передний (FWD)' },
  { matcher: /\bKia\b.*\bSportage\b/i, drive: 'Передний (FWD)' },
  { matcher: /\bKia\b.*\bNiro\b/i, drive: 'Передний (FWD)' },
  { matcher: /\bKia\b.*\bRAY\b/i, drive: 'Передний (FWD)' },
  { matcher: /\bHyundai\b.*\bTucson\b/i, drive: 'Передний (FWD)' },
  { matcher: /\bGenesis\b.*\bG70\b/i, drive: 'Задний (RWD)' },
  { matcher: /\bGenesis\b.*\bG80\b/i, drive: 'Задний (RWD)' },
  { matcher: /\bGenesis\b.*\bG90\b/i, drive: 'Задний (RWD)' },
  { matcher: /\bGenesis\b.*\bGV70\b/i, drive: 'Задний (RWD)' },
  { matcher: /\bGenesis\b.*\bGV80\b/i, drive: 'Задний (RWD)' },
  { matcher: /\bRenault\s+Samsung\b.*\bQM6\b/i, drive: 'Передний (FWD)' },
  { matcher: /\bRenault\s+Samsung\b.*\bGrand\s+Koleos\b/i, drive: 'Передний (FWD)' },
  { matcher: /\bRenault\s+Samsung\b.*\bArkana\b/i, drive: 'Передний (FWD)' },
  { matcher: /\bRenault\s+Samsung\b.*\bXM3\b/i, drive: 'Передний (FWD)' },
  { matcher: /\bSsangYong\b.*\bTivoli\b/i, drive: 'Передний (FWD)' },
  { matcher: /\bSsangYong\b.*\bKORANDO\b/i, drive: 'Передний (FWD)' },
  { matcher: /\bJeep\b.*\bCherokee\b/i, drive: 'Передний (FWD)' },
  { matcher: /\bJeep\b.*\bCompass\b/i, drive: 'Передний (FWD)' },
  { matcher: /\bChevrolet\b.*\bEquinox\b/i, drive: 'Передний (FWD)' },
  { matcher: /\bChevrolet\b.*\bColorado\b/i, drive: 'Задний (RWD)' },
])

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalizeNullableText(value, normalizer) {
  if (value === undefined) return undefined
  if (value === null) return null
  return normalizer(cleanText(value))
}

function detectBrand(...values) {
  const text = values.map((value) => cleanText(value)).filter(Boolean).join(' ')
  if (!text) return ''

  for (const rule of BRAND_RULES) {
    if (rule.matcher.test(text)) return rule.brand
  }

  return ''
}

function applyBrandReplacements(value, brand) {
  const text = cleanText(value)
  if (!text) return text

  let normalized = SAFE_WORD_REPLACEMENTS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    text,
  )

  if (!brand) return normalized.replace(/\s+/g, ' ').trim()

  const rule = BRAND_RULES.find((entry) => entry.brand === brand)
  if (!rule?.replacements?.length) return normalized.replace(/\s+/g, ' ').trim()

  normalized = rule.replacements.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    normalized,
  )

  return normalized.replace(/\s+/g, ' ').trim()
}

function applyExplicitNameRules(value) {
  let text = cleanText(value)
  if (!text) return text

  for (const rule of EXPLICIT_NAME_RULES) {
    if (!rule.test.test(text)) continue
    for (const [pattern, replacement] of rule.replacements) {
      text = text.replace(pattern, replacement)
    }
    text = text.replace(/\s+/g, ' ').trim()
  }

  return text
}

function resolveMapped2wdDrive(combined) {
  for (const rule of IDENTITY_2WD_DRIVE_RULES) {
    if (rule.matcher.test(combined)) return rule.drive
  }

  return ''
}

function normalizeTrimWithContext(value, brand, name, model) {
  const normalized = applyBrandReplacements(value, brand)
  if (!normalized || brand !== 'Hyundai') return normalized

  const hasInspirationContext = HYUNDAI_INSPIRATION_RE.test(cleanText(name)) || HYUNDAI_INSPIRATION_RE.test(cleanText(model))
  if (!hasInspirationContext) return normalized

  return normalized.replace(HYUNDAI_INSPIRE_RE, 'Inspiration')
}

function resolveIdentityDrive({ brand, name, model, trim_level, drive_type }) {
  const currentDrive = cleanText(drive_type)
  const normalizedCurrentDrive = normalizeDrive(currentDrive)

  const combined = [name, model, trim_level].map((value) => cleanText(value)).filter(Boolean).join(' ')
  if (!combined) return drive_type

  if (EXPLICIT_4WD_RE.test(combined)) {
    return 'Полный (4WD)'
  }

  if (EXPLICIT_AWD_RE.test(combined)) {
    return 'Полный (AWD)'
  }

  if (EXPLICIT_2WD_RE.test(combined)) {
    const mapped2wdDrive = resolveMapped2wdDrive(combined)
    if (mapped2wdDrive) {
      if (!CANONICAL_DRIVE_TYPES.has(currentDrive)) return mapped2wdDrive
      if (currentDrive === 'Полный (AWD)' || currentDrive === 'Полный (4WD)') return mapped2wdDrive
      return currentDrive
    }

    if (CANONICAL_DRIVE_TYPES.has(currentDrive)) return currentDrive
    if (CANONICAL_DRIVE_TYPES.has(normalizedCurrentDrive)) return normalizedCurrentDrive
    return drive_type
  }

  if (CANONICAL_DRIVE_TYPES.has(currentDrive)) return currentDrive
  if (CANONICAL_DRIVE_TYPES.has(normalizedCurrentDrive)) return normalizedCurrentDrive

  if (brand === 'Honda' && HONDA_ACCORD_HYBRID_TOURING_RE.test(combined)) {
    return 'Передний (FWD)'
  }

  if (brand === 'Honda' && HONDA_CRV_RE.test(combined) && HONDA_CRV_2WD_RE.test(combined)) {
    return 'Передний (FWD)'
  }

  if (brand === 'BMW' && BMW_IX3_RE.test(combined)) {
    return 'Задний (RWD)'
  }

  if (brand === 'Kia' && KIA_CARNIVAL_RE.test(combined) && KIA_CARNIVAL_FWD_HINT_RE.test(combined)) {
    return 'Передний (FWD)'
  }

  return drive_type
}

export function normalizeCarIdentityFields(input = {}) {
  const brand = detectBrand(input.name, input.model, input.trim_level)
  const name = normalizeNullableText(input.name, (value) => applyExplicitNameRules(applyBrandReplacements(value, brand)))
  const model = normalizeNullableText(input.model, (value) => applyBrandReplacements(value, brand))
  const trim_level = normalizeNullableText(input.trim_level, (value) => normalizeTrimWithContext(value, brand, name ?? input.name, model ?? input.model))

  return {
    name,
    model,
    trim_level,
    drive_type: resolveIdentityDrive({
      brand,
      name: name ?? input.name,
      model: model ?? input.model,
      trim_level: trim_level ?? input.trim_level,
      drive_type: input.drive_type,
    }),
  }
}

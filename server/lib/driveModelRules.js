import fs from 'node:fs'

const FWD = '\u041f\u0435\u0440\u0435\u0434\u043d\u0438\u0439 (FWD)'
const RWD = '\u0417\u0430\u0434\u043d\u0438\u0439 (RWD)'
const AWD = '\u041f\u043e\u043b\u043d\u044b\u0439 (AWD)'
const WD4 = '\u041f\u043e\u043b\u043d\u044b\u0439 (4WD)'

const RULE_FILE_URL = new URL('../../ТаблицаМашин', import.meta.url)
const SECTION_HEADER_RE = /^(?:таблица|использовать только|модели где|электромобили|дополнительные модели|модель$|привод$|=+|после$|\d+\))/i
const INLINE_RULE_RE = /\s*->\s*/
const MULTIWORD_BRANDS = Object.freeze([
  ['land', 'rover'],
  ['range', 'rover'],
  ['rolls', 'royce'],
  ['mercedes', 'benz'],
  ['mercedes', 'benz'],
  ['renault', 'samsung'],
])

let cachedRules = null

function cleanLine(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function canonicalizeDriveRuleText(value) {
  return cleanLine(
    String(value || '')
      .replace(/[()[\],:+&]/g, ' ')
      .replace(/[/-]+/g, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' '),
  ).toLowerCase()
}

function normalizeDriveLabel(value) {
  const text = canonicalizeDriveRuleText(value)
  if (!text) return ''
  if (/\b(?:4wd|4x4)\b/.test(text)) return WD4
  if (/\bawd\b/.test(text)) return AWD
  if (/\brwd\b/.test(text)) return RWD
  if (/\bfwd\b/.test(text)) return FWD
  return ''
}

function getBrandPrefix(modelText) {
  const normalized = canonicalizeDriveRuleText(modelText)
  const tokens = normalized.split(' ').filter(Boolean)
  if (!tokens.length) return ''

  for (const brand of MULTIWORD_BRANDS) {
    if (brand.every((token, index) => tokens[index] === token)) {
      return brand.join(' ')
    }
  }

  return tokens[0]
}

function getTrimPrefix(modelText) {
  const normalized = canonicalizeDriveRuleText(modelText)
  const tokens = normalized.split(' ').filter(Boolean)
  if (tokens.length <= 1) return normalized
  return tokens.slice(0, -1).join(' ')
}

function expandRuleVariants(modelText) {
  const raw = cleanLine(modelText)
  if (!raw.includes('/')) return [raw]

  const parts = raw.split(/\s*\/\s*/).map((part) => cleanLine(part)).filter(Boolean)
  if (parts.length <= 1) return [raw]

  const first = parts[0]
  const brandPrefix = getBrandPrefix(first)
  const trimPrefix = getTrimPrefix(first) || brandPrefix

  return parts.map((part, index) => {
    if (index === 0) return part

    const normalizedPart = canonicalizeDriveRuleText(part)
    if (!normalizedPart) return part
    if (normalizedPart.startsWith(brandPrefix)) return part

    const useTrimPrefix = /^\d/.test(normalizedPart)
      || /^(?:base|single|dual|long|performance|plaid|turbo|gts|sport|awd|rwd|4wd|4x4|quattro|xdrive|all4|e-four|twin)\b/.test(normalizedPart)

    return `${useTrimPrefix ? trimPrefix : brandPrefix} ${part}`.trim()
  })
}

function buildRuleEntry(modelText, driveLabel) {
  const drive = normalizeDriveLabel(driveLabel)
  if (!drive) return []

  return expandRuleVariants(modelText)
    .map((variant) => {
      const normalizedVariant = canonicalizeDriveRuleText(variant)
      const tokens = normalizedVariant.split(' ').filter(Boolean)
      if (!tokens.length) return null

      return {
        drive,
        tokens,
        score: tokens.length,
        source: cleanLine(modelText),
      }
    })
    .filter(Boolean)
}

function parseDriveModelRules() {
  let content = ''
  try {
    content = fs.readFileSync(RULE_FILE_URL, 'utf8')
  } catch {
    return []
  }

  const lines = content.split(/\r?\n/).map((line) => cleanLine(line)).filter(Boolean)
  const rules = []
  let pendingModel = ''

  for (const line of lines) {
    if (SECTION_HEADER_RE.test(line)) {
      pendingModel = ''
      continue
    }

    if (INLINE_RULE_RE.test(line)) {
      const [modelText, driveText] = line.split(INLINE_RULE_RE)
      rules.push(...buildRuleEntry(modelText, driveText))
      pendingModel = ''
      continue
    }

    const driveLabel = normalizeDriveLabel(line)
    if (driveLabel && pendingModel) {
      rules.push(...buildRuleEntry(pendingModel, line))
      pendingModel = ''
      continue
    }

    pendingModel = line
  }

  return rules
}

function getDriveModelRules() {
  if (!cachedRules) {
    cachedRules = parseDriveModelRules()
  }
  return cachedRules
}

export function inferDriveFromModelTable(...values) {
  const candidateText = canonicalizeDriveRuleText(values.flat().join(' '))
  if (!candidateText) return { value: '', reason: '' }

  const candidateTokens = new Set(candidateText.split(' ').filter(Boolean))
  let bestRule = null

  for (const rule of getDriveModelRules()) {
    if (!rule.tokens.every((token) => candidateTokens.has(token))) continue
    if (!bestRule || rule.score > bestRule.score) bestRule = rule
  }

  if (!bestRule) return { value: '', reason: 'insufficient_evidence' }
  return {
    value: bestRule.drive,
    reason: 'model_table_rule',
  }
}

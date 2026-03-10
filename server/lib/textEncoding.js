import iconv from 'iconv-lite'

const MOJIBAKE_MARKER_RE = /(?:[РС][^\sA-Za-z0-9]){2,}|рџ|вЂ|вќ|вЏ|в„|РЎв|РІС/gu
const READABLE_CYRILLIC_RE = /[А-Яа-яЁё]{2,}/gu

function countMatches(text, re) {
  const clone = new RegExp(re.source, re.flags)
  return [...String(text || '').matchAll(clone)].length
}

function getNoiseScore(text) {
  return countMatches(text, MOJIBAKE_MARKER_RE)
}

function getReadableScore(text) {
  return countMatches(text, READABLE_CYRILLIC_RE)
}

function shouldAttemptRepair(text) {
  return typeof text === 'string' && getNoiseScore(text) > 0
}

function repairOnce(text) {
  return iconv.decode(iconv.encode(text, 'win1251'), 'utf8')
}

function isRepairImprovement(before, after) {
  const beforeNoise = getNoiseScore(before)
  const afterNoise = getNoiseScore(after)
  if (afterNoise < beforeNoise) return true

  const beforeReadable = getReadableScore(before)
  const afterReadable = getReadableScore(after)
  return afterNoise === beforeNoise && afterReadable > beforeReadable
}

export function repairTextEncoding(value) {
  if (value === null || value === undefined) return value

  let current = String(value)
  if (!shouldAttemptRepair(current)) return current

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let repaired = ''
    try {
      repaired = repairOnce(current)
    } catch {
      break
    }

    if (!repaired || repaired === current || !isRepairImprovement(current, repaired)) break
    current = repaired
    if (!shouldAttemptRepair(current)) break
  }

  return current
}

export function repairTextEncodingDeep(value, depth = 0) {
  if (depth > 5 || value === null || value === undefined) return value

  if (typeof value === 'string') return repairTextEncoding(value)

  if (Array.isArray(value)) {
    return value.map((item) => repairTextEncodingDeep(item, depth + 1))
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, repairTextEncodingDeep(nested, depth + 1)]),
    )
  }

  return value
}

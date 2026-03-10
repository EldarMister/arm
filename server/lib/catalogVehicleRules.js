function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

const OTHERS_NAME_RE = /^others\s+others\b/i
const OTHERS_MODEL_RE = /^others\b/i
const OTHERS_MANUFACTURER_RE = /^(others|기타(?:\s*제조사)?)/i

export function isBlockedGenericVehicle({
  name = '',
  model = '',
  manufacturer = '',
  rawManufacturer = '',
  rawModel = '',
} = {}) {
  const normalizedName = cleanText(name)
  const normalizedModel = cleanText(model)
  const normalizedManufacturer = cleanText(manufacturer)
  const normalizedRawManufacturer = cleanText(rawManufacturer)
  const normalizedRawModel = cleanText(rawModel)

  if (OTHERS_NAME_RE.test(normalizedName)) return true

  if (
    OTHERS_MODEL_RE.test(normalizedModel) &&
    (
      OTHERS_MANUFACTURER_RE.test(normalizedManufacturer) ||
      OTHERS_MANUFACTURER_RE.test(normalizedRawManufacturer) ||
      OTHERS_MANUFACTURER_RE.test(normalizedRawModel)
    )
  ) {
    return true
  }

  return false
}

export function getBlockedGenericVehicleReason(input = {}) {
  if (isBlockedGenericVehicle(input)) {
    return 'служебная категория Others/Others EV не подходит для каталога'
  }

  return ''
}

export function buildBlockedGenericVehicleSql(alias = 'c') {
  return `(
    COALESCE(${alias}.name, '') ILIKE 'Others Others %'
    OR (
      COALESCE(${alias}.model, '') ILIKE 'Others %'
      AND (
        COALESCE(${alias}.name, '') ILIKE 'Others %'
        OR COALESCE(${alias}.name, '') ILIKE 'Others Others %'
      )
    )
  )`
}

import { applyTrimFixes, applyVehicleTitleFixes } from '../../shared/vehicleTextFixes.js'
import { normalizeColorName, normalizeInteriorColorName, normalizeTrimLevel } from './vehicleData.js'

function normalizeNullableText(value, normalizer) {
  if (value === undefined) return undefined
  if (value === null) return null
  return normalizer(value)
}

export function normalizeCarTextFields(input = {}) {
  const bodyColor = normalizeNullableText(input.body_color, (value) => normalizeColorName(value))
  const bodyColorForInterior = bodyColor === undefined ? (input.body_color ?? '') : (bodyColor ?? '')

  return {
    name: normalizeNullableText(input.name, (value) => applyVehicleTitleFixes(value)),
    model: normalizeNullableText(input.model, (value) => applyVehicleTitleFixes(value)),
    trim_level: normalizeNullableText(input.trim_level, (value) => normalizeTrimLevel(value) || applyTrimFixes(value)),
    body_color: bodyColor,
    interior_color: normalizeNullableText(input.interior_color, (value) => normalizeInteriorColorName(value, bodyColorForInterior)),
  }
}

export function diffNormalizedCarTextFields(input = {}) {
  const normalized = normalizeCarTextFields(input)
  const changes = {}

  for (const [field, after] of Object.entries(normalized)) {
    if (after === undefined) continue

    const before = input[field]
    if (before === after) continue

    changes[field] = { before, after }
  }

  return {
    normalized,
    changes,
    changedFields: Object.keys(changes),
  }
}

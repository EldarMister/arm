import { applyTrimFixes, applyVehicleTitleFixes } from '../../shared/vehicleTextFixes.js'
import {
  extractTrimLevelFromTitle,
  normalizeColorName,
  normalizeInteriorColorName,
  normalizeLocationName,
  normalizeText,
  normalizeTrimLevel,
} from './vehicleData.js'

function normalizeNullableText(value, normalizer) {
  if (value === undefined) return undefined
  if (value === null) return null
  return normalizer(value)
}

export function normalizeCarTextFields(input = {}) {
  const normalizedName = normalizeNullableText(input.name, (value) => applyVehicleTitleFixes(normalizeText(value)))
  const normalizedModel = normalizeNullableText(input.model, (value) => applyVehicleTitleFixes(normalizeText(value)))
  const bodyColor = normalizeNullableText(input.body_color, (value) => normalizeColorName(value))
  const bodyColorForInterior = bodyColor === undefined ? (input.body_color ?? '') : (bodyColor ?? '')
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

  return {
    name: normalizedName,
    model: normalizedModel,
    trim_level: normalizedTrim,
    body_color: bodyColor,
    interior_color: normalizeNullableText(input.interior_color, (value) => normalizeInteriorColorName(value, bodyColorForInterior, { allowBodyDuplicate: true })),
    location: normalizeNullableText(input.location, (value) => normalizeLocationName(value)),
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

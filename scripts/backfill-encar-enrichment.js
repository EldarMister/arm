import pool from '../server/db.js'
import { fetchEncarVehicleEnrichment } from '../server/lib/encarVehicle.js'
import { normalizeCarTextFields } from '../server/lib/carRecordNormalization.js'
import { normalizeDrive, normalizeInteriorColorName } from '../server/lib/vehicleData.js'
import { isStandardVin, normalizeVin } from '../server/lib/vin.js'

const DEFAULT_CONCURRENCY = (() => {
  const raw = Number.parseInt(globalThis.process?.env?.BACKFILL_ENRICH_CONCURRENCY || '2', 10)
  if (!Number.isFinite(raw)) return 2
  return Math.min(Math.max(raw, 1), 8)
})()
const DEFAULT_TARGETS = ['interior', 'drive', 'key', 'vin', 'trim', 'options', 'warranty']
const DRIVE_CANONICAL_VALUES = new Set([
  'Передний (FWD)',
  'Задний (RWD)',
  'Полный (AWD)',
  'Полный (4WD)',
])
const GENERIC_KEY_INFO_VALUES = new Set([
  'Ключи есть',
  'Есть запасной ключ',
  'Пульт-ключ',
  'Карта-ключ',
  'Ключ-карта',
])
const BACKFILL_TARGETS = (() => {
  const raw = String(globalThis.process?.env?.BACKFILL_TARGETS || DEFAULT_TARGETS.join(','))
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
  const normalized = raw.filter((item) => DEFAULT_TARGETS.includes(item))
  return normalized.length ? normalized : [...DEFAULT_TARGETS]
})()
const BACKFILL_LIMIT = (() => {
  const raw = Number.parseInt(globalThis.process?.env?.BACKFILL_ENRICH_LIMIT || '0', 10)
  if (!Number.isFinite(raw) || raw <= 0) return 0
  return raw
})()
const INTERIOR_BACKFILL_MODE = (() => {
  const raw = String(globalThis.process?.env?.BACKFILL_INTERIOR_MODE || 'missing').trim().toLowerCase()
  return ['missing', 'invalid', 'missing_or_invalid'].includes(raw) ? raw : 'missing'
})()

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalizeEvidenceSource(value) {
  const text = cleanText(value)
  return text || null
}

function serializeEvidenceDiagnostics(value) {
  return JSON.stringify(Array.isArray(value) ? value : [])
}

function hasCanonicalDrive(value) {
  return DRIVE_CANONICAL_VALUES.has(cleanText(value))
}

function scoreKeyInfo(value) {
  const text = cleanText(value)
  if (!text) return 0

  let score = 1
  if (/:\s*\d+\s*шт\.$/i.test(text)) score += 2
  if (/\b(?:Смарт-ключ|Ключ-карта|Электронный ключ|Выкидной ключ|Дистанционный ключ|Обычный ключ|Пульт-ключ|Карта-ключ)\b/i.test(text)) score += 3
  if (/^Ключи:\s*\d+\s*шт\.$/i.test(text)) score -= 1
  if (GENERIC_KEY_INFO_VALUES.has(text)) score -= 1

  return score
}

function shouldRefreshDrive(currentValue, nextValue) {
  const nextDrive = cleanText(nextValue)
  if (!hasCanonicalDrive(nextDrive)) return false

  const currentDrive = cleanText(currentValue)
  if (!currentDrive) return true
  if (hasCanonicalDrive(currentDrive)) return false

  return normalizeDrive(currentDrive) !== nextDrive
}

function shouldRefreshKeyInfo(currentValue, nextValue) {
  const nextKeyInfo = cleanText(nextValue)
  if (!nextKeyInfo) return false

  return scoreKeyInfo(nextKeyInfo) > scoreKeyInfo(currentValue)
}

function normalizeOptionFeatures(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => cleanText(item)).filter(Boolean))].slice(0, 16)
}

function hasOptionFeatures(value) {
  return normalizeOptionFeatures(value).length > 0
}

function isVinConstraintError(error) {
  return error?.code === '23505' && error?.constraint === 'idx_cars_vin_unique'
}

async function getExistingCarIdByVin(vin, excludeId = null) {
  const normalized = normalizeVin(vin)
  if (!isStandardVin(normalized)) return null

  const params = [normalized]
  let sql = 'SELECT id FROM cars WHERE UPPER(BTRIM(vin)) = $1'
  if (excludeId) {
    params.push(excludeId)
    sql += ' AND id != $2'
  }
  sql += ' LIMIT 1'

  const result = await pool.query(sql, params)
  return result.rows[0]?.id || null
}

async function ensureSchema() {
  await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS drive_type VARCHAR(100)`)
  await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS drive_type_source VARCHAR(80)`)
  await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS drive_type_diagnostics JSONB NOT NULL DEFAULT '[]'::jsonb`)
  await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS key_info VARCHAR(120)`)
  await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS interior_color_source VARCHAR(80)`)
  await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS interior_color_diagnostics JSONB NOT NULL DEFAULT '[]'::jsonb`)
  await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS option_features TEXT[] DEFAULT '{}'`)
  await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS warranty_company VARCHAR(120)`)
  await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS warranty_body_months INTEGER`)
  await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS warranty_body_km BIGINT`)
  await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS warranty_transmission_months INTEGER`)
  await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS warranty_transmission_km BIGINT`)
}

function hasTarget(name) {
  return BACKFILL_TARGETS.includes(name)
}

function wantsMissingInterior() {
  return INTERIOR_BACKFILL_MODE === 'missing' || INTERIOR_BACKFILL_MODE === 'missing_or_invalid'
}

function wantsInvalidInterior() {
  return INTERIOR_BACKFILL_MODE === 'invalid' || INTERIOR_BACKFILL_MODE === 'missing_or_invalid'
}

function getNormalizedStoredInterior(row) {
  return normalizeInteriorColorName(cleanText(row?.interior_color), row?.body_color || '', { allowBodyDuplicate: true })
}

function isInteriorCandidate(row) {
  if (!hasTarget('interior')) return false

  const currentInterior = cleanText(row?.interior_color)
  if (!currentInterior) return wantsMissingInterior()
  if (!wantsInvalidInterior()) return false

  return !getNormalizedStoredInterior(row)
}

function isDriveCandidate(row) {
  if (!hasTarget('drive')) return false

  const currentDrive = cleanText(row?.drive_type)
  return !currentDrive || !hasCanonicalDrive(currentDrive)
}

function isKeyCandidate(row) {
  if (!hasTarget('key')) return false

  const currentKeyInfo = cleanText(row?.key_info)
  if (!currentKeyInfo) return true
  if (GENERIC_KEY_INFO_VALUES.has(currentKeyInfo)) return true
  return /^РљР»СЋС‡Рё:\s*\d+\s*С€С‚\.$/i.test(currentKeyInfo)
}

function isVinCandidate(row) {
  return hasTarget('vin') && !cleanText(row?.vin)
}

function isTrimCandidate(row) {
  return hasTarget('trim') && !cleanText(row?.trim_level)
}

function isOptionsCandidate(row) {
  return hasTarget('options') && !hasOptionFeatures(row?.option_features)
}

function isWarrantyCandidate(row) {
  if (!hasTarget('warranty')) return false

  const year = Number.parseInt(String(row?.year || '').slice(0, 4), 10)
  return (
    !cleanText(row?.warranty_company) &&
    Number(row?.warranty_body_months || 0) <= 0 &&
    Number(row?.warranty_body_km || 0) <= 0 &&
    Number(row?.warranty_transmission_months || 0) <= 0 &&
    Number(row?.warranty_transmission_km || 0) <= 0 &&
    Number.isFinite(year) &&
    year >= 2020
  )
}

function isCandidateRow(row) {
  return (
    isInteriorCandidate(row) ||
    isDriveCandidate(row) ||
    isKeyCandidate(row) ||
    isVinCandidate(row) ||
    isTrimCandidate(row) ||
    isOptionsCandidate(row) ||
    isWarrantyCandidate(row)
  )
}

function buildBackfillFetchTargets(row) {
  return {
    vin: isVinCandidate(row),
    interiorColor: isInteriorCandidate(row),
    keyInfo: isKeyCandidate(row),
    driveType: isDriveCandidate(row),
    optionFeatures: isOptionsCandidate(row),
  }
}

async function fetchCandidates() {
  const whereChecks = []
  if (hasTarget('interior')) {
    if (INTERIOR_BACKFILL_MODE === 'missing') {
      whereChecks.push(`COALESCE(BTRIM(interior_color), '') = ''`)
    } else if (INTERIOR_BACKFILL_MODE === 'invalid') {
      whereChecks.push(`COALESCE(BTRIM(interior_color), '') <> ''`)
    } else {
      whereChecks.push(`TRUE`)
    }
  }
  if (hasTarget('drive')) whereChecks.push(`(
    COALESCE(BTRIM(drive_type), '') = ''
    OR COALESCE(BTRIM(drive_type), '') NOT IN ('Передний (FWD)', 'Задний (RWD)', 'Полный (AWD)', 'Полный (4WD)')
  )`)
  if (hasTarget('key')) whereChecks.push(`(
    COALESCE(BTRIM(key_info), '') = ''
    OR COALESCE(BTRIM(key_info), '') IN ('Ключи есть', 'Есть запасной ключ', 'Пульт-ключ', 'Карта-ключ', 'Ключ-карта')
    OR COALESCE(BTRIM(key_info), '') ~ '^Ключи:\\s*[0-9]+\\s*шт\\.$'
  )`)
  if (hasTarget('vin')) whereChecks.push(`COALESCE(BTRIM(vin), '') = ''`)
  if (hasTarget('trim')) whereChecks.push(`COALESCE(BTRIM(trim_level), '') = ''`)
  if (hasTarget('options')) whereChecks.push(`COALESCE(array_length(option_features, 1), 0) = 0`)
  if (hasTarget('warranty')) whereChecks.push(`(
    COALESCE(BTRIM(warranty_company), '') = ''
    AND COALESCE(warranty_body_months, 0) = 0
    AND COALESCE(warranty_body_km, 0) = 0
    AND COALESCE(warranty_transmission_months, 0) = 0
    AND COALESCE(warranty_transmission_km, 0) = 0
    AND COALESCE(NULLIF(SUBSTRING(year FROM 1 FOR 4), ''), '0')::int >= 2020
  )`)
  if (!whereChecks.length) return []

  let sql = `
    SELECT id, encar_id, name, model, year, body_color, interior_color, drive_type, key_info, vin, trim_level, option_features,
           warranty_company, warranty_body_months, warranty_body_km, warranty_transmission_months, warranty_transmission_km
    FROM cars
    WHERE encar_id IS NOT NULL
      AND encar_id != ''
      AND (
        ${whereChecks.join('\n        OR ')}
      )
    ORDER BY
      CASE WHEN COALESCE(BTRIM(vin), '') = '' THEN 0 ELSE 1 END,
      CASE WHEN COALESCE(BTRIM(trim_level), '') = '' THEN 0 ELSE 1 END,
      CASE WHEN COALESCE(BTRIM(warranty_company), '') = ''
             AND COALESCE(warranty_body_months, 0) = 0
             AND COALESCE(warranty_body_km, 0) = 0
             AND COALESCE(warranty_transmission_months, 0) = 0
             AND COALESCE(warranty_transmission_km, 0) = 0
             AND COALESCE(NULLIF(SUBSTRING(year FROM 1 FOR 4), ''), '0')::int >= 2020 THEN 0 ELSE 1 END,
      CASE WHEN COALESCE(BTRIM(drive_type), '') = ''
             OR COALESCE(BTRIM(drive_type), '') NOT IN ('Передний (FWD)', 'Задний (RWD)', 'Полный (AWD)', 'Полный (4WD)') THEN 0 ELSE 1 END,
      CASE WHEN COALESCE(BTRIM(key_info), '') = ''
             OR COALESCE(BTRIM(key_info), '') IN ('Ключи есть', 'Есть запасной ключ', 'Пульт-ключ', 'Карта-ключ', 'Ключ-карта')
             OR COALESCE(BTRIM(key_info), '') ~ '^Ключи:\\s*[0-9]+\\s*шт\\.$' THEN 0 ELSE 1 END,
      CASE WHEN COALESCE(array_length(option_features, 1), 0) = 0 THEN 0 ELSE 1 END,
      CASE WHEN COALESCE(BTRIM(interior_color), '') = '' THEN 0 ELSE 1 END,
      updated_at ASC NULLS FIRST,
      id ASC
  `
  const result = await pool.query(sql)
  const candidates = result.rows.filter((row) => isCandidateRow(row))

  return BACKFILL_LIMIT > 0 ? candidates.slice(0, BACKFILL_LIMIT) : candidates
}

async function updateCar(id, patch) {
  const fields = Object.entries(patch).filter(([, value]) => value !== undefined)
  if (!fields.length) return false

  const updates = []
  const params = []
  let index = 1

  for (const [field, value] of fields) {
    updates.push(`${field} = $${index++}`)
    params.push(value)
  }

  updates.push('updated_at = NOW()')
  params.push(id)

  await pool.query(`UPDATE cars SET ${updates.join(', ')} WHERE id = $${index}`, params)
  return true
}

async function main() {
  await ensureSchema()

  const candidates = await fetchCandidates()
  const stats = {
    checked: candidates.length,
    processed: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    interior_filled: 0,
    interior_cleared: 0,
    drive_filled: 0,
    key_filled: 0,
    vin_filled: 0,
    trim_filled: 0,
    option_features_filled: 0,
    warranty_filled: 0,
  }

  console.log(`Backfill targets: ${BACKFILL_TARGETS.join(', ')}`)
  if (hasTarget('interior')) console.log(`Backfill interior mode: ${INTERIOR_BACKFILL_MODE}`)
  console.log(`Backfill limit: ${BACKFILL_LIMIT || 'all'}`)
  console.log(`Backfill candidates: ${stats.checked}`)
  if (!candidates.length) {
    await pool.end()
    return
  }

  let nextIndex = 0
  const vinLookupCache = new Map()

  async function worker() {
    while (true) {
      const currentIndex = nextIndex++
      if (currentIndex >= candidates.length) return

      const row = candidates[currentIndex]

      try {
        const detail = await fetchEncarVehicleEnrichment(row.encar_id, {
          targets: buildBackfillFetchTargets(row),
        })
        const normalizedDetail = normalizeCarTextFields({
          name: detail.name || row.name,
          model: detail.model || row.model,
          trim_level: detail.trim_level ?? row.trim_level,
          drive_type: detail.drive_type ?? row.drive_type,
          body_color: detail.body_color ?? row.body_color,
          interior_color: detail.interior_color ?? row.interior_color,
        })
        const patch = {}
        const nextInterior = normalizeInteriorColorName(
          cleanText(normalizedDetail.interior_color),
          row.body_color || '',
          { allowBodyDuplicate: true },
        )
        const currentInterior = cleanText(row.interior_color)
        const normalizedCurrentInterior = getNormalizedStoredInterior(row)
        const nextDrive = cleanText(normalizedDetail.drive_type)
        const currentDrive = cleanText(row.drive_type)
        const nextKeyInfo = cleanText(detail.key_info)
        const currentKeyInfo = cleanText(row.key_info)

        if (isInteriorCandidate(row)) {
          patch.interior_color_source = normalizeEvidenceSource(detail.interior_color_source)
          patch.interior_color_diagnostics = serializeEvidenceDiagnostics(detail.interior_color_diagnostics)
          if (nextInterior) {
            patch.interior_color = nextInterior
            stats.interior_filled += 1
          } else if (currentInterior) {
            patch.interior_color = ''
            stats.interior_cleared += 1
          }
        }

        if (isDriveCandidate(row) && shouldRefreshDrive(currentDrive, nextDrive)) {
          patch.drive_type_source = normalizeEvidenceSource(detail.drive_type_source)
          patch.drive_type_diagnostics = serializeEvidenceDiagnostics(detail.drive_type_diagnostics)
          patch.drive_type = nextDrive
          stats.drive_filled += 1
        } else if (isDriveCandidate(row)) {
          patch.drive_type_source = normalizeEvidenceSource(detail.drive_type_source)
          patch.drive_type_diagnostics = serializeEvidenceDiagnostics(detail.drive_type_diagnostics)
        }

        if (isKeyCandidate(row) && shouldRefreshKeyInfo(currentKeyInfo, nextKeyInfo)) {
          patch.key_info = nextKeyInfo
          stats.key_filled += 1
        }

        if (isVinCandidate(row) && cleanText(detail.vin)) {
          patch.vin = cleanText(detail.vin)
          stats.vin_filled += 1
        }

        if (isTrimCandidate(row) && cleanText(normalizedDetail.trim_level)) {
          patch.trim_level = cleanText(normalizedDetail.trim_level)
          stats.trim_filled += 1
        }

        if (isOptionsCandidate(row)) {
          const nextFeatures = normalizeOptionFeatures(detail.option_features)
          if (nextFeatures.length) {
            patch.option_features = nextFeatures
            stats.option_features_filled += 1
          }
        }

        if (
          isWarrantyCandidate(row)
        ) {
          if (cleanText(detail.warranty_company)) patch.warranty_company = cleanText(detail.warranty_company)
          if (Number(detail.warranty_body_months) > 0) patch.warranty_body_months = detail.warranty_body_months
          if (Number(detail.warranty_body_km) > 0) patch.warranty_body_km = detail.warranty_body_km
          if (Number(detail.warranty_transmission_months) > 0) patch.warranty_transmission_months = detail.warranty_transmission_months
          if (Number(detail.warranty_transmission_km) > 0) patch.warranty_transmission_km = detail.warranty_transmission_km
          if (
            patch.warranty_company !== undefined ||
            patch.warranty_body_months !== undefined ||
            patch.warranty_body_km !== undefined ||
            patch.warranty_transmission_months !== undefined ||
            patch.warranty_transmission_km !== undefined
          ) {
            stats.warranty_filled += 1
          }
        }

        let appliedPatch = { ...patch }
        try {
          if (await updateCar(row.id, appliedPatch)) {
            stats.updated += 1
          } else {
            stats.skipped += 1
          }
        } catch (updateError) {
          if (!isVinConstraintError(updateError) || !appliedPatch.vin) throw updateError

          const normalizedDuplicateVin = normalizeVin(appliedPatch.vin)
          const duplicateId = vinLookupCache.has(normalizedDuplicateVin)
            ? vinLookupCache.get(normalizedDuplicateVin)
            : await getExistingCarIdByVin(appliedPatch.vin, row.id)
          if (!vinLookupCache.has(normalizedDuplicateVin)) {
            vinLookupCache.set(normalizedDuplicateVin, duplicateId || null)
          }
          delete appliedPatch.vin
          stats.vin_filled = Math.max(stats.vin_filled - 1, 0)

          if (await updateCar(row.id, appliedPatch)) {
            stats.updated += 1
            console.warn(`Skipped duplicate VIN for ID ${row.id} / Encar ${row.encar_id}; existing ID ${duplicateId || '-'}`)
          } else {
            stats.skipped += 1
            console.warn(`Duplicate VIN only for ID ${row.id} / Encar ${row.encar_id}; existing ID ${duplicateId || '-'}`)
          }
        }

        if (appliedPatch.vin && isStandardVin(normalizeVin(appliedPatch.vin))) {
          vinLookupCache.set(normalizeVin(appliedPatch.vin), row.id)
        }
      } catch (error) {
        stats.errors += 1
        console.error(`Backfill error for ID ${row.id} / Encar ${row.encar_id}: ${error.message}`)
      } finally {
        stats.processed += 1
        if (stats.processed % 25 === 0 || stats.processed === stats.checked) {
          console.log(`Progress: ${stats.processed}/${stats.checked} | updated=${stats.updated} skipped=${stats.skipped} errors=${stats.errors}`)
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(DEFAULT_CONCURRENCY, candidates.length) }, () => worker()))

  const result = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE COALESCE(BTRIM(interior_color), '') <> '')::int AS with_interior_color,
      COUNT(*) FILTER (WHERE COALESCE(BTRIM(drive_type), '') <> '')::int AS with_drive_type,
      COUNT(*) FILTER (WHERE COALESCE(BTRIM(key_info), '') <> '')::int AS with_key_info,
      COUNT(*) FILTER (WHERE COALESCE(BTRIM(vin), '') <> '')::int AS with_vin,
      COUNT(*) FILTER (WHERE COALESCE(BTRIM(trim_level), '') <> '')::int AS with_trim_level,
      COUNT(*) FILTER (WHERE COALESCE(array_length(option_features, 1), 0) > 0)::int AS with_option_features
    FROM cars
  `)

  console.log('Backfill summary:', JSON.stringify(stats, null, 2))
  console.log('Catalog coverage:', JSON.stringify(result.rows[0], null, 2))

  await pool.end()
}

main().catch(async (error) => {
  console.error(error)
  try {
    await pool.end()
  } catch {
    // ignore close errors
  }
  globalThis.process.exitCode = 1
})

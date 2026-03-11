import pool from '../server/db.js'
import { fetchEncarVehicleEnrichment } from '../server/lib/encarVehicle.js'
import { normalizeInteriorColorName } from '../server/lib/vehicleData.js'
import { isStandardVin, normalizeVin } from '../server/lib/vin.js'

const DEFAULT_CONCURRENCY = (() => {
  const raw = Number.parseInt(globalThis.process?.env?.BACKFILL_ENRICH_CONCURRENCY || '2', 10)
  if (!Number.isFinite(raw)) return 2
  return Math.min(Math.max(raw, 1), 8)
})()
const DEFAULT_TARGETS = ['interior', 'vin', 'trim', 'options', 'warranty']
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

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
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

async function fetchCandidates() {
  const whereChecks = []
  if (hasTarget('interior')) whereChecks.push(`COALESCE(BTRIM(interior_color), '') = ''`)
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

  const params = []
  let sql = `
    SELECT id, encar_id, name, year, body_color, interior_color, vin, trim_level, option_features,
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
      CASE WHEN COALESCE(array_length(option_features, 1), 0) = 0 THEN 0 ELSE 1 END,
      CASE WHEN COALESCE(BTRIM(interior_color), '') = '' THEN 0 ELSE 1 END,
      updated_at ASC NULLS FIRST,
      id ASC
  `

  if (BACKFILL_LIMIT > 0) {
    params.push(BACKFILL_LIMIT)
    sql += ` LIMIT $${params.length}`
  }

  const result = await pool.query(sql, params)

  return result.rows
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
    vin_filled: 0,
    trim_filled: 0,
    option_features_filled: 0,
    warranty_filled: 0,
  }

  console.log(`Backfill targets: ${BACKFILL_TARGETS.join(', ')}`)
  console.log(`Backfill limit: ${BACKFILL_LIMIT || 'all'}`)
  console.log(`Backfill candidates: ${stats.checked}`)
  if (!candidates.length) {
    await pool.end()
    return
  }

  let nextIndex = 0

  async function worker() {
    while (true) {
      const currentIndex = nextIndex++
      if (currentIndex >= candidates.length) return

      const row = candidates[currentIndex]

      try {
        const detail = await fetchEncarVehicleEnrichment(row.encar_id)
        const patch = {}
        const nextInterior = cleanText(detail.interior_color)
        const currentInterior = cleanText(row.interior_color)
        const normalizedCurrentInterior = normalizeInteriorColorName(currentInterior, row.body_color || '')

        if (hasTarget('interior') && !normalizedCurrentInterior && nextInterior) {
          patch.interior_color = nextInterior
          stats.interior_filled += 1
        }

        if (hasTarget('vin') && !cleanText(row.vin) && cleanText(detail.vin)) {
          patch.vin = cleanText(detail.vin)
          stats.vin_filled += 1
        }

        if (hasTarget('trim') && !cleanText(row.trim_level) && cleanText(detail.trim_level)) {
          patch.trim_level = cleanText(detail.trim_level)
          stats.trim_filled += 1
        }

        if (hasTarget('options') && !hasOptionFeatures(row.option_features)) {
          const nextFeatures = normalizeOptionFeatures(detail.option_features)
          if (nextFeatures.length) {
            patch.option_features = nextFeatures
            stats.option_features_filled += 1
          }
        }

        if (
          hasTarget('warranty') &&
          !cleanText(row.warranty_company) &&
          Number(row.warranty_body_months || 0) <= 0 &&
          Number(row.warranty_body_km || 0) <= 0 &&
          Number(row.warranty_transmission_months || 0) <= 0 &&
          Number(row.warranty_transmission_km || 0) <= 0
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

          const duplicateId = await getExistingCarIdByVin(appliedPatch.vin, row.id)
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

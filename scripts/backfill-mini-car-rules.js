import pool from '../server/db.js'
import { computePricing, getExchangeRateSnapshot } from '../server/lib/exchangeRate.js'
import { normalizeCarTextFields } from '../server/lib/carRecordNormalization.js'
import { getPricingSettings, resolveVehicleFees } from '../server/lib/pricingSettings.js'

const TARGET_MODEL_RE = /\b(?:(?:kia\s+)?ray|(?:kia\s+)?morning|(?:chevrolet\s+)?spark)\b/i
const SEARCH_PATTERNS = [
  '%Ray%',
  '%Morning%',
  '%Spark%',
]

function buildSearchText(row = {}) {
  return [
    row.name,
    row.model,
    row.trim_level,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
}

function toComparable(value) {
  if (Array.isArray(value)) return JSON.stringify(value)
  return value ?? null
}

function hasChanged(before, after) {
  return toComparable(before) !== toComparable(after)
}

async function main() {
  const [exchangeSnapshot, pricingSettings] = await Promise.all([
    getExchangeRateSnapshot(),
    getPricingSettings(),
  ])

  const result = await pool.query(`
    SELECT
      id,
      encar_id,
      name,
      model,
      trim_level,
      body_type,
      vehicle_class,
      price_krw,
      price_usd,
      commission,
      delivery,
      delivery_profile_code,
      loading,
      unloading,
      storage,
      pricing_locked,
      vat_refund,
      total
    FROM cars
    WHERE (
      COALESCE(name, '') ILIKE ANY($1::text[])
      OR COALESCE(model, '') ILIKE ANY($1::text[])
      OR COALESCE(trim_level, '') ILIKE ANY($1::text[])
    )
    ORDER BY id ASC
  `, [SEARCH_PATTERNS])

  const targets = result.rows.filter((row) => TARGET_MODEL_RE.test(buildSearchText(row)))
  let updated = 0
  let skipped = 0

  for (const row of targets) {
    const normalized = normalizeCarTextFields(row)
    const bodyType = normalized.body_type ?? row.body_type ?? ''
    const vehicleClass = normalized.vehicle_class ?? row.vehicle_class ?? ''

    const patch = {
      body_type: bodyType || null,
      vehicle_class: vehicleClass || null,
    }

    if (!row.pricing_locked) {
      const fees = resolveVehicleFees({
        ...row,
        body_type: bodyType,
        vehicle_class: vehicleClass,
        delivery_profile_code: '',
      }, pricingSettings)
      const pricing = computePricing({
        priceKrw: row.price_krw,
        commission: fees.commission,
        delivery: fees.delivery,
        loading: fees.loading,
        unloading: fees.unloading,
        storage: fees.storage,
      }, exchangeSnapshot)

      Object.assign(patch, {
        delivery_profile_code: fees.delivery_profile_code || null,
        commission: fees.commission,
        delivery: fees.delivery,
        loading: fees.loading,
        unloading: fees.unloading,
        storage: fees.storage,
        price_usd: pricing.price_usd,
        vat_refund: pricing.vat_refund,
        total: pricing.total,
      })
    }

    const changedFields = Object.entries(patch)
      .filter(([field, value]) => hasChanged(row[field], value))

    if (!changedFields.length) {
      skipped += 1
      continue
    }

    const values = []
    const setClauses = changedFields.map(([field, value], index) => {
      values.push(value)
      return `${field} = $${index + 1}`
    })
    values.push(row.id)

    await pool.query(
      `UPDATE cars
       SET ${setClauses.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length}`,
      values,
    )

    updated += 1
  }

  console.log(`Mini-car backfill: matched=${targets.length} updated=${updated} skipped=${skipped}`)
}

main()
  .catch((error) => {
    console.error('Mini-car backfill failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })

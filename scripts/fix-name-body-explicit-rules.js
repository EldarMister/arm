import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import pg from 'pg'
import { BODY_TYPE_LABELS, normalizeBodyTypeLabel } from '../shared/vehicleTaxonomy.js'

dotenv.config()

const { Pool } = pg

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL is missing')
  process.exit(1)
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

const APPLY = String(process.env.APPLY || '').trim() === '1'
const REPORT_PATH = String(process.env.REPORT_PATH || '').trim()

const NAME_RULES = [
  {
    test: /\bPeugeot\s+3008\b.*\b1\.2\b.*\bPure\s*Tech\b.*\bAlrwireu\b/i,
    apply: (value) => value.replace(/\bAlrwireu\b/gi, 'Allure'),
  },
  {
    test: /\bBentley\s+Continental\b.*\b4\.0\b.*\bGT\b.*\bAjureu\b/i,
    apply: (value) => value.replace(/\bAjureu\b/gi, 'Azure'),
  },
  {
    test: /\bFord\s+Mondeo\b.*\b2\.0\b.*\bTeurendeu\b/i,
    apply: (value) => value.replace(/\bTeurendeu\b/gi, 'Trend'),
  },
  {
    test: /\bMaserati\s+Levante\b.*\b3\.0\b.*\bDiesel\b.*\bAWD\b.*\bGeuranSports\b/i,
    apply: (value) => value.replace(/\bGeuranSports\b/gi, 'GranSport'),
  },
  {
    test: /\bMaserati\s+Levante\b.*\b3\.0\b.*\bAWD\b.*\bGeuranSports\b/i,
    apply: (value) => value.replace(/\bGeuranSports\b/gi, 'GranSport'),
  },
  {
    test: /\bAstonmartin\s+Vantage\b.*\b4\.0\b.*\bV8\b.*\bRodeuseuteo\b/i,
    apply: (value) => value
      .replace(/\bAstonmartin\b/gi, 'Aston Martin')
      .replace(/\bRodeuseuteo\b/gi, 'Roadster'),
  },
  {
    test: /\bMercedes[-\s]?Benz\s+AMG\s+GT\b.*\b4\.0\b.*\bC\b.*\bRodeuseuteo\b/i,
    apply: (value) => value.replace(/\bRodeuseuteo\b/gi, 'Roadster'),
  },
  {
    test: /\bAudi\s+RS6\b.*\b4\.0\b.*\bTFSI\b.*\bquattro\b.*\bAbanteu\b.*\bPerformance\b/i,
    apply: (value) => value.replace(/\bAbanteu\b/gi, 'Avant'),
  },
  {
    test: /\bHyundai\s+Venue\b.*\b1\.6\b.*\bPeulreokseu\b/i,
    apply: (value) => value.replace(/\bPeulreokseu\b/gi, 'Flux'),
  },
  {
    test: /\bChevrolet\s+Colorado\b.*\b3\.6\b.*\bIkseuteurim-X\b.*\b4WD\b/i,
    apply: (value) => value.replace(/\bIkseuteurim-X\b/gi, 'Extreme-X'),
  },
  {
    test: /\bChevrolet\s+Colorado\b.*\b3\.6\b.*\bIkseuteurim\b.*\b4WD\b/i,
    apply: (value) => value.replace(/\bIkseuteurim\b/gi, 'Extreme'),
  },
]

const MANUAL_REVIEW_RULES = [
  { test: /\bMini\s+Cooper\b.*\bPeibeodeu\b/i },
  { test: /\bMini\s+Countryman\b.*\bALL4\b.*\bPeibeodeu\b/i },
  { test: /\bMini\s+Aceman\b.*\bSE\b.*\bPeibeodeu\b/i },
  { test: /\bHyundai\s+Starex\b.*\bEorinibohocha\b(?:.*\bLPi\b)?/i },
  { test: /\bChevrolet\s+Spark\b.*\bRedeupit\b.*\bEdition\b/i },
  { test: /\bCitroen-DS\s+C4\s+SpaceTourer\b.*\b1\.5\b.*\bBlueHDi\b.*\bSyainpaek\b/i },
  { test: /\bCitroen-DS\s+C3\s+Aircross\b.*\b1\.5\b.*\bBlueHDi\b.*\bSyainpaek\b/i },
]

const RE_IONIQ5 = /\bHyundai\s+Ioniq\s*5\b/i
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

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function isBodyEmpty(value) {
  const text = cleanText(value)
  return !text || text === '-'
}

function applyNameRules(value) {
  const original = cleanText(value)
  if (!original) return original

  let next = original
  for (const rule of NAME_RULES) {
    if (rule.test.test(next)) {
      next = cleanText(rule.apply(next))
    }
  }
  return next
}

function needsManualReview(name) {
  const source = cleanText(name)
  if (!source) return false
  return MANUAL_REVIEW_RULES.some((rule) => rule.test.test(source))
}

function resolveBodyTypeByRules(row, context) {
  const normalizedBody = normalizeBodyTypeLabel(row.body_type)
  const emptyBody = isBodyEmpty(row.body_type)

  if (RE_IONIQ5.test(context) && normalizedBody === BODY_TYPE_LABELS.sedan) {
    return BODY_TYPE_LABELS.suv
  }

  if (RE_BMW_GRAN_TURISMO.test(context) && normalizedBody === BODY_TYPE_LABELS.sedan) {
    return BODY_TYPE_LABELS.liftback
  }

  if (RE_BMW_1_SERIES.test(context) && normalizedBody === BODY_TYPE_LABELS.sedan) {
    return BODY_TYPE_LABELS.hatchback
  }

  if (emptyBody && RE_BENTLEY_CONTINENTAL_GTC.test(context)) {
    return BODY_TYPE_LABELS.cabriolet
  }

  if (emptyBody && RE_BENTLEY_CONTINENTAL_GT.test(context) && !RE_BENTLEY_CONTINENTAL_GTC.test(context)) {
    return BODY_TYPE_LABELS.coupe
  }

  if (emptyBody && RE_PORSCHE_911.test(context) && !RE_PORSCHE_911_OPEN.test(context)) {
    return BODY_TYPE_LABELS.coupe
  }

  if (emptyBody && RE_MERCEDES_SL_CLASS.test(context)) {
    return BODY_TYPE_LABELS.roadster
  }

  if (emptyBody && RE_ASTON_VANTAGE_ROADSTER.test(context)) {
    return BODY_TYPE_LABELS.roadster
  }

  if (emptyBody && RE_AUDI_RS6_AVANT.test(context)) {
    return BODY_TYPE_LABELS.wagon
  }

  if (emptyBody && RE_JEEP_GLADIATOR.test(context)) {
    return BODY_TYPE_LABELS.pickup
  }

  if (emptyBody && RE_KIA_TASMAN.test(context)) {
    return BODY_TYPE_LABELS.pickup
  }

  if (emptyBody && RE_CHEVROLET_DAMAS.test(context)) {
    return BODY_TYPE_LABELS.minivan
  }

  if (emptyBody && RE_LEXUS_LM.test(context)) {
    return BODY_TYPE_LABELS.minivan
  }

  return row.body_type
}

function bodyDisplay(value) {
  const text = cleanText(value)
  return text || 'пусто'
}

function buildChangedFields(change) {
  const fields = []
  if ((change.before.name || '') !== (change.after.name || '')) fields.push('name')
  if ((change.before.body_type || '') !== (change.after.body_type || '')) fields.push('body_type')
  return fields
}

async function main() {
  const { rows } = await pool.query(`
    SELECT id, name, model, trim_level, body_type
    FROM cars
    ORDER BY id ASC
  `)

  const changes = []
  const manualReviews = []

  for (const row of rows) {
    const currentName = cleanText(row.name)
    if (!currentName) continue

    const rowNeedsManualReview = needsManualReview(currentName)
    if (rowNeedsManualReview) {
      manualReviews.push({
        id: row.id,
        name: row.name || '',
      })
    }

    const nextName = rowNeedsManualReview ? row.name : applyNameRules(row.name)
    const context = cleanText([
      nextName || row.name || '',
      row.model || '',
      row.trim_level || '',
    ].join(' '))
    const nextBody = resolveBodyTypeByRules(row, context)

    if ((nextName || '') === (row.name || '') && (nextBody || '') === (row.body_type || '')) {
      continue
    }

    changes.push({
      id: row.id,
      before: {
        name: row.name || '',
        body_type: row.body_type || '',
      },
      after: {
        name: nextName || '',
        body_type: nextBody || '',
      },
    })
  }

  if (APPLY && changes.length) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const chunkSize = 200
      for (let i = 0; i < changes.length; i += chunkSize) {
        const chunk = changes.slice(i, i + chunkSize)
        const values = []
        const placeholders = chunk.map((change, index) => {
          const base = index * 3
          values.push(change.id, change.after.name || null, change.after.body_type || null)
          return `($${base + 1}, $${base + 2}, $${base + 3})`
        })

        await client.query(
          `UPDATE cars AS c
           SET name = v.name,
               body_type = v.body_type,
               updated_at = NOW()
           FROM (VALUES ${placeholders.join(', ')}) AS v(id, name, body_type)
           WHERE c.id = v.id::int`,
          values,
        )
      }

      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  if (REPORT_PATH) {
    const lines = []

    for (const change of changes) {
      const fields = buildChangedFields(change)
      lines.push(`ID ${change.id}`)
      lines.push('')
      lines.push('Было:')
      if (fields.includes('name')) {
        lines.push(`name: ${change.before.name}`)
      }
      if (fields.includes('body_type')) {
        lines.push(`body_type: ${bodyDisplay(change.before.body_type)}`)
      }
      lines.push('')
      lines.push('Должно быть:')
      if (fields.includes('name')) {
        lines.push(`name: ${change.after.name}`)
      }
      if (fields.includes('body_type')) {
        lines.push(`body_type: ${bodyDisplay(change.after.body_type)}`)
      }
      lines.push('')
      lines.push('Изменения:')
      if (fields.includes('name')) {
        lines.push('- исправлена явная корявая транслитерация')
      }
      if (fields.includes('body_type')) {
        lines.push('- body_type исправлен по модели')
      }
      lines.push('')
    }

    for (const review of manualReviews) {
      lines.push(`ID ${review.id}`)
      lines.push('')
      lines.push('Было:')
      lines.push(`name: ${review.name}`)
      lines.push('')
      lines.push('Статус:')
      lines.push('manual review')
      lines.push('')
      lines.push('Причина:')
      lines.push('- название похоже на корейскую романизацию, но без 100% уверенности автоматически не исправлять')
      lines.push('')
    }

    const dir = path.dirname(REPORT_PATH)
    await fs.promises.mkdir(dir, { recursive: true }).catch(() => {})
    await fs.promises.writeFile(REPORT_PATH, lines.join('\n'), 'utf8')
  }

  console.log(JSON.stringify({
    applied: APPLY,
    total: rows.length,
    changed: changes.length,
    manualReview: manualReviews.length,
    reportPath: REPORT_PATH || null,
  }, null, 2))
}

main()
  .catch((error) => {
    console.error('fix-name-body-explicit-rules failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })

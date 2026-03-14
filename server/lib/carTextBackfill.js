import pool from '../db.js'
import { diffNormalizedCarTextFields } from './carRecordNormalization.js'

const MAX_REPORT_ITEMS = 200
const NORMALIZABLE_CAR_TEXT_FIELDS = Object.freeze([
  'name',
  'model',
  'trim_level',
  'drive_type',
  'body_type',
  'vehicle_class',
  'body_color',
  'interior_color',
  'location',
])

function normalizeRequestedFields(fields) {
  if (!Array.isArray(fields) || !fields.length) return [...NORMALIZABLE_CAR_TEXT_FIELDS]
  const requested = [...new Set(
    fields
      .map((field) => String(field || '').trim())
      .filter((field) => NORMALIZABLE_CAR_TEXT_FIELDS.includes(field)),
  )]
  return requested.length ? requested : [...NORMALIZABLE_CAR_TEXT_FIELDS]
}

function createInitialFieldTotals() {
  return {
    name: 0,
    model: 0,
    trim_level: 0,
    drive_type: 0,
    body_type: 0,
    vehicle_class: 0,
    body_color: 0,
    interior_color: 0,
    location: 0,
  }
}

function cloneState(state) {
  return {
    ...state,
    current: state.current ? { ...state.current } : null,
    report: [...state.report],
    field_totals: { ...state.field_totals },
  }
}

function pushReportItem(state, item) {
  state.report.unshift(item)
  if (state.report.length > MAX_REPORT_ITEMS) {
    state.report = state.report.slice(0, MAX_REPORT_ITEMS)
  }
}

export function createCarTextBackfillState() {
  return {
    running: false,
    stop_requested: false,
    stopped: false,
    total: 0,
    processed: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    started_at: null,
    finished_at: null,
    current: null,
    last_error: '',
    report: [],
    field_totals: createInitialFieldTotals(),
    fields: [...NORMALIZABLE_CAR_TEXT_FIELDS],
  }
}

export async function runCarTextBackfill({ onProgress, fields, shouldStop } = {}) {
  const state = createCarTextBackfillState()
  const requestedFields = normalizeRequestedFields(fields)
  state.running = true
  state.started_at = new Date().toISOString()
  state.fields = requestedFields

  const publish = () => {
    onProgress?.(cloneState(state))
  }

  publish()

  const result = await pool.query(`
    SELECT id, encar_id, name, model, trim_level, drive_type, body_type, vehicle_class, body_color, interior_color, location
    FROM cars
    ORDER BY updated_at ASC NULLS FIRST, id ASC
  `)

  state.total = result.rows.length
  publish()

  for (const row of result.rows) {
    if (shouldStop?.()) {
      state.stop_requested = true
      state.stopped = true
      break
    }

    state.current = {
      id: row.id,
      encar_id: row.encar_id,
      name: row.name || row.model || '',
    }
    publish()

    try {
      const { normalized, changes, changedFields } = diffNormalizedCarTextFields(row)
      const filteredChangedFields = changedFields.filter((field) => requestedFields.includes(field))

      if (!filteredChangedFields.length) {
        state.skipped += 1
      } else {
        const setClauses = []
        const params = []
        let index = 1

        for (const field of filteredChangedFields) {
          setClauses.push(`${field} = $${index++}`)
          params.push(normalized[field])
          state.field_totals[field] += 1
        }

        setClauses.push('updated_at = NOW()')
        params.push(row.id)

        await pool.query(
          `UPDATE cars SET ${setClauses.join(', ')} WHERE id = $${index}`,
          params
        )

        state.updated += 1
        pushReportItem(state, {
          id: row.id,
          encar_id: row.encar_id,
          name: row.name || row.model || '',
          status: 'updated',
          changes: filteredChangedFields.map((field) => ({
            field,
            before: changes[field]?.before ?? '',
            after: changes[field]?.after ?? '',
          })),
        })
      }
    } catch (error) {
      state.errors += 1
      state.last_error = `ID ${row.id}${row.encar_id ? ` / Encar ${row.encar_id}` : ''}: ${error.message}`
      pushReportItem(state, {
        id: row.id,
        encar_id: row.encar_id,
        name: row.name || row.model || '',
        status: 'error',
        error: error.message,
        changes: [],
      })
    }

    state.processed += 1
    publish()
  }

  state.running = false
  state.current = null
  state.finished_at = new Date().toISOString()
  publish()

  return cloneState(state)
}

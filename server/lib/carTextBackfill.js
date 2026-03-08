import pool from '../db.js'
import { diffNormalizedCarTextFields } from './carRecordNormalization.js'

const MAX_REPORT_ITEMS = 200

function createInitialFieldTotals() {
  return {
    name: 0,
    model: 0,
    trim_level: 0,
    body_color: 0,
    interior_color: 0,
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
  }
}

export async function runCarTextBackfill({ onProgress } = {}) {
  const state = createCarTextBackfillState()
  state.running = true
  state.started_at = new Date().toISOString()

  const publish = () => {
    onProgress?.(cloneState(state))
  }

  publish()

  const result = await pool.query(`
    SELECT id, encar_id, name, model, trim_level, body_color, interior_color
    FROM cars
    ORDER BY updated_at ASC NULLS FIRST, id ASC
  `)

  state.total = result.rows.length
  publish()

  for (const row of result.rows) {
    state.current = {
      id: row.id,
      encar_id: row.encar_id,
      name: row.name || row.model || '',
    }
    publish()

    try {
      const { normalized, changes, changedFields } = diffNormalizedCarTextFields(row)

      if (!changedFields.length) {
        state.skipped += 1
      } else {
        const setClauses = []
        const params = []
        let index = 1

        for (const field of changedFields) {
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
          changes: changedFields.map((field) => ({
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

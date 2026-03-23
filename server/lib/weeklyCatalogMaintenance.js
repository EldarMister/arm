import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pool from '../db.js'
import { state as scraperState } from '../scraper/state.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..', '..')
const JOB_KEY = 'weekly_catalog_maintenance'
const JOB_LOCK_KEY = 48239017
const FULL_BACKFILL_TARGETS = 'interior,drive,key,vin,trim,options,warranty,price'
const MAINTENANCE_INTERVAL_DAYS = clampInt(globalThis.process?.env?.WEEKLY_MAINTENANCE_INTERVAL_DAYS, 7, 1, 30)
const MAINTENANCE_CHECK_HOURS = clampInt(globalThis.process?.env?.WEEKLY_MAINTENANCE_CHECK_HOURS, 1, 1, 24)
const MAINTENANCE_STARTUP_DELAY_SECONDS = clampInt(globalThis.process?.env?.WEEKLY_MAINTENANCE_STARTUP_DELAY_SECONDS, 60, 5, 3600)
const MAINTENANCE_ENABLED = String(globalThis.process?.env?.WEEKLY_MAINTENANCE_ENABLED || 'true').trim().toLowerCase() !== 'false'
const MAINTENANCE_INTERVAL_MS = MAINTENANCE_INTERVAL_DAYS * 24 * 60 * 60 * 1000
const MAINTENANCE_CHECK_INTERVAL_MS = MAINTENANCE_CHECK_HOURS * 60 * 60 * 1000
const MAINTENANCE_STARTUP_DELAY_MS = MAINTENANCE_STARTUP_DELAY_SECONDS * 1000

const maintenanceState = {
  running: false,
  timer: null,
  nextCheckAt: null,
  lastCheckAt: null,
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(parsed, min), max)
}

function logInfo(message) {
  console.log(`WEEKLY_MAINTENANCE | ${message}`)
}

function logWarn(message) {
  console.warn(`WEEKLY_MAINTENANCE | ${message}`)
}

function logError(message) {
  console.error(`WEEKLY_MAINTENANCE | ${message}`)
}

async function ensureJobRow() {
  await pool.query(
    `INSERT INTO maintenance_jobs (job_key)
     VALUES ($1)
     ON CONFLICT (job_key) DO NOTHING`,
    [JOB_KEY],
  )
}

async function getJobRow() {
  await ensureJobRow()
  const result = await pool.query(
    `SELECT job_key, status, last_started_at, last_finished_at, last_success_at, last_error, updated_at
     FROM maintenance_jobs
     WHERE job_key = $1
     LIMIT 1`,
    [JOB_KEY],
  )
  return result.rows[0] || null
}

function isDue(row, nowMs = Date.now()) {
  const lastSuccessMs = Date.parse(String(row?.last_success_at || ''))
  if (!Number.isFinite(lastSuccessMs) || lastSuccessMs <= 0) return true
  return (nowMs - lastSuccessMs) >= MAINTENANCE_INTERVAL_MS
}

function tailText(value, maxLength = 6000) {
  const text = String(value || '').trim()
  if (!text) return ''
  return text.length > maxLength ? text.slice(-maxLength) : text
}

async function runNodeScript(scriptRelativePath, { env = {}, label }) {
  const scriptPath = path.resolve(PROJECT_ROOT, scriptRelativePath)

  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdoutBuffer = ''
    let stderrBuffer = ''

    const appendChunk = (current, chunk) => tailText(`${current}\n${chunk}`)
    const relayChunk = (stream, prefix) => (chunk) => {
      const text = String(chunk || '')
      if (!text.trim()) return
      if (stream === 'stdout') {
        stdoutBuffer = appendChunk(stdoutBuffer, text)
      } else {
        stderrBuffer = appendChunk(stderrBuffer, text)
      }

      for (const line of text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
        console.log(`WEEKLY_MAINTENANCE | ${prefix} | ${line}`)
      }
    }

    child.stdout?.on('data', relayChunk('stdout', `${label}:stdout`))
    child.stderr?.on('data', relayChunk('stderr', `${label}:stderr`))
    child.on('error', reject)
    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve({
          code,
          signal,
          stdout: stdoutBuffer,
          stderr: stderrBuffer,
        })
        return
      }

      reject(new Error(
        `${label} exited with code ${code ?? 'null'}${signal ? ` signal ${signal}` : ''}`
        + `${stderrBuffer ? ` | ${tailText(stderrBuffer, 1200)}` : stdoutBuffer ? ` | ${tailText(stdoutBuffer, 1200)}` : ''}`
      ))
    })
  })
}

async function acquireJobLock() {
  const client = await pool.connect()
  try {
    const result = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [JOB_LOCK_KEY])
    if (!result.rows[0]?.acquired) {
      client.release()
      return null
    }
    return client
  } catch (error) {
    client.release()
    throw error
  }
}

async function releaseJobLock(client) {
  if (!client) return
  try {
    await client.query('SELECT pg_advisory_unlock($1)', [JOB_LOCK_KEY])
  } catch (error) {
    logWarn(`failed to release advisory lock: ${error.message}`)
  } finally {
    client.release()
  }
}

async function markJobStarted() {
  await ensureJobRow()
  await pool.query(
    `UPDATE maintenance_jobs
     SET status = 'running',
         last_started_at = NOW(),
         last_error = NULL,
         updated_at = NOW()
     WHERE job_key = $1`,
    [JOB_KEY],
  )
}

async function markJobFinished(status, errorMessage = null) {
  await ensureJobRow()
  const successStampSql = status === 'success' ? ', last_success_at = NOW()' : ''
  await pool.query(
    `UPDATE maintenance_jobs
     SET status = $2,
         last_finished_at = NOW(),
         last_error = $3,
         updated_at = NOW()
         ${successStampSql}
     WHERE job_key = $1`,
    [JOB_KEY, status, errorMessage ? tailText(errorMessage, 4000) : null],
  )
}

export async function runWeeklyCatalogMaintenance({ reason = 'scheduled' } = {}) {
  if (!MAINTENANCE_ENABLED) {
    return { status: 'disabled' }
  }

  if (maintenanceState.running) {
    return { status: 'skipped', reason: 'already_running' }
  }

  if (scraperState.isRunning) {
    logWarn(`full maintenance skipped (${reason}): scraper is already running`)
    return { status: 'skipped', reason: 'scraper_running' }
  }

  const lockClient = await acquireJobLock()
  if (!lockClient) {
    logWarn(`full maintenance skipped (${reason}): advisory lock is already held`)
    return { status: 'skipped', reason: 'locked' }
  }

  maintenanceState.running = true
  try {
    logInfo(`starting full maintenance (${reason})`)
    await markJobStarted()

    await runNodeScript('scripts/backfill-encar-enrichment.js', {
      label: 'encar-backfill',
      env: {
        BACKFILL_TARGETS: FULL_BACKFILL_TARGETS,
        BACKFILL_ENRICH_LIMIT: '0',
        BACKFILL_INTERIOR_MODE: 'missing_or_invalid',
      },
    })

    await runNodeScript('scripts/normalize-existing-cars.js', {
      label: 'normalize-cars',
    })

    await markJobFinished('success')
    logInfo('full maintenance completed successfully')
    return { status: 'success' }
  } catch (error) {
    const message = error?.message || String(error)
    await markJobFinished('failed', message)
    logError(`full maintenance failed: ${message}`)
    return { status: 'failed', error: message }
  } finally {
    maintenanceState.running = false
    await releaseJobLock(lockClient)
  }
}

async function checkWeeklyCatalogMaintenance() {
  maintenanceState.lastCheckAt = new Date().toISOString()

  try {
    const row = await getJobRow()
    if (!isDue(row)) {
      return
    }

    await runWeeklyCatalogMaintenance({ reason: 'due_check' })
  } catch (error) {
    logError(`due-check failed: ${error?.message || error}`)
  }
}

function scheduleNextCheck(delayMs = MAINTENANCE_CHECK_INTERVAL_MS) {
  if (!MAINTENANCE_ENABLED) return

  if (maintenanceState.timer) {
    clearTimeout(maintenanceState.timer)
  }

  maintenanceState.nextCheckAt = new Date(Date.now() + delayMs).toISOString()
  maintenanceState.timer = setTimeout(async () => {
    maintenanceState.timer = null
    maintenanceState.nextCheckAt = null
    await checkWeeklyCatalogMaintenance()
    scheduleNextCheck(MAINTENANCE_CHECK_INTERVAL_MS)
  }, delayMs)
}

export function startWeeklyCatalogMaintenance() {
  stopWeeklyCatalogMaintenance()

  if (!MAINTENANCE_ENABLED) {
    logInfo('disabled by WEEKLY_MAINTENANCE_ENABLED=false')
    return
  }

  logInfo(
    `watchdog started: full enrichment + normalization every ${MAINTENANCE_INTERVAL_DAYS}d `
    + `(due check every ${MAINTENANCE_CHECK_HOURS}h, startup delay ${MAINTENANCE_STARTUP_DELAY_SECONDS}s)`
  )
  scheduleNextCheck(MAINTENANCE_STARTUP_DELAY_MS)
}

export function stopWeeklyCatalogMaintenance() {
  if (maintenanceState.timer) {
    clearTimeout(maintenanceState.timer)
    maintenanceState.timer = null
  }

  maintenanceState.nextCheckAt = null
}

export function getWeeklyCatalogMaintenanceState() {
  return {
    ...maintenanceState,
  }
}

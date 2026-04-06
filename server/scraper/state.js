import { EventEmitter } from 'events'
import { getReasonDefinition } from './diagnostics.js'
import { repairTextEncoding, repairTextEncodingDeep } from '../lib/textEncoding.js'

function createProgress(total = 0) {
  return {
    done: 0,
    total,
    failed: 0,
    skipped: 0,
    alreadyKnown: 0,
    totalSkipped: 0,
    photos: 0,
    found: 0,
    scanned: 0,
    retryRecovered: 0,
    discarded: 0,
    normalSkipped: 0,
  }
}

function createSessionSummary() {
  return {
    startedAt: null,
    finishedAt: null,
    parseScope: 'all',
    limit: 0,
    scanned: 0,
    found: 0,
    imported: 0,
    skipped: 0,
    alreadyKnown: 0,
    totalSkipped: 0,
    normalSkipped: 0,
    discarded: 0,
    failed: 0,
    retryRecovered: 0,
    photos: 0,
    reasons: {},
    topReasons: [],
    diagnosticBuckets: {
      alreadyKnown: 0,
      duplicate: 0,
      temporaryFail: 0,
      invalidPage: 0,
      parseIncomplete: 0,
      recovered: 0,
    },
    optimizationStats: {
      listTailStops: 0,
      vinCacheHits: 0,
    },
  }
}

const INVALID_PAGE_REASONS = new Set([
  'detail_not_found',
  'detail_empty_payload',
  'detail_empty_html',
  'detail_index_shell',
  'detail_preloaded_state_missing',
])

class ScraperState extends EventEmitter {
  constructor() {
    super()
    this.setMaxListeners(100)
    this.isRunning = false
    this.stopReq = false
    this.progress = createProgress()
    this.sessionSummary = createSessionSummary()
    this.skipDiagnostics = []
    this.logs = []
    this.config = { schedule: 'manual', parseScope: 'all', runPreset: 'default', dailyLimit: 100, hour: 10, intervalHours: 1 }
    this.lastRun = null
    this.nextRun = null
    this.startedAt = null
    this.cronJob = null
  }

  _addLog(level, message, meta = null) {
    const entry = {
      id: Date.now() + Math.random(),
      ts: new Date().toISOString(),
      level,
      message: repairTextEncoding(String(message || '')),
      ...(meta ? { meta: repairTextEncodingDeep(meta) } : {}),
    }

    this.logs.unshift(entry)
    if (this.logs.length > 500) this.logs.length = 500
    this.emit('update', { type: 'log', entry })
    return entry
  }

  info(message, meta = null) {
    return this._addLog('info', message, meta)
  }

  success(message, meta = null) {
    return this._addLog('success', message, meta)
  }

  warn(message, meta = null) {
    return this._addLog('warn', message, meta)
  }

  error(message, meta = null) {
    return this._addLog('error', message, meta)
  }

  resetSession({ total = 0, parseScope = 'all', limit = 0 } = {}) {
    this.progress = createProgress(total)
    this.sessionSummary = {
      ...createSessionSummary(),
      startedAt: new Date().toISOString(),
      parseScope,
      limit,
    }
    this.skipDiagnostics = []
  }

  setProgress(updates) {
    Object.assign(this.progress, updates)
    this.progress.totalSkipped = this.progress.skipped + this.progress.alreadyKnown

    this.sessionSummary.scanned = this.progress.scanned
    this.sessionSummary.found = this.progress.found
    this.sessionSummary.imported = this.progress.done
    this.sessionSummary.skipped = this.progress.skipped
    this.sessionSummary.alreadyKnown = this.progress.alreadyKnown
    this.sessionSummary.totalSkipped = this.progress.totalSkipped
    this.sessionSummary.normalSkipped = this.progress.normalSkipped
    this.sessionSummary.discarded = this.progress.discarded
    this.sessionSummary.failed = this.progress.failed
    this.sessionSummary.retryRecovered = this.progress.retryRecovered
    this.sessionSummary.photos = this.progress.photos

    this.emit('update', { type: 'progress', progress: { ...this.progress } })
  }

  recordReason(diagnostic) {
    const reason = String(diagnostic?.reason || '').trim()
    if (!reason) return

    this.sessionSummary.reasons[reason] = (this.sessionSummary.reasons[reason] || 0) + 1
    const reasonTotal = this.sessionSummary.totalSkipped + this.sessionSummary.failed

    this.sessionSummary.topReasons = Object.entries(this.sessionSummary.reasons)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([code, count]) => {
        const definition = getReasonDefinition(code)
        return {
          code,
          label: definition.label,
          classification: definition.classification,
          count,
          percent: reasonTotal > 0
            ? Number(((count / reasonTotal) * 100).toFixed(1))
            : 0,
        }
      })
  }

  recordSkipDiagnostic(diagnostic) {
    this.skipDiagnostics.unshift({
      ...diagnostic,
      ts: new Date().toISOString(),
    })
    if (this.skipDiagnostics.length > 200) this.skipDiagnostics.length = 200
    this.recordReason(diagnostic)
    this.recordDiagnosticBuckets(diagnostic)
  }

  recordDiagnosticBuckets(diagnostic) {
    if (!diagnostic || typeof diagnostic !== 'object') return

    const reason = String(diagnostic.reason || '').trim()
    if (reason === 'duplicate_encar_id' || reason === 'duplicate_vin') {
      this.sessionSummary.diagnosticBuckets.alreadyKnown += 1
    }
    if (reason === 'duplicate_vin' || reason === 'db_duplicate_race') {
      this.sessionSummary.diagnosticBuckets.duplicate += 1
    }
    if (diagnostic.temporary) {
      this.sessionSummary.diagnosticBuckets.temporaryFail += 1
    }
    if (INVALID_PAGE_REASONS.has(reason)) {
      this.sessionSummary.diagnosticBuckets.invalidPage += 1
    }
  }

  recordPartialImport() {
    this.sessionSummary.diagnosticBuckets.parseIncomplete += 1
  }

  recordRetryRecovered() {
    this.sessionSummary.diagnosticBuckets.recovered += 1
  }

  recordOptimizationHit(name, increment = 1) {
    const key = String(name || '').trim()
    if (!key) return
    if (!Object.prototype.hasOwnProperty.call(this.sessionSummary.optimizationStats, key)) return
    this.sessionSummary.optimizationStats[key] += Math.max(1, Number(increment) || 1)
  }

  finishSession() {
    this.sessionSummary.finishedAt = new Date().toISOString()
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      progress: { ...this.progress },
      config: { ...this.config },
      lastRun: this.lastRun,
      nextRun: this.nextRun,
      startedAt: this.startedAt,
      sessionSummary: {
        ...this.sessionSummary,
        reasons: { ...this.sessionSummary.reasons },
        topReasons: this.sessionSummary.topReasons.slice(0, 20),
        diagnosticBuckets: { ...this.sessionSummary.diagnosticBuckets },
        optimizationStats: { ...this.sessionSummary.optimizationStats },
      },
      skipDiagnostics: this.skipDiagnostics.slice(0, 50),
      logs: this.logs.slice(0, 100),
    }
  }
}

export const state = new ScraperState()

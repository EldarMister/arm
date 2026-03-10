import { EventEmitter } from 'events'

function createProgress(total = 0) {
  return {
    done: 0,
    total,
    failed: 0,
    skipped: 0,
    alreadyKnown: 0,
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
    normalSkipped: 0,
    discarded: 0,
    failed: 0,
    retryRecovered: 0,
    photos: 0,
    reasons: {},
    topReasons: [],
  }
}

class ScraperState extends EventEmitter {
  constructor() {
    super()
    this.setMaxListeners(100)
    this.isRunning   = false
    this.stopReq     = false
    this.progress    = createProgress()
    this.sessionSummary = createSessionSummary()
    this.skipDiagnostics = []
    this.logs        = []          // ring buffer, newest first
    this.config      = { schedule: 'manual', parseScope: 'all', dailyLimit: 100, hour: 10, intervalHours: 1 }
    this.lastRun     = null
    this.nextRun     = null
    this.startedAt   = null
    this.cronJob     = null
  }

  _addLog(level, message, meta = null) {
    const entry = {
      id:  Date.now() + Math.random(),
      ts:  new Date().toISOString(),
      level,
      message,
      ...(meta ? { meta } : {}),
    }
    this.logs.unshift(entry)
    if (this.logs.length > 500) this.logs.length = 500
    this.emit('update', { type: 'log', entry })
    return entry
  }

  info(msg, meta = null)    { return this._addLog('info',    msg, meta) }
  success(msg, meta = null) { return this._addLog('success', msg, meta) }
  warn(msg, meta = null)    { return this._addLog('warn',    msg, meta) }
  error(msg, meta = null)   { return this._addLog('error',   msg, meta) }

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
    this.sessionSummary.scanned = this.progress.scanned
    this.sessionSummary.found = this.progress.found
    this.sessionSummary.imported = this.progress.done
    this.sessionSummary.skipped = this.progress.skipped
    this.sessionSummary.alreadyKnown = this.progress.alreadyKnown
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

    const current = this.sessionSummary.reasons[reason] || 0
    this.sessionSummary.reasons[reason] = current + 1
    const reasonTotal = this.sessionSummary.skipped + this.sessionSummary.failed + this.sessionSummary.alreadyKnown
    this.sessionSummary.topReasons = Object.entries(this.sessionSummary.reasons)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([code, count]) => ({
        code,
        count,
        percent: reasonTotal > 0
          ? Number(((count / reasonTotal) * 100).toFixed(1))
          : 0,
      }))
  }

  recordSkipDiagnostic(diagnostic) {
    this.skipDiagnostics.unshift({
      ...diagnostic,
      ts: new Date().toISOString(),
    })
    if (this.skipDiagnostics.length > 200) this.skipDiagnostics.length = 200
    this.recordReason(diagnostic)
  }

  finishSession() {
    this.sessionSummary.finishedAt = new Date().toISOString()
  }

  getStatus() {
    return {
      isRunning:  this.isRunning,
      progress:   { ...this.progress },
      config:     { ...this.config },
      lastRun:    this.lastRun,
      nextRun:    this.nextRun,
      startedAt:  this.startedAt,
      sessionSummary: {
        ...this.sessionSummary,
        reasons: { ...this.sessionSummary.reasons },
        topReasons: this.sessionSummary.topReasons.slice(0, 20),
      },
      skipDiagnostics: this.skipDiagnostics.slice(0, 50),
      logs:       this.logs.slice(0, 100),
    }
  }
}

export const state = new ScraperState()

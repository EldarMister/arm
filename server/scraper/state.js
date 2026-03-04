import { EventEmitter } from 'events'

class ScraperState extends EventEmitter {
  constructor() {
    super()
    this.setMaxListeners(100)
    this.isRunning   = false
    this.stopReq     = false
    this.progress    = { done: 0, total: 0, failed: 0, skipped: 0, photos: 0 }
    this.logs        = []          // ring buffer, newest first
    this.config      = { schedule: 'manual', dailyLimit: 100, hour: 10, intervalHours: 1 }
    this.lastRun     = null
    this.nextRun     = null
    this.startedAt   = null
    this.cronJob     = null
  }

  _addLog(level, message) {
    const entry = {
      id:  Date.now() + Math.random(),
      ts:  new Date().toISOString(),
      level,
      message,
    }
    this.logs.unshift(entry)
    if (this.logs.length > 500) this.logs.length = 500
    this.emit('update', { type: 'log', entry })
    return entry
  }

  info(msg)    { return this._addLog('info',    msg) }
  success(msg) { return this._addLog('success', msg) }
  warn(msg)    { return this._addLog('warn',    msg) }
  error(msg)   { return this._addLog('error',   msg) }

  setProgress(updates) {
    Object.assign(this.progress, updates)
    this.emit('update', { type: 'progress', progress: { ...this.progress } })
  }

  getStatus() {
    return {
      isRunning:  this.isRunning,
      progress:   { ...this.progress },
      config:     { ...this.config },
      lastRun:    this.lastRun,
      nextRun:    this.nextRun,
      startedAt:  this.startedAt,
      logs:       this.logs.slice(0, 100),
    }
  }
}

export const state = new ScraperState()

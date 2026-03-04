import { Router } from 'express'
import pool from '../db.js'
import { state } from '../scraper/state.js'
import { runScrapeJob } from '../scraper/job.js'
import { startScheduler, stopScheduler } from '../scraper/scheduler.js'

const router = Router()

// ── GET /api/scraper/status ──────────────────────────────────────────────────
router.get('/status', async (_req, res) => {
  let dbStats = { totalScraped: 0, todayScraped: 0 }
  try {
    const r = await pool.query('SELECT total_scraped, today_scraped FROM scraper_config WHERE id=1')
    if (r.rows.length) {
      dbStats.totalScraped = r.rows[0].total_scraped || 0
      dbStats.todayScraped = r.rows[0].today_scraped || 0
    }
  } catch { /* non-critical */ }

  res.json({ ...state.getStatus(), dbStats })
})

// ── GET /api/scraper/logs ────────────────────────────────────────────────────
router.get('/logs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 200, 500)
  res.json(state.logs.slice(0, limit))
})

// ── POST /api/scraper/start ──────────────────────────────────────────────────
router.post('/start', (req, res) => {
  if (state.isRunning) {
    return res.status(409).json({ error: 'Парсер уже работает' })
  }

  const limit = Math.max(1, Math.min(parseInt(req.body.limit) || state.config.dailyLimit, 1000))

  // Fire-and-forget
  runScrapeJob(limit).catch(err => state.error(`Необработанная ошибка: ${err.message}`))

  res.json({ ok: true, message: `Запущен (лимит: ${limit})`, limit })
})

// ── POST /api/scraper/stop ───────────────────────────────────────────────────
router.post('/stop', (req, res) => {
  if (!state.isRunning) {
    return res.status(409).json({ error: 'Парсер не запущен' })
  }
  state.stopReq = true
  res.json({ ok: true, message: 'Запрос на остановку отправлен' })
})

// ── PUT /api/scraper/config ───────────────────────────────────────────────────
router.put('/config', async (req, res) => {
  const { schedule, dailyLimit, hour, intervalHours } = req.body

  if (schedule !== undefined) {
    if (!['manual', 'hourly', 'daily'].includes(schedule))
      return res.status(400).json({ error: 'Неверное расписание' })
    state.config.schedule = schedule
  }
  if (dailyLimit !== undefined)
    state.config.dailyLimit = Math.max(1, Math.min(parseInt(dailyLimit) || 100, 1000))
  if (hour !== undefined)
    state.config.hour = Math.max(0, Math.min(23, parseInt(hour) || 10))
  if (intervalHours !== undefined)
    state.config.intervalHours = Math.max(1, Math.min(12, parseInt(intervalHours) || 1))

  // Save to DB
  try {
    await pool.query(
      `UPDATE scraper_config SET
         schedule=$1, daily_limit=$2, start_hour=$3, interval_hours=$4
       WHERE id=1`,
      [state.config.schedule, state.config.dailyLimit, state.config.hour, state.config.intervalHours]
    )
  } catch { /* non-critical */ }

  // Restart scheduler
  if (state.config.schedule !== 'manual') {
    startScheduler(state.config)
  } else {
    stopScheduler()
  }

  res.json({ ok: true, config: { ...state.config } })
})

// ── GET /api/scraper/stream  (Server-Sent Events) ────────────────────────────
router.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders?.()

  const send = (data) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`)
    } catch { /* client disconnected */ }
  }

  // Send current state immediately
  send({ type: 'status', ...state.getStatus() })

  const onUpdate = (data) => send(data)
  state.on('update', onUpdate)

  // Keep-alive ping every 20 s
  const ping = setInterval(() => {
    try { res.write(': ping\n\n') } catch { clearInterval(ping) }
  }, 20000)

  req.on('close', () => {
    state.off('update', onUpdate)
    clearInterval(ping)
  })
})

// ── GET /api/scraper/stats ───────────────────────────────────────────────────
router.get('/stats', async (_req, res) => {
  try {
    const [cfg, carsCount, todayCars] = await Promise.all([
      pool.query('SELECT * FROM scraper_config WHERE id=1'),
      pool.query('SELECT COUNT(*) FROM cars'),
      pool.query(`SELECT COUNT(*) FROM cars WHERE created_at >= CURRENT_DATE`),
    ])
    res.json({
      config:       cfg.rows[0] || {},
      totalCars:    parseInt(carsCount.rows[0].count) || 0,
      todayCars:    parseInt(todayCars.rows[0].count) || 0,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router

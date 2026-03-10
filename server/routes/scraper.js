import { Router } from 'express'
import pool from '../db.js'
import { state } from '../scraper/state.js'
import { runScrapeJob } from '../scraper/job.js'
import { startScheduler, stopScheduler } from '../scraper/scheduler.js'

const router = Router()
const PARSE_SCOPE_ALL = 'all'
const PARSE_SCOPE_IMPORTED = 'imported'
const PARSE_SCOPE_JAPANESE = 'japanese'
const PARSE_SCOPE_GERMAN = 'german'
const PARSE_SCOPE_OPTIONS = new Set([
  PARSE_SCOPE_ALL,
  PARSE_SCOPE_IMPORTED,
  PARSE_SCOPE_JAPANESE,
  PARSE_SCOPE_GERMAN,
])

function normalizeParseScope(value) {
  return PARSE_SCOPE_OPTIONS.has(value) ? value : PARSE_SCOPE_ALL
}

function formatParseScopeLabel(parseScope) {
  if (parseScope === PARSE_SCOPE_IMPORTED) return 'только импортные'
  if (parseScope === PARSE_SCOPE_JAPANESE) return 'только японские'
  if (parseScope === PARSE_SCOPE_GERMAN) return 'только немецкие'
  return 'все машины'
}

router.get('/status', async (_req, res) => {
  let dbStats = { totalScraped: 0, todayScraped: 0 }
  try {
    const result = await pool.query('SELECT total_scraped, today_scraped FROM scraper_config WHERE id=1')
    if (result.rows.length) {
      dbStats.totalScraped = result.rows[0].total_scraped || 0
      dbStats.todayScraped = result.rows[0].today_scraped || 0
    }
  } catch {
    // Non-critical stats read failure.
  }

  res.json({ ...state.getStatus(), dbStats })
})

router.get('/logs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500)
  res.json(state.logs.slice(0, limit))
})

router.post('/start', (req, res) => {
  if (state.isRunning) {
    return res.status(409).json({ error: 'Парсер уже работает' })
  }

  const limit = Math.max(1, Math.min(parseInt(req.body.limit, 10) || state.config.dailyLimit, 5000))
  const parseScope = normalizeParseScope(req.body.parseScope ?? state.config.parseScope)
  state.config.parseScope = parseScope

  runScrapeJob(limit, { parseScope }).catch((error) => {
    state.error(`Необработанная ошибка запуска: ${error.message}`)
  })

  if (state.config.schedule !== 'manual') {
    startScheduler(state.config)
  }

  return res.json({
    ok: true,
    message: `Запущен режим "${formatParseScopeLabel(parseScope)}", лимит ${limit}`,
    limit,
    parseScope,
  })
})

router.post('/stop', (_req, res) => {
  if (!state.isRunning) {
    return res.status(409).json({ error: 'Парсер не запущен' })
  }

  state.stopReq = true
  return res.json({ ok: true, message: 'Запрос на остановку отправлен' })
})

router.put('/config', async (req, res) => {
  const {
    schedule,
    parseScope,
    dailyLimit,
    hour,
    intervalHours,
  } = req.body

  if (schedule !== undefined) {
    if (!['manual', 'hourly', 'daily'].includes(schedule)) {
      return res.status(400).json({ error: 'Неверное расписание' })
    }
    state.config.schedule = schedule
  }

  if (parseScope !== undefined) {
    if (!PARSE_SCOPE_OPTIONS.has(parseScope)) {
      return res.status(400).json({ error: 'Неверный режим парсинга' })
    }
    state.config.parseScope = normalizeParseScope(parseScope)
  }

  if (dailyLimit !== undefined) {
    state.config.dailyLimit = Math.max(1, Math.min(parseInt(dailyLimit, 10) || 100, 5000))
  }

  if (hour !== undefined) {
    state.config.hour = Math.max(0, Math.min(23, parseInt(hour, 10) || 10))
  }

  if (intervalHours !== undefined) {
    state.config.intervalHours = Math.max(1, Math.min(12, parseInt(intervalHours, 10) || 1))
  }

  try {
    await pool.query(
      `UPDATE scraper_config
       SET schedule = $1,
           parse_scope = $2,
           daily_limit = $3,
           start_hour = $4,
           interval_hours = $5
       WHERE id = 1`,
      [
        state.config.schedule,
        state.config.parseScope,
        state.config.dailyLimit,
        state.config.hour,
        state.config.intervalHours,
      ],
    )
  } catch {
    // Non-critical config persistence failure.
  }

  if (state.config.schedule !== 'manual') {
    startScheduler(state.config)
  } else {
    stopScheduler()
  }

  return res.json({ ok: true, config: { ...state.config } })
})

router.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders?.()

  const send = (data) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`)
    } catch {
      // Client disconnected.
    }
  }

  send({ type: 'status', ...state.getStatus() })

  const onUpdate = (data) => send(data)
  state.on('update', onUpdate)

  const ping = setInterval(() => {
    try {
      res.write(': ping\n\n')
    } catch {
      clearInterval(ping)
    }
  }, 20000)

  req.on('close', () => {
    state.off('update', onUpdate)
    clearInterval(ping)
  })
})

router.get('/stats', async (_req, res) => {
  try {
    const [cfg, carsCount, todayCars] = await Promise.all([
      pool.query('SELECT * FROM scraper_config WHERE id=1'),
      pool.query('SELECT COUNT(*) FROM cars'),
      pool.query('SELECT COUNT(*) FROM cars WHERE created_at >= CURRENT_DATE'),
    ])

    return res.json({
      config: cfg.rows[0] || {},
      totalCars: parseInt(carsCount.rows[0].count, 10) || 0,
      todayCars: parseInt(todayCars.rows[0].count, 10) || 0,
    })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
})

export default router

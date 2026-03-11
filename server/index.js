import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import pool from './db.js'
import carsRouter from './routes/cars.js'
import imagesRouter from './routes/images.js'
import encarRouter from './routes/encar.js'
import adminRouter from './routes/admin.js'
import scraperRouter from './routes/scraper.js'
import { startScheduler } from './scraper/scheduler.js'
import { state as scraperState } from './scraper/state.js'
import {
  applyBasicSecurityHeaders,
  createRateLimitMiddleware,
  sendSafeApiError,
} from './lib/requestSecurity.js'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const ENV = globalThis.process?.env || {}
const PORT = ENV.PORT || 3001
const PARSE_SCOPE_OPTIONS = new Set(['all', 'domestic', 'imported', 'japanese', 'german'])
const API_RATE_LIMIT_WINDOW_MS = 60 * 1000
const API_RATE_LIMIT_MAX = 60

function getPublicRuntimeConfig() {
  return {
    VITE_CLERK_PUBLISHABLE_KEY: String(ENV.VITE_CLERK_PUBLISHABLE_KEY || ''),
  }
}

// Middleware
app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use(cors())
app.use(applyBasicSecurityHeaders)
app.use('/api', createRateLimitMiddleware({
  windowMs: API_RATE_LIMIT_WINDOW_MS,
  max: API_RATE_LIMIT_MAX,
  message: 'Слишком много запросов. Повторите позже.',
  skip: (req) => req.path === '/health' || req.method === 'OPTIONS',
  logLabel: 'API_RATE_LIMIT',
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Статика для загруженных фото
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// Роуты
app.use('/api/cars', carsRouter)
app.use('/api/cars', imagesRouter)
app.use('/api/encar', encarRouter)
app.use('/api/admin', adminRouter)
app.use('/api/scraper', scraperRouter)
app.delete('/api/images/:id', (req, res, next) => {
  req.url = `/${req.params.id}`
  imagesRouter(req, res, next)
})

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

app.get('/api/runtime-config.js', (_req, res) => {
  res.type('application/javascript')
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.send(`window.__APP_CONFIG__ = ${JSON.stringify(getPublicRuntimeConfig())};`)
})

// В production — раздаём собранный React-фронтенд
if (ENV.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', 'dist')
  app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
        return
      }

      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        return
      }

      res.setHeader('Cache-Control', 'public, max-age=300')
    },
  }))
  // SPA fallback — все остальные маршруты → index.html
  app.get(/.*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error)
  }

  if (req.originalUrl?.startsWith('/api/')) {
    if (error?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Некорректный JSON' })
    }

    return sendSafeApiError(req, res, error, 'Внутренняя ошибка сервера')
  }

  console.error(`REQUEST_ERROR | ${req.method} ${req.originalUrl} |`, error?.stack || error?.message || error)
  return res.status(500).send('Internal Server Error')
})

// Инициализация БД и запуск
async function start() {
  try {
    // Создаём таблицы если не существуют
    const fs = await import('fs')
    const schemaSQL = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8')
    await pool.query(schemaSQL)
    console.log('✅ База данных готова')

    // Загружаем конфиг парсера из БД и восстанавливаем расписание
    try {
      const cfgResult = await pool.query('SELECT * FROM scraper_config WHERE id=1')
      if (cfgResult.rows.length) {
        const cfg = cfgResult.rows[0]
        scraperState.config.schedule      = cfg.schedule       || 'manual'
        scraperState.config.parseScope    = PARSE_SCOPE_OPTIONS.has(cfg.parse_scope) ? cfg.parse_scope : 'all'
        scraperState.config.dailyLimit    = cfg.daily_limit    || 100
        scraperState.config.hour          = cfg.start_hour     || 10
        scraperState.config.intervalHours = cfg.interval_hours || 1
        scraperState.lastRun = cfg.last_run ? new Date(cfg.last_run).toISOString() : null
        if (scraperState.config.schedule !== 'manual') {
          startScheduler(scraperState.config)
          console.log(`⏰ Планировщик восстановлен: ${scraperState.config.schedule}`)
        }
      }
    } catch (e) {
      console.warn('⚠️ Не удалось загрузить конфиг парсера:', e.message)
    }

    app.listen(PORT, () => {
      console.log(`🚀 Сервер запущен на http://localhost:${PORT}`)
    })
  } catch (err) {
    console.error('❌ Ошибка запуска:', err.message)
    globalThis.process?.exit?.(1)
  }
}

start()

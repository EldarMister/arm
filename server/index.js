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
import authRouter from './routes/auth.js'
import { startScheduler } from './scraper/scheduler.js'
import { state as scraperState } from './scraper/state.js'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors())
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
app.use('/api/auth', authRouter)
app.delete('/api/images/:id', (req, res, next) => {
  req.url = `/${req.params.id}`
  imagesRouter(req, res, next)
})

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

// В production — раздаём собранный React-фронтенд
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', 'dist')
  app.use(express.static(distPath))
  // SPA fallback — все остальные маршруты → index.html
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

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
    process.exit(1)
  }
}

start()

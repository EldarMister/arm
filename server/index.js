import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import pool from './db.js'
import carsRouter from './routes/cars.js'
import imagesRouter from './routes/images.js'
import encarRouter from './routes/encar.js'

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
app.use('/api/cars',        carsRouter)
app.use('/api/cars',        imagesRouter)
app.use('/api/encar',       encarRouter)
app.delete('/api/images/:id', (req, res, next) => {
  req.url = `/${req.params.id}`
  imagesRouter(req, res, next)
})

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

// Инициализация БД и запуск
async function start() {
  try {
    // Создаём таблицы если не существуют
    const fs = await import('fs')
    const schemaSQL = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8')
    await pool.query(schemaSQL)
    console.log('✅ База данных готова')

    app.listen(PORT, () => {
      console.log(`🚀 Сервер запущен на http://localhost:${PORT}`)
    })
  } catch (err) {
    console.error('❌ Ошибка запуска:', err.message)
    process.exit(1)
  }
}

start()

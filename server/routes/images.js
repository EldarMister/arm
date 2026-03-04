import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import pool from '../db.js'
import { upload } from '../middleware/upload.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const router = Router()

// POST /api/cars/:id/images — загрузить фото
router.post('/:id/images', upload.array('images', 30), async (req, res) => {
  try {
    const carId = req.params.id
    const car = await pool.query('SELECT id FROM cars WHERE id=$1', [carId])
    if (!car.rows.length) return res.status(404).json({ error: 'Машина не найдена' })

    if (!req.files?.length) return res.status(400).json({ error: 'Файлы не переданы' })

    // Позиция: начиная с текущего максимума
    const posResult = await pool.query(
      'SELECT COALESCE(MAX(position), -1) as maxpos FROM car_images WHERE car_id=$1',
      [carId]
    )
    let pos = posResult.rows[0].maxpos + 1

    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`
    const inserted = []

    for (const file of req.files) {
      const url = `${baseUrl}/uploads/${file.filename}`
      const result = await pool.query(
        'INSERT INTO car_images (car_id, url, position) VALUES ($1,$2,$3) RETURNING *',
        [carId, url, pos++]
      )
      inserted.push(result.rows[0])
    }

    res.status(201).json(inserted)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// DELETE /api/images/:id — удалить фото
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM car_images WHERE id=$1 RETURNING *',
      [req.params.id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Не найдено' })

    // Удаляем файл с диска (если локальный)
    const url = result.rows[0].url
    const filename = path.basename(url)
    const filePath = path.join(__dirname, '..', 'uploads', filename)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)

    res.json({ deleted: result.rows[0].id })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

export default router

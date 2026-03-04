import { Router } from 'express'
import pool from '../db.js'

const router = Router()

// GET /api/cars — список с фильтрами, сортировкой, пагинацией
router.get('/', async (req, res) => {
  try {
    const {
      brand, minPrice, maxPrice,
      minYear, maxYear,
      minMileage, maxMileage,
      fuel, drive, body, color,
      sort = 'newest',
      page = 1, limit = 20,
    } = req.query

    const conditions = []
    const params = []
    let p = 1

    if (brand) {
      conditions.push(`name ILIKE $${p++}`)
      params.push(`%${brand}%`)
    }
    if (minPrice) { conditions.push(`price_usd >= $${p++}`); params.push(Number(minPrice)) }
    if (maxPrice) { conditions.push(`price_usd <= $${p++}`); params.push(Number(maxPrice)) }
    if (minYear)  { conditions.push(`year >= $${p++}`);      params.push(minYear) }
    if (maxYear)  { conditions.push(`year <= $${p++}`);      params.push(maxYear) }
    if (minMileage) { conditions.push(`mileage >= $${p++}`); params.push(Number(minMileage)) }
    if (maxMileage) { conditions.push(`mileage <= $${p++}`); params.push(Number(maxMileage)) }
    if (fuel)  { conditions.push(`$${p++} = ANY(tags)`);  params.push(fuel) }
    if (drive) { conditions.push(`$${p++} = ANY(tags)`);  params.push(drive) }
    if (body)  { conditions.push(`$${p++} = ANY(tags)`);  params.push(body) }
    if (color) { conditions.push(`body_color ILIKE $${p++}`); params.push(`%${color}%`) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const sortMap = {
      newest:    'c.created_at DESC',
      oldest:    'c.created_at ASC',
      price_asc: 'c.price_usd ASC',
      price_desc:'c.price_usd DESC',
      mileage:   'c.mileage ASC',
      year_desc: 'c.year DESC',
      year_asc:  'c.year ASC',
    }
    const orderBy = sortMap[sort] || 'c.created_at DESC'

    const offset = (Number(page) - 1) * Number(limit)

    // Общее кол-во
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM cars c ${where}`,
      params
    )
    const total = parseInt(countResult.rows[0].count)

    // Сами машины + фото
    const carsResult = await pool.query(
      `SELECT c.*,
        COALESCE(
          json_agg(ci ORDER BY ci.position ASC) FILTER (WHERE ci.id IS NOT NULL),
          '[]'
        ) AS images
       FROM cars c
       LEFT JOIN car_images ci ON ci.car_id = c.id
       ${where}
       GROUP BY c.id
       ORDER BY ${orderBy}
       LIMIT $${p++} OFFSET $${p++}`,
      [...params, Number(limit), offset]
    )

    res.json({
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / Number(limit)),
      cars: carsResult.rows,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// GET /api/cars/:id — одна машина
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*,
        COALESCE(
          json_agg(ci ORDER BY ci.position ASC) FILTER (WHERE ci.id IS NOT NULL),
          '[]'
        ) AS images
       FROM cars c
       LEFT JOIN car_images ci ON ci.car_id = c.id
       WHERE c.id = $1
       GROUP BY c.id`,
      [req.params.id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Не найдено' })
    res.json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// POST /api/cars — создать машину
router.post('/', async (req, res) => {
  try {
    const {
      name, model, year, mileage,
      body_color, body_color_dots,
      interior_color, interior_color_dots,
      location, vin,
      price_krw, price_usd,
      commission, delivery, loading, unloading, storage, vat_refund, total,
      encar_url, encar_id, can_negotiate, tags,
    } = req.body

    const result = await pool.query(
      `INSERT INTO cars
        (name, model, year, mileage,
         body_color, body_color_dots, interior_color, interior_color_dots,
         location, vin, price_krw, price_usd,
         commission, delivery, loading, unloading, storage, vat_refund, total,
         encar_url, encar_id, can_negotiate, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       RETURNING *`,
      [
        name, model, year, mileage || 0,
        body_color, body_color_dots || [], interior_color, interior_color_dots || [],
        location, vin, price_krw || 0, price_usd || 0,
        commission || 200, delivery || 0, loading || 0, unloading || 0,
        storage || 0, vat_refund || 0, total || 0,
        encar_url, encar_id, can_negotiate || false, tags || [],
      ]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// PUT /api/cars/:id — обновить машину
router.put('/:id', async (req, res) => {
  try {
    const fields = [
      'name','model','year','mileage',
      'body_color','body_color_dots','interior_color','interior_color_dots',
      'location','vin','price_krw','price_usd',
      'commission','delivery','loading','unloading','storage','vat_refund','total',
      'encar_url','encar_id','can_negotiate','tags',
    ]
    const updates = []
    const params = []
    let p = 1

    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = $${p++}`)
        params.push(req.body[f])
      }
    })

    if (!updates.length) return res.status(400).json({ error: 'Нет данных для обновления' })

    updates.push(`updated_at = NOW()`)
    params.push(req.params.id)

    const result = await pool.query(
      `UPDATE cars SET ${updates.join(', ')} WHERE id = $${p} RETURNING *`,
      params
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Не найдено' })
    res.json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// DELETE /api/cars/:id — удалить машину
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM cars WHERE id=$1 RETURNING id', [req.params.id])
    if (!result.rows.length) return res.status(404).json({ error: 'Не найдено' })
    res.json({ deleted: result.rows[0].id })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

export default router

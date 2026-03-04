import { Router } from 'express'
import pool from '../db.js'

const router = Router()

// GET /api/admin/filter-options — динамические опции для фильтров
router.get('/filter-options', async (_req, res) => {
  try {
    const [brands, fuelTypes, driveTypes, bodyTypes, bodyColors, interiorColors, yearRange, priceRange, mileageRange] = await Promise.all([
      // Бренды (по полю name — первое слово)
      pool.query(`
        SELECT
          SPLIT_PART(name, ' ', 1) AS brand,
          COUNT(*) AS count
        FROM cars
        GROUP BY brand
        ORDER BY count DESC
        LIMIT 30
      `),
      // Тип топлива из tags
      pool.query(`
        SELECT tag AS name, COUNT(*) AS count
        FROM cars, UNNEST(tags) AS tag
        WHERE tag ILIKE ANY(ARRAY['%бензин%','%дизель%','%электро%','%газ%','%гибрид%','%водород%'])
        GROUP BY tag
        ORDER BY count DESC
      `),
      // Тип привода из tags
      pool.query(`
        SELECT tag AS name, COUNT(*) AS count
        FROM cars, UNNEST(tags) AS tag
        WHERE tag ILIKE ANY(ARRAY['%fwd%','%awd%','%4wd%','%rwd%','%передний%','%полный%','%задний%'])
        GROUP BY tag
        ORDER BY count DESC
      `),
      // Тип кузова из tags
      pool.query(`
        SELECT tag AS name, COUNT(*) AS count
        FROM cars, UNNEST(tags) AS tag
        WHERE tag NOT ILIKE ANY(ARRAY['%fwd%','%awd%','%4wd%','%rwd%','%передний%','%полный%','%задний%','%бензин%','%дизель%','%электро%','%газ%','%гибрид%','%водород%'])
        GROUP BY tag
        ORDER BY count DESC
        LIMIT 20
      `),
      // Цвет кузова
      pool.query(`
        SELECT body_color AS name, COUNT(*) AS count
        FROM cars
        WHERE body_color IS NOT NULL AND body_color != ''
        GROUP BY body_color
        ORDER BY count DESC
        LIMIT 20
      `),
      // Цвет салона
      pool.query(`
        SELECT interior_color AS name, COUNT(*) AS count
        FROM cars
        WHERE interior_color IS NOT NULL AND interior_color != ''
        GROUP BY interior_color
        ORDER BY count DESC
        LIMIT 20
      `),
      // Диапазон годов
      pool.query(`
        SELECT MIN(year::integer) as min_year, MAX(year::integer) as max_year
        FROM cars WHERE year ~ '^[0-9]{4}$'
      `),
      // Диапазон цен
      pool.query(`
        SELECT MIN(price_usd) as min_price, MAX(price_usd) as max_price FROM cars
      `),
      // Диапазон пробега
      pool.query(`
        SELECT MIN(mileage) as min_mileage, MAX(mileage) as max_mileage FROM cars
      `),
    ])

    res.json({
      brands: brands.rows.map(r => ({ name: r.brand, count: parseInt(r.count) })),
      fuelTypes: fuelTypes.rows.map(r => ({ name: r.name, count: parseInt(r.count) })),
      driveTypes: driveTypes.rows.map(r => ({ name: r.name, count: parseInt(r.count) })),
      bodyTypes: bodyTypes.rows.map(r => ({ name: r.name, count: parseInt(r.count) })),
      bodyColors: bodyColors.rows.map(r => ({ name: r.name, count: parseInt(r.count) })),
      interiorColors: interiorColors.rows.map(r => ({ name: r.name, count: parseInt(r.count) })),
      yearRange: yearRange.rows[0] || { min_year: 1990, max_year: new Date().getFullYear() },
      priceRange: priceRange.rows[0] || { min_price: 0, max_price: 100000 },
      mileageRange: mileageRange.rows[0] || { min_mileage: 0, max_mileage: 500000 },
      totalCars: (await pool.query('SELECT COUNT(*) FROM cars')).rows[0].count,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// GET /api/admin/stats — статистика для дашборда
router.get('/stats', async (_req, res) => {
  try {
    const [total, recent, avgPrice, topBrands] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM cars'),
      pool.query('SELECT COUNT(*) as count FROM cars WHERE created_at > NOW() - INTERVAL \'7 days\''),
      pool.query('SELECT ROUND(AVG(price_usd)::numeric, 0) as avg FROM cars WHERE price_usd > 0'),
      pool.query(`
        SELECT SPLIT_PART(name,' ',1) AS brand, COUNT(*) AS count
        FROM cars GROUP BY brand ORDER BY count DESC LIMIT 5
      `),
    ])

    res.json({
      totalCars: parseInt(total.rows[0].count),
      addedThisWeek: parseInt(recent.rows[0].count),
      avgPriceUSD: parseInt(avgPrice.rows[0].avg || 0),
      topBrands: topBrands.rows.map(r => ({ name: r.brand, count: parseInt(r.count) })),
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

export default router

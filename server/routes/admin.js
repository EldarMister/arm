import { Router } from 'express'
import pool from '../db.js'

const router = Router()

const HANGUL_RE = /[\uAC00-\uD7A3]/u

const COLOR_SWATCH = {
  Черный: { color: '#1a1a1a' },
  Белый: { color: '#f0f0f0', border: '#d1d5db' },
  Серый: { color: '#6b7280' },
  Серебристый: { color: '#d1d5db', border: '#9ca3af' },
  Синий: { color: '#1d4ed8' },
  Красный: { color: '#dc2626' },
  Зеленый: { color: '#16a34a' },
  Бежевый: { color: '#d4a96a' },
  Коричневый: { color: '#92400e' },
  Оранжевый: { color: '#f97316' },
  Желтый: { color: '#eab308' },
  Фиолетовый: { color: '#7c3aed' },
}

const KO = {
  kia: '\uAE30\uC544',
  hyundai: '\uD604\uB300',
  genesis: '\uC81C\uB124\uC2DC\uC2A4',
  chevrolet: '\uC250\uBCF4\uB808',
  renault: '\uB974\uB178',
  samsung: '\uC0BC\uC131',
  ssangyong: '\uC30D\uC6A9',
  kgMobility: '\uBAA8\uBE4C\uB9AC\uD2F0',
  diesel: '\uB514\uC824',
  gasoline: '\uAC00\uC194\uB9B0',
  gasolineAlt: '\uD718\uBC1C\uC720',
  hybrid: '\uD558\uC774\uBE0C\uB9AC\uB4DC',
  electric: '\uC804\uAE30',
  lpg: '\uC5D8\uD53C\uC9C0',
  hydrogen: '\uC218\uC18C',
  fwd: '\uC804\uB95C',
  rwd: '\uD6C4\uB95C',
  awd4wd: '\uC0AC\uB95C',
  sedan: '\uC138\uB2E8',
  hatchback: '\uD574\uCE58\uBC31',
  wagon: '\uC65C\uAC74',
  minivan: '\uBBF8\uB2C8\uBC34',
  van: '\uBC34',
  coupe: '\uCFE0\uD398',
  truck: '\uD2B8\uB7ED',
  cargo: '\uD654\uBB3C',
  crossover: '\uD06C\uB85C\uC2A4\uC624\uBC84',
  black: '\uAC80\uC815',
  blackAlt: '\uD751\uC0C9',
  white: '\uD770\uC0C9',
  whiteAlt: '\uBC31\uC0C9',
  silver: '\uC740\uC0C9',
  gray: '\uD68C\uC0C9',
  grayAlt: '\uC950\uC0C9',
  blue: '\uCCAD\uC0C9',
  blueAlt: '\uD30C\uB791',
  red: '\uD64D\uC0C9',
  redAlt: '\uBE68\uAC15',
  green: '\uB179\uC0C9',
  greenAlt: '\uCD08\uB85D',
  brown: '\uAC08\uC0C9',
  beige: '\uBCA0\uC774\uC9C0',
  orange: '\uC8FC\uD669',
  yellow: '\uB178\uB791',
  purple: '\uBCF4\uB77C',
}

function hasAny(value, needles) {
  const src = String(value || '')
  return needles.some((needle) => src.includes(needle))
}

function stripHangul(value) {
  return String(value || '')
    .replace(/[\uAC00-\uD7A3]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeBrand(value) {
  const src = String(value || '').trim()
  if (!src) return ''
  const low = src.toLowerCase()

  if (low.includes('kia') || src.includes(KO.kia)) return 'Kia'
  if (low.includes('hyundai') || src.includes(KO.hyundai)) return 'Hyundai'
  if (low.includes('genesis') || src.includes(KO.genesis)) return 'Genesis'
  if (low.includes('chevrolet') || src.includes(KO.chevrolet)) return 'Chevrolet'
  if (low.includes('renault') || src.includes(KO.renault) || src.includes(KO.samsung)) return 'Renault Korea'
  if (
    low.includes('kg mobility') ||
    low.includes('kgmobilriti') ||
    low.includes('ssangyong') ||
    src.includes(KO.ssangyong) ||
    src.includes(KO.kgMobility)
  ) {
    return 'KG Mobility (SsangYong)'
  }
  if (low.includes('mercedes')) return 'Mercedes-Benz'
  if (low.includes('bmw')) return 'BMW'
  if (low.includes('audi')) return 'Audi'
  if (low.includes('toyota')) return 'Toyota'
  if (low.includes('honda')) return 'Honda'
  if (low.includes('volkswagen')) return 'Volkswagen'
  if (low.includes('nissan')) return 'Nissan'
  if (low.includes('lexus')) return 'Lexus'

  const stripped = stripHangul(src)
  return stripped || src
}

function normalizeFuel(value) {
  const src = String(value || '').trim()
  if (!src) return ''
  const low = src.toLowerCase()

  if (low.includes('diesel') || low.includes('дизел') || src.includes(KO.diesel)) return 'Дизель'
  if (low.includes('electric') || low.includes('электро') || src.includes(KO.electric)) return 'Электро'
  if (low.includes('lpg') || low.includes('газ') || src.includes(KO.lpg)) return 'Газ (LPG)'
  if (low.includes('hybrid') || low.includes('гибрид') || src.includes(KO.hybrid)) return 'Бензин (гибрид)'
  if (
    low.includes('gasoline') ||
    low.includes('бензин') ||
    src.includes(KO.gasoline) ||
    src.includes(KO.gasolineAlt)
  ) {
    return 'Бензин'
  }
  if (low.includes('hydrogen') || low.includes('водород') || src.includes(KO.hydrogen)) return 'Водород'

  return HANGUL_RE.test(src) ? '' : src
}

function normalizeDrive(value) {
  const src = String(value || '').trim()
  if (!src) return ''
  const low = src.toLowerCase()

  if (low.includes('2wd') || low.includes('fwd') || low.includes('передн') || src.includes(KO.fwd)) return 'Передний (FWD)'
  if (low.includes('awd') || (low.includes('полный') && low.includes('awd'))) return 'Полный (AWD)'
  if (low.includes('4wd') || (low.includes('полный') && low.includes('4wd')) || src.includes(KO.awd4wd)) return 'Полный (4WD)'
  if (low.includes('rwd') || low.includes('задн') || src.includes(KO.rwd)) return 'Задний (RWD)'

  return ''
}

function normalizeBody(value) {
  const src = String(value || '').trim()
  if (!src) return ''
  const low = src.toLowerCase()

  if (
    low.includes('diesel') ||
    low.includes('gasoline') ||
    low.includes('hybrid') ||
    low.includes('electric') ||
    low.includes('lpg') ||
    low.includes('бенз') ||
    low.includes('дизел') ||
    low.includes('газ') ||
    low.includes('электро') ||
    hasAny(src, [KO.diesel, KO.gasoline, KO.gasolineAlt, KO.hybrid, KO.electric, KO.lpg])
  ) {
    return ''
  }

  if (
    low.includes('suv') ||
    low.includes('crossover') ||
    low.includes('внедорож') ||
    low.includes('кроссов') ||
    src.includes(KO.crossover)
  ) {
    return 'Внедорожники и кроссоверы'
  }
  if (low.includes('sedan') || low.includes('седан') || src.includes(KO.sedan)) return 'Седаны'
  if (low.includes('hatch') || low.includes('хэтч') || src.includes(KO.hatchback)) return 'Хэтчбеки'
  if (low.includes('wagon') || low.includes('универсал') || src.includes(KO.wagon)) return 'Универсалы'
  if (low.includes('van') || low.includes('minivan') || low.includes('минивэн') || src.includes(KO.minivan) || src.includes(KO.van)) {
    return 'Минивэны'
  }
  if (low.includes('coupe') || low.includes('купе') || low.includes('спорт') || src.includes(KO.coupe)) return 'Купе и спорткары'
  if (low.includes('truck') || low.includes('груз') || src.includes(KO.truck) || src.includes(KO.cargo)) return 'Грузовики'

  return ''
}

function normalizeColor(value) {
  const src = String(value || '').trim()
  if (!src) return ''
  const low = src.toLowerCase()
  const compact = low.replace(/[\s_-]/g, '')

  if (low.includes('black') || /^(geomeunsaek|geomjeongsaek|heugsaek)$/.test(compact) || hasAny(src, [KO.black, KO.blackAlt])) return 'Черный'
  if (low.includes('white') || /^(baegsaek|huinsaek)$/.test(compact) || hasAny(src, [KO.white, KO.whiteAlt])) return 'Белый'
  if (low.includes('silver') || /^(eunsaek)$/.test(compact) || src.includes(KO.silver)) return 'Серебристый'
  if (low.includes('gray') || low.includes('grey') || /^(hoesaek|jwisaek)$/.test(compact) || hasAny(src, [KO.gray, KO.grayAlt])) return 'Серый'
  if (low.includes('blue') || /^(cheongsaek|parangsaek)$/.test(compact) || hasAny(src, [KO.blue, KO.blueAlt])) return 'Синий'
  if (low.includes('red') || /^(ppalgangsaek|hongsaek)$/.test(compact) || hasAny(src, [KO.red, KO.redAlt])) return 'Красный'
  if (low.includes('green') || /^(noksaek|choroksaek)$/.test(compact) || hasAny(src, [KO.green, KO.greenAlt])) return 'Зеленый'
  if (low.includes('brown') || /^(galsaek)$/.test(compact) || src.includes(KO.brown)) return 'Коричневый'
  if (low.includes('beige') || /^(beijisaek)$/.test(compact) || src.includes(KO.beige)) return 'Бежевый'
  if (low.includes('orange') || /^(juhwangsaek)$/.test(compact) || src.includes(KO.orange)) return 'Оранжевый'
  if (low.includes('yellow') || /^(norangsaek)$/.test(compact) || src.includes(KO.yellow)) return 'Желтый'
  if (low.includes('purple') || low.includes('violet') || /^(borasaek)$/.test(compact) || src.includes(KO.purple)) return 'Фиолетовый'

  return HANGUL_RE.test(src) ? '' : src
}

function aggregate(rows, normalizer) {
  const acc = new Map()
  for (const row of rows || []) {
    const rawName = row?.name ?? row?.tag ?? ''
    const normalized = normalizer(rawName)
    if (!normalized) continue
    const count = Number(row?.count) || 0
    acc.set(normalized, (acc.get(normalized) || 0) + count)
  }
  return [...acc.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }))
}

function aggregateBrands(rows) {
  const acc = new Map()
  for (const row of rows || []) {
    const fullName = String(row?.name || '').trim()
    if (!fullName) continue

    const firstToken = fullName.split(/\s+/)[0] || fullName
    const brand = normalizeBrand(firstToken) || normalizeBrand(fullName)
    if (!brand) continue

    const count = Number(row?.count) || 0
    acc.set(brand, (acc.get(brand) || 0) + count)
  }

  return [...acc.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([name, count]) => ({ name, count }))
}

function aggregateColors(rows) {
  const acc = new Map()
  for (const row of rows || []) {
    const name = normalizeColor(row?.name)
    if (!name) continue
    const count = Number(row?.count) || 0
    acc.set(name, (acc.get(name) || 0) + count)
  }

  return [...acc.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({
      name,
      count,
      ...(COLOR_SWATCH[name] || { color: '#9ca3af' }),
    }))
}

router.post('/login', (req, res) => {
  const { password } = req.body || {}
  const correctPass = process.env.ADMIN_PASSWORD || 'admin123'
  if (password === correctPass) {
    return res.json({ ok: true, token: 'adm-ok' })
  }
  return res.status(401).json({ ok: false, error: 'Неверный пароль' })
})

router.get('/filter-options', async (_req, res) => {
  try {
    const [nameCounts, fuelCounts, tagCounts, driveCounts, bodySourceRows, bodyColorRows, interiorColorRows, yearRange, priceRange, mileageRange, total] = await Promise.all([
      pool.query(`
        SELECT name, COUNT(*)::int AS count
        FROM cars
        WHERE name IS NOT NULL AND name != ''
        GROUP BY name
      `),
      pool.query(`
        SELECT fuel_type AS name, COUNT(*)::int AS count
        FROM cars
        WHERE fuel_type IS NOT NULL AND fuel_type != ''
        GROUP BY fuel_type
      `),
      pool.query(`
        SELECT tag AS name, COUNT(*)::int AS count
        FROM cars c
        CROSS JOIN LATERAL UNNEST(COALESCE(c.tags, '{}'::text[])) AS tag
        GROUP BY tag
      `),
      pool.query(`
        SELECT drive_type AS name, COUNT(*)::int AS count
        FROM cars
        WHERE drive_type IS NOT NULL AND drive_type != ''
        GROUP BY drive_type
      `),
      pool.query(`
        SELECT source.name, SUM(source.count)::int AS count
        FROM (
          SELECT tag AS name, COUNT(*)::int AS count
          FROM cars c
          CROSS JOIN LATERAL UNNEST(COALESCE(c.tags, '{}'::text[])) AS tag
          GROUP BY tag
          UNION ALL
          SELECT model AS name, COUNT(*)::int AS count
          FROM cars
          WHERE model IS NOT NULL AND model != ''
          GROUP BY model
          UNION ALL
          SELECT name AS name, COUNT(*)::int AS count
          FROM cars
          WHERE name IS NOT NULL AND name != ''
          GROUP BY name
        ) AS source
        GROUP BY source.name
      `),
      pool.query(`
        SELECT body_color AS name, COUNT(*)::int AS count
        FROM cars
        WHERE body_color IS NOT NULL AND body_color != ''
        GROUP BY body_color
      `),
      pool.query(`
        SELECT interior_color AS name, COUNT(*)::int AS count
        FROM cars
        WHERE interior_color IS NOT NULL AND interior_color != ''
        GROUP BY interior_color
      `),
      pool.query(`
        SELECT MIN(year::integer) AS min_year, MAX(year::integer) AS max_year
        FROM cars
        WHERE year ~ '^[0-9]{4}$'
      `),
      pool.query(`SELECT MIN(price_usd) AS min_price, MAX(price_usd) AS max_price FROM cars`),
      pool.query(`SELECT MIN(mileage) AS min_mileage, MAX(mileage) AS max_mileage FROM cars`),
      pool.query(`SELECT COUNT(*)::int AS count FROM cars`),
    ])

    const brands = aggregateBrands(nameCounts.rows)
    const fuelTypes = aggregate([...fuelCounts.rows, ...tagCounts.rows], normalizeFuel)
    const driveTypes = aggregate([...tagCounts.rows, ...driveCounts.rows], normalizeDrive)
    const bodyTypes = aggregate(bodySourceRows.rows, normalizeBody)
    const bodyColors = aggregateColors(bodyColorRows.rows)
    const interiorColors = aggregateColors(interiorColorRows.rows)

    return res.json({
      brands,
      fuelTypes,
      driveTypes,
      bodyTypes,
      bodyColors,
      interiorColors,
      yearRange: yearRange.rows[0] || { min_year: 1990, max_year: new Date().getFullYear() },
      priceRange: priceRange.rows[0] || { min_price: 0, max_price: 100000 },
      mileageRange: mileageRange.rows[0] || { min_mileage: 0, max_mileage: 500000 },
      totalCars: total.rows[0]?.count || 0,
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Ошибка сервера' })
  }
})

router.get('/stats', async (_req, res) => {
  try {
    const [totalRows, recentRows, avgPriceRows, topBrandRows] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM cars'),
      pool.query("SELECT COUNT(*)::int AS count FROM cars WHERE created_at > NOW() - INTERVAL '7 days'"),
      pool.query('SELECT ROUND(AVG(price_usd)::numeric, 0) AS avg FROM cars WHERE price_usd > 0'),
      pool.query('SELECT name, COUNT(*)::int AS count FROM cars GROUP BY name ORDER BY count DESC LIMIT 100'),
    ])

    const topBrands = aggregateBrands(topBrandRows.rows).slice(0, 5)

    return res.json({
      totalCars: totalRows.rows[0]?.count || 0,
      addedThisWeek: recentRows.rows[0]?.count || 0,
      avgPriceUSD: parseInt(avgPriceRows.rows[0]?.avg || 0, 10),
      topBrands,
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Ошибка сервера' })
  }
})

export default router

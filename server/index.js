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
import authRouter from './routes/auth.js'
import scraperRouter from './routes/scraper.js'
import partsRouter from './routes/parts.js'
import pricingRouter from './routes/pricing.js'
import { startScheduler } from './scraper/scheduler.js'
import { runScrapeJob } from './scraper/job.js'
import { state as scraperState } from './scraper/state.js'
import { startTelegramSubscriberSync } from './lib/telegramNotifications.js'
import {
  configureTelegramFreshParserService,
  startTelegramFreshParserService,
} from './lib/telegramFreshParser.js'
import { startWeeklyCatalogMaintenance } from './lib/weeklyCatalogMaintenance.js'
import {
  applyBasicSecurityHeaders,
  createCorsOptions,
  createRateLimitMiddleware,
  getSafeRequestPath,
  getProductionStartupWarnings,
  sendSafeApiError,
} from './lib/requestSecurity.js'
import {
  buildRobotsTxt,
  getSitemapXml,
  injectSeoIntoHtml,
  resolveRequestSeoWithRedirects,
} from './lib/seo.js'
import { normalizePathname, resolveSiteOrigin } from '../shared/seo.js'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const ENV = globalThis.process?.env || {}
const PORT = ENV.PORT || 3001
const PARSE_SCOPE_OPTIONS = new Set(['all', 'domestic', 'imported', 'japanese', 'german'])
const RUN_PRESET_OPTIONS = new Set(['default', 'fresh_low_engagement'])
const API_RATE_LIMIT_WINDOW_MS = 60 * 1000
const API_RATE_LIMIT_MAX = 60
const REQUEST_BODY_LIMIT = '256kb'
const CANONICAL_ORIGIN = resolveSiteOrigin(
  ENV.PUBLIC_SITE_URL
  || ENV.SITE_URL
  || ENV.BASE_URL
  || 'https://avt-autovtrade.com'
)
const CANONICAL_HOST = new URL(CANONICAL_ORIGIN).host.toLowerCase()
let productionIndexTemplate = ''

function getRequestHost(req) {
  const forwardedHost = req.headers['x-forwarded-host']
  const rawHost = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : (forwardedHost || req.headers.host || '')
  return String(rawHost || '')
    .split(',')[0]
    .trim()
    .replace(/:\d+$/, '')
    .toLowerCase()
}

app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use((req, res, next) => {
  const requestHost = getRequestHost(req)
  if (requestHost && requestHost === `www.${CANONICAL_HOST}`) {
    return res.redirect(308, new URL(req.originalUrl || '/', CANONICAL_ORIGIN).toString())
  }
  return next()
})
app.use(cors(createCorsOptions({
  allowedOrigins: ENV.CORS_ALLOWED_ORIGINS,
})))
app.use(applyBasicSecurityHeaders)
app.use('/api', createRateLimitMiddleware({
  windowMs: API_RATE_LIMIT_WINDOW_MS,
  max: API_RATE_LIMIT_MAX,
  message: 'Слишком много запросов. Повторите позже.',
  skip: (req) => req.path === '/health' || req.method === 'OPTIONS',
  logLabel: 'API_RATE_LIMIT',
}))
app.use(express.json({ limit: REQUEST_BODY_LIMIT }))
app.use(express.urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }))

app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

app.use('/api/cars', carsRouter)
app.use('/api/cars', imagesRouter)
app.use('/api/parts', partsRouter)
app.use('/api/pricing-settings', pricingRouter)
app.use('/api/encar', encarRouter)
app.use('/api/auth', authRouter)
app.use('/api/admin', adminRouter)
app.use('/api/scraper', scraperRouter)
app.delete('/api/images/:id', (req, res, next) => {
  req.url = `/${req.params.id}`
  imagesRouter(req, res, next)
})
app.delete('/api/part-images/:id', (req, res, next) => {
  req.url = `/images/${req.params.id}`
  partsRouter(req, res, next)
})

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

app.get('/robots.txt', (_req, res) => {
  void _req
  res.type('text/plain; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.send(buildRobotsTxt(globalThis.process?.env?.PUBLIC_SITE_URL || globalThis.process?.env?.SITE_URL || globalThis.process?.env?.BASE_URL || 'https://avt-autovtrade.com'))
})

app.get('/sitemap.xml', async (_req, res, next) => {
  void _req
  try {
    const xml = await getSitemapXml(
      globalThis.process?.env?.PUBLIC_SITE_URL
      || globalThis.process?.env?.SITE_URL
      || globalThis.process?.env?.BASE_URL
      || 'https://avt-autovtrade.com'
    )
    res.type('application/xml; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=900')
    res.send(xml)
  } catch (error) {
    next(error)
  }
})

if (ENV.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', 'dist')
  const indexFilePath = path.join(distPath, 'index.html')
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

  app.get(/.*/, async (req, res, next) => {
    try {
      if (!productionIndexTemplate) {
        const fs = await import('fs')
        productionIndexTemplate = fs.readFileSync(indexFilePath, 'utf-8')
      }

      const normalizedPath = normalizePathname(req.path || '/')
      if (normalizedPath !== (req.path || '/')) {
        const search = (() => {
          const index = String(req.originalUrl || '').indexOf('?')
          return index >= 0 ? String(req.originalUrl || '').slice(index) : ''
        })()
        return res.redirect(308, `${normalizedPath}${search}`)
      }

      const { seo, statusCode, redirectLocation } = await resolveRequestSeoWithRedirects(req)
      if (redirectLocation) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
        return res.redirect(statusCode || 308, redirectLocation)
      }

      const html = injectSeoIntoHtml(productionIndexTemplate, seo)

      res.status(statusCode)
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
      res.send(html)
    } catch (error) {
      next(error)
    }
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

    if (error?.type === 'entity.too.large' || error?.status === 413) {
      return res.status(413).json({ error: 'Запрос слишком большой' })
    }

    if (error?.name === 'MulterError') {
      const message = error?.code === 'LIMIT_FILE_SIZE'
        ? 'Файл слишком большой'
        : 'Не удалось обработать файл'
      return res.status(error?.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: message })
    }

    return sendSafeApiError(req, res, error, 'Внутренняя ошибка сервера')
  }

  console.error(`REQUEST_ERROR | ${req.method} ${getSafeRequestPath(req)} |`, error?.stack || error?.message || error)
  return res.status(500).send('Internal Server Error')
})

async function start() {
  try {
    const fs = await import('fs')
    const schemaSQL = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8')
    await pool.query(schemaSQL)
    console.log('Database schema is ready')

    configureTelegramFreshParserService({
      db: pool,
      isScraperRunning: () => scraperState.isRunning,
      runFreshScrapeJob: ({ limit, recipientResolver }) => runScrapeJob(limit, {
        parseScope: 'all',
        runPreset: 'fresh_low_engagement',
        suppressDefaultTelegramNotifications: true,
        onlyFreshLeadNotifications: true,
        telegramRecipientResolver: recipientResolver,
      }),
    })

    const invalidVinCleanup = await pool.query(`
      UPDATE cars
      SET vin = NULL,
          updated_at = NOW()
      WHERE vin IS NOT NULL
        AND BTRIM(vin) <> ''
        AND UPPER(BTRIM(vin)) !~ '^[A-HJ-NPR-Z0-9]{17}$'
      RETURNING id
    `)
    if (invalidVinCleanup.rowCount) {
      console.log(`Invalid VIN cleanup completed: ${invalidVinCleanup.rowCount}`)
    }

    try {
      const cfgResult = await pool.query('SELECT * FROM scraper_config WHERE id=1')
      if (cfgResult.rows.length) {
        const cfg = cfgResult.rows[0]
        scraperState.config.schedule = cfg.schedule || 'manual'
        scraperState.config.parseScope = PARSE_SCOPE_OPTIONS.has(cfg.parse_scope) ? cfg.parse_scope : 'all'
        scraperState.config.runPreset = RUN_PRESET_OPTIONS.has(cfg.run_preset) ? cfg.run_preset : 'default'
        scraperState.config.dailyLimit = cfg.daily_limit || 100
        scraperState.config.hour = cfg.start_hour || 10
        scraperState.config.intervalHours = cfg.interval_hours || 1
        scraperState.lastRun = cfg.last_run ? new Date(cfg.last_run).toISOString() : null
        if (scraperState.config.schedule !== 'manual') {
          startScheduler(scraperState.config)
          console.log(`Scheduler restored: ${scraperState.config.schedule}`)
        }
      }
    } catch (error) {
      console.warn('SCRAPER_CONFIG_LOAD_WARNING |', error?.message || error)
    }

    const startupWarnings = getProductionStartupWarnings(ENV)
    for (const warning of startupWarnings) {
      console.warn(`PRODUCTION_CONFIG_WARNING | ${warning}`)
    }

    startWeeklyCatalogMaintenance()

    app.listen(PORT, () => {
      console.log(`Server started on http://localhost:${PORT}`)
      const telegramSync = startTelegramSubscriberSync()
      if (telegramSync.started) {
        console.log(`Telegram subscriber sync started: every ${telegramSync.intervalMs}ms`)
      }
      const telegramFreshParser = startTelegramFreshParserService()
      if (telegramFreshParser.started) {
        console.log(`Telegram fresh parser started: every ${telegramFreshParser.intervalMs}ms`)
      }
    })
  } catch (error) {
    console.error('SERVER_START_ERROR |', error?.message || error)
    globalThis.process?.exit?.(1)
  }
}

start()

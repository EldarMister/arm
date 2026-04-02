const DEFAULT_PRUNE_INTERVAL_MS = 60 * 1000
const SENSITIVE_QUERY_KEYS = new Set([
  'admin_token',
  'token',
  'access_token',
  'auth',
  'authorization',
])

function normalizeOrigin(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function parseAllowedOrigins(value) {
  return new Set(
    String(value || '')
      .split(',')
      .map((item) => normalizeOrigin(item))
      .filter(Boolean),
  )
}

function normalizeIp(rawValue) {
  const raw = String(rawValue || '')
    .split(',')
    .map((value) => value.trim())
    .find(Boolean)

  if (!raw) return 'unknown'
  if (raw.startsWith('::ffff:')) return raw.slice(7)
  return raw
}

function pruneExpiredEntries(store, now = Date.now()) {
  const entries = store?.entries
  if (!(entries instanceof Map)) return
  if (store.lastPrunedAt && (now - store.lastPrunedAt) < DEFAULT_PRUNE_INTERVAL_MS && entries.size < 5000) {
    return
  }

  for (const [key, value] of entries.entries()) {
    if (!value?.resetAt || value.resetAt <= now) {
      entries.delete(key)
    }
  }

  store.lastPrunedAt = now
}

export function getClientIp(req) {
  const forwarded = normalizeIp(req.get?.('x-forwarded-for') || req.headers?.['x-forwarded-for'])
  if (forwarded !== 'unknown') return forwarded
  return normalizeIp(req.ip || req.socket?.remoteAddress)
}

export function applyBasicSecurityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('X-DNS-Prefetch-Control', 'off')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  next()
}

export function createCorsOptions({
  allowedOrigins = '',
  credentials = false,
} = {}) {
  const allowedOriginSet = parseAllowedOrigins(allowedOrigins)
  const allowAll = allowedOriginSet.size === 0 || allowedOriginSet.has('*')

  return {
    credentials: Boolean(credentials),
    optionsSuccessStatus: 204,
    origin(origin, callback) {
      if (!origin || allowAll) {
        callback(null, true)
        return
      }

      callback(null, allowedOriginSet.has(normalizeOrigin(origin)))
    },
  }
}

export function getProductionStartupWarnings(env = {}) {
  const isProduction = String(env.NODE_ENV || '').trim() === 'production'
  if (!isProduction) return []

  const warnings = []
  const rawAllowedOrigins = String(env.CORS_ALLOWED_ORIGINS || '').trim()
  const allowedOriginSet = parseAllowedOrigins(rawAllowedOrigins)
  const registrationEnabled = String(env.AUTH_ALLOW_REGISTRATION || 'true').trim().toLowerCase() !== 'false'
  const turnstileSiteKey = String(env.TURNSTILE_SITE_KEY || '').trim()
  const turnstileSecretKey = String(env.TURNSTILE_SECRET_KEY || '').trim()

  if (!rawAllowedOrigins) {
    warnings.push('CORS_ALLOWED_ORIGINS is not set; API CORS is open to any browser origin')
  } else if (allowedOriginSet.has('*')) {
    warnings.push('CORS_ALLOWED_ORIGINS contains "*" and keeps API CORS open to any browser origin')
  }

  if (!String(env.ADMIN_SESSION_SECRET || '').trim()) {
    warnings.push('ADMIN_SESSION_SECRET is not set; admin session secret is derived from ADMIN_PASSWORD')
  }

  if (registrationEnabled) {
    warnings.push('AUTH_ALLOW_REGISTRATION is enabled; public user registration remains open')

    if (!turnstileSiteKey || !turnstileSecretKey) {
      warnings.push('Registration captcha is not fully configured; set TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY')
    }
  }

  if (!String(env.DATABASE_URL || '').trim()) {
    warnings.push('DATABASE_URL is not set')
  }

  return warnings
}

export function applyNoStoreHeaders(_req, res, next) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
  next()
}

export function getSafeRequestPath(req) {
  const rawUrl = String(req?.originalUrl || req?.url || '').trim()
  if (!rawUrl) return ''

  try {
    const parsed = new URL(rawUrl, 'http://localhost')
    for (const key of parsed.searchParams.keys()) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
        parsed.searchParams.set(key, '[redacted]')
        continue
      }

      const values = parsed.searchParams.getAll(key)
      if (values.some((value) => String(value || '').length > 120)) {
        parsed.searchParams.delete(key)
        parsed.searchParams.append(key, '[truncated]')
      }
    }

    const safePath = `${parsed.pathname}${parsed.search}`
    return safePath.length > 240 ? `${safePath.slice(0, 237)}...` : safePath
  } catch {
    const [pathname] = rawUrl.split('?')
    return pathname || rawUrl
  }
}

export function createRateLimitStore(name = 'default') {
  return {
    name,
    entries: new Map(),
    lastPrunedAt: 0,
  }
}

export function getRateLimitSnapshot(store, key, { windowMs, max, now = Date.now() }) {
  pruneExpiredEntries(store, now)

  const entry = store?.entries?.get(key)
  const resetAt = entry?.resetAt && entry.resetAt > now ? entry.resetAt : (now + windowMs)
  const count = entry?.resetAt && entry.resetAt > now ? Number(entry.count || 0) : 0
  const allowed = count < max
  const retryAfterSeconds = allowed ? 0 : Math.max(0, Math.ceil((resetAt - now) / 1000))

  return {
    allowed,
    count,
    remaining: Math.max(0, max - count),
    retryAfterSeconds,
    resetAt,
  }
}

export function consumeRateLimit(store, key, { windowMs, max, now = Date.now() }) {
  const snapshot = getRateLimitSnapshot(store, key, { windowMs, max, now })
  const nextCount = snapshot.count + 1

  store.entries.set(key, {
    count: nextCount,
    resetAt: snapshot.resetAt,
  })

  return {
    allowed: nextCount <= max,
    count: nextCount,
    remaining: Math.max(0, max - nextCount),
    retryAfterSeconds: nextCount <= max ? 0 : Math.max(0, Math.ceil((snapshot.resetAt - now) / 1000)),
    resetAt: snapshot.resetAt,
  }
}

export function createRateLimitMiddleware({
  store = createRateLimitStore('api'),
  windowMs,
  max,
  keyFn = getClientIp,
  message = 'Слишком много запросов. Повторите позже.',
  skip = null,
  logLabel = 'RATE_LIMIT',
}) {
  return (req, res, next) => {
    if (typeof skip === 'function' && skip(req)) {
      return next()
    }

    const key = String(keyFn(req) || 'unknown')
    const result = consumeRateLimit(store, key, { windowMs, max })

    res.setHeader('X-RateLimit-Limit', String(max))
    res.setHeader('X-RateLimit-Remaining', String(result.remaining))
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)))

    if (result.allowed) {
      return next()
    }

    res.setHeader('Retry-After', String(result.retryAfterSeconds))
    console.warn(`${logLabel} | key=${key} | retryAfterSeconds=${result.retryAfterSeconds}`)
    return res.status(429).json({
      error: message,
      retryAfterSeconds: result.retryAfterSeconds,
    })
  }
}

export function sendSafeApiError(req, res, error, fallbackMessage = 'Ошибка сервера') {
  const status = Number(error?.status || error?.statusCode) || 500
  const responseStatus = status >= 400 && status < 600 ? status : 500
  const message = responseStatus >= 500 ? fallbackMessage : (error?.message || fallbackMessage)
  console.error(`API_ERROR | ${req.method} ${getSafeRequestPath(req)} |`, error?.stack || error?.message || error)
  return res.status(responseStatus).json({ error: message })
}

import axios from 'axios'

const PROXY_AUTH_FAILURE_COOLDOWN_MS = 6 * 60 * 60 * 1000
const PROXY_GENERIC_FAILURE_COOLDOWN_MS = 30 * 60 * 1000

let proxySuppressedUntil = 0

const lastHealthySources = new Map([
  ['list', 'direct'],
  ['detail', 'direct'],
])

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalizeSourceChannel(channel) {
  const normalized = cleanText(channel).toLowerCase()
  return normalized || 'default'
}

function extractProxyMeta(error) {
  const data = error?.response?.data
  const region = cleanText(data?.region)
  const upstreamOrigin = cleanText(data?.upstreamOrigin || data?.origin)
  const upstreamStatus = Number(data?.encarStatus || data?.upstreamStatus) || null
  const proxyCode = cleanText(data?.code || data?.proxyCode)
  const upstreamSnippet = cleanText(data?.upstreamSnippet)

  return {
    region,
    upstreamOrigin,
    upstreamStatus,
    proxyCode,
    upstreamSnippet,
  }
}

export function getEncarProxyUrl(env = globalThis.process?.env) {
  return cleanText(env?.ENCAR_PROXY_URL || '').replace(/\/$/, '')
}

export function hasEncarProxy(env = globalThis.process?.env) {
  return Boolean(getEncarProxyUrl(env))
}

export function isEncarProxySuppressed(env = globalThis.process?.env) {
  return hasEncarProxy(env) && proxySuppressedUntil > Date.now()
}

export function getEncarProxySuppressedUntil() {
  return proxySuppressedUntil > Date.now() ? new Date(proxySuppressedUntil).toISOString() : ''
}

export function suppressEncarProxy(status = 0) {
  const durationMs = status === 401 || status === 403 || status === 404 || status === 407
    ? PROXY_AUTH_FAILURE_COOLDOWN_MS
    : PROXY_GENERIC_FAILURE_COOLDOWN_MS

  proxySuppressedUntil = Math.max(proxySuppressedUntil, Date.now() + durationMs)
}

export function rememberHealthyEncarSource(channel, source) {
  if (source !== 'direct' && source !== 'proxy') return
  lastHealthySources.set(normalizeSourceChannel(channel), source)
}

export function getPreferredEncarSource(channel, fallback = 'direct') {
  return lastHealthySources.get(normalizeSourceChannel(channel)) || fallback
}

export function shouldRetryViaAlternateEncarSource(error) {
  const status = Number(error?.response?.status) || Number(error?.encarDiagnostic?.httpStatus) || 0
  if (!status) return true
  if (status === 403 || status === 407 || status === 408 || status === 425 || status === 429) return true
  return status >= 500
}

export function buildEncarSourceDiagnostic(source, error, reason = '') {
  const proxyMeta = extractProxyMeta(error)

  const diagnostic = {
    source: cleanText(source) || 'unknown',
    reason: cleanText(reason),
    code: cleanText(error?.code),
    httpStatus: Number(error?.response?.status) || Number(error?.encarDiagnostic?.httpStatus) || null,
    message: cleanText(error?.message),
  }

  if (proxyMeta.region) diagnostic.region = proxyMeta.region
  if (proxyMeta.upstreamOrigin) diagnostic.upstreamOrigin = proxyMeta.upstreamOrigin
  if (proxyMeta.upstreamStatus) diagnostic.upstreamStatus = proxyMeta.upstreamStatus
  if (proxyMeta.proxyCode) diagnostic.proxyCode = proxyMeta.proxyCode
  if (proxyMeta.upstreamSnippet) diagnostic.upstreamSnippet = proxyMeta.upstreamSnippet

  return diagnostic
}

export function buildEncarSourceFailureSummary(sourceDiagnostics = []) {
  return sourceDiagnostics
    .map((item) => {
      const bits = [
        cleanText(item?.source || 'unknown'),
        item?.httpStatus ? `http=${item.httpStatus}` : '',
        item?.upstreamStatus ? `upstream=${item.upstreamStatus}` : '',
        cleanText(item?.code || ''),
        cleanText(item?.reason || ''),
      ].filter(Boolean)
      return bits.join(':')
    })
    .filter(Boolean)
    .join(', ')
}

export function decorateEncarSourceError(error, channel = 'list', env = globalThis.process?.env) {
  if (!error) return error

  const status = Number(error?.response?.status) || Number(error?.encarDiagnostic?.httpStatus) || 0
  const sourceDiagnostics = Array.isArray(error?.fetchSourceDiagnostics) ? error.fetchSourceDiagnostics : []
  const failureSummary = buildEncarSourceFailureSummary(sourceDiagnostics)
  const proxyConfigured = hasEncarProxy(env)
  const proxyFailed = sourceDiagnostics.some((item) => item?.source?.startsWith('proxy'))
  const directFailed = sourceDiagnostics.some((item) => item?.source?.startsWith('direct'))
  const suppressedUntil = getEncarProxySuppressedUntil()

  if (status === 407) {
    if (proxyConfigured && proxyFailed && directFailed) {
      error.message = `Both direct and proxy Encar routes returned 407. ${cleanText(error.message)}`
    } else if (proxyConfigured && proxyFailed && !directFailed) {
      error.message = `Encar proxy route returned 407 and was suppressed temporarily${suppressedUntil ? ` until ${suppressedUntil}` : ''}. ${cleanText(error.message)}`
    } else if (proxyConfigured && directFailed) {
      error.message = `Encar ${channel} request returned 407. Automatic direct/proxy failover is active. ${cleanText(error.message)}`
    } else if (!proxyConfigured) {
      error.message = `Encar ${channel} request returned 407 on the direct route. Configure ENCAR_PROXY_URL only if you want a backup path. ${cleanText(error.message)}`
    }
  }

  if (failureSummary && !cleanText(error.message).includes(failureSummary)) {
    error.message = `${cleanText(error.message)} [sources: ${failureSummary}]`.trim()
  }

  return error
}

export async function fetchViaEncarProxy(params = {}, requestConfig = {}, env = globalThis.process?.env) {
  const proxyUrl = getEncarProxyUrl(env)
  if (!proxyUrl) {
    throw new Error('ENCAR_PROXY_URL is not configured')
  }

  const response = await axios.get(proxyUrl, {
    timeout: 25000,
    proxy: false,
    params,
    headers: {
      Accept: 'application/json, text/plain, */*',
      ...requestConfig.headers,
    },
    ...requestConfig,
  })

  return response.data
}

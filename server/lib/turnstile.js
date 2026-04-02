const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

function readEnv(env = globalThis.process?.env || {}) {
  return env || {}
}

export function getTurnstileConfig(env = globalThis.process?.env || {}) {
  const source = readEnv(env)
  const siteKey = String(source.TURNSTILE_SITE_KEY || '').trim()
  const secretKey = String(source.TURNSTILE_SECRET_KEY || '').trim()

  return {
    siteKey,
    secretKey,
    configured: Boolean(siteKey && secretKey),
  }
}

export async function verifyTurnstileToken({
  token,
  remoteIp = '',
  env = globalThis.process?.env || {},
} = {}) {
  const { configured, secretKey } = getTurnstileConfig(env)
  const responseToken = String(token || '').trim()

  if (!configured) {
    return {
      ok: false,
      reason: 'not-configured',
    }
  }

  if (!responseToken) {
    return {
      ok: false,
      reason: 'missing-token',
    }
  }

  const body = new URLSearchParams()
  body.set('secret', secretKey)
  body.set('response', responseToken)

  if (remoteIp) {
    body.set('remoteip', String(remoteIp))
  }

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    })

    if (!response.ok) {
      return {
        ok: false,
        reason: 'upstream-error',
      }
    }

    const payload = await response.json().catch(() => null)
    if (payload?.success) {
      return { ok: true }
    }

    return {
      ok: false,
      reason: 'rejected',
      errorCodes: Array.isArray(payload?.['error-codes']) ? payload['error-codes'] : [],
    }
  } catch {
    return {
      ok: false,
      reason: 'network-error',
    }
  }
}

import crypto from 'crypto'
import axios from 'axios'

const DEFAULT_JWT_SECRET = 'dev-only-jwt-secret-change-me'
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_JWT_SECRET
const JWT_EXPIRES_IN_DAYS = clampNumber(process.env.JWT_EXPIRES_IN_DAYS, 30, 1, 365)
export const OTP_RESEND_SECONDS = clampNumber(process.env.OTP_RESEND_SECONDS, 60, 15, 600)
export const OTP_TTL_SECONDS = clampNumber(process.env.OTP_TTL_SECONDS, 300, 60, 1800)

const SMS_PROVIDER = String(process.env.SMS_PROVIDER || 'console').trim().toLowerCase()
const SMS_WEBHOOK_URL = String(process.env.SMS_WEBHOOK_URL || '').trim()
const SMS_WEBHOOK_TOKEN = String(process.env.SMS_WEBHOOK_TOKEN || '').trim()
const IS_PRODUCTION = process.env.NODE_ENV === 'production'

if (JWT_SECRET === DEFAULT_JWT_SECRET && IS_PRODUCTION) {
  console.warn('JWT_SECRET is not set. Using the development fallback secret in production is unsafe.')
}

function clampNumber(rawValue, fallback, min, max) {
  const value = Number(rawValue)
  if (!Number.isFinite(value)) return fallback
  return Math.min(Math.max(Math.trunc(value), min), max)
}

function toBase64Url(value) {
  return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url')
}

function fromBase64Url(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
}

function createSignature(value) {
  return crypto.createHmac('sha256', JWT_SECRET).update(value).digest('base64url')
}

export function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) return ''
  return `+${digits}`
}

export function formatOtpMessage(code) {
  const ttlMinutes = Math.max(1, Math.round(OTP_TTL_SECONDS / 60))
  return `TLV Auto: код подтверждения ${code}. Он действует ${ttlMinutes} мин.`
}

export function createOtpCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
}

export function isDevSmsFallbackEnabled() {
  return !IS_PRODUCTION && SMS_PROVIDER === 'console'
}

export function serializeUser(row) {
  if (!row) return null
  return {
    id: row.id,
    phone: row.phone,
    created_at: row.created_at,
  }
}

export function createUserToken(user) {
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    sub: String(user.id),
    phone: user.phone,
    iat: now,
    exp: now + JWT_EXPIRES_IN_DAYS * 24 * 60 * 60,
  }

  const header = { alg: 'HS256', typ: 'JWT' }
  const unsignedToken = `${toBase64Url(header)}.${toBase64Url(payload)}`
  return `${unsignedToken}.${createSignature(unsignedToken)}`
}

export function verifyUserToken(token) {
  const parts = String(token || '').split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid token')
  }

  const [headerPart, payloadPart, signaturePart] = parts
  const unsignedToken = `${headerPart}.${payloadPart}`
  const expectedSignature = createSignature(unsignedToken)

  if (signaturePart.length !== expectedSignature.length) {
    throw new Error('Invalid token')
  }

  const valid = crypto.timingSafeEqual(Buffer.from(signaturePart), Buffer.from(expectedSignature))
  if (!valid) {
    throw new Error('Invalid token')
  }

  const header = fromBase64Url(headerPart)
  if (header.alg !== 'HS256') {
    throw new Error('Unsupported token')
  }

  const payload = fromBase64Url(payloadPart)
  const now = Math.floor(Date.now() / 1000)

  if (!payload?.sub || !payload?.phone || !Number.isFinite(payload?.exp) || payload.exp <= now) {
    throw new Error('Token expired')
  }

  return {
    id: Number(payload.sub),
    phone: payload.phone,
    exp: payload.exp,
  }
}

export function extractBearerToken(authHeader) {
  const value = String(authHeader || '')
  if (!value.toLowerCase().startsWith('bearer ')) return ''
  return value.slice(7).trim()
}

export async function sendOtpSms({ phone, code }) {
  const message = formatOtpMessage(code)

  if (SMS_PROVIDER === 'webhook') {
    if (!SMS_WEBHOOK_URL) {
      throw new Error('SMS webhook URL is not configured')
    }

    const headers = { 'Content-Type': 'application/json' }
    if (SMS_WEBHOOK_TOKEN) {
      headers.Authorization = `Bearer ${SMS_WEBHOOK_TOKEN}`
    }

    await axios.post(
      SMS_WEBHOOK_URL,
      { phone, code, message },
      { headers, timeout: 15_000 },
    )

    return { provider: 'webhook' }
  }

  console.log(`[sms:${SMS_PROVIDER || 'console'}] ${phone} <- ${code}`)
  return { provider: 'console' }
}

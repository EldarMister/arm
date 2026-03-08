import express from 'express'
import pool from '../db.js'
import {
  OTP_RESEND_SECONDS,
  OTP_TTL_SECONDS,
  createOtpCode,
  createUserToken,
  extractBearerToken,
  isDevSmsFallbackEnabled,
  normalizePhone,
  sendOtpSms,
  serializeUser,
  verifyUserToken,
} from '../lib/userAuth.js'

const router = express.Router()

function getRetryAfterSeconds(createdAt) {
  const elapsed = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000)
  return Math.max(0, OTP_RESEND_SECONDS - elapsed)
}

router.post('/request-code', async (req, res) => {
  const phone = normalizePhone(req.body?.phone)
  if (!phone) {
    return res.status(400).json({ error: 'Введите корректный номер телефона' })
  }

  try {
    const [recentCodeResult, userResult] = await Promise.all([
      pool.query('SELECT created_at FROM sms_codes WHERE phone = $1 ORDER BY created_at DESC LIMIT 1', [phone]),
      pool.query('SELECT id FROM users WHERE phone = $1 LIMIT 1', [phone]),
    ])

    if (recentCodeResult.rows.length) {
      const retryAfter = getRetryAfterSeconds(recentCodeResult.rows[0].created_at)
      if (retryAfter > 0) {
        return res.status(429).json({
          error: `Запросить код повторно можно через ${retryAfter} сек.`,
          retry_after: retryAfter,
        })
      }
    }

    const code = createOtpCode()
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000)

    const client = await pool.connect()
    let smsCodeId = null
    try {
      await client.query('BEGIN')
      await client.query(
        'UPDATE sms_codes SET used_at = NOW() WHERE phone = $1 AND used_at IS NULL',
        [phone],
      )
      const insertResult = await client.query(
        'INSERT INTO sms_codes (phone, code, expires_at) VALUES ($1, $2, $3) RETURNING id',
        [phone, code, expiresAt],
      )
      smsCodeId = insertResult.rows[0]?.id ?? null
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }

    try {
      const delivery = await sendOtpSms({ phone, code })
      const payload = {
        ok: true,
        phone,
        mode: userResult.rows.length ? 'login' : 'register',
        expires_at: expiresAt.toISOString(),
        resend_after: OTP_RESEND_SECONDS,
        delivery: delivery.provider,
      }

      if (isDevSmsFallbackEnabled()) {
        payload.dev_code = code
      }

      return res.json(payload)
    } catch (error) {
      if (smsCodeId) {
        await pool.query('DELETE FROM sms_codes WHERE id = $1', [smsCodeId]).catch(() => {})
      }
      console.error('SMS send failed:', error.message)
      return res.status(500).json({ error: 'Не удалось отправить SMS-код' })
    }
  } catch (error) {
    console.error('Request code failed:', error.message)
    return res.status(500).json({ error: 'Не удалось подготовить код подтверждения' })
  }
})

router.post('/verify-code', async (req, res) => {
  const phone = normalizePhone(req.body?.phone)
  const code = String(req.body?.code || '').replace(/\D/g, '').slice(0, 6)

  if (!phone) {
    return res.status(400).json({ error: 'Введите корректный номер телефона' })
  }

  if (code.length !== 6) {
    return res.status(400).json({ error: 'Введите 6-значный код из SMS' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const codeResult = await client.query(
      `SELECT id, phone, code, expires_at
       FROM sms_codes
       WHERE phone = $1 AND code = $2 AND used_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [phone, code],
    )

    if (!codeResult.rows.length) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Код подтверждения неверный или уже использован' })
    }

    const smsCode = codeResult.rows[0]
    if (new Date(smsCode.expires_at).getTime() < Date.now()) {
      await client.query('UPDATE sms_codes SET used_at = NOW() WHERE id = $1', [smsCode.id])
      await client.query('COMMIT')
      return res.status(400).json({ error: 'Срок действия кода истек. Запросите новый код.' })
    }

    let userResult = await client.query(
      'SELECT id, phone, created_at FROM users WHERE phone = $1 LIMIT 1 FOR UPDATE',
      [phone],
    )

    if (!userResult.rows.length) {
      userResult = await client.query(
        'INSERT INTO users (phone) VALUES ($1) RETURNING id, phone, created_at',
        [phone],
      )
    }

    await client.query(
      'UPDATE sms_codes SET used_at = NOW() WHERE phone = $1 AND used_at IS NULL',
      [phone],
    )

    await client.query('COMMIT')

    const user = serializeUser(userResult.rows[0])
    const token = createUserToken(user)
    return res.json({ ok: true, token, user })
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Verify code failed:', error.message)
    return res.status(500).json({ error: 'Не удалось подтвердить SMS-код' })
  } finally {
    client.release()
  }
})

router.get('/me', async (req, res) => {
  const token = extractBearerToken(req.get('authorization'))
  if (!token) {
    return res.status(401).json({ error: 'Не авторизован' })
  }

  try {
    const payload = verifyUserToken(token)
    const userResult = await pool.query(
      'SELECT id, phone, created_at FROM users WHERE id = $1 AND phone = $2 LIMIT 1',
      [payload.id, payload.phone],
    )

    if (!userResult.rows.length) {
      return res.status(401).json({ error: 'Пользователь не найден' })
    }

    return res.json({ user: serializeUser(userResult.rows[0]) })
  } catch (error) {
    return res.status(401).json({ error: 'Сессия недействительна' })
  }
})

export default router

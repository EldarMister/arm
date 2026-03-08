import { useEffect, useState } from 'react'
import { formatPhoneForDisplay } from '../../lib/authClient'

const COUNTRY_OPTIONS = [
  { id: 'kg', label: 'Кыргызстан', dialCode: '+996', hint: '555 123 456' },
  { id: 'kz', label: 'Казахстан', dialCode: '+7', hint: '701 123 4567' },
  { id: 'uz', label: 'Узбекистан', dialCode: '+998', hint: '90 123 45 67' },
  { id: 'kr', label: 'Южная Корея', dialCode: '+82', hint: '10 1234 5678' },
  { id: 'ae', label: 'ОАЭ', dialCode: '+971', hint: '50 123 4567' },
]

const DEFAULT_COUNTRY_ID = 'kg'

const CloseIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

function getCountryById(countryId) {
  return COUNTRY_OPTIONS.find((country) => country.id === countryId) || COUNTRY_OPTIONS[0]
}

function normalizePhoneDraft(value) {
  return String(value || '').replace(/\D/g, '')
}

function formatSeconds(value) {
  const total = Math.max(0, value)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  if (!minutes) return `${seconds} с`
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function composePhoneNumber(countryId, localPhone) {
  const country = getCountryById(countryId)
  return `${country.dialCode}${normalizePhoneDraft(localPhone)}`
}

function getDigitsLength(value) {
  return normalizePhoneDraft(value).length
}

function splitPhoneNumber(fullPhone) {
  const phone = String(fullPhone || '').trim()
  const matchedCountry = [...COUNTRY_OPTIONS]
    .sort((left, right) => right.dialCode.length - left.dialCode.length)
    .find((country) => phone.startsWith(country.dialCode))

  if (!matchedCountry) {
    return {
      countryId: DEFAULT_COUNTRY_ID,
      localPhone: normalizePhoneDraft(phone),
    }
  }

  return {
    countryId: matchedCountry.id,
    localPhone: normalizePhoneDraft(phone.slice(matchedCountry.dialCode.length)),
  }
}

export default function AuthModal({
  open,
  onClose,
  user,
  loading,
  requestCode,
  verifyCode,
  logout,
}) {
  const [countryId, setCountryId] = useState(DEFAULT_COUNTRY_ID)
  const [phone, setPhone] = useState('')
  const [requestedPhone, setRequestedPhone] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [devCode, setDevCode] = useState('')
  const [submittingRequest, setSubmittingRequest] = useState(false)
  const [submittingVerify, setSubmittingVerify] = useState(false)
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [expiresAt, setExpiresAt] = useState('')
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!open) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, open])

  useEffect(() => {
    if (!open) return undefined

    const needsTick = Date.now() < cooldownUntil || (expiresAt && Date.now() < new Date(expiresAt).getTime())
    if (!needsTick) return undefined

    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [cooldownUntil, expiresAt, open])

  const selectedCountry = getCountryById(countryId)
  const composedPhone = composePhoneNumber(countryId, phone)
  const phoneDigitsLength = getDigitsLength(composedPhone)
  const resendSeconds = Math.max(0, Math.ceil((cooldownUntil - now) / 1000))
  const expiresSeconds = expiresAt ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000)) : 0
  const hasRequestedCode = Boolean(requestedPhone && expiresSeconds > 0)
  const canRequestCode = phoneDigitsLength >= 8 && phoneDigitsLength <= 15 && !submittingRequest && resendSeconds === 0
  const canVerifyCode = hasRequestedCode && code.trim().length === 6 && !submittingVerify
  const requestButtonLabel = submittingRequest
    ? 'Отправка...'
    : resendSeconds > 0
      ? `Повтор через ${formatSeconds(resendSeconds)}`
      : hasRequestedCode
        ? 'Отправить код повторно'
        : 'Получить код'

  if (!open) return null

  const resetVerificationState = () => {
    setRequestedPhone('')
    setCode('')
    setExpiresAt('')
    setDevCode('')
    setError('')
    setCooldownUntil(0)
    setNow(Date.now())
  }

  const handlePhoneChange = (value) => {
    setPhone(value)
    if (requestedPhone && composePhoneNumber(countryId, value) !== requestedPhone) {
      resetVerificationState()
    }
  }

  const handleCountryChange = (nextCountryId) => {
    setCountryId(nextCountryId)
    if (requestedPhone && composePhoneNumber(nextCountryId, phone) !== requestedPhone) {
      resetVerificationState()
    }
  }

  const handleRequestCode = async (event) => {
    event.preventDefault()
    setSubmittingRequest(true)
    setError('')

    try {
      const payload = await requestCode(composedPhone)
      const nextPhone = payload.phone || composedPhone
      const splitPhone = splitPhoneNumber(nextPhone)

      setRequestedPhone(nextPhone)
      setCountryId(splitPhone.countryId)
      setPhone(splitPhone.localPhone)
      setExpiresAt(payload.expires_at || '')
      setCooldownUntil(Date.now() + Number(payload.resend_after || 60) * 1000)
      setCode('')
      setDevCode(payload.dev_code || '')
      setNow(Date.now())
    } catch (requestError) {
      const retryAfter = Number(requestError?.details?.retry_after || 0)
      if (retryAfter > 0) {
        setCooldownUntil(Date.now() + retryAfter * 1000)
        setNow(Date.now())
      }
      setError(requestError.message || 'Не удалось отправить код')
    } finally {
      setSubmittingRequest(false)
    }
  }

  const handleVerifyCode = async (event) => {
    event.preventDefault()
    setSubmittingVerify(true)
    setError('')

    try {
      await verifyCode(requestedPhone || composedPhone, code)
      resetVerificationState()
    } catch (verifyError) {
      setError(verifyError.message || 'Не удалось подтвердить код')
    } finally {
      setSubmittingVerify(false)
    }
  }

  return (
    <div className="auth-modal-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="auth-modal">
        <div className="auth-modal-head">
          <div>
            <p className="auth-modal-eyebrow">TLV Auto</p>
            <h3>{user ? 'Ваш аккаунт' : 'Вход по номеру телефона'}</h3>
          </div>
          <button className="auth-modal-close" type="button" onClick={onClose} aria-label="Закрыть">
            <CloseIcon />
          </button>
        </div>

        {user ? (
          <div className="auth-account-card">
            <div className="auth-account-badge">Аккаунт активен</div>
            <div className="auth-account-phone">{formatPhoneForDisplay(user.phone)}</div>
            <p className="auth-account-sub">Вы уже авторизованы. Этот номер можно использовать для повторного входа через SMS-код.</p>
            <div className="auth-modal-actions">
              <button type="button" className="auth-secondary-btn" onClick={onClose}>
                Закрыть
              </button>
              <button type="button" className="auth-primary-btn" onClick={logout}>
                Выйти
              </button>
            </div>
          </div>
        ) : (
          <div className="auth-modal-body">
            <form className="auth-form" onSubmit={handleRequestCode}>
              <label className="auth-field">
                <span>Номер телефона</span>
                <div className="auth-phone-row">
                  <label className="auth-country-field">
                    <span className="sr-only">Код страны</span>
                    <select
                      value={countryId}
                      onChange={(event) => handleCountryChange(event.target.value)}
                      disabled={submittingRequest || hasRequestedCode}
                    >
                      {COUNTRY_OPTIONS.map((country) => (
                        <option key={country.id} value={country.id}>
                          {country.label} {country.dialCode}
                        </option>
                      ))}
                    </select>
                  </label>

                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder={selectedCountry.hint}
                    value={phone}
                    disabled={submittingRequest || hasRequestedCode}
                    onChange={(event) => handlePhoneChange(event.target.value)}
                  />
                </div>
              </label>

              <button type="submit" className="auth-primary-btn" disabled={!canRequestCode}>
                {requestButtonLabel}
              </button>
            </form>

            {hasRequestedCode && (
              <form className="auth-form auth-form-verify" onSubmit={handleVerifyCode}>
                <div className="auth-otp-head">
                  <span className="auth-otp-title">SMS-код</span>
                  <span className="auth-otp-phone">{requestedPhone}</span>
                </div>

                <label className="auth-field">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="6 цифр"
                    value={code}
                    maxLength={6}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                </label>

                <div className="auth-timer-row" aria-live="polite">
                  <span className="auth-timer-pill">
                    {resendSeconds > 0 ? `Повторная отправка через ${formatSeconds(resendSeconds)}` : 'Можно отправить код повторно'}
                  </span>
                  <span className="auth-timer-pill auth-timer-pill-muted">Код активен еще {formatSeconds(expiresSeconds)}</span>
                </div>

                <button type="submit" className="auth-primary-btn" disabled={!canVerifyCode}>
                  {submittingVerify ? 'Проверка...' : 'Подтвердить'}
                </button>
              </form>
            )}

            {error && <p className="auth-status auth-status-error">{error}</p>}
            {devCode && <p className="auth-status auth-status-dev">Тестовый код: {devCode}</p>}

            <div className="auth-modal-footnote">
              Код живет 5 минут. Новый код можно запросить не чаще одного раза в 60 секунд.
              {loading ? ' Проверяем текущую сессию...' : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { RecaptchaVerifier, signInWithPhoneNumber, signOut } from 'firebase/auth'
import { firebaseAuth, firebaseConfigError, isFirebaseConfigured } from '../../lib/firebase'

const COUNTRY_OPTIONS = [
  { id: 'kg', label: 'Кыргызстан', dialCode: '+996', hint: '555 123 456' },
  { id: 'kz', label: 'Казахстан', dialCode: '+7', hint: '701 123 4567' },
  { id: 'uz', label: 'Узбекистан', dialCode: '+998', hint: '90 123 45 67' },
  { id: 'kr', label: 'Южная Корея', dialCode: '+82', hint: '10 1234 5678' },
  { id: 'ae', label: 'ОАЭ', dialCode: '+971', hint: '50 123 4567' },
]

const DEFAULT_COUNTRY_ID = 'kg'
const RESEND_SECONDS = 60
const CODE_TTL_SECONDS = 300
const IS_FIREBASE_TEST_MODE = ['1', 'true', 'yes'].includes(
  String(import.meta.env.VITE_FIREBASE_PHONE_AUTH_TESTING || '').trim().toLowerCase(),
)

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

function formatPhoneFull(phone) {
  const digits = normalizePhoneDraft(phone)
  if (!digits) return ''
  return `+${digits}`
}

function mapFirebaseError(error, fallbackMessage) {
  if (error?.code === 'sms/request-limit') {
    return error?.message || 'Слишком много запросов SMS-кода. Повторите позже'
  }

  switch (error?.code) {
    case 'auth/invalid-phone-number':
      return 'Введите корректный номер телефона в международном формате'
    case 'auth/missing-phone-number':
      return 'Введите номер телефона'
    case 'auth/captcha-check-failed':
      return 'Подтвердите reCAPTCHA и попробуйте снова'
    case 'auth/unauthorized-domain':
      return 'Текущий домен не добавлен в Authorized domains Firebase'
    case 'auth/operation-not-allowed':
      return 'Phone Authentication не включен или для проекта не подключен billing'
    case 'auth/quota-exceeded':
      return 'Лимит отправки SMS исчерпан. Попробуйте позже'
    case 'auth/too-many-requests':
      return 'Слишком много попыток. Попробуйте позже'
    case 'auth/invalid-app-credential':
      return 'Не удалось подтвердить приложение. Обновите страницу'
    case 'auth/invalid-verification-code':
      return 'Неверный SMS-код'
    case 'auth/code-expired':
    case 'auth/session-expired':
      return 'Срок действия кода истек. Запросите новый код'
    case 'auth/missing-verification-code':
      return 'Введите SMS-код'
    default:
      return error?.message || fallbackMessage
  }
}

export default function AuthModal({
  open,
  onClose,
  user,
  loading,
  authenticateWithFirebase,
  logout,
  authStatus,
  authFeedback,
}) {
  const [countryId, setCountryId] = useState(DEFAULT_COUNTRY_ID)
  const [phone, setPhone] = useState('')
  const [requestedPhone, setRequestedPhone] = useState('')
  const [authStep, setAuthStep] = useState('phone')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [submittingRequest, setSubmittingRequest] = useState(false)
  const [submittingVerify, setSubmittingVerify] = useState(false)
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [expiresAt, setExpiresAt] = useState('')
  const [now, setNow] = useState(Date.now())
  const [recaptchaReady, setRecaptchaReady] = useState(false)
  const [recaptchaVerified, setRecaptchaVerified] = useState(IS_FIREBASE_TEST_MODE)
  const [recaptchaVersion, setRecaptchaVersion] = useState(0)
  const recaptchaContainerRef = useRef(null)
  const recaptchaVerifierRef = useRef(null)
  const confirmationResultRef = useRef(null)
  const codeInputRef = useRef(null)

  const selectedCountry = getCountryById(countryId)
  const composedPhone = composePhoneNumber(countryId, phone)
  const phoneDigitsLength = getDigitsLength(composedPhone)
  const resendSeconds = Math.max(0, Math.ceil((cooldownUntil - now) / 1000))
  const expiresSeconds = expiresAt ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000)) : 0
  const hasRequestedCode = authStep === 'code' || Boolean(requestedPhone)
  const activePhone = requestedPhone || composedPhone
  const serverAuthReady = authStatus?.ready !== false
  const shouldShowRecaptcha = !user && isFirebaseConfigured && (!hasRequestedCode || resendSeconds === 0)
  const canRequestCode = (
    isFirebaseConfigured
    && serverAuthReady
    && phoneDigitsLength >= 8
    && phoneDigitsLength <= 15
    && !submittingRequest
    && resendSeconds === 0
    && recaptchaReady
    && (IS_FIREBASE_TEST_MODE || recaptchaVerified)
  )
  const codeDigitsLength = code.trim().length
  const canVerifyCode = hasRequestedCode && codeDigitsLength >= 4 && codeDigitsLength <= 6 && !submittingVerify
  const canResendCode = hasRequestedCode
    && resendSeconds === 0
    && !submittingRequest
    && recaptchaReady
    && (IS_FIREBASE_TEST_MODE || recaptchaVerified)
  const resendButtonLabel = submittingRequest
    ? 'Отправка...'
    : 'Отправить код снова'

  function clearRecaptcha() {
    if (recaptchaVerifierRef.current) {
      try {
        recaptchaVerifierRef.current.clear()
      } catch {
        // Ignore widget cleanup errors.
      }
      recaptchaVerifierRef.current = null
    }

    setRecaptchaVerified(IS_FIREBASE_TEST_MODE)

    if (recaptchaContainerRef.current) {
      recaptchaContainerRef.current.innerHTML = ''
    }
  }

  function refreshRecaptcha() {
    clearRecaptcha()
    setRecaptchaReady(false)
    setRecaptchaVerified(IS_FIREBASE_TEST_MODE)
    setRecaptchaVersion((version) => version + 1)
  }

  function resetVerificationState({ preserveStatus = false } = {}) {
    setAuthStep('phone')
    setRequestedPhone('')
    setCode('')
    setExpiresAt('')
    setError('')
    if (!preserveStatus) {
      setStatus('')
    }
    setCooldownUntil(0)
    setNow(Date.now())
    setRecaptchaVerified(IS_FIREBASE_TEST_MODE)
    confirmationResultRef.current = null
  }

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
    if (open) return undefined

    resetVerificationState()
    clearRecaptcha()
    setRecaptchaReady(false)
    setPhone('')
    setCountryId(DEFAULT_COUNTRY_ID)

    return undefined
  }, [open])

  useEffect(() => {
    if (!open) return undefined

    const needsTick = Date.now() < cooldownUntil || (expiresAt && Date.now() < new Date(expiresAt).getTime())
    if (!needsTick) return undefined

    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [cooldownUntil, expiresAt, open])

  useEffect(() => {
    if (!open || !hasRequestedCode) return undefined

    const frame = window.requestAnimationFrame(() => {
      codeInputRef.current?.focus()
      codeInputRef.current?.scrollIntoView({ block: 'center' })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [hasRequestedCode, open])

  useEffect(() => {
    if (!open || !shouldShowRecaptcha || !firebaseAuth || !recaptchaContainerRef.current) {
      clearRecaptcha()
      setRecaptchaReady(false)
      setRecaptchaVerified(IS_FIREBASE_TEST_MODE)
      return undefined
    }

    let cancelled = false
    clearRecaptcha()
    setRecaptchaReady(false)
    setRecaptchaVerified(IS_FIREBASE_TEST_MODE)
    setError('')

    firebaseAuth.settings.appVerificationDisabledForTesting = IS_FIREBASE_TEST_MODE

    const verifier = new RecaptchaVerifier(firebaseAuth, recaptchaContainerRef.current, {
      size: IS_FIREBASE_TEST_MODE ? 'invisible' : 'normal',
      callback: () => {
        setRecaptchaVerified(true)
        setError('')
      },
      'expired-callback': () => {
        setRecaptchaVerified(false)
      },
      'error-callback': () => {
        setRecaptchaVerified(false)
      },
    })

    recaptchaVerifierRef.current = verifier

    verifier.render()
      .then(() => {
        if (!cancelled) {
          setRecaptchaReady(true)
        }
      })
      .catch((renderError) => {
        if (!cancelled) {
          setError(mapFirebaseError(renderError, 'Не удалось загрузить reCAPTCHA'))
        }
      })

    return () => {
      cancelled = true
      clearRecaptcha()
    }
  }, [open, shouldShowRecaptcha, recaptchaVersion])

  if (!open) return null

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

  const reserveSmsRequest = async (targetPhone) => {
    const response = await fetch('/api/auth/sms/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: targetPhone }),
    })
    const payload = await response.json().catch(() => ({}))

    if (response.ok && payload?.ok) {
      return payload
    }

    const error = new Error(payload?.error || 'Не удалось отправить SMS-код')
    error.code = 'sms/request-limit'
    error.retryAfterSeconds = Number(payload?.retryAfterSeconds) || 0
    throw error
  }

  const handleRequestCode = async (event) => {
    event?.preventDefault?.()

    if (!firebaseAuth || !isFirebaseConfigured) {
      setError(firebaseConfigError || 'Firebase Phone Auth не настроен')
      return
    }

    if (!serverAuthReady) {
      setError('Сервер не готов завершить регистрацию. Проверьте конфигурацию backend.')
      return
    }

    if (!IS_FIREBASE_TEST_MODE && !recaptchaVerifierRef.current) {
      setError('reCAPTCHA еще не готова. Обновите страницу и попробуйте снова')
      return
    }

    if (!IS_FIREBASE_TEST_MODE && !recaptchaVerified) {
      setError('Сначала завершите reCAPTCHA, затем запрашивайте SMS-код')
      return
    }

    setSubmittingRequest(true)
    setError('')
    setStatus('')

    try {
      const targetPhone = hasRequestedCode ? requestedPhone : composedPhone
      await reserveSmsRequest(targetPhone)
      await signOut(firebaseAuth).catch(() => {})
      const confirmation = await signInWithPhoneNumber(
        firebaseAuth,
        targetPhone,
        recaptchaVerifierRef.current,
      )

      confirmationResultRef.current = confirmation
      setRequestedPhone(targetPhone)
      setAuthStep('code')
      setExpiresAt(new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString())
      setCooldownUntil(Date.now() + RESEND_SECONDS * 1000)
      setCode('')
      setStatus(`Код отправлен на ${formatPhoneFull(targetPhone)}. Введите его ниже.`)
      setNow(Date.now())
      clearRecaptcha()
      setRecaptchaReady(false)
    } catch (requestError) {
      if (requestError?.code === 'sms/request-limit') {
        if (requestError.retryAfterSeconds > 0) {
          setCooldownUntil((current) => Math.max(current, Date.now() + requestError.retryAfterSeconds * 1000))
          setNow(Date.now())
        }
        setError(mapFirebaseError(requestError, 'Не удалось отправить код'))
        return
      }

      setError(mapFirebaseError(requestError, 'Не удалось отправить код'))
      refreshRecaptcha()
    } finally {
      setSubmittingRequest(false)
    }
  }

  const handleVerifyCode = async (event) => {
    event.preventDefault()

    if (!confirmationResultRef.current) {
      setError('Сначала запросите SMS-код')
      return
    }

    setSubmittingVerify(true)
    setError('')
    setStatus('')

    try {
      const credential = await confirmationResultRef.current.confirm(code)
      const idToken = await credential.user.getIdToken()
      await authenticateWithFirebase({ idToken, phone: activePhone })
      if (firebaseAuth) {
        await signOut(firebaseAuth).catch(() => {})
      }
      resetVerificationState()
    } catch (verifyError) {
      if (firebaseAuth) {
        await signOut(firebaseAuth).catch(() => {})
      }
      if (verifyError?.code === 'auth/code-expired' || verifyError?.code === 'auth/session-expired') {
        setCooldownUntil(0)
        setExpiresAt(new Date().toISOString())
        refreshRecaptcha()
      }
      setError(mapFirebaseError(verifyError, 'Не удалось подтвердить код'))
    } finally {
      setSubmittingVerify(false)
    }
  }

  return (
    <div className="auth-modal-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="auth-modal">
        <div className="auth-modal-head">
          <div>
            <p className="auth-modal-eyebrow">AVT Auto</p>
            <h3>{user ? 'Ваш аккаунт' : 'Регистрация / вход по номеру телефона'}</h3>
          </div>
          <button className="auth-modal-close" type="button" onClick={onClose} aria-label="Закрыть">
            <CloseIcon />
          </button>
        </div>

        {user ? (
          <div className="auth-account-card">
            <div className="auth-account-badge">{authFeedback?.kind === 'register' ? 'Аккаунт создан' : 'Аккаунт активен'}</div>
            <div className="auth-account-phone">{formatPhoneFull(user.phone)}</div>
            <p className="auth-account-sub">{authFeedback?.message || 'Номер уже подтвержден и привязан к вашему аккаунту.'}</p>
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
            {!isFirebaseConfigured && (
              <p className="auth-status auth-status-error">
                Firebase Phone Auth не настроен. {firebaseConfigError}
              </p>
            )}

            {!serverAuthReady && (
              <p className="auth-status auth-status-error">
                Backend auth не готов завершить регистрацию.
                {Array.isArray(authStatus?.missing) && authStatus.missing.length
                  ? ` Отсутствует: ${authStatus.missing.join(', ')}`
                  : ''}
              </p>
            )}

            {IS_FIREBASE_TEST_MODE && (
              <p className="auth-status auth-status-info">
                Включен Firebase test mode. Работают только номера, добавленные в Phone numbers for testing.
              </p>
            )}

            <p className="auth-status auth-status-info">
              После подтверждения SMS-кода аккаунт создается автоматически. Для уже зарегистрированного номера будет выполнен обычный вход.
            </p>

            {!hasRequestedCode ? (
              <form className="auth-form" onSubmit={handleRequestCode}>
                <label className="auth-field">
                  <span>Номер телефона</span>
                  <div className="auth-phone-row">
                    <label className="auth-country-field">
                      <span className="sr-only">Код страны</span>
                      <select
                        value={countryId}
                        onChange={(event) => handleCountryChange(event.target.value)}
                        disabled={submittingRequest}
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
                      disabled={submittingRequest}
                      onChange={(event) => handlePhoneChange(event.target.value)}
                    />
                  </div>
                </label>

                {shouldShowRecaptcha && (
                  <div className="auth-recaptcha-wrap">
                    <div ref={recaptchaContainerRef} className="auth-recaptcha" />
                  </div>
                )}

                <button type="submit" className="auth-primary-btn" disabled={!canRequestCode}>
                  {submittingRequest ? 'Отправка...' : 'Получить код'}
                </button>
              </form>
            ) : (
              <form className="auth-form auth-form-verify" onSubmit={handleVerifyCode}>
                <div className="auth-otp-head">
                  <span className="auth-otp-title">SMS-код</span>
                  <span className="auth-otp-phone">{formatPhoneFull(activePhone)}</span>
                </div>

                <label className="auth-field">
                  <span>Введите SMS-код</span>
                  <input
                    ref={codeInputRef}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="4-6 цифр"
                    value={code}
                    maxLength={6}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                </label>

                <div className="auth-timer-row" aria-live="polite">
                  <span className="auth-timer-pill">
                    {resendSeconds > 0 ? `Повторная отправка через ${formatSeconds(resendSeconds)}` : 'Можно отправить код повторно'}
                  </span>
                  <span className="auth-timer-pill auth-timer-pill-muted">
                    Код активен еще {formatSeconds(expiresSeconds)}
                  </span>
                </div>

                {resendSeconds === 0 && shouldShowRecaptcha && (
                  <div className="auth-recaptcha-wrap">
                    <div ref={recaptchaContainerRef} className="auth-recaptcha" />
                  </div>
                )}

                <div className="auth-modal-actions">
                  {resendSeconds === 0 && (
                    <button
                      type="button"
                      className="auth-secondary-btn"
                      disabled={!canResendCode}
                      onClick={() => handleRequestCode()}
                    >
                      {resendButtonLabel}
                    </button>
                  )}
                  <button type="submit" className="auth-primary-btn" disabled={!canVerifyCode}>
                    {submittingVerify ? 'Проверка...' : 'Подтвердить код'}
                  </button>
                </div>
              </form>
            )}

            {status && <p className="auth-status auth-status-info">{status}</p>}
            {error && <p className="auth-status auth-status-error">{error}</p>}

            <div className="auth-modal-footnote">
              Новый код можно запросить не чаще одного раза в 60 секунд.
              {loading ? ' Проверяем текущую сессию...' : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

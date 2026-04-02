import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth.js'
import TurnstileWidget from './TurnstileWidget.jsx'

const INITIAL_FORM = {
  login: '',
  password: '',
  confirmPassword: '',
}

const INITIAL_AUTH_CONFIG = {
  registrationEnabled: true,
  registrationAvailable: true,
  registerCaptchaEnabled: false,
  registerCaptchaRequired: false,
  turnstileSiteKey: '',
}

async function loadAuthConfig() {
  const response = await fetch('/api/auth/config', {
    headers: {
      Accept: 'application/json',
    },
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error || 'Не удалось загрузить настройки авторизации')
  }

  return {
    ...INITIAL_AUTH_CONFIG,
    ...(payload?.auth || {}),
  }
}

export default function AuthModal({ open, onClose, onSuccess }) {
  const { login, register } = useAuth()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState(INITIAL_FORM)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [authConfig, setAuthConfig] = useState(INITIAL_AUTH_CONFIG)
  const [authConfigLoading, setAuthConfigLoading] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileError, setTurnstileError] = useState('')

  useEffect(() => {
    if (!open) return undefined

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose?.()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  useEffect(() => {
    if (!open) return

    setError('')
    setBusy(false)
    setForm(INITIAL_FORM)
    setMode('login')
    setTurnstileToken('')
    setTurnstileError('')
  }, [open])

  useEffect(() => {
    if (!open) return undefined

    let active = true
    setAuthConfigLoading(true)

    loadAuthConfig()
      .then((nextConfig) => {
        if (!active) return
        setAuthConfig(nextConfig)
      })
      .catch(() => {
        if (!active) return
        setAuthConfig(INITIAL_AUTH_CONFIG)
      })
      .finally(() => {
        if (!active) return
        setAuthConfigLoading(false)
      })

    return () => {
      active = false
    }
  }, [open])

  if (!open) return null

  const registerBlockedReason = !authConfig.registrationEnabled
    ? 'Публичная регистрация отключена.'
    : authConfig.registerCaptchaRequired && !authConfig.registrationAvailable
      ? 'Регистрация временно недоступна: каптча не настроена на сервере.'
      : ''
  const registerNeedsCaptcha = mode === 'register' && authConfig.registerCaptchaEnabled
  const submitDisabled = busy
    || authConfigLoading
    || (mode === 'register' && Boolean(registerBlockedReason))
    || (registerNeedsCaptcha && !turnstileToken)
  const submitLabel = mode === 'login' ? 'Войти' : 'Зарегистрироваться'

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setTurnstileError('')

    if (mode === 'register' && form.password !== form.confirmPassword) {
      setError('Пароли не совпадают')
      return
    }

    if (mode === 'register' && registerBlockedReason) {
      setError(registerBlockedReason)
      return
    }

    if (mode === 'register' && authConfig.registerCaptchaEnabled && !turnstileToken) {
      setError('Подтвердите, что вы не робот.')
      return
    }

    setBusy(true)

    try {
      const payload = {
        login: form.login,
        password: form.password,
      }

      if (mode === 'login') {
        await login(payload)
      } else {
        await register({
          ...payload,
          turnstileToken,
        })
      }

      onSuccess?.()
      onClose?.()
    } catch (submitError) {
      setError(submitError.message || 'Ошибка авторизации')
    } finally {
      setBusy(false)
    }
  }

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function switchMode(nextMode) {
    setMode(nextMode)
    setError('')
    setTurnstileToken('')
    setTurnstileError('')
  }

  return (
    <div
      className="auth-modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose?.()
        }
      }}
      role="presentation"
    >
      <div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
        <div className="auth-modal-header">
          <div>
            <p className="auth-modal-eyebrow">Личный кабинет</p>
            <h2 className="auth-modal-title" id="auth-modal-title">
              {mode === 'login' ? 'Вход' : 'Регистрация'}
            </h2>
          </div>
          <button className="auth-modal-close" onClick={onClose} type="button" aria-label="Закрыть">
            ×
          </button>
        </div>

        <div className="auth-modal-tabs">
          <button
            className={`auth-modal-tab${mode === 'login' ? ' auth-modal-tab-active' : ''}`}
            onClick={() => switchMode('login')}
            type="button"
          >
            Вход
          </button>
          <button
            className={`auth-modal-tab${mode === 'register' ? ' auth-modal-tab-active' : ''}`}
            onClick={() => switchMode('register')}
            type="button"
            disabled={!authConfig.registrationEnabled}
          >
            Регистрация
          </button>
        </div>

        <form className="auth-modal-form" onSubmit={handleSubmit}>
          <label className="auth-modal-field">
            <span>Логин</span>
            <input
              autoFocus
              className="auth-modal-input"
              type="text"
              value={form.login}
              onChange={(event) => updateField('login', event.target.value)}
              placeholder="Например, manager_01"
              autoComplete={mode === 'login' ? 'username' : 'new-username'}
              disabled={busy}
            />
          </label>

          <label className="auth-modal-field">
            <span>Пароль</span>
            <input
              className="auth-modal-input"
              type="password"
              value={form.password}
              onChange={(event) => updateField('password', event.target.value)}
              placeholder="Минимум 6 символов"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              disabled={busy}
            />
          </label>

          {mode === 'register' && (
            <label className="auth-modal-field">
              <span>Повторите пароль</span>
              <input
                className="auth-modal-input"
                type="password"
                value={form.confirmPassword}
                onChange={(event) => updateField('confirmPassword', event.target.value)}
                placeholder="Введите пароль ещё раз"
                autoComplete="new-password"
                disabled={busy}
              />
            </label>
          )}

          {mode === 'register' && authConfig.registerCaptchaEnabled && authConfig.turnstileSiteKey && (
            <div className="auth-modal-field">
              <span>Защита от ботов</span>
              <TurnstileWidget
                siteKey={authConfig.turnstileSiteKey}
                onError={setTurnstileError}
                onTokenChange={setTurnstileToken}
              />
            </div>
          )}

          <p className="auth-modal-hint">
            Логин: 3-32 символа. Разрешены буквы, цифры, точка, подчёркивание и дефис.
          </p>

          {mode === 'register' && registerBlockedReason && (
            <div className="auth-modal-note">{registerBlockedReason}</div>
          )}

          {mode === 'register' && turnstileError && (
            <div className="auth-modal-error">{turnstileError}</div>
          )}

          {error && <div className="auth-modal-error">{error}</div>}

          <button className="auth-modal-submit" type="submit" disabled={submitDisabled}>
            {busy ? 'Подождите...' : authConfigLoading ? 'Загрузка...' : submitLabel}
          </button>
        </form>
      </div>
    </div>
  )
}

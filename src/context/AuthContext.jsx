import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import AuthModal from '../components/auth/AuthModal'
import { formatPhoneForDisplay } from '../lib/authClient'

const AUTH_TOKEN_KEY = 'tlv-user-jwt'
const AuthContext = createContext(null)

function readStoredToken() {
  try {
    return window.localStorage.getItem(AUTH_TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

function storeToken(token) {
  try {
    if (token) window.localStorage.setItem(AUTH_TOKEN_KEY, token)
    else window.localStorage.removeItem(AUTH_TOKEN_KEY)
  } catch {
    // Ignore storage failures in private mode.
  }
}

async function apiFetchJson(url, options = {}) {
  const response = await fetch(url, options)
  const isJson = (response.headers.get('content-type') || '').includes('application/json')
  const payload = isJson ? await response.json() : null

  if (!response.ok) {
    const error = new Error(payload?.error || 'Ошибка запроса')
    error.status = response.status
    error.details = payload || {}
    throw error
  }

  return payload
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => readStoredToken())
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(() => Boolean(readStoredToken()))
  const [authModalOpen, setAuthModalOpen] = useState(false)

  useEffect(() => {
    if (!token) {
      setUser(null)
      setLoading(false)
      return undefined
    }

    let cancelled = false
    setLoading(true)

    apiFetchJson('/api/auth/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((payload) => {
        if (!cancelled) {
          setUser(payload.user || null)
        }
      })
      .catch(() => {
        if (!cancelled) {
          storeToken('')
          setToken('')
          setUser(null)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [token])

  const openAuthModal = () => setAuthModalOpen(true)
  const closeAuthModal = () => setAuthModalOpen(false)

  const requestCode = async (phone) => (
    apiFetchJson('/api/auth/request-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    })
  )

  const verifyCode = async (phone, code) => {
    const payload = await apiFetchJson('/api/auth/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code }),
    })

    storeToken(payload.token || '')
    setToken(payload.token || '')
    setUser(payload.user || null)
    setAuthModalOpen(false)
    return payload
  }

  const logout = () => {
    storeToken('')
    setToken('')
    setUser(null)
    setAuthModalOpen(false)
  }

  const value = useMemo(() => ({
    user,
    token,
    loading,
    isAuthenticated: Boolean(user && token),
    openAuthModal,
    closeAuthModal,
    requestCode,
    verifyCode,
    logout,
  }), [loading, token, user])

  return (
    <AuthContext.Provider value={value}>
      {children}
      <AuthModal
        open={authModalOpen}
        onClose={closeAuthModal}
        user={user}
        loading={loading}
        requestCode={requestCode}
        verifyCode={verifyCode}
        logout={logout}
      />
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return value
}

export { formatPhoneForDisplay }

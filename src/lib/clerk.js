function readRuntimeValue(key) {
  if (typeof window === 'undefined') return ''
  return String(window.__APP_CONFIG__?.[key] || '')
}

export function getClerkPublishableKey() {
  return readRuntimeValue('VITE_CLERK_PUBLISHABLE_KEY')
    || String(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '')
}

export function isClerkConfigured() {
  return Boolean(getClerkPublishableKey())
}

export function formatAuthPhoneForDisplay(phone) {
  const raw = String(phone || '').trim()
  if (!raw) return ''
  if (raw.length <= 8) return raw
  return `${raw.slice(0, 4)} ${raw.slice(4, 7)} *** ${raw.slice(-2)}`
}

export function getClerkUserLabel(user) {
  const phone = String(user?.primaryPhoneNumber?.phoneNumber || '').trim()
  if (phone) return formatAuthPhoneForDisplay(phone)

  const email = String(user?.primaryEmailAddress?.emailAddress || '').trim()
  if (email) return email

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim()
  if (fullName) return fullName

  const username = String(user?.username || '').trim()
  if (username) return username

  return 'Аккаунт'
}

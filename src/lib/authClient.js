export function formatPhoneForDisplay(phone) {
  const raw = String(phone || '').trim()
  if (!raw) return 'Войти'
  if (raw.length <= 8) return raw
  return `${raw.slice(0, 4)} ${raw.slice(4, 7)} *** ${raw.slice(-2)}`
}

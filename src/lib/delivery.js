const DEFAULT_DELIVERY_COUNTRIES = [
  { code: 'kg', label: 'Кыргызстан', flag: '🇰🇬', shipping_type: 'container', sort_order: 10, is_default: true },
  { code: 'kz', label: 'Казахстан', flag: '🇰🇿', shipping_type: 'ro_ro', sort_order: 20 },
  { code: 'ru', label: 'Россия', flag: '🇷🇺', shipping_type: 'ro_ro', sort_order: 30 },
  { code: 'uz', label: 'Узбекистан', flag: '🇺🇿', shipping_type: 'ro_ro', sort_order: 40 },
  { code: 'tj', label: 'Таджикистан', flag: '🇹🇯', shipping_type: 'ro_ro', sort_order: 50 },
  { code: 'by', label: 'Беларусь', flag: '🇧🇾', shipping_type: 'ro_ro', sort_order: 60 },
  { code: 'az', label: 'Азербайджан', flag: '🇦🇿', shipping_type: 'ro_ro', sort_order: 70 },
  { code: 'ua', label: 'Украина', flag: '🇺🇦', shipping_type: 'ro_ro', sort_order: 80 },
  { code: 'ge', label: 'Грузия', flag: '🇬🇪', shipping_type: 'ro_ro', sort_order: 90 },
]

const DEFAULT_DELIVERY_PROFILES = [
  { code: 'mini_car', label: 'Малолитражка', description: 'Morning, Spark', price: 1000, prices: { kg: 1000 }, sort_order: 10 },
  { code: 'sedan_bishkek', label: 'Седан', description: '', price: 1450, prices: { kg: 1450 }, sort_order: 20 },
  { code: 'sedan_lux', label: 'Бизнес седан', description: '', price: 1600, prices: { kg: 1600 }, sort_order: 30 },
  { code: 'suv_small', label: 'Кроссовер', description: 'Tivoli, Seltos', price: 1600, prices: { kg: 1600 }, sort_order: 40 },
  { code: 'suv_middle', label: 'SUV', description: 'Santafe, Sorento', price: 1700, prices: { kg: 1700 }, sort_order: 50 },
  { code: 'suv_big', label: 'Внедорожник', description: 'Highlander, Carnival', price: 1800, prices: { kg: 1800 }, sort_order: 60 },
  { code: 'minivan', label: 'Минивэн', description: '', price: 1900, prices: { kg: 1900 }, sort_order: 70 },
  { code: 'pickup', label: 'Пикап', description: '', price: 2000, prices: { kg: 2000 }, sort_order: 80 },
  { code: 'electric', label: 'Электромобиль', description: '', price: 1700, prices: { kg: 1700 }, sort_order: 90 },
  { code: 'commercial', label: 'Коммерческий транспорт', description: '', price: 2200, prices: { kg: 2200 }, sort_order: 100 },
  { code: 'sedan_osh', label: 'SEDAN OSH', description: '', price: 1500, prices: { kg: 1500 }, sort_order: 110 },
  { code: 'half_container', label: 'HALF CONTAINER', description: '', price: 3000, prices: { kg: 3000 }, sort_order: 120 },
]

const DEFAULT_SETTINGS = {
  default_delivery: 1450,
  delivery_countries: DEFAULT_DELIVERY_COUNTRIES,
  delivery_profiles: DEFAULT_DELIVERY_PROFILES,
}

const KG_ONLY_PRICE_LIST_PROFILES = new Set(['sedan_osh'])
export const RUSSIA_RO_RO_PRICE = 900

function toNumber(value, fallback = null) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function slugifyCode(value, index = 0, prefix = 'code') {
  const code = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return code || `${prefix}_${index + 1}`
}

export function normalizeDeliveryCountries(input = []) {
  const source = Array.isArray(input) && input.length ? input : DEFAULT_SETTINGS.delivery_countries
  const uniqueCodes = new Set()

  const normalized = source
    .map((country, index) => ({
      code: slugifyCode(country?.code || country?.label, index, 'country'),
      label: String(country?.label || `COUNTRY ${index + 1}`).trim(),
      flag: String(country?.flag || '').trim(),
      shipping_type: ['container', 'ro_ro'].includes(country?.shipping_type)
        ? country.shipping_type
        : 'ro_ro',
      sort_order: toNumber(country?.sort_order, (index + 1) * 10),
    }))
    .filter((country) => {
      if (!country.code || uniqueCodes.has(country.code)) return false
      uniqueCodes.add(country.code)
      return true
    })
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))

  if (!normalized.find((country) => country.code === 'kg')) {
    normalized.unshift({
      code: 'kg',
      label: 'Кыргызстан',
      flag: '🇰🇬',
      shipping_type: 'container',
      sort_order: 10,
    })
  }

  return normalized.map((country) => ({
    ...country,
    shipping_type: country.code === 'kg' ? 'container' : country.shipping_type,
    is_default: country.code === 'kg',
  }))
}

export function resolveDefaultCountryCode(countries = []) {
  const defaultCountry = countries.find((country) => country.is_default) || countries.find((country) => country.code === 'kg')
  return defaultCountry?.code || countries[0]?.code || 'kg'
}

export function normalizeDeliveryProfiles(input = [], { countries, defaultCountryCode } = {}) {
  const source = Array.isArray(input) && input.length ? input : DEFAULT_SETTINGS.delivery_profiles
  const safeCountries = Array.isArray(countries) && countries.length ? countries : DEFAULT_SETTINGS.delivery_countries
  const defaultCode = defaultCountryCode || resolveDefaultCountryCode(safeCountries)
  const uniqueCodes = new Set()

  return source
    .map((profile, index) => {
      const price = toNumber(profile?.price, 0)
      const prices = safeCountries.reduce((acc, country) => {
        const value = toNumber(profile?.prices?.[country.code], null)
        if (Number.isFinite(value) && value > 0) acc[country.code] = value
        return acc
      }, {})

      if (defaultCode && Number.isFinite(price) && price > 0 && !prices[defaultCode]) {
        prices[defaultCode] = price
      }

      const resolvedPrice = Number.isFinite(prices?.[defaultCode]) ? prices[defaultCode] : price

      return {
        code: slugifyCode(profile?.code || profile?.label, index, 'profile'),
        label: String(profile?.label || `TYPE ${index + 1}`).trim(),
        description: String(profile?.description || '').trim(),
        price: resolvedPrice,
        prices,
        sort_order: toNumber(profile?.sort_order, (index + 1) * 10),
      }
    })
    .filter((profile) => {
      if (!profile.code || uniqueCodes.has(profile.code)) return false
      uniqueCodes.add(profile.code)
      return true
    })
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))
}

export function normalizeDeliverySettings(input = {}) {
  const countries = normalizeDeliveryCountries(input.delivery_countries)
  const defaultCountryCode = resolveDefaultCountryCode(countries)
  const profiles = normalizeDeliveryProfiles(input.delivery_profiles, { countries, defaultCountryCode })

  return {
    default_delivery: toNumber(input.default_delivery, DEFAULT_SETTINGS.default_delivery),
    delivery_countries: countries,
    delivery_profiles: profiles,
    default_country_code: defaultCountryCode,
  }
}

export function resolveDeliveryTypeLabel(country) {
  const type = country?.code === 'kg'
    ? 'container'
    : (country?.shipping_type || 'ro_ro')

  return type === 'container' ? 'Контейнер' : 'Ro-Ro'
}

export function resolveDeliveryForCar({ car, settings, countryCode } = {}) {
  const normalized = settings?.delivery_profiles ? settings : normalizeDeliverySettings({})
  const countries = normalized.delivery_countries || []
  const resolvedCountryCode = String(countryCode || normalized.default_country_code || '').trim()
  const country = countries.find((item) => item.code === resolvedCountryCode) || countries[0] || null
  const isDefaultCountry = resolvedCountryCode === normalized.default_country_code
  const profileCode = String(car?.delivery_profile_code || car?.deliveryProfileCode || '').trim()
  const profile = normalized.delivery_profiles.find((item) => item.code === profileCode) || null

  let price = null
  let source = 'missing'

  const pricingLocked = Boolean(car?.pricing_locked ?? car?.pricingLocked)
  if (isDefaultCountry && pricingLocked) {
    const manual = toNumber(car?.delivery, null)
    if (Number.isFinite(manual) && manual > 0) {
      price = manual
      source = 'manual'
    }
  }

  if (price === null && profile) {
    const countryPrice = toNumber(profile?.prices?.[resolvedCountryCode], null)
    if (Number.isFinite(countryPrice) && countryPrice > 0) {
      price = countryPrice
      source = 'profile'
    } else if (isDefaultCountry) {
      const legacy = toNumber(profile?.price, null)
      if (Number.isFinite(legacy) && legacy > 0) {
        price = legacy
        source = 'legacy'
      }
    }
  }

  if (price === null && isDefaultCountry && !profileCode) {
    const fallback = toNumber(normalized.default_delivery, null)
    if (Number.isFinite(fallback) && fallback > 0) {
      price = fallback
      source = 'fallback'
    }
  }

  return {
    price,
    source,
    profile,
    country,
    isDefaultCountry,
  }
}

export function resolveDeliveryPriceList({ settings, countryCode } = {}) {
  const normalized = settings?.delivery_profiles ? settings : normalizeDeliverySettings({})
  const countries = normalized.delivery_countries || []
  const defaultCountryCode = normalized.default_country_code || resolveDefaultCountryCode(countries)
  const resolvedCountryCode = String(countryCode || defaultCountryCode || '').trim()
  const country = countries.find((item) => item.code === resolvedCountryCode) || countries[0] || null
  const activeCountryCode = country?.code || defaultCountryCode

  if (activeCountryCode === 'ru') {
    return {
      country,
      items: [
        {
          code: 'ro_ro',
          label: 'Ro-Ro',
          description: '',
          resolvedPrice: RUSSIA_RO_RO_PRICE,
          priceSource: 'fixed',
        },
      ],
      defaultCountryCode,
    }
  }

  const items = (normalized.delivery_profiles || [])
    .filter((profile) => activeCountryCode === 'kg' || !KG_ONLY_PRICE_LIST_PROFILES.has(profile.code))
    .map((profile) => {
      const countryPrice = toNumber(profile?.prices?.[activeCountryCode], null)
      const legacyPrice = activeCountryCode === defaultCountryCode ? toNumber(profile?.price, null) : null
      const resolvedPrice = Number.isFinite(countryPrice) && countryPrice > 0 ? countryPrice : legacyPrice
      const priceSource = Number.isFinite(countryPrice) && countryPrice > 0
        ? 'profile'
        : (Number.isFinite(legacyPrice) && legacyPrice > 0 ? 'legacy' : 'missing')

      const displayLabel = activeCountryCode !== 'kg' && profile.code === 'sedan_bishkek'
        ? 'SEDAN'
        : profile.label

      return {
        ...profile,
        label: displayLabel,
        resolvedPrice,
        priceSource,
      }
    })

  return {
    country,
    items,
    defaultCountryCode,
  }
}

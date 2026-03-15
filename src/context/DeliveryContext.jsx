import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { DeliveryContext } from './delivery-context.js'
import { normalizeDeliverySettings, resolveDefaultCountryCode } from '../lib/delivery.js'

const DELIVERY_COUNTRY_STORAGE_KEY = 'tlv-auto-delivery-country'
const DELIVERY_COUNTRY_TOUCHED_STORAGE_KEY = 'tlv-auto-delivery-country-touched'

function normalizeCountryCode(value, fallback = 'kg') {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()

  return normalized || fallback
}

function readStoredCountryCode() {
  if (typeof window === 'undefined') return 'kg'

  try {
    return normalizeCountryCode(window.localStorage.getItem(DELIVERY_COUNTRY_STORAGE_KEY), 'kg')
  } catch {
    return 'kg'
  }
}

function readStoredCountryTouched() {
  if (typeof window === 'undefined') return false

  try {
    return window.localStorage.getItem(DELIVERY_COUNTRY_TOUCHED_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function DeliveryProvider({ children }) {
  const [settings, setSettings] = useState(() => normalizeDeliverySettings({}))
  const [loading, setLoading] = useState(true)
  const [countryCode, setCountryCodeState] = useState(readStoredCountryCode)
  const [hasUserSelectedCountry, setHasUserSelectedCountry] = useState(readStoredCountryTouched)

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      window.localStorage.setItem(DELIVERY_COUNTRY_STORAGE_KEY, normalizeCountryCode(countryCode, 'kg'))
    } catch {
      // Ignore storage write failures; the in-memory selection still works.
    }
  }, [countryCode])

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      window.localStorage.setItem(DELIVERY_COUNTRY_TOUCHED_STORAGE_KEY, hasUserSelectedCountry ? '1' : '0')
    } catch {
      // Ignore storage write failures; the in-memory state still works.
    }
  }, [hasUserSelectedCountry])

  useEffect(() => {
    let active = true

    const run = async () => {
      try {
        const res = await fetch('/api/pricing-settings')
        if (!res.ok) throw new Error('Failed to load delivery settings')
        const payload = await res.json()
        if (!active) return
        const normalized = normalizeDeliverySettings(payload)
        setSettings(normalized)
        setCountryCodeState((prev) => {
          const resolvedPrev = normalizeCountryCode(prev, normalized.default_country_code)
          const exists = normalized.delivery_countries.some((country) => country.code === resolvedPrev)
          return exists ? resolvedPrev : normalized.default_country_code
        })
      } catch {
        if (!active) return
        setSettings(normalizeDeliverySettings({}))
      } finally {
        if (active) setLoading(false)
      }
    }

    run()
    return () => {
      active = false
    }
  }, [])

  const setCountryCode = useCallback((nextCountryCode) => {
    setCountryCodeState((prev) => normalizeCountryCode(nextCountryCode, prev || 'kg'))
    setHasUserSelectedCountry(true)
  }, [])

  const value = useMemo(() => {
    const countries = settings.delivery_countries || []
    const defaultCountryCode = settings.default_country_code || resolveDefaultCountryCode(countries)
    const selectedCountry = countries.find((country) => country.code === countryCode) || countries[0] || null

    return {
      settings,
      loading,
      countries,
      countryCode,
      hasUserSelectedCountry,
      defaultCountryCode,
      selectedCountry,
      setCountryCode,
    }
  }, [settings, loading, countryCode, hasUserSelectedCountry, setCountryCode])

  return (
    <DeliveryContext.Provider value={value}>
      {children}
    </DeliveryContext.Provider>
  )
}

export function useDeliveryContext() {
  return useContext(DeliveryContext)
}

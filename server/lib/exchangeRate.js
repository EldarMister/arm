import axios from 'axios'

export const SITE_RATE_OFFSET = 15.0
export const VAT_REFUND_RATE = 0.06
export const DEFAULT_FEES = {
  commission: 200,
  delivery: 1450,
  loading: 0,
  unloading: 100,
  storage: 310,
}

const RATE_CACHE_TTL_MS = 60 * 60 * 1000
const LAST_RESORT_CURRENT_RATE = Number(process.env.FALLBACK_KRW_PER_USD || 1485)

let cachedSnapshot = null
let cacheExpiresAt = 0
let pendingSnapshotPromise = null

async function fetchPrimaryRate() {
  const { data } = await axios.get('https://open.er-api.com/v6/latest/USD', {
    timeout: 15000,
    proxy: false,
  })

  const currentRate = Number(data?.rates?.KRW)
  if (!Number.isFinite(currentRate) || currentRate <= 0) {
    throw new Error('Primary FX source returned invalid USD/KRW rate')
  }

  return {
    source: 'ExchangeRate-API',
    provider: data?.provider || 'https://www.exchangerate-api.com',
    documentation: data?.documentation || 'https://www.exchangerate-api.com/docs/free',
    terms: data?.terms_of_use || 'https://www.exchangerate-api.com/terms',
    updatedAt: data?.time_last_update_utc || null,
    nextUpdateAt: data?.time_next_update_utc || null,
    currentRate,
  }
}

async function fetchFallbackRate() {
  const { data } = await axios.get('https://api.frankfurter.app/latest?from=USD&to=KRW', {
    timeout: 15000,
    proxy: false,
  })

  const currentRate = Number(data?.rates?.KRW)
  if (!Number.isFinite(currentRate) || currentRate <= 0) {
    throw new Error('Fallback FX source returned invalid USD/KRW rate')
  }

  return {
    source: 'Frankfurter',
    provider: 'https://www.frankfurter.app',
    documentation: 'https://www.frankfurter.app/docs/',
    terms: null,
    updatedAt: data?.date || null,
    nextUpdateAt: null,
    currentRate,
  }
}

function buildSnapshot(base) {
  const currentRate = Number(base?.currentRate) || LAST_RESORT_CURRENT_RATE
  const siteRate = Number((currentRate - SITE_RATE_OFFSET).toFixed(2))

  return {
    source: base?.source || 'fallback',
    provider: base?.provider || null,
    documentation: base?.documentation || null,
    terms: base?.terms || null,
    updatedAt: base?.updatedAt || null,
    nextUpdateAt: base?.nextUpdateAt || null,
    currentRate,
    siteRate: siteRate > 0 ? siteRate : currentRate,
    offset: SITE_RATE_OFFSET,
    vatRate: VAT_REFUND_RATE,
  }
}

export async function getExchangeRateSnapshot({ force = false } = {}) {
  const now = Date.now()

  if (!force && cachedSnapshot && cacheExpiresAt > now) {
    return cachedSnapshot
  }

  if (pendingSnapshotPromise) return pendingSnapshotPromise

  pendingSnapshotPromise = (async () => {
    try {
      const fresh = buildSnapshot(await fetchPrimaryRate())
      cachedSnapshot = fresh
      cacheExpiresAt = Date.now() + RATE_CACHE_TTL_MS
      return fresh
    } catch (primaryError) {
      try {
        const fallback = buildSnapshot(await fetchFallbackRate())
        cachedSnapshot = fallback
        cacheExpiresAt = Date.now() + RATE_CACHE_TTL_MS
        return fallback
      } catch (fallbackError) {
        if (cachedSnapshot) return cachedSnapshot
        const degraded = buildSnapshot({
          source: 'last-resort',
          provider: null,
          documentation: null,
          terms: null,
          updatedAt: null,
          nextUpdateAt: null,
          currentRate: LAST_RESORT_CURRENT_RATE,
        })
        cachedSnapshot = degraded
        cacheExpiresAt = Date.now() + RATE_CACHE_TTL_MS
        return degraded
      }
    } finally {
      pendingSnapshotPromise = null
    }
  })()

  return pendingSnapshotPromise
}

export function computePricing({
  priceKrw,
  commission = DEFAULT_FEES.commission,
  delivery = DEFAULT_FEES.delivery,
  loading = DEFAULT_FEES.loading,
  unloading = DEFAULT_FEES.unloading,
  storage = DEFAULT_FEES.storage,
}, exchangeSnapshot) {
  const currentRate = Number(exchangeSnapshot?.currentRate) || LAST_RESORT_CURRENT_RATE
  const siteRate = Number(exchangeSnapshot?.siteRate) || currentRate
  const priceUSD = Math.round((Number(priceKrw) || 0) / siteRate)
  const vatRefund = Math.round(priceUSD * VAT_REFUND_RATE)
  const total = Math.round(
    priceUSD +
    (Number(commission) || 0) +
    (Number(delivery) || 0) +
    (Number(loading) || 0) +
    (Number(unloading) || 0) +
    (Number(storage) || 0) -
    vatRefund
  )

  return {
    price_usd: priceUSD,
    vat_refund: vatRefund,
    total,
    exchange_rate_current: currentRate,
    exchange_rate_site: siteRate,
    exchange_rate_offset: SITE_RATE_OFFSET,
    vat_rate: VAT_REFUND_RATE,
  }
}

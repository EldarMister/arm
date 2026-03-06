import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import FilterSidebar from '../components/catalog/FilterSidebar'
import CarCard from '../components/catalog/CarCard'

const HANGUL_RE = /[\uAC00-\uD7A3]/u
const encarDetailCache = new Map()
const encarDetailInFlight = new Map()
const KO = {
  diesel: '\uB514\uC824',
  gasoline: '\uAC00\uC194\uB9B0',
  gasolineAlt: '\uD718\uBC1C\uC720',
  hybrid: '\uD558\uC774\uBE0C\uB9AC\uB4DC',
  electric: '\uC804\uAE30',
  lpg: '\uC5D8\uD53C\uC9C0',
  auto: '\uC624\uD1A0',
  automatic: '\uC790\uB3D9',
  manual: '\uC218\uB3D9',
  black: '\uAC80\uC815',
  blackAlt: '\uD751\uC0C9',
  white: '\uD770\uC0C9',
  whiteAlt: '\uBC31\uC0C9',
  silver: '\uC740\uC0C9',
  gray: '\uD68C\uC0C9',
  grayAlt: '\uC950\uC0C9',
  blue: '\uCCAD\uC0C9',
  blueAlt: '\uD30C\uB791',
  red: '\uD64D\uC0C9',
  redAlt: '\uBE68\uAC15',
  green: '\uB179\uC0C9',
  greenAlt: '\uCD08\uB85D',
  brown: '\uAC08\uC0C9',
  beige: '\uBCA0\uC774\uC9C0',
  orange: '\uC8FC\uD669',
  yellow: '\uB178\uB791',
  purple: '\uBCF4\uB77C',
}

function hasHangul(value) {
  return HANGUL_RE.test(String(value || ''))
}

function shouldReplaceText(value) {
  const text = String(value || '').trim()
  return !text || text === '-' || hasHangul(text)
}

function normalizeDisplayText(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (!hasHangul(text)) return text
  return text.replace(/[\uAC00-\uD7A3]+/gu, ' ').replace(/\s+/g, ' ').trim()
}

function hasAnyToken(value, tokens) {
  const src = String(value || '')
  return tokens.some((token) => src.includes(token))
}

function normalizeTagLabel(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const low = text.toLowerCase()

  if (low.includes('diesel') || low.includes('\u0434\u0438\u0437\u0435\u043b') || hasAnyToken(text, [KO.diesel])) return '\u0414\u0438\u0437\u0435\u043b\u044c'
  if (low.includes('gasoline') || low.includes('\u0431\u0435\u043d\u0437') || hasAnyToken(text, [KO.gasoline, KO.gasolineAlt])) return '\u0411\u0435\u043d\u0437\u0438\u043d'
  if (low.includes('hybrid') || low.includes('\u0433\u0438\u0431\u0440\u0438\u0434') || hasAnyToken(text, [KO.hybrid])) return '\u0411\u0435\u043d\u0437\u0438\u043d (\u0433\u0438\u0431\u0440\u0438\u0434)'
  if (low.includes('electric') || low.includes('\u044d\u043b\u0435\u043a\u0442\u0440\u043e') || hasAnyToken(text, [KO.electric])) return '\u042d\u043b\u0435\u043a\u0442\u0440\u043e'
  if (low.includes('lpg') || low.includes('\u0433\u0430\u0437') || hasAnyToken(text, [KO.lpg])) return '\u0413\u0430\u0437 (LPG)'
  if (low.includes('auto') || low.includes('\u0430\u0432\u0442\u043e\u043c\u0430\u0442') || hasAnyToken(text, [KO.auto, KO.automatic])) return '\u0410\u0432\u0442\u043e\u043c\u0430\u0442'
  if (low.includes('manual') || low.includes('\u043c\u0435\u0445\u0430\u043d') || hasAnyToken(text, [KO.manual])) return '\u041c\u0435\u0445\u0430\u043d\u0438\u043a\u0430'
  if (low.includes('cvt')) return 'CVT'
  if (low.includes('dct') || low.includes('dual') || low.includes('\u0440\u043e\u0431\u043e\u0442')) return '\u0420\u043e\u0431\u043e\u0442'

  if (hasHangul(text)) return ''
  return normalizeDisplayText(text)
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return []
  const out = []
  for (const tag of tags) {
    const normalized = normalizeTagLabel(tag)
    if (!normalized) continue
    if (!out.includes(normalized)) out.push(normalized)
  }
  return out
}

function hasUntranslatedTags(tags) {
  if (!Array.isArray(tags) || !tags.length) return true
  return tags.some((tag) => shouldReplaceText(tag))
}

function normalizeColorLabel(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const low = text.toLowerCase()
  const compact = low.replace(/[\s_-]/g, '')

  if (low.includes('black') || /^(geomeunsaek|geomjeongsaek|heugsaek)$/.test(compact) || hasAnyToken(text, [KO.black, KO.blackAlt])) return '\u0427\u0435\u0440\u043d\u044b\u0439'
  if (low.includes('white') || /^(baegsaek|huinsaek)$/.test(compact) || hasAnyToken(text, [KO.white, KO.whiteAlt])) return '\u0411\u0435\u043b\u044b\u0439'
  if (low.includes('silver') || /^(eunsaek)$/.test(compact) || hasAnyToken(text, [KO.silver])) return '\u0421\u0435\u0440\u0435\u0431\u0440\u0438\u0441\u0442\u044b\u0439'
  if (low.includes('gray') || low.includes('grey') || /^(hoesaek|jwisaek)$/.test(compact) || hasAnyToken(text, [KO.gray, KO.grayAlt])) return '\u0421\u0435\u0440\u044b\u0439'
  if (low.includes('blue') || /^(cheongsaek|parangsaek)$/.test(compact) || hasAnyToken(text, [KO.blue, KO.blueAlt])) return '\u0421\u0438\u043d\u0438\u0439'
  if (low.includes('red') || /^(ppalgangsaek|hongsaek)$/.test(compact) || hasAnyToken(text, [KO.red, KO.redAlt])) return '\u041a\u0440\u0430\u0441\u043d\u044b\u0439'
  if (low.includes('green') || /^(noksaek|choroksaek)$/.test(compact) || hasAnyToken(text, [KO.green, KO.greenAlt])) return '\u0417\u0435\u043b\u0435\u043d\u044b\u0439'
  if (low.includes('brown') || /^(galsaek)$/.test(compact) || hasAnyToken(text, [KO.brown])) return '\u041a\u043e\u0440\u0438\u0447\u043d\u0435\u0432\u044b\u0439'
  if (low.includes('beige') || /^(beijisaek)$/.test(compact) || hasAnyToken(text, [KO.beige])) return '\u0411\u0435\u0436\u0435\u0432\u044b\u0439'
  if (low.includes('yellow') || /^(norangsaek)$/.test(compact) || hasAnyToken(text, [KO.yellow])) return '\u0416\u0435\u043b\u0442\u044b\u0439'
  if (low.includes('orange') || /^(juhwangsaek)$/.test(compact) || hasAnyToken(text, [KO.orange])) return '\u041e\u0440\u0430\u043d\u0436\u0435\u0432\u044b\u0439'
  if (low.includes('purple') || low.includes('violet') || /^(borasaek)$/.test(compact) || hasAnyToken(text, [KO.purple])) return '\u0424\u0438\u043e\u043b\u0435\u0442\u043e\u0432\u044b\u0439'

  if (low.includes('jwiseak') || low.includes('hoesaek')) return '\u0421\u0435\u0440\u044b\u0439'
  if (low.includes('cheongsaek') || low.includes('parangsaek')) return '\u0421\u0438\u043d\u0438\u0439'
  if (low.includes('eunsaek')) return '\u0421\u0435\u0440\u0435\u0431\u0440\u0438\u0441\u0442\u044b\u0439'
  if (low.includes('heugsaek') || low.includes('geomjeongsaek')) return '\u0427\u0435\u0440\u043d\u044b\u0439'

  if (hasHangul(text)) return ''
  return normalizeDisplayText(text)
}

function shouldReplaceColor(value) {
  const text = String(value || '').trim()
  if (shouldReplaceText(text)) return true
  return /^[a-z]+saek$/i.test(text.replace(/[\s_-]/g, ''))
}

function toAbsoluteImageUrl(raw) {
  if (!raw) return ''
  const url = String(raw).trim()
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('/carpicture') || url.startsWith('carpicture')) {
    return `https://ci.encar.com${url.startsWith('/') ? '' : '/'}${url}`
  }
  return url
}

function normalizeImages(rawImages) {
  if (!Array.isArray(rawImages)) return []
  return rawImages
    .map((img, idx) => {
      if (!img) return null
      if (typeof img === 'string') return { id: `img-${idx}`, url: toAbsoluteImageUrl(img) }
      return {
        id: img.id ?? `img-${idx}`,
        url: toAbsoluteImageUrl(img.url || img.path || img.location || ''),
      }
    })
    .filter((img) => img?.url)
}

function hasWeakImages(car) {
  const images = Array.isArray(car.images) ? car.images : []
  if (!images.length) return true
  return images.every((img) => String(img?.url || '').startsWith('/uploads/'))
}

function needsEncarEnrichment(car) {
  if (!car?.encarId || car.encarId === '-') return false
  return (
    hasWeakImages(car) ||
    shouldReplaceText(car.name) ||
    shouldReplaceText(car.model) ||
    hasUntranslatedTags(car.tags) ||
    shouldReplaceColor(car.bodyColor) ||
    shouldReplaceColor(car.interiorColor) ||
    shouldReplaceText(car.location) ||
    shouldReplaceText(car.vin)
  )
}

async function fetchEncarDetail(encarId) {
  const key = String(encarId || '').trim()
  if (!key || key === '-') return null
  if (encarDetailCache.has(key)) return encarDetailCache.get(key)
  if (encarDetailInFlight.has(key)) return encarDetailInFlight.get(key)

  const promise = (async () => {
    try {
      const res = await fetch(`/api/encar/${encodeURIComponent(key)}`)
      if (!res.ok) return null
      const detail = await res.json()
      const normalized = {
        images: normalizeImages(detail?.photos?.length ? detail.photos : detail?.images),
        name: normalizeDisplayText(detail?.name || ''),
        model: normalizeDisplayText(detail?.model || ''),
        fuelType: normalizeTagLabel(detail?.fuel_type || ''),
        transmission: normalizeTagLabel(detail?.transmission || ''),
        bodyColor: normalizeColorLabel(detail?.body_color || ''),
        interiorColor: normalizeColorLabel(detail?.interior_color || ''),
        location: normalizeDisplayText(detail?.location || ''),
        vin: String(detail?.vin || detail?.vehicle_no || '').trim(),
      }
      encarDetailCache.set(key, normalized)
      return normalized
    } catch {
      return null
    } finally {
      encarDetailInFlight.delete(key)
    }
  })()

  encarDetailInFlight.set(key, promise)
  return promise
}

const HomeIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" strokeWidth={2} />
  </svg>
)
const ChevronRightIcon = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <polyline points="9 18 15 12 9 6" strokeWidth={2} strokeLinecap="round" />
  </svg>
)
const FilterIcon = () => (
  <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <line x1="4" y1="6" x2="20" y2="6" strokeWidth={2} strokeLinecap="round" />
    <line x1="8" y1="12" x2="16" y2="12" strokeWidth={2} strokeLinecap="round" />
    <line x1="11" y1="18" x2="13" y2="18" strokeWidth={2} strokeLinecap="round" />
  </svg>
)
const SortIcon = () => (
  <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
  </svg>
)
const EncarIcon = () => (
  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" strokeWidth={2} />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h8M12 8l4 4-4 4" />
  </svg>
)
const WaGroupIcon = () => (
  <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
  </svg>
)

function mapCar(c) {
  const priceUSD = Number(c.price_usd) || 0
  const commission = Number(c.commission ?? 200) || 200
  const delivery = Number(c.delivery ?? 1750) || 1750
  const loading = Number(c.loading) || 0
  const unloading = Number(c.unloading ?? 100) || 100
  const storage = Number(c.storage ?? 310) || 310
  const vatRefund = Number(c.vat_refund) || Math.round(priceUSD * 0.07)
  const total = Number(c.total) || Math.round(priceUSD + commission + delivery + loading + unloading + storage - vatRefund)
  const images = normalizeImages(c.images)

  const normalizedName = normalizeDisplayText(c.name || '')
  const normalizedModel = normalizeDisplayText(c.model || '')
  const normalizedLocation = normalizeDisplayText(c.location || '\u041a\u043e\u0440\u0435\u044f')

  return {
    id: c.id,
    name: normalizedName || normalizedModel || '\u0410\u0432\u0442\u043e\u043c\u043e\u0431\u0438\u043b\u044c',
    model: normalizedModel || normalizedName || '-',
    year: c.year,
    mileage: c.mileage || 0,
    tags: normalizeTags(c.tags || []),
    bodyColor: normalizeColorLabel(c.body_color || '-'),
    bodyColorDots: c.body_color_dots || [],
    interiorColor: normalizeColorLabel(c.interior_color || c.body_color || '-'),
    interiorColorDots: c.interior_color_dots || [],
    location: normalizedLocation || '\u041a\u043e\u0440\u0435\u044f',
    vin: String(c.vin || c.vehicle_no || '').trim() || '-',
    priceKRW: Number(c.price_krw) || 0,
    priceUSD,
    commission,
    delivery,
    loading,
    unloading,
    storage,
    vatRefund,
    total,
    encarUrl: c.encar_url,
    encarId: c.encar_id || '-',
    canNegotiate: c.can_negotiate,
    imageCount: images.length || 1,
    images,
  }
}

export default function CatalogPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sort, setSort] = useState('newest')
  const [cars, setCars] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [meta, setMeta] = useState({ total: 0, page: 1, pages: 1 })
  const [filters, setFilters] = useState({})
  const [page, setPage] = useState(1)

  const fetchCars = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ sort, page, limit: 20, ...filters })
      const res = await fetch(`/api/cars?${params}`)
      if (!res.ok) throw new Error('Ошибка загрузки')
      const data = await res.json()

      const mappedCars = data.cars.map(mapCar)
      setCars(mappedCars)
      setMeta({ total: data.total, page: data.page, pages: data.pages })

      const missingDataCars = mappedCars.filter(needsEncarEnrichment)
      if (missingDataCars.length) {
        const enrichedCars = await Promise.all(
          mappedCars.map(async (car) => {
            if (!needsEncarEnrichment(car)) return car

            const detail = await fetchEncarDetail(car.encarId)
            if (!detail) return car

            const next = { ...car }
            if (shouldReplaceText(car.name) && detail.name) next.name = detail.name
            if (shouldReplaceText(car.model) && detail.model) next.model = detail.model
            if (hasUntranslatedTags(car.tags)) {
              const detailTags = normalizeTags([detail.fuelType, detail.transmission])
              if (detailTags.length) next.tags = detailTags
            }
            if (hasWeakImages(car) && detail.images.length) next.images = detail.images
            if (shouldReplaceColor(car.bodyColor) && detail.bodyColor) next.bodyColor = detail.bodyColor
            if (shouldReplaceColor(car.interiorColor) && detail.interiorColor) next.interiorColor = detail.interiorColor
            if (shouldReplaceText(car.location) && detail.location) next.location = detail.location
            if (shouldReplaceText(car.vin) && detail.vin) next.vin = detail.vin
            next.imageCount = next.images.length || 1
            return next
          })
        )

        setCars((prev) => {
          const prevIds = prev.map((c) => c.id).join(',')
          const enrichedIds = enrichedCars.map((c) => c.id).join(',')
          if (prevIds !== enrichedIds) return prev
          return enrichedCars
        })
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [sort, page, filters])

  useEffect(() => {
    fetchCars()
  }, [fetchCars])

  return (
    <div className="catalog-page">
      <div className="cat-breadcrumb">
        <div className="cat-breadcrumb-inner">
          <Link to="/" className="cat-bc-link"><HomeIcon /> Главная</Link>
          <span className="cat-bc-sep"><ChevronRightIcon /></span>
          <span className="cat-bc-current">Каталог</span>
        </div>
      </div>

      <div className="cat-layout">
        <aside className={`cat-sidebar${sidebarOpen ? ' cat-sidebar-open' : ''}`}>
          <FilterSidebar
            filters={filters}
            onFiltersChange={(f) => { setFilters(f); setPage(1) }}
            onClose={() => setSidebarOpen(false)}
          />
        </aside>

        {sidebarOpen && <div className="cat-sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

        <main className="cat-main">
          <button className="cat-filter-btn" onClick={() => setSidebarOpen(true)}>
            <FilterIcon /> Фильтры
          </button>

          <div className="cat-top-btns">
            <a href="https://www.encar.com" target="_blank" rel="noreferrer" className="btn-encar">
              <EncarIcon /> Encar
            </a>
            <a href="https://chat.whatsapp.com/KYOi5t749ZT16iyqAzbkSd" target="_blank" rel="noreferrer" className="btn-wa-group">
              <WaGroupIcon /> WhatsApp группы
            </a>
          </div>

          <h1 className="cat-title">Каталог автомобилей — Корея</h1>
          <p className="cat-subtitle">Список машин с Encar (переводы ru/en/ko)</p>

          <div className="cat-results-bar">
            <div>
              <div className="cat-results-heading">Доступные автомобили</div>
              <div className="cat-results-count">
                {loading ? 'Загрузка...' : `Найдено: ${meta.total.toLocaleString()} • Стр. ${meta.page} из ${meta.pages}`}
              </div>
            </div>
            <div className="cat-sort-wrap">
              <SortIcon />
              <select className="cat-sort" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1) }}>
                <option value="newest">Новые объявления</option>
                <option value="price_asc">Цена ↑</option>
                <option value="price_desc">Цена ↓</option>
                <option value="mileage">Пробег ↑</option>
                <option value="year_desc">Год ↓</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="cat-error">
              ⚠️ {error} — <button onClick={fetchCars}>Повторить</button>
            </div>
          )}

          {loading ? (
            <div className="cat-loading">
              <div className="cat-loading-spinner" />
              <span>Загрузка автомобилей...</span>
            </div>
          ) : (
            <>
              <div className="cars-list">
                {cars.length === 0
                  ? <div className="cat-empty">Автомобили не найдены. Измените фильтры.</div>
                  : cars.map((car) => <CarCard key={car.id} car={car} />)}
              </div>

              {meta.pages > 1 && (
                <div className="cat-pagination">
                  <button className="cat-page-btn" disabled={meta.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Назад</button>
                  <span className="cat-page-info">Стр. {meta.page} / {meta.pages}</span>
                  <button className="cat-page-btn" disabled={meta.page >= meta.pages} onClick={() => setPage((p) => Math.min(meta.pages, p + 1))}>Вперёд →</button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}


import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import FilterSidebar from '../components/catalog/FilterSidebar'
import CarCard from '../components/catalog/CarCard'

const HANGUL_RE = /[\uAC00-\uD7A3]/u
const encarDetailCache = new Map()
const encarDetailInFlight = new Map()

function hasHangul(value) {
  return HANGUL_RE.test(String(value || ''))
}

function shouldReplaceText(value) {
  const text = String(value || '').trim()
  return !text || text === '-' || hasHangul(text)
}

function normalizeColorLabel(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const low = text.toLowerCase()
  const compact = low.replace(/[\s_-]/g, '')

  if (low.includes('black') || /^(geomeunsaek|geomjeongsaek|heugsaek)$/.test(compact)) return 'Черный'
  if (low.includes('white') || /^(baegsaek|huinsaek)$/.test(compact)) return 'Белый'
  if (low.includes('silver') || /^(eunsaek)$/.test(compact)) return 'Серебристый'
  if (low.includes('gray') || low.includes('grey') || /^(hoesaek|jwisaek)$/.test(compact)) return 'Серый'
  if (low.includes('blue') || /^(cheongsaek|parangsaek)$/.test(compact)) return 'Синий'
  if (low.includes('red') || /^(ppalgangsaek|hongsaek)$/.test(compact)) return 'Красный'
  if (low.includes('green') || /^(noksaek|choroksaek)$/.test(compact)) return 'Зеленый'
  if (low.includes('brown') || /^(galsaek)$/.test(compact)) return 'Коричневый'
  if (low.includes('beige') || /^(beijisaek)$/.test(compact)) return 'Бежевый'
  if (low.includes('yellow') || /^(norangsaek)$/.test(compact)) return 'Желтый'
  if (low.includes('orange') || /^(juhwangsaek)$/.test(compact)) return 'Оранжевый'
  if (low.includes('purple') || low.includes('violet') || /^(borasaek)$/.test(compact)) return 'Фиолетовый'

  return text
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
    shouldReplaceColor(car.bodyColor) ||
    shouldReplaceColor(car.interiorColor) ||
    shouldReplaceText(car.location)
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
      const detailImages = normalizeImages(detail?.photos?.length ? detail.photos : detail?.images)
      const normalized = {
        images: detailImages,
        bodyColor: detail?.body_color || '',
        interiorColor: detail?.interior_color || '',
        location: detail?.location || '',
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


// Маппинг из snake_case (БД) в camelCase (CarCard)
function mapCar(c) {
  const priceUSD = Number(c.price_usd) || 0
  const commission = Number(c.commission ?? 200) || 200
  const delivery = Number(c.delivery ?? 1750) || 1750
  const loading = Number(c.loading) || 0
  const unloading = Number(c.unloading ?? 100) || 100
  const storage = Number(c.storage ?? 310) || 310
  const vatRefund = Number(c.vat_refund) || Math.round(priceUSD * 0.07)
  const total = Number(c.total) || Math.round(priceUSD + commission + delivery + loading + unloading + storage - vatRefund)

  return {
    id: c.id,
    name: c.name,
    model: c.model,
    year: c.year,
    mileage: c.mileage || 0,
    tags: c.tags || [],
    bodyColor: normalizeColorLabel(c.body_color || '-'),
    bodyColorDots: c.body_color_dots || [],
    interiorColor: normalizeColorLabel(c.interior_color || c.body_color || '-'),
    interiorColorDots: c.interior_color_dots || [],
    location: c.location || 'Корея',
    vin: c.vin,
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
    imageCount: normalizeImages(c.images).length || 1,
    images: normalizeImages(c.images),
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
      const params = new URLSearchParams({
        sort,
        page,
        limit: 20,
        ...filters,
      })
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
            if (hasWeakImages(car) && detail.images.length) next.images = detail.images
            if (shouldReplaceColor(car.bodyColor) && detail.bodyColor) next.bodyColor = normalizeColorLabel(detail.bodyColor)
            if (shouldReplaceColor(car.interiorColor) && detail.interiorColor) next.interiorColor = normalizeColorLabel(detail.interiorColor)
            if (shouldReplaceText(car.location) && detail.location) next.location = detail.location
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

  useEffect(() => { fetchCars() }, [fetchCars])

  return (
    <div className="catalog-page">

      {/* Breadcrumb */}
      <div className="cat-breadcrumb">
        <div className="cat-breadcrumb-inner">
          <Link to="/" className="cat-bc-link">
            <HomeIcon /> Главная
          </Link>
          <span className="cat-bc-sep"><ChevronRightIcon /></span>
          <span className="cat-bc-current">Каталог</span>
        </div>
      </div>

      <div className="cat-layout">

        {/* Sidebar */}
        <aside className={`cat-sidebar${sidebarOpen ? ' cat-sidebar-open' : ''}`}>
          <FilterSidebar
            filters={filters}
            onFiltersChange={f => { setFilters(f); setPage(1); }}
            onClose={() => setSidebarOpen(false)}
          />
        </aside>

        {sidebarOpen && (
          <div className="cat-sidebar-overlay" onClick={() => setSidebarOpen(false)} />
        )}

        <main className="cat-main">

          <button className="cat-filter-btn" onClick={() => setSidebarOpen(true)}>
            <FilterIcon /> Фильтры
          </button>

          <div className="cat-top-btns">
            <a href="https://www.encar.com" target="_blank" rel="noreferrer" className="btn-encar">
              <EncarIcon /> Encar
            </a>
            <a href="#" className="btn-wa-group">
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
              <select
                className="cat-sort"
                value={sort}
                onChange={e => { setSort(e.target.value); setPage(1) }}
              >
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
                {cars.length === 0 ? (
                  <div className="cat-empty">Автомобили не найдены. Измените фильтры.</div>
                ) : (
                  cars.map(car => <CarCard key={car.id} car={car} />)
                )}
              </div>

              {meta.pages > 1 && (
                <div className="cat-pagination">
                  <button
                    className="cat-page-btn"
                    disabled={meta.page <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                  >← Назад</button>
                  <span className="cat-page-info">Стр. {meta.page} / {meta.pages}</span>
                  <button
                    className="cat-page-btn"
                    disabled={meta.page >= meta.pages}
                    onClick={() => setPage(p => Math.min(meta.pages, p + 1))}
                  >Вперёд →</button>
                </div>
              )}
            </>
          )}

        </main>
      </div>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

const HANGUL_RE = /[\uAC00-\uD7A3]/u

const PrevIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <polyline points="15 18 9 12 15 6" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const NextIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <polyline points="9 18 15 12 9 6" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const PinIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
    />
    <circle cx="12" cy="11" r="3" strokeWidth={2} />
  </svg>
)

const WhatsAppIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
)

const NewTabIcon = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
    />
  </svg>
)

const BodyIcon = () => (
  <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 15l1.5-4.5A2 2 0 017.4 9H16.6a2 2 0 011.9 1.5L20 15M6 15h12M7 18h.01M17 18h.01M7 18a1 1 0 11-2 0 1 1 0 012 0zm12 0a1 1 0 11-2 0 1 1 0 012 0z" />
  </svg>
)

const GearIcon = () => (
  <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.983 5.5a1.5 1.5 0 013 0l.13.892a1.5 1.5 0 001.196 1.24l.9.18a1.5 1.5 0 011.1 2.39l-.567.716a1.5 1.5 0 000 1.864l.567.716a1.5 1.5 0 01-1.1 2.39l-.9.18a1.5 1.5 0 00-1.195 1.24l-.131.892a1.5 1.5 0 01-3 0l-.13-.892a1.5 1.5 0 00-1.196-1.24l-.9-.18a1.5 1.5 0 01-1.1-2.39l.567-.716a1.5 1.5 0 000-1.864l-.567-.716a1.5 1.5 0 011.1-2.39l.9-.18a1.5 1.5 0 001.196-1.24l.13-.892z" />
    <circle cx="12" cy="12" r="3" strokeWidth={2} />
  </svg>
)

const FuelIcon = () => (
  <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 4h6v16H8zM14 7h2l2 2v7a2 2 0 01-2 2" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 8h6" />
  </svg>
)

const EngineIcon = () => (
  <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 8h8a2 2 0 012 2v4a2 2 0 01-2 2H6V8z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 10H2m2 4H2m12-6h2l2 2v4l-2 2h-2m-6 0v2m4-2v2m-4-12V4m4 2V4" />
  </svg>
)

const PulseIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12h4l2-5 4 10 2-5h6" />
  </svg>
)

const ShieldIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
  </svg>
)

const CameraIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h3l2-2h6l2 2h3v10H4z" />
    <circle cx="12" cy="13" r="3" strokeWidth={2} />
  </svg>
)

const TAG_STYLES = [
  { bg: '#ede9fe', color: '#6d28d9' },
  { bg: '#dbeafe', color: '#1d4ed8' },
  { bg: '#fef3c7', color: '#92400e' },
  { bg: '#d1fae5', color: '#065f46' },
]

const SERVICE_BADGE_STYLES = {
  blue: { bg: '#dbeafe', color: '#1d4ed8' },
  green: { bg: '#dcfce7', color: '#166534' },
  amber: { bg: '#fef3c7', color: '#92400e' },
}

const COLOR_SWATCHES = {
  Черный: '#101010',
  Белый: '#f8fafc',
  Серый: '#6b7280',
  Серебристый: '#cbd5e1',
  Синий: '#2563eb',
  Красный: '#dc2626',
  Зеленый: '#16a34a',
  Коричневый: '#7c4a1d',
  Бежевый: '#d6c1a1',
  Желтый: '#eab308',
  Оранжевый: '#f97316',
  Фиолетовый: '#7c3aed',
}

function formatMileage(value) {
  return `${Number(value || 0).toLocaleString()} км`
}

function colorToSwatch(label) {
  return COLOR_SWATCHES[String(label || '').trim()] || '#cbd5e1'
}

function shouldHideTopTag(tag, car) {
  const value = String(tag || '').trim()
  const low = value.toLowerCase()
  const normalizedSpecs = [car?.fuelType, car?.transmission, car?.driveType, car?.bodyType]
    .map((item) => String(item || '').trim())
    .filter(Boolean)

  if (normalizedSpecs.includes(value)) return true

  return (
    /gasoline|diesel|hybrid|electric|lpg|auto|automatic|manual|cvt|dct|robot|2wd|4wd|awd|fwd|rwd/i.test(low) ||
    /бенз|дизел|гибрид|электро|газ|автомат|механик|робот/i.test(value) ||
    HANGUL_RE.test(value)
  )
}

function buildFeatureItems(car) {
  const items = []
  if (car.bodyType && car.bodyType !== '-') {
    items.push({ key: 'body', label: car.bodyType, icon: <BodyIcon /> })
  }
  if (car.transmission && car.transmission !== '-') {
    items.push({ key: 'transmission', label: car.transmission, icon: <GearIcon /> })
  }
  if (car.fuelType && car.fuelType !== '-') {
    items.push({ key: 'fuel', label: car.fuelType, icon: <FuelIcon /> })
  }
  if (car.engineVolume) {
    items.push({ key: 'engine', label: car.engineVolume, icon: <EngineIcon /> })
  }
  return items
}

function buildServiceBadges(car) {
  const badges = []
  if (car.detailFlags?.diagnosis) {
    badges.push({ key: 'diagnosis', label: 'Диагностика', tone: 'blue', icon: <PulseIcon /> })
  }
  if (Array.isArray(car.inspectionFormats) && car.inspectionFormats.length) {
    badges.push({ key: 'report', label: 'Отчет инспекции', tone: 'green', icon: <ShieldIcon /> })
  }
  if ((Array.isArray(car.images) ? car.images.length : 0) >= 10) {
    badges.push({ key: 'photos', label: `${car.images.length} фото`, tone: 'amber', icon: <CameraIcon /> })
  }
  return badges
}

export default function CarCard({ car }) {
  const navigate = useNavigate()
  const [imgIdx, setImgIdx] = useState(0)
  const [failedUrls, setFailedUrls] = useState([])

  const images = useMemo(() => {
    const base = Array.isArray(car.images) ? car.images : []
    if (!failedUrls.length) return base
    return base.filter((img) => img?.url && !failedUrls.includes(img.url))
  }, [car.images, failedUrls])

  const imageCount = images.length || 1
  const boundedIdx = Math.min(imgIdx, imageCount - 1)
  const imageSrc = images[boundedIdx]?.url || ''
  const hasImage = Boolean(imageSrc)
  const featureItems = useMemo(() => buildFeatureItems(car), [car])
  const serviceBadges = useMemo(() => buildServiceBadges(car), [car])
  const visibleTags = useMemo(
    () => (Array.isArray(car.tags) ? car.tags.filter((tag) => !shouldHideTopTag(tag, car)) : []),
    [car]
  )

  useEffect(() => {
    setImgIdx(0)
    setFailedUrls([])
  }, [car.id, car.images])

  const prev = () => setImgIdx((i) => Math.max(0, i - 1))
  const next = () => setImgIdx((i) => Math.min(imageCount - 1, i + 1))

  const onImgError = () => {
    if (!imageSrc) return
    setFailedUrls((prevFailed) => {
      if (prevFailed.includes(imageSrc)) return prevFailed
      return [...prevFailed, imageSrc]
    })
    setImgIdx(0)
  }

  const openDetails = () => navigate(`/catalog/${car.id}`)

  const onCardClick = (e) => {
    if (e.defaultPrevented) return
    if (e.target.closest('a, button, input, select, textarea, label')) return
    openDetails()
  }

  const onCardKeyDown = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    if (e.target.closest('a, button, input, select, textarea, label')) return
    e.preventDefault()
    openDetails()
  }

  return (
    <div
      className="car-card car-card-clickable"
      role="link"
      tabIndex={0}
      onClick={onCardClick}
      onKeyDown={onCardKeyDown}
    >
      <div className="car-card-top">
        <div className="car-img-wrap">
          {hasImage ? (
            <img
              src={imageSrc}
              alt={car.name}
              className="car-img"
              loading="lazy"
              onError={onImgError}
            />
          ) : (
            <div className="car-img-placeholder">
              <svg width="56" height="56" fill="none" stroke="#cbd5e1" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M19 17H5a2 2 0 01-2-2V9a2 2 0 012-2h1l2-3h8l2 3h1a2 2 0 012 2v6a2 2 0 01-2 2z"
                />
                <circle cx="12" cy="12" r="2.5" strokeWidth={1} />
              </svg>
            </div>
          )}

          {imageCount > 1 && (
            <>
              <button className="car-img-btn car-img-btn-prev" onClick={prev} disabled={boundedIdx === 0}>
                <PrevIcon />
              </button>
              <button className="car-img-btn car-img-btn-next" onClick={next} disabled={boundedIdx === imageCount - 1}>
                <NextIcon />
              </button>
            </>
          )}

          <span className="car-img-counter">{boundedIdx + 1}/{imageCount}</span>
          {car.encarUrl && <span className="car-img-encar-badge">encar</span>}
        </div>

        <div className="car-info">
          <h3 className="car-name">{car.name}</h3>
          <span className="car-model">{car.model}</span>

          <div className="car-meta">
            <span>{car.year}</span>
            <span className="car-meta-sep">•</span>
            <span>{formatMileage(car.mileage)}</span>
          </div>

          {!!visibleTags.length && (
            <div className="car-tags">
              {visibleTags.map((tag, i) => (
                <span
                  key={`${tag}-${i}`}
                  className="car-tag"
                  style={{
                    backgroundColor: TAG_STYLES[i % TAG_STYLES.length].bg,
                    color: TAG_STYLES[i % TAG_STYLES.length].color,
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {!!serviceBadges.length && (
            <div className="car-service-badges">
              {serviceBadges.map((badge) => (
                <span
                  key={badge.key}
                  className="car-service-badge"
                  style={{
                    backgroundColor: SERVICE_BADGE_STYLES[badge.tone].bg,
                    color: SERVICE_BADGE_STYLES[badge.tone].color,
                  }}
                >
                  {badge.icon}
                  {badge.label}
                </span>
              ))}
            </div>
          )}

          {!!featureItems.length && (
            <div className="car-feature-row">
              {featureItems.map((item) => (
                <span key={item.key} className="car-feature-pill">
                  {item.icon}
                  {item.label}
                </span>
              ))}
            </div>
          )}

          <div className="car-color-row">
            <div className="car-detail">
              <span className="car-detail-label">Кузов:</span>
              <span className="car-color-dot" style={{ backgroundColor: colorToSwatch(car.bodyColor) }} />
              <span className="car-detail-value">{car.bodyColor || '-'}</span>
            </div>
            <div className="car-detail">
              <span className="car-detail-label">Салон:</span>
              <span className="car-color-dot" style={{ backgroundColor: colorToSwatch(car.interiorColor) }} />
              <span className="car-detail-value">{car.interiorColor || '-'}</span>
            </div>
            <div className="car-detail">
              <span className="car-detail-label">Привод:</span>
              <span className="car-detail-value">{car.driveType || '-'}</span>
            </div>
          </div>

          <div className="car-location">
            <PinIcon />
            <span>{car.location || '-'}</span>
          </div>
        </div>

        <div className="car-price-col">
          <div className="car-price-krw">{Number(car.priceKRW || 0).toLocaleString()} ₩</div>
          <div className="car-price-usd">${Number(car.priceUSD || 0).toLocaleString()}</div>

          <div className="car-price-breakdown">
            <div className="car-price-row">
              <span>Комиссия:</span>
              <span>${Number(car.commission || 0).toLocaleString()}</span>
            </div>
            <div className="car-price-row">
              <span>Доставка:</span>
              <span>${Number(car.delivery || 0).toLocaleString()}</span>
            </div>
            <div className="car-price-row">
              <span>Погрузка:</span>
              <span>${Number(car.loading || 0).toLocaleString()}</span>
            </div>
            <div className="car-price-row">
              <span>Выгрузка:</span>
              <span>${Number(car.unloading || 0).toLocaleString()}</span>
            </div>
            <div className="car-price-row">
              <span>Стоянка:</span>
              <span>${Number(car.storage || 0).toLocaleString()}</span>
            </div>
            <div className="car-price-row car-price-vat">
              <span>Возврат НДС (7%):</span>
              <span>-${Number(car.vatRefund || 0).toLocaleString()}</span>
            </div>
          </div>

          <div className="car-price-total">
            <span>До Бишкека:</span>
            <span>${Number(car.total || 0).toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div className="car-card-actions">
        <Link to={`/catalog/${car.id}`} className="btn-car-primary">Открыть детали</Link>
        <a href={car.encarUrl || '#'} target="_blank" rel="noreferrer" className="btn-car-outline">
          <NewTabIcon /> В новой вкладке
        </a>
        <a href={car.encarUrl || '#'} target="_blank" rel="noreferrer" className="btn-car-outline">
          Encar →
        </a>
        <a
          href={`https://wa.me/821056650943?text=${encodeURIComponent(`Хочу заказать: ${car.name} (${car.year}), VIN: ${car.vin || '-'}`)}`}
          target="_blank"
          rel="noreferrer"
          className="btn-car-green"
        >
          <WhatsAppIcon /> Заказать
        </a>
        {car.canNegotiate && <button className="btn-car-negotiate">Возможен торг</button>}
      </div>
    </div>
  )
}

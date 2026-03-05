import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

const HomeIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" strokeWidth={2} />
  </svg>
)

const ChevronRightIcon = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <polyline points="9 18 15 12 9 6" strokeWidth={2} strokeLinecap="round" />
  </svg>
)

const BackIcon = () => (
  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <polyline points="15 18 9 12 15 6" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

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

function parseYear(value) {
  const m = String(value || '').match(/\d{4}/)
  return m ? Number(m[0]) : new Date().getFullYear()
}

function inferEngineLiters(model) {
  const src = String(model || '')
  const matches = src.match(/\b(\d(?:\.\d)?)\b/g) || []
  const candidate = matches
    .map(Number)
    .find((n) => Number.isFinite(n) && n >= 0.8 && n <= 8.0)
  return candidate || 2.0
}

function detectFuel(car) {
  const explicit = String(car.fuel_type || '').toLowerCase()
  const tags = Array.isArray(car.tags) ? car.tags.join(' ').toLowerCase() : ''
  const mixed = `${explicit} ${tags}`
  if (mixed.includes('дизел') || mixed.includes('diesel') || mixed.includes('디젤')) return 'diesel'
  if (mixed.includes('электро') || mixed.includes('electric') || mixed.includes('전기')) return 'electric'
  if (mixed.includes('газ') || mixed.includes('lpg')) return 'lpg'
  return 'gasoline'
}

function fuelLabel(type) {
  if (type === 'diesel') return 'Дизель'
  if (type === 'electric') return 'Электро'
  if (type === 'lpg') return 'Газ'
  return 'Бензин'
}

function estimateCustomsDuty({ year, engine, fuel }) {
  const age = Math.max(0, new Date().getFullYear() - Number(year || new Date().getFullYear()))
  const liters = Math.max(0.8, Number(engine || 2))
  let usd

  if (fuel === 'electric') {
    usd = liters * 450
  } else if (age <= 3) {
    usd = liters * 850
  } else if (age <= 5) {
    usd = liters * 1150
  } else if (liters > 3) {
    usd = liters * 1500
  } else if (liters > 2) {
    usd = liters * 1300
  } else {
    usd = liters * 900
  }

  if (fuel === 'diesel') usd *= 1.12
  if (fuel === 'lpg') usd *= 0.95
  return Math.round(usd)
}

function formatDate(value) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('ru-RU')
}

function hasHangulText(value) {
  return /[\uAC00-\uD7A3]/u.test(String(value || ''))
}

function shouldReplaceText(value) {
  const text = String(value || '').trim()
  return !text || text === '-' || hasHangulText(text)
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
      if (typeof img === 'string') {
        return { id: `img-${idx}`, url: toAbsoluteImageUrl(img) }
      }
      return {
        id: img.id ?? `img-${idx}`,
        url: toAbsoluteImageUrl(img.url || img.path || img.location || ''),
      }
    })
    .filter((img) => img?.url)
}

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
  const tags = Array.isArray(c.tags) ? c.tags : []

  return {
    id: c.id,
    name: c.name || 'Автомобиль',
    model: c.model || '',
    year: c.year || '-',
    yearNum: parseYear(c.year),
    mileage: Number(c.mileage || 0),
    bodyColor: normalizeColorLabel(c.body_color || '-'),
    interiorColor: normalizeColorLabel(c.interior_color || c.body_color || '-'),
    location: c.location || 'Корея',
    vin: c.vin || '-',
    tags,
    fuelType: c.fuel_type || '',
    priceKRW: Number(c.price_krw) || 0,
    priceUSD,
    commission,
    delivery,
    loading,
    unloading,
    storage,
    vatRefund,
    total,
    encarUrl: c.encar_url || '',
    canNegotiate: Boolean(c.can_negotiate),
    images,
    encarId: c.encar_id || '-',
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    bodyType: '-',
    transmission: tags.find((t) => /автомат|механика|робот|cvt/i.test(String(t))) || '-',
    seatCount: null,
    displacement: 0,
    vehicleNo: '-',
    detailFlags: {},
    detailCondition: {},
    detailManage: {},
  }
}

function mergeCarWithEncar(baseCar, detail) {
  const detailImages = normalizeImages(detail?.photos?.length ? detail.photos : detail?.images)
  const baseImages = normalizeImages(baseCar.images)
  const images = detailImages.length ? detailImages : baseImages
  const year = baseCar.year === '-' && detail?.year ? detail.year : baseCar.year

  return {
    ...baseCar,
    name: shouldReplaceText(baseCar.name) ? (detail?.name || baseCar.name) : baseCar.name,
    model: shouldReplaceText(baseCar.model) ? (detail?.model || baseCar.model) : baseCar.model,
    year,
    yearNum: parseYear(year),
    mileage: baseCar.mileage || Number(detail?.mileage || 0),
    bodyColor: shouldReplaceColor(baseCar.bodyColor) ? normalizeColorLabel(detail?.body_color || baseCar.bodyColor || '-') : baseCar.bodyColor,
    interiorColor: shouldReplaceColor(baseCar.interiorColor) ? normalizeColorLabel(detail?.interior_color || baseCar.interiorColor || '-') : baseCar.interiorColor,
    location: (baseCar.location === 'Корея' || shouldReplaceText(baseCar.location)) ? (detail?.location || baseCar.location) : baseCar.location,
    vin: baseCar.vin === '-' ? (detail?.vin || detail?.vehicle_no || '-') : baseCar.vin,
    fuelType: shouldReplaceText(baseCar.fuelType) ? (detail?.fuel_type || baseCar.fuelType || '') : baseCar.fuelType,
    images,
    createdAt: detail?.manage?.firstAdvertisedDateTime || baseCar.createdAt,
    updatedAt: detail?.manage?.modifyDateTime || baseCar.updatedAt,
    bodyType: shouldReplaceText(baseCar.bodyType) ? (detail?.body_type || baseCar.bodyType || '-') : baseCar.bodyType,
    transmission: shouldReplaceText(baseCar.transmission) ? (detail?.transmission || baseCar.transmission || '-') : baseCar.transmission,
    seatCount: Number(detail?.seat_count) || baseCar.seatCount || null,
    displacement: Number(detail?.displacement) || baseCar.displacement || 0,
    vehicleNo: detail?.vehicle_no || baseCar.vehicleNo || '-',
    detailFlags: detail?.flags || {},
    detailCondition: detail?.condition || {},
    detailManage: detail?.manage || {},
  }
}

export default function CarDetailsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [car, setCar] = useState(null)
  const [imgIdx, setImgIdx] = useState(0)
  const [calc, setCalc] = useState({ year: new Date().getFullYear(), engine: 2.0, fuel: 'gasoline' })

  useEffect(() => {
    let active = true

    const run = async () => {
      try {
        const res = await fetch(`/api/cars/${id}`)
        if (!res.ok) throw new Error(res.status === 404 ? 'Машина не найдена' : 'Ошибка загрузки карточки')

        const data = await res.json()
        if (!active) return

        const mapped = mapCar(data)
        const fuel = detectFuel(data)
        setCar(mapped)
        setImgIdx(0)
        setError('')
        setCalc({ year: mapped.yearNum, engine: inferEngineLiters(mapped.model), fuel })

        if (mapped.encarId && mapped.encarId !== '-') {
          try {
            const detailRes = await fetch(`/api/encar/${mapped.encarId}`)
            if (!detailRes.ok) return
            const detail = await detailRes.json()
            if (!active) return

            setCar((prev) => (prev ? mergeCarWithEncar(prev, detail) : prev))
            setImgIdx(0)
            setCalc((prev) => ({
              ...prev,
              year: parseYear(detail?.year || mapped.year),
              engine: detail?.displacement ? Number((Number(detail.displacement) / 1000).toFixed(1)) : prev.engine,
              fuel: detectFuel({ fuel_type: detail?.fuel_type || mapped.fuelType, tags: mapped.tags }),
            }))
          } catch {
            // Ignore detail enrichment errors, base card remains available.
          }
        }
      } catch (e) {
        if (!active) return
        setError(e.message || 'Ошибка загрузки карточки')
      } finally {
        if (active) setLoading(false)
      }
    }

    run()
    return () => { active = false }
  }, [id])

  const imageCount = car?.images?.length || 1
  const boundedIdx = Math.min(imgIdx, imageCount - 1)
  const imageSrc = car?.images?.[boundedIdx]?.url || ''

  const customsDuty = useMemo(() => estimateCustomsDuty(calc), [calc])

  const customsNote = useMemo(() => {
    const age = Math.max(0, new Date().getFullYear() - Number(calc.year || new Date().getFullYear()))
    if (calc.fuel === 'electric') return 'Электромобили считаются по отдельной льготной сетке.'
    if (age > 5 && Number(calc.engine) > 2) return 'Автомобили старше 5 лет с объемом > 2.0 обычно считают по повышенной ставке.'
    if (age <= 3) return 'Для авто до 3 лет применяется базовая ставка.'
    return 'Расчет оценочный. Точную сумму подтвердит брокер.'
  }, [calc])

  if (loading) {
    return (
      <div className="catalog-page">
        <div className="cat-layout">
          <div className="cat-loading">
            <div className="cat-loading-spinner" />
            <span>Загрузка карточки...</span>
          </div>
        </div>
      </div>
    )
  }

  if (error || !car) {
    return (
      <div className="catalog-page">
        <div className="cat-layout">
          <div className="cat-error">
            ⚠️ {error || 'Машина не найдена'} — <Link to="/catalog">Вернуться в каталог</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="catalog-page">
      <div className="cat-breadcrumb">
        <div className="cat-breadcrumb-inner">
          <Link to="/" className="cat-bc-link"><HomeIcon /> Главная</Link>
          <span className="cat-bc-sep"><ChevronRightIcon /></span>
          <Link to="/catalog" className="cat-bc-link">Каталог</Link>
          <span className="cat-bc-sep"><ChevronRightIcon /></span>
          <span className="cat-bc-current">{car.name}</span>
        </div>
      </div>

      <div className="car-details-wrap">
        <button className="car-details-back" onClick={() => navigate(-1)}><BackIcon /> Назад</button>

        <div className="car-details-grid">
          <section className="car-details-left">
            <div className="car-details-media-card">
              <div className="car-details-main-image-wrap">
                {imageSrc ? (
                  <img src={imageSrc} alt={car.name} className="car-details-main-image" loading="lazy" />
                ) : (
                  <div className="car-img-placeholder">Нет фото</div>
                )}

                {imageCount > 1 && (
                  <>
                    <button className="car-img-btn car-img-btn-prev" onClick={() => setImgIdx((i) => Math.max(0, i - 1))} disabled={boundedIdx === 0}><PrevIcon /></button>
                    <button className="car-img-btn car-img-btn-next" onClick={() => setImgIdx((i) => Math.min(imageCount - 1, i + 1))} disabled={boundedIdx === imageCount - 1}><NextIcon /></button>
                  </>
                )}
                <span className="car-img-counter">{boundedIdx + 1} / {imageCount}</span>
              </div>

              {car.images.length > 1 && (
                <div className="car-details-thumbs">
                  {car.images.map((img, i) => (
                    <button key={img.id || `${img.url}-${i}`} className={`car-details-thumb${i === boundedIdx ? ' car-details-thumb-active' : ''}`} onClick={() => setImgIdx(i)}>
                      <img src={img.url} alt={`${car.name} ${i + 1}`} loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="car-details-title-card">
              <h1 className="car-details-title">{car.name}</h1>
              <p className="car-details-sub">{car.model || '-'}</p>

              <div className="car-details-meta-grid">
                <div><span className="car-details-meta-label">Год</span><strong>{car.year || '-'}</strong></div>
                <div><span className="car-details-meta-label">Пробег</span><strong>{car.mileage.toLocaleString()} км</strong></div>
                <div><span className="car-details-meta-label">Местоположение</span><strong>{car.location || '-'}</strong></div>
                <div><span className="car-details-meta-label">VIN / Номер</span><strong>{(car.vin && car.vin !== '-') ? car.vin : (car.vehicleNo || '-')}</strong></div>
              </div>

              <div className="car-details-actions">
                <a href={`https://wa.me/996705188088?text=Хочу заказать: ${car.name} (${car.year}), VIN: ${car.vin || '-'}`} target="_blank" rel="noreferrer" className="btn-car-green">Заказать</a>
                <a href={car.encarUrl || '#'} target="_blank" rel="noreferrer" className="btn-car-outline">На Encar</a>
              </div>
            </div>
          </section>

          <aside className="car-details-right">
            <div className="car-details-card">
              <div className="car-details-price-heading">Цена</div>
              <div className="car-details-price-krw">{car.priceKRW.toLocaleString()} ₩</div>
              <div className="car-details-price-usd">${car.priceUSD.toLocaleString()}</div>
              <p className="car-details-price-note">Цена в корейских вонах (KRW) и в долларах США (USD)</p>

              <div className="car-details-breakdown">
                <div className="car-price-row"><span>Цена машины (KRW)</span><span>{car.priceKRW.toLocaleString()} ₩</span></div>
                <div className="car-price-row"><span>Финальная цена (USD)</span><span>${car.priceUSD.toLocaleString()}</span></div>
                <div className="car-price-row car-price-vat"><span>Возврат НДС</span><span>-${car.vatRefund.toLocaleString()}</span></div>
                <div className="car-price-row"><span>Комиссия компании</span><span>${car.commission.toLocaleString()}</span></div>
                <div className="car-price-row"><span>Доставка</span><span>${car.delivery.toLocaleString()}</span></div>
                <div className="car-price-row"><span>Погрузка</span><span>${car.loading.toLocaleString()}</span></div>
                <div className="car-price-row"><span>Выгрузка</span><span>${car.unloading.toLocaleString()}</span></div>
                <div className="car-price-row"><span>Стоянка</span><span>${car.storage.toLocaleString()}</span></div>
              </div>
              <div className="car-price-total"><span>Итого</span><span>${car.total.toLocaleString()}</span></div>
              {car.canNegotiate && <div className="car-details-negotiate">Возможен торг</div>}
            </div>

            <div className="car-details-card">
              <h3 className="car-details-card-title">Основные характеристики</h3>
              <div className="car-details-specs-grid">
                <div><span>Топливо</span><strong>{car.fuelType || fuelLabel(calc.fuel)}</strong></div>
                <div><span>Трансмиссия</span><strong>{car.transmission || '-'}</strong></div>
                <div><span>Цвет кузова</span><strong>{car.bodyColor || '-'}</strong></div>
                <div><span>Цвет салона</span><strong>{car.interiorColor || '-'}</strong></div>
                <div><span>Пробег</span><strong>{car.mileage.toLocaleString()} км</strong></div>
                <div><span>Местоположение</span><strong>{car.location || '-'}</strong></div>
                <div><span>Тип кузова</span><strong>{car.bodyType || '-'}</strong></div>
                <div><span>Мест</span><strong>{car.seatCount || '-'}</strong></div>
                <div><span>Объем двигателя</span><strong>{car.displacement ? `${car.displacement} cc` : '-'}</strong></div>
                <div><span>Encar ID</span><strong>{car.encarId || '-'}</strong></div>
                <div><span>Дата добавления</span><strong>{formatDate(car.createdAt)}</strong></div>
                <div><span>Последнее изменение</span><strong>{formatDate(car.updatedAt)}</strong></div>
              </div>
            </div>

            <div className="car-details-card car-details-customs">
              <h3 className="car-details-card-title">Калькулятор растаможки (Кыргызстан)</h3>
              <div className="car-details-customs-grid">
                <label>
                  <span>Год выпуска</span>
                  <input type="number" value={calc.year} onChange={(e) => setCalc((p) => ({ ...p, year: Number(e.target.value) || p.year }))} />
                </label>
                <label>
                  <span>Объем двигателя (л)</span>
                  <input type="number" step="0.1" value={calc.engine} onChange={(e) => setCalc((p) => ({ ...p, engine: Number(e.target.value) || p.engine }))} />
                </label>
                <label>
                  <span>Тип топлива</span>
                  <select value={calc.fuel} onChange={(e) => setCalc((p) => ({ ...p, fuel: e.target.value }))}>
                    <option value="gasoline">Бензин</option>
                    <option value="diesel">Дизель</option>
                    <option value="lpg">Газ</option>
                    <option value="electric">Электро</option>
                  </select>
                </label>
              </div>
              <div className="car-details-customs-result"><span>Пошлина по сетке (оценка)</span><strong>${customsDuty.toLocaleString()}</strong></div>
              <div className="car-details-customs-meta">
                <span>Год: {calc.year}</span>
                <span>Объем: {Number(calc.engine).toFixed(1)} л</span>
                <span>Топливо: {fuelLabel(calc.fuel)}</span>
              </div>
              <p className="car-details-customs-note">{customsNote}</p>
            </div>
          </aside>
        </div>

        <section className="car-details-card car-details-bottom-card">
          <h3 className="car-details-card-title">Инспекция и диагностика автомобиля</h3>
          <p className="car-details-muted">
            Диагностика Encar: {car.detailFlags?.diagnosis ? 'доступна' : 'данные ограничены'}.
            Просмотры: {Number(car.detailManage?.viewCount || 0).toLocaleString()} • Подписки: {Number(car.detailManage?.subscribeCount || 0).toLocaleString()}.
          </p>
          <div className="car-details-actions">
            <a href={car.encarUrl || '#'} target="_blank" rel="noreferrer" className="btn-car-primary">Открыть в Encar</a>
            <a href={car.encarUrl || '#'} target="_blank" rel="noreferrer" className="btn-car-green">Скачать диагностику (PDF, RU)</a>
          </div>
        </section>

        <section className="car-details-card car-details-bottom-card">
          <h3 className="car-details-card-title">История регистрации</h3>
          <div className="car-details-history-grid">
            <div><span>Год</span><strong>{car.year || '-'}</strong></div>
            <div><span>Номер авто</span><strong>{car.vehicleNo || '—'}</strong></div>
            <div><span>VIN</span><strong>{car.vin || '—'}</strong></div>
            <div><span>Ограничения</span><strong>{Number(car.detailCondition?.seizingCount || 0)}</strong></div>
            <div><span>Залог</span><strong>{Number(car.detailCondition?.pledgeCount || 0)}</strong></div>
            <div><span>Аварийная история</span><strong>{car.detailCondition?.accidentRecordView ? 'Есть запись' : 'Нет данных'}</strong></div>
          </div>
        </section>
      </div>
    </div>
  )
}

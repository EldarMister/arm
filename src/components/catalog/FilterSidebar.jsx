import { useState, useEffect, useMemo } from 'react'
import { getColorSwatch, normalizeColorLabel as normalizeVehicleColorLabel } from '../../lib/vehicleDisplay'

const ChevronIcon = ({ open }) => (
  <svg
    width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"
    style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}
  >
    <polyline points="6 9 12 15 18 9" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const ChevronUpSmall = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <polyline points="18 15 12 9 6 15" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const ChevronDownSmall = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <polyline points="6 9 12 15 18 9" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const SearchIcon = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="11" cy="11" r="8" strokeWidth={2} />
    <path d="m21 21-4.35-4.35" strokeWidth={2} strokeLinecap="round" />
  </svg>
)

const CloseIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <line x1="18" y1="6" x2="6" y2="18" strokeWidth={2} strokeLinecap="round" />
    <line x1="6" y1="6" x2="18" y2="18" strokeWidth={2} strokeLinecap="round" />
  </svg>
)

/* Fallback статичные данные (если бэкенд недоступен / база пустая) */
const FALLBACK = {
  brands: [
    { name: 'Kia', count: 0 },
    { name: 'Hyundai', count: 0 },
    { name: 'Genesis', count: 0 },
    { name: 'Chevrolet', count: 0 },
    { name: 'Renault Samsung', count: 0 },
    { name: 'Ssangyong', count: 0 },
    { name: 'BMW', count: 0 },
    { name: 'Mercedes-Benz', count: 0 },
    { name: 'Audi', count: 0 },
    { name: 'Toyota', count: 0 },
    { name: 'Honda', count: 0 },
    { name: 'Volkswagen', count: 0 },
  ],
  driveTypes: [
    { name: 'Передний (FWD)', count: 0 },
    { name: 'Полный (AWD)', count: 0 },
    { name: 'Полный (4WD)', count: 0 },
    { name: 'Задний (RWD)', count: 0 },
  ],
  fuelTypes: [
    { name: 'Бензин', count: 0 },
    { name: 'Дизель', count: 0 },
    { name: 'Бензин(гибрид)', count: 0 },
    { name: 'Электро', count: 0 },
    { name: 'Газ(LPG/Частное владение)', count: 0 },
    { name: 'Водород', count: 0 },
  ],
  bodyTypes: [
    { name: 'Внедорожники и кроссоверы', count: 0 },
    { name: 'Седаны среднего класса', count: 0 },
    { name: 'Бизнес и люкс седаны', count: 0 },
    { name: 'Седаны компакт-класса', count: 0 },
    { name: 'Минивэны', count: 0 },
    { name: 'Купе и спорткары', count: 0 },
  ],
  bodyColors: [
    { name: 'Белый', count: 0, color: '#f0f0f0', border: '#d1d5db' },
    { name: 'Чёрный', count: 0, color: '#1a1a1a' },
    { name: 'Тёмно-серый', count: 0, color: '#4b5563' },
    { name: 'Синий', count: 0, color: '#1d4ed8' },
    { name: 'Серебристый', count: 0, color: '#d1d5db', border: '#9ca3af' },
    { name: 'Красный', count: 0, color: '#dc2626' },
    { name: 'Зелёный', count: 0, color: '#16a34a' },
  ],
  interiorColors: [
    { name: 'Чёрный', count: 0, color: '#1a1a1a' },
    { name: 'Бежевый', count: 0, color: '#d4a96a' },
    { name: 'Оранжевый', count: 0, color: '#f97316' },
    { name: 'Светло-серый', count: 0, color: '#d1d5db', border: '#9ca3af' },
  ],
}

const EMPTY_LOCAL_FILTERS = {
  minPrice: '', maxPrice: '',
  minYear: '', maxYear: '',
  minMileage: '', maxMileage: '',
  brands: [], drive: [], fuel: [], body: [], bodyColor: [], interiorColor: [],
}

function normalizeArrayFilterValue(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

function buildLocalFilters(filters) {
  const src = filters || {}
  return {
    ...EMPTY_LOCAL_FILTERS,
    minPrice: String(src.minPrice ?? ''),
    maxPrice: String(src.maxPrice ?? ''),
    minYear: String(src.minYear ?? ''),
    maxYear: String(src.maxYear ?? ''),
    minMileage: String(src.minMileage ?? ''),
    maxMileage: String(src.maxMileage ?? ''),
    brands: normalizeArrayFilterValue(src.brands ?? src.brand),
    drive: normalizeArrayFilterValue(src.drive),
    fuel: normalizeArrayFilterValue(src.fuel),
    body: normalizeArrayFilterValue(src.body),
    bodyColor: normalizeArrayFilterValue(src.bodyColor ?? src.color),
    interiorColor: normalizeArrayFilterValue(src.interiorColor),
  }
}

function normalizeRangePair(minValue, maxValue) {
  const min = String(minValue || '').trim()
  const max = String(maxValue || '').trim()
  if (!min || !max) return [min, max]
  return Number(min) <= Number(max) ? [min, max] : [max, min]
}

/* Цветовая карта для цветов кузова/салона (для отображения кружочков) */
const COLOR_MAP = {
  'черный': { color: '#1a1a1a' },
  'чёрный': { color: '#1a1a1a' },
  'белый': { color: '#f0f0f0', border: '#d1d5db' },
  'белоснежный': { color: '#fafafa', border: '#d1d5db' },
  'серый': { color: '#6b7280' },
  'тёмно-серый': { color: '#4b5563' },
  'светло-серый': { color: '#e5e7eb', border: '#9ca3af' },
  'серебристый': { color: '#d1d5db', border: '#9ca3af' },
  'синий': { color: '#1d4ed8' },
  'голубой': { color: '#60a5fa' },
  'красный': { color: '#dc2626' },
  'зеленый': { color: '#16a34a' },
  'зелёный': { color: '#16a34a' },
  'бирюзовый': { color: '#0d9488' },
  'желтый': { color: '#eab308' },
  'жёлтый': { color: '#eab308' },
  'бежевый': { color: '#d4a96a' },
  'оранжевый': { color: '#f97316' },
  'коричневый': { color: '#92400e' },
  'фиолетовый': { color: '#7c3aed' },
  black: { color: '#1a1a1a' },
  white: { color: '#f0f0f0', border: '#d1d5db' },
  gray: { color: '#6b7280' },
  grey: { color: '#6b7280' },
  silver: { color: '#d1d5db', border: '#9ca3af' },
  blue: { color: '#1d4ed8' },
  red: { color: '#dc2626' },
  green: { color: '#16a34a' },
  brown: { color: '#92400e' },
  beige: { color: '#d4a96a' },
  orange: { color: '#f97316' },
  yellow: { color: '#eab308' },
  purple: { color: '#7c3aed' },
  jwiseak: { color: '#6b7280' },
  hoesaek: { color: '#6b7280' },
  eunsaek: { color: '#d1d5db', border: '#9ca3af' },
  eunhasaek: { color: '#d1d5db', border: '#9ca3af' },
  cheongsaek: { color: '#1d4ed8' },
  parangsaek: { color: '#1d4ed8' },
  ppalgangsaek: { color: '#dc2626' },
  ppalgansaek: { color: '#dc2626' },
  hongsaek: { color: '#dc2626' },
  noksaek: { color: '#16a34a' },
  choroksaek: { color: '#16a34a' },
  baegsaek: { color: '#f0f0f0', border: '#d1d5db' },
  huinsaek: { color: '#f0f0f0', border: '#d1d5db' },
  geomeunsaek: { color: '#1a1a1a' },
  heugsaek: { color: '#1a1a1a' },
  geomjeongsaek: { color: '#1a1a1a' },
}

function getColorStyle(name) {
  const normalized = normalizeVehicleColorLabel(name)
  const color = getColorSwatch(normalized)
  const border = /бел|white|silver|серебрист|жемчуж|pearl|snow|ivory|айвори/i.test(normalized)
    ? '#cbd5e1'
    : color
  return { color, border }
}

function normalizeColorName(value) {
  return normalizeVehicleColorLabel(value)

  const text = String(value || '').trim()
  const low = text.toLowerCase()
  const compact = low.replace(/[\s_-]/g, '')

  if (!text || text === '-') return ''

  if (low.includes('black') || /^(geomeunsaek|geomjeongsaek|heugsaek)$/.test(compact) || /검정|흑색/.test(text)) return 'Черный'
  if (low.includes('white') || /^(baegsaek|huinsaek)$/.test(compact) || /흰색|백색/.test(text)) return 'Белый'
  if (low.includes('silver') || compact === 'eunsaek' || compact === 'eunhasaek' || /은색/.test(text)) return 'Серебристый'
  if (low.includes('gray') || low.includes('grey') || /^(hoesaek|jwiseak|jwisaek)$/.test(compact) || /회색|쥐색/.test(text)) return 'Серый'
  if (low.includes('blue') || /^(cheongsaek|parangsaek)$/.test(compact) || /청색|파랑/.test(text)) return 'Синий'
  if (low.includes('red') || /^(ppalgangsaek|ppalgansaek|hongsaek)$/.test(compact) || /빨강|홍색/.test(text)) return 'Красный'
  if (low.includes('green') || /^(noksaek|choroksaek)$/.test(compact) || /녹색|초록/.test(text)) return 'Зеленый'
  if (low.includes('brown') || compact === 'galsaek' || compact === 'galdaesaek' || /갈색/.test(text)) return 'Коричневый'
  if (low.includes('beige') || compact === 'beijisaek' || /베이지/.test(text)) return 'Бежевый'
  if (low.includes('orange') || compact === 'juhwangsaek' || /주황/.test(text)) return 'Оранжевый'
  if (low.includes('yellow') || compact === 'norangsaek' || /노랑/.test(text)) return 'Желтый'
  if (low.includes('purple') || low.includes('violet') || compact === 'borasaek' || /보라/.test(text)) return 'Фиолетовый'

  return text
}

/* ── Reusable checkbox list with expand ── */
const SHOW_MORE_THRESHOLD = 5

function CheckboxList({ items, selected, onToggle }) {
  const [expanded, setExpanded] = useState(false)
  const selectedValues = normalizeArrayFilterValue(selected)
  const visible = expanded ? items : items.slice(0, SHOW_MORE_THRESHOLD)
  const hidden = items.length - SHOW_MORE_THRESHOLD

  return (
    <>
      {visible.map(({ name, count }) => (
        <button
          key={name + count}
          type="button"
          className={`filter-brand-item${selectedValues.includes(name) ? ' is-selected' : ''}`}
          onClick={() => onToggle(name)}
          aria-pressed={selectedValues.includes(name)}
        >
          <span className={`filter-checkbox${selectedValues.includes(name) ? ' is-checked' : ''}`} aria-hidden="true">
            {selectedValues.includes(name) ? <span className="filter-checkbox-icon">✓</span> : null}
          </span>
          <span className="filter-brand-name">{name}</span>
          {count > 0 && <span className="filter-brand-count">{count.toLocaleString()}</span>}
        </button>
      ))}
      {items.length > SHOW_MORE_THRESHOLD && (
        <button type="button" className="filter-show-more-btn" onClick={() => setExpanded(e => !e)}>
          {expanded
            ? <><ChevronUpSmall /> Скрыть</>
            : <><ChevronDownSmall /> Ещё {hidden}</>
          }
        </button>
      )}
    </>
  )
}

/* ── Color grid ── */
function ColorGrid({ colors, selected, onToggle, showMoreLabel }) {
  const [expanded, setExpanded] = useState(false)
  const selectedValues = normalizeArrayFilterValue(selected)
  const visible = expanded ? colors : colors.slice(0, 12)

  return (
    <>
      <div className="filter-color-grid">
        {visible.map(({ name, count, color, border }) => {
          const style = color ? { color, border: `2px solid ${border || color}` } : getColorStyle(name)
          const borderColor = style.border || style.color
          const bgColor = style.color
          return (
            <label
              key={name + count}
              className={`filter-color-item${selectedValues.includes(name) ? ' selected' : ''}`}
            >
              <input
                type="checkbox"
                checked={selectedValues.includes(name)}
                onChange={() => onToggle(name)}
                style={{ display: 'none' }}
              />
              <span
                className="filter-color-circle"
                style={{
                  background: bgColor,
                  border: `2px solid ${borderColor}`,
                  outline: selectedValues.includes(name) ? '2px solid #1a3c5e' : 'none',
                  outlineOffset: '2px',
                }}
              />
              <span className="filter-color-name">{name}</span>
              {count > 0 && <span className="filter-brand-count">{count.toLocaleString()}</span>}
            </label>
          )
        })}
      </div>
      {colors.length > 12 && (
        <button type="button" className="filter-show-more-btn" onClick={() => setExpanded(e => !e)}>
          {expanded
            ? <><ChevronUpSmall /> Скрыть</>
            : <>+{colors.length - 12} {showMoreLabel || 'цветов'}</>
          }
        </button>
      )}
    </>
  )
}

function buildLiveColorOptions(cars, field) {
  const acc = new Map()
  for (const car of cars || []) {
    const name = normalizeColorName(String(car?.[field] || '').trim())
    if (!name || name === '-') continue
    acc.set(name, (acc.get(name) || 0) + 1)
  }

  return [...acc.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({
      name,
      count,
      ...getColorStyle(name),
    }))
}

/* ── Main component ── */
export default function FilterSidebar({ filters, onFiltersChange, onClose, catalogCars = [] }) {
  const [open, setOpen] = useState({
    price: true, year: true, mileage: true, brands: true,
    drive: true, characteristics: true, body: true,
    bodyColor: true, interiorColor: true,
  })
  const [brandSearch, setBrandSearch] = useState('')
  const [options, setOptions] = useState(FALLBACK)
  const [loadingOpts, setLoadingOpts] = useState(true)

  // Local filter state
  const [local, setLocal] = useState(() => buildLocalFilters(filters))

  const liveBodyColors = useMemo(() => buildLiveColorOptions(catalogCars, 'bodyColor'), [catalogCars])
  const liveInteriorColors = useMemo(() => buildLiveColorOptions(catalogCars, 'interiorColor'), [catalogCars])
  const years = useMemo(() => {
    const min = Number(options?.yearRange?.min_year) || 1990
    const max = Number(options?.yearRange?.max_year) || new Date().getFullYear()
    const length = Math.max(0, max - min + 1)
    return Array.from({ length }, (_, i) => max - i)
  }, [options?.yearRange])

  useEffect(() => {
    setLocal(buildLocalFilters(filters))
  }, [filters])

  // Fetch filter options from backend
  useEffect(() => {
    fetch('/api/admin/filter-options')
      .then(r => r.json())
      .then(data => {
        setOptions(prev => ({
          brands: data.brands?.length ? data.brands : prev.brands,
          driveTypes: data.driveTypes?.length ? data.driveTypes : prev.driveTypes,
          fuelTypes: data.fuelTypes?.length ? data.fuelTypes : prev.fuelTypes,
          bodyTypes: data.bodyTypes?.length ? data.bodyTypes : prev.bodyTypes,
          bodyColors: data.bodyColors?.length ? data.bodyColors : prev.bodyColors,
          interiorColors: data.interiorColors?.length ? data.interiorColors : prev.interiorColors,
          yearRange: data.yearRange || { min_year: 1990, max_year: 2026 },
          priceRange: data.priceRange || { min_price: 0, max_price: 100000 },
          mileageRange: data.mileageRange || { min_mileage: 0, max_mileage: 500000 },
        }))
      })
      .catch(() => {/* Используем fallback */ })
      .finally(() => setLoadingOpts(false))
  }, [])

  const toggle = (key) => setOpen(s => ({ ...s, [key]: !s[key] }))

  const setL = (k, v) => setLocal(s => ({ ...s, [k]: v }))

  const toggleItem = (group, name) => {
    setLocal(s => ({
      ...s,
      [group]: normalizeArrayFilterValue(s[group]).includes(name)
        ? normalizeArrayFilterValue(s[group]).filter(x => x !== name)
        : [...normalizeArrayFilterValue(s[group]), name],
    }))
  }

  const applyFilters = () => {
    const out = {}
    const [minPrice, maxPrice] = normalizeRangePair(local.minPrice, local.maxPrice)
    const [minYear, maxYear] = normalizeRangePair(local.minYear, local.maxYear)
    const [minMileage, maxMileage] = normalizeRangePair(local.minMileage, local.maxMileage)

    if (minPrice) out.minPrice = minPrice
    if (maxPrice) out.maxPrice = maxPrice
    if (minYear) out.minYear = minYear
    if (maxYear) out.maxYear = maxYear
    if (minMileage) out.minMileage = minMileage
    if (maxMileage) out.maxMileage = maxMileage
    if (local.brands.length) out.brand = local.brands.join(',')
    if (local.fuel.length) out.fuel = local.fuel.join(',')
    if (local.drive.length) out.drive = local.drive.join(',')
    if (local.body.length) out.body = local.body.join(',')
    if (local.bodyColor.length) out.color = local.bodyColor.join(',')
    if (local.interiorColor.length) out.interiorColor = local.interiorColor.join(',')
    onFiltersChange(out)
    onClose?.()
  }

  const resetFilters = () => {
    const empty = { ...EMPTY_LOCAL_FILTERS }
    setLocal(empty)
    onFiltersChange({})
  }

  const filteredBrands = options.brands.filter(b =>
    b.name.toLowerCase().includes(brandSearch.toLowerCase())
  )

  return (
    <div className="filter-sidebar">
      <div className="filter-sidebar-hd">
        <span className="filter-sidebar-title">Фильтры</span>
        {onClose && (
          <button type="button" className="filter-close-btn" onClick={onClose} aria-label="Закрыть">
            <CloseIcon />
          </button>
        )}
      </div>

      {loadingOpts && (
        <div style={{ padding: '8px 16px', fontSize: 12, color: '#94a3b8' }}>⏳ Загрузка фильтров...</div>
      )}

      {/* Цена */}
      <div className="filter-section">
        <button type="button" className="filter-section-hd" onClick={() => toggle('price')}>
          <span>Цена ($)</span>
          <ChevronIcon open={open.price} />
        </button>
        {open.price && (
          <div className="filter-section-body">
            <div className="filter-range">
              <div className="filter-range-col">
                <label className="filter-label">От ($)</label>
                <input
                  type="number" className="filter-input"
                  placeholder={options.priceRange ? Math.round(options.priceRange.min_price) : '0'}
                  value={local.minPrice}
                  onChange={e => setL('minPrice', e.target.value)}
                />
              </div>
              <div className="filter-range-col">
                <label className="filter-label">До ($)</label>
                <input
                  type="number" className="filter-input"
                  placeholder={options.priceRange ? Math.round(options.priceRange.max_price) : '100000'}
                  value={local.maxPrice}
                  onChange={e => setL('maxPrice', e.target.value)}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Год */}
      <div className="filter-section">
        <button type="button" className="filter-section-hd" onClick={() => toggle('year')}>
          <span>Год</span>
          <ChevronIcon open={open.year} />
        </button>
        {open.year && (
          <div className="filter-section-body">
            <div className="filter-range">
              <div className="filter-range-col">
                <label className="filter-label">От</label>
                <select className="filter-select" value={local.minYear} onChange={e => setL('minYear', e.target.value)}>
                  <option value="">Любой</option>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="filter-range-col">
                <label className="filter-label">До</label>
                <select className="filter-select" value={local.maxYear} onChange={e => setL('maxYear', e.target.value)}>
                  <option value="">Любой</option>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Пробег */}
      <div className="filter-section">
        <button type="button" className="filter-section-hd" onClick={() => toggle('mileage')}>
          <span>Пробег (км)</span>
          <ChevronIcon open={open.mileage} />
        </button>
        {open.mileage && (
          <div className="filter-section-body">
            <div className="filter-range">
              <div className="filter-range-col">
                <label className="filter-label">От</label>
                <input
                  type="number" className="filter-input"
                  placeholder={options.mileageRange ? options.mileageRange.min_mileage : '0'}
                  value={local.minMileage}
                  onChange={e => setL('minMileage', e.target.value)}
                />
              </div>
              <div className="filter-range-col">
                <label className="filter-label">До</label>
                <input
                  type="number" className="filter-input"
                  placeholder={options.mileageRange ? options.mileageRange.max_mileage : '200000'}
                  value={local.maxMileage}
                  onChange={e => setL('maxMileage', e.target.value)}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Марки */}
      <div className="filter-section">
        <button type="button" className="filter-section-hd" onClick={() => toggle('brands')}>
          <span>Марки</span>
          <ChevronIcon open={open.brands} />
        </button>
        {open.brands && (
          <div className="filter-section-body">
            <div className="filter-brand-search-wrap">
              <span className="filter-brand-search-icon"><SearchIcon /></span>
              <input
                type="text"
                className="filter-brand-search"
                placeholder="Поиск марки..."
                value={brandSearch}
                onChange={e => setBrandSearch(e.target.value)}
              />
            </div>
            <div className="filter-brands-list">
              <CheckboxList
                items={filteredBrands}
                selected={local.brands}
                onToggle={name => toggleItem('brands', name)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Привод */}
      <div className="filter-section">
        <button type="button" className="filter-section-hd" onClick={() => toggle('drive')}>
          <span>Привод</span>
          <ChevronIcon open={open.drive} />
        </button>
        {open.drive && (
          <div className="filter-section-body">
            <CheckboxList
              items={options.driveTypes}
              selected={local.drive}
              onToggle={name => toggleItem('drive', name)}
            />
          </div>
        )}
      </div>

      {/* Топливо */}
      <div className="filter-section">
        <button type="button" className="filter-section-hd" onClick={() => toggle('characteristics')}>
          <span>Характеристики</span>
          <ChevronIcon open={open.characteristics} />
        </button>
        {open.characteristics && (
          <div className="filter-section-body">
            <div className="filter-subsection-title">Топливо</div>
            <CheckboxList
              items={options.fuelTypes}
              selected={local.fuel}
              onToggle={name => toggleItem('fuel', name)}
            />
          </div>
        )}
      </div>

      {/* Кузов */}
      <div className="filter-section">
        <button type="button" className="filter-section-hd" onClick={() => toggle('body')}>
          <span>Кузов</span>
          <ChevronIcon open={open.body} />
        </button>
        {open.body && (
          <div className="filter-section-body">
            <CheckboxList
              items={options.bodyTypes}
              selected={local.body}
              onToggle={name => toggleItem('body', name)}
            />
          </div>
        )}
      </div>

      {/* Цвет кузова */}
      <div className="filter-section">
        <button type="button" className="filter-section-hd" onClick={() => toggle('bodyColor')}>
          <span>Цвет кузова</span>
          <ChevronIcon open={open.bodyColor} />
        </button>
        {open.bodyColor && (
          <div className="filter-section-body">
            <ColorGrid
              colors={liveBodyColors.length ? liveBodyColors : options.bodyColors}
              selected={local.bodyColor}
              onToggle={name => toggleItem('bodyColor', name)}
              showMoreLabel="цветов"
            />
          </div>
        )}
      </div>

      {/* Цвет салона */}
      <div className="filter-section">
        <button type="button" className="filter-section-hd" onClick={() => toggle('interiorColor')}>
          <span>Цвет салона</span>
          <ChevronIcon open={open.interiorColor} />
        </button>
        {open.interiorColor && (
          <div className="filter-section-body">
            <ColorGrid
              colors={liveInteriorColors.length ? liveInteriorColors : options.interiorColors}
              selected={local.interiorColor}
              onToggle={name => toggleItem('interiorColor', name)}
              showMoreLabel="цветов"
            />
          </div>
        )}
      </div>

      {/* Apply / Reset buttons */}
      <div className="filter-actions">
        <button type="button" className="filter-reset-btn" onClick={resetFilters}>
          Сбросить
        </button>
        <button type="button" className="filter-apply-btn" onClick={applyFilters}>
          Применить
        </button>
      </div>
    </div>
  )
}

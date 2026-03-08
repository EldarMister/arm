import { useState, useEffect, useRef, useCallback } from 'react'
import AdminEncar from '../components/admin/AdminEncar'
import { applyVehicleTitleFixes } from '../../shared/vehicleTextFixes.js'

/* ── SVG Icon ── */
const Ic = ({ d, s = 18 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
    </svg>
)
const IC = {
    dash: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
    car: 'M19 17H5a2 2 0 01-2-2V9a2 2 0 012-2h1l2-3h8l2 3h1a2 2 0 012 2v6a2 2 0 01-2 2z',
    plus: 'M12 4v16m8-8H4',
    edit: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',
    trash: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
    img: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
    search: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
    x: 'M6 18L18 6M6 6l12 12',
    ok: 'M5 13l4 4L19 7',
    warn: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
    ext: 'M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14',
    out: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
    ref: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
    bar: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    bolt: 'M13 10V3L4 14h7v7l9-11h-7z',
    menu: 'M4 6h16M4 12h16M4 18h16',
    calc: 'M9 7H6a2 2 0 00-2 2v9a2 2 0 002 2h12a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4',
    tag: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z',
    set: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
    photo: 'M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z M15 13a3 3 0 11-6 0 3 3 0 016 0z',
    download: 'M12 3v12m0 0l4-4m-4 4l-4-4M5 21h14',
}

const fmtU = n => '$' + Number(n || 0).toLocaleString('ru-RU')
const fmtK = n => Number(n || 0).toLocaleString('ko-KR') + ' ₩'
const LEGACY_RENAULT_SAMSUNG_MODEL_RE = /\b(?:sm3|sm5|sm6|sm7|qm3|qm5|qm6|xm3)\b/i
const ENRICH_REPORT_VISIBILITY_KEY = 'tlv-admin-enrich-report-open'

function normalizeAdminVehicleTitle(value, { keepBrand = true } = {}) {
    let text = String(value || '').trim().replace(/\s+/g, ' ')
    if (!text) return ''

    const isLegacyRenaultSamsung = LEGACY_RENAULT_SAMSUNG_MODEL_RE.test(text)
    text = text.replace(
        /^(?:reunokoria|renault[-\s]*korea|renault\s*samsung)\s*\(?\s*(?:samseong|samsung)?\s*\)?\s*/i,
        isLegacyRenaultSamsung
            ? (keepBrand ? 'Renault Samsung ' : '')
            : (keepBrand ? 'Renault Korea ' : '')
    )

    if (isLegacyRenaultSamsung) {
        text = text.replace(/\bRenault Korea\b/gi, 'Renault Samsung')
    }

    text = applyVehicleTitleFixes(text)

    return text.replace(/\s+/g, ' ').trim()
}

/* ── API ── */
async function apiFetch(url, opts = {}) {
    const r = await fetch(url, opts)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
}
const api = {
    getCars: p => apiFetch('/api/cars?' + new URLSearchParams({ limit: 20, page: 1, sort: 'newest', ...p })),
    createCar: d => apiFetch('/api/cars', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }),
    updateCar: (id, d) => apiFetch(`/api/cars/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }),
    deleteCar: id => apiFetch(`/api/cars/${id}`, { method: 'DELETE' }),
    uploadImages: (id, files) => { const fd = new FormData(); files.forEach(f => fd.append('images', f)); return apiFetch(`/api/cars/${id}/images`, { method: 'POST', body: fd }) },
    deleteImage: id => apiFetch(`/api/images/${id}`, { method: 'DELETE' }),
    fetchEncar: id => apiFetch(`/api/encar/${id}`),
    getStats: () => apiFetch('/api/admin/stats'),
    getPricingSettings: () => apiFetch('/api/admin/pricing-settings'),
    updatePricingSettings: d => apiFetch('/api/admin/pricing-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }),
    downloadCatalogExport: () => fetch('/api/admin/catalog-export'),
    getEnrichStatus: () => apiFetch('/api/admin/enrich-empty-fields/status'),
    startEnrichEmptyFields: () => apiFetch('/api/admin/enrich-empty-fields/start', { method: 'POST' }),
    getNormalizeExistingCarsStatus: () => apiFetch('/api/admin/normalize-existing-cars/status'),
    startNormalizeExistingCars: () => apiFetch('/api/admin/normalize-existing-cars/start', { method: 'POST' }),
}

const PRICING_FALLBACK = {
    commission: 200,
    loading: 0,
    unloading: 100,
    storage: 310,
    default_delivery: 1450,
    whatsapp_number: '821056650943',
    delivery_profiles: [
        { code: 'suv_big', label: 'SUV BIG', description: 'Highlander, Carnival', price: 1800, sort_order: 10 },
        { code: 'suv_middle', label: 'SUV MIDDLE', description: 'Santafe, Sorento', price: 1700, sort_order: 20 },
        { code: 'suv_small', label: 'SUV SMALL', description: 'Tivoli, Seltos', price: 1600, sort_order: 30 },
        { code: 'sedan_osh', label: 'SEDAN OSH', description: '', price: 1500, sort_order: 40 },
        { code: 'sedan_bishkek', label: 'SEDAN BISHKEK', description: '', price: 1450, sort_order: 50 },
        { code: 'sedan_lux', label: 'SEDAN LUX', description: '', price: 1600, sort_order: 60 },
        { code: 'half_container', label: 'HALF CONTAINER', description: '', price: 3000, sort_order: 70 },
        { code: 'mini_car', label: 'MINI CAR', description: 'Morning, Spark', price: 1000, sort_order: 80 },
    ],
}

function toNum(value, fallback = 0) {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
}

function slugifyProfileCode(value, index = 0) {
    const code = String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')

    return code || `profile_${index + 1}`
}

function normalizePricingSettingsClient(value = {}) {
    const profiles = Array.isArray(value.delivery_profiles) && value.delivery_profiles.length
        ? value.delivery_profiles
        : PRICING_FALLBACK.delivery_profiles

    return {
        commission: toNum(value.commission, PRICING_FALLBACK.commission),
        loading: toNum(value.loading, PRICING_FALLBACK.loading),
        unloading: toNum(value.unloading, PRICING_FALLBACK.unloading),
        storage: toNum(value.storage, PRICING_FALLBACK.storage),
        default_delivery: toNum(value.default_delivery, PRICING_FALLBACK.default_delivery),
        whatsapp_number: String(value.whatsapp_number || PRICING_FALLBACK.whatsapp_number).trim() || PRICING_FALLBACK.whatsapp_number,
        exchange_rate_current: toNum(value.exchange_rate_current, 0),
        exchange_rate_site: toNum(value.exchange_rate_site, 0),
        exchange_rate_offset: toNum(value.exchange_rate_offset, 15),
        delivery_profiles: profiles
            .map((profile, index) => ({
                code: slugifyProfileCode(profile?.code || profile?.label, index),
                label: String(profile?.label || `TYPE ${index + 1}`).trim(),
                description: String(profile?.description || '').trim(),
                price: toNum(profile?.price, 0),
                sort_order: toNum(profile?.sort_order, (index + 1) * 10),
            }))
            .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)),
    }
}

function getProfilePrice(settings, code) {
    const profileCode = String(code || '').trim()
    const profile = settings.delivery_profiles.find(item => item.code === profileCode)
    return {
        profile: profile || null,
        delivery: profile ? toNum(profile.price, settings.default_delivery) : toNum(settings.default_delivery, PRICING_FALLBACK.default_delivery),
    }
}

function buildEffectivePricingClient(form, pricingSettings) {
    const settings = normalizePricingSettingsClient(pricingSettings)
    const priceUsd = toNum(form.price_usd, 0)
    const vatRefund = toNum(form.vat_refund, 0)
    const manual = Boolean(form.pricing_locked)
    const profileState = getProfilePrice(settings, form.delivery_profile_code)
    const fees = {
        commission: manual ? toNum(form.commission, settings.commission) : settings.commission,
        delivery: manual ? toNum(form.delivery, profileState.delivery) : profileState.delivery,
        loading: manual ? toNum(form.loading, settings.loading) : settings.loading,
        unloading: manual ? toNum(form.unloading, settings.unloading) : settings.unloading,
        storage: manual ? toNum(form.storage, settings.storage) : settings.storage,
        price_usd: priceUsd,
        vat_refund: vatRefund,
        total: Math.round(priceUsd + (manual ? toNum(form.commission, settings.commission) : settings.commission) + (manual ? toNum(form.delivery, profileState.delivery) : profileState.delivery) + (manual ? toNum(form.loading, settings.loading) : settings.loading) + (manual ? toNum(form.unloading, settings.unloading) : settings.unloading) + (manual ? toNum(form.storage, settings.storage) : settings.storage) - vatRefund),
        delivery_profile_label: profileState.profile?.label || '',
    }

    return fees
}

/* ── Toast ── */
function useToast() {
    const [list, setList] = useState([])
    const add = useCallback((msg, type = 'success') => {
        const id = Date.now()
        setList(l => [...l, { id, msg, type }])
        setTimeout(() => setList(l => l.filter(x => x.id !== id)), 3500)
    }, [])
    return { list, add }
}

/* ── Modal ── */
function Modal({ title, onClose, children, wide }) {
    useEffect(() => {
        const h = e => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', h)
        return () => window.removeEventListener('keydown', h)
    }, [onClose])
    return (
        <div className="adm-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className={`adm-modal${wide ? ' adm-modal-wide' : ''}`}>
                <div className="adm-modal-hd">
                    <h3>{title}</h3>
                    <button className="adm-modal-close" onClick={onClose}><Ic d={IC.x} /></button>
                </div>
                <div className="adm-modal-body">{children}</div>
            </div>
        </div>
    )
}

/* ── Car Form ── */
const BLANK = {
    name: '',
    model: '',
    year: '',
    mileage: '',
    body_color: '',
    interior_color: '',
    location: '',
    vin: '',
    price_krw: '',
    price_usd: '',
    commission: 200,
    delivery: 1450,
    delivery_profile_code: '',
    loading: 0,
    unloading: 100,
    storage: 310,
    pricing_locked: false,
    vat_refund: 0,
    total: 0,
    encar_url: '',
    encar_id: '',
    can_negotiate: false,
    tags: [],
}

function recalc(f) {
    const n = k => Number(f[k]) || 0
    return { ...f, total: Math.round(n('price_usd') + n('commission') + n('delivery') + n('loading') + n('unloading') + n('storage') - n('vat_refund')) }
}

function CarForm({ init = BLANK, onSave, onCancel, busy, pricingSettings }) {
    const [f, setF] = useState({ ...BLANK, ...init, tags: init.tags || [] })
    const [tagInp, setTagInp] = useState('')
    const [encarBusy, setEncarBusy] = useState(false)
    const [encarErr, setEncarErr] = useState('')
    const effectivePricing = buildEffectivePricingClient(f, pricingSettings)
    const deliveryProfiles = normalizePricingSettingsClient(pricingSettings).delivery_profiles

    const set = (k, v) => setF(prev => recalc({ ...prev, [k]: v }))
    const addTag = () => { const t = tagInp.trim(); if (t && !f.tags.includes(t)) setF(p => ({ ...p, tags: [...p.tags, t] })); setTagInp('') }

    const importEncar = async () => {
        if (!f.encar_id) return
        setEncarBusy(true); setEncarErr('')
        try {
            const d = await api.fetchEncar(f.encar_id)
            if (d.error) { setEncarErr(d.error); return }
            setF(p => recalc({
                ...p,
                name: d.name || p.name,
                model: d.model || p.model,
                year: d.year || p.year,
                mileage: d.mileage || p.mileage,
                body_color: d.body_color || p.body_color,
                interior_color: d.interior_color || p.interior_color,
                location: d.location || p.location,
                vin: d.vin || p.vin,
                price_krw: d.price_krw || p.price_krw,
                price_usd: d.price_usd || p.price_usd,
                encar_url: d.encar_url || p.encar_url,
                delivery_profile_code: d.delivery_profile_code || p.delivery_profile_code,
                pricing_locked: d.pricing_locked ?? p.pricing_locked,
                commission: d.commission ?? p.commission,
                delivery: d.delivery ?? p.delivery,
                loading: d.loading ?? p.loading,
                unloading: d.unloading ?? p.unloading,
                storage: d.storage ?? p.storage,
                vat_refund: d.vat_refund ?? p.vat_refund,
            }))
        } catch (e) { setEncarErr(e.message) }
        setEncarBusy(false)
    }

    const submit = e => {
        e.preventDefault()
        onSave({
            ...f,
            mileage: +f.mileage || 0,
            price_krw: +f.price_krw || 0,
            price_usd: effectivePricing.price_usd,
            commission: effectivePricing.commission,
            delivery: effectivePricing.delivery,
            loading: effectivePricing.loading,
            unloading: effectivePricing.unloading,
            storage: effectivePricing.storage,
            pricing_locked: !!f.pricing_locked,
            vat_refund: +f.vat_refund || 0,
            total: effectivePricing.total,
        })
    }

    const Row = ({ kids }) => <div className="adm-fields-row">{kids}</div>
    const F = ({ label, k, type = 'text', ph, full, disabled = false, valueOverride }) => (
        <div className={`adm-field${full ? ' adm-field-full' : ''}`}>
            <label className="adm-label">{label}</label>
            <input className="adm-input" type={type} placeholder={ph} value={valueOverride ?? f[k] ?? ''} onChange={e => set(k, e.target.value)} disabled={disabled} />
        </div>
    )

    return (
        <form className="adm-form" onSubmit={submit}>
            <div className="adm-sec-title">🔗 Импорт с Encar</div>
            <div className="adm-encar-row">
                <input className="adm-input" placeholder="Encar ID (напр. 123456789)" value={f.encar_id} onChange={e => set('encar_id', e.target.value)} />
                <button type="button" className="adm-btn adm-btn-encar" onClick={importEncar} disabled={encarBusy}>
                    <Ic d={IC.bolt} s={14} />{encarBusy ? 'Загрузка...' : 'Импортировать'}
                </button>
            </div>
            {encarErr && <div className="adm-err">{encarErr}</div>}

            <div className="adm-sec-title">📋 Информация</div>
            <Row kids={[<F key="n" label="Марка" k="name" ph="Hyundai" />, <F key="m" label="Модель" k="model" ph="Sonata" />]} />
            <Row kids={[<F key="y" label="Год" k="year" ph="2023" />, <F key="mi" label="Пробег (км)" k="mileage" type="number" ph="45000" />]} />
            <Row kids={[<F key="bc" label="Цвет кузова" k="body_color" ph="Белый" />, <F key="ic" label="Цвет салона" k="interior_color" ph="Чёрный" />]} />
            <Row kids={[<F key="loc" label="Регион" k="location" ph="Сеул" />, <F key="v" label="VIN" k="vin" ph="KMHXX..." />]} />
            <F label="Ссылка Encar" k="encar_url" ph="https://www.encar.com/..." full />

            <div className="adm-sec-title">💰 Цены и расходы</div>
            <Row kids={[<F key="pk" label="Цена KRW" k="price_krw" type="number" ph="15000000" />, <F key="pu" label="Цена USD" k="price_usd" type="number" ph="11000" />]} />
            <div className="adm-field" style={{ marginBottom: 12 }}>
                <label className="adm-label">Тариф доставки по типу машины</label>
                <select className="adm-select" value={f.delivery_profile_code || ''} onChange={e => set('delivery_profile_code', e.target.value)}>
                    <option value="">Автоопределение / запасной тариф</option>
                    {deliveryProfiles.map(profile => (
                        <option key={profile.code} value={profile.code}>
                            {profile.label}{profile.description ? ` - ${profile.description}` : ''} ({fmtU(profile.price)})
                        </option>
                    ))}
                </select>
            </div>
            <label className="adm-chk-row" style={{ marginBottom: 12 }}>
                <input type="checkbox" checked={!!f.pricing_locked} onChange={e => set('pricing_locked', e.target.checked)} />
                <span>Фиксировать ручные расходы для этой машины</span>
            </label>
            {!f.pricing_locked && (
                <div className="adm-car-sub" style={{ marginBottom: 12 }}>
                    Общие расходы берутся из настроек, а доставка считается по выбранному типу машины.
                </div>
            )}
            <div className="adm-price-grid">
                {[['Комиссия', 'commission'], ['Доставка', 'delivery'], ['Погрузка', 'loading'], ['Выгрузка', 'unloading'], ['Стоянка', 'storage'], ['Возврат НДС', 'vat_refund']].map(([label, k]) => (
                    <div key={k} className="adm-field">
                        <label className="adm-label">{label} ($)</label>
                        <input
                            className="adm-input"
                            type="number"
                            value={k === 'vat_refund' || f.pricing_locked ? (f[k] ?? '') : (effectivePricing[k] ?? '')}
                            onChange={e => set(k, e.target.value)}
                            disabled={k !== 'vat_refund' && !f.pricing_locked}
                        />
                    </div>
                ))}
            </div>
            <div className="adm-total-row">
                <span>До Бишкека итого:</span>
                <span className="adm-total-val">{fmtU(effectivePricing.total)}</span>
            </div>

            <div className="adm-sec-title">🏷️ Теги</div>
            <div className="adm-tag-add">
                <input className="adm-input" placeholder="Бензин, AWD, Седан..." value={tagInp} onChange={e => setTagInp(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }} />
                <button type="button" className="adm-btn adm-btn-sm" onClick={addTag}>+</button>
            </div>
            <div className="adm-tags-wrap">
                {f.tags.map(t => (
                    <span key={t} className="adm-tag">{t}
                        <button type="button" onClick={() => setF(p => ({ ...p, tags: p.tags.filter(x => x !== t) }))}>×</button>
                    </span>
                ))}
            </div>
            <label className="adm-chk-row"><input type="checkbox" checked={!!f.can_negotiate} onChange={e => set('can_negotiate', e.target.checked)} /><span>Возможен торг</span></label>

            <div className="adm-form-actions">
                <button type="button" className="adm-btn adm-btn-cancel" onClick={onCancel}>Отмена</button>
                <button type="submit" className="adm-btn adm-btn-primary" disabled={busy}>{busy ? 'Сохранение...' : '💾 Сохранить'}</button>
            </div>
        </form>
    )
}

/* ── Image Manager ── */
function ImgMgr({ car, onClose, toast }) {
    const [imgs, setImgs] = useState(car.images || [])
    const [busy, setBusy] = useState(false)
    const ref = useRef()

    const upload = async e => {
        const files = Array.from(e.target.files); if (!files.length) return
        setBusy(true)
        try {
            const res = await api.uploadImages(car.id, files)
            if (Array.isArray(res)) { setImgs(p => [...p, ...res]); toast('Фото загружены', 'success') }
            else toast(res.error || 'Ошибка', 'error')
        } catch { toast('Ошибка загрузки', 'error') }
        setBusy(false); ref.current.value = ''
    }

    const del = async img => {
        if (!confirm('Удалить?')) return
        try { await api.deleteImage(img.id); setImgs(p => p.filter(i => i.id !== img.id)); toast('Удалено', 'success') }
        catch { toast('Ошибка', 'error') }
    }

    return (
        <div>
            <div className="adm-upload-zone" onClick={() => ref.current.click()}>
                <input ref={ref} type="file" multiple accept="image/*" style={{ display: 'none' }} onChange={upload} />
                <Ic d={IC.photo} s={32} /><div>{busy ? 'Загружается...' : 'Нажмите для загрузки фото'}</div><small>JPG/PNG/WebP до 30 шт</small>
            </div>
            <div className="adm-img-grid">
                {imgs.map((img, i) => (
                    <div key={img.id || i} className="adm-img-item">
                        <img src={img.url} alt="" loading="lazy" />
                        <div className="adm-img-ov">
                            <span>#{i + 1}</span>
                            <button onClick={() => del(img)}><Ic d={IC.trash} s={13} /></button>
                        </div>
                    </div>
                ))}
                {imgs.length === 0 && <div className="adm-img-empty">Нет фото</div>}
            </div>
            <div style={{ textAlign: 'right', marginTop: 12 }}><button className="adm-btn adm-btn-cancel" onClick={onClose}>Закрыть</button></div>
        </div>
    )
}

/* ── Quick Price Editor ── */
function PriceEditor({ car, onSave, onClose, pricingSettings }) {
    const [p, setP] = useState({
        price_usd: car.price_usd || 0,
        commission: car.commission || 200,
        delivery: car.delivery || 1450,
        delivery_profile_code: car.delivery_profile_code || '',
        loading: car.loading || 0,
        unloading: car.unloading || 100,
        storage: car.storage || 310,
        pricing_locked: !!car.pricing_locked,
        vat_refund: car.vat_refund || 0,
    })
    const deliveryProfiles = normalizePricingSettingsClient(pricingSettings).delivery_profiles
    const effectivePricing = buildEffectivePricingClient(p, pricingSettings)
    const total = effectivePricing.total
    return (
        <div>
            <div style={{ marginBottom: 12, color: '#94a3b8', fontSize: 13 }}>{car.name} {car.year}</div>
            <div className="adm-field" style={{ marginBottom: 12 }}>
                <label className="adm-label">Тариф доставки по типу машины</label>
                <select className="adm-select" value={p.delivery_profile_code || ''} onChange={e => setP(prev => ({ ...prev, delivery_profile_code: e.target.value }))}>
                    <option value="">Автоопределение / запасной тариф</option>
                    {deliveryProfiles.map(profile => (
                        <option key={profile.code} value={profile.code}>
                            {profile.label}{profile.description ? ` - ${profile.description}` : ''} ({fmtU(profile.price)})
                        </option>
                    ))}
                </select>
            </div>
            <label className="adm-chk-row" style={{ marginBottom: 12 }}>
                <input type="checkbox" checked={!!p.pricing_locked} onChange={e => setP(prev => ({ ...prev, pricing_locked: e.target.checked }))} />
                <span>Фиксировать ручные расходы для этой машины</span>
            </label>
            <div className="adm-price-grid">
                {[['price_usd', 'Цена USD'], ['commission', 'Комиссия'], ['delivery', 'Доставка'], ['loading', 'Погрузка'], ['unloading', 'Выгрузка'], ['storage', 'Стоянка'], ['vat_refund', 'Возврат НДС']].map(([k, label]) => (
                    <div key={k} className="adm-field">
                        <label className="adm-label">{k === 'price_usd' ? 'Цена USD' : k === 'commission' ? 'Комиссия' : k === 'delivery' ? 'Доставка' : k === 'loading' ? 'Погрузка' : k === 'unloading' ? 'Выгрузка' : k === 'storage' ? 'Стоянка' : 'Возврат НДС'}</label>
                        <input
                            className="adm-input"
                            type="number"
                            value={k === 'vat_refund' || k === 'price_usd' || p.pricing_locked ? (p[k] ?? '') : (effectivePricing[k] ?? '')}
                            onChange={e => setP(prev => ({ ...prev, [k]: e.target.value }))}
                            disabled={k !== 'vat_refund' && k !== 'price_usd' && !p.pricing_locked}
                        />
                    </div>
                ))}
            </div>
            <div className="adm-total-row"><span>Итого до Бишкека:</span><span className="adm-total-val">{fmtU(total)}</span></div>
            <div className="adm-form-actions">
                <button className="adm-btn adm-btn-cancel" onClick={onClose}>Отмена</button>
                <button className="adm-btn adm-btn-primary" onClick={() => onSave({ ...p, total })}>💾 Сохранить</button>
            </div>
        </div>
    )
}

/* ── Calculator ── */
function Calculator({ pricingSettings }) {
    const settings = pricingSettings?.delivery_profiles ? pricingSettings : PRICING_FALLBACK
    const [v, setV] = useState({ krw: 28000000, rate: 0.00073, delivery_profile_code: settings.delivery_profiles[0]?.code || '', comm: settings.commission, delivery: settings.delivery_profiles[0]?.price ?? settings.default_delivery, loading: settings.loading, unloading: settings.unloading, storage: settings.storage, vat_pct: 6.3 })
    useEffect(() => {
        const firstProfile = settings.delivery_profiles[0] || null
        setV(prev => ({
            ...prev,
            delivery_profile_code: firstProfile?.code || prev.delivery_profile_code,
            comm: settings.commission,
            delivery: firstProfile?.price ?? settings.default_delivery,
            loading: settings.loading,
            unloading: settings.unloading,
            storage: settings.storage,
        }))
    }, [pricingSettings])
    const s = (k, val) => setV(p => ({ ...p, [k]: val }))
    const usd = Math.round(+v.krw * +v.rate)
    const vat = Math.round(usd * (+v.vat_pct / 100))
    const total = Math.round(usd + +v.comm + +v.delivery + +v.loading + +v.unloading + +v.storage - vat)
    return (
        <div>
            <div className="adm-field" style={{ marginBottom: 14 }}>
                <label className="adm-label">Тип машины / тариф доставки</label>
                <select
                    className="adm-select"
                    value={v.delivery_profile_code || ''}
                    onChange={e => {
                        const code = e.target.value
                        const selected = settings.delivery_profiles.find(profile => profile.code === code)
                        setV(prev => ({ ...prev, delivery_profile_code: code, delivery: selected?.price ?? settings.default_delivery }))
                    }}
                >
                    <option value="">Запасной тариф</option>
                    {settings.delivery_profiles.map(profile => (
                        <option key={profile.code} value={profile.code}>
                            {profile.label}{profile.description ? ` - ${profile.description}` : ''} ({fmtU(profile.price)})
                        </option>
                    ))}
                </select>
            </div>
            <div className="adm-calc-grid">
                {[['krw', 'Цена KRW (вон)'], ['rate', 'KRW→USD курс'], ['comm', 'Комиссия ($)'], ['delivery', 'Доставка ($)'], ['loading', 'Погрузка ($)'], ['unloading', 'Выгрузка ($)'], ['storage', 'Стоянка ($)'], ['vat_pct', 'Возврат НДС (%)']].map(([k, label]) => (
                    <div key={k} className="adm-field">
                        <label className="adm-label">{label}</label>
                        <input className="adm-input" type="number" step="any" value={v[k]} onChange={e => s(k, e.target.value)} />
                    </div>
                ))}
            </div>
            <div className="adm-calc-result">
                <div className="adm-calc-row"><span>Цена USD:</span><span>{fmtU(usd)}</span></div>
                <div className="adm-calc-row"><span>Возврат НДС ({v.vat_pct}%):</span><span style={{ color: '#34d399' }}>-{fmtU(vat)}</span></div>
                <div className="adm-calc-row adm-calc-total"><span>До Бишкека:</span><span>{fmtU(total)}</span></div>
            </div>
        </div>
    )
}

/* ── Settings ── */
function Settings({ toast, pricingSettings, pricingLoaded, onSavePricingSettings }) {
    const [settings, setSettings] = useState(() => normalizePricingSettingsClient(pricingSettings))
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        setSettings(normalizePricingSettingsClient(pricingSettings))
    }, [pricingSettings])

    const setProfile = (index, patch) => {
        setSettings(prev => ({
            ...prev,
            delivery_profiles: prev.delivery_profiles.map((profile, profileIndex) => (
                profileIndex === index ? { ...profile, ...patch } : profile
            )),
        }))
    }

    const addProfile = () => {
        setSettings(prev => ({
            ...prev,
            delivery_profiles: [
                ...prev.delivery_profiles,
                {
                    code: slugifyProfileCode(`profile_${prev.delivery_profiles.length + 1}`, prev.delivery_profiles.length),
                    label: `TYPE ${prev.delivery_profiles.length + 1}`,
                    description: '',
                    price: prev.default_delivery,
                    sort_order: (prev.delivery_profiles.length + 1) * 10,
                },
            ],
        }))
    }

    const removeProfile = (index) => {
        setSettings(prev => ({
            ...prev,
            delivery_profiles: prev.delivery_profiles.filter((_, profileIndex) => profileIndex !== index),
        }))
    }

    const save = async () => {
        setSaving(true)
        try {
            const payload = {
                commission: toNum(settings.commission, PRICING_FALLBACK.commission),
                loading: toNum(settings.loading, PRICING_FALLBACK.loading),
                unloading: toNum(settings.unloading, PRICING_FALLBACK.unloading),
                storage: toNum(settings.storage, PRICING_FALLBACK.storage),
                default_delivery: toNum(settings.default_delivery, PRICING_FALLBACK.default_delivery),
                whatsapp_number: settings.whatsapp_number,
                delivery_profiles: settings.delivery_profiles.map((profile, index) => ({
                    ...profile,
                    code: profile.code || slugifyProfileCode(profile.label, index),
                    sort_order: (index + 1) * 10,
                    price: toNum(profile.price, 0),
                })),
            }
            const saved = await api.updatePricingSettings(payload)
            onSavePricingSettings(saved)
            toast('Настройки доставки сохранены', 'success')
        } catch {
            toast('Не удалось сохранить настройки', 'error')
        }
        setSaving(false)
    }

    if (!pricingLoaded) {
        return <div className="adm-loading"><div className="adm-spin" /></div>
    }
    return (
        <div>
            <h2 className="adm-section-heading" style={{ marginBottom: 20 }}>Настройки доставки</h2>
            <div className="adm-settings-grid">
                <div className="adm-settings-card">
                    <div className="adm-settings-card-title">Общие расходы</div>
                    {[['commission', 'Комиссия ($)'], ['loading', 'Погрузка ($)'], ['unloading', 'Выгрузка ($)'], ['storage', 'Стоянка ($)'], ['default_delivery', 'Запасная доставка ($)']].map(([k, label]) => (
                        <div key={k} className="adm-field" style={{ marginBottom: 10 }}>
                            <label className="adm-label">{label}</label>
                            <input className="adm-input" type="number" value={settings[k]} onChange={e => setSettings(p => ({ ...p, [k]: e.target.value }))} />
                        </div>
                    ))}
                </div>
                <div className="adm-settings-card">
                    <div className="adm-settings-card-title">Курс и контакты</div>
                    <div className="adm-field" style={{ marginBottom: 10 }}>
                        <label className="adm-label">Текущий курс USD/KRW</label>
                        <input className="adm-input" value={settings.exchange_rate_current || ''} disabled />
                    </div>
                    <div className="adm-field" style={{ marginBottom: 10 }}>
                        <label className="adm-label">Курс сайта</label>
                        <input className="adm-input" value={settings.exchange_rate_site || ''} disabled />
                    </div>
                    <div className="adm-field" style={{ marginBottom: 10 }}>
                        <label className="adm-label">WhatsApp номер</label>
                        <input className="adm-input" value={settings.whatsapp_number} onChange={e => setSettings(p => ({ ...p, whatsapp_number: e.target.value }))} />
                    </div>
                    <div className="adm-car-sub">
                        MINI, SUV и обычные седаны система подбирает автоматически. Специальные тарифы вроде SEDAN OSH или HALF CONTAINER можно назначать вручную в карточке машины.
                    </div>
                </div>
                <div className="adm-settings-card">
                    <div className="adm-settings-card-title">Полезные ссылки</div>
                    {[['Encar.com', 'https://www.encar.com'], ['Курс KRW/USD', 'https://www.google.com/search?q=KRW+USD'], ['Railway Dashboard', 'https://railway.app']].map(([name, url]) => (
                        <a key={name} href={url} target="_blank" rel="noreferrer" className="adm-quick-link">
                            <Ic d={IC.ext} s={14} /> {name}
                        </a>
                    ))}
                </div>
            </div>
            <div className="adm-chart-box" style={{ marginTop: 20 }}>
                <div className="adm-chart-title">Тарифы по типам машин</div>
                <div className="adm-price-grid">
                    {settings.delivery_profiles.map((profile, index) => (
                        <div key={profile.code || index} className="adm-settings-card" style={{ padding: 14 }}>
                            <div className="adm-field" style={{ marginBottom: 10 }}>
                                <label className="adm-label">Название типа</label>
                                <input className="adm-input" value={profile.label} onChange={e => setProfile(index, { label: e.target.value })} />
                            </div>
                            <div className="adm-field" style={{ marginBottom: 10 }}>
                                <label className="adm-label">Примеры / описание</label>
                                <input className="adm-input" value={profile.description} onChange={e => setProfile(index, { description: e.target.value })} />
                            </div>
                            <div className="adm-field" style={{ marginBottom: 10 }}>
                                <label className="adm-label">Доставка ($)</label>
                                <input className="adm-input" type="number" value={profile.price} onChange={e => setProfile(index, { price: e.target.value })} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                <div className="adm-car-sub">Код: {profile.code}</div>
                                <button className="adm-btn adm-btn-cancel" type="button" onClick={() => removeProfile(index)}>Удалить</button>
                            </div>
                        </div>
                    ))}
                </div>
                <div style={{ marginTop: 12 }}>
                    <button className="adm-btn adm-btn-sm" type="button" onClick={addProfile}>Добавить тип</button>
                </div>
            </div>
            <div style={{ marginTop: 20 }}>
                <button className="adm-btn adm-btn-primary" onClick={save} disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить настройки доставки'}</button>
            </div>
        </div>
    )
}

/* ── Dashboard ── */
function Dashboard({ onGo }) {
    const [stats, setStats] = useState({ totalCars: 0, addedThisWeek: 0, avgPriceUSD: 0, topBrands: [] })
    const [loading, setLoading] = useState(true)
    useEffect(() => {
        api.getStats().then(setStats).catch(() => { }).finally(() => setLoading(false))
    }, [])

    const cards = [
        { label: 'Всего авто', val: stats.totalCars, icon: IC.car, color: '#6366f1' },
        { label: 'За неделю', val: stats.addedThisWeek, icon: IC.plus, color: '#10b981' },
        { label: 'Средняя цена', val: fmtU(stats.avgPriceUSD), icon: IC.bar, color: '#f59e0b' },
    ]

    return (
        <div>
            <div className="adm-page-hd">
                <h2 className="adm-section-heading">📊 Дашборд</h2>
                <button className="adm-btn adm-btn-primary" onClick={() => onGo('cars')}>
                    <Ic d={IC.plus} s={15} /> Добавить авто
                </button>
            </div>

            {loading ? (
                <div className="adm-loading"><div className="adm-spin" /></div>
            ) : (
                <>
                    <div className="adm-stat-cards">
                        {cards.map(c => (
                            <div key={c.label} className="adm-stat-card">
                                <div className="adm-stat-icon" style={{ background: c.color + '22', color: c.color }}><Ic d={c.icon} s={22} /></div>
                                <div><div className="adm-stat-val">{c.val}</div><div className="adm-stat-lbl">{c.label}</div></div>
                            </div>
                        ))}
                    </div>

                    {stats.topBrands?.length > 0 && (
                        <div className="adm-chart-box">
                            <div className="adm-chart-title">🏆 Топ марки</div>
                            {stats.topBrands.map((b, i) => {
                                const pct = (b.count / (stats.topBrands[0]?.count || 1)) * 100
                                return (
                                    <div key={b.name} className="adm-bar-row">
                                        <span className="adm-bar-lbl">#{i + 1} {b.name}</span>
                                        <div className="adm-bar-track"><div className="adm-bar-fill" style={{ width: `${pct}%` }} /></div>
                                        <span className="adm-bar-cnt">{b.count}</span>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    <div className="adm-quick-actions">
                        <div className="adm-qa-title">⚡ Быстрые действия</div>
                        <div className="adm-qa-grid">
                            {[
                                { label: 'Добавить авто', icon: IC.plus, color: '#6366f1', action: () => onGo('cars') },
                                { label: 'Все машины', icon: IC.car, color: '#10b981', action: () => onGo('cars') },
                                { label: 'Калькулятор', icon: IC.calc, color: '#f59e0b', action: () => onGo('calc') },
                                { label: 'Настройки', icon: IC.set, color: '#8b5cf6', action: () => onGo('settings') },
                                { label: 'Открыть каталог', icon: IC.ext, color: '#06b6d4', action: () => window.open('/catalog', '_blank') },
                                { label: 'Открыть Encar', icon: IC.bolt, color: '#f43f5e', action: () => window.open('https://www.encar.com', '_blank') },
                            ].map(q => (
                                <button key={q.label} className="adm-qa-btn" onClick={q.action} style={{ '--qa-color': q.color }}>
                                    <Ic d={q.icon} s={20} /><span>{q.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}

/* ── Cars List ── */
function Cars({ toast, initAdd, pricingSettings, pricingRevision }) {
    const [cars, setCars] = useState([])
    const [total, setTotal] = useState(0)
    const [pages, setPages] = useState(1)
    const [page, setPage] = useState(1)
    const [sort, setSort] = useState('newest')
    const [search, setSearch] = useState('')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [editCar, setEditCar] = useState(null)
    const [imgCar, setImgCar] = useState(null)
    const [priceCar, setPriceCar] = useState(null)
    const [delCar, setDelCar] = useState(null)
    const [adding, setAdding] = useState(!!initAdd)
    const [busy, setBusy] = useState(false)
    const [exporting, setExporting] = useState(false)
    const [enriching, setEnriching] = useState(false)
    const [normalizingCars, setNormalizingCars] = useState(false)
    const [enrichStatus, setEnrichStatus] = useState({
        running: false,
        total: 0,
        processed: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        started_at: null,
        finished_at: null,
        current: null,
        last_error: '',
        report: [],
    })
    const [normalizeCarsStatus, setNormalizeCarsStatus] = useState({
        running: false,
        total: 0,
        processed: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        started_at: null,
        finished_at: null,
        current: null,
        last_error: '',
        report: [],
        field_totals: {
            name: 0,
            model: 0,
            trim_level: 0,
            body_color: 0,
            interior_color: 0,
        },
    })
    const [isEnrichReportOpen, setIsEnrichReportOpen] = useState(() => {
        if (typeof window === 'undefined') return true
        const saved = window.localStorage.getItem(ENRICH_REPORT_VISIBILITY_KEY)
        return saved !== '0'
    })
    const [selected, setSelected] = useState(new Set())
    const prevEnrichRunningRef = useRef(false)
    const prevNormalizeCarsRunningRef = useRef(false)

    const load = useCallback(async (pg, sq, so) => {
        setLoading(true); setError(null)
        try {
            const p = { page: pg, limit: 20, sort: so }
            if (sq) p.brand = sq
            const d = await api.getCars(p)
            setCars(d.cars || []); setTotal(d.total || 0); setPages(d.pages || 1)
        } catch (e) { setError(e.message) }
        setLoading(false)
    }, [])

    useEffect(() => { load(page, search, sort) }, [page, sort, load, pricingRevision])

    const loadEnrichStatus = useCallback(async () => {
        try {
            const data = await api.getEnrichStatus()
            setEnrichStatus(data)
        } catch { }
    }, [])

    const loadNormalizeCarsStatus = useCallback(async () => {
        try {
            const data = await api.getNormalizeExistingCarsStatus()
            setNormalizeCarsStatus(data)
        } catch { }
    }, [])

    useEffect(() => {
        loadEnrichStatus()
        const timer = setInterval(loadEnrichStatus, enrichStatus.running ? 2000 : 10000)
        return () => clearInterval(timer)
    }, [loadEnrichStatus, enrichStatus.running])

    useEffect(() => {
        loadNormalizeCarsStatus()
        const timer = setInterval(loadNormalizeCarsStatus, normalizeCarsStatus.running ? 2000 : 10000)
        return () => clearInterval(timer)
    }, [loadNormalizeCarsStatus, normalizeCarsStatus.running])

    useEffect(() => {
        if (prevEnrichRunningRef.current && !enrichStatus.running) {
            load(page, search, sort)
            if (enrichStatus.total > 0) {
                toast(`Обогащение завершено: обновлено ${enrichStatus.updated}, ошибок ${enrichStatus.errors}`, enrichStatus.errors ? 'error' : 'success')
            }
        }
        prevEnrichRunningRef.current = enrichStatus.running
    }, [enrichStatus, load, page, search, sort, toast])

    useEffect(() => {
        if (prevNormalizeCarsRunningRef.current && !normalizeCarsStatus.running) {
            load(page, search, sort)
            if (normalizeCarsStatus.total > 0) {
                toast(`Нормализация завершена: обновлено ${normalizeCarsStatus.updated}, ошибок ${normalizeCarsStatus.errors}`, normalizeCarsStatus.errors ? 'error' : 'success')
            }
        }
        prevNormalizeCarsRunningRef.current = normalizeCarsStatus.running
    }, [normalizeCarsStatus, load, page, search, sort, toast])

    useEffect(() => {
        if (typeof window === 'undefined') return
        window.localStorage.setItem(ENRICH_REPORT_VISIBILITY_KEY, isEnrichReportOpen ? '1' : '0')
    }, [isEnrichReportOpen])

    const doSearch = e => { e.preventDefault(); setPage(1); load(1, search, sort) }
    const reset = () => { setSearch(''); setPage(1); load(1, '', sort) }

    const save = async data => {
        setBusy(true)
        try {
            if (editCar?.id) { await api.updateCar(editCar.id, data); toast('Обновлено ✓', 'success') }
            else { await api.createCar(data); toast('Добавлено ✓', 'success') }
            setEditCar(null); setAdding(false); load(page, search, sort)
        } catch { toast('Ошибка сохранения', 'error') }
        setBusy(false)
    }

    const savePrices = async data => {
        try { await api.updateCar(priceCar.id, data); toast('Цены обновлены', 'success'); setPriceCar(null); load(page, search, sort) }
        catch { toast('Ошибка', 'error') }
    }

    const del = async id => {
        try { await api.deleteCar(id); toast('Удалено', 'success'); setDelCar(null); load(page, search, sort) }
        catch { toast('Ошибка', 'error') }
    }

    const delSelected = async () => {
        if (!confirm(`Удалить ${selected.size} авто?`)) return
        for (const id of selected) { try { await api.deleteCar(id) } catch { } }
        setSelected(new Set()); load(page, search, sort); toast(`Удалено ${selected.size} авто`, 'success')
    }

    const downloadCatalogExport = async () => {
        setExporting(true)
        try {
            const response = await api.downloadCatalogExport()
            if (!response.ok) throw new Error(`HTTP ${response.status}`)

            const blob = await response.blob()
            const disposition = response.headers.get('Content-Disposition') || ''
            const fallbackName = `catalog-export-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`
            const match = disposition.match(/filename="?([^"]+)"?/i)
            const filename = match?.[1] || fallbackName
            const url = window.URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = filename
            document.body.appendChild(link)
            link.click()
            link.remove()
            window.URL.revokeObjectURL(url)
            toast('JSON каталога скачан', 'success')
        } catch {
            toast('Ошибка экспорта JSON', 'error')
        }
        setExporting(false)
    }

    const startEnrichEmptyFields = async () => {
        setEnriching(true)
        try {
            await api.startEnrichEmptyFields()
            await loadEnrichStatus()
            toast('Обогащение пустых полей запущено', 'success')
        } catch (e) {
            toast(e.message || 'Ошибка запуска обогащения', 'error')
        }
        setEnriching(false)
    }

    const startNormalizeExistingCars = async () => {
        setNormalizingCars(true)
        try {
            await api.startNormalizeExistingCars()
            await loadNormalizeCarsStatus()
            toast('Нормализация сохраненных машин запущена', 'success')
        } catch (e) {
            toast(e.message || 'Ошибка запуска нормализации', 'error')
        }
        setNormalizingCars(false)
    }

    const toggleSel = id => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
    const toggleAll = () => setSelected(s => s.size === cars.length ? new Set() : new Set(cars.map(c => c.id)))

    return (
        <div>
            {/* Header */}
            <div className="adm-page-hd">
                <div>
                    <h2 className="adm-section-heading">🚗 Автомобили</h2>
                    <div className="adm-meta">{loading ? '...' : `Всего: ${total.toLocaleString()}`}</div>
                    {(enrichStatus.running || enrichStatus.finished_at) && (
                        <div className="adm-meta" style={{ marginTop: 4 }}>
                            {enrichStatus.running
                                ? `Обогащение: ${enrichStatus.processed}/${enrichStatus.total} • обновлено ${enrichStatus.updated} • ошибок ${enrichStatus.errors}`
                                : `Последнее обогащение: обновлено ${enrichStatus.updated} • пропущено ${enrichStatus.skipped} • ошибок ${enrichStatus.errors}`}
                        </div>
                    )}
                    {(normalizeCarsStatus.running || normalizeCarsStatus.finished_at) && (
                        <div className="adm-meta" style={{ marginTop: 4 }}>
                            {normalizeCarsStatus.running
                                ? `Нормализация: ${normalizeCarsStatus.processed}/${normalizeCarsStatus.total} • обновлено ${normalizeCarsStatus.updated} • ошибок ${normalizeCarsStatus.errors}`
                                : `Последняя нормализация: обновлено ${normalizeCarsStatus.updated} • пропущено ${normalizeCarsStatus.skipped} • ошибок ${normalizeCarsStatus.errors}`}
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="adm-btn adm-btn-sm" onClick={startNormalizeExistingCars} disabled={normalizingCars || normalizeCarsStatus.running || enriching || enrichStatus.running}>
                        <Ic d={IC.tag} s={14} /> {normalizeCarsStatus.running ? 'Нормализация...' : (normalizingCars ? 'Запуск...' : 'Нормализовать названия')}
                    </button>
                    <button className="adm-btn adm-btn-sm" onClick={startEnrichEmptyFields} disabled={enriching || enrichStatus.running || normalizingCars || normalizeCarsStatus.running}>
                        <Ic d={IC.bolt} s={14} /> {enrichStatus.running ? 'Обогащение...' : (enriching ? 'Запуск...' : 'Обогатить пустые поля')}
                    </button>
                    <button className="adm-btn adm-btn-sm" onClick={downloadCatalogExport} disabled={exporting}>
                        <Ic d={IC.download} s={14} /> {exporting ? 'Экспорт...' : 'Скачать JSON'}
                    </button>
                    {selected.size > 0 && <button className="adm-btn adm-btn-danger" onClick={delSelected}><Ic d={IC.trash} s={14} />Удалить ({selected.size})</button>}
                    <button className="adm-btn adm-btn-primary" onClick={() => { setAdding(true); setEditCar(null) }}>
                        <Ic d={IC.plus} s={15} /> Добавить
                    </button>
                </div>
            </div>

            {/* Toolbar */}
            <div className="adm-toolbar">
                <form className="adm-search-form" onSubmit={doSearch}>
                    <div className="adm-search-wrap">
                        <Ic d={IC.search} s={15} />
                        <input className="adm-search-input" placeholder="Поиск по марке..." value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                    <button className="adm-btn adm-btn-sm" type="submit">Найти</button>
                    <button className="adm-btn adm-btn-sm adm-btn-cancel" type="button" onClick={reset}>Сбросить</button>
                </form>
                <select className="adm-select" value={sort} onChange={e => { setSort(e.target.value); setPage(1) }}>
                    <option value="newest">Новые</option>
                    <option value="price_asc">Цена ↑</option>
                    <option value="price_desc">Цена ↓</option>
                    <option value="mileage">Пробег ↑</option>
                    <option value="year_desc">Год ↓</option>
                </select>
                <button className="adm-btn adm-btn-sm" onClick={() => load(page, search, sort)}><Ic d={IC.ref} s={14} /></button>
            </div>

            {normalizeCarsStatus.current?.name && normalizeCarsStatus.running && (
                <div className="adm-car-sub" style={{ marginBottom: 12 }}>
                    Сейчас нормализуется: {normalizeCarsStatus.current.name} (ID: {normalizeCarsStatus.current.id}{normalizeCarsStatus.current.encar_id ? `, Encar: ${normalizeCarsStatus.current.encar_id}` : ''})
                </div>
            )}
            {!!normalizeCarsStatus.last_error && (
                <div className="adm-car-sub" style={{ marginBottom: 12, color: '#fca5a5' }}>
                    Последняя ошибка нормализации: {normalizeCarsStatus.last_error}
                </div>
            )}
            {enrichStatus.current?.name && enrichStatus.running && (
                <div className="adm-car-sub" style={{ marginBottom: 12 }}>
                    Сейчас обрабатывается: {enrichStatus.current.name} (ID: {enrichStatus.current.id}, Encar: {enrichStatus.current.encar_id})
                </div>
            )}
            {!!enrichStatus.last_error && (
                <div className="adm-car-sub" style={{ marginBottom: 12, color: '#fca5a5' }}>
                    Последняя ошибка: {enrichStatus.last_error}
                </div>
            )}
            {!!enrichStatus.report?.length && (
                <div className="adm-chart-box" style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: isEnrichReportOpen ? 12 : 0 }}>
                        <div className="adm-chart-title" style={{ margin: 0 }}>Что изменило обогащение</div>
                        <button
                            className="adm-btn adm-btn-sm adm-btn-ghost"
                            type="button"
                            onClick={() => setIsEnrichReportOpen(open => !open)}
                        >
                            {isEnrichReportOpen ? 'Скрыть' : 'Показать'}
                        </button>
                    </div>
                    {isEnrichReportOpen && (
                        <>
                            <div className="adm-car-sub" style={{ marginBottom: 12 }}>
                                Показаны последние {enrichStatus.report.length} изменений и ошибок текущего/последнего запуска.
                            </div>
                            <div style={{ display: 'grid', gap: 10 }}>
                                {enrichStatus.report.map((item, index) => (
                                    <div key={`${item.id}-${item.encar_id}-${item.finished_at || index}`} className="adm-settings-card" style={{ padding: 12 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 8 }}>
                                            <div style={{ fontWeight: 700, color: '#e2e8f0' }}>
                                                {item.name || `ID ${item.id}`}
                                            </div>
                                            <span className={`adm-tag-sm ${item.status === 'error' ? 'adm-tag-more' : ''}`}>
                                                {item.status === 'error' ? 'Ошибка' : 'Обновлено'}
                                            </span>
                                        </div>
                                        <div className="adm-car-sub" style={{ marginBottom: 8 }}>
                                            ID: {item.id} • Encar: {item.encar_id}
                                        </div>
                                        {item.status === 'error' ? (
                                            <div className="adm-car-sub" style={{ color: '#fca5a5' }}>
                                                {item.error}
                                            </div>
                                        ) : (
                                            <div style={{ display: 'grid', gap: 6 }}>
                                                {(item.changes || []).map((change, changeIndex) => (
                                                    <div key={`${item.id}-${change.field}-${changeIndex}`} className="adm-car-sub">
                                                        <strong>{change.field}</strong>: `{change.before || '-'}`
                                                        {' -> '}
                                                        `{change.after || '-'}`
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Content */}
            {error ? (
                <div className="adm-error-box">
                    <Ic d={IC.warn} s={18} />
                    <div>
                        <div style={{ fontWeight: 600 }}>Сервер не отвечает</div>
                        <div style={{ fontSize: 12, marginTop: 4 }}>Убедитесь что бэкенд запущен: <code>npm run server</code></div>
                    </div>
                    <button className="adm-btn adm-btn-sm" onClick={() => load(page, search, sort)}>Повторить</button>
                </div>
            ) : loading ? (
                <div className="adm-loading"><div className="adm-spin" /></div>
            ) : cars.length === 0 ? (
                <div className="adm-empty">Автомобилей нет. <button className="adm-link" onClick={() => setAdding(true)}>Добавить первый</button></div>
            ) : (
                <div className="adm-table-wrap">
                    <table className="adm-table">
                        <thead><tr>
                            <th><input type="checkbox" checked={selected.size === cars.length && cars.length > 0} onChange={toggleAll} style={{ accentColor: '#6366f1' }} /></th>
                            <th>ID</th><th>Фото</th><th>Автомобиль</th><th>Год/Пробег</th>
                            <th>Цена KRW</th><th>Цена USD</th><th>До Бишкека</th><th>Теги</th><th>Действия</th>
                        </tr></thead>
                        <tbody>
                            {cars.map(car => (
                                (() => {
                                    const displayName = normalizeAdminVehicleTitle(car.name, { keepBrand: true }) || car.name
                                    const displayModel = normalizeAdminVehicleTitle(car.model, { keepBrand: false }) || car.model
                                    return (
                                <tr key={car.id} className={selected.has(car.id) ? 'adm-tr-sel' : ''}>
                                    <td><input type="checkbox" checked={selected.has(car.id)} onChange={() => toggleSel(car.id)} style={{ accentColor: '#6366f1' }} /></td>
                                    <td className="adm-td-id">#{car.id}</td>
                                    <td>
                                        <div className="adm-thumb-wrap">
                                            {car.images?.length > 0
                                                ? <img className="adm-thumb" src={car.images[0].url} alt="" loading="lazy" />
                                                : <div className="adm-thumb-empty"><Ic d={IC.img} s={18} /></div>}
                                            <span className="adm-thumb-cnt">{(car.images || []).length}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="adm-car-name">{displayName}</div>
                                        <div className="adm-car-model">{displayModel}</div>
                                        {car.vin && <div className="adm-car-vin">VIN: {car.vin}</div>}
                                    </td>
                                    <td><div>{car.year}</div><div className="adm-car-sub">{Number(car.mileage || 0).toLocaleString()} км</div></td>
                                    <td className="adm-td-krw">{fmtK(car.price_krw)}</td>
                                    <td className="adm-td-usd">{fmtU(car.price_usd)}</td>
                                    <td className="adm-td-total">{fmtU(car.total)}</td>
                                    <td>
                                        <div className="adm-tags-cell">
                                            {(car.tags || []).slice(0, 2).map(t => <span key={t} className="adm-tag-sm">{t}</span>)}
                                            {(car.tags || []).length > 2 && <span className="adm-tag-sm adm-tag-more">+{car.tags.length - 2}</span>}
                                        </div>
                                    </td>
                                    <td>
                                        <div className="adm-row-acts">
                                            <button className="adm-act adm-act-edit" title="Редактировать" onClick={() => { setEditCar(car); setAdding(false) }}><Ic d={IC.edit} s={14} /></button>
                                            <button className="adm-act adm-act-price" title="Цены" onClick={() => setPriceCar(car)}><Ic d={IC.calc} s={14} /></button>
                                            <button className="adm-act adm-act-img" title="Фото" onClick={() => setImgCar(car)}><Ic d={IC.photo} s={14} /></button>
                                            {car.encar_url && <a className="adm-act adm-act-link" href={car.encar_url} target="_blank" rel="noreferrer" title="Encar"><Ic d={IC.ext} s={14} /></a>}
                                            <button className="adm-act adm-act-del" title="Удалить" onClick={() => setDelCar(car)}><Ic d={IC.trash} s={14} /></button>
                                        </div>
                                    </td>
                                </tr>
                                    )
                                })()
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Pagination */}
            {pages > 1 && (
                <div className="adm-pagination">
                    <button className="adm-btn adm-btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Назад</button>
                    {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
                        const pn = page <= 4 ? i + 1 : page - 3 + i; if (pn < 1 || pn > pages) return null
                        return <button key={pn} className={`adm-btn adm-btn-sm${pn === page ? ' adm-btn-active' : ''}`} onClick={() => setPage(pn)}>{pn}</button>
                    })}
                    <button className="adm-btn adm-btn-sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Вперёд →</button>
                    <span className="adm-pg-info">Стр. {page}/{pages} • {total} авто</span>
                </div>
            )}

            {/* Modals */}
            {(adding || editCar) && (
                <Modal title={editCar ? `Редактировать: ${editCar.name}` : 'Добавить авто'} onClose={() => { setAdding(false); setEditCar(null) }} wide>
                    <CarForm init={editCar || BLANK} onSave={save} onCancel={() => { setAdding(false); setEditCar(null) }} busy={busy} pricingSettings={pricingSettings} />
                </Modal>
            )}
            {imgCar && <Modal title={`Фото: ${imgCar.name}`} onClose={() => setImgCar(null)} wide><ImgMgr car={imgCar} onClose={() => setImgCar(null)} toast={toast} /></Modal>}
            {priceCar && <Modal title={`Цены: ${priceCar.name}`} onClose={() => setPriceCar(null)}><PriceEditor car={priceCar} onSave={savePrices} onClose={() => setPriceCar(null)} pricingSettings={pricingSettings} /></Modal>}
            {delCar && (
                <Modal title="Подтверждение удаления" onClose={() => setDelCar(null)}>
                    <p style={{ color: '#e2e8f0', marginBottom: 16 }}>Удалить <strong>{delCar.name}</strong> (ID: {delCar.id})?<br />Это действие необратимо — все фото тоже удалятся.</p>
                    <div className="adm-form-actions">
                        <button className="adm-btn adm-btn-cancel" onClick={() => setDelCar(null)}>Отмена</button>
                        <button className="adm-btn adm-btn-danger" onClick={() => del(delCar.id)}>🗑️ Удалить</button>
                    </div>
                </Modal>
            )}
        </div>
    )
}

/* ── Login ── */
function Login({ onLogin }) {
    const [pw, setPw] = useState('')
    const [err, setErr] = useState('')
    const [busy, setBusy] = useState(false)
    const go = async e => {
        e.preventDefault()
        setBusy(true); setErr('')
        try {
            const r = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: pw }),
            })
            if (r.ok) { onLogin() }
            else { setErr('Неверный пароль') }
        } catch { setErr('Ошибка соединения') }
        setBusy(false)
    }
    return (
        <div className="adm-login">
            <div className="adm-login-card">
                <div className="adm-login-logo"><Ic d={IC.car} s={40} /></div>
                <h1 className="adm-login-title">TLV Auto</h1>
                <p className="adm-login-sub">Панель управления</p>
                <form onSubmit={go} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <input className="adm-input" type="password" placeholder="Пароль" value={pw} autoFocus onChange={e => setPw(e.target.value)} />
                    {err && <div className="adm-err">{err}</div>}
                    <button className="adm-btn adm-btn-primary" style={{ width: '100%', justifyContent: 'center' }} type="submit" disabled={busy}>
                        {busy ? 'Проверка...' : 'Войти →'}
                    </button>
                </form>
            </div>
        </div>
    )
}

/* ── Root ── */
export default function AdminPage() {
    const [auth, setAuth] = useState(() => sessionStorage.getItem('adm') === 'ok')
    const [tab, setTab] = useState('dashboard')
    const [sidebar, setSidebar] = useState(true)
    const { list: toasts, add: toast } = useToast()
    const [initAdd, setInitAdd] = useState(false)
    const [pricingSettings, setPricingSettings] = useState(PRICING_FALLBACK)
    const [pricingLoaded, setPricingLoaded] = useState(false)
    const [pricingRevision, setPricingRevision] = useState(0)

    useEffect(() => {
        if (!auth) return
        let active = true
        setPricingLoaded(false)
        api.getPricingSettings()
            .then(data => {
                if (!active) return
                setPricingSettings(normalizePricingSettingsClient(data))
                setPricingLoaded(true)
            })
            .catch(() => {
                if (!active) return
                setPricingSettings(PRICING_FALLBACK)
                setPricingLoaded(true)
            })

        return () => {
            active = false
        }
    }, [auth])

    if (!auth) return <Login onLogin={() => { sessionStorage.setItem('adm', 'ok'); setAuth(true) }} />

    const nav = [
        { id: 'dashboard', label: 'Дашборд',     icon: IC.dash },
        { id: 'cars',      label: 'Автомобили',   icon: IC.car  },
        { id: 'scraper',   label: 'Encar Парсер', icon: IC.bolt },
        { id: 'calc',      label: 'Калькулятор',  icon: IC.calc },
        { id: 'settings',  label: 'Настройки',    icon: IC.set  },
    ]

    const goTo = id => { setTab(id); if (id === 'cars') { setInitAdd(false) } }
    const handlePricingSaved = (value) => {
        setPricingSettings(normalizePricingSettingsClient(value))
        setPricingLoaded(true)
        setPricingRevision(prev => prev + 1)
    }

    return (
        <div className="adm-layout">
            <aside className={`adm-sidebar${sidebar ? '' : ' adm-sidebar-col'}`}>
                <div className="adm-sidebar-logo"><Ic d={IC.car} s={26} />{sidebar && <span>TLV Auto</span>}</div>
                <nav className="adm-nav">
                    {nav.map(n => (
                        <button key={n.id} className={`adm-nav-btn${tab === n.id ? ' adm-nav-active' : ''}`} onClick={() => goTo(n.id)} title={n.label}>
                            <Ic d={n.icon} s={19} />{sidebar && <span>{n.label}</span>}
                        </button>
                    ))}
                </nav>
                <div className="adm-sidebar-ft">
                    <a href="/catalog" target="_blank" className="adm-nav-btn" title="Каталог"><Ic d={IC.ext} s={19} />{sidebar && <span>Каталог</span>}</a>
                    <button className="adm-nav-btn" onClick={() => { sessionStorage.removeItem('adm'); setAuth(false) }} title="Выйти">
                        <Ic d={IC.out} s={19} />{sidebar && <span>Выйти</span>}
                    </button>
                </div>
            </aside>

            <div className="adm-main">
                <header className="adm-topbar">
                    <button className="adm-tog" onClick={() => setSidebar(o => !o)}><Ic d={IC.menu} s={21} /></button>
                    <span className="adm-topbar-title">{nav.find(n => n.id === tab)?.label}</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span className="adm-badge">Admin</span>
                    </div>
                </header>
                <main className="adm-content">
                    {tab === 'dashboard' && <Dashboard onGo={id => { goTo(id); if (id === 'cars') setInitAdd(true) }} />}
                    {tab === 'cars'    && <Cars toast={toast} initAdd={initAdd} pricingSettings={pricingSettings} pricingRevision={pricingRevision} />}
                    {tab === 'scraper' && <AdminEncar />}
                    {tab === 'calc' && (
                        <div>
                            <h2 className="adm-section-heading" style={{ marginBottom: 20 }}>🧮 Калькулятор</h2>
                            <Calculator pricingSettings={pricingSettings} />
                        </div>
                    )}
                    {tab === 'settings' && <Settings toast={toast} pricingSettings={pricingSettings} pricingLoaded={pricingLoaded} onSavePricingSettings={handlePricingSaved} />}
                </main>
            </div>

            <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {toasts.map(t => (
                    <div key={t.id} className={`adm-toast adm-toast-${t.type}`}>
                        <Ic d={t.type === 'error' ? IC.warn : IC.ok} s={15} />{t.msg}
                    </div>
                ))}
            </div>
        </div>
    )
}

import { useState, useEffect, useRef, useCallback } from 'react'

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
}

const PASS = 'admin123'
const fmtU = n => '$' + Number(n || 0).toLocaleString('ru-RU')
const fmtK = n => Number(n || 0).toLocaleString('ko-KR') + ' ₩'

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
const BLANK = { name: '', model: '', year: '', mileage: '', body_color: '', interior_color: '', location: '', vin: '', price_krw: '', price_usd: '', commission: 200, delivery: 1750, loading: 0, unloading: 100, storage: 310, vat_refund: 0, total: 0, encar_url: '', encar_id: '', can_negotiate: false, tags: [] }

function recalc(f) {
    const n = k => Number(f[k]) || 0
    return { ...f, total: Math.round(n('price_usd') + n('commission') + n('delivery') + n('loading') + n('unloading') + n('storage') - n('vat_refund')) }
}

function CarForm({ init = BLANK, onSave, onCancel, busy }) {
    const [f, setF] = useState({ ...BLANK, ...init, tags: init.tags || [] })
    const [tagInp, setTagInp] = useState('')
    const [encarBusy, setEncarBusy] = useState(false)
    const [encarErr, setEncarErr] = useState('')

    const set = (k, v) => setF(prev => recalc({ ...prev, [k]: v }))
    const addTag = () => { const t = tagInp.trim(); if (t && !f.tags.includes(t)) setF(p => ({ ...p, tags: [...p.tags, t] })); setTagInp('') }

    const importEncar = async () => {
        if (!f.encar_id) return
        setEncarBusy(true); setEncarErr('')
        try {
            const d = await api.fetchEncar(f.encar_id)
            if (d.error) { setEncarErr(d.error); return }
            setF(p => recalc({ ...p, name: d.name || p.name, year: d.year || p.year, mileage: d.mileage || p.mileage, body_color: d.body_color || p.body_color, location: d.location || p.location, vin: d.vin || p.vin, price_krw: d.price_krw || p.price_krw, price_usd: d.price_usd || p.price_usd, encar_url: d.encar_url || p.encar_url, commission: d.commission || p.commission, delivery: d.delivery || p.delivery, loading: d.loading || p.loading, unloading: d.unloading || p.unloading, storage: d.storage || p.storage, vat_refund: d.vat_refund || p.vat_refund }))
        } catch (e) { setEncarErr(e.message) }
        setEncarBusy(false)
    }

    const submit = e => { e.preventDefault(); onSave({ ...f, mileage: +f.mileage || 0, price_krw: +f.price_krw || 0, price_usd: +f.price_usd || 0, commission: +f.commission || 0, delivery: +f.delivery || 0, loading: +f.loading || 0, unloading: +f.unloading || 0, storage: +f.storage || 0, vat_refund: +f.vat_refund || 0, total: +f.total || 0 }) }

    const Row = ({ kids }) => <div className="adm-fields-row">{kids}</div>
    const F = ({ label, k, type = 'text', ph, full }) => (
        <div className={`adm-field${full ? ' adm-field-full' : ''}`}>
            <label className="adm-label">{label}</label>
            <input className="adm-input" type={type} placeholder={ph} value={f[k] ?? ''} onChange={e => set(k, e.target.value)} />
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
            <div className="adm-price-grid">
                {[['Комиссия', 'commission'], ['Доставка', 'delivery'], ['Погрузка', 'loading'], ['Выгрузка', 'unloading'], ['Стоянка', 'storage'], ['Возврат НДС', 'vat_refund']].map(([label, k]) => (
                    <div key={k} className="adm-field">
                        <label className="adm-label">{label} ($)</label>
                        <input className="adm-input" type="number" value={f[k] ?? ''} onChange={e => set(k, e.target.value)} />
                    </div>
                ))}
            </div>
            <div className="adm-total-row">
                <span>До Бишкека итого:</span>
                <span className="adm-total-val">{fmtU(f.total)}</span>
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
function PriceEditor({ car, onSave, onClose }) {
    const [p, setP] = useState({ price_usd: car.price_usd || 0, commission: car.commission || 200, delivery: car.delivery || 1750, loading: car.loading || 0, unloading: car.unloading || 100, storage: car.storage || 310, vat_refund: car.vat_refund || 0 })
    const total = Math.round(Object.entries(p).reduce((s, [k, v]) => k === 'vat_refund' ? s - +v : s + (+v), 0))
    return (
        <div>
            <div style={{ marginBottom: 12, color: '#94a3b8', fontSize: 13 }}>{car.name} {car.year}</div>
            <div className="adm-price-grid">
                {Object.entries(p).map(([k, v]) => (
                    <div key={k} className="adm-field">
                        <label className="adm-label">{k === 'price_usd' ? 'Цена USD' : k === 'commission' ? 'Комиссия' : k === 'delivery' ? 'Доставка' : k === 'loading' ? 'Погрузка' : k === 'unloading' ? 'Выгрузка' : k === 'storage' ? 'Стоянка' : 'Возврат НДС'}</label>
                        <input className="adm-input" type="number" value={v} onChange={e => setP(prev => ({ ...prev, [k]: e.target.value }))} />
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
function Calculator() {
    const [v, setV] = useState({ krw: 28000000, rate: 0.00073, comm: 200, delivery: 1750, loading: 0, unloading: 100, storage: 310, vat_pct: 6.3 })
    const s = (k, val) => setV(p => ({ ...p, [k]: val }))
    const usd = Math.round(+v.krw * +v.rate)
    const vat = Math.round(usd * (+v.vat_pct / 100))
    const total = Math.round(usd + +v.comm + +v.delivery + +v.loading + +v.unloading + +v.storage - vat)
    return (
        <div>
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
function Settings({ toast }) {
    const [settings, setSettings] = useState({ comm: 200, delivery: 1750, unloading: 100, storage: 310, vat: 6.3, rate: 0.00073, wh: '996705188088' })
    const save = () => { localStorage.setItem('adm_settings', JSON.stringify(settings)); toast('Настройки сохранены', 'success') }
    useEffect(() => { try { const s = JSON.parse(localStorage.getItem('adm_settings') || '{}'); setSettings(p => ({ ...p, ...s })) } catch { } }, [])
    return (
        <div>
            <h2 className="adm-section-heading" style={{ marginBottom: 20 }}>⚙️ Настройки</h2>
            <div className="adm-settings-grid">
                <div className="adm-settings-card">
                    <div className="adm-settings-card-title">💰 Расходы по умолчанию</div>
                    {[['comm', 'Комиссия ($)'], ['delivery', 'Доставка ($)'], ['unloading', 'Выгрузка ($)'], ['storage', 'Стоянка ($)']].map(([k, label]) => (
                        <div key={k} className="adm-field" style={{ marginBottom: 10 }}>
                            <label className="adm-label">{label}</label>
                            <input className="adm-input" type="number" value={settings[k]} onChange={e => setSettings(p => ({ ...p, [k]: e.target.value }))} />
                        </div>
                    ))}
                </div>
                <div className="adm-settings-card">
                    <div className="adm-settings-card-title">🔄 Курс и параметры</div>
                    <div className="adm-field" style={{ marginBottom: 10 }}>
                        <label className="adm-label">Курс KRW → USD</label>
                        <input className="adm-input" type="number" step="0.00001" value={settings.rate} onChange={e => setSettings(p => ({ ...p, rate: e.target.value }))} />
                    </div>
                    <div className="adm-field" style={{ marginBottom: 10 }}>
                        <label className="adm-label">Возврат НДС (%)</label>
                        <input className="adm-input" type="number" step="0.1" value={settings.vat} onChange={e => setSettings(p => ({ ...p, vat: e.target.value }))} />
                    </div>
                    <div className="adm-field" style={{ marginBottom: 10 }}>
                        <label className="adm-label">WhatsApp номер</label>
                        <input className="adm-input" value={settings.wh} onChange={e => setSettings(p => ({ ...p, wh: e.target.value }))} />
                    </div>
                </div>
                <div className="adm-settings-card">
                    <div className="adm-settings-card-title">🌐 Полезные ссылки</div>
                    {[['Encar.com', 'https://www.encar.com'], ['Курс KRW/USD', 'https://www.google.com/search?q=KRW+USD'], ['Railway Dashboard', 'https://railway.app']].map(([name, url]) => (
                        <a key={name} href={url} target="_blank" rel="noreferrer" className="adm-quick-link">
                            <Ic d={IC.ext} s={14} /> {name}
                        </a>
                    ))}
                </div>
            </div>
            <div style={{ marginTop: 20 }}>
                <button className="adm-btn adm-btn-primary" onClick={save}>💾 Сохранить настройки</button>
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
function Cars({ toast, initAdd }) {
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
    const [selected, setSelected] = useState(new Set())

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

    useEffect(() => { load(page, search, sort) }, [page, sort, load])

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

    const toggleSel = id => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
    const toggleAll = () => setSelected(s => s.size === cars.length ? new Set() : new Set(cars.map(c => c.id)))

    return (
        <div>
            {/* Header */}
            <div className="adm-page-hd">
                <div>
                    <h2 className="adm-section-heading">🚗 Автомобили</h2>
                    <div className="adm-meta">{loading ? '...' : `Всего: ${total.toLocaleString()}`}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
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
                                        <div className="adm-car-name">{car.name}</div>
                                        <div className="adm-car-model">{car.model}</div>
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
                    <CarForm init={editCar || BLANK} onSave={save} onCancel={() => { setAdding(false); setEditCar(null) }} busy={busy} />
                </Modal>
            )}
            {imgCar && <Modal title={`Фото: ${imgCar.name}`} onClose={() => setImgCar(null)} wide><ImgMgr car={imgCar} onClose={() => setImgCar(null)} toast={toast} /></Modal>}
            {priceCar && <Modal title={`Цены: ${priceCar.name}`} onClose={() => setPriceCar(null)}><PriceEditor car={priceCar} onSave={savePrices} onClose={() => setPriceCar(null)} /></Modal>}
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
    const [pw, setPw] = useState(''); const [err, setErr] = useState('')
    const go = e => { e.preventDefault(); pw === PASS ? onLogin() : setErr('Неверный пароль') }
    return (
        <div className="adm-login">
            <div className="adm-login-card">
                <div className="adm-login-logo"><Ic d={IC.car} s={40} /></div>
                <h1 className="adm-login-title">TLV Auto</h1>
                <p className="adm-login-sub">Панель управления</p>
                <form onSubmit={go} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <input className="adm-input" type="password" placeholder="Пароль" value={pw} autoFocus onChange={e => setPw(e.target.value)} />
                    {err && <div className="adm-err">{err}</div>}
                    <button className="adm-btn adm-btn-primary" style={{ width: '100%', justifyContent: 'center' }} type="submit">Войти →</button>
                </form>
                <div className="adm-login-hint">Пароль: <code>admin123</code></div>
            </div>
        </div>
    )
}

/* ── Root ── */
export default function AdminPage() {
    const [auth, setAuth] = useState(() => sessionStorage.getItem('adm') === PASS)
    const [tab, setTab] = useState('dashboard')
    const [sidebar, setSidebar] = useState(true)
    const { list: toasts, add: toast } = useToast()
    const [initAdd, setInitAdd] = useState(false)

    if (!auth) return <Login onLogin={() => { sessionStorage.setItem('adm', PASS); setAuth(true) }} />

    const nav = [
        { id: 'dashboard', label: 'Дашборд', icon: IC.dash },
        { id: 'cars', label: 'Автомобили', icon: IC.car },
        { id: 'calc', label: 'Калькулятор', icon: IC.calc },
        { id: 'settings', label: 'Настройки', icon: IC.set },
    ]

    const goTo = id => { setTab(id); if (id === 'cars') { setInitAdd(false) } }

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
                    {tab === 'cars' && <Cars toast={toast} initAdd={initAdd} />}
                    {tab === 'calc' && (
                        <div>
                            <h2 className="adm-section-heading" style={{ marginBottom: 20 }}>🧮 Калькулятор</h2>
                            <Calculator />
                        </div>
                    )}
                    {tab === 'settings' && <Settings toast={toast} />}
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

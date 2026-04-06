import { useState, useEffect, useRef, useCallback } from 'react'

const ADMIN_SESSION_STORAGE_KEY = 'tlv-admin-session-token'
const RUN_PRESET_DEFAULT = 'default'
const RUN_PRESET_FRESH_LOW_ENGAGEMENT = 'fresh_low_engagement'

function getAdminSessionToken() {
  if (typeof window === 'undefined') return ''
  return String(window.sessionStorage.getItem(ADMIN_SESSION_STORAGE_KEY) || '')
}

function buildAdminRequestInit(init = {}) {
  const headers = new Headers(init.headers || {})
  const token = getAdminSessionToken()
  if (token) {
    headers.set('X-Admin-Session', token)
  }
  return { ...init, headers }
}

function buildAdminStreamUrl(path) {
  const token = getAdminSessionToken()
  if (!token) return path
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}admin_token=${encodeURIComponent(token)}`
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const PlayIcon = () => (
  <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
)
const StopIcon = () => (
  <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
    <rect x="3" y="3" width="18" height="18" rx="2" />
  </svg>
)
const RefreshIcon = () => (
  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
)
const SettingsIcon = () => (
  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)
const ClockIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
)
const ClearIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4h6v2" />
  </svg>
)

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTs(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatPercent(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '0%'
  return `${numeric.toFixed(numeric % 1 === 0 ? 0 : 1)}%`
}

function parsePipeMessage(message) {
  const text = String(message || '').trim()
  if (!text.includes('|')) {
    return { head: text, fields: {} }
  }

  const parts = text.split('|').map((part) => part.trim()).filter(Boolean)
  const [head, ...rest] = parts
  const fields = {}

  for (const part of rest) {
    const separatorIndex = part.indexOf('=')
    if (separatorIndex === -1) continue
    const key = part.slice(0, separatorIndex).trim()
    const value = part.slice(separatorIndex + 1).trim()
    if (key) fields[key] = value
  }

  return { head, fields }
}

function formatScope(scope) {
  if (scope === 'domestic') return 'только корейские (domestic)'
  if (scope === 'imported') return 'только импортные'
  if (scope === 'japanese') return 'только японские'
  if (scope === 'german') return 'только немецкие'
  return 'все машины'
}

function formatListSource(source) {
  if (source === 'proxy') return 'proxy'
  if (source === 'direct') return 'direct'
  if (source === 'fallback') return 'fallback'
  return source || 'unknown'
}

function translateBackendDetail(message) {
  const text = String(message || '').trim()
  if (!text) return ''
  if (text.includes('Proxy auth required (407)')) {
    return 'proxy требует авторизацию (407). Проверьте ENCAR_PROXY_URL и доступность /api/proxy'
  }
  if (text.includes('Request failed with status code 407')) {
    return 'proxy вернул 407 и не пустил запрос'
  }
  return text
}

function isBrokenLogMessage(message) {
  const text = String(message || '')
  return [
    'рџ',
    'вќ',
    'вЏ',
    'СЂСџ',
    'РІС',
    'Р С',
    'РЎв',
  ].some((pattern) => text.includes(pattern))
}

function formatLogMessage(message) {
  const text = String(message || '').trim()
  if (!text) return ''
  if (isBrokenLogMessage(text)) return ''

  const { head, fields } = parsePipeMessage(text)

  switch (head) {
    case 'SCRAPER_START':
      return `Запуск парсера: режим ${formatScope(fields.scope)}, лимит ${fields.limit || '-'}`
    case 'LIST_FETCH':
      return `Получаю список: offset=${fields.offset || 0}, count=${fields.count || 0}, режим=${formatScope(fields.scope)}`
    case 'LIST_FETCH_OK':
      return `Список получен: машин=${fields.cars || 0}, просмотрено=${fields.scanned || 0}, всего=${fields.total || 0}, режим=${formatScope(fields.scope)}, источник=${formatListSource(fields.source)}`
    case 'LIST_SOURCE_FALLBACK':
      return `Переключаю источник списка: режим=${formatScope(fields.scope)}, offset=${fields.offset || 0}, использую=${formatListSource(fields.source)}, сбои=${fields.failures || 'нет деталей'}`
    case 'LIST_FETCH_ERROR':
      return `Ошибка получения списка: режим=${formatScope(fields.scope)}, код=${fields.code || 'unknown'}, ${translateBackendDetail(fields.message || 'нет деталей')}${fields.sourceErrors && fields.sourceErrors !== 'none' ? `, источники=${fields.sourceErrors}` : ''}`
    case 'LIST_ALL_KNOWN_PAGE':
      return `Страница уже известна базе: offset=${fields.offset || 0}, машин=${fields.known || 0}, подряд=${fields.consecutive || 0}`
    case 'LIST_STALE_STOP':
      return `Остановка на старом хвосте: offset=${fields.offset || 0}, подряд известных страниц=${fields.consecutiveKnownPages || 0}`
    case 'LIST_TAIL_GUARD_BYPASSED':
      return `Продолжаю обход хвоста: режим=${formatScope(fields.scope)}, offset=${fields.offset || 0}, причина=${fields.reason || 'guard_bypassed'}, fresh=${fields.fresh || 0}, known=${fields.known || 0}`
    case 'STOP_REQUESTED':
      return 'Остановка запрошена пользователем'
    case 'STOPPED':
      return `Парсер остановлен: импортировано ${fields.imported || 0}`
    case 'SOFT_RECHECK':
      return `Мягкая перепроверка карточки: carId=${fields.carId || '-'}`
    case 'SOFT_RECHECK_RETRY':
      return `Повтор detail после мягкой перепроверки: carId=${fields.carId || '-'}, причина=${fields.reason || 'unknown'}, попытка=${fields.attempt || '-'}`
    case 'SOFT_RECHECK_RECOVERED':
      return `Карточка восстановлена после мягкой перепроверки: carId=${fields.carId || '-'}, источник=${fields.source || 'detail'}`
    case 'PHOTO_FETCH':
      return `Загружаю фото: carId=${fields.carId || '-'}, count=${fields.count || 0}, источник=${fields.source || 'unknown'}`
    case 'IMPORTED':
      return `Сохранено: ${fields.name || 'машина'} -> id=${fields.id || '-'}, фото=${fields.photos || 0}`
    case 'LIMIT_REACHED':
      return `Достигнут лимит новых машин: ${fields.limit || 0}`
    case 'SCRAPER_DONE':
      return `Готово: импортировано=${fields.imported || 0}, пропущено=${fields.skipped || 0}, ошибок=${fields.failed || 0}, retry recovered=${fields.recovered || 0}, фото=${fields.photos || 0}`
    case 'SCRAPER_FATAL':
      return `Критическая ошибка: ${fields.message || 'unknown error'}`
    case 'SESSION_SUMMARY':
      return `Итог сеанса: найдено=${fields.found || 0}, импортировано=${fields.imported || 0}, не импортировано всего=${fields.skipped_total || fields.skipped || 0}, уже в базе=${fields.already_known || 0}, отсев=${fields.skipped || 0}, ошибок=${fields.failed || 0}, фото=${fields.photos || 0}`
    case 'SESSION_REASON':
      return `Причина: ${fields.label || head} (${text.replace(/^SESSION_REASON \|\s*/, '').replace(/\s*\|\s*label=.*$/, '')})`
    default:
      return text
  }
}

function renderDiagnosticMeta(meta) {
  const diagnostic = meta?.diagnostic
  if (!diagnostic) return null

  const bits = [
    diagnostic.stage ? `stage=${diagnostic.stage}` : null,
    diagnostic.reason ? `reason=${diagnostic.reason}` : null,
    diagnostic.carId ? `carId=${diagnostic.carId}` : null,
    diagnostic.vehicleId ? `vehicleId=${diagnostic.vehicleId}` : null,
    diagnostic.vehicleNo ? `vehicleNo=${diagnostic.vehicleNo}` : null,
    diagnostic.retryable ? 'retry=yes' : 'retry=no',
    diagnostic.temporary ? 'temp=yes' : 'temp=no',
    diagnostic.httpStatus ? `http=${diagnostic.httpStatus}` : null,
  ].filter(Boolean)

  return (
    <div style={{ marginTop: '3px', color: '#64748b', fontSize: '11px' }}>
      <div>{bits.join(' • ')}</div>
      {diagnostic.url && <div style={{ marginTop: '2px' }}>url={diagnostic.url}</div>}
    </div>
  )
}

const LOG_COLORS = {
  success: { bg: 'rgba(0,184,148,0.12)', dot: '#00b894', text: '#00b894' },
  error:   { bg: 'rgba(239,68,68,0.12)', dot: '#ef4444', text: '#ef4444' },
  warn:    { bg: 'rgba(245,158,11,0.10)', dot: '#f59e0b', text: '#f59e0b' },
  info:    { bg: 'transparent',           dot: '#64748b', text: '#94a3b8' },
}

// ── Sub-components ────────────────────────────────────────────────────────────
function StatBadge({ label, value, color = '#00b894', bg = 'rgba(0,184,148,0.10)' }) {
  return (
    <div style={{
      background: bg,
      borderRadius: '10px',
      padding: '14px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      border: `1px solid ${color}22`,
    }}>
      <div style={{ fontSize: '22px', fontWeight: '700', color }}>{value ?? '—'}</div>
      <div style={{ fontSize: '12px', color: '#64748b' }}>{label}</div>
    </div>
  )
}

function ProgressBar({ done, total, failed }) {
  const pct  = total > 0 ? Math.round((done / total) * 100) : 0
  const fpct = total > 0 ? Math.round((failed / total) * 100) : 0
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{ fontSize: '13px', color: '#94a3b8' }}>Прогресс</span>
        <span style={{ fontSize: '13px', fontWeight: '600', color: '#e2e8f0' }}>
          {done} / {total} ({pct}%)
        </span>
      </div>
      <div style={{
        height: '10px', background: '#1e3a52', borderRadius: '99px',
        overflow: 'hidden', position: 'relative',
      }}>
        {fpct > 0 && (
          <div style={{
            position: 'absolute', left: `${pct}%`, width: `${fpct}%`,
            height: '100%', background: '#ef4444', borderRadius: '99px',
          }} />
        )}
        <div style={{
          height: '100%', width: `${pct}%`, borderRadius: '99px',
          background: 'linear-gradient(90deg, #00b894, #00cba6)',
          transition: 'width 0.4s ease',
          boxShadow: pct > 0 ? '0 0 8px rgba(0,184,148,0.5)' : 'none',
        }} />
      </div>
    </div>
  )
}

function PowerBtn({ value, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '10px 0', borderRadius: '8px', cursor: 'pointer',
        border: active ? '2px solid #00b894' : '2px solid #1e3a52',
        background: active ? 'rgba(0,184,148,0.15)' : '#0d1b2a',
        color: active ? '#00b894' : '#64748b',
        fontWeight: active ? '700' : '400',
        fontSize: '14px', transition: 'all 0.15s',
      }}
    >
      <div style={{ fontSize: '16px', fontWeight: '700' }}>{value}</div>
      <div style={{ fontSize: '11px', marginTop: '2px' }}>{label}</div>
    </button>
  )
}

function ScheduleBtn({ label, sub, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '12px 8px', borderRadius: '10px', cursor: 'pointer',
        border: active ? '2px solid #00b894' : '2px solid #1e3a52',
        background: active ? 'rgba(0,184,148,0.12)' : '#0f2030',
        color: active ? '#00b894' : '#64748b',
        textAlign: 'center', transition: 'all 0.15s',
      }}
    >
      <div style={{ fontSize: '14px', fontWeight: active ? '700' : '500' }}>{label}</div>
      <div style={{ fontSize: '11px', marginTop: '2px', color: active ? '#00b894cc' : '#475569' }}>{sub}</div>
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AdminEncar() {
  const [status, setStatus]         = useState(null)
  const [logs, setLogs]             = useState([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [starting, setStarting]     = useState(false)
  const [startingPreset, setStartingPreset] = useState(null)
  const [error, setError]           = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [showSettings, setShowSettings] = useState(false)

  // Config form state
  const [cfgSchedule,   setCfgSchedule]   = useState('manual')
  const [cfgParseScope, setCfgParseScope] = useState('all')
  const [cfgRunPreset,  setCfgRunPreset]  = useState(RUN_PRESET_DEFAULT)
  const [cfgLimit,      setCfgLimit]      = useState(100)
  const [cfgHour,       setCfgHour]       = useState(10)
  const [cfgInterval,   setCfgInterval]   = useState(1)

  const logsRef    = useRef(null)
  const evtRef     = useRef(null)

  // ── Fetch initial status ───────────────────────────────────────────────────
  const loadStatus = useCallback(async () => {
    try {
      const res  = await fetch('/api/scraper/status', buildAdminRequestInit())
      const data = await res.json()
      setStatus(data)
      if (data.config) {
        setCfgSchedule(data.config.schedule  || 'manual')
        setCfgParseScope(data.config.parseScope || data.config.parse_scope || 'all')
        setCfgRunPreset(data.config.runPreset || data.config.run_preset || RUN_PRESET_DEFAULT)
        setCfgLimit(   data.config.dailyLimit || 100)
        setCfgHour(    data.config.hour       || 10)
        setCfgInterval(data.config.intervalHours || 1)
      }
      if (data.logs?.length) setLogs(data.logs)
      setLoading(false)
    } catch {
      setError('Не удалось подключиться к серверу')
      setLoading(false)
    }
  }, [])

  // ── SSE stream for live updates ────────────────────────────────────────────
  const connectSSE = useCallback(() => {
    if (evtRef.current) evtRef.current.close()
    if (!getAdminSessionToken()) return

    const es = new EventSource(buildAdminStreamUrl('/api/scraper/stream'))
    evtRef.current = es

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)

        if (data.type === 'status') {
          setStatus(prev => ({ ...prev, ...data }))
        }
        if (data.type === 'log') {
          setLogs(prev => [data.entry, ...prev].slice(0, 500))
        }
        if (data.type === 'progress') {
          setStatus(prev => prev ? { ...prev, progress: data.progress } : prev)
        }
        if (data.type === 'done') {
          setStatus(prev => prev ? {
            ...prev,
            isRunning: false,
            progress: data.progress,
            ...(data.sessionSummary ? { sessionSummary: data.sessionSummary } : {}),
          } : prev)
          setStarting(false)
          setStartingPreset(null)
          loadStatus()
        }
      } catch { /* ignore parse errors */ }
    }

    es.onerror = () => {
      es.close()
      if (!getAdminSessionToken()) return
      // Reconnect after 3 s
      setTimeout(connectSSE, 3000)
    }
  }, [loadStatus])

  useEffect(() => {
    loadStatus()
    connectSSE()
    return () => {
      evtRef.current?.close()
    }
  }, [loadStatus, connectSSE])

  // Auto-scroll console
  useEffect(() => {
    if (autoScroll && logsRef.current) {
      logsRef.current.scrollTop = 0
    }
  }, [logs, autoScroll])

  const hasPendingConfigChanges = Boolean(
    status?.config && (
      status.config.schedule !== cfgSchedule ||
      (status.config.parseScope || 'all') !== cfgParseScope ||
      (status.config.runPreset || RUN_PRESET_DEFAULT) !== cfgRunPreset ||
      Number(status.config.dailyLimit || 100) !== Number(cfgLimit || 100) ||
      Number(status.config.hour || 10) !== Number(cfgHour || 10) ||
      Number(status.config.intervalHours || 1) !== Number(cfgInterval || 1)
    )
  )

  const saveConfig = useCallback(async ({ silent = false } = {}) => {
    const res  = await fetch('/api/scraper/config', buildAdminRequestInit({
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schedule:      cfgSchedule,
        parseScope:    cfgParseScope,
        runPreset:     cfgRunPreset,
        dailyLimit:    cfgLimit,
        hour:          cfgHour,
        intervalHours: cfgInterval,
      }),
    }))
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Ошибка сохранения')

    setStatus(prev => prev ? {
      ...prev,
      config: {
        ...(prev.config || {}),
        ...data.config,
      },
    } : prev)

    if (!silent) {
      flash('✅ Настройки сохранены', 'success')
    }

    return data
  }, [cfgHour, cfgInterval, cfgLimit, cfgParseScope, cfgRunPreset, cfgSchedule])

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleStart = async (runPreset = RUN_PRESET_DEFAULT) => {
    setStarting(true)
    setStartingPreset(runPreset)
    setError(null)
    try {
      if (hasPendingConfigChanges) {
        await saveConfig({ silent: true })
      }
      const res  = await fetch('/api/scraper/start', buildAdminRequestInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: cfgLimit, parseScope: cfgParseScope, runPreset }),
      }))
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка запуска')
      setStatus(prev => prev ? {
        ...prev,
        isRunning: true,
        sessionSummary: {
          ...(prev.sessionSummary || {}),
          runPreset,
        },
      } : prev)
      flash(`✅ ${data.message}`, 'success')
    } catch (e) {
      setError(e.message)
      setStarting(false)
      setStartingPreset(null)
    }
  }

  const handleStop = async () => {
    try {
      await fetch('/api/scraper/stop', buildAdminRequestInit({ method: 'POST' }))
      flash('⏹ Запрос остановки отправлен', 'success')
    } catch (e) {
      setError(e.message)
    }
  }

  const handleSaveConfig = async () => {
    setSaving(true)
    setError(null)
    const res = { ok: true }
    const data = {}
    try {
      await saveConfig({ silent: true })
      if (!res.ok) throw new Error(data.error || 'Ошибка сохранения')
      flash('✅ Настройки сохранены', 'success')
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const flash = (msg, type = 'success') => {
    setSuccessMsg({ msg, type })
    setTimeout(() => setSuccessMsg(null), 3500)
  }

  const clearLogs = () => setLogs([])

  // ── Render ─────────────────────────────────────────────────────────────────
  const isRunning = status?.isRunning
  const progress  = status?.progress || {
    done: 0,
    total: 0,
    failed: 0,
    skipped: 0,
    alreadyKnown: 0,
    totalSkipped: 0,
    photos: 0,
  }
  const sessionSummary = status?.sessionSummary || {
    found: 0,
    imported: 0,
    skipped: 0,
    alreadyKnown: 0,
    totalSkipped: 0,
    failed: 0,
    retryRecovered: 0,
    discarded: 0,
    normalSkipped: 0,
    photos: 0,
    topReasons: [],
    diagnosticBuckets: {},
    optimizationStats: {},
  }
  const diagnosticBuckets = sessionSummary.diagnosticBuckets || {}
  const optimizationStats = sessionSummary.optimizationStats || {}
  const totalSkipped = progress.totalSkipped ?? ((progress.skipped || 0) + (progress.alreadyKnown || 0))
  const summaryTotalSkipped = sessionSummary.totalSkipped ?? ((sessionSummary.skipped || 0) + (sessionSummary.alreadyKnown || 0))
  const rejectedCount = progress.skipped || 0
  const alreadyKnownCount = progress.alreadyKnown || 0
  const summaryRejectedCount = sessionSummary.skipped || 0
  const summaryAlreadyKnownCount = sessionSummary.alreadyKnown || 0

  const scheduleLabel = {
    manual: 'Вручную',
    hourly: `Каждые ${cfgInterval} ч`,
    daily:  `Каждый день в ${String(cfgHour).padStart(2,'0')}:00`,
  }[cfgSchedule] || 'Вручную'
  const parseScopeLabel = {
    all: 'Все машины',
    domestic: 'Только корейские (domestic)',
    imported: 'Только импортные',
    japanese: 'Только японские',
    german: 'Только немецкие',
  }[cfgParseScope] || 'Все машины'

  return (
    <div style={{
      padding: '32px',
      minHeight: '100vh',
      background: '#0a1628',
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
      color: '#e2e8f0',
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#f1f5f9' }}>
            Encar Парсер
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
            Автоматический импорт автомобилей с Encar.com
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            onClick={() => { loadStatus(); flash('Обновлено', 'info') }}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', borderRadius: '8px', cursor: 'pointer',
              background: '#0f2030', border: '1px solid #1e3a52',
              color: '#64748b', fontSize: '13px',
            }}
          >
            <RefreshIcon /> Обновить
          </button>
          <button
            onClick={() => setShowSettings(s => !s)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', borderRadius: '8px', cursor: 'pointer',
              background: showSettings ? 'rgba(0,184,148,0.12)' : '#0f2030',
              border: showSettings ? '1px solid #00b894' : '1px solid #1e3a52',
              color: showSettings ? '#00b894' : '#64748b', fontSize: '13px',
            }}
          >
            <SettingsIcon /> Настройки
          </button>
        </div>
      </div>

      {/* Flash messages */}
      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '10px', padding: '12px 16px', marginBottom: '16px',
          color: '#fca5a5', fontSize: '14px',
        }}>
          ❌ {error}
        </div>
      )}
      {successMsg && (
        <div style={{
          background: 'rgba(0,184,148,0.12)', border: '1px solid rgba(0,184,148,0.3)',
          borderRadius: '10px', padding: '12px 16px', marginBottom: '16px',
          color: '#6ee7b7', fontSize: '14px',
        }}>
          {successMsg.msg}
        </div>
      )}

      {/* ── Status + Stats Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        {/* Status card */}
        <div style={{
          gridColumn: '1 / 2',
          background: '#0f2030',
          borderRadius: '14px',
          padding: '20px 24px',
          border: isRunning ? '1px solid rgba(0,184,148,0.35)' : '1px solid #1e3a52',
          boxShadow: isRunning ? '0 0 20px rgba(0,184,148,0.08)' : 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <div style={{
              width: '10px', height: '10px', borderRadius: '50%',
              background: isRunning ? '#00b894' : '#475569',
              boxShadow: isRunning ? '0 0 6px #00b894' : 'none',
              animation: isRunning ? 'pulse 1.5s ease infinite' : 'none',
            }} />
            <span style={{ fontWeight: '600', fontSize: '15px', color: isRunning ? '#00b894' : '#94a3b8' }}>
              {isRunning ? 'Работает' : 'Остановлен'}
            </span>
          </div>
          <div style={{ fontSize: '12px', color: '#475569' }}>
            <div>Последний запуск:</div>
            <div style={{ color: '#94a3b8', marginTop: '2px' }}>{formatDate(status?.lastRun)}</div>
          </div>
          {status?.nextRun && (
            <div style={{ fontSize: '12px', color: '#475569', marginTop: '8px' }}>
              <div>Следующий:</div>
              <div style={{ color: '#00b894', marginTop: '2px' }}>{formatDate(status.nextRun)}</div>
            </div>
          )}
          {!status?.nextRun && (
            <div style={{
              marginTop: '10px', display: 'flex', alignItems: 'center', gap: '5px',
              fontSize: '12px', color: '#64748b',
            }}>
              <ClockIcon /> {scheduleLabel}
            </div>
          )}

        </div>

        <StatBadge label="Добавлено за сеанс" value={progress.done} color="#00b894" bg="rgba(0,184,148,0.08)" />
        <StatBadge label="Фото скачано" value={progress.photos} color="#3b82f6" bg="rgba(59,130,246,0.08)" />
        <StatBadge label="Уже в базе" value={alreadyKnownCount} color="#38bdf8" bg="rgba(56,189,248,0.10)" />
        <StatBadge label="Ошибок / Отсев" value={`${progress.failed} / ${rejectedCount}`} color="#f59e0b" bg="rgba(245,158,11,0.08)" />
        <StatBadge label="Retry recovered" value={progress.retryRecovered || 0} color="#8b5cf6" bg="rgba(139,92,246,0.10)" />
      </div>

      {/* ── Progress bar (visible when running) ── */}
      {isRunning && (
        <div style={{
          background: '#0f2030', borderRadius: '14px', padding: '20px 24px',
          border: '1px solid rgba(0,184,148,0.2)', marginBottom: '20px',
        }}>
          <ProgressBar done={progress.done} total={progress.total} failed={progress.failed} />
          <div style={{ marginTop: '10px', fontSize: '12px', color: '#475569' }}>
            Фото: {progress.photos} • Отсев: {rejectedCount} • Уже в базе: {alreadyKnownCount} • Не импортировано всего: {totalSkipped} • Ошибок: {progress.failed}
          </div>
        </div>
      )}

      {/* ── Power + Schedule + Controls ── */}
      {!isRunning && (
        <div style={{
          background: '#0f2030',
          borderRadius: '14px',
          padding: '20px 24px',
          border: '1px solid #1e3a52',
          marginBottom: '20px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: '700', color: '#f1f5f9' }}>Reason Summary</div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              Найдено: {sessionSummary.found || 0} • Импортировано: {sessionSummary.imported || 0} • Не импортировано всего: {summaryTotalSkipped} • Уже в базе: {summaryAlreadyKnownCount} • Отсев: {summaryRejectedCount} • Нормальные skip: {sessionSummary.normalSkipped || 0} • Финально отброшено: {sessionSummary.discarded || 0}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
              already known: <span style={{ color: '#cbd5e1' }}>{diagnosticBuckets.alreadyKnown || 0}</span> • duplicate: <span style={{ color: '#cbd5e1' }}>{diagnosticBuckets.duplicate || 0}</span> • temporary fail: <span style={{ color: '#fda4af' }}>{diagnosticBuckets.temporaryFail || 0}</span> • invalid page: <span style={{ color: '#fbbf24' }}>{diagnosticBuckets.invalidPage || 0}</span> • parse incomplete: <span style={{ color: '#93c5fd' }}>{diagnosticBuckets.parseIncomplete || 0}</span> • recovered: <span style={{ color: '#c4b5fd' }}>{diagnosticBuckets.recovered || 0}</span>
            </div>
          </div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            Retry recovered: <span style={{ color: '#c4b5fd' }}>{sessionSummary.retryRecovered || 0}</span> • Фото: <span style={{ color: '#93c5fd' }}>{sessionSummary.photos || 0}</span>
            <div style={{ marginTop: '6px' }}>
              Tail stops: <span style={{ color: '#cbd5e1' }}>{optimizationStats.listTailStops || 0}</span> • VIN cache hits: <span style={{ color: '#cbd5e1' }}>{optimizationStats.vinCacheHits || 0}</span>
            </div>
          </div>
        </div>

          {sessionSummary.topReasons?.length ? (
            <div style={{ display: 'grid', gap: '8px' }}>
              {sessionSummary.topReasons.slice(0, 8).map((item) => (
                <div
                  key={item.code}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '12px',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: '#0a1628',
                    border: '1px solid #1e293b',
                    fontSize: '12px',
                  }}
                >
                  <span style={{ color: '#cbd5e1' }}>{item.label || item.code}</span>
                  <span style={{ color: '#94a3b8' }}>{item.count} • {formatPercent(item.percent)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: '#475569' }}>
              Пока нет данных по причинам пропусков за текущий/последний сеанс.
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>

        {/* Power selector */}
        <div style={{
          background: '#0f2030', borderRadius: '14px', padding: '20px 24px',
          border: '1px solid #1e3a52',
        }}>
          <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Лимит машин за запуск
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[
              { value: 100,  label: 'Старт' },
              { value: 500,  label: 'Стандарт' },
              { value: 1000, label: 'Быстро' },
              { value: 5000, label: 'Максимум' },
            ].map(({ value, label }) => (
              <PowerBtn
                key={value}
                value={value}
                label={label}
                active={cfgLimit === value}
                onClick={() => setCfgLimit(value)}
              />
            ))}
          </div>
          <div style={{ marginTop: '12px' }}>
            <input
              type="range"
              min="50" max="5000" step="50"
              value={cfgLimit}
              onChange={e => setCfgLimit(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#00b894', cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#475569' }}>
              <span>50</span>
              <span style={{ color: '#00b894', fontWeight: '600' }}>Выбрано: {cfgLimit} машин</span>
              <span>5000</span>
            </div>
          </div>
          <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid #1e3a52' }}>
            <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Режим парсинга
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
              <ScheduleBtn
                value="all"
                label="Все машины"
                sub="Общий поток Encar без CarType"
                active={cfgParseScope === 'all'}
                onClick={() => setCfgParseScope('all')}
              />
              <ScheduleBtn
                value="domestic"
                label="Только корейские"
                sub="Domestic поток, CarType.Y"
                active={cfgParseScope === 'domestic'}
                onClick={() => setCfgParseScope('domestic')}
              />
              <ScheduleBtn
                value="imported"
                label="Только импортные"
                sub="Import поток, CarType.N"
                active={cfgParseScope === 'imported'}
                onClick={() => setCfgParseScope('imported')}
              />
              <ScheduleBtn
                value="japanese"
                label="Только японские"
                sub="Toyota, Lexus, Honda"
                active={cfgParseScope === 'japanese'}
                onClick={() => setCfgParseScope('japanese')}
              />
              <ScheduleBtn
                value="german"
                label="Только немецкие"
                sub="BMW, Audi, Mercedes"
                active={cfgParseScope === 'german'}
                onClick={() => setCfgParseScope('german')}
              />
            </div>
          </div>
        </div>

        {/* Schedule selector */}
        <div style={{
          background: '#0f2030', borderRadius: '14px', padding: '20px 24px',
          border: '1px solid #1e3a52',
        }}>
          <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Расписание
          </div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
            <ScheduleBtn
              value="manual" label="Вручную" sub="Только ручной запуск"
              active={cfgSchedule === 'manual'}
              onClick={() => setCfgSchedule('manual')}
            />
            <ScheduleBtn
              value="hourly" label="Каждый час" sub={`Каждые ${cfgInterval} ч`}
              active={cfgSchedule === 'hourly'}
              onClick={() => setCfgSchedule('hourly')}
            />
            <ScheduleBtn
              value="daily" label="Каждый день" sub={`В ${String(cfgHour).padStart(2,'0')}:00`}
              active={cfgSchedule === 'daily'}
              onClick={() => setCfgSchedule('daily')}
            />
          </div>

          {cfgSchedule === 'hourly' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '13px', color: '#94a3b8' }}>Каждые</span>
              <select
                value={cfgInterval}
                onChange={e => setCfgInterval(Number(e.target.value))}
                style={{
                  background: '#0d1b2a', border: '1px solid #1e3a52',
                  color: '#e2e8f0', borderRadius: '8px', padding: '6px 10px',
                  fontSize: '13px', cursor: 'pointer',
                }}
              >
                {[1,2,3,4,6,8,12].map(h => (
                  <option key={h} value={h}>{h} ч</option>
                ))}
              </select>
              <span style={{ fontSize: '13px', color: '#94a3b8' }}>часов</span>
            </div>
          )}

          {cfgSchedule === 'daily' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '13px', color: '#94a3b8' }}>Запуск в</span>
              <select
                value={cfgHour}
                onChange={e => setCfgHour(Number(e.target.value))}
                style={{
                  background: '#0d1b2a', border: '1px solid #1e3a52',
                  color: '#e2e8f0', borderRadius: '8px', padding: '6px 10px',
                  fontSize: '13px', cursor: 'pointer',
                }}
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{String(i).padStart(2,'0')}:00</option>
                ))}
              </select>
              <span style={{ fontSize: '13px', color: '#94a3b8' }}>каждый день</span>
            </div>
          )}
          <label style={{
            marginTop: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 14px',
            borderRadius: '10px',
            background: 'rgba(59,130,246,0.08)',
            border: '1px solid rgba(59,130,246,0.25)',
            cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={cfgRunPreset === RUN_PRESET_FRESH_LOW_ENGAGEMENT}
              onChange={(e) => setCfgRunPreset(e.target.checked ? RUN_PRESET_FRESH_LOW_ENGAGEMENT : RUN_PRESET_DEFAULT)}
              style={{ width: '16px', height: '16px', accentColor: '#3b82f6', cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '13px', color: '#e2e8f0', fontWeight: '600' }}>Свежие объявления</span>
              <span style={{ fontSize: '12px', color: '#93c5fd' }}>Для расписания: просмотры &lt;= 6, calls = 0, subscribe = 0</span>
            </div>
          </label>
        </div>
      </div>

      {/* ── Control buttons ── */}
      <div style={{
        display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap',
        background: '#0f2030', borderRadius: '14px', padding: '16px 24px',
        border: '1px solid #1e3a52', alignItems: 'center',
      }}>
        {!isRunning ? (
          <>
          <button
            onClick={() => handleStart(RUN_PRESET_DEFAULT)}
            disabled={starting}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '11px 28px', borderRadius: '10px', cursor: starting ? 'wait' : 'pointer',
              background: starting ? '#0f2030' : 'linear-gradient(135deg, #00b894, #00cba6)',
              border: 'none', color: '#fff', fontSize: '15px', fontWeight: '700',
              boxShadow: starting ? 'none' : '0 4px 16px rgba(0,184,148,0.4)',
              transition: 'all 0.2s',
              opacity: starting ? 0.7 : 1,
            }}
          >
            <PlayIcon />
            {starting ? 'Запускаю...' : `Запустить: ${parseScopeLabel.toLowerCase()} (${cfgLimit} машин)`}
          </button>
          <button
            onClick={() => handleStart(RUN_PRESET_FRESH_LOW_ENGAGEMENT)}
            disabled={starting}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '11px 22px', borderRadius: '10px', cursor: starting ? 'wait' : 'pointer',
              background: 'rgba(59,130,246,0.12)',
              border: '1px solid rgba(59,130,246,0.35)', color: '#93c5fd',
              fontSize: '14px', fontWeight: '700',
              boxShadow: startingPreset === RUN_PRESET_FRESH_LOW_ENGAGEMENT ? '0 0 0 1px rgba(59,130,246,0.3)' : 'none',
              transition: 'all 0.2s',
              opacity: starting ? 0.7 : 1,
            }}
          >
            <PlayIcon />
            {startingPreset === RUN_PRESET_FRESH_LOW_ENGAGEMENT ? 'Подготавливаю свежие объявления...' : 'Свежие объявления: просмотры <= 6'}
          </button>
          </>
        ) : (
          <button
            onClick={handleStop}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '11px 28px', borderRadius: '10px', cursor: 'pointer',
              background: 'rgba(239,68,68,0.15)', border: '2px solid rgba(239,68,68,0.4)',
              color: '#fca5a5', fontSize: '15px', fontWeight: '700',
              transition: 'all 0.2s',
            }}
          >
            <StopIcon /> Остановить
          </button>
        )}

        <button
          onClick={handleSaveConfig}
          disabled={saving}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '11px 20px', borderRadius: '10px', cursor: saving ? 'wait' : 'pointer',
            background: '#0d1b2a', border: '1px solid #1e3a52',
            color: '#94a3b8', fontSize: '14px', fontWeight: '500',
            opacity: saving ? 0.6 : 1,
          }}
        >
          <SettingsIcon /> {saving ? 'Сохраняю...' : 'Сохранить настройки'}
        </button>

        <div style={{ marginLeft: 'auto', fontSize: '13px', color: '#475569', minWidth: '240px' }}>
          {isRunning && (
            <span style={{ color: '#00b894', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#00b894', boxShadow: '0 0 6px #00b894', animation: 'pulse 1.5s infinite' }} />
              Парсер работает...
            </span>
          )}
          {!isRunning && <span>Режим: {parseScopeLabel}</span>}
        </div>
      </div>

      {/* ── Live Console ── */}
      <div style={{
        background: '#050e1a',
        borderRadius: '14px',
        border: '1px solid #0f2030',
        overflow: 'hidden',
      }}>
        {/* Console header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 18px',
          background: '#0a1628',
          borderBottom: '1px solid #0f2030',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* macOS-style dots */}
            <div style={{ display: 'flex', gap: '6px' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ef4444' }} />
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#f59e0b' }} />
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#22c55e' }} />
            </div>
            <span style={{ fontSize: '13px', color: '#475569', fontFamily: 'monospace' }}>
              encar-scraper — {logs.length} записей
            </span>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', color: '#475569' }}>
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={e => setAutoScroll(e.target.checked)}
                style={{ accentColor: '#00b894' }}
              />
              Автопрокрутка
            </label>
            <button
              onClick={clearLogs}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '4px 10px', borderRadius: '6px', cursor: 'pointer',
                background: 'transparent', border: '1px solid #1e3a52',
                color: '#475569', fontSize: '12px',
              }}
            >
              <ClearIcon /> Очистить
            </button>
          </div>
        </div>

        {/* Console body */}
        <div
          ref={logsRef}
          style={{
            height: '420px',
            overflowY: 'auto',
            padding: '12px 0',
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
            fontSize: '12.5px',
            lineHeight: '1.6',
          }}
        >
          {loading && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#475569' }}>
              Загрузка...
            </div>
          )}
          {!loading && logs.length === 0 && (
            <div style={{ padding: '60px', textAlign: 'center', color: '#1e3a52' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>📋</div>
              <div>Консоль пуста. Запустите парсер чтобы увидеть логи.</div>
            </div>
          )}
          {logs.map((entry) => {
            const renderedMessage = formatLogMessage(entry.message)
            if (!renderedMessage) return null
            const c = LOG_COLORS[entry.level] || LOG_COLORS.info
            return (
              <div
                key={entry.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  padding: '3px 18px',
                  background: c.bg,
                  borderLeft: entry.level !== 'info' ? `2px solid ${c.dot}` : '2px solid transparent',
                }}
              >
                <span style={{ color: '#334155', minWidth: '70px', flexShrink: 0, fontSize: '11px', paddingTop: '2px' }}>
                  {formatTs(entry.ts)}
                </span>
                <span style={{
                  display: 'inline-block', width: '6px', height: '6px',
                  borderRadius: '50%', background: c.dot,
                  marginTop: '6px', flexShrink: 0,
                }} />
                <span style={{ color: c.text, wordBreak: 'break-word' }}>
                  {renderedMessage}
                  {renderDiagnosticMeta(entry.meta)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* CSS animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: #050e1a; }
        ::-webkit-scrollbar-thumb { background: #1e3a52; border-radius: 99px; }
        ::-webkit-scrollbar-thumb:hover { background: #00b894; }
      `}</style>
    </div>
  )
}

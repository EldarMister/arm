import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { applyVehicleTitleFixes } from '../../shared/vehicleTextFixes.js'
import { sanitizeVin } from '../../shared/vin.js'
import { useRef } from 'react'
import {
  appendDisplayTrimSuffix,
  VAT_REFUND_RATE,
  extractTrimLabelFromTitle,
  getShortLocationLabel,
  isWeakBodyTypeLabel,
  isWeakColorValue,
  normalizeColorLabel as normalizeVehicleColorLabel,
  normalizeInteriorColorLabel,
  normalizeKeyInfoLabel,
  normalizeTrimLabel,
  resolveDisplayBodyTypeLabel,
  resolveVehicleClassLabelForDisplay,
  stripTrailingTrimLabel,
} from '../lib/vehicleDisplay'
import {
  CUSTOMS_DIRECTION_OPTIONS,
  CUSTOMS_FUEL_OPTIONS,
  getCustomsFuelLabel,
  resolveCustomsCalculation,
  resolveCustomsCalculationKz,
} from '../lib/customsTariffs.js'
import { CAR_SECTION_CONFIG } from '../lib/catalogSections.js'
import DeliveryCountrySelect from '../components/shared/DeliveryCountrySelect.jsx'
import { useDeliveryContext } from '../context/DeliveryContext.jsx'
import { resolveDeliveryForCar } from '../lib/delivery.js'

const VAT_REFUND_PERCENT = Math.round(VAT_REFUND_RATE * 100)

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

const CalendarSmallIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect x="3" y="4.5" width="18" height="16" rx="2.5" strokeWidth={2} />
    <path d="M8 2.5v4M16 2.5v4M3 9.5h18" strokeWidth={2} strokeLinecap="round" />
  </svg>
)

const MoneySmallIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M12 3v18M16.5 7.5c0-1.9-2-3.5-4.5-3.5S7.5 5.6 7.5 7.5 9.5 11 12 11s4.5 1.6 4.5 3.5S14.5 18 12 18s-4.5-1.6-4.5-3.5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const CarSmallIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M5 16l1.2-5.2A2 2 0 0 1 8.15 9h7.7a2 2 0 0 1 1.95 1.8L19 16" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 16h16v2a2 2 0 0 1-2 2h-1v-2H7v2H6a2 2 0 0 1-2-2v-2z" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="7.5" cy="16.5" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="16.5" cy="16.5" r="1.2" fill="currentColor" stroke="none" />
  </svg>
)

const WarningSmallIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M12 3.5l8.1 14a2 2 0 0 1-1.73 3H5.63a2 2 0 0 1-1.73-3l8.1-14a2 2 0 0 1 3.46 0z" strokeWidth={2} strokeLinejoin="round" />
    <path d="M12 9v4.5M12 17h.01" strokeWidth={2} strokeLinecap="round" />
  </svg>
)

const DocumentSmallIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" strokeWidth={2} strokeLinejoin="round" />
    <path d="M14 3v5h5M9 12h6M9 16h6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const HashSmallIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M9 3L7 21M17 3l-2 18M4 9h17M3 15h17" strokeWidth={2} strokeLinecap="round" />
  </svg>
)

const CogSmallIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 1 0 12 8.5z" strokeWidth={2} />
    <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1.8 1.8 0 1 1-2.54 2.54l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.92V20a1.8 1.8 0 1 1-3.6 0v-.15a1 1 0 0 0-.67-.95 1 1 0 0 0-1.08.23l-.1.1a1.8 1.8 0 1 1-2.54-2.54l.1-.1a1 1 0 0 0 .23-1.08 1 1 0 0 0-.95-.67H4a1.8 1.8 0 1 1 0-3.6h.15a1 1 0 0 0 .95-.67 1 1 0 0 0-.23-1.08l-.1-.1A1.8 1.8 0 0 1 7.3 4.81l.1.1a1 1 0 0 0 1.08.23 1 1 0 0 0 .67-.95V4a1.8 1.8 0 1 1 3.6 0v.15a1 1 0 0 0 .67.95 1 1 0 0 0 1.08-.23l.1-.1a1.8 1.8 0 1 1 2.54 2.54l-.1.1a1 1 0 0 0-.23 1.08 1 1 0 0 0 .95.67H20a1.8 1.8 0 1 1 0 3.6h-.15a1 1 0 0 0-.45 1.84z" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const ShieldSmallIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M12 3.5 5 6.5v5.9c0 4.2 2.9 8 7 9.1 4.1-1.1 7-4.9 7-9.1V6.5l-7-3z" strokeWidth={2} strokeLinejoin="round" />
  </svg>
)

const ChevronDownSmallIcon = () => (
  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <polyline points="6 9 12 15 18 9" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const CheckSmallIcon = () => (
  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <polyline points="20 6 9 17 4 12" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

function CustomsDropdown({ label, ariaLabel, value, options, onChange }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const activeOption = useMemo(
    () => options.find((option) => option.value === value) || options[0] || null,
    [options, value]
  )

  useEffect(() => {
    if (!open) return undefined

    const handlePointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <label className="car-details-customs-select-field">
      <span>{label}</span>
      <div className={`car-details-customs-dropdown${open ? ' is-open' : ''}`} ref={rootRef}>
        <button
          type="button"
          className="car-details-customs-dropdown-trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="car-details-customs-dropdown-trigger-content">
            {activeOption?.flag ? (
              <span className="car-details-customs-dropdown-badge" aria-hidden="true">{activeOption.flag}</span>
            ) : null}
            <span className="car-details-customs-dropdown-trigger-label">{activeOption?.label || ''}</span>
          </span>
          <span className="car-details-customs-dropdown-trigger-icon" aria-hidden="true">
            <ChevronDownSmallIcon />
          </span>
        </button>
        {open && (
          <div className="car-details-customs-dropdown-menu" role="listbox" aria-label={ariaLabel}>
            {options.map((option) => {
              const isActive = option.value === value
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  className={`car-details-customs-dropdown-option${isActive ? ' is-active' : ''}`}
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                >
                  <span className="car-details-customs-dropdown-option-check" aria-hidden="true">
                    {isActive ? <CheckSmallIcon /> : null}
                  </span>
                  {option.flag ? (
                    <span className="car-details-customs-dropdown-badge" aria-hidden="true">{option.flag}</span>
                  ) : null}
                  <span className="car-details-customs-dropdown-option-label">{option.label}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </label>
  )
}

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

function resolveEngineLiters({ displacement, name, model }) {
  const cc = Number(displacement) || 0
  if (cc >= 600) return Number((cc / 1000).toFixed(1))
  return inferEngineLiters(name || model)
}

function detectFuel(car) {
  const explicit = String(car.fuel_type || '').toLowerCase()
  const tags = Array.isArray(car.tags) ? car.tags.join(' ').toLowerCase() : ''
  const mixed = `${explicit} ${tags}`
  if (mixed.includes('гибрид') || mixed.includes('hybrid') || mixed.includes('hev') || mixed.includes('phev') || mixed.includes('하이브리드')) return 'hybrid'
  if (mixed.includes('дизел') || mixed.includes('diesel') || mixed.includes('디젤')) return 'diesel'
  if (mixed.includes('электро') || mixed.includes('electric') || mixed.includes('전기')) return 'electric'
  if (mixed.includes('газ') || mixed.includes('lpg')) return 'lpg'
  return 'gasoline'
}

function normalizeCustomsFuel(value) {
  return CUSTOMS_FUEL_OPTIONS.some((option) => option.value === value) ? value : 'gasoline'
}

const DEFAULT_CALC_YEAR = new Date().getFullYear()
const DEFAULT_CALC_ENGINE = 2.0

function formatCalcYearInput(value) {
  const year = parseYear(value)
  return year ? String(year) : ''
}

function formatCalcEngineInput(value) {
  const engine = Number(value)
  if (!Number.isFinite(engine) || engine <= 0) return String(DEFAULT_CALC_ENGINE)
  return String(engine).replace(/\.0$/, '')
}

function sanitizeYearInput(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 4)
}

function sanitizeEngineInput(value) {
  const source = String(value || '').replace(/[^\d.,]/g, '')
  let separatorSeen = false
  let out = ''

  for (const char of source) {
    if (/\d/.test(char)) {
      out += char
      continue
    }

    if ((char === '.' || char === ',') && !separatorSeen) {
      out += char
      separatorSeen = true
    }
  }

  return out
}

function sanitizeCustomsValueInput(value) {
  return sanitizeEngineInput(value)
}

function parseCalcYearInput(value, fallback = DEFAULT_CALC_YEAR) {
  const digits = sanitizeYearInput(value)
  if (digits.length !== 4) return fallback

  const year = Number(digits)
  return Number.isFinite(year) && year >= 1900 && year <= DEFAULT_CALC_YEAR + 1
    ? year
    : fallback
}

function parseCalcEngineInput(value, fallback = DEFAULT_CALC_ENGINE) {
  const normalized = sanitizeEngineInput(value).replace(',', '.')
  if (!normalized || normalized === '.') return fallback

  const engine = Number(normalized)
  return Number.isFinite(engine) && engine > 0 ? engine : fallback
}

function isPremiumVehicle(source) {
  return /premium|прем/i.test(String(source?.vehicleClass || source?.vehicle_class || ''))
}

function inferImportDirection(...sources) {
  const text = sources
    .flatMap((source) => ([
      source?.location,
      source?.name,
      source?.model,
      source?.encarUrl,
      source?.inspection?.sourceUrl,
    ]))
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (/(?:^|\W)(?:usa|u\.s\.a|united states|сша|америк|american)(?:$|\W)/i.test(text)) return 'usa'
  if (/(?:^|\W)(?:japan|япони|jdm)(?:$|\W)/i.test(text)) return 'japan'
  if (/(?:encar|korea|коре|china|китай|seoul|busan|incheon|сеул|пусан|инчхон)/i.test(text)) return 'asia'
  return 'asia'
}

function resolveDefaultCalcEngineValue({ displacement, name, model }) {
  const cc = Number(displacement) || 0
  if (cc >= 600) return Math.round(cc)
  return resolveEngineLiters({ displacement, name, model }) || DEFAULT_CALC_ENGINE
}

function formatDate(value) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('ru-RU')
}

function getLegalStatusLabel(condition) {
  if (!condition || !Object.keys(condition).length) return '-'

  const seizingCount = Number(condition.seizingCount || 0)
  const pledgeCount = Number(condition.pledgeCount || 0)
  const parts = []

  parts.push(pledgeCount > 0 ? `Есть залог: ${pledgeCount}` : 'Без залога')
  parts.push(seizingCount > 0 ? `Есть арест / ограничения: ${seizingCount}` : 'Без ареста')

  return parts.join(', ')
}

function getAccidentHistoryLabel(condition) {
  if (!condition || !Object.keys(condition).length) return '-'
  if (condition.accidentRecordView || condition.accidentResumeView) return 'Есть запись в истории Encar'
  return 'Записей не найдено'
}

function formatCountLabel(value, emptyLabel) {
  const count = Number(value || 0)
  if (!Number.isFinite(count) || count <= 0) return emptyLabel
  return `Количество: ${count}`
}

const INSPECTION_RU_MAP = {
  'Inspection and diagnostics': 'Инспекция и диагностика',
  'Inspection photos': 'Фотографии инспекции',
  'Overall condition': 'Общее состояние',
  'Repair history': 'История ремонтов',
  'Body and frame inspection': 'Проверка кузова и силового каркаса',
  'Detailed technical check': 'Детальная техническая проверка',
  'Inspector comments': 'Комментарии инспектора',
  'Signatures and confirmation': 'Подписи и подтверждение',
  'Open in Encar': 'Открыть в Encar',
  'Open inspection': 'Открыть инспекцию',
  'Report date': 'Дата отчета',
  'Photo': 'Фото',
  'Diagnosis Encar: available.': 'Диагностика Encar: доступна.',
  'Diagnosis Encar: limited.': 'Диагностика Encar: ограничена.',
  'Views': 'Просмотры',
  'Subscribers': 'Подписчики',
  'Full Encar inspection report is not available for this car right now.': 'Полный отчет инспекции Encar сейчас недоступен для этого автомобиля.',
  'Нет': 'Нет',
  'Есть': 'Есть',
  'Нормально': 'Нормально',
  'Нормальный': 'Нормально',
  'Не применяется': 'Не применяется',
  'Неисправно': 'Неисправно',
  'Незначительная течь': 'Незначительная течь',
  'Утечка': 'Утечка',
  'Течь': 'Течь',
  'Разрешено': 'Разрешено',
  'Высокий': 'Высокий',
  'Низкий': 'Низкий',
  'Нейтральный': 'Нейтральный',
  'Цветной': 'Цветной',
  '한국자동차진단보증협회김기웅 (인)': 'Корейская ассоциация диагностики автомобилей: Ким Ки Ун',
  '주식회사 케이아우토 (인)': 'K-Auto Co., Ltd.',
  '고전원 전기장치': 'Высоковольтная электросистема',
  '충전구 절연 상태': 'Состояние изоляции зарядного порта',
  '구동축전지 격리 상태': 'Состояние изоляции тяговой батареи',
  '고전원전기배선 상태(접속단자, 피복, 보호기구)': 'Состояние высоковольтной проводки (клеммы, изоляция, защита)',
  '타이로드엔드 및 볼 조인트': 'Наконечники рулевых тяг и шаровые опоры',
  '타이로드 엔드 및 볼 조인트': 'Наконечники рулевых тяг и шаровые опоры',
  '타이로드엔드 & 볼 조인트': 'Наконечники рулевых тяг и шаровые опоры',
}

function formatInspectionDate(value) {
  const text = String(value || '').trim()
  if (!text) return '-'

  const ko = text.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/)
  if (ko) {
    const [, year, month, day] = ko
    return `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`
  }

  return text
}

function formatInspectionDateRange(value) {
  const text = String(value || '').trim()
  if (!text) return '-'

  const matches = [...text.matchAll(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/g)]
  if (!matches.length) return text
  if (matches.length === 1) return formatInspectionDate(matches[0][0])

  return `${formatInspectionDate(matches[0][0])} - ${formatInspectionDate(matches[1][0])}`
}

function normalizeInspectionValue(value) {
  const text = String(value || '').trim()
  if (!text) return '-'

  if (/\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일/.test(text)) {
    return formatInspectionDateRange(text)
  }

  if (/^\uBCF4\uD5D8\uC0AC\uBCF4\uC99D$/u.test(text)) return 'Страховая гарантия'
  if (/^\uC81C\uC870\uC0AC\uBCF4\uC99D$/u.test(text)) return 'Гарантия производителя'
  if (/^\uC624\uD1A0$/u.test(text)) return 'Автомат'
  if (/^\uC218\uB3D9$/u.test(text)) return 'Механика'
  if (/^\uB514\uC824$/u.test(text)) return 'Дизель'
  if (/^\uAC00\uC194\uB9B0$/u.test(text)) return 'Бензин'
  if (/^\uC804\uAE30$/u.test(text)) return 'Электро'
  if (/^\uD558\uC774\uBE0C\uB9AC\uB4DC$/u.test(text)) return 'Гибрид'
  if (/^\uC788\uC74C$/u.test(text)) return 'Есть'
  if (/^\uC5C6\uC74C$/u.test(text)) return 'Нет'
  if (/^\uD574\uB2F9\uC5C6\uC74C$/u.test(text)) return 'Не применяется'
  if (/^\uC774\uD589$/u.test(text)) return 'Выполнен'

  return text
}

function getInspectionBasicValue(inspection, label) {
  const items = Array.isArray(inspection?.basicInfo?.items) ? inspection.basicInfo.items : []
  const match = items.find((item) => item?.label === label)
  return normalizeInspectionValue(match?.value || '')
}

function getInspectionSummaryText(inspection, label) {
  const rows = Array.isArray(inspection?.summary) ? inspection.summary : []
  const row = rows.find((item) => item?.label === label)
  if (!row) return '-'

  const parts = [
    ...(Array.isArray(row.states) ? row.states : []).map(normalizeInspectionValue),
    normalizeInspectionValue(row.detail || ''),
    normalizeInspectionValue(row.note || ''),
  ]
    .filter(Boolean)
    .filter((item) => item !== '-')

  return parts.length ? parts.join(', ') : '-'
}

function getDiagnosisLabel(flags) {
  if (!flags || !Object.keys(flags).length) return '-'
  return flags.diagnosis ? 'Доступна' : 'Нет'
}

function getReregistrationLabel(manage) {
  if (!manage || typeof manage.reRegistered !== 'boolean') return '-'
  return manage.reRegistered ? 'Да' : 'Нет'
}

function getInspectionReportDate(inspection) {
  const signatureDate = inspection?.signatures?.date || ''
  if (signatureDate) return formatInspectionDate(signatureDate)
  const certificateDate = inspection?.basicInfo?.certificate || ''
  return certificateDate ? formatInspectionDate(certificateDate) : '-'
}

function formatInspectionSupplement(value) {
  const normalized = normalizeInspectionValue(value)
  if (!normalized || normalized === '-') return ''
  return translateInspectionText(normalized) || normalized
}

function buildInspectionMetaLines(item, primaryValue) {
  const lines = []
  const primary = String(primaryValue || '').trim()
  const detail = formatInspectionSupplement(item?.detail || '')
  const amount = formatInspectionSupplement(item?.amount || '')
  const note = formatInspectionSupplement(item?.note || '')

  if (detail && detail !== primary) lines.push(detail)
  if (amount) lines.push(`Оценка: ${amount}`)
  if (note) lines.push(`Примечание: ${note}`)

  return [...new Set(lines)]
}

function buildEncarFlagBadges(car) {
  const flags = car?.detailFlags || {}
  const badges = []

  if (flags.diagnosis) badges.push({ key: 'diagnosis', label: 'Диагностика Encar', tone: 'blue' })
  if (flags.hasEvBatteryInfo) badges.push({ key: 'ev-battery', label: 'Данные по EV-батарее', tone: 'teal' })
  if (flags.meetGo) badges.push({ key: 'meetgo', label: 'Encar MeetGo', tone: 'green' })
  if (flags.isPartneredVehicle) badges.push({ key: 'partnered', label: 'Партнерский лот', tone: 'amber' })

  return badges
}

function buildInspectionPhotoMeta(photo, index) {
  const parts = [`Фото инспекции #${index + 1}`]
  if (photo?.label) {
    const translated = translateInspectionText(photo.label)
    if (translated && translated !== `Фото ${index + 1}`) parts.unshift(translated)
  }
  return parts.filter(Boolean).join(' • ')
}

function hasHistoryDisplayValue(value) {
  return value !== null && value !== undefined && value !== '' && value !== '-' && value !== 'вЂ”'
}

function formatHistoryNumber(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return '-'
  return parsed.toLocaleString('ru-RU')
}

function formatHistoryWon(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return '-'
  return `${parsed.toLocaleString('ru-RU')} ₩`
}

function getHistoryExchangeRate(car) {
  const parsed = Number(car?.exchangeRateSite) || Number(car?.exchangeRateCurrent) || 0
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function formatHistoryUsdApprox(value, exchangeRate) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0 || !exchangeRate) return ''
  return `~ $${Math.round(parsed / exchangeRate).toLocaleString('en-US')}`
}

function getHistoryTone(key) {
  if (['atFaultCount', 'atFaultDamage', 'thefts', 'totalLoss'].includes(key)) return 'danger'
  if (['notAtFaultCount', 'notAtFaultDamage'].includes(key)) return 'info'
  if (key === 'openData') return 'success'
  return 'neutral'
}

function getHistoryIcon(kind) {
  if (kind === 'calendar') return <CalendarSmallIcon />
  if (kind === 'money') return <MoneySmallIcon />
  if (kind === 'car') return <CarSmallIcon />
  if (kind === 'warning') return <WarningSmallIcon />
  if (kind === 'document') return <DocumentSmallIcon />
  if (kind === 'hash') return <HashSmallIcon />
  if (kind === 'gear') return <CogSmallIcon />
  return <DocumentSmallIcon />
}

function estimateAccidentSeverity(item) {
  const total = ['insuranceBenefit', 'partCost', 'laborCost', 'paintingCost']
    .map((key) => Number(item?.[key]) || 0)
    .reduce((sum, value) => sum + value, 0)

  if (total >= 5000000) return { label: 'Крупная', tone: 'danger' }
  if (total >= 2000000) return { label: 'Средняя', tone: 'info' }
  return { label: 'Небольшая', tone: 'neutral' }
}

function getVehicleHistory(car) {
  return car?.inspection?.vehicleHistory || null
}

function buildVehicleHistoryStatistics(car) {
  const history = getVehicleHistory(car)
  const stats = history?.statistics || {}
  const exchangeRate = getHistoryExchangeRate(car)

  const entries = [
    { key: 'accidents', label: 'Аварии', value: stats.accidents },
    { key: 'totalLoss', label: 'Тотальная потеря', value: stats.totalLoss },
    { key: 'ownerChanges', label: 'Смены владельцев', value: stats.ownerChanges },
    { key: 'numberChanges', label: 'Смены номеров', value: stats.numberChanges },
    { key: 'atFaultCount', label: 'По моей вине', value: stats.atFaultCount },
    { key: 'atFaultDamage', label: 'Ущерб (моя вина)', value: stats.atFaultDamage, type: 'money' },
    { key: 'notAtFaultCount', label: 'Не по моей вине', value: stats.notAtFaultCount },
    { key: 'notAtFaultDamage', label: 'Ущерб (чужая вина)', value: stats.notAtFaultDamage, type: 'money' },
    { key: 'thefts', label: 'Кражи', value: stats.thefts },
  ]
    .filter((entry) => entry.value !== null && entry.value !== undefined)
    .map((entry) => ({
      key: entry.key,
      label: entry.label,
      tone: getHistoryTone(entry.key),
      value: entry.type === 'money' ? formatHistoryWon(entry.value) : formatHistoryNumber(entry.value),
      secondary: entry.type === 'money' ? formatHistoryUsdApprox(entry.value, exchangeRate) : '',
    }))
    .filter((entry) => hasHistoryDisplayValue(entry.value))

  const order = new Map([
    ['accidents', 0],
    ['totalLoss', 1],
    ['ownerChanges', 2],
    ['numberChanges', 3],
    ['atFaultCount', 4],
    ['atFaultDamage', 5],
    ['notAtFaultCount', 6],
    ['notAtFaultDamage', 7],
    ['thefts', 8],
  ])

  return entries.sort((left, right) => (order.get(left.key) ?? 999) - (order.get(right.key) ?? 999))
}

function buildVehicleHistoryHighlightCards(car) {
  const history = getVehicleHistory(car)
  const overview = history?.overview || {}
  const stats = history?.statistics || {}
  const exchangeRate = getHistoryExchangeRate(car)

  return [
    {
      key: 'vehicleNo',
      label: 'Номер автомобиля',
      value: overview.vehicleNo || car?.vehicleNo || '-',
      icon: 'hash',
      tone: 'neutral',
    },
    {
      key: 'loans',
      label: 'Займ',
      value: overview.loans !== undefined && overview.loans !== null ? formatHistoryNumber(overview.loans) : '-',
      icon: 'money',
      tone: 'neutral',
    },
    {
      key: 'businessUse',
      label: 'Бизнес',
      value: overview.businessUse !== undefined && overview.businessUse !== null ? formatHistoryNumber(overview.businessUse) : '-',
      icon: 'car',
      tone: 'neutral',
    },
    {
      key: 'registrationDate',
      label: 'Дата регистрации',
      value: overview.registrationDate ? formatDate(overview.registrationDate) : '-',
      icon: 'calendar',
      tone: 'neutral',
    },
    {
      key: 'openData',
      label: 'Открытые данные',
      value: overview.openData || '-',
      icon: 'document',
      tone: getHistoryTone('openData'),
    },
    {
      key: 'thefts',
      label: 'Количество краж',
      value: stats.thefts !== undefined && stats.thefts !== null ? formatHistoryNumber(stats.thefts) : '-',
      icon: 'warning',
      tone: 'danger',
    },
    {
      key: 'governmentUse',
      label: 'Государственный',
      value: overview.governmentUse !== undefined && overview.governmentUse !== null ? formatHistoryNumber(overview.governmentUse) : '-',
      icon: 'car',
      tone: 'neutral',
    },
    {
      key: 'notAtFaultCount',
      label: 'Аварии не по моей вине',
      value: stats.notAtFaultCount !== undefined && stats.notAtFaultCount !== null ? formatHistoryNumber(stats.notAtFaultCount) : '-',
      icon: 'warning',
      tone: 'info',
    },
    {
      key: 'notAtFaultDamage',
      label: 'Ущерб (чужая вина)',
      value: stats.notAtFaultDamage !== undefined && stats.notAtFaultDamage !== null ? formatHistoryWon(stats.notAtFaultDamage) : '-',
      secondary: stats.notAtFaultDamage ? formatHistoryUsdApprox(stats.notAtFaultDamage, exchangeRate) : '',
      icon: 'money',
      tone: 'info',
    },
    {
      key: 'engineDisplacement',
      label: 'Объем двигателя',
      value: overview.engineDisplacement
        ? formatHistoryNumber(overview.engineDisplacement)
        : (car?.displacement ? formatHistoryNumber(car.displacement) : '-'),
      icon: 'gear',
      tone: 'neutral',
    },
    {
      key: 'firstRegistration',
      label: 'Первая регистрация',
      value: overview.firstRegistration ? formatDate(overview.firstRegistration) : '-',
      icon: 'calendar',
      tone: 'neutral',
    },
  ].filter((entry) => hasHistoryDisplayValue(entry.value))
}

function buildVehicleHistorySecondaryEntries(car) {
  const hiddenLabels = new Set([
    'Номер автомобиля',
    'Займ',
    'Бизнес',
    'Дата регистрации',
    'Открытые данные',
    'Государственный',
    'Объем двигателя',
    'Первая регистрация',
  ])

  return buildRegistrationHistoryEntries(car).filter((entry) => !hiddenLabels.has(entry.label))
}

function buildVehicleHistoryAccidentCards(car) {
  const history = getVehicleHistory(car)
  const details = Array.isArray(history?.accidentDetails) ? history.accidentDetails : []
  const exchangeRate = getHistoryExchangeRate(car)

  return details.map((item, index) => {
    const severity = estimateAccidentSeverity(item)
    return {
      key: `${item?.index || index + 1}-${item?.date || 'na'}`,
      title: `Авария ${item?.index || index + 1}`,
      date: item?.date ? formatDate(item.date) : '-',
      severity,
      metrics: [
        {
          key: 'partCost',
          label: 'Запчасти',
          value: formatHistoryWon(item?.partCost),
          secondary: formatHistoryUsdApprox(item?.partCost, exchangeRate),
        },
        {
          key: 'laborCost',
          label: 'Работа',
          value: formatHistoryWon(item?.laborCost),
          secondary: formatHistoryUsdApprox(item?.laborCost, exchangeRate),
        },
        {
          key: 'paintingCost',
          label: 'Покраска',
          value: formatHistoryWon(item?.paintingCost),
          secondary: formatHistoryUsdApprox(item?.paintingCost, exchangeRate),
        },
        {
          key: 'insuranceBenefit',
          label: 'Страховая выплата',
          value: formatHistoryWon(item?.insuranceBenefit),
          secondary: formatHistoryUsdApprox(item?.insuranceBenefit, exchangeRate),
          accent: 'positive',
        },
      ].filter((metric) => hasHistoryDisplayValue(metric.value) && metric.value !== '-'),
    }
  }).filter((entry) => entry.metrics.length > 0)
}

function buildVehicleHistoryInfoChanges(car) {
  const history = getVehicleHistory(car)
  const changes = Array.isArray(history?.numberChangeHistory) ? history.numberChangeHistory : []

  return changes
    .map((item, index) => ({
      key: `${item?.index || index + 1}-${item?.date || 'na'}`,
      label: `Изменение ${item?.index || index + 1}`,
      value: item?.carNo ? `Номер: ${item.carNo}` : 'Изменение номера',
      date: item?.date ? formatDate(item.date) : '-',
    }))
    .filter((entry) => hasHistoryDisplayValue(entry.value))
}

function buildVehicleHistoryUninsuredPeriods(car) {
  const history = getVehicleHistory(car)
  const periods = Array.isArray(history?.uninsuredPeriods) ? history.uninsuredPeriods : []

  return periods
    .map((item, index) => ({
      label: `Период ${item?.index || index + 1}`,
      value: item?.raw || [item?.start, item?.end].filter(Boolean).join('~'),
    }))
    .filter((item) => hasHistoryDisplayValue(item.value))
}

function buildVehicleHistoryOwnerChanges(car) {
  const history = getVehicleHistory(car)
  const changes = Array.isArray(history?.ownerChanges) ? history.ownerChanges : []

  return changes
    .map((item, index) => ({
      label: `Смена владельца ${item?.index || index + 1}`,
      value: item?.date ? formatDate(item.date) : item?.rawDate || '-',
    }))
    .filter((item) => hasHistoryDisplayValue(item.value))
}

function UNUSEDBuildVehicleHistoryNumberChanges(car) {
  const history = getVehicleHistory(car)
  const changes = Array.isArray(history?.numberChangeHistory) ? history.numberChangeHistory : []

  return changes
    .map((item, index) => ({
      label: `Смена номера ${item?.index || index + 1}`,
      value: [item?.carNo, item?.date ? formatDate(item.date) : ''].filter(Boolean).join(' — '),
    }))
    .filter((item) => hasHistoryDisplayValue(item.value))
}

function buildRegistrationHistoryEntries(car) {
  const inspection = car?.inspection
  const manage = car?.detailManage || {}
  const history = getVehicleHistory(car)
  const overview = history?.overview || {}

  const entries = [
    { label: 'Год', value: overview.year || car?.year || '-' },
    { label: 'Дата регистрации', value: overview.registrationDate ? formatDate(overview.registrationDate) : '-' },
    { label: 'Первая регистрация', value: overview.firstRegistration ? formatDate(overview.firstRegistration) : getInspectionBasicValue(inspection, 'Первая регистрация') },
    { label: 'Номер автомобиля', value: overview.vehicleNo || car?.vehicleNo || '—' },
    { label: 'VIN', value: car?.vin || '—' },
    { label: 'Открытые данные', value: overview.openData || '-' },
    { label: 'Займ', value: overview.loans !== undefined && overview.loans !== null ? formatHistoryNumber(overview.loans) : '-' },
    { label: 'Бизнес', value: overview.businessUse !== undefined && overview.businessUse !== null ? formatHistoryNumber(overview.businessUse) : '-' },
    { label: 'Государственный', value: overview.governmentUse !== undefined && overview.governmentUse !== null ? formatHistoryNumber(overview.governmentUse) : '-' },
    { label: 'Объем двигателя', value: overview.engineDisplacement ? formatHistoryNumber(overview.engineDisplacement) : '-' },
    { label: 'Срок осмотра', value: getInspectionBasicValue(inspection, 'Срок действия осмотра') },
    { label: 'Тип гарантии', value: getInspectionBasicValue(inspection, 'Тип гарантии') },
    { label: 'Дата отчета', value: getInspectionReportDate(inspection) },
    { label: 'Перерегистрация', value: getReregistrationLabel(manage) },
    { label: 'Состояние одометра', value: getInspectionSummaryText(inspection, 'Состояние одометра') },
    { label: 'Пробег по отчёту', value: getInspectionSummaryText(inspection, 'Пробег') },
    { label: 'Маркировка VIN', value: getInspectionSummaryText(inspection, 'Маркировка VIN') },
    { label: 'Диагностика Encar', value: getDiagnosisLabel(car?.detailFlags) },
    { label: 'На Encar с', value: formatDate(manage.firstAdvertisedDateTime || car?.createdAt) },
    { label: 'Обновлено на Encar', value: formatDate(manage.modifyDateTime || car?.updatedAt) },
    { label: 'Просмотры', value: Number.isFinite(Number(manage.viewCount)) ? String(Number(manage.viewCount)) : '-' },
    { label: 'Подписчики', value: Number.isFinite(Number(manage.subscribeCount)) ? String(Number(manage.subscribeCount)) : '-' },
  ]

  return entries.filter((entry) => hasHistoryDisplayValue(entry.value))
}

function buildAccidentHistoryEntries(car) {
  const inspection = car?.inspection
  const condition = car?.detailCondition || {}

  const entries = [
    { label: 'Записи в истории Encar', value: getAccidentHistoryLabel(condition) },
    { label: 'Подробная запись', value: condition.accidentResumeView ? 'Доступна' : 'Нет' },
    { label: 'Залог', value: formatCountLabel(condition.pledgeCount, 'Без залога') },
    { label: 'Арест / ограничения', value: formatCountLabel(condition.seizingCount, 'Без ограничений') },
    { label: 'Юридический статус', value: getLegalStatusLabel(condition) },
    { label: 'Особая история', value: getInspectionSummaryText(inspection, 'Особая история') },
    { label: 'Изменение назначения', value: getInspectionSummaryText(inspection, 'Изменение назначения') },
    { label: 'Под отзыв', value: getInspectionSummaryText(inspection, 'Под отзыв') },
    { label: 'Маркировка VIN', value: getInspectionSummaryText(inspection, 'Маркировка VIN') },
    { label: 'Состояние одометра', value: getInspectionSummaryText(inspection, 'Состояние одометра') },
    { label: 'Тип окраса', value: getInspectionSummaryText(inspection, 'Тип окраса') },
  ]

  return entries.filter((entry) => hasHistoryDisplayValue(entry.value))
}

function buildRepairHistoryItems(car) {
  const rows = Array.isArray(car?.inspection?.repairHistory) ? car.inspection.repairHistory : []
  return rows
    .map((item) => ({
      label: translateInspectionText(item?.label || '-'),
      value: translateInspectionText(item?.value || '-'),
    }))
    .filter((item) => item.label && item.label !== '-' && item.value && item.value !== '-')
}

function getInspectionStatusTone(value) {
  const text = normalizeInspectionValue(translateInspectionText(value || '') || String(value || ''))
    .toLowerCase()
    .trim()

  if (!text || text === '-') return 'neutral'
  if (/неисправ|опас|высок|ошиб|корроз/.test(text)) return 'danger'
  if (/замен|замена|ремонт|восстанов|окрас|покрас|перекрас|есть запись|есть\b/.test(text)) return 'info'
  if (/течь|утеч|незнач|залог|арест|огранич|колич|под отзыв|особая история/.test(text)) return 'warn'
  if (/нормал|исправ|без\b|нет\b|доступн|выполнен|разрешен|нейтрал|цветной|не применяется/.test(text)) return 'good'
  return 'neutral'
}

function buildExteriorInspectionRows(section) {
  return (section?.ranks || []).flatMap((rank, rankIndex) => {
    const status = translateInspectionText(rank?.rank || '-') || '-'
    const items = Array.isArray(rank?.items) && rank.items.length ? rank.items : []

    return items
      .map((item, itemIndex) => ({
        key: `${section?.title || 'section'}-${rankIndex}-${itemIndex}`,
        label: translateInspectionText(item || '-'),
        value: status,
      }))
      .filter((row) => row.label && row.label !== '-')
  })
}

function InspectionStatusRow({ label, value, metaLines = [] }) {
  const tone = getInspectionStatusTone(value)
  const details = Array.isArray(metaLines) ? metaLines.filter(Boolean) : []

  return (
    <div className="car-inspection-status-row">
      <div className="car-inspection-status-main">
        <div className="car-inspection-status-label">{label || '-'}</div>
        {!!details.length && (
          <div className="car-inspection-status-meta">
            {details.map((line) => (
              <small key={line}>{line}</small>
            ))}
          </div>
        )}
      </div>
      <div className={`car-inspection-status-value car-inspection-status-value-${tone}`}>{value || '-'}</div>
    </div>
  )
}

function translateInspectionText(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (text === '-') return '-'
  if (INSPECTION_RU_MAP[text]) return INSPECTION_RU_MAP[text]
  if (/타이로드\s*엔드|타이로드엔드/u.test(text) && /볼\s*조인트/u.test(text)) {
    return 'Наконечники рулевых тяг и шаровые опоры'
  }

  if (/^Inspection\s+\d+$/i.test(text)) return `Инспекция ${text.match(/\d+/)?.[0] || ''}`.trim()
  if (/^Photo\s+\d+$/i.test(text)) return `Фото ${text.match(/\d+/)?.[0] || ''}`.trim()
  if (/^([A-Z]|\d+)\s*랭크$/i.test(text)) return `${text.replace(/랭크/gi, '').trim()} ранг`

  if (text === '없음') return 'Нет'
  if (text === '있음') return 'Есть'
  if (text === '정상' || text === '양호' || text === '보통' || text === '정상작동' || text === '정상동작') return 'Нормально'
  if (text === '불량') return 'Неисправно'
  if (text === '해당없음') return 'Не применяется'
  if (text === '미세누유' || text === '미세누수') return 'Незначительная течь'
  if (text === '누유' || text === '누수') return 'Утечка'
  if (/일산화탄소/u.test(text) && /탄화수소/u.test(text)) return 'Оксид углерода (CO), углеводороды (HC)'
  if (text === '일산화탄소') return 'Оксид углерода (CO)'
  if (text === '탄화수소') return 'Углеводороды (HC)'
  if (text === '전면') return 'Передняя часть'
  if (text === '후면') return 'Задняя часть'

  if (text.includes('비금속(FRP 플라스틱)의 탈부착 가능 부품은 점검사항에서 제외되며')) {
    return 'Съемные неметаллические детали, например из FRP-пластика, не входят в перечень проверки. Для подержанного автомобиля допустимы локальные кузовные работы, подкрасы и естественная коррозия из-за возраста.'
  }

  if (text.includes('본 차량의 진단 결과 외부 패널의 교환이 없는 차량입니다')) {
    return 'По результатам диагностики у этого автомобиля нет замененных внешних панелей. Съемные неметаллические детали не входят в проверку, а для подержанных авто возможны локальные ремонты, подкрасы и естественная коррозия.'
  }

  return text
}

function translateInspectorComment(value) {
  const text = String(value || '').trim()
  if (!text) return '-'

  const direct = translateInspectionText(text)
  if (direct && !hasHangulText(direct)) return direct

  const notes = []

  if (/보증\s*제외|보증제외/u.test(text)) {
    notes.push('Часть отмеченных повреждений относится к исключениям по гарантии.')
  }
  if (/비금속\s*부품|FRP|탈부착 가능 부품/u.test(text)) {
    notes.push('Неметаллические и съемные детали не входят в перечень инспекции Encar.')
  }
  if (/부분적인 부식|판금 도색|판금도색|중고차 특성상/u.test(text)) {
    notes.push('Для подержанного авто допустимы локальная коррозия, кузовной ремонт и подкрасы.')
  }
  if (/법에\s*의거\s*확인\s*요망|법에의거확인요망/u.test(text)) {
    notes.push('Нужна дополнительная проверка по документам и правилам.')
  }
  if (/점검내용과 정비이력이 상이 할 수 있음|점검내용과 정비이력이 상이할 수 있음/u.test(text)) {
    notes.push('Результаты осмотра могут отличаться от сервисной истории.')
  }
  if (/교환이 없는 차량입니다|교환이 없습니다/u.test(text)) {
    notes.push('По осмотру замены внешних кузовных панелей не выявлены.')
  }

  const phoneMatch = text.match(/(\d{4}-\d{4})/)
  if (/DB손해보험/u.test(text)) {
    notes.push(phoneMatch ? `Контакт DB Insurance: ${phoneMatch[1]}.` : 'Указан контакт DB Insurance.')
  }

  if (notes.length) return [...new Set(notes)].join(' ')
  return direct
}

function groupInspectionRows(rows) {
  const groups = new Map()
  for (const row of rows || []) {
    const key = row.section || 'Прочее'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }
  return [...groups.entries()].map(([title, items]) => ({ title, items }))
}

function hasHangulText(value) {
  return /[\uAC00-\uD7A3]/u.test(String(value || ''))
}

function shouldReplaceText(value) {
  const text = String(value || '').trim()
  return !text || text === '-' || hasHangulText(text)
}

function normalizeDisplayText(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (!hasHangulText(text)) return text
  return text.replace(/[\uAC00-\uD7A3]+/gu, ' ').replace(/\s+/g, ' ').trim()
}

const VEHICLE_NAME_FIXES = [
  [/\bgia\b/gi, 'Kia'],
  [/\bhyeondae\b/gi, 'Hyundai'],
  [/\bjenesiseu\b/gi, 'Genesis'],
  [/\bssoul\b/gi, 'Soul'],
  [/\bev\s+ev\b/gi, 'EV'],
  [/\(\s*sinhyeong\s*\)/gi, ''],
  [/\bsinhyeong\b/gi, ''],
  [/renault[-\s]*korea\s*\(\s*samseong\s*\)/gi, 'Renault Korea'],
  [/renault[-\s]*korea\s*samsung/gi, 'Renault Korea'],
  [/renault samsung/gi, 'Renault Korea'],
  [/kgmobilriti\s*\(\s*ssangyong\s*\)/gi, 'KG Mobility (SsangYong)'],
  [/kgmobilriti/gi, 'KG Mobility'],
  [/ssangyong/gi, 'SsangYong'],
  [/keuroseuobeo/gi, 'Crossover'],
  [/peulreoseu/gi, 'Plus'],
  [/rekseuteon/gi, 'Rexton'],
  [/seupocheu/gi, 'Sports'],
  [/kaeseupeo/gi, 'Casper'],
  [/aionik/gi, 'Ioniq'],
  [/geuraenjejo/gi, 'Grandeur'],
  [/geuraenjeo/gi, 'Grandeur'],
  [/mohabi/gi, 'Mohave'],
  [/santa[\s-]*fe/gi, 'Santafe'],
  [/ssonata/gi, 'Sonata'],
  [/\b([2-9])\s*sedae\b/gi, (_, n) => `${n}th Gen`],
]

const SUSPICIOUS_NAME_PATTERNS = [
  /^\((?:gm|sm|daewoo)\)\s*\d/i,
  /kgmobilriti/i,
  /rekseuteon/i,
  /seupocheu/i,
  /kaeseupeo/i,
  /geuraenjeo/i,
  /mohabi/i,
  /\b[2-9]\s*sedae\b/i,
]

const TITLE_MARKETING_PREFIXES = ['The New', 'All New', 'New Rise', 'The Bold']
const SPEC_ONLY_TITLE_TOKEN_RE = /^(?:l?\d+(?:\.\d+)?|[24]wd|awd|fwd|rwd|diesel|gasoline|lpg|hybrid|turbo|auto|automatic|manual|cvt|dct|at|mt)$/i
const LEGACY_RENAULT_SAMSUNG_MODEL_RE = /\b(?:sm3|sm5|sm6|sm7|qm3|qm5|qm6|xm3)\b/i

function stripVehicleTitleNoise(value) {
  let text = String(value || '').trim()
  if (!text) return ''

  const isLegacyRenaultSamsung = LEGACY_RENAULT_SAMSUNG_MODEL_RE.test(text)
  text = text
    .replace(
      /^(?:reunokoria|renault[-\s]*korea|renault\s*samsung)\s*\(?\s*(?:samseong|samsung)?\s*\)?\s*/gi,
      isLegacyRenaultSamsung ? 'Renault Samsung ' : ''
    )
    .replace(/\bRenault Korea\s*\((?:Samseong|Samsung)\)/gi, 'Renault Korea')
    .replace(/\b(KG Mobility)\s*\((?:SsangYong)\)/gi, '$1')

  if (isLegacyRenaultSamsung) {
    text = text
      .replace(/\bRenault Korea\b/gi, 'Renault Samsung')
      .replace(/\bRenault Samsung\s+Renault Samsung\b/gi, 'Renault Samsung')
  }

  const prefixGroup = TITLE_MARKETING_PREFIXES.map((item) => item.replace(/\s+/g, '\\s+')).join('|')
  const leadingMarketingRe = new RegExp(`^(?:${prefixGroup})\\s+`, 'i')
  const marketingAfterBrandRe = new RegExp(`^((?:[A-Z0-9][A-Za-z0-9&.+/-]*\\s+){0,3})(?:${prefixGroup})\\s+`, 'i')

  text = text.replace(leadingMarketingRe, '')
  text = text.replace(marketingAfterBrandRe, '$1')
  return text.replace(/\s+/g, ' ').trim()
}

function normalizeVehicleTitle(value) {
  let text = normalizeDisplayText(value)
  if (!text) return ''
  for (const [pattern, replacement] of VEHICLE_NAME_FIXES) {
    text = text.replace(pattern, replacement)
  }
  text = applyVehicleTitleFixes(text)
  text = stripVehicleTitleNoise(text)
  const signal = text.replace(/[\s()[\]{}\\/|+_.:-]+/g, '')
  if (!signal || !/[A-Za-zА-Яа-я0-9]/u.test(signal) || signal.length < 2) return ''
  return text
}

function isBrokenVehicleTitle(value) {
  const text = String(value || '').trim()
  if (!text) return true
  return !normalizeVehicleTitle(text)
}

function isSpecOnlyTitle(value) {
  const tokens = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (!tokens.length || tokens.length > 6) return false
  return tokens.every((token) => SPEC_ONLY_TITLE_TOKEN_RE.test(token))
}

function shouldUpgradeVehicleTitle(value) {
  const text = String(value || '').trim()
  if (shouldReplaceText(text)) return true
  if (isBrokenVehicleTitle(text)) return true
  if (isSpecOnlyTitle(text)) return true
  return SUSPICIOUS_NAME_PATTERNS.some((pattern) => pattern.test(text))
}

function normalizeTagLabel(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const low = text.toLowerCase()

  if (low.includes('diesel') || low.includes('дизел') || text.includes('\uB514\uC824')) return 'Дизель'
  if (low.includes('gasoline') || low.includes('бенз') || text.includes('\uAC00\uC194\uB9B0') || text.includes('\uD718\uBC1C\uC720')) return 'Бензин'
  if (low.includes('hybrid') || low.includes('гибрид') || text.includes('\uD558\uC774\uBE0C\uB9AC\uB4DC')) return 'Бензин (гибрид)'
  if (low.includes('electric') || low.includes('электро') || text.includes('\uC804\uAE30')) return 'Электро'
  if (low.includes('lpg') || low.includes('газ') || text.includes('\uC5D8\uD53C\uC9C0')) return 'Газ (LPG)'
  if (low.includes('auto') || low.includes('автомат') || text.includes('\uC624\uD1A0') || text.includes('\uC790\uB3D9')) return 'Автомат'
  if (low.includes('manual') || low.includes('механ') || text.includes('\uC218\uB3D9')) return 'Механика'
  if (low.includes('cvt')) return 'CVT'
  if (low.includes('dct') || low.includes('dual') || low.includes('робот')) return 'Робот'

  return hasHangulText(text) ? '' : normalizeDisplayText(text)
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

function pickTransmissionFromTags(tags) {
  return tags.find((tag) => /(автомат|механика|робот|cvt)/i.test(String(tag))) || ''
}

function pickDriveFromTags(tags) {
  return tags.find((tag) => /2wd|fwd|awd|4wd|rwd|передн|полный|задн/i.test(String(tag))) || ''
}

function normalizeDriveLabel(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const low = text.toLowerCase()

  if (/(?:all[-\s]*wheel|allrad|4matic\+?|xdrive|quattro|4motion|syncro|sh-awd|e-awd|e[-\s]*four|htrac|awd)/i.test(low)) return '\u041f\u043e\u043b\u043d\u044b\u0439 (AWD)'
  if (/(?:4wd|4x4|e-?4wd|4wd\s*system)/i.test(low)) return '\u041f\u043e\u043b\u043d\u044b\u0439 (4WD)'
  if (/(?:rear[-\s]*wheel(?:\s*drive)?)/i.test(low) || /\b(?:fr|rwd)\b/i.test(low) || low.includes('\u0437\u0430\u0434\u043d')) return '\u0417\u0430\u0434\u043d\u0438\u0439 (RWD)'
  if (/(?:front[-\s]*wheel(?:\s*drive)?)/i.test(low) || /\b(?:ff|fwd)\b/i.test(low) || low.includes('\u043f\u0435\u0440\u0435\u0434\u043d')) return '\u041f\u0435\u0440\u0435\u0434\u043d\u0438\u0439 (FWD)'

  return ''
}

function inferDriveType(...values) {
  for (const value of values) {
    const normalized = normalizeDriveLabel(value)
    if (normalized) return normalized
  }
  return ''
}

function UNUSEDNormalizeBodyTypeLabel(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const low = text.toLowerCase()

  if (/gyeong(?:hyeong)?cha/i.test(text) || text.includes('\uACBD\uCC28')) return '\u041C\u0438\u043D\u0438'
  if (/sohyeongcha/i.test(text) || text.includes('\uC18C\uD615\uCC28')) return '\u041C\u0430\u043B\u044B\u0439 \u043A\u043B\u0430\u0441\u0441'
  if (/junjunghyeongcha/i.test(text) || text.includes('\uC900\uC911\uD615\uCC28')) return '\u041A\u043E\u043C\u043F\u0430\u043A\u0442\u043D\u044B\u0439 \u043A\u043B\u0430\u0441\u0441'
  if (/junghyeongcha/i.test(text) || text.includes('\uC911\uD615\uCC28')) return '\u0421\u0440\u0435\u0434\u043D\u0438\u0439 \u043A\u043B\u0430\u0441\u0441'
  if (/daehyeongcha/i.test(text) || text.includes('\uB300\uD615\uCC28')) return '\u0411\u0438\u0437\u043D\u0435\u0441-\u043A\u043B\u0430\u0441\u0441'
  if (low.includes('pickup') || text.includes('\uD53D\uC5C5')) return '\u041F\u0438\u043A\u0430\u043F'
  if (low.includes('truck') || low.includes('cargo') || text.includes('\uD654\uBB3C')) return '\u0413\u0440\u0443\u0437\u043E\u0432\u043E\u0439 / \u043F\u0438\u043A\u0430\u043F'
  if (low === 'rv' || low.includes('suv')) return '\u041A\u0440\u043E\u0441\u0441\u043E\u0432\u0435\u0440 / \u0432\u043D\u0435\u0434\u043E\u0440\u043E\u0436\u043D\u0438\u043A'
  if (low.includes('sedan') || text.includes('\uC138\uB2E8')) return '\u0421\u0435\u0434\u0430\u043D'
  if (low.includes('cabrio') || low.includes('cabriolet') || low.includes('convertible') || low.includes('\u043a\u0430\u0431\u0440\u0438\u043e\u043b\u0435\u0442') || text.includes('\uCEE8\uBC84\uD130\uBE14')) return '\u041A\u0430\u0431\u0440\u0438\u043E\u043B\u0435\u0442'
  if (low.includes('coupe') || text.includes('\uCFE0\uD398')) return '\u041A\u0443\u043F\u0435'
  if (low.includes('hatch') || text.includes('\uD574\uCE58\uBC31')) return '\u0425\u044D\u0442\u0447\u0431\u0435\u043A'
  if (low.includes('wagon') || text.includes('\uC65C\uAC74')) return '\u0423\u043D\u0438\u0432\u0435\u0440\u0441\u0430\u043B'
  if (low.includes('van') || low.includes('minivan') || text.includes('\uBC34')) return '\u041C\u0438\u043D\u0438\u0432\u044D\u043D'

  return normalizeDisplayText(text)
}

function normalizeColorLabel(value) {
  return normalizeVehicleColorLabel(value)
}

function shouldReplaceColor(value) {
  return isWeakColorValue(value)
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

function normalizeOptionFeatures(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, 16)
}

function normalizeWarrantyTerm(label, monthsValue, mileageValue) {
  const months = Number(monthsValue) > 0 ? Number(monthsValue) : null
  const mileage = Number(mileageValue) > 0 ? Number(mileageValue) : null
  if (!months && !mileage) return null

  return {
    key: String(label || '').toLowerCase(),
    label,
    months,
    mileage,
  }
}

function mapWarranty(value = {}) {
  const provider = String(value?.warranty_company || value?.warranty?.provider || '').trim()
  const body = normalizeWarrantyTerm('Кузов', value?.warranty_body_months ?? value?.warranty?.body?.months, value?.warranty_body_km ?? value?.warranty?.body?.mileage)
  const transmission = normalizeWarrantyTerm('Трансмиссия', value?.warranty_transmission_months ?? value?.warranty?.transmission?.months, value?.warranty_transmission_km ?? value?.warranty?.transmission?.mileage)
  const items = [body, transmission].filter(Boolean)

  if (!items.length) return null

  return {
    provider,
    items,
  }
}

function formatWarrantyTerm(item) {
  if (!item) return '-'

  const parts = []
  if (item.months) parts.push(`${item.months} мес.`)
  if (item.mileage) parts.push(`${item.mileage.toLocaleString('ru-RU')} км`)
  return parts.join(' / ') || '-'
}

function mapCar(c) {
  const priceUSD = Number(c.price_usd) || 0
  const commission = Number(c.commission ?? 200) || 200
  const delivery = Number(c.delivery ?? 1750) || 1750
  const loading = Number(c.loading) || 0
  const unloading = Number(c.unloading ?? 100) || 100
  const storage = Number(c.storage ?? 310) || 310
  const vatRefund = Number(c.vat_refund) || Math.round(priceUSD * VAT_REFUND_RATE)
  const total = Number(c.total) || Math.round(priceUSD + commission + delivery + loading + unloading + storage - vatRefund)
  const images = normalizeImages(c.images)
  const tags = normalizeTags(Array.isArray(c.tags) ? c.tags : [])
  const normalizedName = normalizeVehicleTitle(c.name || '')
  const normalizedModel = normalizeVehicleTitle(c.model || '')
  const normalizedLocation = getShortLocationLabel(c.location_short || c.location || 'Корея')
  const driveSource = c.drive_type || pickDriveFromTags(tags)
  const trimLevel = normalizeTrimLabel(c.trim_level || '') || extractTrimLabelFromTitle(normalizedName, normalizedModel, c.name || '', c.model || '')

  return {
    id: c.id,
    name: appendDisplayTrimSuffix(normalizedName || normalizedModel || 'Автомобиль', trimLevel),
    model: appendDisplayTrimSuffix(normalizedModel || normalizedName || '', trimLevel),
    year: c.year || '-',
    yearNum: parseYear(c.year),
    mileage: Number(c.mileage || 0),
    trimLevel,
    keyInfo: normalizeKeyInfoLabel(c.key_info || ''),
    bodyColor: normalizeColorLabel(c.body_color || '-'),
    interiorColor: normalizeInteriorColorLabel(c.interior_color || '', c.body_color || '', { allowBodyDuplicate: true }),
    location: normalizedLocation || 'Корея',
    vin: sanitizeVin(c.vin) || '-',
    tags,
    fuelType: normalizeTagLabel(c.fuel_type || ''),
    priceKRW: Number(c.price_krw) || 0,
    priceUSD,
    commission,
    delivery,
    loading,
    unloading,
    storage,
    vatRefund,
    total,
    deliveryProfileCode: c.delivery_profile_code || '',
    deliveryProfileLabel: c.delivery_profile_label || '',
    pricingLocked: Boolean(c.pricing_locked),
    exchangeRateCurrent: Number(c.exchange_rate_current) || 0,
    exchangeRateSite: Number(c.exchange_rate_site) || 0,
    encarUrl: c.encar_url || '',
    canNegotiate: Boolean(c.can_negotiate),
    images,
    encarId: c.encar_id || '-',
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    bodyType: resolveDisplayBodyTypeLabel(c.body_type || '', normalizedName, normalizedModel, c.name || '', c.model || '') || '-',
    vehicleClass: resolveVehicleClassLabelForDisplay(c.vehicle_class || '', c.body_type || '', normalizedName, normalizedModel, c.name || '', c.model || '') || '-',
    transmission: tags.find((t) => /автомат|механика|робот|cvt/i.test(String(t))) || '-',
    driveType: inferDriveType(
      driveSource,
      c.name,
      c.model,
      normalizedName,
      normalizedModel,
      ...(Array.isArray(c.tags) ? c.tags : []),
    ) || normalizeDisplayText(driveSource) || '-',
    seatCount: null,
    displacement: 0,
    optionFeatures: normalizeOptionFeatures(c.option_features),
    warranty: mapWarranty(c),
    vehicleNo: '-',
    detailFlags: {},
    detailCondition: {},
    detailManage: {},
    inspection: null,
  }
}

function mapCarWithNormalizedSpecs(c) {
  const base = mapCar(c)
  const tags = normalizeTags(Array.isArray(c?.tags) ? c.tags : [])
  const driveSource = c?.drive_type || pickDriveFromTags(tags)

  return {
    ...base,
    bodyType: resolveDisplayBodyTypeLabel(c?.body_type || '', base.name, base.model, c?.name || '', c?.model || '') || base.bodyType || '-',
    vehicleClass: resolveVehicleClassLabelForDisplay(c?.vehicle_class || '', c?.body_type || '', base.name, base.model, c?.name || '', c?.model || '') || base.vehicleClass || '-',
    transmission: normalizeTagLabel(c?.transmission || '') || pickTransmissionFromTags(tags) || base.transmission || '-',
    driveType: inferDriveType(
      driveSource,
      c?.name,
      c?.model,
      base.name,
      base.model,
      ...tags,
    ) || normalizeDisplayText(driveSource) || base.driveType || '-',
    displacement: Number(c?.displacement) || base.displacement || 0,
  }
}

function mergeCarWithEncar(baseCar, detail) {
  const detailImages = normalizeImages(detail?.photos?.length ? detail.photos : detail?.images)
  const baseImages = normalizeImages(baseCar.images)
  const images = detailImages.length ? detailImages : baseImages
  const year = baseCar.year === '-' && detail?.year ? detail.year : baseCar.year
  const detailTrim = baseCar.trimLevel || normalizeTrimLabel(detail?.trim_level || '') || extractTrimLabelFromTitle(detail?.name || '', detail?.model || '')
  const detailName = appendDisplayTrimSuffix(stripTrailingTrimLabel(normalizeVehicleTitle(detail?.name || ''), detailTrim), detailTrim)
  const detailModel = appendDisplayTrimSuffix(stripTrailingTrimLabel(normalizeVehicleTitle(detail?.model || ''), detailTrim), detailTrim)

  return {
    ...baseCar,
    name: shouldUpgradeVehicleTitle(baseCar.name) ? (detailName || baseCar.name) : baseCar.name,
    model: shouldUpgradeVehicleTitle(baseCar.model) ? (detailModel || baseCar.model) : baseCar.model,
    year,
    yearNum: parseYear(year),
    mileage: baseCar.mileage || Number(detail?.mileage || 0),
    trimLevel: detailTrim,
    keyInfo: baseCar.keyInfo || normalizeKeyInfoLabel(detail?.key_info || ''),
    bodyColor: shouldReplaceColor(baseCar.bodyColor) ? normalizeColorLabel(detail?.body_color || baseCar.bodyColor || '-') : baseCar.bodyColor,
    interiorColor: shouldReplaceColor(baseCar.interiorColor)
      ? (normalizeInteriorColorLabel(detail?.interior_color || '', detail?.body_color || baseCar.bodyColor || '', { allowBodyDuplicate: true }) || baseCar.interiorColor || '')
      : baseCar.interiorColor,
    location: getShortLocationLabel(detail?.location_short || detail?.location || baseCar.location || 'Корея'),
    vin: baseCar.vin === '-' ? (sanitizeVin(detail?.vin) || '-') : baseCar.vin,
    fuelType: shouldReplaceText(baseCar.fuelType) ? (normalizeTagLabel(detail?.fuel_type || '') || baseCar.fuelType || '') : baseCar.fuelType,
    images,
    createdAt: detail?.manage?.firstAdvertisedDateTime || baseCar.createdAt,
    updatedAt: detail?.manage?.modifyDateTime || baseCar.updatedAt,
    bodyType: (shouldReplaceText(baseCar.bodyType) || isWeakBodyTypeLabel(baseCar.bodyType))
      ? (resolveDisplayBodyTypeLabel(detail?.body_type || '', detail?.name || '', detail?.model || '', baseCar.name, baseCar.model) || baseCar.bodyType || '-')
      : baseCar.bodyType,
    vehicleClass: resolveVehicleClassLabelForDisplay(
      detail?.vehicle_class || '',
      detail?.body_type || '',
      detail?.name || '',
      detail?.model || '',
      baseCar.name,
      baseCar.model,
    ) || baseCar.vehicleClass || '-',
    transmission: shouldReplaceText(baseCar.transmission)
      ? (normalizeTagLabel(detail?.transmission || '') || baseCar.transmission || '-')
      : baseCar.transmission,
    driveType: inferDriveType(
      detail?.drive_type,
      detail?.name,
      detail?.model,
      baseCar.name,
      baseCar.model,
      ...(Array.isArray(baseCar.tags) ? baseCar.tags : []),
    ) || baseCar.driveType,
    seatCount: Number(detail?.seat_count) || baseCar.seatCount || null,
    displacement: Number(detail?.displacement) || baseCar.displacement || 0,
    optionFeatures: normalizeOptionFeatures(detail?.option_features?.length ? detail.option_features : baseCar.optionFeatures),
    warranty: mapWarranty(detail) || baseCar.warranty || null,
    vehicleNo: detail?.vehicle_no || baseCar.vehicleNo || '-',
    detailFlags: detail?.flags || {},
    detailCondition: detail?.condition || {},
    detailManage: detail?.manage || {},
    inspection: detail?.inspection || baseCar.inspection || null,
  }
}

function mergeCarWithNormalizedEncar(baseCar, detail) {
  const merged = mergeCarWithEncar(baseCar, detail)

  return {
    ...merged,
    bodyType: resolveDisplayBodyTypeLabel(detail?.body_type || '', detail?.name || '', detail?.model || '', merged.name, merged.model) || merged.bodyType || '-',
    vehicleClass: resolveVehicleClassLabelForDisplay(detail?.vehicle_class || '', detail?.body_type || '', detail?.name || '', detail?.model || '', merged.name, merged.model) || merged.vehicleClass || '-',
    transmission: normalizeTagLabel(detail?.transmission || '') || merged.transmission || '-',
    driveType: inferDriveType(
      detail?.drive_type,
      detail?.name,
      detail?.model,
      merged.name,
      merged.model,
      ...(Array.isArray(merged.tags) ? merged.tags : []),
    ) || merged.driveType || '-',
  }
}

export default function CarDetailsPage({ section = CAR_SECTION_CONFIG.main }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const deliveryContext = useDeliveryContext()
  const deliverySettings = deliveryContext?.settings
  const selectedCountryCode = deliveryContext?.countryCode
  const selectedCountry = deliveryContext?.selectedCountry
  const calcDirtyRef = useRef(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [car, setCar] = useState(null)
  const [imgIdx, setImgIdx] = useState(0)
  const [inspectionOpen, setInspectionOpen] = useState(false)
  const [calc, setCalc] = useState({
    year: String(DEFAULT_CALC_YEAR),
    engine: formatCalcEngineInput(DEFAULT_CALC_ENGINE),
    fuel: 'gasoline',
    direction: 'asia',
    isPremium: false,
    customsValue: '',
  })
  const [calcDefaults, setCalcDefaults] = useState({ year: DEFAULT_CALC_YEAR, engine: DEFAULT_CALC_ENGINE })

  const updateCalc = (patch) => {
    calcDirtyRef.current = true
    setCalc((prev) => ({ ...prev, ...patch }))
  }

  useEffect(() => {
    let active = true
    calcDirtyRef.current = false
    setInspectionOpen(false)

    const run = async () => {
      try {
        const params = new URLSearchParams({ listingType: section.listingType })
        const res = await fetch(`/api/cars/${id}?${params}`)
        if (!res.ok) throw new Error(res.status === 404 ? 'Машина не найдена' : 'Ошибка загрузки карточки')

        const data = await res.json()
        if (!active) return

        const mapped = mapCarWithNormalizedSpecs(data)
        const fuel = normalizeCustomsFuel(detectFuel(data))
        const inferredDirection = inferImportDirection(data, mapped)
        setCar(mapped)
        setImgIdx(0)
        setError('')
        const nextCalcDefaults = {
          year: mapped.yearNum || DEFAULT_CALC_YEAR,
          engine: resolveDefaultCalcEngineValue({ displacement: mapped.displacement, name: mapped.name, model: mapped.model }),
        }
        setCalcDefaults(nextCalcDefaults)
        if (!calcDirtyRef.current) {
          setCalc({
            year: formatCalcYearInput(nextCalcDefaults.year),
            engine: formatCalcEngineInput(nextCalcDefaults.engine),
            fuel,
            direction: inferredDirection,
            isPremium: isPremiumVehicle(mapped),
            customsValue: '',
          })
        }

        if (mapped.encarId && mapped.encarId !== '-') {
          try {
            const detailRes = await fetch(`/api/encar/${mapped.encarId}?includeInspection=1`)
            if (!detailRes.ok) return
            const detail = await detailRes.json()
            if (!active) return

            const mergedDetailCar = mergeCarWithNormalizedEncar(mapped, detail)
            const inferredDetailDirection = inferImportDirection(detail, mergedDetailCar, mapped)
            setCar((prev) => (prev ? mergeCarWithNormalizedEncar(prev, detail) : prev))
            setImgIdx(0)
            const nextCalcDefaults = {
              year: parseYear(detail?.year || mapped.year),
              engine: resolveDefaultCalcEngineValue({
                displacement: detail?.displacement || mapped.displacement,
                name: detail?.name || mapped.name,
                model: detail?.model || mapped.model,
              }),
            }
            setCalcDefaults(nextCalcDefaults)
            if (!calcDirtyRef.current) {
              setCalc({
                year: formatCalcYearInput(nextCalcDefaults.year),
                engine: formatCalcEngineInput(nextCalcDefaults.engine),
                fuel: normalizeCustomsFuel(detectFuel({ fuel_type: detail?.fuel_type || mapped.fuelType, tags: mapped.tags })),
                direction: inferredDetailDirection,
                isPremium: isPremiumVehicle(detail) || isPremiumVehicle(mapped),
                customsValue: '',
              })
            }
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
  }, [id, section.listingType])

  const imageCount = car?.images?.length || 1
  const boundedIdx = Math.min(imgIdx, imageCount - 1)
  const imageSrc = car?.images?.[boundedIdx]?.url || ''
  const inspectionGroups = useMemo(() => groupInspectionRows(car?.inspection?.detailStatus || []), [car?.inspection])
  const registrationHistoryHighlights = useMemo(() => buildVehicleHistoryHighlightCards(car), [car])
  const registrationHistorySecondaryEntries = useMemo(() => buildVehicleHistorySecondaryEntries(car), [car])
  const accidentHistoryEntries = useMemo(() => buildAccidentHistoryEntries(car), [car])
  const historyAccidentCards = useMemo(() => buildVehicleHistoryAccidentCards(car), [car])
  const historyStatisticsEntries = useMemo(() => buildVehicleHistoryStatistics(car), [car])
  const historyUninsuredPeriods = useMemo(() => buildVehicleHistoryUninsuredPeriods(car), [car])
  const historyOwnerChanges = useMemo(() => buildVehicleHistoryOwnerChanges(car), [car])
  const historyInfoChanges = useMemo(() => buildVehicleHistoryInfoChanges(car), [car])
  const repairHistoryItems = useMemo(() => buildRepairHistoryItems(car), [car])
  const encarFlagBadges = useMemo(() => buildEncarFlagBadges(car), [car])
  const displayLocation = useMemo(() => getShortLocationLabel(car?.location || '', 'Корея'), [car?.location])
  const inspectionPhotos = Array.isArray(car?.inspection?.photos) ? car.inspection.photos : []
  const inspectionSummary = Array.isArray(car?.inspection?.summary) ? car.inspection.summary : []

  const deliveryInfo = useMemo(
    () => resolveDeliveryForCar({ car, settings: deliverySettings, countryCode: selectedCountryCode }),
    [car, deliverySettings, selectedCountryCode],
  )
  const resolvedDelivery = deliveryInfo.price
  const resolvedTotal = useMemo(() => {
    if (!car) return null
    if (!Number.isFinite(resolvedDelivery)) return null
    return Math.round(
      (Number(car.priceUSD) || 0) +
      (Number(car.commission) || 0) +
      resolvedDelivery +
      (Number(car.loading) || 0) +
      (Number(car.unloading) || 0) +
      (Number(car.storage) || 0) -
      (Number(car.vatRefund) || 0)
    )
  }, [car, resolvedDelivery])
  const deliveryDisplayValue = Number.isFinite(resolvedDelivery)
    ? `$${Number(resolvedDelivery).toLocaleString()}`
    : 'Уточняется'
  const totalDisplayValue = Number.isFinite(resolvedTotal)
    ? `$${resolvedTotal.toLocaleString()}`
    : 'Уточняется'

  const calcYearValue = useMemo(() => parseCalcYearInput(calc.year, calcDefaults.year), [calc.year, calcDefaults.year])
  const calcEngineValue = useMemo(() => parseCalcEngineInput(calc.engine, calcDefaults.engine), [calc.engine, calcDefaults.engine])
  const customsCountryCode = String(selectedCountry?.code || selectedCountryCode || '').toLowerCase()
  const kzUnionCodes = ['kz', 'ru', 'by']
  const customsMode = customsCountryCode === 'kg' ? 'kg' : kzUnionCodes.includes(customsCountryCode) ? 'kz' : null
  const customsAvailable = Boolean(customsMode)
  const isKazakhstan = customsMode === 'kz'
  const customsUnavailableMessage = selectedCountry?.label
    ? `Растаможка для ${selectedCountry.label} уточняется.`
    : 'Растаможка для выбранной страны уточняется.'
  const customsResult = useMemo(() => {
    if (!customsAvailable) {
      return { status: 'pending', message: customsUnavailableMessage }
    }
    if (isKazakhstan) {
      return resolveCustomsCalculationKz({
        year: calcYearValue,
        engine: calcEngineValue,
        customsValue: calc.customsValue,
      })
    }
    return resolveCustomsCalculation({
      year: calcYearValue,
      engine: calcEngineValue,
      fuel: calc.fuel,
      direction: calc.direction,
      isPremium: calc.isPremium,
    })
  }, [
    calc.customsValue,
    calc.direction,
    calc.fuel,
    calc.isPremium,
    calcEngineValue,
    calcYearValue,
    customsAvailable,
    customsUnavailableMessage,
    isKazakhstan,
  ])
  const customsCurrencySymbol = customsResult.currency === 'EUR' ? '€' : '$'
  const customsTitleSuffix = customsMode === 'kg'
    ? ' (Кыргызстан)'
    : customsMode === 'kz'
      ? ` (${selectedCountry?.label || 'Казахстан'})`
      : ''

  if (loading) {
    return (
      <div className={`catalog-page catalog-page-${section.heroTone || 'main'}`}>
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
      <div className={`catalog-page catalog-page-${section.heroTone || 'main'}`}>
        <div className="cat-layout">
          <div className="cat-error">
            ⚠️ {error || 'Машина не найдена'} — <Link to={section.path}>Вернуться в раздел</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`catalog-page catalog-page-${section.heroTone || 'main'}`}>
      <div className="cat-breadcrumb">
        <div className="cat-breadcrumb-inner">
          <Link to="/" className="cat-bc-link"><HomeIcon /> Главная</Link>
          <span className="cat-bc-sep"><ChevronRightIcon /></span>
          <Link to={section.path} className="cat-bc-link">{section.breadcrumbLabel}</Link>
          <span className="cat-bc-sep"><ChevronRightIcon /></span>
          <span className="cat-bc-current">{car.name}</span>
        </div>
      </div>

      <div className="car-details-wrap">
        <button className="car-details-back" onClick={() => navigate(section.path)}><BackIcon /> Назад</button>

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
              {section.cardBadgeLabel ? <div className="car-details-section-badge">{section.cardBadgeLabel}</div> : null}
              <h1 className="car-details-title">{car.name}</h1>
              <p className="car-details-sub">{car.model || '-'}</p>
              {!!car.trimLevel && <div className="car-details-chip-line"><span>Комплектация:</span><strong>{car.trimLevel}</strong></div>}
              {!!car.keyInfo && <div className="car-details-chip-line"><span>Ключи:</span><strong>{car.keyInfo}</strong></div>}

              <div className="car-details-meta-grid">
                <div><span className="car-details-meta-label">Год</span><strong>{car.year || '-'}</strong></div>
                <div><span className="car-details-meta-label">Пробег</span><strong>{car.mileage.toLocaleString()} км</strong></div>
                <div><span className="car-details-meta-label">Местоположение</span><strong>{displayLocation || '-'}</strong></div>
                <div><span className="car-details-meta-label">VIN</span><strong className="car-details-meta-value-vin">{car.vin || '-'}</strong></div>
              </div>

              <div className="car-details-actions">
                <a href={`https://wa.me/821056650943?text=Хочу заказать: ${car.name} (${car.year}), VIN: ${car.vin || '-'}`} target="_blank" rel="noreferrer" className="btn-car-green">Заказать</a>
                {car.encarUrl ? <a href={car.encarUrl} target="_blank" rel="noreferrer" className="btn-car-outline">На Encar</a> : null}
              </div>
            </div>
          </section>

          <aside className="car-details-right">
            <div className="car-details-card">
              <div className="car-details-price-heading-row">
                <div className="car-details-price-icon">$</div>
                <div className="car-details-price-heading">Цена</div>
              </div>
              <div className="car-details-price-krw">{car.priceKRW.toLocaleString()} ₩</div>
              <div className="car-details-price-usd">${car.priceUSD.toLocaleString()}</div>
              <p className="car-details-price-note">
                Цена в корейских вонах (KRW) и долларах США (USD)
              </p>
              <div className="car-details-delivery-select">
                <DeliveryCountrySelect />
              </div>

              <div className="car-details-breakdown">
                <div className="car-details-breakdown-title">Расчет стоимости:</div>
                <div className="car-price-row"><span>Цена машины (KRW):</span><span>{car.priceKRW.toLocaleString()} ₩</span></div>
                <div className="car-price-row car-price-row-muted">
                  <span>Курс обмена:</span>
                  <span>{car.exchangeRateSite ? `${car.exchangeRateSite.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₩ = $1` : 'по курсу сайта'}</span>
                </div>
                <div className="car-price-row"><span>Финальная цена (USD):</span><span>${car.priceUSD.toLocaleString()}</span></div>
                <div className="car-price-row car-price-vat"><span>{`Возврат НДС:`}</span><span>-${car.vatRefund.toLocaleString()}</span></div>
                <div className="car-price-row"><span>Комиссия компании:</span><span>${car.commission.toLocaleString()}</span></div>
                <div className="car-price-row"><span>Доставка:</span><span>{deliveryDisplayValue}</span></div>
                <div className="car-price-row"><span>Погрузка:</span><span>${car.loading.toLocaleString()}</span></div>
                <div className="car-price-row"><span>Выгрузка:</span><span>${car.unloading.toLocaleString()}</span></div>
                <div className="car-price-row"><span>Стоянка:</span><span>${car.storage.toLocaleString()}</span></div>
              </div>
              <div className="car-price-total"><span>Итого</span><span>{totalDisplayValue}</span></div>
              {car.canNegotiate && <div className="car-details-negotiate">Возможен торг</div>}
            </div>

            <div className="car-details-card car-details-customs">
              <h3 className="car-details-card-title">Калькулятор растаможки{customsTitleSuffix}</h3>
              {customsAvailable ? (
                <>
                  <div className="car-details-customs-grid">
                    <label>
                      <span>Год выпуска</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={calc.year}
                        onChange={(e) => updateCalc({ year: sanitizeYearInput(e.target.value) })}
                      />
                    </label>
                    <label>
                      <span>Объём двигателя (л или cc)</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={calc.engine}
                        onChange={(e) => updateCalc({ engine: sanitizeEngineInput(e.target.value) })}
                      />
                    </label>
                    {isKazakhstan ? (
                      <label>
                        <span>Таможенная стоимость (EUR)</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={calc.customsValue}
                          onChange={(e) => updateCalc({ customsValue: sanitizeCustomsValueInput(e.target.value) })}
                          placeholder="Напр. 15000"
                        />
                      </label>
                    ) : (
                      <>
                        <CustomsDropdown
                          label="Тип двигателя"
                          ariaLabel="Тип двигателя"
                          value={calc.fuel}
                          options={CUSTOMS_FUEL_OPTIONS}
                          onChange={(value) => updateCalc({ fuel: value })}
                        />
                        <CustomsDropdown
                          label="Направление ввоза"
                          ariaLabel="Направление ввоза"
                          value={calc.direction}
                          options={CUSTOMS_DIRECTION_OPTIONS}
                          onChange={(value) => updateCalc({ direction: value })}
                        />
                      </>
                    )}
                  </div>
                  <div className="car-details-customs-summary">
                    {!isKazakhstan ? (
                      <label className="car-details-customs-toggle">
                        <input
                          type="checkbox"
                          checked={calc.isPremium}
                          onChange={(e) => updateCalc({ isPremium: e.target.checked })}
                        />
                        <span>Премиум-класс</span>
                      </label>
                    ) : null}
                    {customsResult.status === 'success' ? (
                      <div className="car-details-customs-result">
                        <strong>{`${customsCurrencySymbol}${customsResult.amount.toLocaleString('en-US')}`}</strong>
                      </div>
                    ) : null}
                  </div>
                  {customsResult.status !== 'success' && customsResult.message ? (
                    <p className="car-details-customs-note is-warning">{customsResult.message}</p>
                  ) : null}
                </>
              ) : (
                <p className="car-details-customs-note is-warning">{customsResult.message}</p>
              )}
            </div>

            <div className="car-details-card car-details-specs-card">
              <h3 className="car-details-card-title">Основные характеристики</h3>
              <div className="car-details-specs-grid">
                <div className="car-details-spec-item"><span>Топливо</span><strong>{car.fuelType || getCustomsFuelLabel(calc.fuel)}</strong></div>
                <div className="car-details-spec-item"><span>Трансмиссия</span><strong>{car.transmission || '-'}</strong></div>
                <div className="car-details-spec-item"><span>Привод</span><strong>{car.driveType || '-'}</strong></div>
                <div className="car-details-spec-item"><span>Комплектация</span><strong>{car.trimLevel || '-'}</strong></div>
                <div className="car-details-spec-item"><span>Цвет кузова</span><strong>{car.bodyColor || '-'}</strong></div>
                <div className="car-details-spec-item"><span>Цвет салона</span><strong>{car.interiorColor || '-'}</strong></div>
                <div className="car-details-spec-item"><span>Пробег</span><strong>{car.mileage.toLocaleString()} км</strong></div>
                <div className="car-details-spec-item"><span>Местоположение</span><strong>{displayLocation || '-'}</strong></div>
                <div className="car-details-spec-item"><span>Тип кузова</span><strong>{car.bodyType || '-'}</strong></div>
                <div className="car-details-spec-item"><span>Класс</span><strong>{car.vehicleClass || '-'}</strong></div>
                <div className="car-details-spec-item"><span>Ключи</span><strong>{car.keyInfo || '-'}</strong></div>
                <div className="car-details-spec-item"><span>Количество мест</span><strong>{car.seatCount || '-'}</strong></div>
                <div className="car-details-spec-item"><span>Объем двигателя</span><strong>{car.displacement ? `${car.displacement} cc` : '-'}</strong></div>
                <div className="car-details-spec-item"><span>Encar ID</span><strong>{car.encarId || '-'}</strong></div>
                <div className="car-details-spec-item"><span>На Encar с</span><strong>{formatDate(car.detailManage?.firstAdvertisedDateTime || car.createdAt)}</strong></div>
                <div className="car-details-spec-item"><span>Обновлено на Encar</span><strong>{formatDate(car.detailManage?.modifyDateTime || car.updatedAt)}</strong></div>
              </div>
            </div>

            {!!car.warranty?.items?.length && (
              <div className="car-details-card car-details-warranty-card">
                <div className="car-details-warranty-head">
                  <div className="car-details-warranty-icon">
                    <ShieldSmallIcon />
                  </div>
                  <div className="car-details-warranty-copy">
                    <h3 className="car-details-card-title">Гарантия</h3>
                    {car.warranty.provider && <p className="car-details-warranty-provider">{car.warranty.provider}</p>}
                  </div>
                </div>
                <div className="car-details-warranty-grid">
                  {car.warranty.items.map((item) => (
                    <div key={item.key} className="car-details-warranty-item">
                      <span>{item.label}</span>
                      <strong>{formatWarrantyTerm(item)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!!car.optionFeatures?.length && (
              <div className="car-details-card">
                <h3 className="car-details-card-title">Опции и оснащение</h3>
                <div className="car-feature-row car-details-option-row">
                  {car.optionFeatures.map((item) => (
                    <span key={item} className="car-feature-pill">{item}</span>
                  ))}
                </div>
              </div>
            )}

          </aside>
        </div>

                <section className="car-details-card car-details-bottom-card">
          <div className="car-inspection-header">
            <div>
              <h3 className="car-details-card-title">{translateInspectionText('Inspection and diagnostics')}</h3>
              <p className="car-details-muted">
                {translateInspectionText(`Diagnosis Encar: ${car.detailFlags?.diagnosis ? 'available' : 'limited'}.`)} {translateInspectionText('Views')}: {Number(car.detailManage?.viewCount || 0).toLocaleString()} | {translateInspectionText('Subscribers')}: {Number(car.detailManage?.subscribeCount || 0).toLocaleString()}.
              </p>
            </div>
            {car.inspection && (
              <button
                type="button"
                className={`car-inspection-toggle${inspectionOpen ? ' is-open' : ''}`}
                onClick={() => setInspectionOpen((prev) => !prev)}
                aria-expanded={inspectionOpen}
              >
                <span>{inspectionOpen ? 'Скрыть детали' : 'Показать все'}</span>
                <ChevronRightIcon />
              </button>
            )}
          </div>
          <div className="car-details-actions">
            {car.encarUrl ? (
              <a href={car.encarUrl} target="_blank" rel="noreferrer" className="btn-car-primary">{translateInspectionText('Open in Encar')}</a>
            ) : null}
            {car.inspection?.sourceUrl && (
              <a href={car.inspection.sourceUrl} target="_blank" rel="noreferrer" className="btn-car-green">{translateInspectionText('Open inspection')}</a>
            )}
          </div>
          {!!encarFlagBadges.length && (
            <div className="car-inspection-badges">
              {encarFlagBadges.map((badge) => (
                <span key={badge.key} className={`car-inspection-badge car-inspection-badge-${badge.tone}`}>
                  {badge.label}
                </span>
              ))}
            </div>
          )}

          {car.inspection ? (
            <div className="car-inspection-stack">
              {!!inspectionPhotos.length && (
                <div className="car-inspection-block">
                  <h4 className="car-inspection-title">{translateInspectionText('Inspection photos')}</h4>
                  <div className="car-inspection-photos">
                    {inspectionPhotos.map((photo, index) => (
                      <a key={`${photo.url}-${index}`} href={photo.url} target="_blank" rel="noreferrer" className="car-inspection-photo">
                        <img src={photo.url} alt={translateInspectionText(photo.label || `Inspection ${index + 1}`)} loading="lazy" />
                        <span>{translateInspectionText(photo.label || `Photo ${index + 1}`)}</span>
                        <small>{buildInspectionPhotoMeta(photo, index)}</small>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {!!inspectionSummary.length && (
                <div className="car-inspection-block">
                  <h4 className="car-inspection-title">{translateInspectionText('Overall condition')}</h4>
                  <div className="car-inspection-status-list">
                    {inspectionSummary.map((item, index) => {
                      const primaryValue = (item.states?.map(translateInspectionText).join(', ')) || translateInspectionText(item.detail) || '-'
                      const metaLines = buildInspectionMetaLines(item, primaryValue)

                      return (
                        <InspectionStatusRow
                          key={`${item.label}-${index}`}
                          label={translateInspectionText(item.label)}
                          value={primaryValue}
                          metaLines={metaLines}
                        />
                      )
                    })}
                  </div>
                </div>
              )}

              {inspectionOpen && !!repairHistoryItems.length && (
                <div className="car-inspection-block">
                  <h4 className="car-inspection-title">{translateInspectionText('Repair history')}</h4>
                  <div className="car-inspection-status-list">
                    {repairHistoryItems.map((item, index) => (
                      <InspectionStatusRow
                        key={`${item.label}-${index}`}
                        label={item.label}
                        value={item.value}
                      />
                    ))}
                  </div>
                </div>
              )}

              {inspectionOpen && !!car.inspection.exteriorStatus?.sections?.length && (
                <div className="car-inspection-block">
                  <h4 className="car-inspection-title">{translateInspectionText('Body and frame inspection')}</h4>
                  {!!car.inspection.exteriorStatus?.legend?.length && (
                    <div className="car-inspection-legend">
                      {car.inspection.exteriorStatus.legend.map((item, index) => (
                        <span key={`${item}-${index}`} className="car-inspection-legend-item">
                          {translateInspectionText(item)}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="car-inspection-groups">
                    {car.inspection.exteriorStatus.sections.map((section) => {
                      const sectionRows = buildExteriorInspectionRows(section)

                      if (!sectionRows.length) return null

                      return (
                        <div key={section.title} className="car-inspection-group">
                          <h5>{translateInspectionText(section.title)}</h5>
                          <div className="car-inspection-status-list">
                            {sectionRows.map((row) => (
                              <InspectionStatusRow
                                key={row.key}
                                label={row.label}
                                value={row.value}
                              />
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {inspectionOpen && !!inspectionGroups.length && (
                <div className="car-inspection-block">
                  <h4 className="car-inspection-title">{translateInspectionText('Detailed technical check')}</h4>
                  <div className="car-inspection-groups">
                    {inspectionGroups.map((group) => (
                      <div key={group.title} className="car-inspection-group">
                        <h5>{translateInspectionText(group.title)}</h5>
                        <div className="car-inspection-status-list">
                          {group.items.map((item, index) => {
                            const primaryValue = (item.states?.map(translateInspectionText).join(', ')) || translateInspectionText(item.detail) || '-'
                            const metaLines = buildInspectionMetaLines(item, primaryValue)

                            return (
                              <InspectionStatusRow
                                key={`${group.title}-${item.label}-${index}`}
                                label={translateInspectionText(item.label)}
                                value={primaryValue}
                                metaLines={metaLines}
                              />
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {inspectionOpen && !!car.inspection.opinion?.length && (
                <div className="car-inspection-block">
                  <h4 className="car-inspection-title">{translateInspectionText('Inspector comments')}</h4>
                  <div className="car-inspection-opinion">
                    {car.inspection.opinion.map((item, index) => (
                      <div key={`${item.label}-${index}`} className="car-inspection-opinion-item">
                        <span>{translateInspectionText(item.label)}</span>
                        <p>{translateInspectorComment(item.text || '-')}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {inspectionOpen && !!car.inspection.signatures?.signers?.length && (
                <div className="car-inspection-block">
                  <h4 className="car-inspection-title">{translateInspectionText('Signatures and confirmation')}</h4>
                  <div className="car-inspection-grid">
                    {car.inspection.signatures.signers.map((item, index) => (
                      <div key={`${item.label}-${index}`} className="car-inspection-item">
                        <span>{item.label || '-'}</span>
                        <strong>{item.value || '-'}</strong>
                      </div>
                    ))}
                    {car.inspection.signatures.date && (
                      <div className="car-inspection-item">
                        <span>{translateInspectionText('Report date')}</span>
                        <strong>{formatInspectionDate(car.inspection.signatures.date)}</strong>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="car-inspection-empty">{translateInspectionText('Full Encar inspection report is not available for this car right now.')}</div>
          )}
        </section>

        <section className="car-details-card car-details-bottom-card">
          <h3 className="car-details-card-title">История и регистрация Encar</h3>
          <p className="car-details-history-note">
            Показываем только подтвержденные данные Encar. Полная страховая история и смены владельцев доступны не для всех объявлений.
          </p>
          {!!registrationHistoryHighlights.length && (
            <div className="car-history-highlight-grid">
              {registrationHistoryHighlights.map((entry) => (
                <article key={entry.key} className={`car-history-highlight-card car-history-highlight-card-${entry.tone || 'neutral'}`}>
                  <div className={`car-history-highlight-icon car-history-highlight-icon-${entry.tone || 'neutral'}`}>
                    {getHistoryIcon(entry.icon)}
                  </div>
                  <div className="car-history-highlight-copy">
                    <span>{entry.label}</span>
                    <strong>{entry.value}</strong>
                    {entry.secondary ? <small>{entry.secondary}</small> : null}
                  </div>
                </article>
              ))}
            </div>
          )}

          {!!registrationHistorySecondaryEntries.length && (
            <div className="car-history-secondary-grid">
              {registrationHistorySecondaryEntries.map((entry) => (
                <div key={entry.label} className="car-history-secondary-item">
                  <span>{entry.label}</span>
                  <strong>{entry.value}</strong>
                </div>
              ))}
            </div>
          )}

          {historyStatisticsEntries.length > 0 && (
            <div className="car-inspection-block">
              <h4 className="car-inspection-title">Статистика</h4>
              <div className="car-history-stats-grid">
                {historyStatisticsEntries.map((entry) => (
                  <div key={entry.key} className={`car-history-stat-card car-history-stat-card-${entry.tone || 'neutral'}${entry.key === 'atFaultDamage' || entry.key === 'notAtFaultDamage' ? ' car-history-stat-card-damage-compare' : ''}`}>
                    <span>{entry.label}</span>
                    <strong>{entry.value}</strong>
                    {entry.secondary ? <small>{entry.secondary}</small> : null}
                  </div>
                ))}
              </div>
            </div>
          )}

          {historyUninsuredPeriods.length > 0 && (
            <div className="car-inspection-block">
              <h4 className="car-inspection-title">Периоды без страховки</h4>
              <div className="car-inspection-group">
                <div className="car-inspection-group-list">
                  {historyUninsuredPeriods.map((entry) => (
                    <div key={entry.label} className="car-inspection-line">
                      <div>
                        <span>{entry.label}</span>
                      </div>
                      <strong>{entry.value}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {historyOwnerChanges.length > 0 && (
            <div className="car-inspection-block">
              <h4 className="car-inspection-title">Смены владельцев</h4>
              <div className="car-history-change-list">
                  {historyOwnerChanges.map((entry) => (
                    <div key={entry.label} className="car-history-change-card">
                      <span>{entry.label}</span>
                      <strong>{entry.value}</strong>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {historyInfoChanges.length > 0 && (
            <div className="car-inspection-block">
              <h4 className="car-inspection-title">Изменения информации</h4>
              <div className="car-history-change-list">
                {historyInfoChanges.map((entry) => (
                  <div key={entry.key} className="car-history-change-card car-history-change-card-wide">
                    <div>
                      <span>{entry.label}</span>
                      <strong>{entry.value}</strong>
                    </div>
                    <strong>{entry.date}</strong>
                  </div>
                  ))}
              </div>
            </div>
          )}
        </section>

        <section className="car-details-card car-details-bottom-card">
          <h3 className="car-details-card-title">Аварийная история Encar</h3>
          <p className="car-details-history-note">
            Блок собран из официальных статусов объявления Encar и inspection-отчета. Запись в истории Encar не всегда означает сильное ДТП: это может быть страховая, ремонтная или другая подтвержденная отметка по машине.
          </p>
          {accidentHistoryEntries.length ? (
            <div className="car-history-secondary-grid">
              {accidentHistoryEntries.map((entry) => (
                <div key={entry.label} className="car-history-secondary-item">
                  <span>{entry.label}</span>
                  <strong>{entry.value}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="car-details-muted">Подтвержденных аварийных или юридических записей Encar по этой машине сейчас нет.</p>
          )}

          {historyAccidentCards.length > 0 && (
            <div className="car-inspection-block">
              <h4 className="car-inspection-title">История аварий</h4>
              <div className="car-history-accident-list">
                {historyAccidentCards.map((entry) => (
                  <article key={entry.key} className="car-history-accident-card">
                    <div className="car-history-accident-head">
                      <div className="car-history-accident-title">
                        <div className={`car-history-highlight-icon car-history-highlight-icon-${entry.severity.tone}`}>
                          <WarningSmallIcon />
                        </div>
                        <strong>{entry.title}</strong>
                        <span className={`car-history-accident-badge car-history-accident-badge-${entry.severity.tone}`}>
                          {entry.severity.label}
                        </span>
                      </div>
                      <span className="car-history-accident-date">{entry.date}</span>
                    </div>
                    <div className="car-history-accident-metrics">
                      {entry.metrics.map((metric) => (
                        <div key={metric.key} className="car-history-accident-metric">
                          <span>{metric.label}</span>
                          <strong className={metric.accent === 'positive' ? 'is-positive' : ''}>{metric.value}</strong>
                          {metric.secondary ? <small>{metric.secondary}</small> : null}
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {repairHistoryItems.length > 0 && (
            <div className="car-inspection-block">
              <h4 className="car-inspection-title">История ремонтов и замен</h4>
              <div className="car-inspection-group">
                <div className="car-inspection-group-list">
                  {repairHistoryItems.map((item, index) => (
                    <div key={`${item.label}-${index}`} className="car-inspection-line">
                      <div>
                        <span>{item.label}</span>
                      </div>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

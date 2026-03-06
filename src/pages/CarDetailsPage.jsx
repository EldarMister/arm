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

function resolveEngineLiters({ displacement, name, model }) {
  const cc = Number(displacement) || 0
  if (cc >= 600) return Number((cc / 1000).toFixed(1))
  return inferEngineLiters(name || model)
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

function translateInspectionText(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (text === '-') return '-'
  if (INSPECTION_RU_MAP[text]) return INSPECTION_RU_MAP[text]

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
  [/renault[-\s]*korea\s*\(\s*samseong\s*\)/gi, 'Renault Korea'],
  [/renault[-\s]*korea\s*samsung/gi, 'Renault Korea'],
  [/renault samsung/gi, 'Renault Korea'],
  [/kgmobilriti\s*\(\s*ssangyong\s*\)/gi, 'KG Mobility (SsangYong)'],
  [/kgmobilriti/gi, 'KG Mobility'],
  [/ssangyong/gi, 'SsangYong'],
  [/rekseuteon/gi, 'Rexton'],
  [/seupocheu/gi, 'Sports'],
  [/kaeseupeo/gi, 'Casper'],
  [/geuraenjejo/gi, 'Grandeur'],
  [/geuraenjeo/gi, 'Grandeur'],
  [/mohabi/gi, 'Mohave'],
  [/ssonata/gi, 'Sonata'],
  [/\b([2-9])\s*sedae\b/gi, (_, n) => `${n}th Gen`],
]

const SUSPICIOUS_NAME_PATTERNS = [
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

function stripVehicleTitleNoise(value) {
  let text = String(value || '').trim()
  if (!text) return ''

  text = text
    .replace(/\bRenault Korea\s*\((?:Samseong|Samsung)\)/gi, 'Renault Korea')
    .replace(/\b(KG Mobility)\s*\((?:SsangYong)\)/gi, '$1')

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
  return stripVehicleTitleNoise(text)
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

  if (low.includes('awd')) return 'Полный (AWD)'
  if (low.includes('4wd')) return 'Полный (4WD)'
  if (low.includes('rwd') || low.includes('задн')) return 'Задний (RWD)'
  if (low.includes('2wd') || low.includes('fwd') || low.includes('передн')) return 'Передний (FWD)'

  return ''
}

function normalizeBodyTypeLabel(value) {
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
  if (low.includes('coupe') || text.includes('\uCFE0\uD398')) return '\u041A\u0443\u043F\u0435'
  if (low.includes('hatch') || text.includes('\uD574\uCE58\uBC31')) return '\u0425\u044D\u0442\u0447\u0431\u0435\u043A'
  if (low.includes('wagon') || text.includes('\uC65C\uAC74')) return '\u0423\u043D\u0438\u0432\u0435\u0440\u0441\u0430\u043B'
  if (low.includes('van') || low.includes('minivan') || text.includes('\uBC34')) return '\u041C\u0438\u043D\u0438\u0432\u044D\u043D'

  return normalizeDisplayText(text)
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
  const tags = normalizeTags(Array.isArray(c.tags) ? c.tags : [])
  const normalizedName = normalizeVehicleTitle(c.name || '')
  const normalizedModel = normalizeVehicleTitle(c.model || '')
  const normalizedLocation = normalizeDisplayText(c.location || 'Корея')
  const driveSource = c.drive_type || pickDriveFromTags(tags)

  return {
    id: c.id,
    name: normalizedName || normalizedModel || 'Автомобиль',
    model: normalizedModel || normalizedName || '',
    year: c.year || '-',
    yearNum: parseYear(c.year),
    mileage: Number(c.mileage || 0),
    bodyColor: normalizeColorLabel(c.body_color || '-'),
    interiorColor: normalizeColorLabel(c.interior_color || c.body_color || '-'),
    location: normalizedLocation || 'Корея',
    vin: c.vin || c.vehicle_no || '-',
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
    encarUrl: c.encar_url || '',
    canNegotiate: Boolean(c.can_negotiate),
    images,
    encarId: c.encar_id || '-',
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    bodyType: normalizeDisplayText(c.body_type || '-') || '-',
    transmission: tags.find((t) => /автомат|механика|робот|cvt/i.test(String(t))) || '-',
    driveType: normalizeDriveLabel(driveSource) || normalizeDisplayText(driveSource) || '-',
    seatCount: null,
    displacement: 0,
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
    bodyType: normalizeBodyTypeLabel(c?.body_type || base.bodyType || '-') || '-',
    transmission: normalizeTagLabel(c?.transmission || '') || pickTransmissionFromTags(tags) || base.transmission || '-',
    driveType: normalizeDriveLabel(driveSource) || normalizeDisplayText(driveSource) || base.driveType || '-',
    displacement: Number(c?.displacement) || base.displacement || 0,
  }
}

function mergeCarWithEncar(baseCar, detail) {
  const detailImages = normalizeImages(detail?.photos?.length ? detail.photos : detail?.images)
  const baseImages = normalizeImages(baseCar.images)
  const images = detailImages.length ? detailImages : baseImages
  const year = baseCar.year === '-' && detail?.year ? detail.year : baseCar.year

  return {
    ...baseCar,
    name: shouldUpgradeVehicleTitle(baseCar.name) ? (normalizeVehicleTitle(detail?.name || '') || baseCar.name) : baseCar.name,
    model: shouldUpgradeVehicleTitle(baseCar.model) ? (normalizeVehicleTitle(detail?.model || '') || baseCar.model) : baseCar.model,
    year,
    yearNum: parseYear(year),
    mileage: baseCar.mileage || Number(detail?.mileage || 0),
    bodyColor: shouldReplaceColor(baseCar.bodyColor) ? normalizeColorLabel(detail?.body_color || baseCar.bodyColor || '-') : baseCar.bodyColor,
    interiorColor: shouldReplaceColor(baseCar.interiorColor) ? normalizeColorLabel(detail?.interior_color || baseCar.interiorColor || '-') : baseCar.interiorColor,
    location: (baseCar.location === 'Корея' || shouldReplaceText(baseCar.location))
      ? (normalizeDisplayText(detail?.location || '') || baseCar.location)
      : baseCar.location,
    vin: baseCar.vin === '-' ? (detail?.vin || detail?.vehicle_no || '-') : baseCar.vin,
    fuelType: shouldReplaceText(baseCar.fuelType) ? (normalizeTagLabel(detail?.fuel_type || '') || baseCar.fuelType || '') : baseCar.fuelType,
    images,
    createdAt: detail?.manage?.firstAdvertisedDateTime || baseCar.createdAt,
    updatedAt: detail?.manage?.modifyDateTime || baseCar.updatedAt,
    bodyType: shouldReplaceText(baseCar.bodyType)
      ? (normalizeDisplayText(detail?.body_type || '') || baseCar.bodyType || '-')
      : baseCar.bodyType,
    transmission: shouldReplaceText(baseCar.transmission)
      ? (normalizeTagLabel(detail?.transmission || '') || baseCar.transmission || '-')
      : baseCar.transmission,
    driveType: detail?.drive_type
      ? (normalizeDisplayText(detail.drive_type) || baseCar.driveType || '-')
      : baseCar.driveType,
    seatCount: Number(detail?.seat_count) || baseCar.seatCount || null,
    displacement: Number(detail?.displacement) || baseCar.displacement || 0,
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
    bodyType: normalizeBodyTypeLabel(detail?.body_type || merged.bodyType || '-') || merged.bodyType || '-',
    transmission: normalizeTagLabel(detail?.transmission || '') || merged.transmission || '-',
    driveType: normalizeDriveLabel(detail?.drive_type || merged.driveType || '') || merged.driveType || '-',
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

        const mapped = mapCarWithNormalizedSpecs(data)
        const fuel = detectFuel(data)
        setCar(mapped)
        setImgIdx(0)
        setError('')
        setCalc({
          year: mapped.yearNum,
          engine: resolveEngineLiters({ displacement: mapped.displacement, name: mapped.name, model: mapped.model }),
          fuel,
        })

        if (mapped.encarId && mapped.encarId !== '-') {
          try {
            const detailRes = await fetch(`/api/encar/${mapped.encarId}?includeInspection=1`)
            if (!detailRes.ok) return
            const detail = await detailRes.json()
            if (!active) return

            setCar((prev) => (prev ? mergeCarWithNormalizedEncar(prev, detail) : prev))
            setImgIdx(0)
            setCalc((prev) => ({
              ...prev,
              year: parseYear(detail?.year || mapped.year),
              engine: resolveEngineLiters({
                displacement: detail?.displacement || mapped.displacement,
                name: detail?.name || mapped.name,
                model: detail?.model || mapped.model,
              }),
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
  const inspectionGroups = useMemo(() => groupInspectionRows(car?.inspection?.detailStatus || []), [car?.inspection])

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
                <a href={`https://wa.me/821056650943?text=Хочу заказать: ${car.name} (${car.year}), VIN: ${car.vin || '-'}`} target="_blank" rel="noreferrer" className="btn-car-green">Заказать</a>
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
                <div><span>Привод</span><strong>{car.driveType || '-'}</strong></div>
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
          <h3 className="car-details-card-title">{translateInspectionText('Inspection and diagnostics')}</h3>
          <p className="car-details-muted">
            {translateInspectionText(`Diagnosis Encar: ${car.detailFlags?.diagnosis ? 'available' : 'limited'}.`)} {translateInspectionText('Views')}: {Number(car.detailManage?.viewCount || 0).toLocaleString()} | {translateInspectionText('Subscribers')}: {Number(car.detailManage?.subscribeCount || 0).toLocaleString()}.
          </p>
          <div className="car-details-actions">
            <a href={car.encarUrl || '#'} target="_blank" rel="noreferrer" className="btn-car-primary">{translateInspectionText('Open in Encar')}</a>
            {car.inspection?.sourceUrl && (
              <a href={car.inspection.sourceUrl} target="_blank" rel="noreferrer" className="btn-car-green">{translateInspectionText('Open inspection')}</a>
            )}
          </div>

          {car.inspection ? (
            <div className="car-inspection-stack">
              {!!car.inspection.photos?.length && (
                <div className="car-inspection-block">
                  <h4 className="car-inspection-title">{translateInspectionText('Inspection photos')}</h4>
                  <div className="car-inspection-photos">
                    {car.inspection.photos.map((photo, index) => (
                      <a key={`${photo.url}-${index}`} href={photo.url} target="_blank" rel="noreferrer" className="car-inspection-photo">
                        <img src={photo.url} alt={translateInspectionText(photo.label || `Inspection ${index + 1}`)} loading="lazy" />
                        <span>{translateInspectionText(photo.label || `Photo ${index + 1}`)}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {!!car.inspection.summary?.length && (
                <div className="car-inspection-block">
                  <h4 className="car-inspection-title">{translateInspectionText('Overall condition')}</h4>
                  <div className="car-inspection-grid">
                    {car.inspection.summary.map((item, index) => (
                      <div key={`${item.label}-${index}`} className="car-inspection-item">
                        <span>{translateInspectionText(item.label)}</span>
                        <strong>{(item.states?.map(translateInspectionText).join(', ')) || translateInspectionText(item.detail) || '-'}</strong>
                        {item.detail && item.states?.join(', ') !== item.detail && <small>{translateInspectionText(item.detail)}</small>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!!car.inspection.repairHistory?.length && (
                <div className="car-inspection-block">
                  <h4 className="car-inspection-title">{translateInspectionText('Repair history')}</h4>
                  <div className="car-inspection-grid">
                    {car.inspection.repairHistory.map((item, index) => (
                      <div key={`${item.label}-${index}`} className="car-inspection-item">
                        <span>{translateInspectionText(item.label)}</span>
                        <strong>{translateInspectionText(item.value || '-')}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!!car.inspection.exteriorStatus?.sections?.length && (
                <div className="car-inspection-block">
                  <h4 className="car-inspection-title">{translateInspectionText('Body and frame inspection')}</h4>
                  <div className="car-inspection-groups">
                    {car.inspection.exteriorStatus.sections.map((section) => (
                      <div key={section.title} className="car-inspection-group">
                        <h5>{translateInspectionText(section.title)}</h5>
                        <div className="car-inspection-group-list">
                          {section.ranks.map((rank) => (
                            <div key={`${section.title}-${rank.rank}`} className="car-inspection-line">
                              <div>
                                <span>{translateInspectionText(rank.rank)}</span>
                              </div>
                              <strong>{rank.items?.map(translateInspectionText).join(', ') || '-'}</strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!!inspectionGroups.length && (
                <div className="car-inspection-block">
                  <h4 className="car-inspection-title">{translateInspectionText('Detailed technical check')}</h4>
                  <div className="car-inspection-groups">
                    {inspectionGroups.map((group) => (
                      <div key={group.title} className="car-inspection-group">
                        <h5>{translateInspectionText(group.title)}</h5>
                        <div className="car-inspection-group-list">
                          {group.items.map((item, index) => (
                            <div key={`${group.title}-${item.label}-${index}`} className="car-inspection-line">
                              <div>
                                <span>{translateInspectionText(item.label)}</span>
                                {item.note && <small>{translateInspectionText(item.note)}</small>}
                              </div>
                              <strong>{(item.states?.map(translateInspectionText).join(', ')) || translateInspectionText(item.detail) || '-'}</strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!!car.inspection.opinion?.length && (
                <div className="car-inspection-block">
                  <h4 className="car-inspection-title">{translateInspectionText('Inspector comments')}</h4>
                  <div className="car-inspection-opinion">
                    {car.inspection.opinion.map((item, index) => (
                      <div key={`${item.label}-${index}`} className="car-inspection-opinion-item">
                        <span>{translateInspectionText(item.label)}</span>
                        <p>{translateInspectionText(item.text || '-')}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!!car.inspection.signatures?.signers?.length && (
                <div className="car-inspection-block">
                  <h4 className="car-inspection-title">{translateInspectionText('Signatures and confirmation')}</h4>
                  <div className="car-inspection-grid">
                    {car.inspection.signatures.signers.map((item, index) => (
                      <div key={`${item.label}-${index}`} className="car-inspection-item">
                        <span>{translateInspectionText(item.label)}</span>
                        <strong>{translateInspectionText(item.value)}</strong>
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

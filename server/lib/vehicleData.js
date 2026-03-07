import { hasHangul, translateVehicleText } from '../scraper/translator.js'

export const PARKING_ADDRESS_KO = '인천 서구 오류동 1550'
export const PARKING_ADDRESS_EN = '1550 Oryu-dong, Seo-gu, Incheon'

const SPEC_TOKENS = /^(?:gasoline|diesel|hybrid|electric|lpg|turbo|2wd|4wd|awd|fwd|rwd|at|mt|cvt|dct|\d(?:\.\d)?t?)$/i
const GENERIC_COLOR_LABELS = new Set([
  'Черный',
  'Белый',
  'Серый',
  'Серебристый',
  'Синий',
  'Красный',
  'Зеленый',
  'Коричневый',
  'Бежевый',
  'Желтый',
  'Оранжевый',
  'Фиолетовый',
  'Чёрный',
])

const TRIM_REPLACEMENTS = [
  ['calligraphy', 'Каллиграфия'],
  ['prestige', 'Престиж'],
  ['luxury', 'Лакшери'],
  ['premium', 'Премиум'],
  ['signature', 'Сигнатур'],
  ['noblesse', 'Ноблесс'],
  ['exclusive', 'Эксклюзив'],
  ['inspiration', 'Инспирейшн'],
  ['modern', 'Модерн'],
  ['smartstream', 'Смартстрим'],
  ['smart', 'Смарт'],
  ['style', 'Стайл'],
  ['comfort', 'Комфорт'],
  ['standard', 'Стандарт'],
  ['special', 'Спешл'],
  ['tech', 'Тех'],
  ['high tech', 'Хай Тех'],
  ['advanced', 'Эдвансд'],
  ['platinum', 'Платинум'],
  ['limited', 'Лимитед'],
  ['executive', 'Экзекьютив'],
  ['black edition', 'Блэк Эдишн'],
  ['black', 'Блэк'],
  ['elite', 'Элит'],
]

const KNOWN_CITY_RULES = [
  [/서울|seoul/i, 'Сеул'],
  [/인천|incheon/i, 'Инчхон'],
  [/부산|busan/i, 'Пусан'],
  [/대구|daegu/i, 'Тэгу'],
  [/대전|daejeon/i, 'Тэджон'],
  [/광주|gwangju/i, 'Кванджу'],
  [/울산|ulsan/i, 'Ульсан'],
  [/세종|sejong/i, 'Седжон'],
  [/수원|suwon/i, 'Сувон'],
  [/용인|yongin/i, 'Йонъин'],
  [/성남|seongnam/i, 'Соннам'],
  [/안산|ansan/i, 'Ансан'],
  [/천안|cheonan/i, 'Чхонан'],
  [/제주|jeju/i, 'Чеджу'],
]

const COLOR_EXACT = new Map([
  ['검정색', 'Черный'],
  ['흑색', 'Черный'],
  ['흰색', 'Белый'],
  ['백색', 'Белый'],
  ['은색', 'Серебристый'],
  ['회색', 'Серый'],
  ['쥐색', 'Мокрый асфальт'],
  ['은회색', 'Серебристо-серый'],
  ['진주색', 'Жемчужный'],
  ['진주흰색', 'Жемчужно-белый'],
  ['진주백색', 'Жемчужно-белый'],
  ['아이보리', 'Айвори'],
  ['베이지', 'Бежевый'],
  ['갈색', 'Коричневый'],
  ['브라운', 'Коричневый'],
  ['청색', 'Синий'],
  ['파란색', 'Синий'],
  ['남색', 'Темно-синий'],
  ['네이비', 'Темно-синий'],
  ['적색', 'Красный'],
  ['빨강색', 'Красный'],
  ['와인색', 'Винный'],
  ['녹색', 'Зеленый'],
  ['초록색', 'Зеленый'],
  ['금색', 'Золотой'],
  ['주황색', 'Оранжевый'],
  ['보라색', 'Фиолетовый'],
  ['wet asphalt', 'Мокрый асфальт'],
  ['jwisaek', 'Мокрый асфальт'],
  ['jwiseak', 'Мокрый асфальт'],
  ['graphite', 'Графитовый'],
  ['charcoal', 'Графитовый'],
  ['dark gray', 'Темно-серый'],
  ['dark grey', 'Темно-серый'],
  ['light gray', 'Светло-серый'],
  ['light grey', 'Светло-серый'],
  ['silver gray', 'Серебристо-серый'],
  ['silver grey', 'Серебристо-серый'],
  ['pearl white', 'Жемчужно-белый'],
  ['pearl black', 'Жемчужно-черный'],
  ['snow white', 'Снежный белый'],
  ['ivory', 'Айвори'],
  ['wine', 'Винный'],
])

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

export function normalizeText(value) {
  const text = cleanText(value)
  if (!text) return ''
  return hasHangul(text) ? translateVehicleText(text) : text
}

export function normalizeManufacturer(value) {
  const raw = cleanText(value)
  if (!raw) return ''
  if (/renault[-\s]*korea\s*\(?\s*(samseong|samsung)?\s*\)?/i.test(raw)) return 'Renault Korea'

  const text = normalizeText(raw)
  if (!text) return ''
  if (/renault[-\s]*korea\s*\(?\s*(samseong|samsung)?\s*\)?/i.test(text)) return 'Renault Korea'
  if (/renault\s*samsung/i.test(text)) return 'Renault Korea'
  if (/kgmobilriti/i.test(text) || /kg mobility/i.test(text)) return 'KG Mobility'
  if (/ssangyong/i.test(text)) return 'SsangYong'
  return text
}

export function normalizeFuel(value) {
  const text = cleanText(value)
  if (!text) return ''
  const low = text.toLowerCase()
  if (low.includes('diesel') || text.includes('디젤')) return 'Дизель'
  if (low.includes('electric') || text.includes('전기')) return 'Электро'
  if (low.includes('lpg') || text.includes('엘피지')) return 'Газ (LPG)'
  if (low.includes('hybrid') || text.includes('하이브리드')) return 'Гибрид'
  if (low.includes('gasoline') || text.includes('가솔린') || text.includes('휘발유')) return 'Бензин'
  return normalizeText(text)
}

export function normalizeTransmission(value) {
  const text = cleanText(value)
  if (!text) return ''
  const low = text.toLowerCase()
  if (low.includes('cvt')) return 'CVT'
  if (low.includes('dct') || low.includes('dual')) return 'Робот'
  if (low.includes('auto') || text.includes('오토') || text.includes('자동')) return 'Автомат'
  if (low.includes('manual') || text.includes('수동')) return 'Механика'
  return normalizeText(text)
}

export function normalizeDrive(value) {
  const text = cleanText(value)
  if (!text) return ''
  const low = text.toLowerCase()
  if (/\bawd\b/.test(low)) return 'Полный (AWD)'
  if (/\b4wd\b/.test(low) || text.includes('사륜')) return 'Полный (4WD)'
  if (/\brwd\b/.test(low) || text.includes('후륜')) return 'Задний (RWD)'
  if (/\b(?:2wd|fwd)\b/.test(low) || text.includes('전륜')) return 'Передний (FWD)'
  return ''
}

export function inferDrive(...values) {
  for (const value of values) {
    const normalized = normalizeDrive(value)
    if (normalized) return normalized
  }
  return ''
}

export function normalizeBodyType(value) {
  const raw = cleanText(value)
  if (!raw) return ''

  const text = normalizeText(raw)
  const low = text.toLowerCase()

  if (low.includes('suv') || low === 'rv') return 'Кроссовер / внедорожник'
  if (low.includes('sedan') || raw.includes('세단')) return 'Седан'
  if (low.includes('coupe') || raw.includes('쿠페')) return 'Купе'
  if (low.includes('hatch') || raw.includes('해치백')) return 'Хэтчбек'
  if (low.includes('wagon') || raw.includes('왜건')) return 'Универсал'
  if (low.includes('van') || low.includes('minivan') || raw.includes('밴') || raw.includes('승합')) return 'Минивэн'
  if (low.includes('pickup') || raw.includes('픽업')) return 'Пикап'
  if (low.includes('truck') || low.includes('cargo') || raw.includes('화물')) return 'Грузовой / пикап'
  if (/gyeong(?:hyeong)?cha/i.test(text) || raw.includes('경차')) return 'Мини'
  if (/sohyeongcha/i.test(text) || raw.includes('소형차')) return 'Малый класс'
  if (/junjunghyeongcha/i.test(text) || raw.includes('준중형차')) return 'Компактный класс'
  if (/junghyeongcha/i.test(text) || raw.includes('중형차')) return 'Средний класс'
  if (/daehyeongcha/i.test(text) || raw.includes('대형차')) return 'Бизнес-класс'

  return text
}

function translateTrimWords(value) {
  let text = cleanText(value)
  if (!text) return ''

  for (const [source, target] of TRIM_REPLACEMENTS) {
    const pattern = new RegExp(`\\b${source.replace(/\s+/g, '\\s+')}\\b`, 'gi')
    text = text.replace(pattern, target)
  }

  return text.replace(/\s+/g, ' ').trim()
}

export function normalizeTrimLevel(...values) {
  for (const value of values) {
    let text = cleanText(value)
    if (!text) continue
    if (hasHangul(text)) text = normalizeText(text)

    const tokens = text.split(/\s+/).filter(Boolean)
    if (!tokens.length) continue
    if (tokens.every((token) => SPEC_TOKENS.test(token))) continue

    const translated = translateTrimWords(text)
    if (translated && !tokens.every((token) => SPEC_TOKENS.test(token))) {
      return translated
    }
  }

  return ''
}

export function extractShortLocation(value) {
  const raw = cleanText(value)
  if (!raw) return ''

  for (const [pattern, label] of KNOWN_CITY_RULES) {
    if (pattern.test(raw)) return label
  }

  const firstToken = raw.split(/[,\s]+/).find(Boolean) || raw
  for (const [pattern, label] of KNOWN_CITY_RULES) {
    if (pattern.test(firstToken)) return label
  }

  return normalizeText(firstToken)
}

export function normalizeColorName(value) {
  const raw = cleanText(value)
  if (!raw) return ''
  if (GENERIC_COLOR_LABELS.has(raw)) return raw

  const direct = COLOR_EXACT.get(raw) || COLOR_EXACT.get(raw.toLowerCase())
  if (direct) return direct

  if (/은회색/.test(raw)) return 'Серебристо-серый'
  if (/쥐색/.test(raw)) return 'Мокрый асфальт'
  if (/진주/.test(raw) && /(흰|백)/.test(raw)) return 'Жемчужно-белый'
  if (/진주/.test(raw) && /검|흑/.test(raw)) return 'Жемчужно-черный'
  if (/진주/.test(raw)) return 'Жемчужный'
  if (/아이보리/.test(raw)) return 'Айвори'
  if (/와인/.test(raw)) return 'Винный'
  if (/은/.test(raw) && /회/.test(raw)) return 'Серебристо-серый'
  if (/회/.test(raw) && /(짙|진|다크)/.test(raw)) return 'Темно-серый'

  const low = raw.toLowerCase()
  if (/wet asphalt|jwisaek|jwiseak/.test(low)) return 'Мокрый асфальт'
  if (/graphite|charcoal/.test(low)) return 'Графитовый'
  if (/pearl/.test(low) && /white/.test(low)) return 'Жемчужно-белый'
  if (/pearl/.test(low) && /black/.test(low)) return 'Жемчужно-черный'
  if (/pearl/.test(low)) return 'Жемчужный'
  if (/silver/.test(low) && /(gray|grey)/.test(low)) return 'Серебристо-серый'
  if (/(dark|deep)/.test(low) && /(gray|grey)/.test(low)) return 'Темно-серый'
  if (/(light)/.test(low) && /(gray|grey)/.test(low)) return 'Светло-серый'
  if (/snow/.test(low) && /white/.test(low)) return 'Снежный белый'
  if (/ivory/.test(low)) return 'Айвори'
  if (/wine/.test(low)) return 'Винный'
  if (/black/.test(low)) return 'Черный'
  if (/white/.test(low)) return 'Белый'
  if (/silver/.test(low)) return 'Серебристый'
  if (/(gray|grey)/.test(low)) return 'Серый'
  if (/blue/.test(low)) return 'Синий'
  if (/red/.test(low)) return 'Красный'
  if (/green/.test(low)) return 'Зеленый'
  if (/brown/.test(low)) return 'Коричневый'
  if (/beige/.test(low)) return 'Бежевый'
  if (/yellow/.test(low)) return 'Желтый'
  if (/orange/.test(low)) return 'Оранжевый'
  if (/(purple|violet)/.test(low)) return 'Фиолетовый'
  if (/gold/.test(low)) return 'Золотой'

  return hasHangul(raw) ? normalizeText(raw) : raw
}

export function isGenericColorLabel(value) {
  return GENERIC_COLOR_LABELS.has(cleanText(value))
}

export function extractKeyInfo({ contentsText, inspectionRows = [] } = {}) {
  const text = [
    cleanText(contentsText),
    ...inspectionRows.map((row) => cleanText([row?.label, row?.detail, row?.note, ...(row?.states || [])].join(' '))),
  ]
    .filter(Boolean)
    .join(' ')

  if (!text) return ''

  let match = text.match(/스마트키\s*(\d+)\s*개/i) || text.match(/smart\s*key\s*(\d+)/i) || text.match(/(\d+)\s*smart\s*keys?/i)
  if (match) return `Смарт-ключ: ${match[1]} шт.`

  match = text.match(/리모컨키\s*(\d+)\s*개/i) || text.match(/remote\s*key\s*(\d+)/i) || text.match(/(\d+)\s*keys?/i)
  if (match) return `Ключи: ${match[1]} шт.`

  if (/카드키|card\s*key/i.test(text)) return 'Карта-ключ'
  if (/보조키|spare\s*key/i.test(text)) return 'Есть запасной ключ'
  if (/스마트키|smart\s*key/i.test(text)) return 'Смарт-ключ'
  if (/리모컨키|remote\s*key/i.test(text)) return 'Пульт-ключ'
  if (/열쇠|키\b|keys?\b/i.test(text)) return 'Ключи есть'

  return ''
}

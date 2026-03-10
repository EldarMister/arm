import { applyTrimFixes, normalizeLocationText, normalizeRequestedRomanizedColorAlias } from '../../shared/vehicleTextFixes.js'

export const VAT_REFUND_RATE = 0.06
export const VEHICLE_ORIGIN_LABELS = Object.freeze({
  korean: 'Корейские авто',
  imported: 'Импортные авто',
})
export const PARKING_ADDRESS_KO = '인천 서구 오류동 1550'
export const PARKING_ADDRESS_EN = '1550 Oryu-dong, Seo-gu, Incheon'

const HANGUL_RE = /[\uAC00-\uD7A3]/u
const GENERIC_COLOR_LABELS = new Set([
  'Черный',
  'Чёрный',
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
])

const SHORT_LOCATION_RULES = [
  [/서울|seoul|сеул/i, 'Сеул'],
  [/인천|incheon|инчхон/i, 'Инчхон'],
  [/부산|busan|пусан/i, 'Пусан'],
  [/대구|daegu|тэгу/i, 'Тэгу'],
  [/대전|daejeon|тэджон/i, 'Тэджон'],
  [/광주|gwangju|кванджу/i, 'Кванджу'],
  [/울산|ulsan|ульсан/i, 'Ульсан'],
  [/세종|sejong|седжон/i, 'Седжон'],
  [/수원|suwon|сувон/i, 'Сувон'],
  [/용인|yongin|йонъин/i, 'Йонъин'],
  [/성남|seongnam|соннам/i, 'Соннам'],
  [/안산|ansan|ансан/i, 'Ансан'],
  [/천안|cheonan|чхонан/i, 'Чхонан'],
  [/제주|jeju|чеджу/i, 'Чеджу'],
  [/경기|gyeonggi|кёнги/i, 'Кёнги'],
  [/경북|gyeongbuk|кёнбук/i, 'Кёнбук'],
  [/경남|gyeongnam|кённам/i, 'Кённам'],
  [/전북|jeonbuk|чоллабук/i, 'Чоллабук'],
  [/전남|jeonnam|чолланам/i, 'Чолланам'],
  [/충북|chungbuk|чхунчхонбук/i, 'Чхунчхонбук'],
  [/충남|chungnam|чхунчхоннам/i, 'Чхунчхоннам'],
]

const TRIM_REPLACEMENTS = [
  ['choegogeuphyeong', 'Максимальная'],
  ['gibonhyeong', 'Базовая'],
  ['kaelrigeuraepi', 'Каллиграфия'],
  ['geuraebiti', 'Гравити'],
  ['bijeon', 'Вижен'],
  ['seupesyeol', 'Спешл'],
  ['direokseu', 'Делюкс'],
  ['intelrijeonteu', 'Интеллиджент'],
  ['maseuteojeu', 'Мастер'],
  ['koeo', 'Коре'],
  ['rimujin', 'Лимузин'],
  ['raunji', 'Лаунж'],
  ['teurendi', 'Тренди'],
  ['kaempingka', 'Кемпер'],
  ['camping car', 'Кемпер'],
  ['idongsamucha', 'Мобильный офис'],
  ['hairimujin', 'Хай-Лимузин'],
  ['hailimujin', 'Хай-Лимузин'],
  ['4inseung', '4 мест'],
  ['7inseung', '7 мест'],
  ['9inseung', '9 мест'],
  ['peulreoseu', 'Плюс'],
  ['plus', 'Плюс'],
  ['peurimieo', 'Премьер'],
  ['peurimio', 'Премьер'],
  ['premier', 'Премьер'],
  ['the essential', 'Р­СЃСЃРµРЅС€Р»'],
  ['essential', 'Р­СЃСЃРµРЅС€Р»'],
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

const TITLE_SAFE_TRIM_SOURCES = [
  'choegogeuphyeong',
  'gibonhyeong',
  'kaelrigeuraepi',
  'geuraebiti',
  'bijeon',
  'seupesyeol',
  'direokseu',
  'intelrijeonteu',
  'maseuteojeu',
  'koeo',
  'rimujin',
  'raunji',
  'teurendi',
  'kaempingka',
  'camping car',
  'idongsamucha',
  'hairimujin',
  'hailimujin',
  '4inseung',
  '7inseung',
  '9inseung',
  'peulreoseu',
  'plus',
  'peurimieo',
  'peurimio',
  'premier',
  'calligraphy',
  'prestige',
  'the essential',
  'essential',
  'luxury',
  'premium',
  'signature',
  'noblesse',
  'exclusive',
  'inspiration',
  'platinum',
  'limited',
  'executive',
  'black edition',
  'elite',
  'special',
  'best selection',
  'supreme',
  'value',
  'collection',
  'celebrity',
  'le blanc',
  'high grade',
  'prime pack',
  'hi-limousine',
  'air',
  'earth',
  'light',
  'family',
  'export',
  'school bus',
  'avenue',
  'coach',
  'dynamic',
  'iconic',
  'choice',
  '1 million',
  '5-door',
  'top',
  'libic',
]
const PASSENGER_COUNT_TRIM_RE = /\b\d+\s*inseung\b/i
const DOOR_COUNT_TRIM_RE = /\b\d+\s*(?:ddeo|doeo|door)\b/i

const SUSPICIOUS_DUPLICATE_INTERIOR_COLORS = new Set([
  'Белый',
  'Серебристый',
  'Красный',
  'Синий',
  'Зеленый',
  'Желтый',
  'Оранжевый',
  'Фиолетовый',
  'Жемчужно-белый',
  'Снежный белый',
  'Золотой',
  'Мокрый асфальт',
  'Графитовый',
])

const BODY_CLASS_LABELS = new Set([
  'Малый класс',
  'Компактный класс',
  'Средний класс',
  'Бизнес-класс',
])

const SUV_BODY_HINT_RE = /\b(santa[\s-]*fe|santafe|tucson|sorento|sportage|seltos|palisade|mohave|trailblazer|trax|qm6|gv60|gv70|gv80|korando|tivoli|niro|kona|torres)\b/i
const MINIVAN_BODY_HINT_RE = /\b(carnival|staria|starex|orlando|master)\b/i
const MINI_BODY_HINT_RE = /\b(casper|morning|spark|ray)\b/i
const PICKUP_BODY_HINT_RE = /\b(korando\s+sports|rexton\s+sports|sports\s+cx7|pickup)\b/i
const SEDAN_BODY_HINT_RE = /\b(k3|k5|k7|k8|k9|avante|elantra|sonata|grandeur|g70|g80|g90|eq900|sm3|sm5|sm6|sm7|malibu|impala|cts|s80|s90|camry|accord)\b/i
const HATCH_BODY_HINT_RE = /\b(ioniq|aionik|i30|ceed|cee['’ -]?d|picanto|morning|spark|matiz|golf|polo|veloster|brio)\b/i
const WAGON_BODY_HINT_RE = /\b(wagon|estate|touring|shooting\s*brake)\b/i
const COUPE_BODY_HINT_RE = /\b(coupe|genesis\s+coupe|86|brz)\b/i
const CABRIO_BODY_HINT_RE = /\b(cabrio|cabriolet|convertible|roadster)\b/i
const KOREAN_VEHICLE_ORIGIN_RE = /\b(kia|gia|hyundai|hyeondae|genesis|jenesiseu|chevrolet|daewoo|renault(?:\s+korea|\s+samsung)?|renault samsung|reunokoria|samsung|samseong|ssangyong|kg\s*mobility|kgmobilriti)\b/i
const KOREAN_VEHICLE_MODEL_RE = /\b(sm3|sm5|sm6|sm7|qm3|qm5|qm6|xm3|k3|k5|k7|k8|k9|g70|g80|g90|gv60|gv70|gv80|eq900|avante|elantra|sonata|grandeur|azera|santafe|santa\s*fe|tucson|palisade|staria|starex|porter|bongo|casper|morning|ray|carnival|sorento|sportage|seltos|mohave|niro|kona|orlando|trax|malibu|spark|matiz|rexton|korando|tivoli|torres|musso|bolteu|bolt|ioniq|aionik|veloster|soul|ssoul|ev3|ev4|ev5|ev6|ev9)\b/i

function normalizeRawBodyLabel(value) {
  const raw = cleanText(value)
  if (!raw) return ''
  const low = raw.toLowerCase()

  if (low === 'suv' || low === 'rv') return 'Кроссовер / внедорожник'
  if (low === 'вэн' || low === 'van' || low === 'minivan') return 'Минивэн'
  if (low === '-') return ''
  return raw
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalizeRomanizedColorAlias(value) {
  const low = cleanText(value).toLowerCase()
  if (!low) return ''

  if (/^(galsaek|galdaesaek)$/.test(low)) return '\u041A\u043E\u0440\u0438\u0447\u043D\u0435\u0432\u044B\u0439'
  if (/^(borasaek|jajusaek)$/.test(low)) return '\u0424\u0438\u043E\u043B\u0435\u0442\u043E\u0432\u044B\u0439'
  if (/^haneulsaek$/.test(low)) return '\u0421\u0438\u043D\u0438\u0439'
  if (/^(dampoksaek|damnoksaek|damnogsaek)$/.test(low)) return '\u0417\u0435\u043B\u0435\u043D\u044B\u0439'

  return ''
}

export function classifyVehicleOrigin(...values) {
  const text = values
    .map((value) => cleanText(value))
    .filter(Boolean)
    .join(' ')

  if (!text) return ''
  if (KOREAN_VEHICLE_ORIGIN_RE.test(text) || KOREAN_VEHICLE_MODEL_RE.test(text)) {
    return VEHICLE_ORIGIN_LABELS.korean
  }
  return VEHICLE_ORIGIN_LABELS.imported
}

function hasKnownTrimKeyword(value) {
  const text = cleanText(value)
  if (!text) return false
  if (PASSENGER_COUNT_TRIM_RE.test(text)) return true
  if (DOOR_COUNT_TRIM_RE.test(text)) return true

  return TRIM_REPLACEMENTS.some(([source]) => {
    const pattern = new RegExp(`\\b${source.replace(/\s+/g, '\\s+')}\\b`, 'i')
    return pattern.test(text)
  })
}

function isTrimNoise(value) {
  const text = cleanText(value)
  if (!text) return false
  if (hasKnownTrimKeyword(text)) return false

  const signal = text.replace(/[\s()[\]{}\\/|+_.:-]+/g, '')
  if (!signal || !/[A-Za-zА-Яа-я0-9]/u.test(signal)) return true
  if (/[\\/()]/.test(text)) return true
  return false
}

export function hasHangulText(value) {
  return HANGUL_RE.test(String(value || ''))
}

export function normalizeTrimLabel(value) {
  let text = cleanText(value)
  if (!text) return ''

  for (const [source, target] of TRIM_REPLACEMENTS) {
    const pattern = new RegExp(`\\b${source.replace(/\s+/g, '\\s+')}\\b`, 'gi')
    text = text.replace(pattern, target)
  }

  text = applyTrimFixes(text)
  text = text.replace(/\s+/g, ' ').trim()
  return isTrimNoise(text) ? '' : text
}

export function extractTrimLabelFromTitle(...values) {
  const candidates = []

  for (const value of values) {
    const text = cleanText(value)
    if (!text) continue

    const passengerMatch = text.match(PASSENGER_COUNT_TRIM_RE)
    if (passengerMatch) {
      const normalized = normalizeTrimLabel(passengerMatch[0])
      if (normalized && !candidates.includes(normalized)) candidates.push(normalized)
    }

    const doorMatch = text.match(DOOR_COUNT_TRIM_RE)
    if (doorMatch) {
      const normalized = normalizeTrimLabel(doorMatch[0])
      if (normalized && !candidates.includes(normalized)) candidates.push(normalized)
    }

    for (const source of TITLE_SAFE_TRIM_SOURCES) {
      const pattern = new RegExp(`\\b${source.replace(/\s+/g, '\\s+')}\\b`, 'i')
      const match = text.match(pattern)
      if (!match) continue

      const index = match.index ?? -1
      const tail = index >= 0 ? text.slice(index).trim() : match[0]
      const trailingWordCount = tail.split(/\s+/).length - match[0].split(/\s+/).length
      if (trailingWordCount > 2) continue

      const normalized = normalizeTrimLabel(match[0])
      if (normalized && !candidates.includes(normalized)) candidates.push(normalized)
    }
  }

  return candidates[0] || ''
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function stripTrailingTrimLabel(value, trimLabel) {
  const text = cleanText(value)
  const trim = normalizeTrimLabel(trimLabel)
  if (!text || !trim) return text

  const pattern = new RegExp(`(?:\\s+|[(/-])${escapeRegex(trim)}\\)?$`, 'i')
  return text.replace(pattern, '').replace(/\s+/g, ' ').trim()
}

export function appendDisplayTrimSuffix(value, trimLabel) {
  const text = cleanText(value)
  const trim = normalizeTrimLabel(trimLabel)
  if (!text) return ''
  if (trim !== 'Плюс') return text
  if (/\bplus\b/i.test(text)) return text
  return `${text} Plus`.replace(/\s+/g, ' ').trim()
}

function inferPassengerBodyTypeFromText(...values) {
  const text = values
    .map((value) => cleanText(value))
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (!text) return ''
  if (PICKUP_BODY_HINT_RE.test(text)) return 'Грузовой / пикап'
  if (MINIVAN_BODY_HINT_RE.test(text)) return 'Минивэн'
  if (MINI_BODY_HINT_RE.test(text)) return 'Мини'
  if (CABRIO_BODY_HINT_RE.test(text)) return 'Кабриолет'
  if (WAGON_BODY_HINT_RE.test(text)) return 'Универсал'
  if (COUPE_BODY_HINT_RE.test(text)) return 'Купе'
  if (HATCH_BODY_HINT_RE.test(text) || /\bhatch|sportback|fastback|liftback\b/i.test(text)) return 'Хэтчбек'
  if (SEDAN_BODY_HINT_RE.test(text) || /\bsedan\b/i.test(text)) return 'Седан'
  if (SUV_BODY_HINT_RE.test(text)) return 'Кроссовер / внедорожник'
  return ''
}

export function isWeakBodyTypeLabel(value) {
  const text = cleanText(value)
  if (!text || text === '-') return true
  return BODY_CLASS_LABELS.has(text)
}

export function resolveDisplayBodyTypeLabel(bodyValue, ...contextValues) {
  const normalized = normalizeRawBodyLabel(bodyValue)
  const actual = inferPassengerBodyTypeFromText(normalized, ...contextValues)

  if (
    actual &&
    (
      !normalized ||
      BODY_CLASS_LABELS.has(normalized) ||
      normalized === 'Кроссовер / внедорожник' ||
      normalized === 'Минивэн' ||
      normalized === 'Мини'
    )
  ) {
    return actual
  }

  if (
    normalized === 'Мини' ||
    normalized === 'Кроссовер / внедорожник' ||
    normalized === 'Пикап' ||
    normalized === 'Грузовой / пикап' ||
    normalized === 'Минивэн' ||
    normalized === 'Седан' ||
    normalized === 'Купе' ||
    normalized === 'Кабриолет' ||
    normalized === 'Хэтчбек' ||
    normalized === 'Универсал'
  ) {
    return normalized
  }

  if (actual) return actual
  if (BODY_CLASS_LABELS.has(normalized)) return ''
  return normalized
}

export function normalizeColorLabel(value) {
  const raw = cleanText(value)
  if (!raw) return ''
  if (GENERIC_COLOR_LABELS.has(raw)) return finalizeDisplayColorLabel(raw)

  const requestedAlias = normalizeRequestedRomanizedColorAlias(raw)
  if (requestedAlias) return finalizeDisplayColorLabel(requestedAlias)

  const romanizedAlias = normalizeRomanizedColorAlias(raw)
  if (romanizedAlias) return finalizeDisplayColorLabel(romanizedAlias)

  const low = raw.toLowerCase()

  if (/^(geomeunsaek|geomjeongsaek|heugsaek)$/.test(low)) return 'Черный'
  if (/^(baegsaek|huinsaek)$/.test(low)) return 'Белый'
  if (/^eunsaek$/.test(low)) return 'Серебристый'
  if (/^eunhasaek$/.test(low)) return 'Серебристо-зеленый'
  if (/^(hoesaek|jwisaek|jwiseak)$/.test(low)) return /^(jwisaek|jwiseak)$/.test(low) ? 'Мокрый асфальт' : 'Серый'
  if (/^(cheongsaek|parangsaek)$/.test(low)) return 'Синий'
  if (/^(ppalgangsaek|ppalgansaek|hongsaek)$/.test(low)) return 'Красный'
  if (/^(noksaek|choroksaek)$/.test(low)) return 'Зеленый'
  if (/^(galsaek|galdaesaek)$/.test(low)) return 'Коричневый'
  if (/^beijisaek$/.test(low)) return 'Бежевый'
  if (/^juhwangsaek$/.test(low)) return 'Оранжевый'
  if (/^norangsaek$/.test(low)) return 'Желтый'
  if (/^borasaek$/.test(low)) return 'Фиолетовый'

  if (/쥐색|wet asphalt|jwisaek|jwiseak/i.test(raw)) return 'Мокрый асфальт'
  if (/은회색|silver\s*(gray|grey)/i.test(raw)) return finalizeDisplayColorLabel('Серебристо-серый')
  if (/진주.*(흰|백)|pearl white/i.test(raw)) return 'Жемчужно-белый'
  if (/진주.*(검|흑)|pearl black/i.test(raw)) return 'Жемчужно-черный'
  if (/진주|pearl/i.test(raw)) return 'Жемчужный'
  if (/graphite|charcoal/i.test(raw)) return 'Графитовый'
  if (/(dark|deep).*(gray|grey)|회색.*(다크|짙|진)/i.test(raw)) return 'Темно-серый'
  if (/(light).*(gray|grey)/i.test(raw)) return 'Светло-серый'
  if (/snow.*white/i.test(raw)) return 'Снежный белый'
  if (/ivory|아이보리/i.test(raw)) return 'Айвори'
  if (/wine|와인/i.test(raw)) return 'Винный'
  if (/black|검정|흑색/i.test(raw)) return 'Черный'
  if (/white|흰색|백색/i.test(raw)) return 'Белый'
  if (/silver\s*green|green\s*silver|은하색/i.test(raw)) return 'Серебристо-зеленый'
  if (/silver|은색/i.test(raw)) return 'Серебристый'
  if (/gray|grey|회색/i.test(raw)) return 'Серый'
  if (/blue|청색|파란색|남색|네이비/i.test(raw)) return /남색|네이비/i.test(raw) ? 'Темно-синий' : 'Синий'
  if (/red|적색|빨강색/i.test(raw)) return 'Красный'
  if (/green|녹색|초록색/i.test(raw)) return 'Зеленый'
  if (/brown|갈색|브라운/i.test(raw)) return 'Коричневый'
  if (/beige|베이지/i.test(raw)) return 'Бежевый'
  if (/yellow|노란|노랑/i.test(raw)) return 'Желтый'
  if (/orange|주황/i.test(raw)) return 'Оранжевый'
  if (/purple|violet|보라/i.test(raw)) return 'Фиолетовый'
  if (/gold|금색/i.test(raw)) return finalizeDisplayColorLabel('Золотой')

  return finalizeDisplayColorLabel(raw)
}

function finalizeDisplayColorLabel(value) {
  const text = cleanText(value)
  if (!text) return ''
  if (text === 'Золотистый') return 'Золотой'
  if (text === 'Ярко-серебристый') return 'Серебристый'
  if (text === 'Серебристо-серый') return 'Серебристый'
  if (text === 'Белый двухцветный') return 'Белый / черная крыша'
  return text
}

export function isWeakColorValue(value) {
  const text = cleanText(value)
  if (!text || text === '-') return true
  if (/^[a-z]+saek$/i.test(text.replace(/[\s_-]/g, ''))) return true
  return GENERIC_COLOR_LABELS.has(text)
}

export function getShortLocationLabel(value, fallback = 'Корея') {
  const raw = cleanText(value)
  if (!raw) return fallback

  for (const [pattern, label] of SHORT_LOCATION_RULES) {
    if (pattern.test(raw)) return label
  }

  const normalized = normalizeLocationText(raw)
  for (const [pattern, label] of SHORT_LOCATION_RULES) {
    if (pattern.test(normalized)) return label
  }

  const firstToken = normalized.split(/[,\s]+/).find(Boolean) || normalized
  for (const [pattern, label] of SHORT_LOCATION_RULES) {
    if (pattern.test(firstToken)) return label
  }

  return firstToken || fallback
}

export function normalizeKeyInfoLabel(value) {
  return cleanText(value)
}

export function normalizeInteriorColorLabel(interiorValue, bodyValue = '') {
  const interiorRaw = cleanText(interiorValue)
  if (!interiorRaw) return ''

  const normalizedInterior = normalizeColorLabel(interiorRaw)
  const normalizedBody = normalizeColorLabel(bodyValue)

  if (
    interiorRaw &&
    bodyValue &&
    interiorRaw.toLowerCase() === cleanText(bodyValue).toLowerCase() &&
    normalizedInterior === normalizedBody &&
    SUSPICIOUS_DUPLICATE_INTERIOR_COLORS.has(normalizedInterior)
  ) {
    return ''
  }

  return normalizedInterior
}

export function getColorSwatch(value) {
  const text = normalizeColorLabel(value).toLowerCase()
  if (/\u0440\u043e\u0437\u043e\u0432/i.test(text)) return '#f472b6'
  if (/\u0431\u0438\u0440\u044e\u0437/i.test(text)) return '#14b8a6'
  if (/\u043d\u0435\u0431\u0435\u0441\u043d\u043e-\u0433\u043e\u043b\u0443\u0431/i.test(text)) return '#60a5fa'
  if (/\u0431\u043e\u0440\u0434\u043e\u0432|wine/i.test(text)) return '#7f1d1d'
  if (/\u0441\u0432\u0435\u0442\u043b\u043e-\u0437\u0435\u043b\u0435\u043d/i.test(text)) return '#86efac'
  if (/\u0437\u043e\u043b\u043e\u0442/i.test(text)) return '#d4a72c'
  if (/\u0436\u0435\u043c\u0447\u0443\u0436|pearl/i.test(text)) return '#e7eaef'
  if (/\u0430\u0439\u0432\u043e\u0440\u0438|ivory/i.test(text)) return '#f3ead8'
  if (/\u0432\u0438\u043d\u043d|wine/i.test(text)) return '#7f1d1d'
  if (text.includes('серебристо-зелен')) return '#a8b7a1'
  if (text.includes('черная крыша')) return '#f8fafc'

  if (text.includes('черн')) return '#101010'
  if (text.includes('бел')) return '#f8fafc'
  if (text.includes('мокрый асфальт')) return '#5b6470'
  if (text.includes('графит')) return '#505862'
  if (text.includes('серебрист')) return '#cbd5e1'
  if (text.includes('темно-синий')) return '#1e3a8a'
  if (text.includes('син')) return '#2563eb'
  if (text.includes('крас')) return '#dc2626'
  if (text.includes('зелен')) return '#16a34a'
  if (text.includes('корич')) return '#7c4a1d'
  if (text.includes('беж')) return '#d6c1a1'
  if (text.includes('жел')) return '#eab308'
  if (text.includes('оранж')) return '#f97316'
  if (text.includes('фиолет')) return '#7c3aed'
  if (text.includes('золот')) return '#c9971a'
  if (text.includes('сер')) return '#6b7280'

  return '#cbd5e1'
}

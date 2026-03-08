import { hasHangul, translateVehicleText } from '../scraper/translator.js'
import { applyTrimFixes, normalizeLocationText, normalizeRequestedRomanizedColorAlias } from '../../shared/vehicleTextFixes.js'

export const PARKING_ADDRESS_KO = '인천 서구 오류동 1550'
export const PARKING_ADDRESS_EN = '1550 Oryu-dong, Seo-gu, Incheon'
export const VEHICLE_ORIGIN_LABELS = Object.freeze({
  korean: 'Корейские авто',
  imported: 'Импортные авто',
})
export const KOREAN_VEHICLE_SQL_PATTERNS = Object.freeze([
  '%kia%',
  '%\uAE30\uC544%',
  '%hyundai%',
  '%\uD604\uB300%',
  '%genesis%',
  '%\uC81C\uB124\uC2DC\uC2A4%',
  '%chevrolet%',
  '%\uC250\uBCF4\uB808%',
  '%daewoo%',
  '%\uB300\uC6B0%',
  '%renault%',
  '%reunokoria%',
  '%\uB974\uB178%',
  '%samsung%',
  '%samseong%',
  '%\uC0BC\uC131%',
  '%ssangyong%',
  '%\uC30D\uC6A9%',
  '%kg mobility%',
  '%kgmobilriti%',
  '%\uBAA8\uBE4C\uB9AC\uD2F0%',
  '%avante%',
  '%elantra%',
  '%sonata%',
  '%grandeur%',
  '%azera%',
  '%santafe%',
  '%santa fe%',
  '%tucson%',
  '%palisade%',
  '%staria%',
  '%starex%',
  '%porter%',
  '%bongo%',
  '%casper%',
  '%morning%',
  '%ray%',
  '%carnival%',
  '%sorento%',
  '%sportage%',
  '%seltos%',
  '%mohave%',
  '%niro%',
  '%kona%',
  '%orlando%',
  '%trax%',
  '%malibu%',
  '%spark%',
  '%matiz%',
  '%rexton%',
  '%korando%',
  '%tivoli%',
  '%torres%',
  '%musso%',
  '%bolteu%',
  '%bolt%',
  '%ioniq%',
  '%aionik%',
  '%veloster%',
  '%sm3%',
  '%sm5%',
  '%sm6%',
  '%sm7%',
  '%qm3%',
  '%qm5%',
  '%qm6%',
  '%xm3%',
  '%k3%',
  '%k5%',
  '%k7%',
  '%k8%',
  '%k9%',
  '%g70%',
  '%g80%',
  '%g90%',
  '%gv60%',
  '%gv70%',
  '%gv80%',
  '%eq900%',
])

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
  ['the essential', 'Эссеншел'],
  ['essential', 'Эссеншел'],
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

const KNOWN_CITY_RULES = [
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

const COLOR_EXACT = new Map([
  ['검정색', 'Черный'],
  ['흑색', 'Черный'],
  ['흰색', 'Белый'],
  ['백색', 'Белый'],
  ['은색', 'Серебристый'],
  ['은하색', 'Серебристо-зеленый'],
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
  ['silver green', 'Серебристо-зеленый'],
  ['green silver', 'Серебристо-зеленый'],
])

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

export function normalizeText(value) {
  const text = cleanText(value)
  if (!text) return ''
  return hasHangul(text) ? translateVehicleText(text) : text
}

function resolveTitleTrimSuffix(...values) {
  for (const value of values) {
    const raw = cleanText(value)
    if (!raw) continue

    const normalized = normalizeText(raw)
    if (normalized === 'Плюс') return 'Plus'
    if (/\b(?:plus|peulreoseu)\b/i.test(normalized)) return 'Plus'
    if (/플러스/.test(raw)) return 'Plus'
  }

  return ''
}

export function appendTitleTrimSuffix(value, ...trimValues) {
  const text = cleanText(value)
  if (!text) return ''

  const suffix = resolveTitleTrimSuffix(...trimValues)
  if (!suffix) return text
  if (new RegExp(`\\b${suffix}\\b`, 'i').test(text)) return text
  return `${text} ${suffix}`.replace(/\s+/g, ' ').trim()
}

export function normalizeManufacturer(value) {
  const raw = cleanText(value)
  if (!raw) return ''
  if (/renault[-\s]*korea\s*\(?\s*(samseong|samsung)?\s*\)?/i.test(raw)) return 'Renault Korea'
  if (/reunokoria\s*\(?\s*(samseong|samsung)?\s*\)?/i.test(raw)) return 'Renault Korea'

  const text = normalizeText(raw)
  if (!text) return ''
  if (/renault[-\s]*korea\s*\(?\s*(samseong|samsung)?\s*\)?/i.test(text)) return 'Renault Korea'
  if (/renault\s*samsung/i.test(text)) return 'Renault Korea'
  if (/reunokoria\s*\(?\s*(samseong|samsung)?\s*\)?/i.test(text)) return 'Renault Korea'
  if (/kgmobilriti/i.test(text) || /kg mobility/i.test(text)) return 'KG Mobility'
  if (/ssangyong/i.test(text)) return 'SsangYong'
  return text
}

const LEGACY_RENAULT_SAMSUNG_MODEL_RE = /\b(sm3|sm5|sm6|sm7|qm3|qm5|qm6|xm3)\b/i
const KOREAN_VEHICLE_ORIGIN_RE = /\b(kia|gia|hyundai|hyeondae|genesis|jenesiseu|chevrolet|daewoo|renault(?:\s+korea|\s+samsung)?|reunokoria|samsung|samseong|ssangyong|kg\s*mobility|kgmobilriti)\b/i
const KOREAN_VEHICLE_ORIGIN_HANGUL_RE = /\uAE30\uC544|\uD604\uB300|\uC81C\uB124\uC2DC\uC2A4|\uC250\uBCF4\uB808|\uB300\uC6B0|\uB974\uB178|\uC0BC\uC131|\uC30D\uC6A9|\uBAA8\uBE4C\uB9AC\uD2F0/u
const KOREAN_VEHICLE_MODEL_RE = /\b(sm3|sm5|sm6|sm7|qm3|qm5|qm6|xm3|k3|k5|k7|k8|k9|g70|g80|g90|gv60|gv70|gv80|eq900|avante|elantra|sonata|grandeur|azera|santafe|santa\s*fe|tucson|palisade|staria|starex|porter|bongo|casper|morning|ray|carnival|sorento|sportage|seltos|mohave|niro|kona|orlando|trax|malibu|spark|matiz|rexton|korando|tivoli|torres|musso|bolteu|bolt|ioniq|aionik|veloster|soul|ssoul|ev3|ev4|ev5|ev6|ev9)\b/i

export function resolveManufacturerDisplayName(manufacturer, ...contextValues) {
  const normalized = normalizeManufacturer(manufacturer)
  if (!normalized) return ''

  if (normalized === 'Renault Korea') {
    const context = [manufacturer, normalized, ...contextValues]
      .map((value) => cleanText(value))
      .filter(Boolean)
      .join(' ')

    if (
      LEGACY_RENAULT_SAMSUNG_MODEL_RE.test(context) ||
      /samseong|samsung|르노삼성/i.test(context)
    ) {
      return 'Renault Samsung'
    }
  }

  return normalized
}

export function classifyVehicleOrigin(...values) {
  const text = values
    .map((value) => cleanText(value))
    .filter(Boolean)
    .join(' ')

  if (!text) return ''
  if (
    KOREAN_VEHICLE_ORIGIN_RE.test(text) ||
    KOREAN_VEHICLE_ORIGIN_HANGUL_RE.test(text) ||
    KOREAN_VEHICLE_MODEL_RE.test(text)
  ) {
    return VEHICLE_ORIGIN_LABELS.korean
  }

  return VEHICLE_ORIGIN_LABELS.imported
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

function normalizeRawBodyLabel(value) {
  const raw = cleanText(value)
  if (!raw) return ''
  const low = raw.toLowerCase()

  if (low === 'suv' || low === 'rv') return 'Кроссовер / внедорожник'
  if (low === 'вэн' || low === 'van' || low === 'minivan') return 'Минивэн'
  if (low === '-') return ''
  return raw
}

export function normalizeBodyType(value) {
  const raw = cleanText(value)
  if (!raw) return ''

  const text = normalizeText(raw)
  const low = text.toLowerCase()

  if (low.includes('suv') || low === 'rv') return 'Кроссовер / внедорожник'
  if (low.includes('sedan') || raw.includes('세단')) return 'Седан'
  if (low.includes('coupe') || raw.includes('쿠페')) return 'Купе'
  if (low.includes('cabrio') || low.includes('cabriolet') || low.includes('convertible') || raw.includes('컨버터블')) return 'Кабриолет'
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

export function isWeakBodyType(value) {
  const text = cleanText(value)
  if (!text || text === '-') return true
  return BODY_CLASS_LABELS.has(text)
}

export function resolveBodyType(...values) {
  const [bodyValue, ...contextValues] = values
  const normalized = normalizeBodyType(normalizeRawBodyLabel(bodyValue))
  const inferred = inferPassengerBodyTypeFromText(normalized, ...contextValues)

  if (
    inferred &&
    (
      !normalized ||
      BODY_CLASS_LABELS.has(normalized) ||
      normalized === 'Кроссовер / внедорожник' ||
      normalized === 'Минивэн' ||
      normalized === 'Мини'
    )
  ) {
    return inferred
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

  if (inferred) return inferred
  if (BODY_CLASS_LABELS.has(normalized)) return ''
  return normalized
}

function translateTrimWords(value) {
  let text = cleanText(value)
  if (!text) return ''

  for (const [source, target] of TRIM_REPLACEMENTS) {
    const pattern = new RegExp(`\\b${source.replace(/\s+/g, '\\s+')}\\b`, 'gi')
    text = text.replace(pattern, target)
  }

  return applyTrimFixes(text).replace(/\s+/g, ' ').trim()
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
    if (translated && !tokens.every((token) => SPEC_TOKENS.test(token)) && !isTrimNoise(translated)) {
      return translated
    }
  }

  return ''
}

export function extractTrimLevelFromTitle(...values) {
  const candidates = []

  for (const value of values) {
    const text = cleanText(value)
    if (!text) continue

    const passengerMatch = text.match(PASSENGER_COUNT_TRIM_RE)
    if (passengerMatch) {
      const normalized = translateTrimWords(passengerMatch[0])
      if (normalized && !candidates.includes(normalized)) candidates.push(normalized)
    }

    const doorMatch = text.match(DOOR_COUNT_TRIM_RE)
    if (doorMatch) {
      const normalized = translateTrimWords(doorMatch[0])
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

      const normalized = translateTrimWords(match[0])
      if (normalized && !candidates.includes(normalized)) candidates.push(normalized)
    }
  }

  return candidates[0] || ''
}

export function extractShortLocation(value) {
  const raw = cleanText(value)
  if (!raw) return ''

  for (const [pattern, label] of KNOWN_CITY_RULES) {
    if (pattern.test(raw)) return label
  }

  const normalized = normalizeLocationText(raw)
  for (const [pattern, label] of KNOWN_CITY_RULES) {
    if (pattern.test(normalized)) return label
  }

  const firstToken = normalized.split(/[,\s]+/).find(Boolean) || normalized
  for (const [pattern, label] of KNOWN_CITY_RULES) {
    if (pattern.test(firstToken)) return label
  }

  return firstToken
}

export function normalizeLocationName(value) {
  const raw = cleanText(value)
  if (!raw) return ''

  const translated = normalizeLocationText(raw)
  if (!translated) return ''
  if (!hasHangul(translated)) return translated

  return extractShortLocation(translated) || extractShortLocation(raw) || translated
}

export function normalizeColorName(value) {
  const raw = cleanText(value)
  if (!raw) return ''
  if (GENERIC_COLOR_LABELS.has(raw)) return raw

  const requestedAlias = normalizeRequestedRomanizedColorAlias(raw)
  if (requestedAlias) return requestedAlias

  const romanizedAlias = normalizeRomanizedColorAlias(raw)
  if (romanizedAlias) return romanizedAlias

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
  if (/^(geomeunsaek|geomjeongsaek|heugsaek)$/.test(low)) return 'Черный'
  if (/^(baegsaek|huinsaek)$/.test(low)) return 'Белый'
  if (/^eunsaek$/.test(low)) return 'Серебристый'
  if (/^eunhasaek$/.test(low)) return 'Серебристо-зеленый'
  if (/^(hoesaek|jwisaek|jwiseak)$/.test(low)) return /^(jwisaek|jwiseak)$/.test(low) ? 'Мокрый асфальт' : 'Серый'
  if (/^(cheongsaek|parangsaek)$/.test(low)) return 'Синий'
  if (/^(ppalgangsaek|ppalgansaek|hongsaek)$/.test(low)) return 'Красный'
  if (/^(noksaek|choroksaek)$/.test(low)) return 'Зеленый'
  if (/^galsaek$/.test(low)) return 'Коричневый'
  if (/^beijisaek$/.test(low)) return 'Бежевый'
  if (/^juhwangsaek$/.test(low)) return 'Оранжевый'
  if (/^norangsaek$/.test(low)) return 'Желтый'
  if (/^borasaek$/.test(low)) return 'Фиолетовый'

  if (/wet asphalt|jwisaek|jwiseak/.test(low)) return 'Мокрый асфальт'
  if (/graphite|charcoal/.test(low)) return 'Графитовый'
  if (/pearl/.test(low) && /white/.test(low)) return 'Жемчужно-белый'
  if (/pearl/.test(low) && /black/.test(low)) return 'Жемчужно-черный'
  if (/pearl/.test(low)) return 'Жемчужный'
  if (/silver/.test(low) && /(gray|grey)/.test(low)) return 'Серебристо-серый'
  if (/silver/.test(low) && /green/.test(low)) return 'Серебристо-зеленый'
  if (/green/.test(low) && /silver/.test(low)) return 'Серебристо-зеленый'
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

  if (!hasHangul(raw)) return raw

  const translated = normalizeText(raw)
  return normalizeRequestedRomanizedColorAlias(translated) || translated
}

export function normalizeInteriorColorName(value, bodyValue = '') {
  const rawInterior = cleanText(value)
  if (!rawInterior) return ''

  const normalizedInterior = normalizeColorName(rawInterior)
  const normalizedBody = normalizeColorName(bodyValue)

  if (
    rawInterior &&
    bodyValue &&
    rawInterior.toLowerCase() === cleanText(bodyValue).toLowerCase() &&
    normalizedInterior === normalizedBody &&
    SUSPICIOUS_DUPLICATE_INTERIOR_COLORS.has(normalizedInterior)
  ) {
    return ''
  }

  return normalizedInterior
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

export const VAT_REFUND_RATE = 0.063
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

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
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

  return text.replace(/\s+/g, ' ').trim()
}

export function normalizeColorLabel(value) {
  const raw = cleanText(value)
  if (!raw) return ''
  if (GENERIC_COLOR_LABELS.has(raw)) return raw

  const low = raw.toLowerCase()

  if (/쥐색|wet asphalt|jwisaek|jwiseak/i.test(raw)) return 'Мокрый асфальт'
  if (/은회색|silver\s*(gray|grey)/i.test(raw)) return 'Серебристо-серый'
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
  if (/gold|금색/i.test(raw)) return 'Золотой'

  return raw
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

  const firstToken = raw.split(/[,\s]+/).find(Boolean) || raw
  for (const [pattern, label] of SHORT_LOCATION_RULES) {
    if (pattern.test(firstToken)) return label
  }

  return firstToken || fallback
}

export function normalizeKeyInfoLabel(value) {
  return cleanText(value)
}

export function getColorSwatch(value) {
  const text = normalizeColorLabel(value).toLowerCase()
  if (/\u0436\u0435\u043c\u0447\u0443\u0436|pearl/i.test(text)) return '#e7eaef'
  if (/\u0430\u0439\u0432\u043e\u0440\u0438|ivory/i.test(text)) return '#f3ead8'
  if (/\u0432\u0438\u043d\u043d|wine/i.test(text)) return '#7f1d1d'

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

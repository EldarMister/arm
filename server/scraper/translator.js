export const MANUFACTURER_MAP = {
  '현대': 'Hyundai',
  '기아': 'Kia',
  '제네시스': 'Genesis',
  '쌍용': 'SsangYong',
  '르노삼성': 'Renault Samsung',
  '르노코리아': 'Renault Korea',
  '쉐보레': 'Chevrolet',
  '쉐보레(GM대우)': 'Chevrolet',
  'BMW': 'BMW',
  '벤츠': 'Mercedes-Benz',
  '아우디': 'Audi',
  '폭스바겐': 'Volkswagen',
  '볼보': 'Volvo',
  '포르쉐': 'Porsche',
  '렉서스': 'Lexus',
  '도요타': 'Toyota',
  '혼다': 'Honda',
  '닛산': 'Nissan',
  '미니': 'MINI',
  '재규어': 'Jaguar',
  '랜드로버': 'Land Rover',
  '마세라티': 'Maserati',
  '페라리': 'Ferrari',
  '람보르기니': 'Lamborghini',
  '롤스로이스': 'Rolls-Royce',
  '벤틀리': 'Bentley',
  '테슬라': 'Tesla',
  '링컨': 'Lincoln',
  '캐딜락': 'Cadillac',
  '크라이슬러': 'Chrysler',
  '지프': 'Jeep',
}

export const FUEL_MAP = {
  '가솔린': 'Бензин',
  '디젤': 'Дизель',
  '전기': 'Электро',
  'LPG': 'Газ (LPG)',
  '가솔린+전기(하이브리드)': 'Бензин(гибрид)',
  '가솔린+전기': 'Бензин(гибрид)',
  '디젤+전기': 'Дизель(гибрид)',
  '수소': 'Водород',
  '가솔린+LPG': 'Бензин+Газ',
  '수소연료전지': 'Водород(FC)',
}

export const GEAR_MAP = {
  '오토': 'Автомат',
  '자동': 'Автомат',
  '수동': 'Механика',
  '세미오토': 'Робот',
  'CVT': 'CVT',
}

export const COLOR_MAP = {
  '흰색': 'Белый',
  '백색': 'Белый',
  '순백색': 'Белоснежный',
  '검정색': 'Чёрный',
  '흑색': 'Чёрный',
  '회색': 'Серый',
  '은색': 'Серебристый',
  '실버': 'Серебристый',
  '청색': 'Синий',
  '파란색': 'Синий',
  '남색': 'Тёмно-синий',
  '빨간색': 'Красный',
  '적색': 'Красный',
  '갈색': 'Коричневый',
  '베이지': 'Бежевый',
  '녹색': 'Зелёный',
  '초록색': 'Зелёный',
  '금색': 'Золотой',
  '주황색': 'Оранжевый',
  '보라색': 'Фиолетовый',
  '노란색': 'Жёлтый',
  '하늘색': 'Голубой',
}

export const DRIVE_MAP = {
  '2WD': 'Передний (FWD)',
  'AWD': 'Полный (AWD)',
  '4WD': 'Полный (4WD)',
  'RWD': 'Задний (RWD)',
}

export function tr(map, key) {
  if (!key) return null
  const k = String(key).trim()
  return map[k] || k
}

const VEHICLE_TEXT_REPLACE = [
  ['뉴 라이즈', 'New Rise'],
  ['더 뉴', 'The New'],
  ['올 뉴', 'All New'],
  ['더 볼드', 'The Bold'],
  ['롱레인지', 'Long Range'],
  ['디 에센셜', 'The Essential'],
  ['에센셜', 'Essential'],
  ['스마트', 'Smart'],
  ['모던', 'Modern'],
  ['럭셔리', 'Luxury'],
  ['프리미엄', 'Premium'],
  ['플래티넘', 'Platinum'],
  ['스탠다드', 'Standard'],
  ['베이직', 'Basic'],
  ['스타일', 'Style'],
  ['컴포트', 'Comfort'],
  ['테크', 'Tech'],
  ['하이테크', 'High Tech'],
  ['어드밴스드', 'Advanced'],
  ['퍼펙트', 'Perfect'],
  ['블랙', 'Black'],
  ['프레스티지', 'Prestige'],
  ['시그니처', 'Signature'],
  ['노블레스', 'Noblesse'],
  ['익스클루시브', 'Exclusive'],
  ['인스퍼레이션', 'Inspiration'],
  ['가솔린', 'Gasoline'],
  ['디젤', 'Diesel'],
  ['하이브리드', 'Hybrid'],
  ['전기', 'Electric'],
  ['터보', 'Turbo'],
]

const MODEL_NAME_MAP = {
  '그랜저': 'Grandeur',
  '쏘나타': 'Sonata',
  '아반떼': 'Avante',
  '싼타페': 'Santa Fe',
  '투싼': 'Tucson',
  '코나': 'Kona',
  '캐스퍼': 'Casper',
  '팰리세이드': 'Palisade',
  '스타렉스': 'Starex',
  '스타리아': 'Staria',
  '카니발': 'Carnival',
  '쏘렌토': 'Sorento',
  '스포티지': 'Sportage',
  '셀토스': 'Seltos',
  '모하비': 'Mohave',
  '봉고': 'Bongo',
  '레이': 'Ray',
  '모닝': 'Morning',
  'K5': 'K5',
  'K7': 'K7',
  'K8': 'K8',
  'K9': 'K9',
  'G70': 'G70',
  'G80': 'G80',
  'G90': 'G90',
  'GV60': 'GV60',
  'GV70': 'GV70',
  'GV80': 'GV80',
  'EQ900': 'EQ900',
  '말리부': 'Malibu',
  '트랙스': 'Trax',
  '트레일블레이저': 'Trailblazer',
}

const HANGUL_RE = /[\uAC00-\uD7A3]/u
const HANGUL_SEQ_RE = /[\uAC00-\uD7A3]+/gu

const CHOSEONG = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h']
const JUNGSEONG = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i']
const JONGSEONG = ['', 'k', 'k', 'ks', 'n', 'nj', 'nh', 't', 'l', 'lk', 'lm', 'lb', 'ls', 'lt', 'lp', 'lh', 'm', 'p', 'ps', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 'h']

export function hasHangul(value) {
  return HANGUL_RE.test(String(value || ''))
}

function romanizeHangulWord(word) {
  let out = ''
  for (const ch of word) {
    const code = ch.codePointAt(0)
    if (code < 0xac00 || code > 0xd7a3) {
      out += ch
      continue
    }
    const syllable = code - 0xac00
    const l = Math.floor(syllable / 588)
    const v = Math.floor((syllable % 588) / 28)
    const t = syllable % 28
    out += `${CHOSEONG[l]}${JUNGSEONG[v]}${JONGSEONG[t]}`
  }
  return out
}

function toTitleCase(word) {
  if (!word) return word
  return word[0].toUpperCase() + word.slice(1)
}

export function translateVehicleText(value) {
  if (!value) return ''
  let text = String(value).trim().replace(/\s+/g, ' ')

  for (const [from, to] of VEHICLE_TEXT_REPLACE) {
    text = text.replaceAll(from, to)
  }

  text = text.replace(HANGUL_SEQ_RE, (chunk) => {
    if (MODEL_NAME_MAP[chunk]) return MODEL_NAME_MAP[chunk]
    return toTitleCase(romanizeHangulWord(chunk))
  })

  return text.replace(/\s+/g, ' ').trim()
}

/** Parse Encar year "202001" → 2020 */
export function parseYear(yearStr) {
  if (!yearStr) return null
  const s = String(yearStr)
  return parseInt(s.substring(0, 4)) || null
}

/** Price in 만원 → KRW */
export function priceToKRW(encarPrice) {
  return (Number(encarPrice) || 0) * 10000
}

/** KRW → rough USD (1 USD ≈ 1340 KRW) */
export function krwToUsd(krw) {
  return Math.round(krw / 1340)
}

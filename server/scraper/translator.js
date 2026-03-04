export const MANUFACTURER_MAP = {
  '현대': 'Hyundai',
  '기아': 'Kia',
  '제네시스': 'Genesis',
  '쌍용': 'SsangYong',
  '르노삼성': 'Renault Samsung',
  '르노코리아': 'Renault Korea',
  '쉐보레': 'Chevrolet',
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

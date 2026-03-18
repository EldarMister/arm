const MAIN_GASOLINE_TARIFFS = {
  '2026': { '1.0': 1782, '1.4': 2494, '1.5': 2672, '1.6': 2850, '1.8': 3206, '2.0': 3562, '2.4': 4275, '2.5': 4453, '3.0': 5344, '3.3': 5878, '3.5': 6234, '4.0': 7125, '4.2': 7481, '4.4': 7837, '5.7': 10153, '6.2': 11043 },
  '2025': { '1.0': 1633, '1.4': 2285, '1.5': 2448, '1.6': 2612, '1.8': 2938, '2.0': 3265, '2.4': 3917, '2.5': 4081, '3.0': 4897, '3.3': 5387, '3.5': 5713, '4.0': 6529, '4.2': 6856, '4.4': 7182, '5.7': 9304, '6.2': 10120 },
  '2024': { '1.0': 1487, '1.4': 2081, '1.5': 2229, '1.6': 2378, '1.8': 2675, '2.0': 2973, '2.4': 3567, '2.5': 3716, '3.0': 4459, '3.3': 4905, '3.5': 5202, '4.0': 5945, '4.2': 6242, '4.4': 6540, '5.7': 8472, '6.2': 9215 },
  '2023 по месяцам': { '1.0': 1351, '1.4': 1890, '1.5': 2025, '1.6': 2160, '1.8': 2430, '2.0': 2700, '2.4': 3241, '2.5': 3376, '3.0': 4051, '3.3': 5068, '3.5': 5375, '4.0': 6143, '4.2': 6451, '4.4': 6758, '5.7': 8754, '6.2': 9522 },
  '2022': { '1.0': 1201, '1.4': 1681, '1.5': 1801, '1.6': 1921, '1.8': 2161, '2.0': 2401, '2.4': 2881, '2.5': 3002, '3.0': 3602, '3.3': 4892, '3.5': 5189, '4.0': 5930, '4.2': 6227, '4.4': 6523, '5.7': 8450, '6.2': 9192 },
  '2021': { '1.0': 1051, '1.4': 1471, '1.5': 1576, '1.6': 1682, '1.8': 1892, '2.0': 2102, '2.4': 2522, '2.5': 2627, '3.0': 3153, '3.3': 4716, '3.5': 5002, '4.0': 5717, '4.2': 6003, '4.4': 6288, '5.7': 8146, '6.2': 8861 },
  '2020': { '1.0': 898, '1.4': 1257, '1.5': 1347, '1.6': 1437, '1.8': 1616, '2.0': 1796, '2.4': 2155, '2.5': 2245, '3.0': 2694, '3.3': 4536, '3.5': 4811, '4.0': 5499, '4.2': 5773, '4.4': 6048, '5.7': 7835, '6.2': 8523 },
  '2019 по месяцам': { '1.0': 2161, '1.4': 3210, '1.5': 3439, '1.6': 3879, '1.8': 4364, '2.0': 6431, '2.4': 7717, '2.5': 8039, '3.0': 9646, '3.3': 14962, '3.5': 15868, '4.0': 18135, '4.2': 19042, '4.4': 19949, '5.7': 25843, '6.2': 28110 },
  '2018': { '1.0': 2098, '1.4': 3121, '1.5': 3344, '1.6': 3778, '1.8': 4250, '2.0': 6304, '2.4': 7565, '2.5': 7881, '3.0': 9457, '3.3': 14753, '3.5': 15647, '4.0': 17882, '4.2': 18777, '4.4': 19671, '5.7': 25482, '6.2': 27718 },
  '2017': { '1.0': 2035, '1.4': 3033, '1.5': 3249, '1.6': 3677, '1.8': 4136, '2.0': 6178, '2.4': 7414, '2.5': 7722, '3.0': 9267, '3.3': 14544, '3.5': 15426, '4.0': 17629, '4.2': 18511, '4.4': 19392, '5.7': 25122, '6.2': 27326 },
  '2016–2015': { '1.0': 2791, '1.4': 4091, '1.5': 4384, '1.6': 4887, '1.8': 5498, '2.0': 7691, '2.4': 9229, '2.5': 9613, '3.0': 11536, '3.3': 17040, '3.5': 18073, '4.0': 20655, '4.2': 21688, '4.4': 22721, '5.7': 29433, '6.2': 32015 },
  '2014': { '1.0': 3324, '1.4': 4838, '1.5': 5184, '1.6': 5740, '1.8': 6458, '2.0': 8757, '2.4': 10509, '2.5': 10946, '3.0': 13136, '3.3': 18800, '3.5': 19939, '4.0': 22788, '4.2': 23927, '4.4': 25067, '5.7': 32473, '6.2': 35321 },
}

const MAIN_DIESEL_TARIFFS = {
  '2026': { '1.6': 2850, '1.7': 3028, '2.0': 3562, '2.2': 3919, '2501': 4455, '2.7': 4809, '3.3': 5878 },
  '2025': { '1.6': 2612, '1.7': 2775, '2.0': 3265, '2.2': 3591, '2501': 4082, '2.7': 4407, '3.3': 5387 },
  '2024': { '1.6': 2378, '1.7': 2527, '2.0': 2973, '2.2': 3270, '2501': 3717, '2.7': 4013, '3.3': 4905 },
  '2023 по месяцам': { '1.6': 2160, '1.7': 2295, '2.0': 2700, '2.2': 2971, '2501': 7226, '2.7': 7436, '3.3': 8069 },
  '2022': { '1.6': 1921, '1.7': 2041, '2.0': 2401, '2.2': 2641, '2501': 3708, '2.7': 4003, '3.3': 4892 },
  '2021': { '1.6': 1682, '1.7': 1787, '2.0': 2102, '2.2': 2312, '2501': 3574, '2.7': 3859, '3.3': 4716 },
  '2020': { '1.6': 1636, '1.7': 1636, '2.0': 1640, '2.2': 1745, '2501': 3438, '2.7': 3712, '3.3': 4536 },
  '2019 по месяцам': { '1.6': 5176, '1.7': 5466, '2.0': 6336, '2.2': 6916, '2501': 11339, '2.7': 12241, '3.3': 14962 },
  '2018': { '1.6': 5044, '1.7': 5359, '2.0': 6304, '2.2': 6935, '2501': 11181, '2.7': 12071, '3.3': 14753 },
  '2017': { '1.6': 4942, '1.7': 5251, '2.0': 6178, '2.2': 6796, '2501': 11023, '2.7': 11900, '3.3': 14544 },
  '2016–2015': { '1.6': 6153, '1.7': 6537, '2.0': 7691, '2.2': 8460, '2501': 12915, '2.7': 13942, '3.3': 17040 },
  '2014': { '1.6': 7006, '1.7': 7444, '2.0': 8757, '2.2': 9633, '2501': 14248, '2.7': 15382, '3.3': 18800 },
}

const HYBRID_USIR_TARIFFS = {
  '1801': { usa: 10220, asia: 4088, japan: 4380 },
  '2000': { usa: 10220, asia: 4088, japan: 4380 },
  '2500': { usa: 8760, asia: 7300, japan: 7300 },
  '3000': { usa: 16060, asia: 10220, japan: 10220 },
}

const GASOLINE_USIR_TARIFFS = {
  '3000': { usa: 11680, asia: 7300, japan: 7300 },
}

const KZ_UNDER_THREE_TARIFFS = [
  { max: 8500, percent: 0.54, minPerCc: 2.5 },
  { max: 16700, percent: 0.48, minPerCc: 3.5 },
  { max: 42300, percent: 0.48, minPerCc: 5.5 },
  { max: 84500, percent: 0.48, minPerCc: 7.5 },
  { max: 169000, percent: 0.48, minPerCc: 15 },
  { max: Number.POSITIVE_INFINITY, percent: 0.48, minPerCc: 20 },
]

const KZ_THREE_TO_FIVE_TARIFFS = [
  { max: 1000, rate: 1.5 },
  { max: 1500, rate: 1.7 },
  { max: 1800, rate: 2.5 },
  { max: 2300, rate: 2.7 },
  { max: 3000, rate: 3.0 },
  { max: Number.POSITIVE_INFINITY, rate: 3.6 },
]

const KZ_OVER_FIVE_TARIFFS = [
  { max: 1000, rate: 3.0 },
  { max: 1500, rate: 3.2 },
  { max: 1800, rate: 3.5 },
  { max: 2300, rate: 4.8 },
  { max: 3000, rate: 5.0 },
  { max: Number.POSITIVE_INFINITY, rate: 5.7 },
]

const KZ_UTIL_FEE_AEK_2026 = 4325
const KZ_UTIL_ENGINE_COEFFICIENTS = [
  { max: 1000, coefficient: 3 },
  { max: 2000, coefficient: 7 },
  { max: 3000, coefficient: 10 },
  { max: Number.POSITIVE_INFINITY, coefficient: 23 },
]

const BY_UTIL_FEE_PERSONAL = {
  underOrEqualThreeYears: 544.5,
  overThreeYears: 816.7,
}

const FUEL_LABELS = {
  gasoline: 'Бензин',
  lpg: 'Газ',
  diesel: 'Дизель',
  hybrid: 'Гибрид',
  electric: 'Электро',
}

const DIRECTION_LABELS = {
  usa: 'США',
  asia: 'ЮВА (Китай, Корея)',
  japan: 'Япония',
}

const MAIN_ROW_BY_YEAR = new Map([
  [2026, '2026'],
  [2025, '2025'],
  [2024, '2024'],
  [2023, '2023 по месяцам'],
  [2022, '2022'],
  [2021, '2021'],
  [2020, '2020'],
  [2019, '2019 по месяцам'],
  [2018, '2018'],
  [2017, '2017'],
  [2016, '2016–2015'],
  [2015, '2016–2015'],
  [2014, '2014'],
])

const KG_PASS_THROUGH_WARNING_YEAR = 2019
const KG_PASS_THROUGH_BASE_YEAR = 2020

const UNDER_THREE_ROW_BY_YEAR = new Map([
  [2026, '2026'],
  [2025, '2025'],
  [2024, '2024'],
  [2023, '2023 по месяцам'],
])

const SPECIAL_CC_ALIASES = {
  '1801': { cc: 1801, liters: 1.8, label: '1801 cc' },
  '2000': { cc: 2000, liters: 2.0, label: '2000 cc' },
  '2500': { cc: 2500, liters: 2.5, label: '2500 cc' },
  '2501': { cc: 2501, liters: 2.5, label: '2501 cc' },
  '3000': { cc: 3000, liters: 3.0, label: '3000 cc' },
}

const HYBRID_VOLUME_HINT = '1801 cc, 2000 cc, 2500 cc, 3000 cc'
const DIESEL_VOLUME_HINT = '1.6, 1.7, 2.0, 2.2, 2501 cc, 2.7, 3.3; 2.8 -> 2.7, 2.9-3.1 -> 3.3'

const LITER_MATCH_TOLERANCE = 0.05
const SPECIAL_CC_MATCH_TOLERANCE = 10

export const CUSTOMS_DIRECTION_OPTIONS = [
  { value: 'usa', label: DIRECTION_LABELS.usa, flag: '🇺🇸' },
  { value: 'asia', label: DIRECTION_LABELS.asia, flag: '🇰🇷 🇨🇳' },
  { value: 'japan', label: DIRECTION_LABELS.japan, flag: '🇯🇵' },
]

export const CUSTOMS_FUEL_OPTIONS = [
  { value: 'gasoline', label: FUEL_LABELS.gasoline },
  { value: 'lpg', label: FUEL_LABELS.lpg },
  { value: 'diesel', label: FUEL_LABELS.diesel },
  { value: 'hybrid', label: FUEL_LABELS.hybrid },
]

export function getCustomsFuelLabel(value) {
  return FUEL_LABELS[value] || 'Не указан'
}

function parseNumericValue(value) {
  if (value === null || value === undefined) return null
  const normalized = String(value).trim().replace(',', '.')
  if (!normalized) return null
  const numeric = Number(normalized)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null
}

function parseEngineValue(value) {
  const numeric = parseNumericValue(value)
  if (!numeric) return null

  if (numeric < 20) {
    return {
      liters: numeric,
      cc: numeric * 1000,
    }
  }

  return {
    liters: numeric / 1000,
    cc: numeric,
  }
}

function resolveAgeFlags(year, currentDate = new Date()) {
  const ageYears = currentDate.getFullYear() - Number(year)
  return {
    notOlderThan3Years: ageYears <= 3,
    olderThan5Years: ageYears > 5,
  }
}

function resolveMainVolumeColumn(engineValue, table) {
  const parsed = parseEngineValue(engineValue)
  if (!parsed) return null

  const roundedKey = parsed.liters.toFixed(1)
  if (!Object.prototype.hasOwnProperty.call(table, roundedKey)) return null
  if (Math.abs(parsed.liters - Number(roundedKey)) >= LITER_MATCH_TOLERANCE) return null

  return {
    key: roundedKey,
    liters: Number(roundedKey),
    label: roundedKey,
  }
}

function resolveDieselVolumeColumn(engineValue) {
  const parsed = parseEngineValue(engineValue)
  if (!parsed) return null

  const special = SPECIAL_CC_ALIASES['2501']
  if (
    Math.abs(parsed.cc - special.cc) <= SPECIAL_CC_MATCH_TOLERANCE ||
    Math.abs(parsed.liters - special.liters) < LITER_MATCH_TOLERANCE
  ) {
    return {
      key: '2501',
      liters: special.liters,
      label: special.label,
    }
  }

  if (parsed.cc >= 2750 && parsed.cc < 2900) {
    return {
      key: '2.7',
      liters: 2.7,
      label: '2.7',
    }
  }

  if (parsed.cc >= 2900 && parsed.cc <= 3199) {
    return {
      key: '3.3',
      liters: 3.3,
      label: '3.3',
    }
  }

  return resolveMainVolumeColumn(engineValue, MAIN_DIESEL_TARIFFS['2026'])
}

function resolveSpecialCcColumn(engineValue, keys) {
  const parsed = parseEngineValue(engineValue)
  if (!parsed) return null

  return keys
    .map((key) => ({ key, ...SPECIAL_CC_ALIASES[key] }))
    .find((item) => (
      Math.abs(parsed.cc - item.cc) <= SPECIAL_CC_MATCH_TOLERANCE ||
      Math.abs(parsed.liters - item.liters) < LITER_MATCH_TOLERANCE
    )) || null
}

function getMainRowKey(year) {
  return MAIN_ROW_BY_YEAR.get(Number(year)) || null
}

function resolveKgCalculationYear(year) {
  const numericYear = Number(year)
  if (!Number.isFinite(numericYear)) return numericYear
  return numericYear === KG_PASS_THROUGH_WARNING_YEAR ? KG_PASS_THROUGH_BASE_YEAR : numericYear
}

function getUnderThreeRowLabel(year) {
  return UNDER_THREE_ROW_BY_YEAR.get(Number(year)) || null
}

function buildMeta({ fuel, table, row, volume, direction }) {
  return [
    { label: 'Тип', value: fuel },
    { label: 'Таблица', value: table },
    { label: 'Строка', value: row },
    { label: 'Объём', value: volume },
    { label: 'Направление', value: direction },
  ].filter((item) => item.value)
}

function buildManualResult({ fuel, table, row, volume, direction, message }) {
  return {
    status: 'manual',
    message,
    meta: buildMeta({ fuel, table, row, volume, direction }),
  }
}

function buildSuccessResult({ amount, fuel, table, row, volume, direction, message = '', currency, breakdown }) {
  return {
    status: 'success',
    amount,
    currency: currency || 'USD',
    message,
    breakdown,
    meta: buildMeta({ fuel, table, row, volume, direction }),
  }
}

export function resolveCustomsCalculation(input, currentDate = new Date()) {
  const year = Number(input?.year)
  const fuel = String(input?.fuel || 'gasoline')
  const direction = String(input?.direction || '')
  const calculationYear = resolveKgCalculationYear(year)

  if (!Number.isInteger(year) || year < 1900) {
    return buildManualResult({
      fuel: getCustomsFuelLabel(fuel),
      message: 'Укажите корректный год выпуска.',
    })
  }

  if (!['gasoline', 'lpg', 'diesel', 'hybrid'].includes(fuel)) {
    return buildManualResult({
      fuel: getCustomsFuelLabel(fuel),
      message: 'Для выбранного типа двигателя нет поддерживаемой таблицы.',
    })
  }

  if (fuel === 'electric') {
    return buildManualResult({
      fuel: getCustomsFuelLabel(fuel),
      message: 'Для электрических автомобилей в Таблица.md нет отдельного тарифа, требуется ручной расчёт.',
    })
  }

  const age = resolveAgeFlags(calculationYear, currentDate)
  const fuelLabel = getCustomsFuelLabel(fuel)
  const isGasolineFamily = fuel === 'gasoline' || fuel === 'lpg'

  if (fuel === 'hybrid') {
    const rowLabel = getUnderThreeRowLabel(calculationYear)
    const volume = resolveSpecialCcColumn(input?.engine, ['1801', '2000', '2500', '3000'])

    if (!volume) {
      return buildManualResult({
        fuel: fuelLabel,
        table: 'Гибрид по УСИР, не более 3 лет',
        row: rowLabel || '',
        message: `Для гибрида в таблице доступны только объёмы ${HYBRID_VOLUME_HINT}, требуется ручной расчёт.`,
      })
    }

    if (!rowLabel || !age.notOlderThan3Years) {
      return buildManualResult({
        fuel: fuelLabel,
        table: 'Гибрид по УСИР, не более 3 лет',
        row: rowLabel || '',
        volume: volume.label,
        message: 'Для гибридов в таблице есть только расчёт не старше 3 лет.',
      })
    }

    if (!DIRECTION_LABELS[direction]) {
      return buildManualResult({
        fuel: fuelLabel,
        table: 'Гибрид по УСИР, не более 3 лет',
        row: rowLabel,
        volume: volume.label,
        message: 'Для гибрида нужно указать направление ввоза.',
      })
    }

    return buildSuccessResult({
      amount: HYBRID_USIR_TARIFFS[volume.key][direction],
      fuel: fuelLabel,
      table: 'Гибрид по УСИР, не более 3 лет',
      row: rowLabel,
      volume: volume.label,
      direction: DIRECTION_LABELS[direction],
      message: '',
    })
  }

  if (isGasolineFamily) {
    const specialVolume = resolveSpecialCcColumn(input?.engine, ['3000'])
    const specialRowLabel = getUnderThreeRowLabel(calculationYear)

    if (specialVolume && specialRowLabel && age.notOlderThan3Years) {
      if (!DIRECTION_LABELS[direction]) {
        return buildManualResult({
          fuel: fuelLabel,
          table: 'Бензин / газ по УСИР, не более 3 лет',
          row: specialRowLabel,
          volume: specialVolume.label,
          message: 'Для автомобиля до 3 лет нужно указать направление ввоза.',
        })
      }

      return buildSuccessResult({
        amount: GASOLINE_USIR_TARIFFS[specialVolume.key][direction],
        fuel: fuelLabel,
        table: 'Бензин / газ по УСИР, не более 3 лет',
        row: specialRowLabel,
        volume: specialVolume.label,
        direction: DIRECTION_LABELS[direction],
        message: '',
      })
    }
  }

  const rowKey = getMainRowKey(calculationYear)
  if (!rowKey) {
    return buildManualResult({
      fuel: fuelLabel,
      message: 'Для указанного года в Таблица.md нет подходящей строки, требуется ручной расчёт.',
    })
  }

  const tableLabel = fuel === 'diesel' ? 'Дизель' : 'Бензин / газ'
  const rowTable = fuel === 'diesel' ? MAIN_DIESEL_TARIFFS[rowKey] : MAIN_GASOLINE_TARIFFS[rowKey]
  const volume = fuel === 'diesel'
    ? resolveDieselVolumeColumn(input?.engine)
    : resolveMainVolumeColumn(input?.engine, MAIN_GASOLINE_TARIFFS['2026'])

  if (!volume || !rowTable || !Object.prototype.hasOwnProperty.call(rowTable, volume.key)) {
    return buildManualResult({
      fuel: fuelLabel,
      table: tableLabel,
      row: rowKey,
      message: fuel === 'diesel'
        ? `Для дизеля в таблице доступны только объёмы ${DIESEL_VOLUME_HINT}, требуется ручной расчёт.`
        : 'Для такого объёма двигателя в таблице нет точной колонки, требуется ручной расчёт.',
    })
  }

  if (isGasolineFamily && volume.liters > 2.0 && age.olderThan5Years) {
    return buildManualResult({
      fuel: fuelLabel,
      table: tableLabel,
      row: rowKey,
      volume: volume.label,
      message: 'Для данного автомобиля расчёт идёт по весу, требуется уточнение.',
    })
  }

  return buildSuccessResult({
    amount: rowTable[volume.key],
    fuel: fuelLabel,
    table: tableLabel,
    row: rowKey,
    volume: volume.label,
    message: '',
  })
}

export function resolveCustomsCalculationKz(input, currentDate = new Date()) {
  const year = Number(input?.year)

  if (!Number.isInteger(year) || year < 1900) {
    return buildManualResult({
      message: '\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 \u0433\u043e\u0434 \u0432\u044b\u043f\u0443\u0441\u043a\u0430.',
    })
  }

  const parsedEngine = parseEngineValue(input?.engine)
  if (!parsedEngine) {
    return buildManualResult({
      message: '\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u043e\u0431\u044a\u0435\u043c \u0434\u0432\u0438\u0433\u0430\u0442\u0435\u043b\u044f.',
    })
  }

  const engineCc = Math.round(parsedEngine.cc)
  if (!Number.isFinite(engineCc) || engineCc <= 0) {
    return buildManualResult({
      message: '\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 \u043e\u0431\u044a\u0435\u043c \u0434\u0432\u0438\u0433\u0430\u0442\u0435\u043b\u044f.',
    })
  }

  const ageFlags = resolveAgeFlags(year, currentDate)
  const isUnderThree = ageFlags.notOlderThan3Years
  const isOverFive = ageFlags.olderThan5Years

  if (isUnderThree) {
    const customsValue = parseNumericValue(input?.customsValue ?? input?.customs_value)
    if (!customsValue) {
      return buildManualResult({
        message: '\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u0442\u0430\u043c\u043e\u0436\u0435\u043d\u043d\u0443\u044e \u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u044c \u0432 EUR \u0434\u043b\u044f \u0430\u0432\u0442\u043e \u0434\u043e 3 \u043b\u0435\u0442.',
      })
    }

    const bracket = KZ_UNDER_THREE_TARIFFS.find((item) => customsValue <= item.max)
      || KZ_UNDER_THREE_TARIFFS[KZ_UNDER_THREE_TARIFFS.length - 1]
    const percentAmount = customsValue * bracket.percent
    const minAmount = bracket.minPerCc * engineCc
    const amount = Math.max(percentAmount, minAmount)

    return buildSuccessResult({
      amount: Math.round(amount),
      currency: 'EUR',
      message: '',
    })
  }

  const rateTable = isOverFive ? KZ_OVER_FIVE_TARIFFS : KZ_THREE_TO_FIVE_TARIFFS
  const rateBracket = rateTable.find((item) => engineCc <= item.max) || rateTable[rateTable.length - 1]
  const amount = rateBracket.rate * engineCc

  return buildSuccessResult({
    amount: Math.round(amount),
    currency: 'EUR',
    message: '',
  })
}

export function resolveCustomsCalculationUa(input, currentDate = new Date()) {
  const year = Number(input?.year)
  const fuelRaw = String(input?.fuel || 'gasoline')
  const fuel = fuelRaw === 'lpg' ? 'gasoline' : fuelRaw

  if (!Number.isInteger(year) || year < 1900) {
    return buildManualResult({
      message: 'Укажите корректный год выпуска.',
    })
  }

  const customsValue = parseNumericValue(input?.customsValue ?? input?.customs_value)
  if (!customsValue) {
    return buildManualResult({
      message: 'Укажите таможенную стоимость в EUR.',
    })
  }

  if (!['gasoline', 'diesel', 'hybrid'].includes(fuel)) {
    return buildManualResult({
      message: 'Укажите корректный тип двигателя.',
    })
  }

  const rawAge = currentDate.getFullYear() - year
  const ageCoefficient = Math.min(Math.max(rawAge, 1), 15)
  const isElectric = fuel === 'electric'
  const isHybrid = fuel === 'hybrid'

  const duty = isElectric ? 0 : customsValue * 0.1

  let excise = 0
  if (isElectric) {
    const batteryCapacity = parseNumericValue(input?.batteryCapacity ?? input?.battery_kwh)
    if (!batteryCapacity) {
      return buildManualResult({
        message: 'Укажите ёмкость батареи (кВт·ч).',
      })
    }
    excise = batteryCapacity * 1
  } else if (isHybrid) {
    excise = 100
  } else {
    const parsedEngine = parseEngineValue(input?.engine)
    if (!parsedEngine) {
      return buildManualResult({
        message: 'Укажите объём двигателя.',
      })
    }
    const engineCc = Math.round(parsedEngine.cc)
    if (!Number.isFinite(engineCc) || engineCc <= 0) {
      return buildManualResult({
        message: 'Укажите корректный объём двигателя.',
      })
    }

    const isDiesel = fuel === 'diesel'
    const baseRate = isDiesel
      ? (engineCc <= 3500 ? 75 : 150)
      : (engineCc <= 3000 ? 50 : 100)

    excise = baseRate * (engineCc / 1000) * ageCoefficient
  }

  const vatBase = customsValue + duty + excise
  const vat = vatBase * 0.2
  const total = duty + excise + vat

  return buildSuccessResult({
    amount: Math.round(total),
    currency: 'EUR',
    message: '',
    breakdown: {
      duty: Math.round(duty),
      excise: Math.round(excise),
      vat: Math.round(vat),
      total: Math.round(total),
    },
  })
}

export function resolveCustomsCalculationAz(input, currentDate = new Date()) {
  const year = Number(input?.year)
  const fuelRaw = String(input?.fuel || 'gasoline')
  const fuel = fuelRaw === 'lpg' ? 'gasoline' : fuelRaw

  if (!Number.isInteger(year) || year < 1900) {
    return buildManualResult({
      message: 'Укажите корректный год выпуска.',
    })
  }

  const customsValue = parseNumericValue(input?.customsValue ?? input?.customs_value)
  if (!customsValue) {
    return buildManualResult({
      message: 'Укажите таможенную стоимость в AZN.',
    })
  }

  if (!['gasoline', 'diesel', 'hybrid', 'electric'].includes(fuel)) {
    return buildManualResult({
      message: 'Укажите корректный тип двигателя.',
    })
  }

  const ageYears = Math.max(currentDate.getFullYear() - year, 0)
  const parsedEngine = fuel === 'electric' ? null : parseEngineValue(input?.engine)

  if (fuel !== 'electric' && !parsedEngine) {
    return buildManualResult({
      message: 'Укажите объём двигателя.',
    })
  }

  const engineCc = parsedEngine ? Math.round(parsedEngine.cc) : 0
  const isElectric = fuel === 'electric'
  const isHybrid = fuel === 'hybrid'
  const electricDutyExempt = isElectric && ageYears <= 3
  const vatExempt = electricDutyExempt || (isHybrid && ageYears <= 3 && engineCc > 0 && engineCc <= 2500)

  const duty = electricDutyExempt ? 0 : customsValue * 0.15
  const excise = isElectric
    ? 0
    : (engineCc <= 2000 ? engineCc * 0.3 : 600 + (engineCc - 2000) * 5)
  const vatBase = customsValue + duty + excise
  const vat = vatExempt ? 0 : vatBase * 0.18
  const total = duty + excise + vat

  return buildSuccessResult({
    amount: Math.round(total),
    currency: 'AZN',
    message: vatExempt
      ? 'Льгота по НДС применена для подходящей категории автомобиля.'
      : '',
    breakdown: {
      duty: Math.round(duty),
      excise: Math.round(excise),
      vat: Math.round(vat),
      total: Math.round(total),
    },
  })
}

export function resolveUtilFeeCalculation(input, currentDate = new Date()) {
  const countryCode = String(input?.countryCode || '').trim().toLowerCase()

  if (!countryCode || countryCode === 'kg' || countryCode === 'ua' || countryCode === 'az' || countryCode === 'tj') {
    return { status: 'hidden' }
  }

  if (countryCode === 'kz') {
    const fuel = String(input?.fuel || '').trim().toLowerCase()
    if (fuel === 'electric') {
      return {
        status: 'success',
        amount: 0,
        currency: 'KZT',
        message: 'Электромобили освобождены от утилизационного платежа.',
      }
    }

    const parsedEngine = parseEngineValue(input?.engine)
    if (!parsedEngine) {
      return {
        status: 'manual',
        message: 'Для расчёта утильсбора укажите объём двигателя.',
      }
    }

    const engineCc = Math.round(parsedEngine.cc)
    const bracket = KZ_UTIL_ENGINE_COEFFICIENTS.find((item) => engineCc <= item.max)
      || KZ_UTIL_ENGINE_COEFFICIENTS[KZ_UTIL_ENGINE_COEFFICIENTS.length - 1]
    const amount = KZ_UTIL_FEE_AEK_2026 * 25 * bracket.coefficient

    return {
      status: 'success',
      amount: Math.round(amount),
      currency: 'KZT',
      message: '',
      meta: [
        { label: 'АЕК 2026', value: String(KZ_UTIL_FEE_AEK_2026) },
        { label: 'Коэффициент', value: String(bracket.coefficient) },
      ],
    }
  }

  if (countryCode === 'by') {
    const year = Number(input?.year)
    if (!Number.isInteger(year) || year < 1900) {
      return {
        status: 'manual',
        message: 'Для расчёта утильсбора укажите год выпуска.',
      }
    }

    const ageYears = Math.max(currentDate.getFullYear() - year, 0)
    const amount = ageYears <= 3
      ? BY_UTIL_FEE_PERSONAL.underOrEqualThreeYears
      : BY_UTIL_FEE_PERSONAL.overThreeYears

    return {
      status: 'success',
      amount,
      currency: 'BYN',
      message: 'Фиксированная ставка для ввоза легкового авто физлицом.',
    }
  }

  if (countryCode === 'ru') {
    return {
      status: 'manual',
      message: 'В России утильсбор зависит от статуса ввоза и условий льготы физлица, поэтому без отдельного режима точная сумма не рассчитывается.',
    }
  }

  if (countryCode === 'uz') {
    return {
      status: 'manual',
      message: 'В Узбекистане утильсбор есть, но универсальная ставка зависит от категории и регистрационного режима; автоматический расчёт пока не добавлен.',
    }
  }

  return { status: 'hidden' }
}

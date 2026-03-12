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

const LITER_MATCH_TOLERANCE = 0.05
const SPECIAL_CC_MATCH_TOLERANCE = 10

export const CUSTOMS_DIRECTION_OPTIONS = [
  { value: 'usa', label: DIRECTION_LABELS.usa, flag: '🇺🇸' },
  { value: 'asia', label: DIRECTION_LABELS.asia, flag: '🇰🇷' },
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

function buildSuccessResult({ amount, fuel, table, row, volume, direction, message = '' }) {
  return {
    status: 'success',
    amount,
    message,
    meta: buildMeta({ fuel, table, row, volume, direction }),
  }
}

export function resolveCustomsCalculation(input, currentDate = new Date()) {
  const year = Number(input?.year)
  const fuel = String(input?.fuel || 'gasoline')
  const direction = String(input?.direction || '')
  const isPremium = Boolean(input?.isPremium)

  if (!Number.isInteger(year) || year < 1900) {
    return buildManualResult({
      fuel: getCustomsFuelLabel(fuel),
      message: 'Укажите корректный год выпуска.',
    })
  }

  if (!['gasoline', 'lpg', 'diesel', 'hybrid', 'electric'].includes(fuel)) {
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

  const age = resolveAgeFlags(year, currentDate)
  const fuelLabel = getCustomsFuelLabel(fuel)
  const isGasolineFamily = fuel === 'gasoline' || fuel === 'lpg'

  if (isPremium && age.notOlderThan3Years) {
    return buildManualResult({
      fuel: fuelLabel,
      message: 'Для автомобилей премиум-класса до 3 лет требуется уточнение по ИТС.',
    })
  }

  if (fuel === 'hybrid') {
    const rowLabel = getUnderThreeRowLabel(year)
    const volume = resolveSpecialCcColumn(input?.engine, ['1801', '2000', '2500', '3000'])

    if (!volume) {
      return buildManualResult({
        fuel: fuelLabel,
        table: 'Гибрид по УСИР, не более 3 лет',
        row: rowLabel || '',
        message: 'Для такого объёма гибрида в таблице нет точной колонки, требуется ручной расчёт.',
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
      message: 'Расчёт выполнен по отдельной таблице гибридов до 3 лет.',
    })
  }

  if (isGasolineFamily) {
    const specialVolume = resolveSpecialCcColumn(input?.engine, ['3000'])
    const specialRowLabel = getUnderThreeRowLabel(year)

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
        message: 'Расчёт выполнен по отдельной таблице бензина / газа до 3 лет.',
      })
    }
  }

  const rowKey = getMainRowKey(year)
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
      message: 'Для такого объёма двигателя в таблице нет точной колонки, требуется ручной расчёт.',
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
    message: fuel === 'lpg'
      ? 'Газ рассчитан по общей бензиновой таблице из Таблица.md.'
      : 'Расчёт выполнен строго по основной таблице из Таблица.md.',
  })
}

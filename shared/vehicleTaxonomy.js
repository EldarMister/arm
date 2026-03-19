function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function joinContext(...values) {
  return values
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map((value) => cleanText(value))
    .filter(Boolean)
    .join(' ')
}

export const BODY_TYPE_LABELS = Object.freeze({
  sedan: 'Седан',
  businessSedan: 'Бизнес-седан',
  executiveSedan: 'Представительский седан',
  coupe: 'Купе',
  fourDoorCoupe: '4-дверное купе',
  cabriolet: 'Кабриолет',
  roadster: 'Родстер',
  liftback: 'Лифтбек',
  hatchback: 'Хэтчбек',
  wagon: 'Универсал',
  suv: 'Кроссовер / внедорожник',
  minivan: 'Минивэн',
  pickup: 'Пикап',
  truck: 'Грузовик',
})

export const VEHICLE_CLASS_LABELS = Object.freeze({
  aClass: 'A-класс',
  compact: 'Компактный класс',
  medium: 'Средний класс',
  business: 'Бизнес-класс',
  executive: 'Представительский класс',
})

const CANONICAL_BODY_TYPES = new Set(Object.values(BODY_TYPE_LABELS))
const CANONICAL_VEHICLE_CLASSES = new Set(Object.values(VEHICLE_CLASS_LABELS))

const RAW_A_CLASS_RE = /(?:a-класс|класс\s*a|mini(?:\s|-)?car|micro(?:\s|-)?car|city\s*car|kei\s*car|малолитражк|경차|초소형)/i
const RAW_COMPACT_CLASS_RE = /(?:sohyeongcha|junjunghyeongcha|junjung[h]?yeongcha|compact(?:\s+class)?|small(?:\s+class)?|소형차|준중형차|мал(?:ого|ый)\s+класса|компакт(?:ный|-класс))/i
const RAW_MEDIUM_CLASS_RE = /(?:junghyeongcha|middle(?:\s+class)?|mid[-\s]*size|중형차|средн(?:его|ий)\s+класса|средний\s+класс)/i
const RAW_BUSINESS_CLASS_RE = /(?:daehyeongcha|business(?:\s+class)?|executive\s+sedan|large\s+sedan|대형차|бизнес(?:-| )класс|бизнес\s+класса)/i
const RAW_EXECUTIVE_CLASS_RE = /(?:representative(?:\s+class)?|flagship|luxury\s+sedan|представительск(?:ий|ого)\s+класс)/i

const SUV_HINT_RE = /\b(suv|crossover|cross[-\s]*over|rv|sport\s*utility|santa[\s-]*fe|santafe|tucson|sorento|sportage|seltos|palisade|mohave|trailblazer|trax|qm6|gv60|gv70|gv80|korando|tivoli|niro|kona|torres|xc60|xc90|x3\b|x5\b|x7\b|glc\b|gle\b|gls\b|q3\b|q5\b|q7\b|q8\b|tiguan|touareg|cr[-\s]*v|rav4|highlander|casper)\b/i
const MINIVAN_HINT_RE = /\b(minivan|van|mpv|carnival|staria|starex|orlando|master|alphard|sienna|odyssey)\b/i
const PICKUP_HINT_RE = /\b(pickup|pick-up|korando\s+sports|rexton\s+sports|musso\s+sports|hilux|ranger|f[-\s]*150|ram\s*1500)\b/i
const TRUCK_HINT_RE = /\b(truck|cargo|porter|bongo|dump|tractor|lorry)\b/i
const FOUR_DOOR_COUPE_HINT_RE = /\b(gran\s+coupe|grancoupe|4[-\s]*door\s+coupe|cls\b|amg\s*gt\s*4[-\s]*door|i4\b)\b/i
const LIFTBACK_HINT_RE = /\b(sportback|seupoteubaek|liftback|fastback|stinger|a5\s*sportback|a7\s*sportback|arteon|panamera)\b/i
const ROADSTER_HINT_RE = /\b(spyder|seupaideo|spider|roadster|boxster|z4\b|slk\b|slc\b|mx-5|miata)\b/i
const CABRIOLET_HINT_RE = /\b(cabrio|cabriolet|convertible|drophead|soft[-\s]*top|portofino|kabeuriolre|kabeuriole|kabriolet)\b/i
const WAGON_HINT_RE = /\b(wagon|estate|touring|allroad|shooting\s*brake)\b/i
const HATCHBACK_HINT_RE = /\b(hatch|hatchback|i30|golf|polo|ceed|cee['’ -]?d|picanto|morning|spark|matiz|veloster|brio|focus\s*hatch)\b/i
const COUPE_HINT_RE = /\b(coupe|genesis\s+coupe|86\b|brz\b|m4\b|m8\b|c63\s*coupe|mustang|camaro|challenger|huracan|aventador|gallardo|murcielago|revuelto|r8\b|amg\s*gt\b|f8\b|488\b|458\b|720s\b|570s\b|650s\b|600lt\b|supra\b)\b/i
const SEDAN_HINT_RE = /\b(sedan|7\s*series|5\s*series|3\s*series|2\s*series\s+gran\s+coupe|s[-\s]*class|e[-\s]*class|c[-\s]*class|a8\b|a6\b|a4\b|a3\b|g90\b|g80\b|g70\b|s90\b|s80\b|s60\b|sonata|grandeur|azera|k9\b|k8\b|k7\b|k5\b|k3\b|avante|elantra|sm3|sm5|sm6|sm7|malibu|impala|cts|ct6|camry|accord|es300|es350|ls500)\b/i

const EXECUTIVE_CLASS_HINT_RE = /\b(7\s*series|740|745|750|760|i7\b|s[-\s]*class|s350|s400|s450|s500|s560|s580|maybach|a8\b|ls460|ls500|g90\b|eq900|k9\b|quoris|ct6\b|xj\b)\b/i
const BUSINESS_CLASS_HINT_RE = /\b(5\s*series|520|523|525|528|530|535|540|550|e[-\s]*class|e200|e220|e250|e300|e350|a6\b|g80\b|s90\b|k8\b|k7\b|grandeur|azera|es300|es350|cts\b)\b/i
const MEDIUM_CLASS_HINT_RE = /\b(3\s*series|320|323|325|328|330|335|340|c[-\s]*class|c180|c200|c220|c250|c300|a4\b|a5\b|s60\b|sonata|k5\b|sm6\b|malibu|camry|accord|passat|arteon|stinger|a7\b)\b/i
const A_CLASS_HINT_RE = /\b(morning|spark|matiz|picanto|casper)\b/i
const COMPACT_CLASS_HINT_RE = /\b(1\s*series|118|120|125|128|2\s*series|218|220|228|a[-\s]*class|cla\b|a3\b|a1\b|golf|avante|elantra|k3\b|sm3\b|i30|ceed|picanto|corolla|civic|jetta|focus)\b/i

const CLASS_PRIORITY = new Map([
  [VEHICLE_CLASS_LABELS.aClass, 0],
  [VEHICLE_CLASS_LABELS.compact, 1],
  [VEHICLE_CLASS_LABELS.medium, 2],
  [VEHICLE_CLASS_LABELS.business, 3],
  [VEHICLE_CLASS_LABELS.executive, 4],
])

function normalizeLegacyBodyClassToBody(value) {
  const text = cleanText(value)
  if (!text) return ''
  if (
    RAW_COMPACT_CLASS_RE.test(text) ||
    RAW_MEDIUM_CLASS_RE.test(text) ||
    RAW_BUSINESS_CLASS_RE.test(text) ||
    RAW_EXECUTIVE_CLASS_RE.test(text) ||
    /седан/i.test(text)
  ) {
    return BODY_TYPE_LABELS.sedan
  }
  return ''
}

export function isCanonicalBodyTypeLabel(value) {
  return CANONICAL_BODY_TYPES.has(cleanText(value))
}

export function isCanonicalVehicleClassLabel(value) {
  return CANONICAL_VEHICLE_CLASSES.has(cleanText(value))
}

export function normalizeBodyTypeLabel(value) {
  const text = cleanText(value)
  if (!text || text === '-') return ''
  if (CANONICAL_BODY_TYPES.has(text)) return text

  const low = text.toLowerCase()
  const legacyBody = normalizeLegacyBodyClassToBody(text)
  if (legacyBody) return legacyBody

  if (low === 'минивэны' || low === 'minivans') return BODY_TYPE_LABELS.minivan
  if (low === 'хэтчбеки') return BODY_TYPE_LABELS.hatchback
  if (low === 'универсалы') return BODY_TYPE_LABELS.wagon
  if (low === 'внедорожники и кроссоверы') return BODY_TYPE_LABELS.suv
  if (low === 'грузовики') return BODY_TYPE_LABELS.truck
  if (low === 'sportska' || low === 'sportscar' || low === 'sportcar' || low === 'спорткар') return ''
  if (low === 'мини' || low === 'mini') return ''
  if (low === 'грузовой / пикап' || low === 'truck / pickup') return ''
  if (FOUR_DOOR_COUPE_HINT_RE.test(text)) return BODY_TYPE_LABELS.fourDoorCoupe
  if (LIFTBACK_HINT_RE.test(text)) return BODY_TYPE_LABELS.liftback
  if (ROADSTER_HINT_RE.test(text)) return BODY_TYPE_LABELS.roadster
  if (CABRIOLET_HINT_RE.test(text)) return BODY_TYPE_LABELS.cabriolet
  if (WAGON_HINT_RE.test(text)) return BODY_TYPE_LABELS.wagon
  if (HATCHBACK_HINT_RE.test(text)) return BODY_TYPE_LABELS.hatchback
  if (PICKUP_HINT_RE.test(text)) return BODY_TYPE_LABELS.pickup
  if (TRUCK_HINT_RE.test(text)) return BODY_TYPE_LABELS.truck
  if (MINIVAN_HINT_RE.test(text)) return BODY_TYPE_LABELS.minivan
  if (SUV_HINT_RE.test(text)) return BODY_TYPE_LABELS.suv
  if (COUPE_HINT_RE.test(text)) return BODY_TYPE_LABELS.coupe
  if (SEDAN_HINT_RE.test(text)) return BODY_TYPE_LABELS.sedan
  return ''
}

function inferBodyTypeFromContext(...values) {
  const text = joinContext(values).toLowerCase()
  if (!text) return ''

  if (PICKUP_HINT_RE.test(text)) return BODY_TYPE_LABELS.pickup
  if (TRUCK_HINT_RE.test(text)) return BODY_TYPE_LABELS.truck
  if (MINIVAN_HINT_RE.test(text)) return BODY_TYPE_LABELS.minivan
  if (FOUR_DOOR_COUPE_HINT_RE.test(text)) return BODY_TYPE_LABELS.fourDoorCoupe
  if (LIFTBACK_HINT_RE.test(text)) return BODY_TYPE_LABELS.liftback
  if (ROADSTER_HINT_RE.test(text)) return BODY_TYPE_LABELS.roadster
  if (CABRIOLET_HINT_RE.test(text)) return BODY_TYPE_LABELS.cabriolet
  if (WAGON_HINT_RE.test(text)) return BODY_TYPE_LABELS.wagon
  if (HATCHBACK_HINT_RE.test(text)) return BODY_TYPE_LABELS.hatchback
  if (SUV_HINT_RE.test(text)) return BODY_TYPE_LABELS.suv
  if (COUPE_HINT_RE.test(text)) return BODY_TYPE_LABELS.coupe
  if (SEDAN_HINT_RE.test(text)) return BODY_TYPE_LABELS.sedan
  return ''
}

export function resolveBodyTypeLabel(bodyValue, ...contextValues) {
  const normalized = normalizeBodyTypeLabel(bodyValue)
  const inferred = inferBodyTypeFromContext(bodyValue, ...contextValues)

  if (inferred && (!normalized || normalized !== inferred)) {
    if (
      (normalized === BODY_TYPE_LABELS.businessSedan || normalized === BODY_TYPE_LABELS.executiveSedan)
      && inferred === BODY_TYPE_LABELS.sedan
    ) {
      return normalized
    }
    return inferred
  }

  return normalized || inferred || ''
}

export function isWeakBodyTypeLabel(value) {
  return !isCanonicalBodyTypeLabel(resolveBodyTypeLabel(value))
}

export function normalizeVehicleClassLabel(value) {
  const text = cleanText(value)
  if (!text || text === '-') return ''
  if (CANONICAL_VEHICLE_CLASSES.has(text)) return text

  if (RAW_A_CLASS_RE.test(text)) return VEHICLE_CLASS_LABELS.aClass
  if (RAW_EXECUTIVE_CLASS_RE.test(text)) return VEHICLE_CLASS_LABELS.executive
  if (RAW_BUSINESS_CLASS_RE.test(text)) return VEHICLE_CLASS_LABELS.business
  if (RAW_MEDIUM_CLASS_RE.test(text)) return VEHICLE_CLASS_LABELS.medium
  if (RAW_COMPACT_CLASS_RE.test(text)) return VEHICLE_CLASS_LABELS.compact

  return ''
}

function inferVehicleClassFromContext(bodyType, ...values) {
  const normalizedBody = resolveBodyTypeLabel(bodyType, ...values)
  const text = joinContext(normalizedBody, ...values).toLowerCase()
  if (!text) return ''

  if (A_CLASS_HINT_RE.test(text)) return VEHICLE_CLASS_LABELS.aClass
  if ([BODY_TYPE_LABELS.pickup, BODY_TYPE_LABELS.truck, BODY_TYPE_LABELS.minivan].includes(normalizedBody)) {
    return ''
  }
  if (EXECUTIVE_CLASS_HINT_RE.test(text)) return VEHICLE_CLASS_LABELS.executive
  if (BUSINESS_CLASS_HINT_RE.test(text)) return VEHICLE_CLASS_LABELS.business
  if (MEDIUM_CLASS_HINT_RE.test(text)) return VEHICLE_CLASS_LABELS.medium
  if (COMPACT_CLASS_HINT_RE.test(text)) return VEHICLE_CLASS_LABELS.compact

  return ''
}

export function resolveVehicleClassLabel(classValue, bodyValue, ...contextValues) {
  const direct = normalizeVehicleClassLabel(classValue) || normalizeVehicleClassLabel(bodyValue)
  const inferred = inferVehicleClassFromContext(bodyValue, classValue, ...contextValues)

  if (!direct) return inferred
  if (!inferred) return direct

  return (CLASS_PRIORITY.get(inferred) || 0) > (CLASS_PRIORITY.get(direct) || 0)
    ? inferred
    : direct
}

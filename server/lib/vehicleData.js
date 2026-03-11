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

const INTERIOR_COLOR_TEXT_MARKERS = '(?:\\uC2DC\\uD2B8|\\uB0B4\\uC7A5(?:\\s*\\uC0AC\\uC591)?|\\uC2E4\\uB0B4(?:\\s*\\uC0C9\\uC0C1|\\s*\\uCEEC\\uB7EC)?|\\uC778\\uD14C\\uB9AC\\uC5B4|seat(?:\\s*(?:color|trim))?|interior(?:\\s*color)?|upholstery|trim(?:\\s*color)?|siteu(?:\\s*(?:color|trim))?|silnae(?:\\s*(?:saeksang|keolreo))?|naejang(?:\\s*sayang)?|inteorieo|upeolseuteori)'
const INTERIOR_COLOR_CONTEXT_MARKERS = `(?:${INTERIOR_COLOR_TEXT_MARKERS}|\\uAC00\\uC8FD|\\uBAA8\\uB178\\uD1A4|\\uD22C\\uD1A4|leather|monotone|two[-\\s]*tone)`
const INTERIOR_COLOR_LABEL_RE = /(?:\uB0B4\uC7A5(?:\s*\uC0AC\uC591|\s*\uC0C9\uC0C1)?|\uC2E4\uB0B4(?:\s*\uC0C9\uC0C1|\s*\uCEEC\uB7EC)?|\uC2DC\uD2B8(?:\s*\uC0C9\uC0C1|\s*\uCEEC\uB7EC)?|interior(?:\s*color)?|seat(?:\s*(?:color|trim))?|trim\s*color|upholstery)/i
const INTERIOR_COLOR_REJECT_RE = /(?:body\s*color|\uC678\uC7A5|\uC678\uC7A5\s*\uC0C9\uC0C1|\uCC28\uCCB4\s*\uC0C9\uC0C1)/i
const INTERIOR_COLOR_SEGMENT_SPLIT_RE = /(?:\r?\n|[|,;]|\/|▶|★|◈|▪|•|\u2022)+/g
const INTERIOR_COLOR_TEXT_PATTERNS = Object.freeze([
  { color: 'black', source: '(?:\\uBE14\\uB799|\\uAC80\\uC815|\\uD751\\uC0C9|black|jet\\s*black|obsidian|onyx|charcoal|anthracite|ebony|beullaek|geomjeong|heuksaek)' },
  { color: 'white', source: '(?:\\uD654\\uC774\\uD2B8|\\uD770\\uC0C9|\\uBC31\\uC0C9|white|pure\\s*white|snow\\s*white|hwaiteu|huinsaek|baegsaek)' },
  { color: 'beige', source: '(?:\\uBCA0\\uC774\\uC9C0|\\uC0CC\\uB4DC\\s*\\uBCA0\\uC774\\uC9C0|beige|sand\\s*beige|linen|beiji|saendeu\\s*beiji)' },
  { color: 'brown', source: '(?:\\uBE0C\\uB77C\\uC6B4|\\uCE74\\uBA5C|\\uCF54\\uB0D1|\\uD1A0\\uD504|\\uBAA8\\uCE74|\\uCEE4\\uD53C|brown|tan|camel|caramel|cognac|coffee|espresso|saddle|chestnut|nougat|konyak|kkonyak|konnyak|taupe|mocha|beuraun|galsaek|kamel|topeu|moka|mokka|choko\\s*beuraun)' },
  { color: 'ivory', source: '(?:\\uC544\\uC774\\uBCF4\\uB9AC|\\uD06C\\uB9BC|\\uC624\\uD504\\s*\\uD654\\uC774\\uD2B8|ivory|cream|oyster|porcelain|parchment|off\\s*white|aibori|keurim|opeu\\s*hwaiteu)' },
  { color: 'gray', source: '(?:\\uADF8\\uB808\\uC774|\\uBAA8\\uB358\\s*\\uADF8\\uB808\\uC774|\\uADF8\\uB808\\uC774\\uC9C0|\\uD68C\\uC0C9|gray|grey|greige|slate|stone|modern\\s*gray|geurei|geureiji|hoesaek|modeon\\s*geurei)' },
  { color: 'red', source: '(?:\\uB808\\uB4DC|\\uC801\\uC0C9|\\uC640\\uC778|\\uBC84\\uAC74\\uB514|red|wine|burgundy|bordeaux|merlot|sakhir|magma\\s*red|redeu|wain|beogeondi)' },
  { color: 'blue', source: '(?:\\uB124\\uC774\\uBE44|\\uCCAD\\uC0C9|blue|navy|marine|indigo|neibi|cheongsaek|parangsaek)' },
  { color: 'orange', source: '(?:\\uC624\\uB80C\\uC9C0|orange|orenji|juhwangsaek)' },
  { color: 'green', source: '(?:\\uADF8\\uB9B0|green|olive|geurin|choroksaek)' },
])

const OPTION_FEATURE_RULES = Object.freeze([
  { label: 'HUD', patterns: [/\bHUD\b/i, /\uD5E4\uB4DC\uC5C5/u, /head[-\s]*up/i] },
  { label: 'Камера 360', patterns: [/\uC5B4\uB77C\uC6B4\uB4DC\uBDF0/u, /360\s*(?:camera|cam|view)/i, /surround\s*view/i] },
  { label: 'Built-in Cam', patterns: [/\uBE4C\uD2B8\uC778\s*\uCEA0/u, /built[-\s]*in\s*cam/i] },
  { label: 'Панорамная крыша', patterns: [/\uD30C\uB178\uB77C\uB9C8(?:\s*\uC120\uB8E8\uD504|\s*\uC36C\uB8E8\uD504)?/u, /panoramic?\s*(?:sunroof|roof)/i] },
  { label: 'Люк', patterns: [/\uC120\uB8E8\uD504|\uC36C\uB8E8\uD504/u, /\bsunroof\b/i] },
  { label: 'Вентиляция сидений', patterns: [/\uD1B5\uD48D\s*\uC2DC\uD2B8/u, /ventilat(?:ed|ion)?\s*seats?/i] },
  { label: 'Подогрев сидений', patterns: [/\uC5F4\uC120\s*\uC2DC\uD2B8/u, /heated?\s*seats?/i] },
  { label: 'Память сидений', patterns: [/\uBA54\uBAA8\uB9AC\s*\uC2DC\uD2B8/u, /memory\s*seats?/i] },
  { label: 'Электропривод сидений', patterns: [/\uC804\uB3D9\s*\uC2DC\uD2B8/u, /power\s*seats?/i] },
  { label: 'Натуральная кожа Nappa', patterns: [/\uB098\uD30C/u, /\bnappa\b/i] },
  { label: 'Адаптивный круиз', patterns: [/\uC2A4\uB9C8\uD2B8\s*\uD06C\uB8E8\uC988/u, /\bSCC\b/i, /adaptive\s*cruise/i] },
  { label: 'Удержание полосы', patterns: [/\uCC28\uC120\s*(?:\uC720\uC9C0|\uBCF4\uC870|\uC774\uD0C8)/u, /lane\s*(?:keep|assist|departure)/i] },
  { label: 'Мониторинг слепых зон', patterns: [/\uC0AC\uAC01\uC9C0\uB300/u, /blind\s*spot/i, /\bBSM\b/i] },
  { label: 'Парктроники', patterns: [/\uC8FC\uCC28\s*\uAC10\uC9C0/u, /parking\s*sensors?/i, /parktronic/i] },
  { label: 'Премиум-аудио Bang & Olufsen', patterns: [/\uBC45\uC564\uC62C\uB8F9\uC2A8/u, /bang\s*&?\s*olufsen/i] },
  { label: 'Премиум-аудио Bose', patterns: [/\uBCF4\uC2A4/u, /\bBOSE\b/i] },
  { label: 'Премиум-аудио Meridian', patterns: [/\uBA54\uB9AC\uB514\uC548/u, /\bMeridian\b/i] },
  { label: 'Премиум-аудио Lexicon', patterns: [/\uB809\uC2DC\uCF58/u, /\bLexicon\b/i] },
  { label: 'Премиум-аудио Krell', patterns: [/\uD06C\uB810/u, /\bKrell\b/i] },
  { label: 'Пакет Popular', patterns: [/\uD30C\uD4E8\uB7EC\s*\uD328\uD0A4\uC9C0/u, /popular\s*package/i] },
  { label: 'Пакет Built-in Cam', patterns: [/\uBE4C\uD2B8\uC778\s*\uCEA0\s*\uD328\uD0A4\uC9C0/u, /built[-\s]*in\s*cam\s*package/i] },
  { label: 'Coupe Design Selection II', patterns: [/\uCFE0\uD398\s*\uB514\uC790\uC778\s*\uC140\uB809\uC158/u, /coupe\s*design\s*selection/i] },
  { label: 'Смарт-ключ', patterns: [/\uC2A4\uB9C8\uD2B8\uD0A4/u, /smart\s*key/i] },
  { label: 'Задняя камера', patterns: [/\uD6C4\uBC29\s*\uCE74\uBA54\uB77C/u, /rear\s*camera/i, /backup\s*camera/i] },
  { label: 'TPMS', patterns: [/\uD0C0\uC774\uC5B4\s*\uACF5\uAE30\uC555\uC13C\uC11C/u, /\bTPMS\b/i] },
  { label: 'Навигация', patterns: [/\uB0B4\uBE44\uAC8C\uC774\uC158/u, /navigation/i] },
  { label: 'Bluetooth', patterns: [/\uBE14\uB8E8\uD22C\uC2A4/u, /\bbluetooth\b/i] },
  { label: 'Кожаный салон', patterns: [/\uAC00\uC8FD\s*\uC2DC\uD2B8/u, /leather\s*seats?/i] },
  { label: 'Электропривод багажника', patterns: [/\uD30C\uC6CC\s*\uC804\uB3D9\s*\uD2B8\uB801\uD06C/u, /power\s*(?:tailgate|trunk)/i] },
  { label: 'Датчик дождя', patterns: [/\uB808\uC778\uC13C\uC11C/u, /rain\s*sensor/i] },
  { label: 'Автосвет', patterns: [/\uC624\uD1A0\s*\uB77C\uC774\uD2B8/u, /auto\s*light/i] },
  { label: 'EPB', patterns: [/\uC804\uC790\uC2DD\s*\uC8FC\uCC28\uBE0C\uB808\uC774\uD06C/u, /\bEPB\b/i] },
  { label: 'HID / LED Headlights', patterns: [/\uD5E4\uB4DC\uB7A8\uD504/u, /\b(?:HID|LED)\b/i] },
  { label: 'Электросиденья', patterns: [/\uC804\uB3D9\uC2DC\uD2B8/u, /power\s*seats?/i] },
  { label: 'Массаж сидений', patterns: [/\uB9C8\uC0AC\uC9C0\s*\uC2DC\uD2B8/u, /massage\s*seats?/i] },
])

const TRIM_REPLACEMENTS = [
  ['neombeowon edisyeon', 'Number One Edition'],
  ['number one edition', 'Number One Edition'],
  ['hai-tech', 'Hi-Tech'],
  ['hai tech', 'Hi-Tech'],
  ['hi-tech', 'Hi-Tech'],
  ['hi tech', 'Hi-Tech'],
  ['hitech', 'Hi-Tech'],
  ['haipeo', 'Hyper'],
  ['hyper', 'Hyper'],
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
  ['inseukeuripsyeon', 'Inscription'],
  ['inscription', 'Inscription'],
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
  'neombeowon edisyeon',
  'number one edition',
  'hai-tech',
  'hai tech',
  'hi-tech',
  'hi tech',
  'hitech',
  'haipeo',
  'hyper',
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
  'inseukeuripsyeon',
  'inscription',
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
  [/\uAC15\uC6D0|gangwon|kangwon|Канвон/i, 'Канвон'],
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

  if (/^(beullaek|geomjeong|heuksaek)$/.test(low)) return '\u0427\u0435\u0440\u043D\u044B\u0439'
  if (/^(beiji|saendeubeiji)$/.test(low)) return '\u0411\u0435\u0436\u0435\u0432\u044B\u0439'
  if (/^galdaesaek$/.test(low)) return '\u0411\u0435\u0436\u0435\u0432\u044B\u0439'
  if (/^(galsaek|beuraun|moka|mokka|konyak|kkonyak|konnyak|kamel|topeu)$/.test(low)) return '\u041A\u043E\u0440\u0438\u0447\u043D\u0435\u0432\u044B\u0439'
  if (/^(aibori|keurim|opeuhwaiteu)$/.test(low)) return '\u0410\u0439\u0432\u043E\u0440\u0438'
  if (/^(geurei|geureiji|hoesaek)$/.test(low)) return '\u0421\u0435\u0440\u044B\u0439'
  if (/^(redeu|wain|beogeondi)$/.test(low)) return '\u041A\u0440\u0430\u0441\u043D\u044B\u0439'
  if (/^(neibi|cheongsaek|parangsaek)$/.test(low)) return '\u0421\u0438\u043D\u0438\u0439'
  if (/^(orenji|juhwangsaek)$/.test(low)) return '\u041E\u0440\u0430\u043D\u0436\u0435\u0432\u044B\u0439'
  if (/^(geurin|choroksaek|dampoksaek|damnoksaek|damnogsaek)$/.test(low)) return '\u0417\u0435\u043B\u0435\u043D\u044B\u0439'
  if (/^(borasaek|jajusaek)$/.test(low)) return '\u0424\u0438\u043E\u043B\u0435\u0442\u043E\u0432\u044B\u0439'
  if (/^haneulsaek$/.test(low)) return '\u0421\u0438\u043D\u0438\u0439'

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

function finalizeColorLabel(value) {
  const text = cleanText(value)
  if (!text) return ''
  if (text === 'Золотистый') return 'Золотой'
  if (text === 'Ярко-серебристый') return 'Серебристый'
  if (text === 'Серебристо-серый') return 'Серебристый'
  const roofMatch = text.match(/^(.+?)\s*\/\s*черная крыша$/i)
  if (roofMatch) return `${roofMatch[1]} двухцветный`
  return text
}

function normalizeTwoToneColorCandidate(value) {
  const raw = cleanText(value)
  if (!raw) return ''

  const low = raw.toLowerCase()
  const compact = low.replace(/[\s_/-]/g, '')
  const hasTwoToneHint =
    compact.includes('tuton') ||
    low.includes('two tone') ||
    low.includes('two-tone') ||
    low.includes('black roof') ||
    /двухцвет|черная крыша/i.test(raw)

  if (!hasTwoToneHint) return ''
  if (/^(huinseaktuton|huinsaektuton)$/.test(compact) || /(white|baegsaek|huinsaek)/.test(low) || /흰색|백색/u.test(raw)) return 'Белый двухцветный'
  if (/^(geomjeongtuton|geomeunsaektuton)$/.test(compact) || /(black|geomeunsaek|geomjeongsaek|heugsaek)/.test(low) || /검정|흑색/u.test(raw)) return 'Черный двухцветный'
  if (/^eunsaektuton$/.test(compact) || /(silver|eunsaek)/.test(low) || /은색/u.test(raw)) return 'Серебристый двухцветный'
  if (/^galsaektuton$/.test(compact) || /(brown|galsaek)/.test(low) || /갈색/u.test(raw)) return 'Коричневый двухцветный'
  if (/(beige|beijisaek)/.test(low) || /베이지/u.test(raw)) return 'Бежевый двухцветный'
  if (/(gray|grey|hoesaek)/.test(low) || /회색/u.test(raw)) return 'Серый двухцветный'

  return ''
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
  if (GENERIC_COLOR_LABELS.has(raw)) return finalizeColorLabel(raw)

  const twoToneCandidate = normalizeTwoToneColorCandidate(raw)
  if (twoToneCandidate) return finalizeColorLabel(twoToneCandidate)

  const requestedAlias = normalizeRequestedRomanizedColorAlias(raw)
  if (requestedAlias) return finalizeColorLabel(requestedAlias)

  const romanizedAlias = normalizeRomanizedColorAlias(raw)
  if (romanizedAlias) return finalizeColorLabel(romanizedAlias)

  const direct = COLOR_EXACT.get(raw) || COLOR_EXACT.get(raw.toLowerCase())
  if (direct) return finalizeColorLabel(direct)

  if (/은회색/.test(raw)) return finalizeColorLabel('Серебристо-серый')
  if (/쥐색/.test(raw)) return 'Мокрый асфальт'
  if (/진주/.test(raw) && /(흰|백)/.test(raw)) return 'Жемчужно-белый'
  if (/진주/.test(raw) && /검|흑/.test(raw)) return 'Жемчужно-черный'
  if (/진주/.test(raw)) return 'Жемчужный'
  if (/아이보리/.test(raw)) return 'Айвори'
  if (/와인/.test(raw)) return 'Винный'
  if (/은/.test(raw) && /회/.test(raw)) return finalizeColorLabel('Серебристо-серый')
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
  if (/silver/.test(low) && /(gray|grey)/.test(low)) return finalizeColorLabel('Серебристо-серый')
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
  if (/gold/.test(low)) return finalizeColorLabel('Золотой')

  if (!hasHangul(raw)) return finalizeColorLabel(raw)

  const translated = normalizeText(raw)
  return finalizeColorLabel(normalizeRequestedRomanizedColorAlias(translated) || translated)
}

export function normalizeInteriorColorName(value, bodyValue = '') {
  const options = arguments[2] && typeof arguments[2] === 'object' ? arguments[2] : {}
  const rawInterior = cleanText(value)
  if (!rawInterior) return ''

  const normalizedInterior = normalizeColorName(rawInterior)
  const normalizedBody = normalizeColorName(bodyValue)

  if (
    rawInterior &&
    bodyValue &&
    rawInterior.toLowerCase() === cleanText(bodyValue).toLowerCase() &&
    normalizedInterior === normalizedBody &&
    SUSPICIOUS_DUPLICATE_INTERIOR_COLORS.has(normalizedInterior) &&
    !options.allowBodyDuplicate
  ) {
    return ''
  }

  return normalizedInterior
}

function splitInteriorTextSegments(value) {
  return String(value || '')
    .split(INTERIOR_COLOR_SEGMENT_SPLIT_RE)
    .map((segment) => cleanText(segment))
    .filter(Boolean)
}

function extractInteriorColorFromSegment(value, bodyValue = '') {
  const text = cleanText(value)
  if (!text) return ''

  for (const { color, source } of INTERIOR_COLOR_TEXT_PATTERNS) {
    const beforeMarker = new RegExp(`${source}\\s*(?:\\/|&|-|:)?\\s*(?:${INTERIOR_COLOR_CONTEXT_MARKERS})`, 'i')
    const afterMarker = new RegExp(`(?:${INTERIOR_COLOR_CONTEXT_MARKERS})(?:\\s*(?:\\uC0C9\\uC0C1|\\uCEEC\\uB7EC|color|trim))?\\s*(?:\\/|&|-|:)?\\s*${source}`, 'i')
    const tightAroundMarker = new RegExp(`${source}[\\s\\S]{0,24}${INTERIOR_COLOR_CONTEXT_MARKERS}|${INTERIOR_COLOR_CONTEXT_MARKERS}[\\s\\S]{0,24}${source}`, 'i')
    const compoundMarker = new RegExp(`${source}(?:\\s*(?:nappa|napa|premium|natural|perforated|quilted))?[\\s\\S]{0,16}(?:leather\\s*)?(?:seat(?:s)?|trim|interior|upholstery)`, 'i')
    if (beforeMarker.test(text) || afterMarker.test(text) || tightAroundMarker.test(text)) {
      return normalizeInteriorColorName(color, bodyValue, { allowBodyDuplicate: true })
    }
    if (compoundMarker.test(text)) {
      return normalizeInteriorColorName(color, bodyValue, { allowBodyDuplicate: true })
    }
  }

  return ''
}

export function extractInteriorColorFromText(value, bodyValue = '') {
  const text = cleanText(value)
  if (!text) return ''

  for (const segment of splitInteriorTextSegments(text)) {
    const segmentedMatch = extractInteriorColorFromSegment(segment, bodyValue)
    if (segmentedMatch) return segmentedMatch
  }

  for (const { color, source } of INTERIOR_COLOR_TEXT_PATTERNS) {
    const beforeMarker = new RegExp(`${source}[\\s\\S]{0,28}${INTERIOR_COLOR_CONTEXT_MARKERS}`, 'i')
    const afterMarker = new RegExp(`${INTERIOR_COLOR_CONTEXT_MARKERS}(?:\\s*(?:\\uC0C9\\uC0C1|\\uCEEC\\uB7EC|color|trim))?[\\s\\S]{0,28}${source}`, 'i')
    const compactMarker = new RegExp(`${source}\\s*(?:\\/|&|-|:)?\\s*(?:${INTERIOR_COLOR_CONTEXT_MARKERS})`, 'i')
    const compoundMarker = new RegExp(`${source}(?:\\s*(?:nappa|napa|premium|natural|perforated|quilted))?[\\s\\S]{0,20}(?:leather\\s*)?(?:seat(?:s)?|trim|interior|upholstery)`, 'i')
    if (beforeMarker.test(text) || afterMarker.test(text) || compactMarker.test(text) || compoundMarker.test(text)) {
      return normalizeInteriorColorName(color, bodyValue, { allowBodyDuplicate: true })
    }
  }

  return ''
}

export function extractInteriorColorFromPairs(pairs = [], bodyValue = '') {
  for (const pair of pairs) {
    const label = cleanText(pair?.label)
    const value = cleanText(pair?.value)
    if (!label || !value) continue
    if (!INTERIOR_COLOR_LABEL_RE.test(label) || INTERIOR_COLOR_REJECT_RE.test(label)) continue

    const direct = normalizeInteriorColorName(value, bodyValue, { allowBodyDuplicate: true })
    if (direct) return direct

    const contextual = extractInteriorColorFromText(`${label} ${value}`, bodyValue)
    if (contextual) return contextual
  }

  return ''
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

export function extractOptionFeatures({
  contentsText = '',
  memoText = '',
  titleText = '',
  subtitleText = '',
  oneLineText = '',
  optionTexts = [],
  inspectionRows = [],
} = {}) {
  const text = [
    cleanText(titleText),
    cleanText(subtitleText),
    cleanText(oneLineText),
    cleanText(memoText),
    cleanText(contentsText),
    ...optionTexts.map((item) => cleanText(item)),
    ...inspectionRows.map((row) => cleanText([row?.label, row?.detail, row?.note, ...(row?.states || [])].join(' '))),
  ]
    .filter(Boolean)
    .join(' ')

  if (!text) return []

  const features = []
  for (const rule of OPTION_FEATURE_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      features.push(rule.label)
    }
  }

  if (features.includes('Панорамная крыша')) {
    const next = features.filter((item) => item !== 'Люк')
    return [...new Set(next)].slice(0, 16)
  }

  if (features.includes('Натуральная кожа Nappa')) {
    const next = features.filter((item) => item !== 'Кожаный салон')
    return [...new Set(next)].slice(0, 16)
  }

  return [...new Set(features)].slice(0, 16)
}

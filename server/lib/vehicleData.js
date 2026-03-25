import { hasHangul, translateVehicleText } from '../scraper/translator.js'
import { applyTrimFixes, normalizeLocationText, normalizeRequestedRomanizedColorAlias } from '../../shared/vehicleTextFixes.js'
import { inferDriveFromModelTable } from './driveModelRules.js'
import {
  isWeakBodyTypeLabel as isWeakCanonicalBodyTypeLabel,
  normalizeBodyTypeLabel,
  normalizeVehicleClassLabel,
  resolveBodyTypeLabel,
  resolveVehicleClassLabel,
} from '../../shared/vehicleTaxonomy.js'

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
  '%daewoo%',
  '%\uB300\uC6B0%',
  '%renault korea%',
  '%renault samsung%',
  '%reunokoria%',
  '%\uB974\uB178\uCF54\uB9AC\uC544%',
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
  '%trailblazer%',
  '%malibu%',
  '%spark%',
  '%matiz%',
  '%damas%',
  '%labo%',
  '%rexton%',
  '%actyon%',
  '%korando%',
  '%tivoli%',
  '%torres%',
  '%musso%',
  '%bolteu%',
  '%bolt%',
  '%ioniq%',
  '%aionik%',
  '%veloster%',
  '%stinger%',
  '%k5 hybrid%',
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

const INTERIOR_COLOR_TEXT_MARKERS = '(?:\\uC2DC\\uD2B8(?:\\s*(?:\\uC0C9\\uC0C1|\\uCEEC\\uB7EC))?|\\uB0B4\\uC7A5(?:\\s*\\uC0AC\\uC591|\\s*\\uC0C9\\uC0C1)?|\\uC2E4\\uB0B4(?:\\s*\\uC0C9\\uC0C1|\\s*\\uCEEC\\uB7EC)?|\\uC778\\uD14C\\uB9AC\\uC5B4|\\uAC00\\uC8FD(?:\\s*\\uC0C9\\uC0C1)?|\\uB098\\uD30C(?:\\s*\\uAC00\\uC8FD)?|seat(?:s)?(?:\\s*(?:color|trim|upholstery))?|interior(?:\\s*(?:color|trim|material))?|upholstery(?:\\s*color)?|trim(?:\\s*color)?|seat\\s*cover|dashboard(?:\\s*trim)?|door\\s*trim|headliner|material(?:\\s*color)?|siteu(?:\\s*(?:color|trim))?|silnae(?:\\s*(?:saeksang|keolreo))?|naejang(?:\\s*sayang)?|inteorieo|gajuk(?:\\s*saeksang)?|napa|upeolseuteori)'
const INTERIOR_COLOR_CONTEXT_MARKERS = `(?:${INTERIOR_COLOR_TEXT_MARKERS}|\\uAC00\\uC8FD|\\uB098\\uD30C|\\uBAA8\\uB178\\uD1A4|\\uD22C\\uD1A4|\\uCEE8\\uD2B8\\uB77C\\uC2A4\\uD2B8|leather|nappa|alcantara|suede|merino|vernasca|sensatec|monotone|two[-\\s]*tone|bi[-\\s]*tone|dual[-\\s]*tone|contrast|cabin|cockpit|colorway)`
const INTERIOR_COLOR_EXPLICIT_LABEL_MARKERS = '(?:\\uB0B4\\uC7A5(?:\\s*\\uC0C9\\uC0C1|\\s*\\uC0AC\\uC591)?|\\uC2E4\\uB0B4(?:\\s*\\uC0C9\\uC0C1|\\s*\\uCEEC\\uB7EC)?|\\uC2DC\\uD2B8\\s*(?:\\uC0C9\\uC0C1|\\uCEEC\\uB7EC)?|\\uAC00\\uC8FD(?:\\s*\\uC0C9\\uC0C1)?|\\uB098\\uD30C(?:\\s*\\uAC00\\uC8FD)?|interior(?:\\s*(?:color|trim|material))?|seat\\s*(?:color|trim|upholstery)|trim\\s*color|upholstery(?:\\s*color)?|material(?:\\s*color)?)'
const INTERIOR_COLOR_LABEL_RE = /(?:\uB0B4\uC7A5(?:\s*\uC0AC\uC591|\s*\uC0C9\uC0C1)?|\uC2E4\uB0B4(?:\s*\uC0C9\uC0C1|\s*\uCEEC\uB7EC)?|\uC2DC\uD2B8(?:\s*\uC0C9\uC0C1|\s*\uCEEC\uB7EC)?|\uAC00\uC8FD(?:\s*\uC0C9\uC0C1)?|\uB098\uD30C(?:\s*\uAC00\uC8FD)?|interior(?:\s*(?:color|trim|material))?|seat(?:s)?(?:\s*(?:color|trim|upholstery))?|trim\s*color|upholstery(?:\s*color)?|material(?:\s*color)?|headliner|door\s*trim)/i
const INTERIOR_COLOR_REJECT_RE = /(?:body\s*color|exterior|paint|outer\s*color|\uC678\uC7A5|\uC678\uC7A5\s*\uC0C9\uC0C1|\uCC28\uCCB4\s*\uC0C9\uC0C1)/i
const INTERIOR_COLOR_SEGMENT_SPLIT_RE = /(?:\r?\n|[|,;]|\/|▶|★|◈|▪|•|\u2022)+/g
const INTERIOR_COLOR_TEXT_PATTERNS = Object.freeze([
  { color: 'Двухцветный', source: '(?:\\uD22C\\s*\\uD1A4|\\uD22C\\uD1A4|\\uCEE8\\uD2B8\\uB77C\\uC2A4\\uD2B8|two[-\\s]*tone|bi[-\\s]*tone|dual[-\\s]*tone|contrast)' },
  { color: 'Кремовый', source: '(?:\\uC544\\uC774\\uBCF4\\uB9AC|\\uD06C\\uB9BC|\\uC624\\uD504\\s*\\uD654\\uC774\\uD2B8|ivory|cream|oyster|porcelain|parchment|off\\s*white|bone|vanilla|macchiato|magnolia|cashmere\\s*beige|silk\\s*beige|aibori|keurim|opeu\\s*hwaiteu)' },
  { color: 'Светло-серый', source: '(?:light\\s*(?:gray|grey)|silverstone|ash\\s*(?:gray|grey)|platinum\\s*(?:gray|grey)|\\uB77C\\uC774\\uD2B8\\s*\\uADF8\\uB808\\uC774)' },
  { color: 'Темно-серый', source: '(?:dark\\s*(?:gray|grey)|deep\\s*(?:gray|grey)|charcoal|anthracite|graphite|slate|basalt|space\\s*(?:gray|grey)|\\uCC28\\uCF5C|\\uADF8\\uB798\\uD53C\\uD2B8)' },
  { color: 'Рыжий / карамельный', source: '(?:\\uCE74\\uBA5C|\\uCE90\\uB7EC\\uBA5C|\\uCF54\\uB0D1|tan|camel|caramel|cognac|saddle|chestnut|nougat|whisk(?:e)?y|tobacco|ginger|peanut\\s*butter|brandy|toffee|cohiba|kamel|konyak|kkonyak|konnyak)' },
  { color: 'Бордовый', source: '(?:\\uBC84\\uAC74\\uB514|\\uC640\\uC778|burgundy|bordeaux|wine|merlot|claret|oxblood|maroon|sakhir)' },
  { color: 'Черный', source: '(?:\\uBE14\\uB799|\\uAC80\\uC815|\\uD751\\uC0C9|black|jet\\s*black|obsidian|onyx|ebony|beullaek|geomjeong|heuksaek)' },
  { color: 'Белый', source: '(?:\\uD654\\uC774\\uD2B8|\\uD770\\uC0C9|\\uBC31\\uC0C9|white|pure\\s*white|snow\\s*white|polar\\s*white|hwaiteu|huinsaek|baegsaek)' },
  { color: 'Бежевый', source: '(?:\\uBCA0\\uC774\\uC9C0|\\uC0CC\\uB4DC\\s*\\uBCA0\\uC774\\uC9C0|beige|sand\\s*beige|linen|cashmere|savanna|dune|beiji|saendeu\\s*beiji)' },
  { color: 'Коричневый', source: '(?:\\uBE0C\\uB77C\\uC6B4|\\uD1A0\\uD504|\\uBAA8\\uCE74|\\uCEE4\\uD53C|brown|taupe|mocha|mokka|coffee|espresso|walnut|chocolate|mahogany|havana|truffle|tartufo|criollo|beuraun|galsaek|topeu|moka)' },
  { color: 'Серый', source: '(?:\\uADF8\\uB808\\uC774|\\uBAA8\\uB358\\s*\\uADF8\\uB808\\uC774|\\uADF8\\uB808\\uC774\\uC9C0|\\uD68C\\uC0C9|gray|grey|greige|stone|modern\\s*gray|geurei|geureiji|hoesaek|modeon\\s*geurei)' },
  { color: 'Красный', source: '(?:\\uB808\\uB4DC|\\uC801\\uC0C9|red|crimson|scarlet|carmine|magma\\s*red|redeu)' },
  { color: 'Синий', source: '(?:\\uB124\\uC774\\uBE44|\\uCCAD\\uC0C9|blue|navy|marine|indigo|neibi|cheongsaek|parangsaek)' },
  { color: 'Оранжевый', source: '(?:\\uC624\\uB80C\\uC9C0|orange|orenji|juhwangsaek)' },
  { color: 'Зеленый', source: '(?:\\uADF8\\uB9B0|green|olive|geurin|choroksaek)' },
])
const INTERIOR_COLOR_CONTEXT_RE = new RegExp(INTERIOR_COLOR_CONTEXT_MARKERS, 'i')
const INTERIOR_TWO_TONE_HINT_RE = /(?:\uD22C\s*\uD1A4|\uD22C\uD1A4|\uCEE8\uD2B8\uB77C\uC2A4\uD2B8|two[-\s]*tone|bi[-\s]*tone|dual[-\s]*tone|contrast)/i
const INTERIOR_COLOR_SEPARATOR_RE = /(?:\/|&|\+|,|\band\b)/i
const INTERIOR_COLOR_BOUNDARY_RE = /[\p{L}\p{N}]/u
const INTERIOR_COMPOUND_EDGE_CONTEXT_RE = /(?:\uC2DC\uD2B8|\uB0B4\uC7A5(?:\s*\uC0AC\uC591)?|\uC2E4\uB0B4(?:\s*\uC0C9\uC0C1|\s*\uCEEC\uB7EC)?|\uC778\uD14C\uB9AC\uC5B4|\uAC00\uC8FD|\uB098\uD30C|\uBAA8\uB178\uD1A4|\uD22C\uD1A4|seat(?:s)?|interior|trim|upholstery|leather|nappa|merino|vernasca|sensatec|monotone|two[-\s]*tone|bi[-\s]*tone|dual[-\s]*tone|contrast|siteu|silnae|naejang|inteorieo|gajuk|upeolseuteori)/i
const INTERIOR_COLOR_VALUE_RE = /(?:\b(?:black|white|beige|brown|gray|grey|red|blue|green|orange|ivory|cream|oyster|porcelain|macchiato|burgundy|bordeaux|wine|tan|camel|caramel|cognac|charcoal|graphite|cohiba|mahogany|havana|truffle|tartufo|brandy|linen|cashmere)\b|(?:\uBE14\uB799|\uAC80\uC815|\uD751\uC0C9|\uD654\uC774\uD2B8|\uD770\uC0C9|\uBC31\uC0C9|\uBCA0\uC774\uC9C0|\uBE0C\uB77C\uC6B4|\uADF8\uB808\uC774|\uD68C\uC0C9|\uB808\uB4DC|\uC801\uC0C9|\uB124\uC774\uBE44|\uCCAD\uC0C9|\uADF8\uB9B0|\uC624\uB80C\uC9C0|\uC544\uC774\uBCF4\uB9AC|\uD06C\uB9BC|\uBC84\uAC74\uB514|\uC640\uC778|\uCE74\uBA5C|\uCE90\uB7EC\uBA5C|\uCF54\uB0D1|\uCC28\uCF5C|\uADF8\uB798\uD53C\uD2B8|\uC624\uC774\uC2A4\uD130|\uD3EC\uC140\uB9B0|\uB9C8\uCE74\uC544\uD1A0|\uCF54\uD788\uBC14|\uD2B8\uB7EC\uD50C|\uD558\uBC14\uB098|\uB9C8\uD638\uAC00\uB2C8))/i
const INTERIOR_MARKETING_WHITE_RE = /\b(?:snow\s*white|pure\s*white|polar\s*white|pearl\s*white)\b/i
const INTERIOR_MATERIAL_HINT_RE = /(?:\b(?:leather|nappa|alcantara|suede|quilted|perforated|premium|natural|seat(?:s)?|interior|trim|upholstery|merino|vernasca|sensatec|material)\b|(?:\uAC00\uC8FD|\uB098\uD30C|\uC2DC\uD2B8|\uB0B4\uC7A5|\uC778\uD14C\uB9AC\uC5B4))/i
const INTERIOR_COMPOUND_COLOR_MARKERS = '(?:black|white|beige|brown|gray|grey|red|blue|green|orange|yellow|ivory|cream|oyster|porcelain|macchiato|burgundy|bordeaux|wine|tan|camel|caramel|cognac|charcoal|graphite|cohiba|mahogany|havana|truffle|tartufo|brandy|linen|cashmere|beullaek|geomjeong|heuksaek|beiji|beuraun|geurei|geureiji|redeu|neibi|geurin|orenji|aibori|keurim|beogeondi|wain|kamel|konyak|kkonyak|konnyak|moka|mokka|topeu|\uBE14\uB799|\uAC80\uC815|\uD751\uC0C9|\uD654\uC774\uD2B8|\uD770\uC0C9|\uBC31\uC0C9|\uBCA0\uC774\uC9C0|\uBE0C\uB77C\uC6B4|\uADF8\uB808\uC774|\uD68C\uC0C9|\uB808\uB4DC|\uC801\uC0C9|\uB124\uC774\uBE44|\uCCAD\uC0C9|\uADF8\uB9B0|\uC624\uB80C\uC9C0|\uC544\uC774\uBCF4\uB9AC|\uD06C\uB9BC|\uBC84\uAC74\uB514|\uC640\uC778|\uCE74\uBA5C|\uCE90\uB7EC\uBA5C|\uCF54\uB0D1|\uCC28\uCF5C|\uADF8\uB798\uD53C\uD2B8|\uC624\uC774\uC2A4\uD130|\uD3EC\uC140\uB9B0|\uB9C8\uCE74\uC544\uD1A0|\uCF54\uD788\uBC14|\uD2B8\uB7EC\uD50C|\uD558\uBC14\uB098|\uB9C8\uD638\uAC00\uB2C8)'
const INTERIOR_COMPOUND_CONTEXT_MARKERS = '(?:seat(?:s)?|seatcover|interior|trim|upholstery|leather|nappa|merino|vernasca|sensatec|material|dashboard|headliner|doortrim|cabin|cockpit|siteu|naejang|silnae|inteorieo|gajuk|napa|upeolseuteori|\uC2DC\uD2B8|\uB0B4\uC7A5|\uC2E4\uB0B4|\uC778\uD14C\uB9AC\uC5B4|\uAC00\uC8FD|\uB098\uD30C)'
const INTERIOR_COMPOUND_COLOR_TO_CONTEXT_RE = new RegExp(`(${INTERIOR_COMPOUND_COLOR_MARKERS})(?=${INTERIOR_COMPOUND_CONTEXT_MARKERS})`, 'ig')
const INTERIOR_COMPOUND_CONTEXT_TO_COLOR_RE = new RegExp(`(${INTERIOR_COMPOUND_CONTEXT_MARKERS})(?=${INTERIOR_COMPOUND_COLOR_MARKERS})`, 'ig')
const INTERIOR_EXPLICIT_VALUE_RES = Object.freeze([
  new RegExp(`${INTERIOR_COLOR_EXPLICIT_LABEL_MARKERS}(?:\\s*(?:\\uC0C9\\uC0C1|\\uCEEC\\uB7EC|color|trim))?\\s*[:=-]?\\s*([^|,;\\n]{2,80})`, 'i'),
])
const INTERIOR_MATERIAL_ONLY_RE = /^(?:\b(?:leather|nappa|alcantara|suede|quilted|perforated|premium|natural|seat(?:s)?|interior|trim|upholstery)\b|(?:\uAC00\uC8FD|\uB098\uD30C|\uC2DC\uD2B8|\uB0B4\uC7A5|\uC778\uD14C\uB9AC\uC5B4))(?:[\s/+,&-]+(?:\b(?:leather|nappa|alcantara|suede|quilted|perforated|premium|natural|seat(?:s)?|interior|trim|upholstery)\b|(?:\uAC00\uC8FD|\uB098\uD30C|\uC2DC\uD2B8|\uB0B4\uC7A5|\uC778\uD14C\uB9AC\uC5B4)))*$/i
const INTERIOR_ALLOWED_OUTPUTS = new Set([
  'Черный',
  'Белый',
  'Бежевый',
  'Серый',
  'Коричневый',
  'Красный',
  'Бордовый',
  'Синий',
  'Кремовый',
  'Светло-серый',
  'Темно-серый',
  'Рыжий / карамельный',
  'Двухцветный',
  'Зеленый',
  'Оранжевый',
  'Желтый',
])
const DRIVE_AWD_RE = /\b(?:awd|all[-\s]*wheel(?:\s*drive)?|allrad|all4|quattro|q4|4matic\+?|4motion|syncro|sh-awd|e-awd|e[-\s]*four|e-?4orce|htrac|xdrive(?:[a-z0-9]+)?)\b/i
const DRIVE_4WD_RE = /\b(?:4wd|4x4|4xe|e-?4wd|4wd\s*system)\b/i
const DRIVE_FWD_RE = /\b(?:fwd|ff|front[-\s]*wheel(?:\s*drive)?)\b/i
const DRIVE_RWD_RE = /\b(?:rwd|fr|rear[-\s]*wheel(?:\s*drive)?)\b/i
const DRIVE_AWD_HANGUL_RE = /(?:\uC0C1\uC2DC\s*\uC0AC\uB95C(?:\s*\uAD6C\uB3D9)?|\uC804\uCCB4\s*\uAD6C\uB3D9|\uC804\uC790\uC2DD\s*AWD|\uC774-?AWD)/u
const DRIVE_4WD_HANGUL_RE = /(?:\uC0AC\uB95C(?:\s*\uAD6C\uB3D9)?|\u0034WD\s*\uC2DC\uC2A4\uD15C|\uC0AC\uB95C\s*\uC2DC\uC2A4\uD15C)/u
const DRIVE_FWD_HANGUL_RE = /(?:\uC804\uB95C(?:\s*\uAD6C\uB3D9)?)/u
const DRIVE_RWD_HANGUL_RE = /(?:\uD6C4\uB95C(?:\s*\uAD6C\uB3D9)?)/u
const DRIVE_LABEL_RE = /(?:drive|drivetrain|traction|wheel\s*drive|4wd\s*system|awd\s*system|\uAD6C\uB3D9(?:\uBC29\uC2DD)?|\uB3D9\uB825\uC804\uB2EC)/i
const DRIVE_EXPLICIT_2WD_RE = /(?:\b2wd\b|\btwo[-\s]*wheel(?:\s*drive)?\b|\uC774\uB95C(?:\s*\uAD6C\uB3D9)?|\u0032\uB95C(?:\s*\uAD6C\uB3D9)?)/i
const KEY_INFO_SEGMENT_SPLIT_RE = /(?:\r?\n|[|;]|\/|▶|★|◈|▪|•|\u2022)+/g
const KEY_SPARE_RE = /(?:spare\s*key|\uBCF4\uC870\s*\uD0A4)/i
const KEY_CONTEXT_RE = /(?:\b(?:key(?:\s*count)?|smart\s*key|smartkey|card\s*key|key\s*card|electronic\s*key|digital\s*key|flip\s*key|switchblade\s*key|fold(?:ing)?\s*key|remote\s*key|distance\s*key|mechanical\s*key|metal\s*key|standard\s*key|regular\s*key|plain\s*key)\b|\uCC28\uB7C9\s*\uD0A4\s*\uAC1C\uC218|\uD0A4\s*(?:\uAC1C\uC218|\uC218\uB7C9)|\uC2A4\uB9C8\uD2B8\s*\uD0A4|\uCE74\uB4DC\s*\uD0A4|\uC804\uC790\s*\uD0A4|\uD3F4\uB529\s*\uD0A4|\uB9AC\uBAA8\uCEE8\s*\uD0A4|\uB9AC\uBAA8\uCF58\s*\uD0A4|\uC77C\uBC18\s*\uD0A4|\uAE30\uBCF8\s*\uD0A4|\uCC28\uD0A4)/i
const KEY_POSITIVE_RE = /(?:\b(?:available|included|provided|present|equipped|yes)\b|\uC788\uC74C|\uD3EC\uD568|\uC81C\uACF5|\uC7A5\uCC29)/i
const KEY_NEGATIVE_RE = /(?:\b(?:none|without|absent|missing|not\s*(?:available|included|provided|equipped))\b|\uC5C6\uC74C|\uBBF8\uD3EC\uD568|\uBBF8\uC81C\uACF5|\uBBF8\uC801\uC6A9)/i
const KEY_TYPE_RULES = Object.freeze([
  { label: 'Ключ-карта', patterns: [/\uCE74\uB4DC\s*\uD0A4/u, /\b(?:card\s*key|key\s*card)\b/i] },
  { label: 'Электронный ключ', patterns: [/\uC804\uC790\s*\uD0A4/u, /\b(?:electronic\s*key|digital\s*key|e-?key)\b/i] },
  { label: 'Смарт-ключ', patterns: [/\uC2A4\uB9C8\uD2B8\s*\uD0A4/u, /\b(?:smart\s*key|smartkey)\b/i] },
  { label: 'Выкидной ключ', patterns: [/\uD3F4\uB529\s*\uD0A4|\uC811\uC774\uC2DD\s*\uD0A4/u, /\b(?:flip\s*key|switchblade\s*key|fold(?:ing)?\s*key)\b/i] },
  { label: 'Дистанционный ключ', patterns: [/\uB9AC\uBAA8\uCEE8\s*\uD0A4|\uB9AC\uBAA8\uCF58\s*\uD0A4/u, /\b(?:remote\s*key|distance\s*key)\b/i] },
  { label: 'Обычный ключ', patterns: [/\uC77C\uBC18\s*\uD0A4|\uAE30\uBCF8\s*\uD0A4|\uBA54\uD0C8\s*\uD0A4/u, /\b(?:mechanical\s*key|metal\s*key|standard\s*key|regular\s*key|normal\s*key|plain\s*key)\b/i] },
])
const KEY_COUNT_PATTERNS = Object.freeze([
  /(?:\uCC28\uB7C9\s*\uD0A4\s*\uAC1C\uC218|\uD0A4\s*(?:\uAC1C\uC218|\uC218\uB7C9)|number\s*of\s*keys|key\s*count)\s*[:=x-]?\s*(\d{1,2})\s*(?:\uAC1C|ea|pcs?|шт\.?)?/i,
  /(?:\uCC28\uD0A4|\uD0A4)\s*[:=x-]?\s*(\d{1,2})\s*(?:\uAC1C|ea|pcs?)\b/i,
  /(?:\uC2A4\uB9C8\uD2B8\s*\uD0A4|\uCE74\uB4DC\s*\uD0A4|\uC804\uC790\s*\uD0A4|\uD3F4\uB529\s*\uD0A4|\uB9AC\uBAA8\uCEE8\s*\uD0A4|\uB9AC\uBAA8\uCF58\s*\uD0A4|\uC77C\uBC18\s*\uD0A4|\uAE30\uBCF8\s*\uD0A4|\uD0A4)\s*[:=x-]?\s*(\d{1,2})\s*(?:\uAC1C|ea|pcs?|keys?)?/i,
  /(?:smart\s*key|smartkey|card\s*key|key\s*card|electronic\s*key|digital\s*key|e-?key|flip\s*key|switchblade\s*key|fold(?:ing)?\s*key|remote\s*key|distance\s*key|mechanical\s*key|metal\s*key|standard\s*key|regular\s*key|plain\s*key|keys?)\s*[:=x-]?\s*(\d{1,2})\s*(?:ea|pcs?|keys?|개)?/i,
  /(\d{1,2})\s*(?:\uAC1C|ea|pcs?|шт\.?)\s*(?:of\s*)?(?:smart\s*key|smartkey|card\s*key|key\s*card|electronic\s*key|digital\s*key|e-?key|flip\s*key|switchblade\s*key|fold(?:ing)?\s*key|remote\s*key|distance\s*key|mechanical\s*key|metal\s*key|standard\s*key|regular\s*key|plain\s*key|keys?|\uC2A4\uB9C8\uD2B8\s*\uD0A4|\uCE74\uB4DC\s*\uD0A4|\uC804\uC790\s*\uD0A4|\uD3F4\uB529\s*\uD0A4|\uB9AC\uBAA8\uCEE8\s*\uD0A4|\uB9AC\uBAA8\uCF58\s*\uD0A4|\uC77C\uBC18\s*\uD0A4|\uAE30\uBCF8\s*\uD0A4|\uD0A4)/i,
  /(\d{1,2})\s*(?:smart\s*keys?|card\s*keys?|electronic\s*keys?|digital\s*keys?|flip\s*keys?|remote\s*keys?|distance\s*keys?|mechanical\s*keys?|metal\s*keys?|regular\s*keys?|plain\s*keys?|keys?)/i,
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
  ['strandard', 'Standard'],
  ['pure-tech', 'Pure Tech'],
  ['pure tech', 'Pure Tech'],
  ['puretech', 'Pure Tech'],
  ['pur-tech', 'Pure Tech'],
  ['pur tech', 'Pure Tech'],
  ['purtech', 'Pure Tech'],
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
  'ultimate bright',
  'gran coupe',
  'sportback',
  'evo spyder',
  'spyder',
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

function normalizeInteriorSourceText(value) {
  const text = cleanText(value)
  if (!text) return ''

  return cleanText(
    text
      .replace(INTERIOR_COMPOUND_COLOR_TO_CONTEXT_RE, '$1 ')
      .replace(INTERIOR_COMPOUND_CONTEXT_TO_COLOR_RE, '$1 ')
      .replace(/([a-z])([A-Z])/g, '$1 $2'),
  )
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
const KOREAN_VEHICLE_BRAND_RE = /\b(kia|gia|hyundai|hyeondae|genesis|jenesiseu|daewoo|renault(?:\s+korea|\s+samsung)|renault samsung|reunokoria|samsung|samseong|ssangyong|kg\s*mobility|kgmobilriti)\b/i
const KOREAN_VEHICLE_BRAND_HANGUL_RE = /\uAE30\uC544|\uD604\uB300|\uC81C\uB124\uC2DC\uC2A4|\uB300\uC6B0|\uB974\uB178\uCF54\uB9AC\uC544|\uC0BC\uC131|\uC30D\uC6A9|\uBAA8\uBE4C\uB9AC\uD2F0/u
const KOREAN_VEHICLE_MODEL_RE = /\b(sm3|sm5|sm6|sm7|qm3|qm5|qm6|xm3|k3|k5|k7|k8|k9|g70|g80|g90|gv60|gv70|gv80|eq900|avante|elantra|sonata|grandeur|azera|santafe|santa\s*fe|tucson|palisade|staria|starex|porter|bongo|casper|morning|ray|carnival|sorento|sportage|seltos|mohave|niro|kona|orlando|trailblazer|trax|malibu|spark|matiz|damas|labo|rexton|actyon|korando|tivoli|torres|musso|bolteu|bolt|ioniq|aionik|veloster|stinger|soul|ssoul|ev3|ev4|ev5|ev6|ev9)\b/i

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
    KOREAN_VEHICLE_BRAND_RE.test(text) ||
    KOREAN_VEHICLE_BRAND_HANGUL_RE.test(text) ||
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
  if (low.includes('hybrid') || low.includes('hev') || low.includes('phev') || text.includes('하이브리드')) return 'Гибрид'
  if (low.includes('hydrogen') || low.includes('fuel cell') || low.includes('suso') || low.includes('водород') || text.includes('수소') || text.includes('연료전지')) return 'Водород'
  if (low.includes('electric') || text.includes('전기')) return 'Электро'
  if (low.includes('lpg') || text.includes('엘피지')) return 'Газ (LPG)'
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
  if (DRIVE_AWD_RE.test(low) || DRIVE_AWD_HANGUL_RE.test(text)) return '\u041f\u043e\u043b\u043d\u044b\u0439 (AWD)'
  if (DRIVE_4WD_RE.test(low) || DRIVE_4WD_HANGUL_RE.test(text)) return '\u041f\u043e\u043b\u043d\u044b\u0439 (4WD)'
  if (DRIVE_RWD_RE.test(low) || DRIVE_RWD_HANGUL_RE.test(text)) return '\u0417\u0430\u0434\u043d\u0438\u0439 (RWD)'
  if (DRIVE_FWD_RE.test(low) || DRIVE_FWD_HANGUL_RE.test(text)) return '\u041f\u0435\u0440\u0435\u0434\u043d\u0438\u0439 (FWD)'
  return ''
}

function flattenTextValues(values = []) {
  const flattened = []

  for (const value of values) {
    if (Array.isArray(value)) {
      flattened.push(...flattenTextValues(value))
      continue
    }

    const text = cleanText(value)
    if (text) flattened.push(text)
  }

  return flattened
}

export function inferDrive(...values) {
  for (const value of flattenTextValues(values)) {
    const normalized = normalizeDrive(value)
    if (normalized) return normalized
  }
  return inferDriveFromKnownModelContext(...values).value
}

export function inferDriveFromKnownModelContext(...values) {
  const text = flattenTextValues(values).join(' ')
  if (!text) return { value: '', reason: '' }
  if (normalizeDrive(text)) return { value: '', reason: '' }
  return inferDriveFromModelTable(text)
}

export function extractDriveFromPairs(pairs = []) {
  const matches = []

  for (const pair of pairs) {
    const label = cleanText(pair?.label)
    const value = cleanText(pair?.value)
    if (!label && !value) continue

    const combined = [label, value].filter(Boolean).join(' ')
    if (label && !DRIVE_LABEL_RE.test(label) && !normalizeDrive(combined)) continue

    const normalized = normalizeDrive(combined)
    if (normalized && !matches.includes(normalized)) matches.push(normalized)
  }

  return matches.length === 1 ? matches[0] : ''
}

const BODY_CLASS_LABELS = new Set([
  '\u0421\u0435\u0434\u0430\u043d \u043c\u0430\u043b\u043e\u0433\u043e \u043a\u043b\u0430\u0441\u0441\u0430',
  '\u0421\u0435\u0434\u0430\u043d \u043a\u043e\u043c\u043f\u0430\u043a\u0442-\u043a\u043b\u0430\u0441\u0441\u0430',
  '\u0421\u0435\u0434\u0430\u043d \u0441\u0440\u0435\u0434\u043d\u0435\u0433\u043e \u043a\u043b\u0430\u0441\u0441\u0430',
  '\u0421\u0435\u0434\u0430\u043d \u0431\u0438\u0437\u043d\u0435\u0441-\u043a\u043b\u0430\u0441\u0441\u0430',
])

const SUV_BODY_HINT_RE = /\b(santa[\s-]*fe|santafe|tucson|sorento|sportage|seltos|palisade|mohave|trailblazer|trax|qm6|gv60|gv70|gv80|korando|tivoli|niro|kona|torres)\b/i
const MINIVAN_BODY_HINT_RE = /\b(carnival|staria|starex|orlando|master)\b/i
const MINI_BODY_HINT_RE = /\b(casper|morning|spark|ray)\b/i
const PICKUP_BODY_HINT_RE = /\b(korando\s+sports|rexton\s+sports|sports\s+cx7|pickup)\b/i
const LIFTBACK_BODY_HINT_RE = /\b(sportback|seupoteubaek|liftback|fastback)\b/i
const GRAN_COUPE_BODY_HINT_RE = /\b(gran\s+coupe|geurankupe|4[-\s]*door\s+coupe)\b/i
const SPORTSCAR_BODY_HINT_RE = /\b(sportska|sportscar|huracan|aventador|gallardo|murcielago|revuelto|r8\b|amg\s*gt|mclaren|f8\b|488\b|458\b|720s\b|570s\b|650s\b|600lt\b)\b/i
const SEDAN_BODY_HINT_RE = /\b(k3|k5|k7|k8|k9|avante|elantra|sonata|grandeur|g70|g80|g90|eq900|sm3|sm5|sm6|sm7|malibu|impala|cts|s80|s90|camry|accord)\b/i
const HATCH_BODY_HINT_RE = /\b(ioniq|aionik|i30|ceed|cee['’ -]?d|picanto|morning|spark|matiz|golf|polo|veloster|brio)\b/i
const WAGON_BODY_HINT_RE = /\b(wagon|estate|touring|shooting\s*brake)\b/i
const COUPE_BODY_HINT_RE = /\b(coupe|genesis\s+coupe|86|brz)\b/i
const CABRIO_BODY_HINT_RE = /\b(cabrio|cabriolet|convertible|roadster)\b/i

function normalizeRawBodyLabel(value) {
  const raw = cleanText(value)
  if (!raw) return ''
  const low = raw.toLowerCase()

  if (low === 'sportska' || low === 'sportscar') return '\u0421\u043f\u043e\u0440\u0442\u043a\u0430\u0440'
  if (low === 'suv' || low === 'rv') return '\u041a\u0440\u043e\u0441\u0441\u043e\u0432\u0435\u0440 / \u0432\u043d\u0435\u0434\u043e\u0440\u043e\u0436\u043d\u0438\u043a'
  if (low === '\u0432\u044d\u043d' || low === 'van' || low === 'minivan') return '\u041c\u0438\u043d\u0438\u0432\u044d\u043d'
  if (low === '-') return ''
  return raw
}

export function normalizeBodyType(value) {
  return normalizeBodyTypeLabel(normalizeText(value))
}

function UNUSED_inferPassengerBodyTypeFromText(...values) {
  const text = values
    .map((value) => cleanText(value))
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (!text) return ''
  if (PICKUP_BODY_HINT_RE.test(text)) return '\u0413\u0440\u0443\u0437\u043e\u0432\u043e\u0439 / \u043f\u0438\u043a\u0430\u043f'
  if (MINIVAN_BODY_HINT_RE.test(text)) return '\u041c\u0438\u043d\u0438\u0432\u044d\u043d'
  if (MINI_BODY_HINT_RE.test(text)) return '\u041c\u0438\u043d\u0438'
  if (GRAN_COUPE_BODY_HINT_RE.test(text)) return '4-\u0434\u0432\u0435\u0440\u043d\u043e\u0435 \u043a\u0443\u043f\u0435'
  if (LIFTBACK_BODY_HINT_RE.test(text)) return '\u041b\u0438\u0444\u0442\u0431\u0435\u043a'
  if (SPORTSCAR_BODY_HINT_RE.test(text)) return '\u0421\u043f\u043e\u0440\u0442\u043a\u0430\u0440'
  if (CABRIO_BODY_HINT_RE.test(text)) return '\u041a\u0430\u0431\u0440\u0438\u043e\u043b\u0435\u0442'
  if (WAGON_BODY_HINT_RE.test(text)) return '\u0423\u043d\u0438\u0432\u0435\u0440\u0441\u0430\u043b'
  if (COUPE_BODY_HINT_RE.test(text)) return '\u041a\u0443\u043f\u0435'
  if (HATCH_BODY_HINT_RE.test(text) || /\bhatch\b/i.test(text)) return '\u0425\u044d\u0442\u0447\u0431\u0435\u043a'
  if (SEDAN_BODY_HINT_RE.test(text) || /\bsedan\b/i.test(text)) return '\u0421\u0435\u0434\u0430\u043d'
  if (SUV_BODY_HINT_RE.test(text)) return '\u041a\u0440\u043e\u0441\u0441\u043e\u0432\u0435\u0440 / \u0432\u043d\u0435\u0434\u043e\u0440\u043e\u0436\u043d\u0438\u043a'
  return ''
}

export function isWeakBodyType(value) {
  return isWeakCanonicalBodyTypeLabel(value)
}

export function resolveBodyType(...values) {
  const [bodyValue, ...contextValues] = values
  return resolveBodyTypeLabel(normalizeRawBodyLabel(bodyValue), ...contextValues.map((value) => normalizeText(value)))
}

export function normalizeVehicleClass(value) {
  return normalizeVehicleClassLabel(normalizeText(value))
}

export function resolveVehicleClass(...values) {
  const [classValue, bodyValue, ...contextValues] = values
  return resolveVehicleClassLabel(
    normalizeText(classValue),
    normalizeRawBodyLabel(bodyValue),
    ...contextValues.map((value) => normalizeText(value)),
  )
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
  if (/^geumsaektuton$/.test(compact) || /(gold|geumsaek)/.test(low) || /금색/u.test(raw)) return 'Золотой двухцветный'
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
    const finalized = applyTrimFixes(translated || text)
    if (finalized && !tokens.every((token) => SPEC_TOKENS.test(token)) && !isTrimNoise(finalized)) {
      return finalized
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
  const translatedNormalized = translated && translated !== raw
    ? normalizeColorName(translated)
    : ''

  return finalizeColorLabel(
    translatedNormalized ||
    normalizeRequestedRomanizedColorAlias(translated) ||
    translated,
  )
}

function mapGenericInteriorColor(value) {
  const normalized = cleanText(value)
  if (!normalized) return ''

  let mapped = normalized
  if (normalized === '\u0410\u0439\u0432\u043e\u0440\u0438') mapped = '\u041a\u0440\u0435\u043c\u043e\u0432\u044b\u0439'
  else if (normalized === '\u0412\u0438\u043d\u043d\u044b\u0439') mapped = '\u0411\u043e\u0440\u0434\u043e\u0432\u044b\u0439'
  else if (normalized === '\u0413\u0440\u0430\u0444\u0438\u0442\u043e\u0432\u044b\u0439' || normalized === '\u041c\u043e\u043a\u0440\u044b\u0439 \u0430\u0441\u0444\u0430\u043b\u044c\u0442') mapped = '\u0422\u0435\u043c\u043d\u043e-\u0441\u0435\u0440\u044b\u0439'
  else if (normalized === '\u0421\u0435\u0440\u0435\u0431\u0440\u0438\u0441\u0442\u044b\u0439' || normalized === '\u0421\u0435\u0440\u0435\u0431\u0440\u0438\u0441\u0442\u043e-\u0441\u0435\u0440\u044b\u0439') mapped = '\u0421\u0432\u0435\u0442\u043b\u043e-\u0441\u0435\u0440\u044b\u0439'

  return INTERIOR_ALLOWED_OUTPUTS.has(mapped) ? mapped : ''
}

function isStandaloneInteriorColorMatch(text, index, matchValue) {
  const before = text[index - 1] || ''
  const after = text[index + matchValue.length] || ''
  return !INTERIOR_COLOR_BOUNDARY_RE.test(before) && !INTERIOR_COLOR_BOUNDARY_RE.test(after)
}

function hasCompoundInteriorColorContext(text, index, matchValue) {
  const before = text.slice(Math.max(0, index - 18), index)
  const after = text.slice(index + matchValue.length, Math.min(text.length, index + matchValue.length + 18))
  return INTERIOR_COMPOUND_EDGE_CONTEXT_RE.test(before) || INTERIOR_COMPOUND_EDGE_CONTEXT_RE.test(after)
}

function getInteriorColorMatchWindow(text, index, matchValue) {
  const radius = 24
  const start = Math.max(0, index - radius)
  const end = Math.min(text.length, index + matchValue.length + radius)
  return text.slice(start, end)
}

function isShortInteriorColorValue(value) {
  const text = normalizeInteriorSourceText(value)
  if (!text) return false
  const tokens = text.split(/\s+/).filter(Boolean)
  return tokens.length <= 5 && text.length <= 42 && !/[.!?]/.test(text)
}

function shouldKeepInteriorColorValue(rawValue, normalizedValue) {
  const raw = normalizeInteriorSourceText(rawValue)
  const normalized = cleanText(normalizedValue)
  if (!raw || !normalized || !INTERIOR_ALLOWED_OUTPUTS.has(normalized)) return false
  if (raw === normalized) return true
  if (INTERIOR_TWO_TONE_HINT_RE.test(raw)) return true
  if (isShortInteriorColorValue(raw) && INTERIOR_COLOR_VALUE_RE.test(raw)) return true
  if (raw.length > 80 || /[.!?]/.test(raw)) return false
  if (INTERIOR_MATERIAL_HINT_RE.test(raw) && raw.split(/\s+/).filter(Boolean).length <= 10) return true
  if (INTERIOR_COLOR_CONTEXT_RE.test(raw) && raw.split(/\s+/).filter(Boolean).length <= 8) return true
  return false
}

function collectInteriorColorEvidence(value) {
  const text = normalizeInteriorSourceText(value)
  if (!text) return []

  const matches = []
  for (const { color, source } of INTERIOR_COLOR_TEXT_PATTERNS) {
    const pattern = new RegExp(source, 'ig')
    let match

    while ((match = pattern.exec(text))) {
      const matchedValue = cleanText(match[0])
      if (!matchedValue) continue
      const standaloneMatch = isStandaloneInteriorColorMatch(text, match.index, matchedValue)
      const compoundContext = hasCompoundInteriorColorContext(text, match.index, matchedValue)
      if (!standaloneMatch && !compoundContext) continue

      const window = getInteriorColorMatchWindow(text, match.index, matchedValue)
      const hasLocalContext =
        INTERIOR_COLOR_CONTEXT_RE.test(window) ||
        INTERIOR_MATERIAL_HINT_RE.test(window) ||
        compoundContext

      if (!hasLocalContext && color !== '\u0414\u0432\u0443\u0445\u0446\u0432\u0435\u0442\u043d\u044b\u0439') continue

      matches.push({
        color,
        index: match.index,
        matchedValue,
        hasLocalContext,
      })
    }
  }

  return matches
}

function UNUSED_collectInteriorColorMatches(value) {
  return [...new Set(collectInteriorColorEvidence(value).map((item) => item.color).filter(Boolean))]
}

function collectDirectInteriorColorMatches(value) {
  const text = normalizeInteriorSourceText(value)
  if (!text) return []

  const matches = []
  for (const { color, source } of INTERIOR_COLOR_TEXT_PATTERNS) {
    if (color === '\u0414\u0432\u0443\u0445\u0446\u0432\u0435\u0442\u043d\u044b\u0439') continue

    const pattern = new RegExp(source, 'ig')
    let match
    while ((match = pattern.exec(text))) {
      const matchedValue = cleanText(match[0])
      if (!matchedValue) continue
      if (!isStandaloneInteriorColorMatch(text, match.index, matchedValue) && !hasCompoundInteriorColorContext(text, match.index, matchedValue)) continue
      if (!matches.includes(color)) matches.push(color)
    }
  }

  return matches
}

function mergeInteriorColorResults(values = []) {
  const unique = [...new Set(values.map((value) => cleanText(value)).filter(Boolean))]
  if (!unique.length) return ''
  if (unique.includes('\u0414\u0432\u0443\u0445\u0446\u0432\u0435\u0442\u043d\u044b\u0439')) return '\u0414\u0432\u0443\u0445\u0446\u0432\u0435\u0442\u043d\u044b\u0439'
  return unique.length > 1 ? '\u0414\u0432\u0443\u0445\u0446\u0432\u0435\u0442\u043d\u044b\u0439' : unique[0]
}

function normalizeInteriorColorCandidate(value) {
  const text = normalizeInteriorSourceText(value)
  if (!text) return ''
  if (INTERIOR_MATERIAL_ONLY_RE.test(text)) return ''

  const shortDirectMatches = isShortInteriorColorValue(text) ? collectDirectInteriorColorMatches(text) : []
  const shortDirectNormalized = isShortInteriorColorValue(text)
    ? (
      shortDirectMatches.length > 1 && (INTERIOR_COLOR_SEPARATOR_RE.test(text) || INTERIOR_TWO_TONE_HINT_RE.test(text))
        ? '\u0414\u0432\u0443\u0445\u0446\u0432\u0435\u0442\u043d\u044b\u0439'
        : shortDirectMatches[0] || mapGenericInteriorColor(normalizeColorName(text))
    )
    : ''
  const evidence = collectInteriorColorEvidence(text)
  const matches = [...new Set(
    evidence
      .map((item) => item.color)
      .filter((color) => color && color !== '\u0414\u0432\u0443\u0445\u0446\u0432\u0435\u0442\u043d\u044b\u0439'),
  )]
  const contextualMatches = [...new Set(
    evidence
      .filter((item) => item.hasLocalContext)
      .map((item) => item.color)
      .filter((color) => color && color !== '\u0414\u0432\u0443\u0445\u0446\u0432\u0435\u0442\u043d\u044b\u0439'),
  )]
  if (INTERIOR_TWO_TONE_HINT_RE.test(text)) {
    return shouldKeepInteriorColorValue(text, '\u0414\u0432\u0443\u0445\u0446\u0432\u0435\u0442\u043d\u044b\u0439') ? '\u0414\u0432\u0443\u0445\u0446\u0432\u0435\u0442\u043d\u044b\u0439' : ''
  }
  if (INTERIOR_MARKETING_WHITE_RE.test(text) && !contextualMatches.length) return ''
  if (shortDirectNormalized && matches.length > 1 && !contextualMatches.length) {
    return shouldKeepInteriorColorValue(text, shortDirectNormalized) ? shortDirectNormalized : ''
  }
  if (matches.length > 1 && (INTERIOR_COLOR_SEPARATOR_RE.test(text) || contextualMatches.length > 1 || isShortInteriorColorValue(text))) {
    return shouldKeepInteriorColorValue(text, '\u0414\u0432\u0443\u0445\u0446\u0432\u0435\u0442\u043d\u044b\u0439') ? '\u0414\u0432\u0443\u0445\u0446\u0432\u0435\u0442\u043d\u044b\u0439' : ''
  }
  if (matches.length === 1) {
    if (!contextualMatches.length && !isShortInteriorColorValue(text)) return ''
    return shouldKeepInteriorColorValue(text, matches[0]) ? matches[0] : ''
  }
  if (!isShortInteriorColorValue(text)) return ''

  const normalized = shortDirectNormalized || mapGenericInteriorColor(normalizeColorName(text))
  return shouldKeepInteriorColorValue(text, normalized) ? normalized : ''
}

export function normalizeInteriorColorName(value, bodyValue = '') {
  const options = arguments[2] && typeof arguments[2] === 'object' ? arguments[2] : {}
  const rawInterior = normalizeInteriorSourceText(value)
  if (!rawInterior) return ''

  const normalizedInterior = normalizeInteriorColorCandidate(rawInterior)
  const normalizedBody = mapGenericInteriorColor(normalizeColorName(bodyValue))

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

export function isInteriorColorLabel(value) {
  const text = cleanText(value)
  if (!text) return false
  return INTERIOR_COLOR_LABEL_RE.test(text) && !INTERIOR_COLOR_REJECT_RE.test(text)
}

export function isInteriorColorRejectLabel(value) {
  return INTERIOR_COLOR_REJECT_RE.test(cleanText(value))
}

export function hasInteriorColorContext(value) {
  return INTERIOR_COLOR_CONTEXT_RE.test(normalizeInteriorSourceText(value))
}

function splitInteriorTextSegments(value) {
  return String(value || '')
    .split(INTERIOR_COLOR_SEGMENT_SPLIT_RE)
    .map((segment) => cleanText(segment))
    .filter(Boolean)
}

function extractInteriorColorFromSegment(value, bodyValue = '') {
  const text = normalizeInteriorSourceText(value)
  if (!text) return ''

  for (const pattern of INTERIOR_EXPLICIT_VALUE_RES) {
    const explicitMatch = text.match(pattern)
    const explicitValue = cleanText(explicitMatch?.[1] || '')
    const normalizedExplicit = normalizeInteriorColorName(explicitValue, bodyValue, { allowBodyDuplicate: true })
    if (normalizedExplicit) return normalizedExplicit
  }

  if (!INTERIOR_COLOR_CONTEXT_RE.test(text) || INTERIOR_COLOR_REJECT_RE.test(text)) return ''
  return normalizeInteriorColorName(text, bodyValue, { allowBodyDuplicate: true })
}

export function extractInteriorColorFromText(value, bodyValue = '') {
  const text = normalizeInteriorSourceText(value)
  if (!text) return ''

  const segmentMatches = []
  for (const segment of splitInteriorTextSegments(text)) {
    const segmentedMatch = extractInteriorColorFromSegment(segment, bodyValue)
    if (segmentedMatch) segmentMatches.push(segmentedMatch)
  }

  const mergedSegmentMatch = mergeInteriorColorResults(segmentMatches)
  if (mergedSegmentMatch) return mergedSegmentMatch

  return extractInteriorColorFromSegment(text, bodyValue)
}

export function extractInteriorColorFromPairs(pairs = [], bodyValue = '') {
  const pairMatches = []
  for (const pair of pairs) {
    const label = cleanText(pair?.label)
    const value = cleanText(pair?.value)
    if (!label || !value) continue
    if (!INTERIOR_COLOR_LABEL_RE.test(label) || INTERIOR_COLOR_REJECT_RE.test(label)) continue

    const direct = normalizeInteriorColorName(value, bodyValue, { allowBodyDuplicate: true })
    if (direct) {
      pairMatches.push(direct)
      continue
    }

    const contextual = extractInteriorColorFromText(`${label} ${value}`, bodyValue)
    if (contextual) pairMatches.push(contextual)
  }

  return mergeInteriorColorResults(pairMatches)
}

export function isGenericColorLabel(value) {
  return GENERIC_COLOR_LABELS.has(cleanText(value))
}

function splitKeyInfoSegments(value) {
  return String(value || '')
    .split(KEY_INFO_SEGMENT_SPLIT_RE)
    .map((segment) => cleanText(segment))
    .filter(Boolean)
}

function normalizeKeyCount(value) {
  const numeric = Number.parseInt(String(value || '').trim(), 10)
  return Number.isFinite(numeric) && numeric > 0 && numeric <= 9 ? String(numeric) : ''
}

export function hasKeyContext(value) {
  return KEY_CONTEXT_RE.test(cleanText(value))
}

export function hasPositiveKeyContext(value) {
  const text = cleanText(value)
  return hasKeyContext(text) && KEY_POSITIVE_RE.test(text)
}

export function hasNegativeKeyContext(value) {
  const text = cleanText(value)
  return hasKeyContext(text) && KEY_NEGATIVE_RE.test(text)
}

export function detectKeyType(value) {
  const text = cleanText(value)
  if (!text || KEY_SPARE_RE.test(text) || hasNegativeKeyContext(text)) return ''

  for (const rule of KEY_TYPE_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) return rule.label
  }

  return ''
}

export function collectKeyCounts(sources = []) {
  const counts = []

  for (const source of sources) {
    if (!source || KEY_SPARE_RE.test(source) || hasNegativeKeyContext(source)) continue

    for (const pattern of KEY_COUNT_PATTERNS) {
      const match = source.match(pattern)
      const count = normalizeKeyCount(match?.[1] || '')
      if (count && !counts.includes(count)) counts.push(count)
    }
  }

  return counts
}

export function extractKeyInfo({ contentsText, texts = [], pairs = [], inspectionRows = [] } = {}) {
  const sources = [
    cleanText(contentsText),
    ...texts.map((value) => cleanText(value)),
    ...pairs.map((pair) => cleanText([pair?.label, pair?.value].filter(Boolean).join(' '))),
    ...inspectionRows.map((row) => cleanText([row?.label, row?.detail, row?.note, ...(row?.states || [])].join(' '))),
  ]
    .flatMap(splitKeyInfoSegments)
    .filter(Boolean)

  if (!sources.length) return ''

  const keyTypes = [...new Set(sources.map(detectKeyType).filter(Boolean))]
  const keyCounts = collectKeyCounts(sources)
  const keyType = keyTypes.length === 1 ? keyTypes[0] : ''
  const keyCount = keyCounts.length === 1 ? keyCounts[0] : ''

  if (keyType && keyCount) return `${keyType}: ${keyCount} шт.`
  if (keyType) return keyType
  if (keyCount) return `Ключи: ${keyCount} шт.`

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

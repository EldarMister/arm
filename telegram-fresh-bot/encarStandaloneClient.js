import axios from 'axios'
import {
  buildEncarSourceDiagnostic,
  decorateEncarSourceError,
  fetchViaEncarProxy,
  getPreferredEncarSource,
  hasEncarProxy,
  isEncarProxySuppressed,
  rememberHealthyEncarSource,
  shouldRetryViaAlternateEncarSource,
  suppressEncarProxy,
} from './encarSource.js'

const LIST_PAGE_SIZE = 20
const MIN_YEAR = 2019
const DEFAULT_MAX_PAGES = 25
const DEFAULT_STALE_PAGE_LIMIT = 4
const FRESH_RULES = Object.freeze({
  maxViewCount: 6,
  maxCallCount: 0,
  maxSubscribeCount: 0,
})

const PARSE_SCOPE_ALL = 'all'
const PARSE_SCOPE_DOMESTIC = 'domestic'
const PARSE_SCOPE_IMPORTED = 'imported'
const PARSE_SCOPE_JAPANESE = 'japanese'
const PARSE_SCOPE_GERMAN = 'german'

const JAPANESE_BRAND_ALIASES = [
  'toyota',
  'lexus',
  'honda',
  'nissan',
  'infiniti',
  'mazda',
  'subaru',
  'mitsubishi',
  'suzuki',
  'isuzu',
  'daihatsu',
  'acura',
]

const GERMAN_BRAND_ALIASES = [
  'bmw',
  'mercedesbenz',
  'mercedes',
  'benz',
  'audi',
  'volkswagen',
  'vw',
  'porsche',
  'mini',
  'smart',
  'maybach',
  'opel',
]

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
]

const KOREAN_VEHICLE_BRAND_RE = /\b(kia|gia|hyundai|hyeondae|genesis|jenesiseu|daewoo|renault(?:\s+korea|\s+samsung)|renault samsung|reunokoria|samsung|samseong|ssangyong|kg\s*mobility|kgmobilriti)\b/i
const KOREAN_VEHICLE_BRAND_HANGUL_RE = /\uAE30\uC544|\uD604\uB300|\uC81C\uB124\uC2DC\uC2A4|\uB300\uC6B0|\uB974\uB178\uCF54\uB9AC\uC544|\uC0BC\uC131|\uC30D\uC6A9|\uBAA8\uBE4C\uB9AC\uD2F0/u
const KOREAN_VEHICLE_MODEL_RE = /\b(sm3|sm5|sm6|sm7|qm3|qm5|qm6|xm3|k3|k5|k7|k8|k9|g70|g80|g90|gv60|gv70|gv80|eq900|avante|elantra|sonata|grandeur|azera|santafe|santa\s*fe|tucson|palisade|staria|starex|porter|bongo|casper|morning|ray|carnival|sorento|sportage|seltos|mohave|niro|kona|orlando|trailblazer|trax|malibu|spark|matiz|damas|labo|rexton|actyon|korando|tivoli|torres|musso|bolteu|bolt|ioniq|aionik|veloster|stinger|soul|ssoul|ev3|ev4|ev5|ev6|ev9)\b/i

const HANGUL_RE = /[\uAC00-\uD7A3]/u
const HANGUL_SEQ_RE = /[\uAC00-\uD7A3]+/gu
const SPEC_TOKENS = /^(?:gasoline|diesel|hybrid|electric|lpg|turbo|2wd|4wd|awd|fwd|rwd|at|mt|cvt|dct|\d(?:\.\d)?t?)$/i
const PASSENGER_COUNT_TRIM_RE = /\b\d+\s*(?:inseung|seats?)\b/i
const DOOR_COUNT_TRIM_RE = /\b\d+\s*(?:ddeo|doeo|door)\b/i
const LEGACY_RENAULT_SAMSUNG_MODEL_RE = /\b(sm3|sm5|sm6|sm7|qm3|qm5|qm6|xm3)\b/i

const TITLE_SAFE_TRIM_PATTERNS = [
  /\bNumber One Edition\b/i,
  /\bHi-Tech\b/i,
  /\bHyper\b/i,
  /\bCalligraphy\b/i,
  /\bGravity\b/i,
  /\bVision\b/i,
  /\bSpecial\b/i,
  /\bDeluxe(?: Pack)?\b/i,
  /\bIntelligent\b/i,
  /\bMaster\b/i,
  /\bCore\b/i,
  /\bLimo(?:usine)?\b/i,
  /\bLounge\b/i,
  /\bTrendy\b/i,
  /\bCamper\b/i,
  /\bMobile Office\b/i,
  /\bPlus\b/i,
  /\bPremi(?:ere|er)\b/i,
  /\bInscription\b/i,
  /\b(?:The )?Essential\b/i,
  /\bPrestige\b/i,
  /\bLuxury\b/i,
  /\bPremium\b/i,
  /\bSignature\b/i,
  /\bNoblesse\b/i,
  /\bExclusive\b/i,
  /\bInspire\b/i,
  /\bModern\b/i,
  /\bSmartstream\b/i,
  /\bSmart\b/i,
  /\bStyle\b/i,
  /\bComfort\b/i,
  /\bStandard\b/i,
  /\bTech\b/i,
  /\bAdvanced\b/i,
  /\bPlatinum\b/i,
  /\bLimited\b/i,
  /\bExecutive\b/i,
  /\bBlack Edition\b/i,
  /\bElite\b/i,
  /\bBest Selection\b/i,
  /\bSupreme\b/i,
  /\bValue(?: Plus)?\b/i,
  /\bCollection\b/i,
  /\bCelebrity\b/i,
  /\bLe Blanc\b/i,
  /\bHigh Grade\b/i,
  /\bPrime Pack\b/i,
  /\bHi-Limousine\b/i,
  /\bAir\b/i,
  /\bEarth\b/i,
  /\bLight\b/i,
  /\bFamily\b/i,
  /\bExport\b/i,
  /\bSchool Bus\b/i,
  /\bAvenue\b/i,
  /\bCoach\b/i,
  /\bDynamic\b/i,
  /\bIconic\b/i,
  /\bChoice\b/i,
  /\b1 Million\b/i,
  /\bYoung Pack\b/i,
  /\bTop\b/i,
  /\bLibic\b/i,
  /\bAvantgarde\b/i,
  /\bQuattro\b/i,
  /\bCompetition\b/i,
  /\bRubicon\b/i,
  /\bPrime\b/i,
  /\bSpecial vehicle\b/i,
]

const TITLE_REPLACEMENTS = [
  [/\b(?:hyeondae|hyundai)\s+jenesiseu\b/gi, 'Genesis'],
  [/\b(?:hyeondae|hyundai)\s+genesis\b/gi, 'Genesis'],
  [/\bgia\b/gi, 'Kia'],
  [/\bhyeondae\b/gi, 'Hyundai'],
  [/\bjenesiseu\b/gi, 'Genesis'],
  [/\bssangyong\b/gi, 'SsangYong'],
  [/\bkgmobilriti\s*\(\s*ssangyong\s*\)/gi, 'KG Mobility (SsangYong)'],
  [/\bkgmobilriti\b/gi, 'KG Mobility'],
  [/\breunokoria\b/gi, 'Renault Korea'],
  [/\bcanival\b/gi, 'Carnival'],
  [/\bkanibal\b/gi, 'Carnival'],
  [/\bssorento\b/gi, 'Sorento'],
  [/\bssonate?a\b/gi, 'Sonata'],
  [/\bgeuraenjeo\b/gi, 'Grandeur'],
  [/\bssantafe\b/gi, 'Santa Fe'],
  [/\bssantape\b/gi, 'Santa Fe'],
  [/\bseupoteiji\b/gi, 'Sportage'],
  [/\bseupotiji\b/gi, 'Sportage'],
  [/\bseltoseu\b/gi, 'Seltos'],
  [/\bkaeseupeo\b/gi, 'Casper'],
  [/\bpaelliseideu\b/gi, 'Palisade'],
  [/\bseutaria\b/gi, 'Staria'],
  [/\bseutarekseu\b/gi, 'Starex'],
  [/\bteureilbeulreijeo\b/gi, 'Trailblazer'],
  [/\bteuraegseu\b/gi, 'Trax'],
  [/\btussan\b/gi, 'Tucson'],
  [/\bbonggo\b/gi, 'Bongo'],
  [/\bmalribu\b/gi, 'Malibu'],
  [/\bmoning\b/gi, 'Morning'],
  [/\brei\b/gi, 'Ray'],
  [/\bbolteu\b/gi, 'Bolt'],
  [/\baionik\b/gi, 'Ioniq'],
  [/\babeo\b/gi, 'Aveo'],
  [/\bbenyu\b/gi, 'Venue'],
  [/\bberakeurujeu\b/gi, 'Veracruz'],
  [/\bnyu\s*qm5\b/gi, 'New QM5'],
  [/\bnyu\s*qm3\b/gi, 'New QM3'],
  [/\bnyu\s*sm3\b/gi, 'New SM3'],
  [/\bnyu\s*sm5\b/gi, 'New SM5'],
  [/\bnyu\s*moning\b/gi, 'New Morning'],
  [/\bnyu\s*korando\b/gi, 'New Korando'],
  [/\bnyu\s*opireoseu\b/gi, 'New Opirus'],
  [/\bnyu\s+damaseu\b/gi, 'New Damas'],
  [/\brieol\b/gi, 'Real'],
  [/\bkolrorado\b/gi, 'Colorado'],
  [/\bkaeptiba\b/gi, 'Captiva'],
  [/\bkochi\b/gi, 'Coach'],
  [/\bgeurang\s+kolreoseu\b/gi, 'Grand Koleos'],
  [/\bkolreoseu\b/gi, 'Koleos'],
  [/\bchevrolet\s*gm\s*daewoo\b/gi, 'Chevrolet'],
  [/\bchevroletgmdaewoo\b/gi, 'Chevrolet'],
  [/\bSanta\s+\((The New|All New)\)\s+Fe\b/gi, 'Santa Fe ($1)'],
  [/\bdi\s+\((The New|All New)\)\s+niro\b/gi, 'Niro EV ($1)'],
  [/\bdi\s+niro\b/gi, 'Niro EV'],
  [/\bbyutipul\b/gi, 'Beautiful'],
  [/\bneksso\b/gi, 'Nexo'],
  [/\brabo\b/gi, 'Labo'],
  [/\bmaseuteo\b/gi, 'Master'],
  [/\bseupakeu\b/gi, 'Spark'],
  [/\bspark\s+spark\b/gi, 'Spark'],
  [/\bwaegeon\b/gi, 'Wagon'],
  [/\b3th\s+gen\b/gi, '3rd Gen'],
  [/\bdeo\s+k9\b/gi, 'The K9'],
  [/\bdeo\s+master\b/gi, 'The Master'],
  [/\bbuseuteo\b/gi, 'Booster'],
  [/\beoban\b/gi, 'Urban'],
  [/\braunji\b/gi, 'Lounge'],
  [/\bdi\s*etji\b/gi, 'The Edge'],
  [/\bdainamik\b/gi, 'Dynamic'],
  [/\baikonik\b/gi, 'Iconic'],
  [/\bturiseumo\b/gi, 'Turismo'],
  [/\bjangaeinyong\b/gi, 'Disabled Access'],
  [/\beorinibobocha\b/gi, 'School Bus'],
  [/\bschool\s+bus\b/gi, 'School Bus'],
  [/\bjeopisiktapcha\b/gi, 'Folding Top'],
  [/\bilrekteurik\b/gi, 'Electric'],
  [/\bdeo\s+nyu\b/gi, 'The New'],
  [/\bol\s+nyu\b/gi, 'All New'],
  [/\bnyu\b/gi, 'New'],
  [/\bsinhyeong\b/gi, 'New'],
  [/\bgeuraendeu\b/gi, 'Grand'],
  [/\bkei\s*(?=(?:3|5|7|8|9)\b)/gi, 'K'],
  [/\bkei(?=(?:3|5|7|8|9)\b)/gi, 'K'],
  [/\bpeuraideu\b/gi, 'Pride'],
]

const POST_MARKETING_TITLE_REPLACEMENTS = [
  [/\bSanta\s+\((The New|All New)\)\s+Fe\b/gi, 'Santa Fe ($1)'],
]

const TRIM_REPLACEMENTS = [
  [/\bkwateuro\b/gi, 'Quattro'],
  [/\bebo\b/gi, 'Evo'],
  [/\bseupaideo\b/gi, 'Spyder'],
  [/\bseupoteubaek\b/gi, 'Sportback'],
  [/\bgeurankupe\b/gi, 'Gran Coupe'],
  [/\beoltimeiteu\b/gi, 'Ultimate'],
  [/\bbeuraiteu\b/gi, 'Bright'],
  [/\bdijain\b/gi, 'Design'],
  [/\bpyueo\b/gi, 'Pure'],
  [/\bekselreonseu\b/gi, 'Excellence'],
  [/\brubikon\b/gi, 'Rubicon'],
  [/\brong\s+reinji\b/gi, 'Long Range'],
  [/\brongreinji\b/gi, 'Long Range'],
  [/\bm\s*sports\b/gi, 'M Sport'],
  [/\bm\s*sport\b/gi, 'M Sport'],
  [/\bpeureimieom\b/gi, 'Premium'],
  [/\babanggareudeu\b/gi, 'Avantgarde'],
  [/\bpeoseuteu\b/gi, 'First'],
  [/\bpeopomeonseu\b/gi, 'Performance'],
  [/\bkeompetisyeon\b/gi, 'Competition'],
  [/\bedisyeon\b/gi, 'Edition'],
  [/\binseukeuripsyeon\b/gi, 'Inscription'],
  [/\binseupaieo\b/gi, 'Inspire'],
  [/\bnobelesse\b/gi, 'Noblesse'],
  [/\b3th\s+gen\b/gi, '3rd Gen'],
  [/\bdeo\s+k9\b/gi, 'The K9'],
  [/\bdeo\s+master\b/gi, 'The Master'],
  [/\bbuseuteo\b/gi, 'Booster'],
  [/\beoban\b/gi, 'Urban'],
  [/\braunji\b/gi, 'Lounge'],
  [/\bdi\s*etji\b/gi, 'The Edge'],
  [/\bstrandard\b/gi, 'Standard'],
  [/\bpur[e]?tech\b/gi, 'Pure Tech'],
  [/\bpur[e]?[-\s]*tech\b/gi, 'Pure Tech'],
  [/\bexclusice\b/gi, 'Exclusive'],
  [/\bperstige\b/gi, 'Prestige'],
  [/\btaeksihyeong\b/gi, 'Taxi'],
  [/\bkupe\b/gi, 'Coupe'],
  [/\bpeuro\b/gi, 'Pro'],
  [/\bakeuro\b/gi, 'Acuro'],
  [/baelryu\s+(?:peulreoseu|plus)/gi, 'Value Plus'],
  [/\bblack\s*edisyeon\b/gi, 'Black Edition'],
  [/\bblack\s*edition\b/gi, 'Black Edition'],
  [/\binscription\b/gi, 'Inscription'],
  [/\bpeurejideonteu\b/gi, 'President'],
  [/\bpresident\b/gi, 'President'],
  [/\bteukjangeopche\b/gi, 'Special vehicle'],
  [/\bspecial\s+vehicle\b/gi, 'Special vehicle'],
  [/([A-Za-z])Edisyeon\b/gi, '$1 Edition'],
  [/([A-Za-z])Edition\b/gi, '$1 Edition'],
  [/\bbeseuteu\s+selreksyeon\b/gi, 'Best Selection'],
  [/\bbest\s+selection\b/gi, 'Best Selection'],
  [/\bsyupeurim\b/gi, 'Supreme'],
  [/\bsupreme\b/gi, 'Supreme'],
  [/\bbaelryu\b/gi, 'Value'],
  [/\bvalue\b/gi, 'Value'],
  [/\bgogeuphyeong\b/gi, 'High Grade'],
  [/\bhigh\s+grade\b/gi, 'High Grade'],
  [/\bblack\s*seupesyeol\b/gi, 'Black Special'],
  [/\bblack\s*special\b/gi, 'Black Special'],
  [/\bseupesyeol\b/gi, 'Special'],
  [/\bspecial\b/gi, 'Special'],
  [/\bkeolreksyeon\b/gi, 'Collection'],
  [/\bcollection\b/gi, 'Collection'],
  [/\bigeujekyutibeu\b/gi, 'Executive'],
  [/\bexecutive\b/gi, 'Executive'],
  [/\bneombeowon\s+edisyeon\b/gi, 'Number One Edition'],
  [/\bnumber\s+one\s+edition\b/gi, 'Number One Edition'],
  [/\bkaelrigeuraepi\b/gi, 'Calligraphy'],
  [/\bkaelligeuraepi\b/gi, 'Calligraphy'],
  [/\bcalligraphy\b/gi, 'Calligraphy'],
  [/\beodeubencheo\b/gi, 'Adventure'],
  [/\badventure\b/gi, 'Adventure'],
  [/\beodeubaenseu\b/gi, 'Advanced'],
  [/\badvanced\b/gi, 'Advanced'],
  [/\bdireokseupaek\b/gi, 'Deluxe Pack'],
  [/\bdeluxe\s+pack\b/gi, 'Deluxe Pack'],
  [/\bpeuraimpaek\b/gi, 'Prime Pack'],
  [/\bprime\s+pack\b/gi, 'Prime Pack'],
  [/\bselreobeuriti\b/gi, 'Celebrity'],
  [/\bcelebrity\b/gi, 'Celebrity'],
  [/\breubeulrang\b/gi, 'Le Blanc'],
  [/\ble\s+blanc\b/gi, 'Le Blanc'],
  [/\b(\d+)\s*inseung\b/gi, '$1 seats'],
  [/\b(\d+)\s*(?:ddeo|doeo)\b/gi, '$1-door'],
  [/\b(\d+)[-\s]*door\b/gi, '$1-door'],
  [/\bbaen\b/gi, 'Van'],
  [/\bsignature\b/gi, 'Signature'],
  [/\bpeurimiereu\b/gi, 'Premiere'],
  [/\bpremiere\b/gi, 'Premiere'],
  [/\beseupeuri\s+alpin\b/gi, 'Esprit Alpine'],
  [/\besprit\s+alpine\b/gi, 'Esprit Alpine'],
  [/\bedeo\b/gi, 'Air'],
  [/\bair\b/gi, 'Air'],
  [/\beoseu\b/gi, 'Earth'],
  [/\bearth\b/gi, 'Earth'],
  [/\bpeuresteiji\b/gi, 'Prestige'],
  [/\bprestige\b/gi, 'Prestige'],
  [/\bhai[\s-]*tech\b/gi, 'Hi-Tech'],
  [/\bhi[\s-]*tech\b/gi, 'Hi-Tech'],
  [/\bhaipeo\b/gi, 'Hyper'],
  [/\bhyper\b/gi, 'Hyper'],
  [/\brimitideu\b/gi, 'Limited'],
  [/\blimited\b/gi, 'Limited'],
  [/\bdireokseu\b/gi, 'Deluxe'],
  [/\bdeluxe\b/gi, 'Deluxe'],
  [/\bhairimujin\b/gi, 'Hi-Limousine'],
  [/\bhailimujin\b/gi, 'Hi-Limousine'],
  [/\bhi[-\s]*limousine\b/gi, 'Hi-Limousine'],
  [/\braiteu\b/gi, 'Light'],
  [/\blight\b/gi, 'Light'],
  [/\bpaemilli\b/gi, 'Family'],
  [/\bfamily\b/gi, 'Family'],
  [/\bsuchulhyeong\b/gi, 'Export'],
  [/\bexport\b/gi, 'Export'],
  [/\beorini\s+bokocha\b/gi, 'School Bus'],
  [/\beorinibobocha\b/gi, 'School Bus'],
  [/\bschool\s+bus\b/gi, 'School Bus'],
  [/\bebinyu\b/gi, 'Avenue'],
  [/\bavenue\b/gi, 'Avenue'],
  [/\bkochi\b/gi, 'Coach'],
  [/\bcoach\b/gi, 'Coach'],
  [/\bdainamik\b/gi, 'Dynamic'],
  [/\bdynamic\b/gi, 'Dynamic'],
  [/\baikonik\b/gi, 'Iconic'],
  [/\biconic\b/gi, 'Iconic'],
  [/\bchoiseu\b/gi, 'Choice'],
  [/\bchoice\b/gi, 'Choice'],
  [/\b1\s*milrion\b/gi, '1 Million'],
  [/\b1\s*million\b/gi, '1 Million'],
  [/\byeongpaek\b/gi, 'Young Pack'],
  [/\byoung\s+pack\b/gi, 'Young Pack'],
  [/\b5\s*ddeo\b/gi, '5-door'],
  [/\b5\s*doeo\b/gi, '5-door'],
  [/\b5[-\s]*door\b/gi, '5-door'],
  [/\btap\b/gi, 'Top'],
  [/\btop\b/gi, 'Top'],
  [/\bribik\b/gi, 'Libic'],
  [/\blibic\b/gi, 'Libic'],
  [/\bteurendi\b/gi, 'Trendy'],
  [/\btrendy\b/gi, 'Trendy'],
]

const CHOSEONG = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h']
const JUNGSEONG = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i']
const JONGSEONG = ['', 'k', 'k', 'ks', 'n', 'nj', 'nh', 't', 'l', 'lk', 'lm', 'lb', 'ls', 'lt', 'lp', 'lh', 'm', 'p', 'ps', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 'h']

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

let uaIdx = 0
function nextUA() {
  return USER_AGENTS[uaIdx++ % USER_AGENTS.length]
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function applyReplacementList(value, replacements) {
  let text = cleanText(value)
  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement)
  }
  return text.replace(/\s+/g, ' ').trim()
}

function normalizeMarketingPrefix(value) {
  const text = cleanText(value).toLowerCase()
  if (text === 'the new') return 'The New'
  if (text === 'all new') return 'All New'
  return cleanText(value)
}

function placeMarketingEdition(brand, prefix, rest) {
  const normalizedBrand = cleanText(brand)
  const normalizedPrefix = normalizeMarketingPrefix(prefix)
  const normalizedRest = cleanText(rest)
  if (!normalizedBrand) return normalizedRest
  if (!normalizedRest) return `${normalizedBrand} (${normalizedPrefix})`.trim()
  if (new RegExp(`\\(${escapeRegExp(normalizedPrefix)}\\)$`, 'i').test(normalizedRest)) {
    return `${normalizedBrand} ${normalizedRest}`.trim()
  }

  const tokens = normalizedRest.split(/\s+/).filter(Boolean)
  if (!tokens.length) return `${normalizedBrand} (${normalizedPrefix})`.trim()

  const [modelToken, ...tail] = tokens
  return `${normalizedBrand} ${modelToken} (${normalizedPrefix})${tail.length ? ` ${tail.join(' ')}` : ''}`.trim()
}

function relocateMarketingEdition(value) {
  const text = cleanText(value)
  if (!text) return ''

  const knownBrands = /^(Kia|Hyundai|Genesis|Chevrolet|Renault|Renault Samsung|Renault Korea|KG|SsangYong|Mercedes-Benz|BMW|Audi|Toyota|Honda|Volkswagen|Nissan|Lexus)\b/i

  let match = text.match(/^([A-Za-z0-9&.+/-]+)\s+\1\s+\((The New|All New)\)\s+(.+)$/i)
  if (match) return placeMarketingEdition(match[1], match[2], match[3])

  match = text.match(/^([A-Za-z0-9&.+/-]+)\s+\((The New|All New)\)\s+(.+)$/i)
  if (match && knownBrands.test(match[1])) return placeMarketingEdition(match[1], match[2], match[3])

  match = text.match(/^([A-Za-z0-9&.+/-]+)\s+(EV|HEV|PHEV)\s+\((The New|All New)\)\s+(.+)$/i)
  if (match) {
    return `${match[1]} ${match[2].toUpperCase()} (${normalizeMarketingPrefix(match[3])}) ${match[4]}`.replace(/\s+/g, ' ').trim()
  }

  match = text.match(/^([A-Za-z0-9&.+/-]+)\s+(.+)\s+\((The New|All New)\)$/i)
  if (match && !knownBrands.test(text)) {
    return `${match[1]} (${normalizeMarketingPrefix(match[3])}) ${match[2]}`.replace(/\s+/g, ' ').trim()
  }

  const misplaced = text.match(/^([A-Za-z0-9&.+/-]+)\s+(.+)\s+\((The New|All New)\)\s+(.+)$/i)
  if (misplaced && !knownBrands.test(text)) {
    return `${misplaced[1]} (${normalizeMarketingPrefix(misplaced[3])}) ${misplaced[2]} ${misplaced[4]}`.replace(/\s+/g, ' ').trim()
  }

  match = text.match(/^(The New|All New)\s+([A-Za-z0-9&.+/-]+)\s+(.+)$/i)
  if (match) return `${match[2]} (${normalizeMarketingPrefix(match[1])}) ${match[3]}`.replace(/\s+/g, ' ').trim()

  match = text.match(/^([A-Za-z0-9&.+/-]+)\s+(The New|All New)\s+(.+)$/i)
  if (match) return placeMarketingEdition(match[1], match[2], match[3])

  return text
}

function applyPremiumNameFixes(value) {
  let text = cleanText(value)
  if (!text) return ''

  text = text.replace(/\b([1-8])\s*-\s*series\b/gi, '$1 Series')
  text = text.replace(/\blp\s*([0-9]{3,4}-[0-9])\b/gi, 'LP $1')

  if (/\b(?:audi|tfsi|tdi|fsi|rs\d*|s\d)\b/i.test(text)) {
    text = text.replace(/\bQuattro\b/g, 'quattro')
  }

  return text.replace(/\s+/g, ' ').trim()
}

function applyTrimFixes(value) {
  return applyPremiumNameFixes(applyReplacementList(value, TRIM_REPLACEMENTS))
}

function applyVehicleTitleFixes(value) {
  let text = applyReplacementList(value, TITLE_REPLACEMENTS)
  text = applyTrimFixes(text)
  text = applyPremiumNameFixes(relocateMarketingEdition(text))
  return applyReplacementList(text, POST_MARKETING_TITLE_REPLACEMENTS)
}

function romanizeHangulWord(word) {
  let out = ''

  for (const ch of word) {
    const code = ch.codePointAt(0)
    if (!code || code < 0xac00 || code > 0xd7a3) {
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

function hasHangul(value) {
  return HANGUL_RE.test(String(value || ''))
}

function translateVehicleText(value) {
  const raw = cleanText(value)
  if (!raw) return ''

  const romanized = raw.replace(HANGUL_SEQ_RE, (chunk) => toTitleCase(romanizeHangulWord(chunk)))
  return applyVehicleTitleFixes(romanized)
}

function normalizeText(value) {
  const text = cleanText(value)
  if (!text) return ''
  return applyVehicleTitleFixes(hasHangul(text) ? translateVehicleText(text) : text)
}

function normalizeManufacturer(value) {
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

function resolveManufacturerDisplayName(manufacturer, ...contextValues) {
  const normalized = normalizeManufacturer(manufacturer)
  if (!normalized) return ''

  if (normalized === 'Renault Korea') {
    const context = [manufacturer, normalized, ...contextValues]
      .map((value) => cleanText(value))
      .filter(Boolean)
      .join(' ')

    if (
      LEGACY_RENAULT_SAMSUNG_MODEL_RE.test(context)
      || /samseong|samsung/i.test(context)
    ) {
      return 'Renault Samsung'
    }
  }

  return normalized
}

function normalizeBrandSignal(value) {
  const normalized = normalizeManufacturer(value || '')
  return cleanText(normalized).toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function matchesAliases(values, aliases) {
  const signals = values
    .map((value) => normalizeBrandSignal(value))
    .filter(Boolean)

  return signals.some((signal) => aliases.some((alias) => signal === alias || signal.startsWith(alias)))
}

function trimEdgeSpecs(value) {
  const tokens = cleanText(value).split(/\s+/).filter(Boolean)
  if (!tokens.length) return ''

  let start = 0
  let end = tokens.length

  while (start < end && SPEC_TOKENS.test(tokens[start])) start += 1
  while (end > start && SPEC_TOKENS.test(tokens[end - 1])) end -= 1

  return tokens.slice(start, end).join(' ')
}

function hasKnownTrimKeyword(value) {
  const text = cleanText(value)
  if (!text) return false
  if (PASSENGER_COUNT_TRIM_RE.test(text)) return true
  if (DOOR_COUNT_TRIM_RE.test(text)) return true
  if (TITLE_SAFE_TRIM_PATTERNS.some((pattern) => pattern.test(text))) return true

  return /\b(?:edition|pack|package|line|sport|performance|signature|prestige|premium|style|comfort|luxury|limited|executive|deluxe|special|tech|platinum|exclusive|inspire|essential|inscription|premiere|noblesse|calligraphy|avantgarde|quattro|competition|rubicon|value|supreme|collection|celebrity)\b/i.test(text)
}

function isTrimNoise(value) {
  const text = cleanText(value)
  if (!text) return true
  if (hasKnownTrimKeyword(text)) return false

  const signal = text.replace(/[\s()[\]{}\\/|+_.:-]+/g, '')
  if (!signal || !/[A-Za-z0-9]/.test(signal)) return true
  if (/[\\/()]/.test(text)) return true
  return false
}

function normalizeTrimLevel(...values) {
  for (const value of values) {
    const text = normalizeText(value)
    if (!text) continue

    const translated = applyTrimFixes(text)
    const candidate = cleanText(trimEdgeSpecs(translated) || translated)
    const tokens = candidate.split(/\s+/).filter(Boolean)
    if (!tokens.length) continue
    if (tokens.every((token) => SPEC_TOKENS.test(token))) continue
    if (isTrimNoise(candidate)) continue
    return candidate
  }

  return ''
}

function extractTrimLevelFromTitle(...values) {
  const candidates = []

  for (const value of values) {
    const normalized = normalizeText(value)
    if (!normalized) continue

    const passengerMatch = normalized.match(PASSENGER_COUNT_TRIM_RE)
    if (passengerMatch) {
      const candidate = normalizeTrimLevel(passengerMatch[0])
      if (candidate && !candidates.includes(candidate)) candidates.push(candidate)
    }

    const doorMatch = normalized.match(DOOR_COUNT_TRIM_RE)
    if (doorMatch) {
      const candidate = normalizeTrimLevel(doorMatch[0])
      if (candidate && !candidates.includes(candidate)) candidates.push(candidate)
    }

    for (const pattern of TITLE_SAFE_TRIM_PATTERNS) {
      const match = normalized.match(pattern)
      if (!match) continue

      const matchedText = cleanText(match[0])
      const index = match.index ?? -1
      const tail = index >= 0 ? normalized.slice(index).trim() : matchedText
      const trailingWordCount = tail.split(/\s+/).length - matchedText.split(/\s+/).length
      if (trailingWordCount > 2) continue

      const candidate = normalizeTrimLevel(matchedText)
      if (candidate && !candidates.includes(candidate)) candidates.push(candidate)
    }
  }

  return candidates[0] || ''
}

function resolveTitleTrimSuffix(...values) {
  for (const value of values) {
    const normalized = normalizeTrimLevel(value) || normalizeText(value)
    if (!normalized) continue
    if (/\bPlus\b/i.test(normalized)) return 'Plus'
  }

  return ''
}

function appendTitleTrimSuffix(value, ...trimValues) {
  const text = cleanText(value)
  if (!text) return ''

  const suffix = resolveTitleTrimSuffix(...trimValues)
  if (!suffix) return text
  if (new RegExp(`\\b${escapeRegExp(suffix)}\\b`, 'i').test(text)) return text
  return `${text} ${suffix}`.replace(/\s+/g, ' ').trim()
}

function normalizeFuel(value) {
  const text = cleanText(value)
  if (!text) return ''

  const normalized = normalizeText(text)
  const low = normalized.toLowerCase()
  if (low.includes('diesel') || /\uB514\uC824/u.test(text)) return '\u0414\u0438\u0437\u0435\u043B\u044C'
  if (low.includes('hybrid') || low.includes('hev') || low.includes('phev') || /haibeurid|haibeurideu/i.test(low) || /\uD558\uC774\uBE0C\uB9AC\uB4DC/u.test(text)) return '\u0413\u0438\u0431\u0440\u0438\u0434'
  if (low.includes('hydrogen') || low.includes('fuel cell') || low.includes('suso') || low.includes('yeonryojeonji') || /\uC218\uC18C|\uC5F0\uB8CC\uC804\uC9C0/u.test(text)) return '\u0412\u043E\u0434\u043E\u0440\u043E\u0434'
  if (low.includes('electric') || low.includes('jeongi') || /\uC804\uAE30/u.test(text)) return '\u042D\u043B\u0435\u043A\u0442\u0440\u043E'
  if (low.includes('lpg') || /\uC5D8\uD53C\uC9C0/u.test(text)) return '\u0413\u0430\u0437 (LPG)'
  if (low.includes('gasoline') || low.includes('gasolin') || /\uAC00\uC194\uB9B0|\uD718\uBC1C\uC720/u.test(text)) return '\u0411\u0435\u043D\u0437\u0438\u043D'
  return normalized
}

function normalizeTransmission(value) {
  const text = cleanText(value)
  if (!text) return ''

  const normalized = normalizeText(text)
  const low = normalized.toLowerCase()
  if (low.includes('cvt')) return 'CVT'
  if (low.includes('dct') || low.includes('dual') || low.includes('robot')) return '\u0420\u043E\u0431\u043E\u0442'
  if (low.includes('auto') || low.includes('jadong') || low.includes('oto') || /\uC624\uD1A0|\uC790\uB3D9/u.test(text)) return '\u0410\u0432\u0442\u043E\u043C\u0430\u0442'
  if (low.includes('manual') || low.includes('sudong') || /\uC218\uB3D9/u.test(text)) return '\u041C\u0435\u0445\u0430\u043D\u0438\u043A\u0430'
  return normalized
}

function readPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function classifyVehicleOrigin(...values) {
  const text = values
    .map((value) => cleanText(value))
    .filter(Boolean)
    .join(' ')

  if (!text) return 'imported'
  if (
    KOREAN_VEHICLE_BRAND_RE.test(text)
    || KOREAN_VEHICLE_BRAND_HANGUL_RE.test(text)
    || KOREAN_VEHICLE_MODEL_RE.test(text)
  ) {
    return 'korean'
  }

  return 'imported'
}

function normalizeParseScope(value) {
  return value === PARSE_SCOPE_DOMESTIC
    || value === PARSE_SCOPE_IMPORTED
    || value === PARSE_SCOPE_JAPANESE
    || value === PARSE_SCOPE_GERMAN
    ? value
    : PARSE_SCOPE_ALL
}

function parseListYear(rawYear) {
  const match = cleanText(rawYear).match(/\d{4}/)
  return match ? Number.parseInt(match[0], 10) : 0
}

function buildListQuery() {
  return '(And.Hidden.N._.Year.range(201900..).)'
}

function parseYear(category = {}, fallbackRaw = {}) {
  const yearMonth = cleanText(category?.yearMonth)
  if (yearMonth.length >= 4) {
    return yearMonth.slice(0, 4)
  }
  return cleanText(fallbackRaw?.Year).slice(0, 4)
}

function buildManageMetrics(manage = {}, contact = {}) {
  const callMetricCandidates = [
    ['manage.callCount', manage?.callCount],
    ['manage.consultCount', manage?.consultCount],
    ['manage.inquiryCount', manage?.inquiryCount],
    ['manage.contactCount', manage?.contactCount],
    ['contact.callCount', contact?.callCount],
    ['contact.consultCount', contact?.consultCount],
    ['contact.inquiryCount', contact?.inquiryCount],
    ['contact.contactCount', contact?.contactCount],
  ]

  let callCount = 0
  for (const [, rawValue] of callMetricCandidates) {
    const numeric = Number(rawValue)
    if (Number.isFinite(numeric) && numeric >= 0) {
      callCount = numeric
      break
    }
  }

  return {
    viewCount: Math.max(0, Number(manage?.viewCount) || 0),
    subscribeCount: Math.max(0, Number(manage?.subscribeCount) || 0),
    callCount: Math.max(0, Number(callCount) || 0),
  }
}

function matchesParseScope(listing, parseScope) {
  const normalizedScope = normalizeParseScope(parseScope)
  if (normalizedScope === PARSE_SCOPE_ALL) return true

  const origin = classifyVehicleOrigin(
    listing?.manufacturer,
    listing?.name,
    listing?.model,
  )

  if (normalizedScope === PARSE_SCOPE_DOMESTIC) return origin === 'korean'
  if (normalizedScope === PARSE_SCOPE_IMPORTED) return origin === 'imported'
  if (normalizedScope === PARSE_SCOPE_JAPANESE) {
    return matchesAliases([listing?.manufacturer, listing?.name, listing?.model], JAPANESE_BRAND_ALIASES)
  }
  if (normalizedScope === PARSE_SCOPE_GERMAN) {
    return matchesAliases([listing?.manufacturer, listing?.name, listing?.model], GERMAN_BRAND_ALIASES)
  }

  return true
}

function passesFreshRules(manage) {
  const viewCount = Math.max(0, Number(manage?.viewCount) || 0)
  const callCount = Math.max(0, Number(manage?.callCount) || 0)
  const subscribeCount = Math.max(0, Number(manage?.subscribeCount) || 0)

  return viewCount <= FRESH_RULES.maxViewCount
    && callCount <= FRESH_RULES.maxCallCount
    && subscribeCount <= FRESH_RULES.maxSubscribeCount
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createApiClient(timeoutMs) {
  return axios.create({
    baseURL: 'https://api.encar.com',
    timeout: timeoutMs,
    proxy: false,
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      Origin: 'https://www.encar.com',
      Referer: 'https://www.encar.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  })
}

function buildVehiclePresentation(category = {}, ad = {}, fallbackRaw = {}, encarId = '') {
  const manufacturerRaw = cleanText(category?.manufacturerEnglishName || category?.manufacturerName || fallbackRaw?.Manufacturer)
  const modelGroupRaw = cleanText(category?.modelGroupEnglishName || category?.modelGroupName || category?.modelName || fallbackRaw?.Model || fallbackRaw?.Badge)
  const gradeNameRaw = cleanText(category?.gradeEnglishName || category?.gradeName)
  const gradeDetailRaw = cleanText(category?.gradeDetailEnglishName || category?.gradeDetailName)
  const adTitleRaw = cleanText(ad?.title || fallbackRaw?.Name)

  const manufacturer = normalizeManufacturer(manufacturerRaw)
  const displayManufacturer = resolveManufacturerDisplayName(manufacturerRaw, modelGroupRaw, gradeNameRaw, gradeDetailRaw, adTitleRaw)
  const modelGroup = normalizeText(modelGroupRaw)
  const gradeName = normalizeText(gradeNameRaw)
  const trimLevel = normalizeTrimLevel(gradeDetailRaw, gradeNameRaw)
    || extractTrimLevelFromTitle(gradeDetailRaw, gradeNameRaw, adTitleRaw)

  const baseName = applyVehicleTitleFixes([displayManufacturer, modelGroup, gradeName].filter(Boolean).join(' '))
  const baseModel = applyVehicleTitleFixes([modelGroup, gradeName].filter(Boolean).join(' '))
  const fallbackName = normalizeText(adTitleRaw) || `Encar ${encarId}`

  return {
    manufacturer: displayManufacturer || manufacturer,
    name: appendTitleTrimSuffix(baseName || fallbackName, gradeDetailRaw, trimLevel),
    model: appendTitleTrimSuffix(baseModel || modelGroup || fallbackName, gradeDetailRaw, trimLevel),
    trimLevel,
  }
}

export function createStandaloneEncarClient(env = {}) {
  const apiClient = createApiClient(readPositiveInteger(env.ENCAR_REQUEST_TIMEOUT_MS, 25000))
  const maxPages = readPositiveInteger(env.TELEGRAM_FRESH_MAX_PAGES, DEFAULT_MAX_PAGES)
  const stalePageLimit = readPositiveInteger(env.TELEGRAM_FRESH_STALE_PAGE_LIMIT, DEFAULT_STALE_PAGE_LIMIT)
  const detailDelayMs = Math.max(0, Number.parseInt(String(env.TELEGRAM_FRESH_DETAIL_DELAY_MS || '150'), 10) || 150)
  const pageDelayMs = Math.max(0, Number.parseInt(String(env.TELEGRAM_FRESH_PAGE_DELAY_MS || '250'), 10) || 250)

  async function fetchListPageDirect(offset = 0) {
    const response = await apiClient.get('/search/car/list/premium', {
      params: {
        count: true,
        q: buildListQuery(),
        sr: `|ModifiedDate|${offset}|${LIST_PAGE_SIZE}`,
      },
      headers: {
        'User-Agent': nextUA(),
      },
    })

    return {
      total: Number(response?.data?.Count) || 0,
      cars: Array.isArray(response?.data?.SearchResults) ? response.data.SearchResults : [],
    }
  }

  async function fetchListPageViaProxy(offset = 0) {
    const data = await fetchViaEncarProxy(
      {
        endpoint: 'list',
        offset,
        limit: LIST_PAGE_SIZE,
        count: true,
        q: buildListQuery(),
        sr: `|ModifiedDate|${offset}|${LIST_PAGE_SIZE}`,
        sort: 'ModifiedDate',
      },
      {
        timeout: readPositiveInteger(env.ENCAR_REQUEST_TIMEOUT_MS, 25000),
        headers: {
          'User-Agent': nextUA(),
        },
      },
      env,
    )

    return {
      total: Number(data?.Count) || 0,
      cars: Array.isArray(data?.SearchResults) ? data.SearchResults : [],
    }
  }

  async function fetchListPage(offset = 0) {
    const preferred = hasEncarProxy(env) && !isEncarProxySuppressed(env)
      ? getPreferredEncarSource('list')
      : 'direct'
    const sourceDiagnostics = []
    const fetchers = []

    if (preferred === 'proxy' && hasEncarProxy(env) && !isEncarProxySuppressed(env)) {
      fetchers.push({ name: 'proxy', run: () => fetchListPageViaProxy(offset) })
    }
    fetchers.push({ name: 'direct', run: () => fetchListPageDirect(offset) })
    if (preferred !== 'proxy' && hasEncarProxy(env) && !isEncarProxySuppressed(env)) {
      fetchers.push({ name: 'proxy', run: () => fetchListPageViaProxy(offset) })
    }

    let lastError = null

    for (const fetcher of fetchers) {
      try {
        const page = await fetcher.run()
        rememberHealthyEncarSource('list', fetcher.name)
        return {
          ...page,
          source: fetcher.name,
          sourceDiagnostics,
          fallbackUsed: sourceDiagnostics.length > 0,
        }
      } catch (error) {
        if (fetcher.name === 'proxy') {
          suppressEncarProxy(Number(error?.response?.status) || 0)
        }
        sourceDiagnostics.push(buildEncarSourceDiagnostic(fetcher.name, error))
        lastError = error
      }
    }

    if (
      hasEncarProxy(env)
      && isEncarProxySuppressed(env)
      && !sourceDiagnostics.some((item) => item?.source === 'proxy')
      && shouldRetryViaAlternateEncarSource(lastError)
    ) {
      try {
        const page = await fetchListPageViaProxy(offset)
        rememberHealthyEncarSource('list', 'proxy')
        return {
          ...page,
          source: 'proxy',
          sourceDiagnostics,
          fallbackUsed: true,
        }
      } catch (error) {
        suppressEncarProxy(Number(error?.response?.status) || 0)
        sourceDiagnostics.push(buildEncarSourceDiagnostic('proxy', error, 'suppressed_probe'))
        lastError = error
      }
    }

    if (lastError) {
      lastError.fetchSourceDiagnostics = sourceDiagnostics
      decorateEncarSourceError(lastError, 'list', env)
      throw lastError
    }

    throw new Error('Failed to fetch Encar list')
  }

  function buildVehicleDetailResult(encarId, data, fallbackRaw = {}, source = 'direct') {
    const category = data?.category || {}
    const spec = data?.spec || {}
    const ad = data?.advertisement || {}
    const contact = data?.contact || {}
    const manage = data?.manage || {}
    const presentation = buildVehiclePresentation(category, ad, fallbackRaw, encarId)

    return {
      encarId: cleanText(encarId),
      manufacturer: presentation.manufacturer,
      name: presentation.name,
      model: presentation.model,
      trimLevel: presentation.trimLevel,
      fuelType: normalizeFuel(spec?.fuelName),
      transmission: normalizeTransmission(spec?.transmissionName),
      year: parseYear(category, fallbackRaw),
      mileage: Math.max(0, Number(spec?.mileage) || Number(fallbackRaw?.Mileage) || 0),
      priceKrw: Math.max(0, (Number(ad?.price) || Number(fallbackRaw?.Price) || 0) * 10000),
      manage: buildManageMetrics(manage, contact),
      encarUrl: `https://fem.encar.com/cars/detail/${encodeURIComponent(encarId)}`,
      source,
    }
  }

  async function fetchVehicleDetailDirect(encarId, fallbackRaw = {}) {
    const response = await apiClient.get(`/v1/readside/vehicle/${encodeURIComponent(encarId)}`, {
      headers: {
        'User-Agent': nextUA(),
      },
    })
    return buildVehicleDetailResult(encarId, response?.data || {}, fallbackRaw, 'direct')
  }

  async function fetchVehicleDetailViaProxy(encarId, fallbackRaw = {}) {
    const data = await fetchViaEncarProxy(
      {
        endpoint: 'vehicle',
        id: encarId,
      },
      {
        timeout: readPositiveInteger(env.ENCAR_REQUEST_TIMEOUT_MS, 25000),
        headers: {
          'User-Agent': nextUA(),
        },
      },
      env,
    )

    return buildVehicleDetailResult(encarId, data || {}, fallbackRaw, 'proxy')
  }

  async function fetchVehicleDetail(encarId, fallbackRaw = {}) {
    const preferred = hasEncarProxy(env) && !isEncarProxySuppressed(env)
      ? getPreferredEncarSource('detail')
      : 'direct'
    const sourceDiagnostics = []
    const fetchers = []

    if (preferred === 'proxy' && hasEncarProxy(env) && !isEncarProxySuppressed(env)) {
      fetchers.push({ name: 'proxy', run: () => fetchVehicleDetailViaProxy(encarId, fallbackRaw) })
    }
    fetchers.push({ name: 'direct', run: () => fetchVehicleDetailDirect(encarId, fallbackRaw) })
    if (preferred !== 'proxy' && hasEncarProxy(env) && !isEncarProxySuppressed(env)) {
      fetchers.push({ name: 'proxy', run: () => fetchVehicleDetailViaProxy(encarId, fallbackRaw) })
    }

    let lastError = null

    for (const fetcher of fetchers) {
      try {
        const detail = await fetcher.run()
        rememberHealthyEncarSource('detail', fetcher.name)
        return {
          ...detail,
          sourceDiagnostics,
          fallbackUsed: sourceDiagnostics.length > 0,
        }
      } catch (error) {
        if (fetcher.name === 'proxy') {
          suppressEncarProxy(Number(error?.response?.status) || 0)
        }
        sourceDiagnostics.push(buildEncarSourceDiagnostic(fetcher.name, error))
        lastError = error
      }
    }

    if (
      hasEncarProxy(env)
      && isEncarProxySuppressed(env)
      && !sourceDiagnostics.some((item) => item?.source === 'proxy')
      && shouldRetryViaAlternateEncarSource(lastError)
    ) {
      try {
        const detail = await fetchVehicleDetailViaProxy(encarId, fallbackRaw)
        rememberHealthyEncarSource('detail', 'proxy')
        return {
          ...detail,
          sourceDiagnostics,
          fallbackUsed: true,
        }
      } catch (error) {
        suppressEncarProxy(Number(error?.response?.status) || 0)
        sourceDiagnostics.push(buildEncarSourceDiagnostic('proxy', error, 'suppressed_probe'))
        lastError = error
      }
    }

    if (lastError) {
      lastError.fetchSourceDiagnostics = sourceDiagnostics
      decorateEncarSourceError(lastError, 'detail', env)
      throw lastError
    }

    throw new Error(`Failed to fetch Encar vehicle ${encarId}`)
  }

  async function scanFreshListings({
    getActiveSessions,
    stateStore,
    onFreshListing,
    onLog = () => {},
  } = {}) {
    let offset = 0
    let pagesProcessed = 0
    let stalePages = 0
    let newFreshCount = 0

    while (pagesProcessed < maxPages) {
      const currentSessions = getActiveSessions()
      if (!currentSessions.length) break

      const page = await fetchListPage(offset)
      if (Array.isArray(page?.sourceDiagnostics) && page.sourceDiagnostics.length) {
        onLog(`LIST_SOURCE_FALLBACK | offset=${offset} | source=${cleanText(page?.source) || 'unknown'} | failures=${page.sourceDiagnostics.map((item) => cleanText(item?.source || 'unknown')).join(',')}`)
      }
      const pageCars = Array.isArray(page.cars) ? page.cars : []
      if (!pageCars.length) break

      pagesProcessed += 1
      offset += pageCars.length
      let pageFreshHits = 0

      for (const raw of pageCars) {
        const activeSessions = getActiveSessions()
        if (!activeSessions.length) break

        const encarId = cleanText(raw?.Id)
        if (!encarId) continue
        if (stateStore.getSeenListing(encarId)) continue

        const rawYear = parseListYear(raw?.Year)
        if (!Number.isFinite(rawYear) || rawYear < MIN_YEAR) {
          stateStore.rememberListing(encarId, { qualifiesFresh: false })
          continue
        }

        const rawListing = {
          manufacturer: resolveManufacturerDisplayName(raw?.Manufacturer, raw?.Model, raw?.Name),
          name: normalizeText(raw?.Name),
          model: normalizeText(raw?.Model || raw?.Badge),
        }

        const sessionsMatchingRaw = activeSessions.filter((session) => matchesParseScope(rawListing, session.parseScope))
        if (!sessionsMatchingRaw.length) continue

        let detail = null
        try {
          detail = await fetchVehicleDetail(encarId, raw)
          if (Array.isArray(detail?.sourceDiagnostics) && detail.sourceDiagnostics.length) {
            onLog(`DETAIL_SOURCE_FALLBACK | encar_id=${encarId} | source=${cleanText(detail?.source) || 'unknown'} | failures=${detail.sourceDiagnostics.map((item) => cleanText(item?.source || 'unknown')).join(',')}`)
          }
        } catch (error) {
          onLog(`DETAIL_FETCH_FAILED | encar_id=${encarId} | ${cleanText(error?.message) || 'unknown error'}`)
          continue
        }

        const qualifiesFresh = passesFreshRules(detail.manage)
        stateStore.rememberListing(encarId, {
          priceKrw: detail.priceKrw,
          viewCount: detail.manage.viewCount,
          callCount: detail.manage.callCount,
          subscribeCount: detail.manage.subscribeCount,
          qualifiesFresh,
        })

        if (!qualifiesFresh) continue

        const latestSessions = getActiveSessions()
        const matchingChatIds = latestSessions
          .filter((session) => matchesParseScope(detail, session.parseScope))
          .map((session) => session.chatId)

        if (!matchingChatIds.length) continue

        pageFreshHits += 1
        newFreshCount += 1
        await onFreshListing(detail, matchingChatIds)
        stateStore.rememberListing(encarId, {
          priceKrw: detail.priceKrw,
          viewCount: detail.manage.viewCount,
          callCount: detail.manage.callCount,
          subscribeCount: detail.manage.subscribeCount,
          qualifiesFresh: true,
          notifiedAt: new Date().toISOString(),
        })

        if (detailDelayMs > 0) {
          await sleep(detailDelayMs)
        }
      }

      if (pageFreshHits === 0) {
        stalePages += 1
      } else {
        stalePages = 0
      }

      if (stalePages >= stalePageLimit) break
      if (pageCars.length < LIST_PAGE_SIZE) break

      if (pageDelayMs > 0) {
        await sleep(pageDelayMs)
      }
    }

    return {
      pagesProcessed,
      newFreshCount,
    }
  }

  return {
    scanFreshListings,
  }
}

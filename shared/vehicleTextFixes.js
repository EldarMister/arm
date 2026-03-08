function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
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
  if (new RegExp(`\\(${normalizedPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)$`, 'i').test(normalizedRest)) {
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

  let match = text.match(/^(The New|All New)\s+([A-Za-z0-9&.+/-]+)\s+(.+)$/i)
  if (match) return placeMarketingEdition(match[2], match[1], match[3])

  match = text.match(/^([A-Za-z0-9&.+/-]+)\s+(The New|All New)\s+(.+)$/i)
  if (match) return placeMarketingEdition(match[1], match[2], match[3])

  return text
}

const TITLE_REPLACEMENTS = [
  [/\b(?:hyeondae|hyundai)\s+jenesiseu\b/gi, 'Genesis'],
  [/\b(?:hyeondae|hyundai)\s+genesis\b/gi, 'Genesis'],
  [/\bgia\b/gi, 'Kia'],
  [/\bhyeondae\b/gi, 'Hyundai'],
  [/\bjenesiseu\b/gi, 'Genesis'],
  [/\bnyu\s+damaseu\b/gi, 'New Damas'],
  [/\bkaeptiba\b/gi, 'Captiva'],
  [/\bkochi\b/gi, 'Coach'],
  [/\bgeurang\s+kolreoseu\b/gi, 'Grand Koleos'],
  [/\bkolreoseu\b/gi, 'Koleos'],
  [/\bmaseuteo\b/gi, 'Master'],
  [/\bseutarekseu\b/gi, 'Starex'],
  [/\bwaegeon\b/gi, 'Wagon'],
  [/\bdainamik\b/gi, 'Dynamic'],
  [/\baikonik\b/gi, 'Iconic'],
  [/\bmornin\b/gi, 'Morning'],
  [/\bssoul\b/gi, 'Soul'],
  [/\bsoul\s+ev\s+ev\b/gi, 'Soul EV'],
  [/\bilrekteurik\b/gi, 'Electric'],
  [/\bdeo\s+nyu\b/gi, 'The New'],
  [/\bol\s+nyu\b/gi, 'All New'],
  [/\bsinhyeong\b/gi, 'New'],
  [/\bgeuraendeu\b/gi, 'Grand'],
  [/\bkei\s*(?=(?:3|5|7|8|9)\b)/gi, 'K'],
  [/\bkei(?=(?:3|5|7|8|9)\b)/gi, 'K'],
  [/\bpeuraideu\b/gi, 'Pride'],
]

const TRIM_REPLACEMENTS = [
  [/baelryu\s+(?:peulreoseu|plus|\u041f\u043b\u044e\u0441)/gi, 'Value Plus'],
  [/\bgogeuphyeong\b/gi, 'High Grade'],
  [/\bhigh\s+grade\b/gi, 'High Grade'],
  [/\bseupesyeol\b/gi, 'Special'],
  [/\bspecial\b/gi, 'Special'],
  [/\u0421\u043f\u0435\u0448\u043b/gi, 'Special'],
  [/\bkeolreksyeon\b/gi, 'Collection'],
  [/\bcollection\b/gi, 'Collection'],
  [/\bigeujekyutibeu\b/gi, 'Executive'],
  [/\bexecutive\b/gi, 'Executive'],
  [/\bkaelligeuraepi\b/gi, 'Calligraphy'],
  [/\bcalligraphy\b/gi, 'Calligraphy'],
  [/\bpeuraimpaek\b/gi, 'Prime Pack'],
  [/\bprime\s+pack\b/gi, 'Prime Pack'],
  [/\bselreobeuriti\b/gi, 'Celebrity'],
  [/\bcelebrity\b/gi, 'Celebrity'],
  [/\breubeulrang\b/gi, 'Le Blanc'],
  [/\ble\s+blanc\b/gi, 'Le Blanc'],
  [/\b(\d+)\s*inseung\b/gi, '$1 мест'],
  [/\b(\d+)\s*(?:ddeo|doeo)\b/gi, '$1-door'],
  [/\b(\d+)[-\s]*door\b/gi, '$1-door'],
  [/\bbaen\b/gi, 'Van'],
  [/\bsignature\b/gi, 'Signature'],
  [/\u0421\u0438\u0433\u043D\u0430\u0442\u0443\u0440/gi, 'Signature'],
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
  [/\u041F\u0440\u0435\u0441\u0442\u0438\u0436/gi, 'Prestige'],
  [/\brimitideu\b/gi, 'Limited'],
  [/\blimited\b/gi, 'Limited'],
  [/\u041B\u0438\u043C\u0438\u0442\u0435\u0434/gi, 'Limited'],
  [/\bdireokseu\b/gi, 'Deluxe'],
  [/\bdeluxe\b/gi, 'Deluxe'],
  [/\u0414\u0435\u043B\u044E\u043A\u0441/gi, 'Deluxe'],
  [/\bhairimujin\b/gi, 'Hi-Limousine'],
  [/\bhailimujin\b/gi, 'Hi-Limousine'],
  [/\bhi[-\s]*limousine\b/gi, 'Hi-Limousine'],
  [/\u0425\u0430\u0439[-\s]*\u041B\u0438\u043C\u0443\u0437\u0438\u043D/gi, 'Hi-Limousine'],
  [/\braiteu\b/gi, 'Light'],
  [/\blight\b/gi, 'Light'],
  [/\bpaemilli\b/gi, 'Family'],
  [/\bfamily\b/gi, 'Family'],
  [/\bsuchulhyeong\b/gi, 'Export'],
  [/\bexport\b/gi, 'Export'],
  [/\beorinibobocha\b/gi, 'School Bus'],
  [/\bschool\s+bus\b/gi, 'School Bus'],
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
  [/\b5\s*ddeo\b/gi, '5-door'],
  [/\b5\s*doeo\b/gi, '5-door'],
  [/\b5[-\s]*door\b/gi, '5-door'],
  [/\btap\b/gi, 'Top'],
  [/\btop\b/gi, 'Top'],
  [/\bribik\b/gi, 'Libic'],
  [/\blibic\b/gi, 'Libic'],
  [/\bteurendi\b/gi, 'Trendy'],
  [/\btrendy\b/gi, 'Trendy'],
  [/\u0422\u0440\u0435\u043D\u0434\u0438/gi, 'Trendy'],
]

export function applyTrimFixes(value) {
  return applyReplacementList(value, TRIM_REPLACEMENTS)
}

export function applyVehicleTitleFixes(value) {
  let text = applyReplacementList(value, TITLE_REPLACEMENTS)
  text = applyTrimFixes(text)
  return relocateMarketingEdition(text)
}

export function normalizeRequestedRomanizedColorAlias(value) {
  const low = cleanText(value).toLowerCase()
  if (!low) return ''

  if (/^(ppalgansaek|ppalgangsaek|ppalgangsaek)$/.test(low)) return '\u041A\u0440\u0430\u0441\u043D\u044B\u0439'
  if (/^(noransaek|norangsaek)$/.test(low)) return '\u0416\u0435\u043B\u0442\u044B\u0439'
  if (/^haneulsaek$/.test(low)) return '\u041D\u0435\u0431\u0435\u0441\u043D\u043E-\u0433\u043E\u043B\u0443\u0431\u043E\u0439'
  if (/^jajusaek$/.test(low)) return '\u0411\u043E\u0440\u0434\u043E\u0432\u044B\u0439'
  if (/^(damnoksaek|damnogsaek|dampoksaek)$/.test(low)) return '\u0421\u0432\u0435\u0442\u043B\u043E-\u0437\u0435\u043B\u0435\u043D\u044B\u0439'
  if (/^galdaesaek$/.test(low)) return '\u0411\u0435\u0436\u0435\u0432\u044B\u0439'
  if (/^yeongeumsaek$/.test(low)) return '\u0417\u043E\u043B\u043E\u0442\u0438\u0441\u0442\u044B\u0439'

  return ''
}

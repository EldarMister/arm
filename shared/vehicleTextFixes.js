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
  const knownBrands = /^(Kia|Hyundai|Genesis|Chevrolet|Renault|Renault Samsung|Renault Korea|KG|SsangYong|Mercedes-Benz|BMW|Audi|Toyota|Honda|Volkswagen|Nissan|Lexus)\b/i

  let match = text.match(/^([A-Za-z0-9&.+/-]+)\s+\1\s+\((The New|All New)\)\s+(.+)$/i)
  if (match) return placeMarketingEdition(match[1], match[2], match[3])

  match = text.match(/^([A-Za-z0-9&.+/-]+)\s+\((The New|All New)\)\s+(.+)$/i)
  if (match && knownBrands.test(match[1])) return placeMarketingEdition(match[1], match[2], match[3])

  match = text.match(/^([A-Za-z0-9&.+/-]+)\s+(EV|HEV|PHEV)\s+\((The New|All New)\)\s+(.+)$/i)
  if (match) return `${match[1]} ${match[2].toUpperCase()} (${normalizeMarketingPrefix(match[3])}) ${match[4]}`.replace(/\s+/g, ' ').trim()

  match = text.match(/^([A-Za-z0-9&.+/-]+)\s+(.+)\s+\((The New|All New)\)$/i)
  if (match && !knownBrands.test(text)) {
    return `${match[1]} (${normalizeMarketingPrefix(match[3])}) ${match[2]}`.replace(/\s+/g, ' ').trim()
  }

  let misplaced = text.match(/^([A-Za-z0-9&.+/-]+)\s+(.+)\s+\((The New|All New)\)\s+(.+)$/i)
  if (misplaced && !knownBrands.test(text)) {
    return `${misplaced[1]} (${normalizeMarketingPrefix(misplaced[3])}) ${misplaced[2]} ${misplaced[4]}`.replace(/\s+/g, ' ').trim()
  }

  match = text.match(/^(The New|All New)\s+([A-Za-z0-9&.+/-]+)\s+(.+)$/i)
  if (match) return `${match[2]} (${normalizeMarketingPrefix(match[1])}) ${match[3]}`.replace(/\s+/g, ' ').trim()

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
  [/\bcanival\b/gi, 'Carnival'],
  [/\bberi\s+new\s+tibolri\b/gi, 'Very New Tivoli'],
  [/\bberi\s+new\s+tiboli\b/gi, 'Very New Tivoli'],
  [/\btibolri\s+ameo\b/gi, 'Tivoli Armor'],
  [/\btiboli\s+ameo\b/gi, 'Tivoli Armor'],
  [/\btibolri\s+eeo\b/gi, 'Tivoli Air'],
  [/\btiboli\s+eeo\b/gi, 'Tivoli Air'],
  [/\btibolri\b/gi, 'Tivoli'],
  [/\btiboli\b/gi, 'Tivoli'],
  [/\baionik\b/gi, 'Ioniq'],
  [/\babeo\b/gi, 'Aveo'],
  [/\bbolteu\b/gi, 'Bolt'],
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
  [/\bseutarekseu\b/gi, 'Starex'],
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
  [/\bmornin\b/gi, 'Morning'],
  [/\b\u0421\u043E\u0440\u0435\u043D\u0442\u043E\b/gi, 'Sorento'],
  [/\bssoul\b/gi, 'Soul'],
  [/\bsoul\s+ev\s+ev\b/gi, 'Soul EV'],
  [/\bseuboteiji\b/gi, 'Sportage'],
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
  [/baelryu\s+(?:peulreoseu|plus|\u041f\u043b\u044e\u0441)/gi, 'Value Plus'],
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
  [/\u0421\u043f\u0435\u0448\u043b/gi, 'Special'],
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
  [/\b(\d+)\s*мест\b/gi, '$1 seats'],
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
  [/\bhai[\s-]*tech\b/gi, 'Hi-Tech'],
  [/\bhi[\s-]*tech\b/gi, 'Hi-Tech'],
  [/\bhaipeo\b/gi, 'Hyper'],
  [/\bhyper\b/gi, 'Hyper'],
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
  [/\u0422\u0440\u0435\u043D\u0434\u0438/gi, 'Trendy'],
  [/\u041a\u0430\u043b\u043b\u0438\u0433\u0440\u0430\u0444\u0438\u044f/gi, 'Calligraphy'],
  [/\u0413\u0440\u0430\u0432\u0438\u0442\u0438/gi, 'Gravity'],
  [/\u0412\u0438\u0436\u0435\u043d/gi, 'Vision'],
  [/\u0418\u043d\u0442\u0435\u043b\u043b\u0438\u0434\u0436\u0435\u043d\u0442/gi, 'Intelligent'],
  [/\u041c\u0430\u0441\u0442\u0435\u0440/gi, 'Master'],
  [/\u041a\u043e\u0440\u0435/gi, 'Core'],
  [/\u041b\u0430\u0443\u043d\u0436/gi, 'Lounge'],
  [/\u041a\u0435\u043c\u043f\u0435\u0440/gi, 'Camper'],
  [/\u041c\u043e\u0431\u0438\u043b\u044c\u043d\u044b\u0439\s+\u043e\u0444\u0438\u0441/gi, 'Mobile Office'],
  [/\u041f\u0440\u0435\u043c\u044c\u0435\u0440/gi, 'Premiere'],
  [/\u042d\u0441\u0441\u0435\u043d\u0448\u0435\u043b/gi, 'Essential'],
  [/\u041b\u0430\u043a\u0448\u0435\u0440\u0438/gi, 'Luxury'],
  [/\u041f\u0440\u0435\u043c\u0438\u0443\u043c/gi, 'Premium'],
  [/\u041d\u043e\u0431\u043b\u0435\u0441\u0441/gi, 'Noblesse'],
  [/\u042d\u043a\u0441\u043a\u043b\u044e\u0437\u0438\u0432/gi, 'Exclusive'],
  [/\u0418\u043d\u0441\u043f\u0438\u0440\u0435\u0439\u0448\u043d/gi, 'Inspire'],
  [/\u041c\u043e\u0434\u0435\u0440\u043d/gi, 'Modern'],
  [/\u0421\u043c\u0430\u0440\u0442\u0441\u0442\u0440\u0438\u043c/gi, 'Smartstream'],
  [/\u0421\u043c\u0430\u0440\u0442/gi, 'Smart'],
  [/\u0421\u0442\u0430\u0439\u043b/gi, 'Style'],
  [/\u041a\u043e\u043c\u0444\u043e\u0440\u0442/gi, 'Comfort'],
  [/\u0421\u0442\u0430\u043d\u0434\u0430\u0440\u0442/gi, 'Standard'],
  [/\u0425\u0430\u0439\s*[-\s]*\u0422\u0435\u0445/gi, 'Hi-Tech'],
  [/[Ee\u0415\u0435]-?\s*\u0422\u0435\u0445/gi, 'E-Tech'],
  [/\u0422\u0435\u0445/gi, 'Tech'],
  [/\u042d\u0434\u0432\u0430\u043d\u0441\u0434/gi, 'Advanced'],
  [/\u041f\u043b\u0430\u0442\u0438\u043d\u0443\u043c/gi, 'Platinum'],
  [/\u042d\u043a\u0437\u0435\u043a\u044c\u044e\u0442\u0438\u0432/gi, 'Executive'],
  [/\u0411\u043b\u044d\u043a\s*\u042d\u0434\u0438\u0448\u043d/gi, 'Black Edition'],
  [/\u0411\u043b\u044d\u043a\s*\u042d\u0434\u0438\u0448\u0435\u043d/gi, 'Black Edition'],
  [/\u0411\u043b\u044d\u043a/gi, 'Black'],
  [/\u042d\u0434\u0438\u0448\u043d/gi, 'Edition'],
  [/\u042d\u0434\u0438\u0448\u0435\u043d/gi, 'Edition'],
  [/\u042d\u043b\u0438\u0442/gi, 'Elite'],
  [/\u041f\u043b\u044e\u0441/gi, 'Plus'],
  [/\u0414\u0435\u0442\u0441\u043a\u0438\u0439\s*\/\s*\u0428\u043a\u043e\u043b\u044c\u043d\u044b\u0439(?:\s+\u0430\u0432\u0442\u043e\u0431\u0443\u0441)?/gi, 'School Bus'],
  [/\u0428\u043a\u043e\u043b\u044c\u043d\u044b\u0439\s*\/\s*\u0414\u0435\u0442\u0441\u043a\u0438\u0439/gi, 'School Bus'],
  [/\u0414\u043b\u044f\s+\u043b\u044e\u0434\u0435\u0439\s+\u0441\s+\u043e\u0433\u0440\u0430\u043d\u0438\u0447\u0435\u043d\u043d\u044b\u043c\u0438\s+\u0432\u043e\u0437\u043c\u043e\u0436\u043d\u043e\u0441\u0442\u044f\u043c\u0438/gi, 'Disabled Access'],
]

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

export function applyTrimFixes(value) {
  return applyPremiumNameFixes(applyReplacementList(value, TRIM_REPLACEMENTS))
}

export function applyVehicleTitleFixes(value) {
  let text = applyReplacementList(value, TITLE_REPLACEMENTS)
  text = applyTrimFixes(text)
  text = applyPremiumNameFixes(relocateMarketingEdition(text))
  return applyReplacementList(text, POST_MARKETING_TITLE_REPLACEMENTS)
}

export function normalizeRequestedRomanizedColorAlias(value) {
  const low = cleanText(value).toLowerCase()
  const compact = low.replace(/[\s_-]/g, '')
  if (!compact) return ''

  if (/^(ppalgansaek|ppalgangsaek)$/.test(compact)) return '\u041A\u0440\u0430\u0441\u043D\u044B\u0439'
  if (/^(noransaek|norangsaek)$/.test(compact)) return '\u0416\u0435\u043B\u0442\u044B\u0439'
  if (/^bunhongsaek$/.test(compact)) return '\u0420\u043E\u0437\u043E\u0432\u044B\u0439'
  if (/^cheongoksaek$/.test(compact)) return '\u0411\u0438\u0440\u044E\u0437\u043E\u0432\u044B\u0439'
  if (/^geomjeongtuton$/.test(compact)) return '\u0427\u0435\u0440\u043D\u044B\u0439 \u0434\u0432\u0443\u0445\u0446\u0432\u0435\u0442\u043D\u044B\u0439'
  if (/^eunsaektuton$/.test(compact)) return '\u0421\u0435\u0440\u0435\u0431\u0440\u0438\u0441\u0442\u044B\u0439 \u0434\u0432\u0443\u0445\u0446\u0432\u0435\u0442\u043D\u044B\u0439'
  if (/^galsaektuton$/.test(compact)) return '\u041A\u043E\u0440\u0438\u0447\u043D\u0435\u0432\u044B\u0439 \u0434\u0432\u0443\u0445\u0446\u0432\u0435\u0442\u043D\u044B\u0439'
  if (/^(huinseaktuton|huinsaektuton)$/.test(compact)) return '\u0411\u0435\u043B\u044B\u0439 \u0434\u0432\u0443\u0445\u0446\u0432\u0435\u0442\u043D\u044B\u0439'
  if (/^geumsaektuton$/.test(compact)) return '\u0417\u043E\u043B\u043E\u0442\u043E\u0439 \u0434\u0432\u0443\u0445\u0446\u0432\u0435\u0442\u043D\u044B\u0439'
  if (/^haneulsaek$/.test(compact)) return '\u041D\u0435\u0431\u0435\u0441\u043D\u043E-\u0433\u043E\u043B\u0443\u0431\u043E\u0439'
  if (/^jajusaek$/.test(compact)) return '\u0411\u043E\u0440\u0434\u043E\u0432\u044B\u0439'
  if (/^(damnoksaek|damnogsaek|dampoksaek)$/.test(compact)) return '\u0421\u0432\u0435\u0442\u043B\u043E-\u0437\u0435\u043B\u0435\u043D\u044B\u0439'
  if (/^yeondusaek$/.test(compact)) return '\u0421\u0432\u0435\u0442\u043B\u043E-\u0437\u0435\u043B\u0435\u043D\u044B\u0439'
  if (/^galdaesaek$/.test(compact)) return '\u0411\u0435\u0436\u0435\u0432\u044B\u0439'
  if (/^yeongeumsaek$/.test(compact)) return '\u0417\u043E\u043B\u043E\u0442\u043E\u0439'
  if (/^myeongeunsaek$/.test(compact)) return '\u0421\u0435\u0440\u0435\u0431\u0440\u0438\u0441\u0442\u044B\u0439'

  return ''
}

const LOCATION_REPLACEMENTS = [
  [/\bseoul\b/gi, 'Сеул'],
  [/\bincheon\b/gi, 'Инчхон'],
  [/\bbusan\b/gi, 'Пусан'],
  [/\bdaegu\b/gi, 'Тэгу'],
  [/\bdaejeon\b/gi, 'Тэджон'],
  [/\bgwangju\b/gi, 'Кванджу'],
  [/\bulsan\b/gi, 'Ульсан'],
  [/\bsejong\b/gi, 'Седжон'],
  [/\bgyeonggi\b/gi, 'Кёнги'],
  [/\bgangwon\b/gi, 'Канвон'],
  [/\bkangwon\b/gi, 'Канвон'],
  [/\bgyeongbuk\b/gi, 'Кёнбук'],
  [/\bgyeongnam\b/gi, 'Кённам'],
  [/\bjeonbuk\b/gi, 'Чоллабук'],
  [/\bjeonnam\b/gi, 'Чолланам'],
  [/\bchungbuk\b/gi, 'Чхунчхонбук'],
  [/\bchungnam\b/gi, 'Чхунчхоннам'],
  [/\bjeju\b/gi, 'Чеджу'],
  [/\bsuwon\b/gi, 'Сувон'],
  [/\byongin\b/gi, 'Йонъин'],
  [/\bseongnam\b/gi, 'Соннам'],
  [/\bansan\b/gi, 'Ансан'],
  [/\bcheonan\b/gi, 'Чхонан'],
  [/\uC11C\uC6B8/gu, 'Сеул'],
  [/\uC778\uCC9C/gu, 'Инчхон'],
  [/\uBD80\uC0B0/gu, 'Пусан'],
  [/\uB300\uAD6C/gu, 'Тэгу'],
  [/\uB300\uC804/gu, 'Тэджон'],
  [/\uAD11\uC8FC/gu, 'Кванджу'],
  [/\uC6B8\uC0B0/gu, 'Ульсан'],
  [/\uC138\uC885/gu, 'Седжон'],
  [/\uACBD\uAE30/gu, 'Кёнги'],
  [/\uAC15\uC6D0/gu, 'Канвон'],
  [/\uACBD\uBD81/gu, 'Кёнбук'],
  [/\uACBD\uB0A8/gu, 'Кённам'],
  [/\uC804\uBD81/gu, 'Чоллабук'],
  [/\uC804\uB0A8/gu, 'Чолланам'],
  [/\uCDA9\uBD81/gu, 'Чхунчхонбук'],
  [/\uCDA9\uB0A8/gu, 'Чхунчхоннам'],
  [/\uC81C\uC8FC/gu, 'Чеджу'],
  [/\uC218\uC6D0/gu, 'Сувон'],
  [/\uC6A9\uC778/gu, 'Йонъин'],
  [/\uC131\uB0A8/gu, 'Соннам'],
  [/\uC548\uC0B0/gu, 'Ансан'],
  [/\uCC9C\uC548/gu, 'Чхонан'],
]

export function normalizeLocationText(value) {
  return applyReplacementList(value, LOCATION_REPLACEMENTS)
}

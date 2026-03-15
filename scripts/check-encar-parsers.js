import assert from 'node:assert/strict'
import { parseEncarHistoryHtml, parseEncarHistoryRecord } from '../server/lib/encarHistory.js'
import {
  extractDriveFromPairs,
  extractInteriorColorFromPairs,
  extractInteriorColorFromText,
  extractKeyInfo,
  normalizeDrive,
  normalizeInteriorColorName,
} from '../server/lib/vehicleData.js'
import { normalizeCarTextFields } from '../server/lib/carRecordNormalization.js'
import {
  extractWarrantyInfo,
  resolveDriveTypeEvidence,
  resolveInteriorColorEvidence,
  resolveKeyInfoEvidence,
  resolveVinEvidence,
} from '../server/lib/encarVehicle.js'

const cardFixture = `
  <section>
    <h3>Stats</h3>
    <div class="stats">
      <div class="card"><span>Accidents</span><strong>0</strong></div>
      <div class="card"><span>Total loss</span><strong>1</strong></div>
      <div class="card"><span>Owner changes</span><strong>2</strong></div>
      <div class="card"><span>Number changes</span><strong>0</strong></div>
      <div class="card"><span>At fault</span><strong>1</strong></div>
      <div class="card"><span>At fault damage</span><strong>15116570 KRW</strong></div>
      <div class="card"><span>Not at fault</span><strong>2</strong></div>
      <div class="card"><span>Not at fault damage</span><strong>691568 KRW</strong></div>
      <div class="card"><span>Thefts</span><strong>0</strong></div>
    </div>
  </section>
  <section>
    <h3>Uninsured periods</h3>
    <div>Period 1: 202405~202406</div>
    <div>Period 2: 202301~202302</div>
  </section>
  <section>
    <h3>Owner changes</h3>
    <div><span>Owner change 1</span><span>19.06.2024</span></div>
    <div><span>Owner change 2</span><span>09.05.2024</span></div>
  </section>
`

const regexFixture = `
  <div>
    РЎС‚Р°С‚РёСЃС‚РёРєР°
    РђРІР°СЂРёРё: 3
    РўРѕС‚Р°Р»СЊРЅР°СЏ РїРѕС‚РµСЂСЏ: 0
    РЎРјРµРЅС‹ РІР»Р°РґРµР»СЊС†РµРІ: 1
    РЎРјРµРЅС‹ РЅРѕРјРµСЂРѕРІ: 0
    РџРѕ РјРѕРµР№ РІРёРЅРµ: 0
    РЈС‰РµСЂР± (РјРѕСЏ РІРёРЅР°): 0 в‚©
    РќРµ РїРѕ РјРѕРµР№ РІРёРЅРµ: 1
    РЈС‰РµСЂР± (С‡СѓР¶Р°СЏ РІРёРЅР°): 250000 в‚©
    РљСЂР°Р¶Рё: 0
    РџРµСЂРёРѕРґ 1: 202405~202406
    РЎРјРµРЅР° РІР»Р°РґРµР»СЊС†Р° 1 - 03.02.2024
  </div>
`

const recordFixture = {
  openData: true,
  regDate: '2026-01-23T09:02:38.983269',
  carNo: '46м¤8577',
  year: '2014',
  maker: 'Volvo',
  displacement: '1560',
  firstDate: '2014-02-12',
  fuel: 'л””м ¤',
  myAccidentCnt: 2,
  otherAccidentCnt: 1,
  ownerChangeCnt: 6,
  robberCnt: 0,
  totalLossCnt: 0,
  government: 0,
  business: 0,
  loan: 0,
  carNoChangeCnt: 0,
  myAccidentCost: 5177340,
  otherAccidentCost: 3559800,
  carInfoChanges: [
    { date: '2014-02-12', carNo: '46м¤XXXX' },
  ],
  ownerChanges: [
    '2025-01-13',
    '2024-04-01',
  ],
  notJoinDate1: '201902~201911',
  notJoinDate2: '202208~202306',
  accidentCnt: 3,
  accidents: [
    {
      type: '1',
      date: '2023-10-01',
      insuranceBenefit: 3451130,
      partCost: 3211580,
      laborCost: 115810,
      paintingCost: 264550,
    },
  ],
}

function run() {
  const createResolverContext = (overrides = {}) => ({
    primaryPayload: {
      source: 'api',
      data: {},
      spec: {},
    },
    supplementalPayload: null,
    structuredEntries: [],
    structuredPairs: [],
    htmlPairs: [],
    textSources: [],
    optionTexts: [],
    inspection: null,
    diagnostics: [],
    bodyColor: '',
    vehicleNo: '',
    vehicleId: '',
    queryCarId: '',
    encarId: '',
    ...overrides,
  })

  const cardParsed = parseEncarHistoryHtml(cardFixture, { sourceUrl: 'fixture://cards' })
  assert.equal(cardParsed.available, true)
  assert.equal(cardParsed.statistics.accidents, 0)
  assert.equal(cardParsed.statistics.totalLoss, 1)
  assert.equal(cardParsed.uninsuredPeriods.length, 2)
  assert.deepEqual(cardParsed.uninsuredPeriods[0], {
    index: 1,
    raw: '202405~202406',
    start: '2024-05',
    end: '2024-06',
  })
  assert.equal(cardParsed.ownerChanges.length, 2)

  const regexParsed = parseEncarHistoryHtml(regexFixture, { sourceUrl: 'fixture://regex' })
  assert.equal(regexParsed.available, true)
  assert.equal(regexParsed.statistics.accidents, null)
  assert.equal(regexParsed.uninsuredPeriods.length, 1)
  assert.equal(regexParsed.ownerChanges.length, 0)

  const recordParsed = parseEncarHistoryRecord(recordFixture, {
    carId: '41396660',
    vehicleNo: '46м¤8577',
    sourceUrl: 'fixture://record-api',
  })
  assert.equal(recordParsed.pageType, 'record_api')
  assert.equal(recordParsed.statistics.accidents, 3)
  assert.equal(recordParsed.statistics.atFaultCount, 2)
  assert.equal(recordParsed.statistics.notAtFaultDamage, 3559800)
  assert.equal(recordParsed.uninsuredPeriods.length, 2)
  assert.equal(recordParsed.uninsuredPeriods[0].start, '2019-02')
  assert.equal(recordParsed.ownerChanges.length, 2)
  assert.equal(recordParsed.ownerChanges[0].date, '2025-01-13')
  assert.equal(recordParsed.numberChangeHistory.length, 1)
  assert.equal(recordParsed.numberChangeHistory[0].carNo, '46м¤XXXX')

  const pairedInterior = extractInteriorColorFromPairs([
    { label: 'interior color', value: 'beige' },
    { label: 'body color', value: 'white' },
  ], 'white')
  assert.equal(pairedInterior, '\u0411\u0435\u0436\u0435\u0432\u044B\u0439')

  const textInterior = extractInteriorColorFromText('Seat color black leather interior', '\u0411\u0435\u043B\u044B\u0439')
  assert.equal(textInterior, '\u0427\u0435\u0440\u043D\u044B\u0439')

  const chunkedInterior = extractInteriorColorFromText('full option / panoramic roof / brown nappa leather seats / 7 seat / massage seat', '\u0427\u0435\u0440\u043D\u044B\u0439')
  assert.equal(chunkedInterior, '\u041A\u043E\u0440\u0438\u0447\u043D\u0435\u0432\u044B\u0439')

  const falsePositiveInterior = extractInteriorColorFromText('blackbox camera QXD7000 with parking assist', '\u0411\u0435\u043B\u044B\u0439')
  assert.equal(falsePositiveInterior, '')

  const bluetoothInterior = extractInteriorColorFromText('Bluetooth package black leather interior with premium audio', '')
  assert.equal(bluetoothInterior, '\u0427\u0435\u0440\u043D\u044B\u0439')

  const twoToneBySegments = extractInteriorColorFromText('beige leather seats / black dashboard trim', '')
  assert.equal(twoToneBySegments, '\u0414\u0432\u0443\u0445\u0446\u0432\u0435\u0442\u043D\u044B\u0439')

  const twoToneBySentence = extractInteriorColorFromText('beige seats with black dashboard and red door trim', '')
  assert.equal(twoToneBySentence, '\u0414\u0432\u0443\u0445\u0446\u0432\u0435\u0442\u043D\u044B\u0439')

  const whiteInterior = extractInteriorColorFromPairs([
    { label: 'interior color', value: 'white' },
  ], 'white')
  assert.equal(whiteInterior, '\u0411\u0435\u043B\u044B\u0439')

  const pairedTwoToneInterior = extractInteriorColorFromPairs([
    { label: 'seat color', value: 'beige leather' },
    { label: 'door trim', value: 'black' },
  ], '')
  assert.equal(pairedTwoToneInterior, '\u0414\u0432\u0443\u0445\u0446\u0432\u0435\u0442\u043D\u044B\u0439')

  const distantLeatherInterior = extractInteriorColorFromText('brown nappa leather premium seats with memory package', '\u0411\u0435\u043B\u044B\u0439')
  assert.equal(distantLeatherInterior, '\u041A\u043E\u0440\u0438\u0447\u043D\u0435\u0432\u044B\u0439')

  assert.equal(normalizeInteriorColorName('ivory'), '\u041A\u0440\u0435\u043C\u043E\u0432\u044B\u0439')
  assert.equal(normalizeInteriorColorName('camel brown'), '\u0420\u044B\u0436\u0438\u0439 / \u043A\u0430\u0440\u0430\u043C\u0435\u043B\u044C\u043D\u044B\u0439')
  assert.equal(normalizeInteriorColorName('burgundy'), '\u0411\u043E\u0440\u0434\u043E\u0432\u044B\u0439')
  assert.equal(normalizeInteriorColorName('dark gray'), '\u0422\u0435\u043C\u043D\u043E-\u0441\u0435\u0440\u044B\u0439')
  assert.equal(normalizeInteriorColorName('light gray'), '\u0421\u0432\u0435\u0442\u043B\u043E-\u0441\u0435\u0440\u044B\u0439')
  assert.equal(normalizeInteriorColorName('black leather'), '\u0427\u0435\u0440\u043D\u044B\u0439')
  assert.equal(normalizeInteriorColorName('light interior package'), '')
  assert.equal(normalizeInteriorColorName('snow white'), '')
  assert.equal(normalizeInteriorColorName('Gonggan'), '')
  assert.equal(normalizeInteriorColorName('blackbox camera QXD7000 with parking assist'), '')
  assert.equal(normalizeInteriorColorName('Wa Siloega Kkaekkeuthapnida - Gwanrisangtae Modeun Jeongbireul Machin Sangtaeipnida'), '')
  assert.equal(
    extractInteriorColorFromText('Two-tone interior / black and beige leather seats', ''),
    '\u0414\u0432\u0443\u0445\u0446\u0432\u0435\u0442\u043D\u044B\u0439',
  )

  const apiVin = resolveVinEvidence(createResolverContext({
    primaryPayload: {
      source: 'api',
      data: { vin: ' yv1mv845be2126012 ' },
      spec: {},
    },
  }))
  assert.equal(apiVin.value, 'YV1MV845BE2126012')
  assert.equal(apiVin.source, 'official-structured')

  const invalidInspectionVin = resolveVinEvidence(createResolverContext({
    primaryPayload: {
      source: 'api',
      data: { vin: '' },
      spec: {},
    },
    structuredPairs: [
      { source: 'inspection-report', label: 'VIN', value: 'M17558', path_or_label: 'VIN' },
    ],
  }))
  assert.equal(invalidInspectionVin.value, '')
  assert.equal(invalidInspectionVin.diagnostics.some((entry) => entry.reason === 'invalid_length'), true)

  const conflictingVin = resolveVinEvidence(createResolverContext({
    primaryPayload: {
      source: 'api',
      data: { vin: '' },
      spec: {},
    },
    structuredPairs: [
      { source: 'inspection-report', label: 'VIN', value: 'YV1MV845BE2126012', path_or_label: 'VIN basic' },
      { source: 'inspection-report', label: 'VIN', value: 'WBAFR9C57BC271234', path_or_label: 'VIN detail' },
    ],
  }))
  assert.equal(conflictingVin.value, '')
  assert.equal(conflictingVin.diagnostics.some((entry) => entry.reason === 'conflicting_same_priority_no_decision'), true)

  const textFalsePositiveVin = resolveVinEvidence(createResolverContext({
    primaryPayload: {
      source: 'api',
      data: { vin: '' },
      spec: {},
    },
    textSources: [
      { source: 'text-fallback', path_or_label: 'html', text: 'vehicle identification number transferagencyfee' },
    ],
  }))
  assert.equal(textFalsePositiveVin.value, '')
  assert.equal(textFalsePositiveVin.diagnostics.some((entry) => entry.reason === 'looks_like_text'), true)

  const specInterior = resolveInteriorColorEvidence(createResolverContext({
    primaryPayload: {
      source: 'api',
      data: {},
      spec: { interiorColorName: 'ivory' },
    },
    bodyColor: '\u0411\u0435\u043B\u044B\u0439',
  }))
  assert.equal(specInterior.value, '\u041A\u0440\u0435\u043C\u043E\u0432\u044B\u0439')
  assert.equal(specInterior.source, 'official-spec')

  const pairInterior = resolveInteriorColorEvidence(createResolverContext({
    primaryPayload: {
      source: 'api',
      data: {},
      spec: {},
    },
    bodyColor: '\u0411\u0435\u043B\u044B\u0439',
    structuredPairs: [
      { source: 'inspection-report', label: 'interior color', value: 'beige leather', path_or_label: 'interior color' },
    ],
  }))
  assert.equal(pairInterior.value, '\u0411\u0435\u0436\u0435\u0432\u044B\u0439')

  const textFallbackInterior = resolveInteriorColorEvidence(createResolverContext({
    primaryPayload: {
      source: 'api',
      data: {},
      spec: {},
    },
    textSources: [
      { source: 'option-dictionary', path_or_label: 'option[0]', text: 'black leather interior with premium audio' },
    ],
  }))
  assert.equal(textFallbackInterior.value, '\u0427\u0435\u0440\u043D\u044B\u0439')

  const rawOptionInterior = resolveInteriorColorEvidence(createResolverContext({
    primaryPayload: {
      source: 'api',
      data: {},
      spec: {},
    },
    textSources: [
      { source: 'official-api-option-text', path_or_label: 'options.etc[0]', text: '\uB808\uB4DC\uC2DC\uD2B8 \uC644\uC804\uBB34\uC0AC\uACE0 \uC9E7\uC740 \uD0A4\uB85C\uC218\uC8FC\uD589' },
    ],
  }))
  assert.equal(rawOptionInterior.value, '\u041A\u0440\u0430\u0441\u043D\u044B\u0439')
  assert.equal(rawOptionInterior.source, 'raw-option-text')

  assert.equal(extractInteriorColorFromText('\uBE0C\uB77C\uC6B4\uC2DC\uD2B8'), '\u041A\u043E\u0440\u0438\u0447\u043D\u0435\u0432\u044B\u0439')
  assert.equal(extractInteriorColorFromText('\uBE14\uB799\uB0B4\uC7A5'), '\u0427\u0435\u0440\u043D\u044B\u0439')
  assert.equal(extractInteriorColorFromText('\uCE74\uBA5C\uC2DC\uD2B8'), '\u0420\u044B\u0436\u0438\u0439 / \u043A\u0430\u0440\u0430\u043C\u0435\u043B\u044C\u043D\u044B\u0439')
  assert.equal(extractInteriorColorFromText('cognacinterior'), '\u0420\u044B\u0436\u0438\u0439 / \u043A\u0430\u0440\u0430\u043C\u0435\u043B\u044C\u043D\u044B\u0439')
  assert.equal(extractInteriorColorFromText('ivorynappa'), '\u041A\u0440\u0435\u043C\u043E\u0432\u044B\u0439')
  assert.equal(extractInteriorColorFromText('brownleatherseat'), '\u041A\u043E\u0440\u0438\u0447\u043D\u0435\u0432\u044B\u0439')

  const compoundOptionInterior = resolveInteriorColorEvidence(createResolverContext({
    primaryPayload: {
      source: 'api',
      data: {},
      spec: {},
    },
    textSources: [
      { source: 'official-api-option-text', path_or_label: 'options.etc[1]', text: '\uBE0C\uB77C\uC6B4\uC2DC\uD2B8 \uC644\uC804\uBB34\uC0AC\uACE0' },
    ],
  }))
  assert.equal(compoundOptionInterior.value, '\u041A\u043E\u0440\u0438\u0447\u043D\u0435\u0432\u044B\u0439')
  assert.equal(compoundOptionInterior.source, 'raw-option-text')

  const pathDrivenInterior = resolveInteriorColorEvidence(createResolverContext({
    primaryPayload: {
      source: 'api',
      data: {},
      spec: {},
    },
    textSources: [
      { source: 'text-fallback', path_or_label: 'spec.interiorColorName', text: 'Cognac' },
    ],
  }))
  assert.equal(pathDrivenInterior.value, '\u0420\u044B\u0436\u0438\u0439 / \u043A\u0430\u0440\u0430\u043C\u0435\u043B\u044C\u043D\u044B\u0439')

  const rejectedBodyColorInterior = resolveInteriorColorEvidence(createResolverContext({
    primaryPayload: {
      source: 'api',
      data: {},
      spec: {},
    },
    bodyColor: '\u0411\u0435\u043B\u044B\u0439',
    textSources: [
      { source: 'text-fallback', path_or_label: 'description', text: 'white pearl exterior color' },
    ],
  }))
  assert.equal(rejectedBodyColorInterior.value, '')
  assert.equal(rejectedBodyColorInterior.diagnostics.some((entry) => entry.reason === 'no_interior_context'), true)

  assert.equal(extractKeyInfo({ contentsText: 'smart key 2' }), '\u0421\u043c\u0430\u0440\u0442-\u043a\u043b\u044e\u0447: 2 \u0448\u0442.')
  assert.equal(extractKeyInfo({ contentsText: 'card key available' }), '\u041a\u043b\u044e\u0447-\u043a\u0430\u0440\u0442\u0430')
  assert.equal(extractKeyInfo({ contentsText: 'electronic key' }), '\u042d\u043b\u0435\u043A\u0442\u0440\u043E\u043D\u043D\u044B\u0439 \u043A\u043B\u044E\u0447')
  assert.equal(extractKeyInfo({ contentsText: 'flip key 1 ea' }), '\u0412\u044B\u043A\u0438\u0434\u043D\u043E\u0439 \u043A\u043B\u044E\u0447: 1 \u0448\u0442.')
  assert.equal(extractKeyInfo({ contentsText: '2 keys' }), '\u041A\u043B\u044E\u0447\u0438: 2 \u0448\u0442.')
  assert.equal(extractKeyInfo({ contentsText: 'spare key included' }), '')
  assert.equal(extractKeyInfo({ contentsText: '\uC2A4\uB9C8\uD2B8\uD0A4 \uC5C6\uC74C' }), '')
  assert.equal(extractKeyInfo({ contentsText: '\uCC28\uB7C9 \uD0A4 \uAC1C\uC218 2\uAC1C' }), '\u041A\u043B\u044E\u0447\u0438: 2 \u0448\u0442.')
  assert.equal(extractKeyInfo({ contentsText: '\uC2A4\uB9C8\uD2B8\uD0A4 2EA' }), '\u0421\u043C\u0430\u0440\u0442-\u043A\u043B\u044E\u0447: 2 \u0448\u0442.')

  assert.equal(normalizeDrive('BMW xDrive 40i'), '\u041F\u043E\u043B\u043D\u044B\u0439 (AWD)')
  assert.equal(normalizeDrive('BMW X6 xDrive40i M Sport'), '\u041F\u043E\u043B\u043D\u044B\u0439 (AWD)')
  assert.equal(normalizeDrive('Mini Countryman ALL4 Classic'), '\u041F\u043E\u043B\u043D\u044B\u0439 (AWD)')
  assert.equal(normalizeDrive('Mercedes-Benz 4MATIC+'), '\u041F\u043E\u043B\u043D\u044B\u0439 (AWD)')
  assert.equal(normalizeDrive('Maserati Levante Q4 Modena'), '\u041F\u043E\u043B\u043D\u044B\u0439 (AWD)')
  assert.equal(normalizeDrive('Nissan Ariya e-4ORCE'), '\u041F\u043E\u043B\u043D\u044B\u0439 (AWD)')
  assert.equal(normalizeDrive('Jeep Wrangler 4xe'), '\u041F\u043E\u043B\u043D\u044B\u0439 (4WD)')
  assert.equal(normalizeDrive('e-AWD'), '\u041F\u043E\u043B\u043D\u044B\u0439 (AWD)')
  assert.equal(normalizeDrive('4WD system'), '\u041F\u043E\u043B\u043D\u044B\u0439 (4WD)')
  assert.equal(normalizeDrive('\uC804\uB95C\uAD6C\uB3D9'), '\u041F\u0435\u0440\u0435\u0434\u043D\u0438\u0439 (FWD)')
  assert.equal(normalizeDrive('\uD6C4\uB95C\uAD6C\uB3D9'), '\u0417\u0430\u0434\u043D\u0438\u0439 (RWD)')
  assert.equal(normalizeDrive('2WD'), '')
  assert.equal(
    extractDriveFromPairs([{ label: '\uAD6C\uB3D9\uBC29\uC2DD', value: '\uC0AC\uB95C\uAD6C\uB3D9' }]),
    '\u041F\u043E\u043B\u043D\u044B\u0439 (4WD)',
  )

  const officialKeyCount = resolveKeyInfoEvidence(createResolverContext({
    structuredEntries: [
      { source: 'official-api.data', path: 'data.smartKeyCount', pathSignal: 'data smart key count', value: '2' },
    ],
  }))
  assert.equal(officialKeyCount.value, '\u041A\u043B\u044E\u0447\u0438: 2 \u0448\u0442.')
  assert.equal(officialKeyCount.source, 'official-structured-key')

  const htmlSmartKey = resolveKeyInfoEvidence(createResolverContext({
    htmlPairs: [
      { source: 'official-api.html-structured', label: '\uC2A4\uB9C8\uD2B8\uD0A4', value: '\uC788\uC74C', path_or_label: '\uC2A4\uB9C8\uD2B8\uD0A4' },
      { source: 'official-api.html-structured', label: '\uCC28\uB7C9 \uD0A4 \uAC1C\uC218', value: '2\uAC1C', path_or_label: '\uCC28\uB7C9 \uD0A4 \uAC1C\uC218' },
    ],
  }))
  assert.equal(htmlSmartKey.value, '\u0421\u043C\u0430\u0440\u0442-\u043A\u043B\u044E\u0447: 2 \u0448\u0442.')
  assert.equal(htmlSmartKey.diagnostics.some((entry) => entry.reason === 'selected_merged'), true)

  const conflictingKeyCounts = resolveKeyInfoEvidence(createResolverContext({
    htmlPairs: [
      { source: 'official-api.html-structured', label: '\uC2A4\uB9C8\uD2B8\uD0A4', value: '1\uAC1C', path_or_label: 'smart key 1' },
      { source: 'official-api.html-structured', label: '\uC2A4\uB9C8\uD2B8\uD0A4', value: '2\uAC1C', path_or_label: 'smart key 2' },
    ],
  }))
  assert.equal(conflictingKeyCounts.value, '\u0421\u043C\u0430\u0440\u0442-\u043A\u043B\u044E\u0447')
  assert.equal(conflictingKeyCounts.diagnostics.some((entry) => entry.reason === 'selected_type_only_due_to_conflicting_counts'), true)

  const explicitDrive = resolveDriveTypeEvidence(createResolverContext({
    structuredPairs: [
      { source: 'inspection-report', label: '\uAD6C\uB3D9\uBC29\uC2DD', value: '\uC804\uB95C\uAD6C\uB3D9', path_or_label: '\uAD6C\uB3D9\uBC29\uC2DD' },
    ],
  }))
  assert.equal(explicitDrive.value, '\u041F\u0435\u0440\u0435\u0434\u043D\u0438\u0439 (FWD)')
  assert.equal(explicitDrive.source, 'inspection-report')

  const structuredTitleDrive = resolveDriveTypeEvidence(createResolverContext({
    structuredEntries: [
      {
        source: 'official-api.data',
        path: 'data.category.gradeEnglishName',
        pathSignal: 'data category grade english name',
        value: 'xDrive40i M Sport',
      },
    ],
  }))
  assert.equal(structuredTitleDrive.value, '\u041F\u043E\u043B\u043D\u044B\u0439 (AWD)')
  assert.equal(structuredTitleDrive.source, 'official-structured-drive')

  const titleDrive = resolveDriveTypeEvidence(createResolverContext({
    structuredPairs: [
      { source: 'inspection-report', label: '\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435', value: '\uC62C \uB274 \uB809\uC2A4\uD134 \uB514\uC824 2.2 4WD', path_or_label: '\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435' },
    ],
  }))
  assert.equal(titleDrive.value, '\u041F\u043E\u043B\u043D\u044B\u0439 (4WD)')

  const ambiguous2wd = resolveDriveTypeEvidence(createResolverContext({
    structuredPairs: [
      { source: 'inspection-report', label: '\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435', value: '\uC3D8\uB80C\uD1A0 1.6 2WD', path_or_label: '\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435' },
    ],
  }))
  assert.equal(ambiguous2wd.value, '')

  const knownModelDefaultDrive = resolveDriveTypeEvidence(createResolverContext({
    structuredPairs: [
      { source: 'inspection-report', label: '\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435', value: 'BMW 5 Series 520i M Sport', path_or_label: '\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435' },
    ],
  }))
  assert.equal(knownModelDefaultDrive.value, '\u0417\u0430\u0434\u043D\u0438\u0439 (RWD)')
  assert.equal(knownModelDefaultDrive.source, 'legacy-drive-parser')

  const conflictingDrive = resolveDriveTypeEvidence(createResolverContext({
    structuredPairs: [
      { source: 'inspection-report', label: '\uAD6C\uB3D9\uBC29\uC2DD', value: '\uC804\uB95C\uAD6C\uB3D9', path_or_label: 'drive fwd' },
      { source: 'inspection-report', label: '\uAD6C\uB3D9\uBC29\uC2DD', value: '\uD6C4\uB95C\uAD6C\uB3D9', path_or_label: 'drive rwd' },
    ],
  }))
  assert.equal(conflictingDrive.value, '')
  assert.equal(conflictingDrive.diagnostics.some((entry) => entry.reason === 'conflicting_same_priority_no_decision'), true)

  assert.equal(normalizeDrive('2WD'), '')

  const touringHonda = normalizeCarTextFields({
    name: 'Honda Accord 2.0 Hybrid Tueoring',
    model: 'Honda Accord 2.0 Hybrid Tueoring',
    drive_type: '',
  })
  assert.equal(touringHonda.name, 'Honda Accord 2.0 Hybrid Touring')
  assert.equal(touringHonda.model, 'Honda Accord 2.0 Hybrid Touring')
  assert.equal(touringHonda.drive_type, 'Передний (FWD)')

  const touringBmw = normalizeCarTextFields({
    name: 'BMW 3 Series 320d Tueoring M Sport',
    trim_level: 'Tueoring M Sport',
  })
  assert.equal(touringBmw.name, 'BMW 3 Series 320d Touring M Sport')
  assert.equal(touringBmw.trim_level, 'Touring M Sport')

  const onlineBmw = normalizeCarTextFields({
    name: 'BMW X6 xDrive40i M Sport Onrain Exclusive',
    trim_level: 'M Sport Onrain Exclusive',
  })
  assert.equal(onlineBmw.name, 'BMW X6 xDrive40i M Sport Online Exclusive')
  assert.equal(onlineBmw.trim_level, 'M Sport Online Exclusive')

  const premiereChevrolet = normalizeCarTextFields({
    name: 'Chevrolet Malibu 1.3 Turbo Peurimieo',
    trim_level: 'Peurimieo',
  })
  assert.equal(premiereChevrolet.name, 'Chevrolet Malibu 1.3 Turbo Premiere')
  assert.equal(premiereChevrolet.trim_level, 'Premiere')

  const santafeHyundai = normalizeCarTextFields({
    name: 'Hyundai Santafe Prestige',
    model: 'Hyundai Santafe Prestige',
  })
  assert.equal(santafeHyundai.name, 'Hyundai Santa Fe Prestige')
  assert.equal(santafeHyundai.model, 'Hyundai Santa Fe Prestige')

  const inspirationTrim = normalizeCarTextFields({
    name: 'Hyundai Tucson Inspiration 2WD',
    trim_level: 'Inspire 2WD',
  })
  assert.equal(inspirationTrim.trim_level, 'Inspiration 2WD')

  const compactBmwXdrive = normalizeCarTextFields({
    name: 'BMW X5 xDrive 40i M Sport',
    trim_level: 'xDrive 40i M Sport',
  })
  assert.equal(compactBmwXdrive.name, 'BMW X5 xDrive40i M Sport')
  assert.equal(compactBmwXdrive.trim_level, 'xDrive40i M Sport')

  const maybachMercedes = normalizeCarTextFields({
    name: 'Mercedes-Benz S-Class Maibaheu S580 4MATIC',
  })
  assert.equal(maybachMercedes.name, 'Mercedes-Benz S-Class Maybach S580 4MATIC')

  const excellenceVolvo = normalizeCarTextFields({
    name: 'Volvo S90 T8 AWD Aekseolreonseu',
  })
  assert.equal(excellenceVolvo.name, 'Volvo S90 T8 AWD Excellence')

  const redlineChevrolet = normalizeCarTextFields({
    name: 'Chevrolet Traverse 3.6 AWD Redeurain',
  })
  assert.equal(redlineChevrolet.name, 'Chevrolet Traverse 3.6 AWD Redline')

  const carreraPorsche = normalizeCarTextFields({
    name: 'Porsche 911 Karera 4S Kabeuriolre',
  })
  assert.equal(carreraPorsche.name, 'Porsche 911 Carrera 4S Cabriolet')

  const noblessKia = normalizeCarTextFields({
    name: 'Kia Sportage Nobleless',
  })
  assert.equal(noblessKia.name, 'Kia Sportage Noblesse')

  const polestarMotors = normalizeCarTextFields({
    name: 'Polestar Polestar 4 Long Range Dyueolmoteo',
    model: 'Polestar Polestar 4 Long Range Singgeulmoteo',
  })
  assert.equal(polestarMotors.name, 'Polestar 4 Long Range Dual Motor')
  assert.equal(polestarMotors.model, 'Polestar 4 Long Range Single Motor')

  const hondaCrv2wd = normalizeCarTextFields({
    name: 'Honda CR-V 1.5 EX-L 2WD',
    drive_type: '',
  })
  assert.equal(hondaCrv2wd.drive_type, 'Передний (FWD)')

  const hondaCrv4wd = normalizeCarTextFields({
    name: 'Honda CR-V 2.0 Hybrid Touring 4WD',
    drive_type: 'Полный (4WD)',
  })
  assert.equal(hondaCrv4wd.drive_type, 'Полный (4WD)')

  const bmwIx3 = normalizeCarTextFields({
    name: 'BMW iX3 M Sport',
    drive_type: '',
  })
  assert.equal(bmwIx3.drive_type, '')

  const kiaCarnival = normalizeCarTextFields({
    name: 'Kia Carnival HEV 9 seats Signature',
    drive_type: '',
  })
  assert.equal(kiaCarnival.drive_type, 'Передний (FWD)')

  const porscheMacan = normalizeCarTextFields({
    name: 'Porsche Macan S',
    drive_type: '',
  })
  assert.equal(porscheMacan.drive_type, '\u041f\u043e\u043b\u043d\u044b\u0439 (AWD)')

  const volkswagenJetta = normalizeCarTextFields({
    name: 'Volkswagen Jetta 1.4 TSI Highline',
    drive_type: '',
  })
  assert.equal(volkswagenJetta.drive_type, '\u041f\u0435\u0440\u0435\u0434\u043d\u0438\u0439 (FWD)')

  const unknownModelDrive = normalizeCarTextFields({
    name: 'Opel Insignia 2.0 Turbo Ultimate',
    drive_type: '',
  })
  assert.equal(unknownModelDrive.drive_type, '')

  const canonicalDrivePreserved = normalizeCarTextFields({
    name: 'Honda Accord 2.0 Hybrid Touring',
    drive_type: 'Полный (AWD)',
  })
  assert.equal(canonicalDrivePreserved.drive_type, 'Полный (AWD)')

  const explicitAwDrive = normalizeCarTextFields({
    name: 'Audi A6 45 TFSI quattro',
    drive_type: '',
  })
  assert.equal(explicitAwDrive.drive_type, 'Полный (AWD)')

  const kiaSportage2wdFix = normalizeCarTextFields({
    name: 'Kia Sportage Signature Geuraebiti 2WD',
    drive_type: 'Полный (4WD)',
  })
  assert.equal(kiaSportage2wdFix.name, 'Kia Sportage Signature Gravity 2WD')
  assert.equal(kiaSportage2wdFix.drive_type, 'Передний (FWD)')

  const genesis2wdFix = normalizeCarTextFields({
    name: 'Genesis G80 2.5 Turbo 2WD',
    drive_type: '',
  })
  assert.equal(genesis2wdFix.drive_type, 'Задний (RWD)')

  const unrelatedTitle = normalizeCarTextFields({
    name: 'Generic Tueoring Package',
    trim_level: 'Tueoring Package',
  })
  assert.equal(unrelatedTitle.name, 'Generic Tueoring Package')
  assert.equal(unrelatedTitle.trim_level, 'Tueoring Package')

  const warranty = extractWarrantyInfo({
    warranty: {
      userDefined: true,
      companyName: 'BMW Korea',
      bodyMonth: 24,
      bodyMileage: 999999,
      transmissionMonth: 36,
      transmissionMileage: 60000,
    },
  })
  assert.deepEqual(warranty, {
    provider: 'BMW Korea',
    userDefined: true,
    body: { months: 24, mileage: 999999 },
    transmission: { months: 36, mileage: 60000 },
    source: 'category.warranty',
  })

  console.log('Encar parser checks passed')
}

run()

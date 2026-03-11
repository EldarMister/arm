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
import { extractWarrantyInfo } from '../server/lib/encarVehicle.js'

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

  const whiteInterior = extractInteriorColorFromPairs([
    { label: 'interior color', value: 'white' },
  ], 'white')
  assert.equal(whiteInterior, '\u0411\u0435\u043B\u044B\u0439')

  const distantLeatherInterior = extractInteriorColorFromText('brown nappa leather premium seats with memory package', '\u0411\u0435\u043B\u044B\u0439')
  assert.equal(distantLeatherInterior, '\u041A\u043E\u0440\u0438\u0447\u043D\u0435\u0432\u044B\u0439')

  assert.equal(normalizeInteriorColorName('ivory'), '\u041A\u0440\u0435\u043C\u043E\u0432\u044B\u0439')
  assert.equal(normalizeInteriorColorName('camel brown'), '\u0420\u044B\u0436\u0438\u0439 / \u043A\u0430\u0440\u0430\u043C\u0435\u043B\u044C\u043D\u044B\u0439')
  assert.equal(normalizeInteriorColorName('burgundy'), '\u0411\u043E\u0440\u0434\u043E\u0432\u044B\u0439')
  assert.equal(normalizeInteriorColorName('dark gray'), '\u0422\u0435\u043C\u043D\u043E-\u0441\u0435\u0440\u044B\u0439')
  assert.equal(normalizeInteriorColorName('light gray'), '\u0421\u0432\u0435\u0442\u043B\u043E-\u0441\u0435\u0440\u044B\u0439')
  assert.equal(
    extractInteriorColorFromText('Two-tone interior / black and beige leather seats', ''),
    '\u0414\u0432\u0443\u0445\u0446\u0432\u0435\u0442\u043D\u044B\u0439',
  )

  assert.equal(extractKeyInfo({ contentsText: 'smart key 2' }), '\u0421\u043c\u0430\u0440\u0442-\u043a\u043b\u044e\u0447: 2 \u0448\u0442.')
  assert.equal(extractKeyInfo({ contentsText: 'card key available' }), '\u041a\u043b\u044e\u0447-\u043a\u0430\u0440\u0442\u0430')
  assert.equal(extractKeyInfo({ contentsText: 'electronic key' }), '\u042d\u043b\u0435\u043A\u0442\u0440\u043E\u043D\u043D\u044B\u0439 \u043A\u043B\u044E\u0447')
  assert.equal(extractKeyInfo({ contentsText: 'flip key 1 ea' }), '\u0412\u044B\u043A\u0438\u0434\u043D\u043E\u0439 \u043A\u043B\u044E\u0447: 1 \u0448\u0442.')
  assert.equal(extractKeyInfo({ contentsText: '2 keys' }), '\u041A\u043B\u044E\u0447\u0438: 2 \u0448\u0442.')
  assert.equal(extractKeyInfo({ contentsText: 'spare key included' }), '')

  assert.equal(normalizeDrive('BMW xDrive 40i'), '\u041F\u043E\u043B\u043D\u044B\u0439 (AWD)')
  assert.equal(normalizeDrive('Mercedes-Benz 4MATIC+'), '\u041F\u043E\u043B\u043D\u044B\u0439 (AWD)')
  assert.equal(normalizeDrive('e-AWD'), '\u041F\u043E\u043B\u043D\u044B\u0439 (AWD)')
  assert.equal(normalizeDrive('4WD system'), '\u041F\u043E\u043B\u043D\u044B\u0439 (4WD)')
  assert.equal(normalizeDrive('\uC804\uB95C\uAD6C\uB3D9'), '\u041F\u0435\u0440\u0435\u0434\u043D\u0438\u0439 (FWD)')
  assert.equal(normalizeDrive('\uD6C4\uB95C\uAD6C\uB3D9'), '\u0417\u0430\u0434\u043D\u0438\u0439 (RWD)')
  assert.equal(normalizeDrive('2WD'), '')
  assert.equal(
    extractDriveFromPairs([{ label: '\uAD6C\uB3D9\uBC29\uC2DD', value: '\uC0AC\uB95C\uAD6C\uB3D9' }]),
    '\u041F\u043E\u043B\u043D\u044B\u0439 (4WD)',
  )

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

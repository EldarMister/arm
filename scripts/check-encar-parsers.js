import assert from 'node:assert/strict'
import { parseEncarHistoryHtml, parseEncarHistoryRecord } from '../server/lib/encarHistory.js'
import { extractInteriorColorFromPairs, extractInteriorColorFromText } from '../server/lib/vehicleData.js'
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

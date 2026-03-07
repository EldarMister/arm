import axios from 'axios'
import iconv from 'iconv-lite'
import { load } from 'cheerio'

const inspectionClient = axios.create({
  baseURL: 'https://www.encar.com',
  timeout: 20000,
  responseType: 'arraybuffer',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    Referer: 'https://www.encar.com/',
  },
})

const TEXT_MAP = new Map([
  ['자동차 기본정보', 'Основная информация'],
  ['자동차 종합상태', 'Общее состояние автомобиля'],
  ['사고 · 교환 · 수리 등 이력', 'История ДТП, замен и ремонтов'],
  ['자동차 세부상태', 'Детальное техническое состояние'],
  ['점검 장면 촬영 사진', 'Фото инспекции'],
  ['성능기록부', 'Карта осмотра'],
  ['차명', 'Название'],
  ['연식', 'Год'],
  ['차량번호', 'Номер автомобиля'],
  ['검사유효기간', 'Срок действия осмотра'],
  ['최초등록일', 'Первая регистрация'],
  ['변속기종류', 'Тип КПП'],
  ['사용연료', 'Топливо'],
  ['차대번호', 'VIN'],
  ['보증유형', 'Тип гарантии'],
  ['원동기형식', 'Код двигателя'],
  ['가격산정 기준가격', 'Базовая цена оценки'],
  ['사고이력', 'Аварийная история'],
  ['상태', 'Состояние'],
  ['항목/해당부품', 'Узел / деталь'],
  ['가격조사 ·산정액', 'Оценка стоимости'],
  ['특기사항', 'Примечание'],
  ['주행거리 계기상태', 'Состояние одометра'],
  ['주행거리', 'Пробег'],
  ['차대번호 표기', 'Маркировка VIN'],
  ['배출가스', 'Выхлоп'],
  ['튜닝', 'Тюнинг'],
  ['특별이력', 'Особая история'],
  ['용도변경', 'Изменение назначения'],
  ['색상', 'Тип окраса'],
  ['주요옵션', 'Основные опции'],
  ['리콜대상', 'Под отзыв'],
  ['사고이력 자세히보기', 'Аварийная история'],
  ['단순수리 자세히보기', 'Косметический ремонт'],
  ['가격조사 산정액및 특기사항', 'Оценка стоимости и примечания'],
  ['주요장치', 'Основные системы'],
  ['자기진단', 'Самодиагностика'],
  ['원동기', 'Двигатель'],
  ['변속기', 'Трансмиссия'],
  ['작동상태(공회전)', 'Работа на холостом ходу'],
  ['오일누유', 'Течь масла'],
  ['실린더 커버(로커암 커버)', 'Крышка клапанов'],
  ['실린더 헤드/개스킷', 'ГБЦ / прокладка'],
  ['실린더 블록/오일팬', 'Блок цилиндров / поддон'],
  ['오일유량', 'Уровень масла'],
  ['냉각수누수', 'Утечка охлаждающей жидкости'],
  ['워터펌프', 'Водяной насос'],
  ['라디에이터', 'Радиатор'],
  ['냉각수 수량', 'Уровень охлаждающей жидкости'],
  ['커먼레일', 'Common rail'],
  ['자동변속기(A/T)', 'АКПП'],
  ['오일유량 및 상태', 'Уровень и состояние масла'],
  ['동력전달', 'Трансмиссия и привод'],
  ['클러치 어셈블리', 'Сцепление'],
  ['등속조인트', 'ШРУС'],
  ['추진축 및 베어링', 'Кардан и подшипники'],
  ['디퍼렌셜 기어', 'Дифференциал'],
  ['조향', 'Рулевое управление'],
  ['동력조향 작동 오일 누유', 'Течь жидкости ГУР'],
  ['작동상태', 'Рабочее состояние'],
  ['스티어링 펌프', 'Насос рулевого управления'],
  ['스티어링 기어(MDPS포함)', 'Рулевая рейка (вкл. MDPS)'],
  ['스티어링조인트', 'Рулевой шарнир'],
  ['파워고압호스', 'Шланг высокого давления'],
  ['타이로드엔드 및 볼 조인트', 'Наконечник тяги и шаровая'],
  ['제동', 'Тормозная система'],
  ['브레이크 마스터 실린더오일 누유', 'Течь ГТЦ'],
  ['브레이크 오일 누유', 'Течь тормозной жидкости'],
  ['배력장치 상태', 'Состояние усилителя тормозов'],
  ['전기', 'Электрика'],
  ['발전기 출력', 'Генератор'],
  ['시동 모터', 'Стартер'],
  ['와이퍼 모터 기능', 'Мотор стеклоочистителя'],
  ['실내송풍 모터', 'Мотор печки'],
  ['라디에이터 팬 모터', 'Вентилятор радиатора'],
  ['윈도우 모터', 'Стеклоподъемники'],
  ['연료', 'Топливная система'],
  ['연료누출(LP가스포함)', 'Утечка топлива (вкл. LPG)'],
  ['특기사항 및 점검자의 의견', 'Комментарии инспектора'],
  ['성능 · 상태점검자', 'Инспектор'],
  ['중고자동차 성능 · 상태 점검자', 'Инспектор состояния'],
  ['중고자동차 성능 · 상태 고지자', 'Продавец / уведомитель'],
  ['앞면', 'Вид спереди'],
  ['뒷면', 'Вид сзади'],
  ['외판', 'Внешние панели'],
  ['주요골격', 'Силовой каркас'],
  ['앞(전방)', 'Перед'],
  ['뒤(후방)', 'Зад'],
  ['보험사보증', 'Страховая гарантия'],
  ['더 뉴', 'The New'],
  ['오토', 'Автомат'],
  ['디젤', 'Дизель'],
  ['양호', 'Нормально'],
  ['불량', 'Неисправно'],
  ['있음', 'Есть'],
  ['없음', 'Нет'],
  ['미세누유', 'Незначительная течь'],
  ['누유', 'Течь'],
  ['미세누수', 'Незначительная утечка'],
  ['누수', 'Утечка'],
  ['적정', 'Норма'],
  ['부족', 'Недостаточно'],
  ['과다', 'Избыточно'],
  ['매연', 'Дымность'],
  ['적법', 'Разрешено'],
  ['해당없음', 'Не применяется'],
  ['해당', 'Есть'],
  ['많음', 'Высокий'],
  ['보통', 'Нормальный'],
  ['적음', 'Низкий'],
  ['무채색', 'Нейтральный'],
  ['유채색', 'Цветной'],
  ['고전원 전기장치', 'Высоковольтная электросистема'],
  ['충전구 절연 상태', 'Состояние изоляции зарядного порта'],
  ['구동축전지 격리 상태', 'Состояние изоляции тяговой батареи'],
  ['고전원전기배선 상태(접속단자, 피복, 보호기구)', 'Состояние высоковольтной проводки (клеммы, изоляция, защита)'],
  ['타이로드엔드 및 볼 조인트', 'Наконечники рулевых тяг и шаровые опоры'],
])

function toAbsoluteUrl(path) {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  return `https://www.encar.com${path.startsWith('/') ? '' : '/'}${path}`
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function translateText(value) {
  const text = cleanText(value)
  if (!text) return ''
  if (TEXT_MAP.has(text)) return TEXT_MAP.get(text)
  return text
}

function selectedStateTexts($cell, $) {
  return $cell.find('.txt_state.on, .txt_state.active').map((_, el) => translateText($(el).text())).get().filter(Boolean)
}

function cellFreeText($cell, $) {
  const clone = $cell.clone()
  clone.find('.txt_state').remove()
  return cleanText(clone.text())
}

function parseBasicInfo($) {
  const items = []
  $('.inspec_carinfo table.ckst tr').each((_, row) => {
    const cells = $(row).children('th,td').toArray()
    for (let i = 0; i < cells.length; i += 2) {
      const label = translateText($(cells[i]).text())
      const value = cleanText($(cells[i + 1]).text())
      if (label && value) items.push({ label, value })
    }
  })
  return {
    certificate: cleanText($('.inspec_carinfo .ckdate').text()),
    items,
  }
}

function parseSummaryTable($) {
  const rows = []
  $('.section_total .tbl_total tbody tr').each((_, row) => {
    const $row = $(row)
    const label = translateText($row.find('th').first().text())
    if (!label) return
    const tds = $row.children('td')
    const states = selectedStateTexts(tds.eq(0), $)
    const detail = translateText(cellFreeText(tds.eq(1), $) || tds.eq(1).find('.txt_detail').text())
    const amount = cleanText(tds.eq(2).text())
    const note = cleanText(tds.eq(3).text())
    rows.push({
      label,
      states,
      detail: detail || '',
      amount: amount || '',
      note: note || '',
    })
  })
  return rows
}

function parseRepairHistory($) {
  const rows = []
  $('.section_repair .tbl_repair tbody tr').each((_, row) => {
    const $row = $(row)
    const label = translateText($row.find('th').first().text())
    if (!label) return
    const values = $row.find('td').map((__, cell) => {
      const states = selectedStateTexts($(cell), $)
      const detail = cleanText(cellFreeText($(cell), $))
      return states.length ? states.join(', ') : detail
    }).get().filter(Boolean)
    rows.push({ label, value: values.join(' • ') || '-' })
  })
  return rows
}

function parseExteriorStatus($) {
  const legend = $('.detail_inspection_view .state_explan span').map((_, el) => cleanText($(el).text())).get().filter(Boolean)
  const sections = $('.detail_inspection_view .canv_list > li').map((_, li) => {
    const $li = $(li)
    const title = translateText($li.find('.tit_canv').first().text())
    const ranks = $li.find('.list_lank > li').map((__, rankLi) => {
      const $rankLi = $(rankLi)
      const rank = cleanText($rankLi.find('.tit_lank').first().text())
      const items = $rankLi.find('.list_state li').map((___, item) => cleanText($(item).text())).get().filter(Boolean)
      return { rank, items }
    }).get()
    return { title, ranks }
  }).get()
  return { legend, sections }
}

function parseDetailStatus($) {
  const rows = []
  let currentSection = ''

  $('.section_detail .tbl_detail tbody tr').each((_, row) => {
    const $row = $(row)
    const headerCells = $row.children('th')
    const valueCells = $row.children('td')
    if (!headerCells.length || !valueCells.length) return

    const headerTexts = headerCells.toArray().map((cell) => cleanText($(cell).text())).filter(Boolean)
    if (!headerTexts.length) return

    if ($(headerCells[0]).attr('rowspan')) {
      currentSection = translateText(headerTexts.shift())
    }

    const label = headerTexts.map((text) => translateText(text)).join(' / ')
    const states = selectedStateTexts(valueCells.eq(0), $)
    const detail = cleanText(cellFreeText(valueCells.eq(0), $))
    const amount = cleanText(valueCells.eq(1).text())
    const note = cleanText(valueCells.eq(2).text())

    rows.push({
      section: currentSection || '',
      label: label || currentSection || '',
      states,
      detail: detail || '',
      amount: amount || '',
      note: note || '',
    })
  })

  return rows
}

function parseOpinion($) {
  const rows = []
  $('.section_opinion .tbl_opinion tbody tr').each((_, row) => {
    const $row = $(row)
    const subLabel = translateText($row.find('th.th_sub').text())
    const text = cleanText($row.find('td.td_left').text())
    if (subLabel || text) rows.push({ label: subLabel || 'Комментарий', text })
  })
  return rows
}

function parseInspectionPhotos($) {
  return $('.section_img .list_img li').map((_, li) => {
    const $li = $(li)
    const src = $li.find('img').attr('src')
    const label = translateText($li.find('.txt_img').text())
    if (!src) return null
    return {
      label: label || 'Фото инспекции',
      url: toAbsoluteUrl(src),
    }
  }).get().filter(Boolean)
}

function parseSignatures($) {
  const signers = $('.inspc_sign .sign').map((_, el) => {
    const $el = $(el)
    const label = translateText($el.find('strong .txt_left').text())
    const value = cleanText($el.find('span').text())
    if (!label && !value) return null
    return { label, value }
  }).get().filter(Boolean)

  return {
    date: cleanText($('.inspc_sign .date').text()),
    signers,
  }
}

export async function fetchEncarInspection(carId) {
  const url = `/md/sl/mdsl_regcar.do?method=inspectionView&carid=${encodeURIComponent(carId)}&wtClick_carview=015`
  const response = await inspectionClient.get(url)
  const html = iconv.decode(Buffer.from(response.data), 'euc-kr')
  const $ = load(html)

  return {
    sourceUrl: `https://www.encar.com${url}`,
    basicInfo: parseBasicInfo($),
    summary: parseSummaryTable($),
    repairHistory: parseRepairHistory($),
    exteriorStatus: parseExteriorStatus($),
    detailStatus: parseDetailStatus($),
    opinion: parseOpinion($),
    photos: parseInspectionPhotos($),
    signatures: parseSignatures($),
  }
}

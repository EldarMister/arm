import { Router } from 'express'
import axios from 'axios'
import { hasHangul, translateVehicleText } from '../scraper/translator.js'
import { fetchEncarInspection } from '../lib/encarInspection.js'

const router = Router()
const KRW_PER_USD = 1340

const apiClient = axios.create({
  baseURL: 'https://api.encar.com',
  timeout: 20000,
  proxy: false,
  headers: {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    Origin: 'https://www.encar.com',
    Referer: 'https://www.encar.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  },
})

function toAbsolutePhotoUrl(path) {
  if (!path) return null
  if (/^https?:\/\//i.test(path)) return path
  return `https://ci.encar.com${path.startsWith('/') ? '' : '/'}${path}`
}

function normalizeText(value) {
  if (!value) return ''
  const text = String(value).trim()
  if (!text) return ''
  return hasHangul(text) ? translateVehicleText(text) : text
}

function normalizeManufacturer(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/renault[-\s]*korea\s*\(?\s*(samseong|samsung)?\s*\)?/i.test(raw)) return 'Renault Korea'

  const text = normalizeText(raw)
  if (!text) return ''
  if (/renault[-\s]*korea\s*\(?\s*(samseong|samsung)?\s*\)?/i.test(text)) return 'Renault Korea'
  if (/renault\s*samsung/i.test(text)) return 'Renault Korea'
  if (/kgmobilriti/i.test(text) || /kg mobility/i.test(text)) return 'KG Mobility (SsangYong)'
  if (/ssangyong/i.test(text)) return 'SsangYong'
  return text
}

function normalizeFuel(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const low = text.toLowerCase()
  if (low.includes('diesel') || text.includes('디젤')) return 'Дизель'
  if (low.includes('electric') || text.includes('전기')) return 'Электро'
  if (low.includes('lpg') || text.includes('엘피지')) return 'Газ (LPG)'
  if (low.includes('hybrid') || text.includes('하이브리드')) return 'Гибрид'
  if (low.includes('gasoline') || text.includes('가솔린') || text.includes('휘발유')) return 'Бензин'
  return normalizeText(text)
}

function normalizeTransmission(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const low = text.toLowerCase()
  if (low.includes('cvt')) return 'CVT'
  if (low.includes('dct') || low.includes('dual')) return 'Робот'
  if (low.includes('auto') || text.includes('오토') || text.includes('자동')) return 'Автомат'
  if (low.includes('manual') || text.includes('수동')) return 'Механика'
  return normalizeText(text)
}

function normalizeColor(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const low = text.toLowerCase()
  const compact = low.replace(/[\s_-]/g, '')

  if (low.includes('black') || text.includes('검정') || text.includes('블랙')) return 'Черный'
  if (low.includes('white') || text.includes('흰') || text.includes('백색') || text.includes('화이트')) return 'Белый'
  if (low.includes('silver') || text.includes('실버') || text.includes('은색')) return 'Серебристый'
  if (low.includes('gray') || low.includes('grey') || text.includes('회색') || text.includes('그레이')) return 'Серый'
  if (low.includes('blue') || text.includes('파랑') || text.includes('블루')) return 'Синий'
  if (low.includes('red') || text.includes('빨강') || text.includes('레드')) return 'Красный'
  if (low.includes('green') || text.includes('녹색') || text.includes('그린')) return 'Зеленый'
  if (low.includes('brown') || text.includes('갈색') || text.includes('브라운')) return 'Коричневый'
  if (low.includes('beige') || text.includes('베이지')) return 'Бежевый'
  if (low.includes('yellow') || text.includes('노랑') || text.includes('옐로')) return 'Желтый'
  if (low.includes('orange') || text.includes('주황') || text.includes('오렌지')) return 'Оранжевый'
  if (low.includes('purple') || text.includes('보라') || text.includes('퍼플')) return 'Фиолетовый'

  // Romanized Korean colors from Encar data (e.g. Jwisaek, Cheongsaek).
  if (/^(geomeunsaek|geomjeongsaek|heugsaek)$/.test(compact)) return 'Черный'
  if (/^(baegsaek|huinsaek)$/.test(compact)) return 'Белый'
  if (/^(eunsaek)$/.test(compact)) return 'Серебристый'
  if (/^(hoesaek|jwisaek)$/.test(compact)) return 'Серый'
  if (/^(cheongsaek|parangsaek)$/.test(compact)) return 'Синий'
  if (/^(ppalgangsaek|hongsaek)$/.test(compact)) return 'Красный'
  if (/^(noksaek|choroksaek)$/.test(compact)) return 'Зеленый'
  if (/^(galsaek)$/.test(compact)) return 'Коричневый'
  if (/^(beijisaek)$/.test(compact)) return 'Бежевый'
  if (/^(norangsaek)$/.test(compact)) return 'Желтый'
  if (/^(juhwangsaek)$/.test(compact)) return 'Оранжевый'
  if (/^(borasaek)$/.test(compact)) return 'Фиолетовый'

  return normalizeText(text)
}

function normalizeBodyType(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const text = normalizeText(raw)
  const low = text.toLowerCase()

  if (low.includes('suv') || low === 'rv') return 'SUV'
  if (low.includes('sedan') || raw.includes('세단')) return 'Седан'
  if (low.includes('coupe') || raw.includes('쿠페')) return 'Купе'
  if (low.includes('hatch') || raw.includes('해치백')) return 'Хэтчбек'
  if (low.includes('wagon') || raw.includes('왜건')) return 'Универсал'
  if (low.includes('van') || low.includes('minivan') || raw.includes('밴') || raw.includes('승합')) return 'Вэн'
  if (low.includes('pickup') || raw.includes('픽업')) return 'Пикап'
  if (low.includes('truck') || low.includes('cargo') || raw.includes('화물')) return 'Грузовой / пикап'

  if (/gyeong(?:hyeong)?cha/i.test(text) || raw.includes('경차')) return 'Мини'
  if (/sohyeongcha/i.test(text) || raw.includes('소형차')) return 'Малый класс'
  if (/junjunghyeongcha/i.test(text) || raw.includes('준중형차')) return 'Компактный класс'
  if (/junghyeongcha/i.test(text) || raw.includes('중형차')) return 'Средний класс'
  if (/daehyeongcha/i.test(text) || raw.includes('대형차')) return 'Бизнес-класс'

  return text
}

router.get('/:encarId', async (req, res) => {
  try {
    const { encarId } = req.params
    const includeInspection = req.query.includeInspection === '1' || req.query.includeInspection === 'true'
    const url = `https://www.encar.com/dc/dc_cardetailview.do?carid=${encarId}`

    const { data } = await apiClient.get(`/v1/readside/vehicle/${encodeURIComponent(encarId)}`)

    const category = data?.category || {}
    const spec = data?.spec || {}
    const ad = data?.advertisement || {}
    const contact = data?.contact || {}
    const manage = data?.manage || {}
    const condition = data?.condition || {}
    const view = data?.view || {}
    const partnership = data?.partnership || {}

    const priceKRW = (Number(ad.price) || 0) * 10000
    const priceUSD = Math.round(priceKRW / KRW_PER_USD)

    const yearMonth = String(category.yearMonth || '')
    const year = yearMonth.length >= 6
      ? `${yearMonth.slice(0, 4)}-${yearMonth.slice(4, 6)}`
      : (yearMonth.slice(0, 4) || '')

    const manufacturerRaw = category.manufacturerEnglishName || category.manufacturerName || ''
    const modelGroupRaw = category.modelGroupEnglishName || category.modelGroupName || category.modelName || ''
    const gradeNameRaw = category.gradeDetailEnglishName || category.gradeDetailName || category.gradeName || ''

    const manufacturer = normalizeManufacturer(manufacturerRaw)
    const modelGroup = normalizeText(modelGroupRaw)
    const gradeName = normalizeText(gradeNameRaw)

    const name = [manufacturer, modelGroup, gradeName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
    const model = [modelGroup, gradeName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()

    const photos = Array.isArray(data?.photos) ? data.photos : []
    const normalizedPhotos = photos
      .map((p, idx) => {
        const rawPath = p?.path || p?.location || p?.url
        const abs = toAbsolutePhotoUrl(rawPath)
        if (!abs) return null
        return {
          id: `${p?.code || 'photo'}-${idx}`,
          url: abs,
          type: p?.type || null,
          updateDateTime: p?.updateDateTime || null,
          desc: p?.desc || null,
        }
      })
      .filter(Boolean)

    const imageUrls = normalizedPhotos.map((p) => p.url)

    const vatRefund = Math.round(priceUSD * 0.07)
    const total = Math.round(priceUSD + 200 + 1750 + 100 + 310 - vatRefund)
    let inspection = null

    if (includeInspection && (Boolean(ad.diagnosisCar || view.encarDiagnosis) || Array.isArray(condition?.inspection?.formats))) {
      try {
        inspection = await fetchEncarInspection(encarId)
      } catch (inspectionError) {
        console.warn('Encar inspection parse warning:', inspectionError.message)
      }
    }

    res.json({
      encar_id: String(encarId),
      vehicle_id: data?.vehicleId || null,
      encar_url: url,
      name: name || `Encar ${encarId}`,
      model,
      year,
      mileage: Number(spec.mileage) || 0,
      body_color: normalizeColor(spec.colorName),
      interior_color: normalizeColor(spec?.customColor?.interiorColorName || spec?.customColor?.interiorColor || ''),
      location: normalizeText(contact.address),
      vin: data?.vin || '',
      vehicle_no: data?.vehicleNo || '',
      price_krw: priceKRW,
      price_usd: priceUSD,
      fuel_type: normalizeFuel(spec.fuelName),
      transmission: normalizeTransmission(spec.transmissionName),
      body_type: normalizeBodyType(spec.bodyName),
      seat_count: Number(spec.seatCount) || null,
      displacement: Number(spec.displacement) || 0,
      images: imageUrls,
      photos: normalizedPhotos,
      manage: {
        registDateTime: manage.registDateTime || null,
        firstAdvertisedDateTime: manage.firstAdvertisedDateTime || null,
        modifyDateTime: manage.modifyDateTime || null,
        viewCount: Number(manage.viewCount) || 0,
        subscribeCount: Number(manage.subscribeCount) || 0,
      },
      condition: {
        seizingCount: Number(condition?.seizing?.seizingCount) || 0,
        pledgeCount: Number(condition?.seizing?.pledgeCount) || 0,
        accidentRecordView: Boolean(condition?.accident?.recordView),
        accidentResumeView: Boolean(condition?.accident?.resumeView),
        inspectionFormats: Array.isArray(condition?.inspection?.formats) ? condition.inspection.formats : [],
      },
      flags: {
        diagnosis: Boolean(ad.diagnosisCar || view.encarDiagnosis),
        meetGo: Boolean(view.encarMeetGo),
        hasEvBatteryInfo: Boolean(view.hasEvBatteryInfo),
        isPartneredVehicle: Boolean(partnership.isPartneredVehicle),
      },
      inspection,
      commission: 200,
      delivery: 1750,
      loading: 0,
      unloading: 100,
      storage: 310,
      vat_refund: vatRefund,
      total,
    })
  } catch (err) {
    console.error('Encar parse error:', err.message)
    const status = err?.response?.status
    if (status === 404) {
      return res.status(404).json({ error: 'Автомобиль не найден в Encar API' })
    }
    return res.status(500).json({ error: 'Ошибка парсинга Encar', details: err.message })
  }
})

export default router

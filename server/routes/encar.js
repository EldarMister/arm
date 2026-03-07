import { Router } from 'express'
import axios from 'axios'
import { fetchEncarInspection } from '../lib/encarInspection.js'
import { DEFAULT_FEES, computePricing, getExchangeRateSnapshot } from '../lib/exchangeRate.js'
import {
  PARKING_ADDRESS_EN,
  PARKING_ADDRESS_KO,
  extractKeyInfo,
  extractShortLocation,
  inferDrive,
  normalizeBodyType,
  normalizeColorName,
  normalizeFuel,
  normalizeManufacturer,
  normalizeText,
  normalizeTransmission,
  normalizeTrimLevel,
} from '../lib/vehicleData.js'

const router = Router()

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
    const contents = data?.contents || {}
    const view = data?.view || {}
    const partnership = data?.partnership || {}
    const exchangeSnapshot = await getExchangeRateSnapshot()

    const priceKRW = (Number(ad.price) || 0) * 10000
    const pricing = computePricing({
      priceKrw: priceKRW,
      ...DEFAULT_FEES,
    }, exchangeSnapshot)

    const yearMonth = String(category.yearMonth || '')
    const year = yearMonth.length >= 6
      ? `${yearMonth.slice(0, 4)}-${yearMonth.slice(4, 6)}`
      : (yearMonth.slice(0, 4) || '')

    const manufacturerRaw = category.manufacturerEnglishName || category.manufacturerName || ''
    const modelGroupRaw = category.modelGroupEnglishName || category.modelGroupName || category.modelName || ''
    const gradeNameRaw = category.gradeDetailEnglishName || category.gradeDetailName || category.gradeName || ''
    const driveRaw = [
      category.gradeDetailEnglishName,
      category.gradeDetailName,
      category.gradeEnglishName,
      category.gradeName,
      category.modelGroupEnglishName,
      category.modelGroupName,
      category.modelEnglishName,
      category.modelName,
      ad.title,
      ad.subTitle,
      ad.memo,
    ].filter(Boolean).join(' ')

    const manufacturer = normalizeManufacturer(manufacturerRaw)
    const modelGroup = normalizeText(modelGroupRaw)
    const gradeName = normalizeText(gradeNameRaw)
    const trimLevel = normalizeTrimLevel(
      category.gradeDetailEnglishName,
      category.gradeDetailName,
      category.gradeName,
      category.gradeEnglishName,
    )

    const name = [manufacturer, modelGroup, gradeName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
    const model = [modelGroup, gradeName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()

    const photos = Array.isArray(data?.photos) ? data.photos : []
    const normalizedPhotos = photos
      .map((photo, idx) => {
        const rawPath = photo?.path || photo?.location || photo?.url
        const abs = toAbsolutePhotoUrl(rawPath)
        if (!abs) return null
        return {
          id: `${photo?.code || 'photo'}-${idx}`,
          url: abs,
          type: photo?.type || null,
          updateDateTime: photo?.updateDateTime || null,
          desc: photo?.desc || null,
        }
      })
      .filter(Boolean)

    const imageUrls = normalizedPhotos.map((photo) => photo.url)
    let inspection = null

    if (includeInspection && (Boolean(ad.diagnosisCar || view.encarDiagnosis) || Array.isArray(condition?.inspection?.formats))) {
      try {
        inspection = await fetchEncarInspection(encarId)
      } catch (inspectionError) {
        console.warn('Encar inspection parse warning:', inspectionError.message)
      }
    }

    const locationRaw = String(contact.address || '').trim()
    const keyInfo = extractKeyInfo({
      contentsText: contents.text,
      inspectionRows: inspection?.detailStatus || [],
    })

    res.json({
      encar_id: String(encarId),
      vehicle_id: data?.vehicleId || null,
      encar_url: url,
      name: name || `Encar ${encarId}`,
      model,
      year,
      mileage: Number(spec.mileage) || 0,
      body_color: normalizeColorName(spec.colorName),
      interior_color: normalizeColorName(spec?.customColor?.interiorColorName || spec?.customColor?.interiorColor || ''),
      location: locationRaw,
      location_short: extractShortLocation(locationRaw),
      vin: data?.vin || '',
      vehicle_no: data?.vehicleNo || '',
      price_krw: priceKRW,
      price_usd: pricing.price_usd,
      fuel_type: normalizeFuel(spec.fuelName),
      transmission: normalizeTransmission(spec.transmissionName),
      drive_type: inferDrive(driveRaw, name, model),
      body_type: normalizeBodyType(spec.bodyName),
      trim_level: trimLevel,
      key_info: keyInfo,
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
      commission: DEFAULT_FEES.commission,
      delivery: DEFAULT_FEES.delivery,
      loading: DEFAULT_FEES.loading,
      unloading: DEFAULT_FEES.unloading,
      storage: DEFAULT_FEES.storage,
      vat_refund: pricing.vat_refund,
      total: pricing.total,
      exchange_rate_current: pricing.exchange_rate_current,
      exchange_rate_site: pricing.exchange_rate_site,
      exchange_rate_offset: pricing.exchange_rate_offset,
      vat_rate: pricing.vat_rate,
      parking_address_ko: PARKING_ADDRESS_KO,
      parking_address_en: PARKING_ADDRESS_EN,
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

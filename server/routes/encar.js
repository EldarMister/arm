import { Router } from 'express'
import axios from 'axios'

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

router.get('/:encarId', async (req, res) => {
  try {
    const { encarId } = req.params
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

    const modelGroup = category.modelGroupEnglishName || category.modelGroupName || category.modelName || ''
    const gradeName = category.gradeDetailEnglishName || category.gradeDetailName || category.gradeName || ''
    const manufacturer = category.manufacturerEnglishName || category.manufacturerName || ''

    const name = [manufacturer, modelGroup, gradeName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
    const model = [modelGroup, gradeName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()

    const photos = Array.isArray(data?.photos) ? data.photos : []
    const normalizedPhotos = photos
      .map((p, idx) => {
        const abs = toAbsolutePhotoUrl(p?.path)
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

    res.json({
      encar_id: String(encarId),
      vehicle_id: data?.vehicleId || null,
      encar_url: url,
      name: name || `Encar ${encarId}`,
      model,
      year,
      mileage: Number(spec.mileage) || 0,
      body_color: spec.colorName || '',
      interior_color: spec?.customColor?.interiorColorName || spec?.customColor?.interiorColor || '',
      location: contact.address || '',
      vin: data?.vin || '',
      vehicle_no: data?.vehicleNo || '',
      price_krw: priceKRW,
      price_usd: priceUSD,
      fuel_type: spec.fuelName || '',
      transmission: spec.transmissionName || '',
      body_type: spec.bodyName || '',
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

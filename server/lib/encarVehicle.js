import axios from 'axios'
import { fetchEncarInspection } from './encarInspection.js'
import { computePricing, getExchangeRateSnapshot } from './exchangeRate.js'
import { getPricingSettings, resolveVehicleFees } from './pricingSettings.js'
import {
  appendTitleTrimSuffix,
  PARKING_ADDRESS_EN,
  PARKING_ADDRESS_KO,
  extractKeyInfo,
  extractShortLocation,
  extractTrimLevelFromTitle,
  inferDrive,
  normalizeColorName,
  normalizeFuel,
  normalizeInteriorColorName,
  resolveManufacturerDisplayName,
  normalizeManufacturer,
  normalizeText,
  resolveBodyType,
  normalizeTransmission,
  normalizeTrimLevel,
} from './vehicleData.js'

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

async function fetchEncarVehicleApiData(encarId) {
  const url = `https://www.encar.com/dc/dc_cardetailview.do?carid=${encarId}`
  const { data } = await apiClient.get(`/v1/readside/vehicle/${encodeURIComponent(encarId)}`)

  return {
    url,
    data,
    category: data?.category || {},
    spec: data?.spec || {},
    ad: data?.advertisement || {},
    contact: data?.contact || {},
    manage: data?.manage || {},
    condition: data?.condition || {},
    contents: data?.contents || {},
    view: data?.view || {},
    partnership: data?.partnership || {},
  }
}

function toAbsolutePhotoUrl(path) {
  if (!path) return null
  if (/^https?:\/\//i.test(path)) return path
  return `https://ci.encar.com${path.startsWith('/') ? '' : '/'}${path}`
}

export async function fetchEncarVehicleDetail(encarId, { includeInspection = false } = {}) {
  const {
    url,
    data,
    category,
    spec,
    ad,
    contact,
    manage,
    condition,
    contents,
    view,
    partnership,
  } = await fetchEncarVehicleApiData(encarId)
  const exchangeSnapshot = await getExchangeRateSnapshot()
  const pricingSettings = await getPricingSettings()
  const priceKRW = (Number(ad.price) || 0) * 10000

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
  ) || extractTrimLevelFromTitle(
    category.gradeDetailEnglishName,
    category.gradeDetailName,
    category.gradeName,
    category.gradeEnglishName,
    ad.title,
    ad.subTitle,
  )

  const displayManufacturer = resolveManufacturerDisplayName(
    manufacturerRaw,
    manufacturer,
    modelGroupRaw,
    modelGroup,
    gradeNameRaw,
    gradeName,
    ad.title,
    ad.subTitle,
  )
  const name = appendTitleTrimSuffix(
    [displayManufacturer, modelGroup, gradeName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(),
    category.gradeDetailEnglishName,
    category.gradeDetailName,
    trimLevel,
  )
  const model = appendTitleTrimSuffix(
    [modelGroup, gradeName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(),
    category.gradeDetailEnglishName,
    category.gradeDetailName,
    trimLevel,
  )
  const bodyType = resolveBodyType(
    spec.bodyName,
    name,
    model,
    category.modelGroupEnglishName,
    category.modelGroupName,
    ad.title,
    ad.subTitle,
  )
  const driveType = inferDrive(driveRaw, name, model)
  const fees = resolveVehicleFees({
    name,
    model,
    body_type: bodyType,
    trim_level: trimLevel,
    drive_type: driveType,
    pricing_locked: false,
  }, pricingSettings)
  const pricing = computePricing({
    priceKrw: priceKRW,
    commission: fees.commission,
    delivery: fees.delivery,
    loading: fees.loading,
    unloading: fees.unloading,
    storage: fees.storage,
  }, exchangeSnapshot)

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

  return {
    encar_id: String(encarId),
    vehicle_id: data?.vehicleId || null,
    encar_url: url,
    name: name || `Encar ${encarId}`,
    model,
    year,
    mileage: Number(spec.mileage) || 0,
    body_color: normalizeColorName(spec.colorName),
    interior_color: normalizeInteriorColorName(
      spec?.customColor?.interiorColorName ||
      spec?.customColor?.interiorColor ||
      spec?.interiorColorName ||
      spec?.interiorColor ||
      spec?.innerColorName ||
      spec?.innerColor ||
      spec?.trimColorName ||
      spec?.trimColor ||
      spec?.seatColorName ||
      spec?.seatColor ||
      '',
      spec.colorName
    ),
    location: locationRaw,
    location_short: extractShortLocation(locationRaw),
    vin: data?.vin || '',
    vehicle_no: data?.vehicleNo || '',
    price_krw: priceKRW,
    price_usd: pricing.price_usd,
    fuel_type: normalizeFuel(spec.fuelName),
    transmission: normalizeTransmission(spec.transmissionName),
    drive_type: driveType,
    body_type: bodyType,
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
    pricing_locked: false,
    delivery_profile_code: fees.delivery_profile_code,
    delivery_profile_label: fees.delivery_profile_label,
    delivery_profile_description: fees.delivery_profile_description,
    commission: fees.commission,
    delivery: fees.delivery,
    loading: fees.loading,
    unloading: fees.unloading,
    storage: fees.storage,
    vat_refund: pricing.vat_refund,
    total: pricing.total,
    exchange_rate_current: pricing.exchange_rate_current,
    exchange_rate_site: pricing.exchange_rate_site,
    exchange_rate_offset: pricing.exchange_rate_offset,
    vat_rate: pricing.vat_rate,
    parking_address_ko: PARKING_ADDRESS_KO,
    parking_address_en: PARKING_ADDRESS_EN,
  }
}

export async function fetchEncarVehicleEnrichment(encarId) {
  const { category, spec, ad } = await fetchEncarVehicleApiData(encarId)

  const modelGroup = normalizeText(category.modelGroupEnglishName || category.modelGroupName || category.modelName || '')
  const gradeName = normalizeText(category.gradeDetailEnglishName || category.gradeDetailName || category.gradeName || '')
  const trimLevel = normalizeTrimLevel(
    category.gradeDetailEnglishName,
    category.gradeDetailName,
    category.gradeName,
    category.gradeEnglishName,
  ) || extractTrimLevelFromTitle(
    category.gradeDetailEnglishName,
    category.gradeDetailName,
    category.gradeName,
    category.gradeEnglishName,
    ad.title,
    ad.subTitle,
  )

  return {
    body_color: normalizeColorName(spec.colorName),
    interior_color: normalizeInteriorColorName(
      spec?.customColor?.interiorColorName ||
      spec?.customColor?.interiorColor ||
      spec?.interiorColorName ||
      spec?.interiorColor ||
      spec?.innerColorName ||
      spec?.innerColor ||
      spec?.trimColorName ||
      spec?.trimColor ||
      spec?.seatColorName ||
      spec?.seatColor ||
      '',
      spec.colorName
    ),
    body_type: resolveBodyType(
      spec.bodyName,
      modelGroup,
      gradeName,
      category.modelGroupEnglishName,
      category.modelGroupName,
      ad.title,
      ad.subTitle,
    ),
    trim_level: trimLevel,
  }
}

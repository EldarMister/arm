import axios from 'axios'
import { fetchEncarInspection } from './encarInspection.js'
import { computePricing, getExchangeRateSnapshot } from './exchangeRate.js'
import { getPricingSettings, resolveVehicleFees } from './pricingSettings.js'
import {
  appendTitleTrimSuffix,
  PARKING_ADDRESS_EN,
  PARKING_ADDRESS_KO,
  extractKeyInfo,
  extractInteriorColorFromPairs,
  extractInteriorColorFromText,
  extractShortLocation,
  extractOptionFeatures,
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
import { resolveEncarOptionTexts } from './encarOptionDictionary.js'

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

const femDetailClient = axios.create({
  baseURL: 'https://fem.encar.com',
  timeout: 20000,
  proxy: false,
  headers: {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    Referer: 'https://www.encar.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  },
})

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function createVehicleDataError(message, meta = {}) {
  const error = new Error(message)
  error.encarDiagnostic = meta
  return error
}

function parsePreloadedState(html) {
  const marker = '__PRELOADED_STATE__ = '
  const start = html.indexOf(marker)
  if (start < 0) return null

  const end = html.indexOf('</script>', start)
  if (end < 0) return null

  const raw = html
    .slice(start + marker.length, end)
    .trim()
    .replace(/;\s*$/, '')

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function extractVehicleDataFromState(state) {
  return (
    state?.carInfo?.car
    || state?.cars?.base
    || state?.saleCar?.car
    || state?.cars?.detailServerDriven?.result
    || null
  )
}

function buildVehicleApiShape(data, source) {
  if (!data || typeof data !== 'object') {
    throw createVehicleDataError('Empty detail payload', {
      reason: source === 'html_preloaded_state' ? 'detail_parse_failed' : 'detail_empty_payload',
      temporary: true,
      retryable: true,
      details: 'detail payload is empty',
    })
  }

  return {
    url: `https://fem.encar.com/cars/detail/${data?.vehicleId || data?.queryCarId || ''}`.replace(/\/$/, ''),
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
    options: data?.options || {},
    source,
  }
}

async function fetchEncarVehicleApiPayload(encarId) {
  const { data } = await apiClient.get(`/v1/readside/vehicle/${encodeURIComponent(encarId)}`)
  return buildVehicleApiShape(data, 'api')
}

async function fetchEncarVehicleHtmlPayload(encarId) {
  const url = `/cars/detail/${encodeURIComponent(encarId)}`
  const response = await femDetailClient.get(url)
  const html = String(response.data || '')

  if (!cleanText(html)) {
    throw createVehicleDataError('Detail HTML is empty', {
      reason: 'detail_empty_html',
      temporary: true,
      retryable: true,
      details: `empty response from https://fem.encar.com${url}`,
    })
  }

  const canonicalMatch = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i)
  const canonicalUrl = cleanText(canonicalMatch?.[1] || '')
  if (/\bindex(?:\.do)?\b/i.test(canonicalUrl)) {
    throw createVehicleDataError('Detail page redirected to index shell', {
      reason: 'detail_index_shell',
      temporary: true,
      retryable: true,
      details: canonicalUrl || 'canonical points to index',
    })
  }

  const state = parsePreloadedState(html)
  if (!state) {
    throw createVehicleDataError('Missing __PRELOADED_STATE__ in detail HTML', {
      reason: 'detail_preloaded_state_missing',
      temporary: true,
      retryable: true,
      details: `missing __PRELOADED_STATE__ for ${encarId}`,
    })
  }

  const data = extractVehicleDataFromState(state)
  if (!data) {
    throw createVehicleDataError('Failed to extract car object from __PRELOADED_STATE__', {
      reason: 'detail_parse_failed',
      temporary: true,
      retryable: true,
      details: 'car object missing in __PRELOADED_STATE__',
    })
  }

  const shaped = buildVehicleApiShape(data, 'html_preloaded_state')
  return {
    ...shaped,
    url: canonicalUrl || `https://fem.encar.com${url}`,
  }
}

async function fetchEncarVehicleApiData(encarId) {
  try {
    return await fetchEncarVehicleApiPayload(encarId)
  } catch (apiError) {
    const status = Number(apiError?.response?.status) || 0
    if (status === 404) throw apiError

    try {
      return await fetchEncarVehicleHtmlPayload(encarId)
    } catch (htmlError) {
      if (htmlError?.encarDiagnostic) {
        apiError.encarDiagnostic = {
          ...htmlError.encarDiagnostic,
          source: 'html_preloaded_state',
          apiFailure: cleanText(apiError.message),
          fallbackFailure: cleanText(htmlError.message),
        }
      } else if (!apiError.encarDiagnostic) {
        apiError.encarDiagnostic = {
          reason: status ? 'detail_fetch_failed' : 'detail_network_error',
          temporary: status !== 404,
          retryable: status !== 404,
          httpStatus: status || null,
          details: cleanText(apiError.message),
          fallbackFailure: cleanText(htmlError.message),
        }
      }
      throw apiError
    }
  }
}

function toAbsolutePhotoUrl(path) {
  if (!path) return null
  if (/^https?:\/\//i.test(path)) return path
  return `https://ci.encar.com${path.startsWith('/') ? '' : '/'}${path}`
}

function extractInteriorColorFromSpec(spec = {}) {
  const customColor = spec?.customColor
  if (customColor && typeof customColor === 'object' && !Array.isArray(customColor)) {
    return (
      customColor.interiorColorName ||
      customColor.interiorColor ||
      customColor.innerColorName ||
      customColor.innerColor ||
      customColor.seatColorName ||
      customColor.seatColor ||
      customColor.trimColorName ||
      customColor.trimColor ||
      ''
    )
  }

  return (
    spec?.interiorColorName ||
    spec?.interiorColor ||
    spec?.innerColorName ||
    spec?.innerColor ||
    spec?.trimColorName ||
    spec?.trimColor ||
    spec?.seatColorName ||
    spec?.seatColor ||
    ''
  )
}

function normalizeWarrantyMetric(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null
}

function buildWarrantyTerm(monthValue, mileageValue) {
  const months = normalizeWarrantyMetric(monthValue)
  const mileage = normalizeWarrantyMetric(mileageValue)
  if (!months && !mileage) return null

  return {
    months,
    mileage,
  }
}

export function extractWarrantyInfo(category = {}) {
  const warranty = category?.warranty
  if (!warranty || typeof warranty !== 'object' || Array.isArray(warranty)) {
    return null
  }

  const body = buildWarrantyTerm(warranty.bodyMonth, warranty.bodyMileage)
  const transmission = buildWarrantyTerm(warranty.transmissionMonth, warranty.transmissionMileage)
  if (!body && !transmission) {
    return null
  }

  return {
    provider: cleanText(warranty.companyName || ''),
    userDefined: Boolean(warranty.userDefined),
    body,
    transmission,
    source: 'category.warranty',
  }
}

function buildInspectionPairs(inspection) {
  if (!inspection) return []

  const basicPairs = Array.isArray(inspection?.basicInfo?.items)
    ? inspection.basicInfo.items.map((item) => ({ label: item?.label, value: item?.value }))
    : []
  const summaryPairs = Array.isArray(inspection?.summary)
    ? inspection.summary.map((row) => ({
        label: row?.label,
        value: [row?.detail, ...(row?.states || []), row?.amount, row?.note].filter(Boolean).join(' '),
      }))
    : []
  const detailPairs = Array.isArray(inspection?.detailStatus)
    ? inspection.detailStatus.map((row) => ({
        label: [row?.section, row?.label].filter(Boolean).join(' / '),
        value: [row?.detail, ...(row?.states || []), row?.amount, row?.note].filter(Boolean).join(' '),
      }))
    : []
  const historyPairs = inspection?.vehicleHistory
    ? [
        ...Object.entries(inspection.vehicleHistory.overview || {}).map(([label, value]) => ({ label, value })),
        ...Object.entries(inspection.vehicleHistory.statistics || {}).map(([label, value]) => ({ label, value })),
      ]
    : []

  return [...basicPairs, ...summaryPairs, ...detailPairs, ...historyPairs]
}

function resolveInteriorColorWithMeta(spec = {}, bodyColor = '', { pairs = [], texts = [] } = {}) {
  const specRawValue = extractInteriorColorFromSpec(spec)
  const specValue = normalizeInteriorColorName(specRawValue, bodyColor, { allowBodyDuplicate: true })
  if (specValue) {
    return {
      value: specValue,
      source: 'spec',
      diagnostics: [{ field: 'interior_color', found: true, strategy: 'spec', rawValue: specRawValue }],
    }
  }

  const pairedValue = extractInteriorColorFromPairs(pairs, bodyColor)
  if (pairedValue) {
    return {
      value: pairedValue,
      source: 'structured-pairs',
      diagnostics: [{ field: 'interior_color', found: true, strategy: 'structured-pairs' }],
    }
  }

  const textValue = extractInteriorColorFromText(texts.filter(Boolean).join(' '), bodyColor)
  if (textValue) {
    return {
      value: textValue,
      source: 'text-fallback',
      diagnostics: [{ field: 'interior_color', found: true, strategy: 'text-fallback' }],
    }
  }

  return {
    value: '',
    source: '',
    diagnostics: [{ field: 'interior_color', found: false, strategy: 'all-fallbacks', reason: 'value_not_found' }],
  }
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
    options,
    source,
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

  if (includeInspection) {
    try {
      inspection = await fetchEncarInspection(encarId, {
        vehicleNo: data?.vehicleNo || '',
        includeHtml: Boolean(ad.diagnosisCar || view.encarDiagnosis) || Array.isArray(condition?.inspection?.formats),
      })
    } catch (inspectionError) {
      console.warn('Encar inspection parse warning:', inspectionError.message)
    }
  }

  const locationRaw = String(contact.address || '').trim()
  const bodyColor = normalizeColorName(spec.colorName)
  const warrantyInfo = extractWarrantyInfo(category)
  const optionTexts = await resolveEncarOptionTexts(options)
  const inspectionTexts = inspection
    ? [
      ...(inspection.summary || []).map((row) => [row?.label, row?.detail, row?.note, ...(row?.states || [])].join(' ')),
      ...(inspection.detailStatus || []).map((row) => [row?.section, row?.label, row?.detail, row?.note, ...(row?.states || [])].join(' ')),
      ...(inspection.repairHistory || []).map((row) => [row?.label, row?.value].join(' ')),
      ...(inspection?.vehicleHistory?.uninsuredPeriods || []).map((item) => [item?.raw, item?.start, item?.end].join(' ')),
      ...(inspection?.vehicleHistory?.ownerChanges || []).map((item) => [item?.index, item?.date].join(' ')),
    ]
    : []
  const inspectionPairs = buildInspectionPairs(inspection)
  const keyInfo = extractKeyInfo({
    contentsText: contents.text,
    inspectionRows: inspection?.detailStatus || [],
  })
  const optionFeatures = extractOptionFeatures({
    contentsText: contents.text,
    memoText: ad.memo,
    titleText: ad.title,
    subtitleText: ad.subTitle,
    oneLineText: ad.oneLineText,
    optionTexts,
    inspectionRows: inspection?.detailStatus || [],
  })
  const interiorColorResult = resolveInteriorColorWithMeta(spec, bodyColor, {
    pairs: inspectionPairs,
    texts: [
      ad.memo,
      contents.text,
      ad.title,
      ad.subTitle,
      ad.oneLineText,
      category.gradeName,
      category.gradeEnglishName,
      category.gradeDetailName,
      category.gradeDetailEnglishName,
      typeof spec?.customColor === 'string' ? spec.customColor : '',
      optionTexts.join(' '),
      ...inspectionTexts,
    ],
  })

  return {
    encar_id: String(encarId),
    vehicle_id: data?.vehicleId || null,
    encar_url: url,
    name: name || `Encar ${encarId}`,
    model,
    year,
    mileage: Number(spec.mileage) || 0,
    body_color: bodyColor,
    interior_color: interiorColorResult.value,
    interior_color_source: interiorColorResult.source,
    interior_color_diagnostics: interiorColorResult.diagnostics,
    warranty: warrantyInfo,
    warranty_company: warrantyInfo?.provider || '',
    warranty_body_months: warrantyInfo?.body?.months || null,
    warranty_body_km: warrantyInfo?.body?.mileage || null,
    warranty_transmission_months: warrantyInfo?.transmission?.months || null,
    warranty_transmission_km: warrantyInfo?.transmission?.mileage || null,
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
    option_features: optionFeatures,
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
    source,
  }
}

export async function fetchEncarVehicleEnrichment(encarId) {
  const { data, category, spec, ad, contact, contents, options, source } = await fetchEncarVehicleApiData(encarId)
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

  const bodyColor = normalizeColorName(spec.colorName)
  const warrantyInfo = extractWarrantyInfo(category)
  const optionTexts = await resolveEncarOptionTexts(options)
  const optionFeatures = extractOptionFeatures({
    contentsText: contents?.text,
    memoText: ad.memo,
    titleText: ad.title,
    subtitleText: ad.subTitle,
    oneLineText: ad.oneLineText,
    optionTexts,
  })
  const interiorColorResult = resolveInteriorColorWithMeta(spec, bodyColor, {
    texts: [
      ad.memo,
      contents.text,
      ad.title,
      ad.subTitle,
      ad.oneLineText,
      category.gradeName,
      category.gradeEnglishName,
      category.gradeDetailName,
      category.gradeDetailEnglishName,
      typeof spec?.customColor === 'string' ? spec.customColor : '',
      optionTexts.join(' '),
    ],
  })

  return {
    name,
    model,
    location: String(contact.address || '').trim(),
    vin: data?.vin || '',
    vehicle_no: data?.vehicleNo || '',
    price_krw: (Number(ad.price) || 0) * 10000,
    fuel_type: normalizeFuel(spec.fuelName),
    transmission: normalizeTransmission(spec.transmissionName),
    drive_type: inferDrive(driveRaw, name, model),
    body_color: bodyColor,
    interior_color: interiorColorResult.value,
    interior_color_source: interiorColorResult.source,
    warranty: warrantyInfo,
    warranty_company: warrantyInfo?.provider || '',
    warranty_body_months: warrantyInfo?.body?.months || null,
    warranty_body_km: warrantyInfo?.body?.mileage || null,
    warranty_transmission_months: warrantyInfo?.transmission?.months || null,
    warranty_transmission_km: warrantyInfo?.transmission?.mileage || null,
    option_features: optionFeatures,
    image_urls: Array.isArray(data?.photos)
      ? data.photos
        .map((photo) => toAbsolutePhotoUrl(photo?.path || photo?.location || photo?.url))
        .filter(Boolean)
      : [],
    body_type: resolveBodyType(
      spec.bodyName,
      name,
      model,
      category.modelGroupEnglishName,
      category.modelGroupName,
      ad.title,
      ad.subTitle,
    ),
    trim_level: trimLevel,
    vehicle_id: data?.vehicleId || data?.id || null,
    encar_url: `https://fem.encar.com/cars/detail/${encarId}`,
    source,
  }
}

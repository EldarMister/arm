import { repairTextEncoding } from '../lib/textEncoding.js'

function cleanText(value) {
  return repairTextEncoding(String(value || '')).replace(/\s+/g, ' ').trim()
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const REASON_DEFINITIONS = Object.freeze({
  filtered_generic_vehicle: {
    label: 'Отфильтровано как служебный или нецелевой транспорт',
    classification: 'normal',
    temporary: false,
    retryable: false,
  },
  filtered_year: {
    label: 'Отфильтровано по году выпуска',
    classification: 'normal',
    temporary: false,
    retryable: false,
  },
  filtered_price: {
    label: 'Отфильтровано по цене',
    classification: 'normal',
    temporary: false,
    retryable: false,
  },
  parse_scope_filtered: {
    label: 'Отфильтровано режимом парсинга',
    classification: 'normal',
    temporary: false,
    retryable: false,
  },
  filtered_lead_engagement: {
    label: 'Filtered by lead engagement rules',
    classification: 'normal',
    temporary: false,
    retryable: false,
  },
  duplicate_encar_id: {
    label: 'Уже есть в базе по Encar ID',
    classification: 'normal',
    temporary: false,
    retryable: false,
  },
  duplicate_vin: {
    label: 'Уже есть в базе по VIN',
    classification: 'normal',
    temporary: false,
    retryable: false,
  },
  detail_not_found: {
    label: 'Карточка недоступна или удалена',
    classification: 'normal',
    temporary: false,
    retryable: false,
  },
  detail_timeout: {
    label: 'Таймаут detail/API',
    classification: 'problem',
    temporary: true,
    retryable: true,
  },
  detail_network_error: {
    label: 'Сетевая ошибка detail/API',
    classification: 'problem',
    temporary: true,
    retryable: true,
  },
  detail_rate_limited: {
    label: 'Rate limit или anti-bot',
    classification: 'problem',
    temporary: true,
    retryable: true,
  },
  detail_http_403: {
    label: '403 или anti-bot блокировка',
    classification: 'problem',
    temporary: true,
    retryable: true,
  },
  detail_http_407: {
    label: '407 proxy/auth challenge на маршруте Encar',
    classification: 'problem',
    temporary: true,
    retryable: true,
  },
  detail_http_5xx: {
    label: 'Ошибка upstream 5xx',
    classification: 'problem',
    temporary: true,
    retryable: true,
  },
  detail_empty_payload: {
    label: 'Пустой ответ API',
    classification: 'problem',
    temporary: true,
    retryable: true,
  },
  detail_empty_html: {
    label: 'Пустой HTML карточки',
    classification: 'problem',
    temporary: true,
    retryable: true,
  },
  detail_index_shell: {
    label: 'Получен index shell вместо карточки',
    classification: 'problem',
    temporary: true,
    retryable: true,
  },
  detail_preloaded_state_missing: {
    label: 'Не найден __PRELOADED_STATE__',
    classification: 'problem',
    temporary: true,
    retryable: true,
  },
  detail_parse_failed: {
    label: 'Не удалось распарсить detail',
    classification: 'problem',
    temporary: true,
    retryable: true,
  },
  detail_fetch_failed: {
    label: 'Не удалось получить detail',
    classification: 'problem',
    temporary: true,
    retryable: true,
  },
  db_duplicate_race: {
    label: 'Дубликат при сохранении',
    classification: 'normal',
    temporary: false,
    retryable: false,
  },
  db_insert_error: {
    label: 'Ошибка сохранения в базу',
    classification: 'problem',
    temporary: false,
    retryable: false,
  },
  photo_partial_failure: {
    label: 'Часть фото не скачалась',
    classification: 'problem',
    temporary: true,
    retryable: true,
  },
  photo_all_failed: {
    label: 'Фото не скачались',
    classification: 'problem',
    temporary: true,
    retryable: true,
  },
})

export function getReasonDefinition(reason) {
  return REASON_DEFINITIONS[reason] || {
    label: cleanText(reason) || 'Неизвестная причина',
    classification: 'problem',
    temporary: false,
    retryable: false,
  }
}

export function getHttpStatus(error) {
  return Number(error?.response?.status) || 0
}

export function isTimeoutError(error) {
  const code = cleanText(error?.code).toUpperCase()
  const message = cleanText(error?.message).toLowerCase()
  return code === 'ECONNABORTED' || message.includes('timeout')
}

export function isNetworkError(error) {
  if (getHttpStatus(error)) return false
  const code = cleanText(error?.code).toUpperCase()
  return [
    'ECONNRESET',
    'ECONNREFUSED',
    'EAI_AGAIN',
    'ENOTFOUND',
    'ECONNABORTED',
    'ETIMEDOUT',
    'ERR_NETWORK',
    'ERR_SOCKET_CONNECTION_TIMEOUT',
  ].includes(code)
}

export function classifyDetailError(error, fallbackReason = 'detail_fetch_failed') {
  const status = getHttpStatus(error)

  if (error?.encarDiagnostic?.reason) {
    const base = getReasonDefinition(error.encarDiagnostic.reason)
    return {
      reason: error.encarDiagnostic.reason,
      classification: base.classification,
      temporary: error.encarDiagnostic.temporary ?? base.temporary,
      retryable: error.encarDiagnostic.retryable ?? base.retryable,
      details: error.encarDiagnostic.details || cleanText(error?.message),
      httpStatus: error.encarDiagnostic.httpStatus || status || null,
    }
  }

  if (status === 404) {
    return {
      reason: 'detail_not_found',
      classification: 'normal',
      temporary: false,
      retryable: false,
      details: cleanText(error?.message) || '404 Not Found',
      httpStatus: 404,
    }
  }

  if (status === 429) {
    return {
      reason: 'detail_rate_limited',
      classification: 'problem',
      temporary: true,
      retryable: true,
      details: cleanText(error?.message) || '429 Too Many Requests',
      httpStatus: 429,
    }
  }

  if (status === 403) {
    return {
      reason: 'detail_http_403',
      classification: 'problem',
      temporary: true,
      retryable: true,
      details: cleanText(error?.message) || '403 Forbidden',
      httpStatus: 403,
    }
  }

  if (status === 407) {
    return {
      reason: 'detail_http_407',
      classification: 'problem',
      temporary: true,
      retryable: true,
      details: cleanText(error?.message) || '407 Proxy Authentication Required',
      httpStatus: 407,
    }
  }

  if (status >= 500) {
    return {
      reason: 'detail_http_5xx',
      classification: 'problem',
      temporary: true,
      retryable: true,
      details: cleanText(error?.message) || `HTTP ${status}`,
      httpStatus: status,
    }
  }

  if (isTimeoutError(error)) {
    return {
      reason: 'detail_timeout',
      classification: 'problem',
      temporary: true,
      retryable: true,
      details: cleanText(error?.message) || 'Timeout',
      httpStatus: status || null,
    }
  }

  if (isNetworkError(error)) {
    return {
      reason: 'detail_network_error',
      classification: 'problem',
      temporary: true,
      retryable: true,
      details: cleanText(error?.message) || 'Network error',
      httpStatus: null,
    }
  }

  const base = getReasonDefinition(fallbackReason)
  return {
    reason: fallbackReason,
    classification: base.classification,
    temporary: base.temporary,
    retryable: base.retryable,
    details: cleanText(error?.message) || fallbackReason,
    httpStatus: status || null,
  }
}

export function buildCarDiagnostic({
  car = {},
  raw = {},
  stage,
  reason,
  details = '',
  retryable,
  temporary,
  attempts = 1,
  httpStatus = null,
  technical = {},
}) {
  const meta = getReasonDefinition(reason)
  return {
    stage: cleanText(stage),
    reason,
    label: meta.label,
    classification: meta.classification,
    retryable: retryable ?? meta.retryable,
    temporary: temporary ?? meta.temporary,
    permanent: !(temporary ?? meta.temporary),
    attempts: Number(attempts) || 1,
    httpStatus: httpStatus || null,
    carId: cleanText(raw?.Id || car?.encar_id || ''),
    vehicleId: cleanText(car?.vehicle_id || raw?.vehicleId || ''),
    vehicleNo: cleanText(car?.vehicle_no || ''),
    url: cleanText(car?.encar_url || raw?.Url || raw?.url || ''),
    details: cleanText(details),
    technical,
  }
}

function getPrefixLabel(prefix) {
  switch (prefix) {
    case 'SKIP':
      return 'ПРОПУСК'
    case 'FAIL':
      return 'ОШИБКА'
    case 'PARTIAL_IMPORT':
      return 'ЧАСТИЧНЫЙ ИМПОРТ'
    case 'PHOTO_WARN':
      return 'ПРОБЛЕМА С ФОТО'
    default:
      return cleanText(prefix) || 'СОБЫТИЕ'
  }
}

export function formatDiagnosticMessage(prefix, diagnostic) {
  const bits = [
    getPrefixLabel(prefix),
    diagnostic.stage ? `этап=${diagnostic.stage}` : '',
    diagnostic.label ? `причина=${diagnostic.label}` : '',
    diagnostic.reason ? `код=${diagnostic.reason}` : '',
    diagnostic.carId ? `carId=${diagnostic.carId}` : '',
    diagnostic.vehicleId ? `vehicleId=${diagnostic.vehicleId}` : '',
    diagnostic.vehicleNo ? `vehicleNo=${diagnostic.vehicleNo}` : '',
    diagnostic.retryable ? 'повтор=да' : 'повтор=нет',
    diagnostic.temporary ? 'временная=да' : 'временная=нет',
  ].filter(Boolean)

  if (diagnostic.url) bits.push(`url=${diagnostic.url}`)
  if (diagnostic.httpStatus) bits.push(`http=${diagnostic.httpStatus}`)
  if (diagnostic.details) bits.push(`детали=${diagnostic.details}`)

  return bits.join(' | ')
}

export async function retryOperation(fn, {
  maxAttempts = 3,
  baseDelayMs = 1200,
  factor = 2,
  maxDelayMs = 10000,
  classifyError = classifyDetailError,
  onRetry = null,
} = {}) {
  let lastError = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const value = await fn(attempt)
      return {
        value,
        attempts: attempt,
        recovered: attempt > 1,
      }
    } catch (error) {
      const classification = classifyError(error)
      lastError = error
      lastError.retryMeta = {
        attempts: attempt,
        classification,
        maxAttempts,
      }

      if (!classification.retryable || attempt >= maxAttempts) {
        throw lastError
      }

      const backoff = Math.min(baseDelayMs * (factor ** (attempt - 1)), maxDelayMs)
      const delayMs = Math.round(backoff + Math.random() * 250)

      if (typeof onRetry === 'function') {
        await onRetry({
          attempt,
          nextAttempt: attempt + 1,
          maxAttempts,
          delayMs,
          classification,
          error,
        })
      }

      await sleep(delayMs)
    }
  }

  throw lastError
}

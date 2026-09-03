import { ERROR_SCHEDULE_CONTEXT, UNKNOWN_SCHEDULE_CONTEXT, normalizeContext } from '../../utils/order/orderSchedule'

const normalizeScheduleLocation = (location) => (location == null ? '' : String(location).trim())

const hasValidScheduleLocation = (location) => normalizeScheduleLocation(location).length > 0

const createScheduleValidationError = () => new Error('No se pudo validar el horario de pedidos.')
const DEFAULT_SCHEDULE_REQUEST_TIMEOUT_MS = 8000

const withTimeout = (promise, timeoutMs = DEFAULT_SCHEDULE_REQUEST_TIMEOUT_MS) => {
  let timeoutId
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(createScheduleValidationError()), timeoutMs)
  })
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId)
  })
}

const createOrderScheduleRequestController = ({
  fetchScheduleContext,
  onStart,
  onSuccess,
  onError,
  onUnknown,
  timeoutMs = DEFAULT_SCHEDULE_REQUEST_TIMEOUT_MS
} = {}) => {
  let requestId = 0
  let activeLocation = ''

  const invalidate = () => {
    requestId += 1
  }

  const load = async ({ location, at = null } = {}) => {
    const locationKey = normalizeScheduleLocation(location)
    activeLocation = locationKey
    invalidate()
    const currentRequestId = requestId

    if (!locationKey) {
      onUnknown?.({ locationKey, context: UNKNOWN_SCHEDULE_CONTEXT })
      return { status: 'unknown', context: UNKNOWN_SCHEDULE_CONTEXT, locationKey }
    }

    onStart?.({ locationKey })

    let result
    try {
      result = await withTimeout(fetchScheduleContext({ location: locationKey, at }), timeoutMs)
    } catch (fetchError) {
      result = { data: null, error: fetchError }
    }

    if (currentRequestId !== requestId || activeLocation !== locationKey) {
      return { status: 'stale', locationKey }
    }

    if (result?.error || !result?.data) {
      const error = result?.error || createScheduleValidationError()
      onError?.({ locationKey, error, context: ERROR_SCHEDULE_CONTEXT })
      return { status: 'error', error, context: ERROR_SCHEDULE_CONTEXT, locationKey }
    }

    const context = normalizeContext(result.data)
    onSuccess?.({ locationKey, context })
    return { status: 'success', context, locationKey }
  }

  return { invalidate, load }
}

export {
  DEFAULT_SCHEDULE_REQUEST_TIMEOUT_MS,
  createOrderScheduleRequestController,
  hasValidScheduleLocation,
  normalizeScheduleLocation
}

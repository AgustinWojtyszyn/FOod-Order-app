import { ERROR_SCHEDULE_CONTEXT, UNKNOWN_SCHEDULE_CONTEXT, normalizeContext } from '../../utils/order/orderSchedule'

const normalizeScheduleLocation = (location) => (location == null ? '' : String(location).trim())

const hasValidScheduleLocation = (location) => normalizeScheduleLocation(location).length > 0

const createScheduleValidationError = () => new Error('No se pudo validar el horario de pedidos.')

const createOrderScheduleRequestController = ({
  fetchScheduleContext,
  onStart,
  onSuccess,
  onError,
  onUnknown
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
      result = await fetchScheduleContext({ location: locationKey, at })
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
  createOrderScheduleRequestController,
  hasValidScheduleLocation,
  normalizeScheduleLocation
}

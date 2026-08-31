import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../../supabaseClient'
import { UNKNOWN_SCHEDULE_CONTEXT, getDevScheduleAt, getScheduleCountdown } from '../../utils/order/orderSchedule'
import { createOrderScheduleRequestController, normalizeScheduleLocation } from './orderScheduleRequest'

const MINUTE_MS = 60 * 1000
const TRANSITION_REFRESH_DELAY_MS = 300

export const useOrderSchedule = ({ location = '', at = null } = {}) => {
  const [context, setContext] = useState(UNKNOWN_SCHEDULE_CONTEXT)
  const [contextLocation, setContextLocation] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const timeoutRef = useRef(null)
  const intervalRef = useRef(null)
  const requestControllerRef = useRef(null)

  const effectiveAt = at || getDevScheduleAt()
  const locationKey = normalizeScheduleLocation(location)

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (intervalRef.current) clearInterval(intervalRef.current)
    timeoutRef.current = null
    intervalRef.current = null
  }, [])

  if (!requestControllerRef.current) {
    requestControllerRef.current = createOrderScheduleRequestController({
      fetchScheduleContext: ({ location: requestLocation, at: requestAt }) => db.getOrderScheduleContext({
        location: requestLocation,
        at: requestAt
      }),
      onStart: ({ locationKey: requestLocation }) => {
        setLoading(true)
        setError(null)
        setContextLocation(requestLocation)
      },
      onSuccess: ({ locationKey: requestLocation, context: nextContext }) => {
        setError(null)
        setContext(nextContext)
        setContextLocation(requestLocation)
        setLoading(false)
      },
      onError: ({ locationKey: requestLocation, error: scheduleError, context: nextContext }) => {
        setError(scheduleError)
        setContext(nextContext)
        setContextLocation(requestLocation)
        setLoading(false)
      },
      onUnknown: () => {
        setError(null)
        setContext(UNKNOWN_SCHEDULE_CONTEXT)
        setContextLocation('')
        setLoading(true)
      }
    })
  }

  const refresh = useCallback(async () => {
    await requestControllerRef.current.load({
      location: locationKey,
      at: effectiveAt
    })
  }, [effectiveAt, locationKey])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (cancelled) return
      await refresh()
    }

    clearTimers()
    requestControllerRef.current.invalidate()
    setContext(UNKNOWN_SCHEDULE_CONTEXT)
    setContextLocation('')
    setError(null)
    setLoading(true)

    if (!locationKey) {
      return () => {
        cancelled = true
        requestControllerRef.current.invalidate()
        clearTimers()
      }
    }

    run()
    intervalRef.current = setInterval(run, MINUTE_MS)
    return () => {
      cancelled = true
      requestControllerRef.current.invalidate()
      clearTimers()
    }
  }, [clearTimers, locationKey, refresh])

  useEffect(() => {
    if (!context.nextTransitionAt || effectiveAt) return
    const transitionAt = new Date(context.nextTransitionAt).getTime()
    if (!Number.isFinite(transitionAt)) return
    const delay = Math.max(transitionAt - Date.now() + TRANSITION_REFRESH_DELAY_MS, TRANSITION_REFRESH_DELAY_MS)
    timeoutRef.current = setTimeout(refresh, delay)
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [context.nextTransitionAt, effectiveAt, refresh])

  const visibleContext = contextLocation === locationKey ? context : UNKNOWN_SCHEDULE_CONTEXT
  const visibleLoading = !locationKey || loading || contextLocation !== locationKey
  const visibleError = contextLocation === locationKey ? error : null
  const countdown = useMemo(() => getScheduleCountdown(visibleContext), [visibleContext])

  return {
    ...visibleContext,
    ...countdown,
    loading: visibleLoading,
    error: visibleError,
    refresh,
    context: visibleContext
  }
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../../supabaseClient'
import { DEFAULT_SCHEDULE_CONTEXT, getDevScheduleAt, getScheduleCountdown, normalizeContext } from '../../utils/order/orderSchedule'

const MINUTE_MS = 60 * 1000
const TRANSITION_REFRESH_DELAY_MS = 300

export const useOrderSchedule = ({ location = '', at = null } = {}) => {
  const [context, setContext] = useState(DEFAULT_SCHEDULE_CONTEXT)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const timeoutRef = useRef(null)
  const intervalRef = useRef(null)

  const effectiveAt = at || getDevScheduleAt()

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (intervalRef.current) clearInterval(intervalRef.current)
    timeoutRef.current = null
    intervalRef.current = null
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error: scheduleError } = await db.getOrderScheduleContext({
      location,
      at: effectiveAt
    })
    if (scheduleError) {
      setError(scheduleError)
      setContext(DEFAULT_SCHEDULE_CONTEXT)
      setLoading(false)
      return
    }
    setError(null)
    setContext(normalizeContext(data || DEFAULT_SCHEDULE_CONTEXT))
    setLoading(false)
  }, [effectiveAt, location])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (cancelled) return
      await refresh()
    }

    clearTimers()
    run()
    intervalRef.current = setInterval(run, MINUTE_MS)
    return () => {
      cancelled = true
      clearTimers()
    }
  }, [clearTimers, refresh])

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

  const countdown = useMemo(() => getScheduleCountdown(context), [context])

  return {
    ...context,
    ...countdown,
    loading,
    error,
    refresh,
    context
  }
}

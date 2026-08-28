const DEFAULT_SCHEDULE_CONTEXT = {
  flow: 'standard',
  timezone: 'America/Argentina/San_Juan',
  opensAt: '06:00',
  closesAt: '14:00',
  isOpen: false,
  state: 'before_open',
  nextTransitionAt: null
}

const normalizeContext = (context = {}) => ({
  flow: context.flow || DEFAULT_SCHEDULE_CONTEXT.flow,
  timezone: context.timezone || DEFAULT_SCHEDULE_CONTEXT.timezone,
  opensAt: context.opensAt || context.opens_at || DEFAULT_SCHEDULE_CONTEXT.opensAt,
  closesAt: context.closesAt || context.closes_at || DEFAULT_SCHEDULE_CONTEXT.closesAt,
  isOpen: Boolean(context.isOpen ?? context.is_open),
  state: context.state || DEFAULT_SCHEDULE_CONTEXT.state,
  nextTransitionAt: context.nextTransitionAt || context.next_transition_at || null
})

const formatScheduleRange = (context = {}) => {
  const schedule = normalizeContext(context)
  return `${schedule.opensAt}-${schedule.closesAt}`
}

const formatDuration = (ms = 0) => {
  const totalMinutes = Math.max(Math.ceil(Number(ms || 0) / 60000), 0)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0 && minutes > 0) return `${hours} h ${minutes} min`
  if (hours > 0) return `${hours} h`
  return `${minutes} min`
}

const getScheduleCountdown = (context = {}, now = new Date()) => {
  const schedule = normalizeContext(context)
  const transition = schedule.nextTransitionAt ? new Date(schedule.nextTransitionAt) : null
  const remainingMs = transition && Number.isFinite(transition.getTime())
    ? transition.getTime() - now.getTime()
    : 0
  const countdownValue = formatDuration(remainingMs)
  const countdownLabel = schedule.isOpen ? 'Cierra en' : 'Abre en'
  let tone = 'normal'

  if (schedule.isOpen) {
    if (remainingMs <= 15 * 60 * 1000) tone = 'urgent'
    else if (remainingMs < 60 * 60 * 1000) tone = 'warn'
  }

  return {
    countdownLabel,
    countdownValue,
    countdownTone: tone,
    statusLabel: schedule.isOpen ? 'Pedidos habilitados' : 'Pedidos cerrados',
    scheduleRange: formatScheduleRange(schedule)
  }
}

const getDevScheduleAt = () => {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null
  const value = new URLSearchParams(window.location.search).get('orderScheduleAt')
  return value ? String(value) : null
}

export {
  DEFAULT_SCHEDULE_CONTEXT,
  formatDuration,
  formatScheduleRange,
  getDevScheduleAt,
  getScheduleCountdown,
  normalizeContext
}

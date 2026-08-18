import { LOCATION_BADGE_COLOR, STATUS_COLORS, STATUS_LABELS } from './dailyOrderConstants'

export const normalizeDishName = (dishName) => {
  if (!dishName) return dishName
  return dishName.replace(/Menú Principal/gi, 'Plato Principal')
}

export const getTomorrowDate = () => {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return tomorrow.toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

export const formatDeliveryDateLabel = (value) => {
  if (!value) return 'Sin fecha de entrega'
  const raw = String(value).slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-').map(Number)
    return new Intl.DateTimeFormat('es-AR', {
      timeZone: 'UTC',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(new Date(Date.UTC(year, month - 1, day, 12, 0, 0)))
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? 'Sin fecha de entrega'
    : parsed.toLocaleDateString('es-AR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
}

export const formatTime = (dateString) => {
  return new Date(dateString).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

export const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export const getStatusColor = (status) => {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'archived') return STATUS_COLORS.archived
  if (normalized === 'pending') return STATUS_COLORS.pending
  if (normalized === 'post_report_extra') return STATUS_COLORS.post_report_extra
  if (normalized === 'cancelled') return STATUS_COLORS.cancelled
  return STATUS_COLORS.unknown
}

export const getStatusText = (status) => {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'archived') return STATUS_LABELS.archived
  if (normalized === 'pending') return STATUS_LABELS.pending
  if (normalized === 'post_report_extra') return STATUS_LABELS.post_report_extra
  if (normalized === 'cancelled') return STATUS_LABELS.cancelled
  return STATUS_LABELS.unknown
}

export const getLocationBadgeColor = () => LOCATION_BADGE_COLOR

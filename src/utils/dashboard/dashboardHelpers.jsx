import { Moon, Sun } from 'lucide-react'

const ensureArray = (value) => {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

// Helper para detectar guarnición principal desde custom_responses
const getCustomSideFromResponses = (responses = []) => {
  const list = ensureArray(responses)
  if (list.length === 0) return null
  for (const r of list) {
    const title = r?.title?.toLowerCase() || ''
    if (title.includes('guarn')) {
      return r?.answer ?? r?.response ?? null
    }
  }
  return null
}

// Resumen legible de items del pedido (similar a DailyOrders)
const summarizeOrderItems = (items = []) => {
  const itemsList = ensureArray(items)
  if (itemsList.length === 0) {
    return { principalCount: 0, principal: [], principalRemaining: 0, others: [], remaining: 0, title: '' }
  }

  const principalRaw = itemsList.filter(
    item => item && item.name && item.name.toLowerCase().includes('menú principal')
  )
  const principal = principalRaw.map(item => ({ name: item.name, qty: item.quantity || 1 }))
  const others = itemsList
    .filter(item => item && item.name && !item.name.toLowerCase().includes('menú principal'))
    .map(item => ({ name: item.name, qty: item.quantity || 1 }))

  const principalCount = principal.reduce((sum, item) => sum + (item.qty || 1), 0)
  const displayedPrincipal = principal.slice(0, 2)
  const principalRemaining = Math.max(principal.length - displayedPrincipal.length, 0)
  const displayedOthers = others.slice(0, 3)
  const remaining = Math.max(others.length - displayedOthers.length, 0)

  const titleParts = []
  titleParts.push(...principal.map(p => `${p.name} (x${p.qty})`))
  titleParts.push(...others.map(o => `${o.name} (x${o.qty})`))

  return {
    principalCount,
    principal: displayedPrincipal,
    principalRemaining,
    others: displayedOthers,
    remaining,
    title: titleParts.join('; ')
  }
}

const serviceBadge = (service = 'lunch') => {
  const normalized = (service || 'lunch').toLowerCase()
  const isDinner = normalized === 'dinner'
  const label = isDinner ? 'Cena' : 'Almuerzo'
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-[3px] text-[11px] font-semibold rounded-full border ${
        isDinner
          ? 'bg-amber-100 text-amber-800 border-amber-200'
          : 'bg-sky-100 text-sky-800 border-sky-200'
      }`}
      title={`Servicio: ${label}`}
    >
      {isDinner ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
      {label}
    </span>
  )
}

const parseDeliveryDate = (value) => {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day)
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const getStartOfWeek = (date) => {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const day = start.getDay()
  const diff = day === 0 ? -6 : 1 - day
  start.setDate(start.getDate() + diff)
  return start
}

const formatWeeklyDate = (value) => {
  const date = parseDeliveryDate(value)
  if (!date) return 'Fecha sin definir'
  const weekday = date.toLocaleDateString('es-ES', { weekday: 'long' })
  return weekday.charAt(0).toUpperCase() + weekday.slice(1)
}

const getServiceLabel = (service = 'lunch') => {
  return (service || 'lunch').toLowerCase() === 'dinner' ? 'Cena' : 'Almuerzo'
}

const normalizeOrderStatus = (status) => {
  if (typeof status !== 'string') return ''
  return status.trim().toLowerCase()
}

const getStatusLabel = (status = 'pending') => {
  const normalized = normalizeOrderStatus(status)
  if (normalized === 'archived') return 'Archivado'
  if (normalized === 'pending') return 'Pendiente'
  if (normalized === 'post_report_extra') return 'EXTRA POSTERIOR AL REPORTE'
  if (normalized === 'cancelled') return 'Cancelado'
  return 'Estado desconocido'
}

const getStatusBadgeClass = (status = 'pending') => {
  const normalized = normalizeOrderStatus(status)
  if (normalized === 'archived') return 'bg-green-100 text-green-800 border border-green-300'
  if (normalized === 'pending') return 'bg-yellow-100 text-yellow-800 border border-yellow-300'
  if (normalized === 'post_report_extra') return 'bg-fuchsia-100 text-fuchsia-900 border border-fuchsia-300'
  if (normalized === 'cancelled') return 'bg-red-100 text-red-800 border border-red-300'
  return 'bg-slate-100 text-slate-700 border border-slate-300'
}

const getMainMenuLabel = (order) => {
  const items = ensureArray(order?.items)
  const mainItem = items.find((item) => {
    const name = (item?.name || '').toLowerCase()
    return name.includes('menú principal') || name.includes('menu principal') || name.includes('plato principal')
  })

  if (mainItem) {
    return (mainItem.description || mainItem.name || '').trim() || 'Menú no disponible'
  }

  const summary = summarizeOrderItems(items)
  return summary.principal[0]?.name || summary.others[0]?.name || 'Menú no disponible'
}

const formatHeaderStatus = (status = 'pending') => {
  return getStatusLabel(status)
}

const buildItemsSummary = (items) => {
  const list = ensureArray(items)
  if (list.length === 0) return 'Sin items'
  const displayItems = list.slice(0, 4).map((item) => {
    const name = item?.name || 'Item'
    const qty = item?.quantity || 1
    return `${name} x${qty}`
  })
  const remaining = list.length - displayItems.length
  return remaining > 0 ? `${displayItems.join(', ')}, +${remaining} más` : displayItems.join(', ')
}

const formatOrderDate = (dateString) => {
  return new Date(dateString).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export {
  ensureArray,
  getCustomSideFromResponses,
  summarizeOrderItems,
  serviceBadge,
  parseDeliveryDate,
  getStartOfWeek,
  formatWeeklyDate,
  getServiceLabel,
  getStatusLabel,
  getStatusBadgeClass,
  getMainMenuLabel,
  formatHeaderStatus,
  buildItemsSummary,
  formatOrderDate
}

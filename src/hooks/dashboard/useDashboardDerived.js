import { buildItemsSummary, formatHeaderStatus, getStartOfWeek, parseDeliveryDate } from '../../utils/dashboard/dashboardHelpers.jsx'

const isVisibleDashboardOrder = (order = {}) =>
  String(order?.displayStatus || order?.status || '').toLowerCase() !== 'cancelled'

export const useDashboardDerived = ({ orders } = {}) => {
  const startOfWeek = getStartOfWeek(new Date())
  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(endOfWeek.getDate() + 7)

  const visibleOrders = (Array.isArray(orders) ? orders : []).filter(isVisibleDashboardOrder)

  const weeklyOrders = visibleOrders
    .filter((order) => {
      const deliveryDate = parseDeliveryDate(order.delivery_date)
      return deliveryDate && deliveryDate >= startOfWeek && deliveryDate < endOfWeek
    })
    .sort((a, b) => parseDeliveryDate(b.delivery_date) - parseDeliveryDate(a.delivery_date))

  const sortedOrders = [...visibleOrders].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  )

  const pendingOrder = sortedOrders.find((order) => (order.displayStatus || order.status) === 'pending')

  const headerOrder = pendingOrder || null
  const headerStatus = headerOrder ? formatHeaderStatus(headerOrder.displayStatus || headerOrder.status) : 'Sin pedido'
  const headerSummary = headerOrder ? buildItemsSummary(headerOrder.items) : 'Sin pedido activo'

  const deliveryText = (() => {
    if (!headerOrder?.delivery_date) return 'Fecha de entrega sin definir'
    const timeZone = 'America/Argentina/Buenos_Aires'
    const now = new Date()
    const nowLocal = new Date(now.toLocaleString('en-US', { timeZone }))
    const today = new Date(nowLocal)
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const deliveryDate = new Date(headerOrder.delivery_date)
    deliveryDate.setHours(0, 0, 0, 0)

    if (deliveryDate.getTime() === today.getTime()) {
      return nowLocal.getHours() < 12 ? 'Se entrega mañana' : 'Se entrega hoy'
    }
    if (deliveryDate.getTime() === tomorrow.getTime()) {
      return 'Se entrega mañana'
    }
    return new Date(headerOrder.delivery_date).toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  })()

  const isDeliveringTomorrow = deliveryText === 'Se entrega mañana'

  return {
    weeklyOrders,
    headerOrder,
    headerStatus,
    headerSummary,
    deliveryText,
    isDeliveringTomorrow
  }
}

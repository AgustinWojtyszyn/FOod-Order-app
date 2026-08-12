const OrderHistorySection = ({
  orders,
  formatDate,
  summarizeOrderItems,
  getCustomSideFromResponses,
  serviceBadge,
  getStatusLabel,
  getStatusBadgeClass
}) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const pastOrders = (Array.isArray(orders) ? orders : []).filter(order => {
    if (String(order?.displayStatus || order?.status || '').toLowerCase() === 'cancelled') return false
    const orderDate = new Date(order.created_at)
    orderDate.setHours(0, 0, 0, 0)
    return orderDate.getTime() < today.getTime()
  })

  if (pastOrders.length === 0) return null

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 sm:px-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
          Historial de pedidos (días anteriores)
        </h2>
        <span className="text-sm text-gray-600 font-semibold">
          {pastOrders.length} pedido(s)
        </span>
      </div>

      <div className="space-y-3">
        {pastOrders.slice(0, 20).map(order => {
          const summary = summarizeOrderItems(order.items)
          const customSide = getCustomSideFromResponses(order.custom_responses)
          const service = (order.service || 'lunch').toLowerCase()
          return (
            <div
              key={order.id}
              className="flex flex-col gap-2 rounded-xl border border-slate-200 px-3 py-3 sm:px-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900 text-sm sm:text-base truncate">
                      Pedido #{order.id.slice(-8)}
                    </p>
                    {serviceBadge(service)}
                  </div>
                  <p className="text-xs sm:text-sm text-gray-600 truncate flex items-center gap-2">
                    {order.location} • {formatDate(order.created_at)} • {service === 'dinner' ? 'Cena' : 'Almuerzo'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex px-2 sm:px-3 py-1 text-[11px] sm:text-xs font-semibold rounded-full ${getStatusBadgeClass(order.displayStatus || order.status)}`}>
                    {getStatusLabel(order.displayStatus || order.status)}
                  </span>
                  <span className="inline-flex px-2 sm:px-3 py-1 text-[11px] sm:text-xs font-semibold rounded-full bg-blue-50 text-blue-800 border border-blue-200">
                    {order.total_items || (order.items?.length || 0)} items
                  </span>
                </div>
              </div>

              <div className="text-xs sm:text-sm text-gray-900 space-y-1" title={summary.title}>
                {summary.principal.map((item, idx) => (
                  <div key={`${order.id}-history-principal-${idx}`} className="font-semibold wrap-break-word">
                    {item.name} (x{item.qty})
                  </div>
                ))}
                {summary.principalRemaining > 0 && (
                  <div className="text-[11px] sm:text-xs font-semibold text-gray-700">
                    +{summary.principalRemaining} menú(es) principal(es) más
                  </div>
                )}
                {summary.others.map((o, idx) => (
                  <div key={idx} className="wrap-break-word">
                    {o.name} (x{o.qty})
                  </div>
                ))}
                {summary.remaining > 0 && (
                  <div className="text-[11px] sm:text-xs font-semibold text-gray-700">
                    +{summary.remaining} más...
                  </div>
                )}
                {customSide && (
                  <div className="text-[11px] sm:text-xs italic font-semibold mt-1">
                    Guarnición: {customSide}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default OrderHistorySection

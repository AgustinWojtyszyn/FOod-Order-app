import { Link } from 'react-router-dom'
import { Edit, Trash2 } from 'lucide-react'

const WeeklyOrdersSection = ({
  weeklyOrders,
  formatWeeklyDate,
  getServiceLabel,
  getMainMenuLabel,
  getStatusLabel,
  getStatusBadgeClass,
  onEditOrder,
  onDeleteOrder,
  deleteActionLabel = 'Eliminar',
  canEditOrder
}) => {
  const visibleWeeklyOrders = (Array.isArray(weeklyOrders) ? weeklyOrders : [])
    .filter((order) => String(order?.displayStatus || order?.status || '').toLowerCase() !== 'cancelled')

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 sm:px-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Tus pedidos de esta semana</h2>
      </div>

      {visibleWeeklyOrders.length === 0 ? (
        <div className="space-y-1">
          <p className="text-gray-600 font-semibold">Sin pedidos esta semana.</p>
          <p className="text-sm text-gray-500 font-semibold">Cuando hagas un pedido, aparecerá acá.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleWeeklyOrders.map((order) => {
            const status = order.displayStatus || order.status
            const showActions = status === 'pending' && (canEditOrder ? canEditOrder(order) : true)
            return (
              <div
                key={order.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl border border-slate-200 px-3 py-3 sm:px-4"
              >
                <p className="text-sm sm:text-base text-gray-900 font-semibold wrap-break-word">
                  {formatWeeklyDate(order.delivery_date)} · {getServiceLabel(order.service)} · {getMainMenuLabel(order)}
                </p>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  {showActions && (
                    <>
                      <button
                        type="button"
                        onClick={() => onEditOrder && onEditOrder(order)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                        title="Editar pedido"
                      >
                        <Edit className="h-3.5 w-3.5" />
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteOrder && onDeleteOrder(order)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors"
                        title={deleteActionLabel}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {deleteActionLabel}
                      </button>
                    </>
                  )}
                  <span className={`inline-flex px-2 sm:px-3 py-1 text-xs font-semibold rounded-full whitespace-nowrap self-start sm:self-auto ${getStatusBadgeClass(status)}`}>
                    {getStatusLabel(status)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default WeeklyOrdersSection

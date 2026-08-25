import { X } from 'lucide-react'
import { getOrderCustomerDisplay } from '../../utils/daily/adminExtraOrders'

const DeleteConfirmModal = ({ order, onConfirm, onClose, submitting, mode = 'delete' }) => {
  if (!order) return null
  const customerDisplay = getOrderCustomerDisplay(order)
  const isCancel = mode === 'cancel'
  const title = isCancel ? 'Cancelar pedido' : 'Eliminar pedido'
  const message = isCancel
    ? '¿Estás seguro de que querés cancelar este pedido? Se solicitará un motivo cuando corresponda.'
    : '¿Estás seguro de que quieres eliminar este pedido? Esta acción no se puede deshacer.'
  const submitLabel = isCancel ? 'Cancelar pedido' : 'Eliminar pedido'
  const submittingLabel = isCancel ? 'Cancelando...' : 'Eliminando...'

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-linear-to-br from-blue-800 to-blue-900 text-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold">{title}</h3>
              <p className="text-sm text-white/90 mt-1">
                {message}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 text-sm text-white/90">
            <div className="font-semibold">Pedido #{order.id.slice(-8)}</div>
            <div className="mt-1">{customerDisplay.name}</div>
            {customerDisplay.email && (
              <div className="mt-1">{customerDisplay.email}</div>
            )}
            {customerDisplay.loadedBy && (
              <div className="mt-1">Cargado por: {customerDisplay.loadedBy}</div>
            )}
          </div>
        </div>

        <div className="px-6 pb-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold rounded-lg border border-white/40 text-white hover:bg-white/10 transition-colors"
            disabled={submitting}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-semibold rounded-lg border border-white/40 bg-white/20 text-white hover:bg-white/30 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={submitting}
          >
            {submitting ? submittingLabel : submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default DeleteConfirmModal

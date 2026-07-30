import { X } from 'lucide-react'
import InlineSpinner from '../ui/InlineSpinner'
import { getMenuDisplay } from '../../utils/order/menuDisplay'

const OrderConfirmModal = ({
  open,
  confirmData,
  submitting,
  onClose,
  onConfirm,
  formatResponseValue
}) => {
  if (!open || !confirmData) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border-2 border-blue-200 overflow-hidden relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:text-gray-900 hover:bg-gray-50 shadow-sm"
          aria-label="Cerrar confirmación"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="p-5 sm:p-6 border-b border-blue-100 bg-blue-50/70">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Confirmá tu pedido</h2>
          <p className="text-sm sm:text-base text-gray-700">Revisá el detalle completo antes de enviar.</p>
        </div>

        <div className="p-5 sm:p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="border-2 border-gray-200 rounded-xl p-4">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Datos del pedido</h3>
            <div className="space-y-1 text-sm sm:text-base text-gray-800">
              <p><span className="font-semibold">Empresa:</span> {confirmData.company}</p>
              <p><span className="font-semibold">Locación solicitante:</span> {confirmData.location || '-'}</p>
              <p><span className="font-semibold">Lugar de entrega:</span> {confirmData.deliveryLocation || confirmData.location || '-'}</p>
              <p><span className="font-semibold">Nombre:</span> {confirmData.name}</p>
              <p><span className="font-semibold">Email:</span> {confirmData.email}</p>
              <p><span className="font-semibold">Teléfono:</span> {confirmData.phone || '-'}</p>
              <p><span className="font-semibold">Entrega:</span> {confirmData.deliveryDate}</p>
              <p><span className="font-semibold">Turnos:</span> {confirmData.turnos.map(t => (t === 'lunch' ? 'Almuerzo' : 'Cena')).join(' + ')}</p>
            </div>
          </div>

          {confirmData.lunchSelected && (
            <div className="border-2 border-gray-200 rounded-xl p-4">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Almuerzo</h3>
              <div className="space-y-2">
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-1">Menús</p>
                  <div className="space-y-1">
                    {confirmData.lunchItems.map((item, index) => {
                      const { label, dish } = getMenuDisplay(item, Number.isFinite(item?.slotIndex) ? item.slotIndex : index)
                      return (
                      <div key={item.id} className="text-sm sm:text-base">
                        <p className="font-semibold text-gray-900">{label}</p>
                        {dish && <p className="text-gray-600">{dish}</p>}
                      </div>
                    )})}
                  </div>
                  <p className="mt-2 text-sm text-gray-700">
                    <span className="font-semibold">Total items:</span> {confirmData.totals.lunch}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-1">Opciones</p>
                  {confirmData.lunchOptions.length > 0 ? (
                    <div className="space-y-1 text-sm sm:text-base">
                      {confirmData.lunchOptions.map(opt => (
                        <p key={opt.id}>
                          <span className="font-semibold">{opt.title}:</span> {formatResponseValue(opt.response)}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Sin opciones adicionales.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {confirmData.dinnerSelected && (
            <div className="border-2 border-gray-200 rounded-xl p-4">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Cena</h3>
              <div className="space-y-2">
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-1">Menús</p>
                  <div className="space-y-1">
                    {confirmData.dinnerItems.map((item, index) => {
                      if (item?.isDinnerOverride) {
                        return (
                          <div key={item.id} className="text-sm sm:text-base">
                            <p className="font-semibold text-gray-900">{item.name}</p>
                          </div>
                        )
                      }
                      const { label, dish } = getMenuDisplay(item, Number.isFinite(item?.slotIndex) ? item.slotIndex : index)
                      return (
                      <div key={item.id} className="text-sm sm:text-base">
                        <p className="font-semibold text-gray-900">{label}</p>
                        {dish && <p className="text-gray-600">{dish}</p>}
                      </div>
                    )})}
                  </div>
                  <p className="mt-2 text-sm text-gray-700">
                    <span className="font-semibold">Total items:</span> {confirmData.totals.dinner}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-1">Opciones</p>
                  {confirmData.dinnerOptions.length > 0 ? (
                    <div className="space-y-1 text-sm sm:text-base">
                      {confirmData.dinnerOptions.map(opt => (
                        <p key={opt.id}>
                          <span className="font-semibold">{opt.title}:</span> {formatResponseValue(opt.response)}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Sin opciones adicionales.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="border-2 border-gray-200 rounded-xl p-4">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Comentarios</h3>
            <p className="text-sm sm:text-base text-gray-700">
              {confirmData.comments ? confirmData.comments : 'Sin comentarios adicionales.'}
            </p>
          </div>
        </div>

        <div className="p-4 sm:p-6 border-t border-gray-200 flex flex-col sm:flex-row gap-3 justify-end bg-white">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-3 rounded-xl border-2 border-gray-300 text-gray-700 font-bold hover:bg-gray-50 transition-all"
          >
            Volver y editar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-linear-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold shadow-lg transition-all disabled:opacity-60"
          >
            {submitting ? (
              <span className="inline-flex items-center justify-center gap-2">
                <InlineSpinner size="sm" tone="light" label="Enviando pedido" />
                Enviando...
              </span>
            ) : 'Confirmar y enviar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default OrderConfirmModal

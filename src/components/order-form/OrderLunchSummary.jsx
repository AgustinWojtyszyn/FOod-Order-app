import { ShoppingCart, X } from 'lucide-react'
import { getMenuDisplay } from '../../utils/order/menuDisplay'

const OrderLunchSummary = ({ items, total, onRemove, companySlug }) => {
  if (!items || items.length === 0) return null

  return (
    <div className="card bg-linear-to-br from-green-50 to-emerald-50 backdrop-blur-sm shadow-xl border-2 border-green-300">
      <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
        <div className="bg-linear-to-r from-green-600 to-emerald-600 text-white p-2 sm:p-3 rounded-xl">
          <ShoppingCart className="h-5 w-5 sm:h-6 sm:w-6" />
        </div>
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Resumen del Pedido</h2>
          <p className="text-xs sm:text-sm text-gray-700 font-semibold mt-1">Revisa tu selección antes de confirmar</p>
        </div>
      </div>

      <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-6">
        {items.map((item, index) => {
          const { label, dish } = getMenuDisplay(item, Number.isFinite(item?.slotIndex) ? item.slotIndex : index, companySlug)
          return (
          <div key={item.id} className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 py-2 border-b border-gray-100">
            <div className="flex items-center justify-between sm:justify-start">
              {/* TEXTO MÁS GRANDE EN EL RESUMEN */}
              <div>
                <span className="font-medium text-gray-900 text-lg sm:text-xl">{label}</span>
                {dish && <p className="text-sm text-gray-600">{dish}</p>}
              </div>
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                className="ml-2 p-1 rounded-full hover:bg-red-100 text-red-600"
              >
                <X className="h-3 w-3 sm:h-4 sm:w-4" />
              </button>
            </div>
            <span className="text-gray-600 text-base sm:text-lg">Seleccionado</span>
          </div>
        )})}
      </div>

      <div className="border-t border-gray-200 pt-3 sm:pt-4">
        <div className="flex justify-between items-center text-lg sm:text-xl font-semibold">
          <span>Total de items:</span>
          <span>{total}</span>
        </div>
      </div>
    </div>
  )
}

export default OrderLunchSummary

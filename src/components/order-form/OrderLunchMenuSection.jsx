import { CheckCircle, ChefHat } from 'lucide-react'
import { filterOrderableMenuItems, getMenuDisplay } from '../../utils/order/menuDisplay'
import { isGreifRefrigerioMenuItem } from '../../utils/order/greifDefaultSnack'

const OrderLunchMenuSection = ({ items, selectedItems, onToggleItem, companySlug }) => {
  const orderableItems = filterOrderableMenuItems(items, companySlug)
  const hasSelectedRefrigerio = orderableItems.some((item) =>
    isGreifRefrigerioMenuItem(item) && selectedItems[item.id] === true
  )
  const hasSelectedMenu = orderableItems.some((item) =>
    !isGreifRefrigerioMenuItem(item) && selectedItems[item.id] === true
  )

  return (
    <div className="card bg-white/95 backdrop-blur-sm shadow-xl border-2 border-white/20">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-linear-to-r from-secondary-500 to-secondary-600 text-white p-3 rounded-xl">
          <ChefHat className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-2xl font-boldd text-gray-900">Seleccioná tu Menú</h2>
          <p className="text-sm text-gray-600 font-semibold mt-1">
            Elegí uno o más platos disponibles
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {orderableItems.map((item, index) => {
          const isSelected = selectedItems[item.id] === true
          const isRefrigerio = isGreifRefrigerioMenuItem(item)
          const isDisabled = (hasSelectedRefrigerio && !isRefrigerio) || (hasSelectedMenu && isRefrigerio)
          const { label, dish } = getMenuDisplay(item, Number.isFinite(item?.slotIndex) ? item.slotIndex : index, companySlug)
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (isDisabled) return
                onToggleItem(item.id, !isSelected)
              }}
              disabled={isDisabled}
              aria-pressed={isSelected}
              className={`card text-left bg-white border-2 rounded-2xl p-5
                        transition-all duration-300 flex flex-col justify-between min-h-65
                        focus:outline-none focus:ring-2 focus:ring-blue-400
                        ${isDisabled ? 'cursor-not-allowed opacity-55 border-gray-200' : 'cursor-pointer hover:border-blue-400 hover:shadow-xl'}
                        ${isSelected ? 'border-blue-500 bg-blue-50/60 shadow-xl' : 'border-gray-200'}`}
            >
              <div>
                <h3 className="text-2xl font-extrabold text-gray-900 mb-2 leading-tight">
                  {label}
                </h3>

                {dish && (
                  <p className="text-lg text-gray-800 leading-snug font-medium">
                    {dish}
                  </p>
                )}
              </div>

              <div className="flex justify-end mt-6 min-h-9">
                {isSelected && (
                  <span className="flex items-center gap-2 text-blue-600 font-bold text-lg">
                    <CheckCircle className="h-8 w-8" />
                    Seleccionado
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default OrderLunchMenuSection

import { CheckCircle, ChefHat } from 'lucide-react'
import { filterOrderableMenuItems, getMenuDisplay } from '../../utils/order/menuDisplay'

const OrderLunchMenuSection = ({ items, selectedItems, onToggleItem }) => (
  <div className="card bg-white/95 backdrop-blur-sm shadow-xl border-2 border-white/20">
    <div className="flex items-center gap-3 mb-6">
      <div className="bg-linear-to-r from-secondary-500 to-secondary-600 text-white p-3 rounded-xl">
        <ChefHat className="h-6 w-6" />
      </div>
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Seleccioná tu Menú</h2>
        <p className="text-sm text-gray-600 font-semibold mt-1">
          Elegí uno o más platos disponibles
        </p>
      </div>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {filterOrderableMenuItems(items).map((item, index) => {
        const isSelected = selectedItems[item.id] === true
        const { label, dish } = getMenuDisplay(item, Number.isFinite(item?.slotIndex) ? item.slotIndex : index)
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onToggleItem(item.id, !isSelected)}
            aria-pressed={isSelected}
            className={`card text-left bg-white border-2 rounded-2xl p-5
                       transition-all duration-300 flex flex-col justify-between min-h-[260px] cursor-pointer
                       focus:outline-none focus:ring-2 focus:ring-blue-400
                       ${isSelected ? 'border-blue-500 bg-blue-50/60 shadow-xl' : 'border-gray-200 hover:border-blue-400 hover:shadow-xl'}`}
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

export default OrderLunchMenuSection

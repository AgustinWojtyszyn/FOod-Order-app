import { Calendar } from 'lucide-react'
import { formatDateDMY } from '../../utils/monthly/monthlyOrderFormatters'
import MonthlyOrderDetailsModal from './MonthlyOrderDetailsModal'

const MonthlyOrdersTable = ({
  dailyDataForView,
  ordersByDayForView,
  selectedDate,
  onSelectDate
}) => {
  if (!dailyDataForView?.daily_breakdown) return null

  return (
    <div className="bg-white rounded-xl p-4 md:p-5 shadow-sm border border-slate-200 w-full print-no-break print-full-width">
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="h-5 w-5 text-blue-600" />
        <div className="font-bold text-slate-800 text-lg">Desglose diario del rango</div>
      </div>
      <p className="text-sm text-slate-600 mb-3">
        {dailyDataForView.daily_breakdown.length} días en el rango seleccionado.
      </p>
      <div className="space-y-2">
        {dailyDataForView.daily_breakdown.map(d => {
          const dayOrders = ordersByDayForView[d.date] || []
          const empresasActivas = new Set(
            (dayOrders || []).map(o => o.location || 'Sin ubicación')
          ).size
          const isOpen = selectedDate === d.date
          const menusCount = d.menus_principales ?? 0

          return (
            <div key={d.date} className="border border-slate-200 rounded-lg overflow-hidden">
              <div
                className={`flex items-center justify-between px-3 py-2 ${isOpen ? 'bg-slate-50' : 'bg-white'}`}
                onClick={() => onSelectDate(isOpen ? null : d.date)}
              >
                <div className="grid w-full grid-cols-2 md:grid-cols-6 gap-2 text-sm items-center">
                  <div className="font-semibold text-slate-800">{formatDateDMY(d.date)}</div>
                  <div className="text-slate-600">Almuerzo: <span className="font-semibold text-slate-800">{d.count}</span></div>
                  <div className="text-slate-600">Cena: <span className="font-semibold text-slate-800">{d.dinner_count || 0}</span></div>
                  <div className="text-slate-600">Empresas: <span className="font-semibold text-slate-800">{empresasActivas}</span></div>
                  <div className="text-slate-600">Menús: <span className="font-semibold text-slate-800">{menusCount}</span></div>
                  <div className="flex md:justify-end">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectDate(isOpen ? null : d.date)
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-blue-700 border border-blue-200 rounded-md bg-white hover:bg-blue-50 transition-colors"
                    >
                      {isOpen ? 'Ocultar detalle' : 'Ver detalle'}
                    </button>
                  </div>
                </div>
              </div>
              {isOpen && (
                <div className="bg-slate-50 border-t border-slate-200 p-3">
                  <div>
                    <MonthlyOrderDetailsModal
                      date={d.date}
                      orders={ordersByDayForView[d.date] || []}
                      dailyBreakdown={dailyDataForView.daily_breakdown.find(x => x.date === d.date)}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default MonthlyOrdersTable

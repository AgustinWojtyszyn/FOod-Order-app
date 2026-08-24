import clipboardImg from '../../assets/clipboard.png'
import choiceImg from '../../assets/choice.png'
import MonthlyOperationalSummary from './MonthlyOperationalSummary'
import MonthlyOrdersTable from './MonthlyOrdersTable'

const MonthlySummary = ({
  totalsForView,
  dailyDataForView,
  ordersByDayForView,
  empresasForView,
  selectedDate,
  onSelectDate
}) => {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4 w-full print-no-break print-full-width">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 w-full">
          <div className="text-center">
            <img
              src={clipboardImg}
              alt="Pedidos de almuerzo"
              className="h-8 w-8 mx-auto mb-2 object-contain"
            />
            <p className="text-xs md:text-sm text-slate-700 font-semibold">Pedidos de almuerzo</p>
            <p className="text-2xl md:text-3xl font-bold text-blue-600">{totalsForView.pedidos}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 w-full">
          <div className="text-center">
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6 md:h-8 md:w-8 text-indigo-600 mx-auto mb-2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3v2" />
              <path d="M12 19v2" />
              <path d="M4.2 7.8l1.4 1.4" />
              <path d="M18.4 7.8l1.4-1.4" />
              <path d="M5 17h14" />
              <path d="M7 17a5 5 0 0 1 10 0" />
              <path d="M4 21h16" />
            </svg>
            <p className="text-xs md:text-sm text-slate-700 font-semibold">Pedidos de cena</p>
            <p className="text-2xl md:text-3xl font-bold text-indigo-600">{totalsForView.cenasPedidos || 0}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 w-full">
          <div className="text-center">
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6 md:h-8 md:w-8 text-green-600 mx-auto mb-2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="8" />
              <path d="M5.5 12h13" />
              <path d="M8 9c1.5 1 3.5 1 5 0" />
              <path d="M9 14c.8-.6 2.2-.6 3 0" />
              <path d="M14.5 9.5c.7.4 1.2 1.1 1.2 1.9 0 .6-.2 1-.4 1.3" />
              <path d="M2.7 6v10" />
              <path d="M3.7 6v10" />
              <path d="M2 6.2h2.4" />
              <path d="M2 8h2.4" />
              <path d="M19.8 6v10" />
              <path d="M20.8 6v10" />
              <path d="M19.8 6c0-.6 1-.6 1 0" />
              <path d="M19.8 15.5c0 .8.8 1.5 1.5 1.5" />
            </svg>
            <p className="text-xs md:text-sm text-slate-700 font-semibold">Total Menús Principales</p>
            <p className="text-2xl md:text-3xl font-bold text-green-600">{totalsForView.menusPrincipales}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 w-full">
          <div className="text-center">
            <img
              src={choiceImg}
              alt="Total opciones"
              className="h-8 w-8 mx-auto mb-2 object-contain"
            />
            <p className="text-xs md:text-sm text-slate-700 font-semibold">Total Opciones</p>
            <p className="text-2xl md:text-3xl font-bold text-yellow-600">{totalsForView.opciones}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 w-full">
          <div className="text-center">
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6 md:h-8 md:w-8 text-purple-600 mx-auto mb-2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 9l1.2 10.2c.1 1 1 1.8 2 1.8h5.6c1 0 1.9-.8 2-1.8L18 9" />
              <path d="M5 9h14" />
              <path d="M8 9L9 4.5" />
              <path d="M11 9l-.3-5" />
              <path d="M13 9l.3-5" />
              <path d="M16 9L15 4.5" />
              <path d="M9 14h6" />
            </svg>
            <p className="text-xs md:text-sm text-slate-700 font-semibold">Total Guarniciones</p>
            <p className="text-2xl md:text-3xl font-bold text-purple-600">{totalsForView.guarniciones}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 w-full">
          <div className="text-center">
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6 md:h-8 md:w-8 text-sky-600 mx-auto mb-2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M7 3h7a3 3 0 0 1 3 3v8a5 5 0 0 1-5 5H7z" />
              <path d="M7 3v16" />
              <path d="M7 10h10" />
            </svg>
            <p className="text-xs md:text-sm text-slate-700 font-semibold">Total Bebidas</p>
            <p className="text-2xl md:text-3xl font-bold text-sky-600">{totalsForView.bebidas}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 w-full">
          <div className="text-center">
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6 md:h-8 md:w-8 text-pink-600 mx-auto mb-2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 14h16" />
              <path d="M6 14c0-3.3 2.7-6 6-6s6 2.7 6 6" />
              <path d="M8 18h8" />
            </svg>
            <p className="text-xs md:text-sm text-slate-700 font-semibold">Total Postres</p>
            <p className="text-2xl md:text-3xl font-bold text-pink-600">{totalsForView.postres}</p>
          </div>
        </div>
      </div>

      <MonthlyOperationalSummary
        totalsForView={totalsForView}
        dailyDataForView={dailyDataForView}
        ordersByDayForView={ordersByDayForView}
        empresasForView={empresasForView}
      />

      <MonthlyOrdersTable
        dailyDataForView={dailyDataForView}
        ordersByDayForView={ordersByDayForView}
        selectedDate={selectedDate}
        onSelectDate={onSelectDate}
      />
    </div>
  )
}

export default MonthlySummary

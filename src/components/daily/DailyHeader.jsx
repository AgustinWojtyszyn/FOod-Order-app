import dinnerImg from '../../assets/dinner.png'
import { addDaysToISO, getTodayISOInTimeZone, getTomorrowISOInTimeZone } from '../../utils/dateUtils'
import DailyExportActions from './DailyExportActions'

const DailyHeader = ({
  stats,
  activeLocationsCount,
  tomorrowLabel,
  operationalDate,
  onDeliveryDateChange,
  exportCompany,
  onExportCompanyChange,
  locations,
  exportableOrdersCount,
  onExportExcel,
  onGenerateNotaPedido,
  onShareWhatsApp,
  refreshing,
  onRefresh,
  onExportPdf,
  onArchiveAll,
  sortedOrdersLength,
  pendingOrdersCount,
  isAdmin
}) => {
  const today = getTodayISOInTimeZone()
  const tomorrow = getTomorrowISOInTimeZone()
  const previousDay = addDaysToISO(operationalDate, -1)
  const nextDay = addDaysToISO(operationalDate, 1)

  const quickDates = [
    { label: 'Día anterior', value: previousDay },
    { label: 'Hoy', value: today },
    { label: 'Mañana', value: tomorrow },
    { label: 'Día siguiente', value: nextDay }
  ]

  return (
    <div className="mb-4 rounded-2xl border border-slate-200 bg-linear-to-br from-white via-white to-slate-50 shadow-lg shadow-slate-200/60 print-hide">
      <div className="flex flex-col gap-6 p-5">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <img src={dinnerImg} alt="" className="h-10 w-10" aria-hidden="true" />
              <div>
                <h1 className="text-3xl font-black text-slate-900">Pedidos diarios</h1>
                <p className="text-sm font-semibold text-slate-600">
                  Entrega: {tomorrowLabel}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label htmlFor="daily-delivery-date" className="text-xs font-semibold text-slate-600">
                  Fecha de entrega
                </label>
                <input
                  id="daily-delivery-date"
                  type="date"
                  value={operationalDate}
                  onChange={(event) => onDeliveryDateChange(event.target.value)}
                  className="mt-1 h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {quickDates.map(item => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => onDeliveryDateChange(item.value)}
                    className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-default disabled:border-primary-200 disabled:bg-primary-50 disabled:text-primary-700"
                    disabled={item.value === operationalDate}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Total del día', value: stats.total },
                { label: 'Pendientes', value: stats.pending },
                { label: 'Archivados', value: stats.archived },
                { label: 'Ubicaciones activas', value: activeLocationsCount }
              ].map(metric => (
                <div
                  key={metric.label}
                  className="rounded-xl border border-slate-200/80 bg-white px-3 py-2 shadow-sm"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {metric.label}
                  </p>
                  <p className="text-2xl font-black text-slate-900">{metric.value}</p>
                </div>
              ))}
            </div>
          </div>

          <DailyExportActions
            exportCompany={exportCompany}
            onExportCompanyChange={onExportCompanyChange}
            locations={locations}
            exportableOrdersCount={exportableOrdersCount}
            onExportExcel={onExportExcel}
            onGenerateNotaPedido={onGenerateNotaPedido}
            onShareWhatsApp={onShareWhatsApp}
            refreshing={refreshing}
            onRefresh={onRefresh}
            onExportPdf={onExportPdf}
            onArchiveAll={onArchiveAll}
            sortedOrdersLength={sortedOrdersLength}
            pendingOrdersCount={pendingOrdersCount}
            isAdmin={isAdmin}
          />
        </div>
      </div>
    </div>
  )
}

export default DailyHeader

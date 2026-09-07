import { Archive as ArchiveIcon, FileText, Minus, Plus, Printer, RefreshCw } from 'lucide-react'
import excelLogo from '../../assets/logoexcel.png'
import whatsappLogo from '../../assets/whatsapp.png'

const DailyExportActions = ({
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
  onAddExtraOrder,
  onAddLateExtraOrder,
  onDiscountOrders,
  sortedOrdersLength,
  pendingOrdersCount = 0,
  isAdmin
}) => (
  <div className="w-full xl:w-[470px] xl:shrink-0">
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
            Acciones del día
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            Gestioná pedidos, exportaciones y cierre desde un solo lugar.
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className={`inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto ${
            refreshing ? 'animate-pulse' : ''
          }`}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Actualizando...' : 'Actualizar datos'}
        </button>
      </div>

      <div className="pt-4">
        <p className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
          Operación
        </p>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {onAddExtraOrder && (
            <button
              type="button"
              onClick={onAddExtraOrder}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-900 px-3 py-2 text-sm font-black text-white shadow-sm transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
            >
              <Plus className="mr-2 h-4 w-4" />
              Pedido extra
            </button>
          )}

          {onAddLateExtraOrder && (
            <button
              type="button"
              onClick={onAddLateExtraOrder}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-black text-amber-900 shadow-sm transition-colors hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
            >
              <Plus className="mr-2 h-4 w-4" />
              Fuera de término
            </button>
          )}

          {onDiscountOrders && (
            <button
              type="button"
              onClick={onDiscountOrders}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-black text-rose-800 shadow-sm transition-colors hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
            >
              <Minus className="mr-2 h-4 w-4" />
              Descontar pedidos
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={onArchiveAll}
              disabled={pendingOrdersCount === 0}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-black text-blue-800 shadow-sm transition-colors hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              title={pendingOrdersCount > 0 ? 'Archiva todos los pedidos pendientes al final del día' : 'No hay pedidos pendientes para archivar'}
            >
              <ArchiveIcon className="mr-2 h-4 w-4" />
              Archivar pendientes ({pendingOrdersCount})
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 border-t border-slate-200 pt-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
              Exportar y compartir
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Las salidas respetan la empresa seleccionada.
            </p>
          </div>

          <div className="w-full sm:w-52">
            <label htmlFor="export-company" className="text-xs font-bold text-slate-600">
              Empresa
            </label>
            <select
              id="export-company"
              value={exportCompany}
              onChange={(e) => onExportCompanyChange(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">Todas las empresas</option>
              {locations.map(loc => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={onExportExcel}
            disabled={exportableOrdersCount === 0}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-600 px-3 py-2 text-sm font-black text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <img src={excelLogo} alt="" className="mr-2 h-5 w-5" aria-hidden="true" />
            Excel
            <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold">
              {exportableOrdersCount}
            </span>
          </button>

          <button
            type="button"
            onClick={onGenerateNotaPedido}
            disabled={exportableOrdersCount === 0}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-900 px-3 py-2 text-sm font-black text-white shadow-sm transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileText className="mr-2 h-4 w-4" />
            Nota de pedido
            <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold">
              {exportableOrdersCount}
            </span>
          </button>

          <button
            type="button"
            onClick={onExportPdf}
            disabled={sortedOrdersLength === 0}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="mr-2 h-4 w-4" />
            PDF / Imprimir
          </button>

          <button
            type="button"
            onClick={onShareWhatsApp}
            disabled={sortedOrdersLength === 0}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-800 shadow-sm transition-colors hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <img src={whatsappLogo} alt="" className="mr-2 h-5 w-5" aria-hidden="true" />
            WhatsApp
          </button>
        </div>
      </div>
    </section>
  </div>
)

export default DailyExportActions

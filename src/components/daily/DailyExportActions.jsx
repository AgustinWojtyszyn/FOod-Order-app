import { Archive as ArchiveIcon, FileText, Printer, RefreshCw } from 'lucide-react'
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
  sortedOrdersLength,
  pendingOrdersCount = 0,
  isAdmin
}) => (
  <div className="flex flex-col gap-3 xl:min-w-[420px]">
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[200px]">
        <label htmlFor="export-company" className="text-xs font-semibold text-slate-600">
          Empresa (para exportar)
        </label>
        <select
          id="export-company"
          value={exportCompany}
          onChange={(e) => onExportCompanyChange(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
        >
          <option value="all">Todas las empresas</option>
          {locations.map(loc => (
            <option key={loc} value={loc}>
              {loc}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={onExportExcel}
        disabled={exportableOrdersCount === 0}
        className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-emerald-500/30 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto"
      >
        <img src={excelLogo} alt="" className="mr-2 h-5 w-5" aria-hidden="true" />
        Exportar Excel
        <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold">
          {exportableOrdersCount}
        </span>
      </button>

      <button
        type="button"
        onClick={onGenerateNotaPedido || onExportExcel}
        disabled={exportableOrdersCount === 0}
        className="inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-slate-500/25 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        <FileText className="mr-2 h-4 w-4" />
        Generar nota de pedido
        <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold">
          {exportableOrdersCount}
        </span>
      </button>

      <button
        onClick={onShareWhatsApp}
        disabled={sortedOrdersLength === 0}
        className="inline-flex w-full items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 shadow-sm hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto"
      >
        <img src={whatsappLogo} alt="" className="mr-2 h-5 w-5" aria-hidden="true" />
        Copiar y abrir WhatsApp
      </button>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className={`inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto ${
          refreshing ? 'animate-pulse' : ''
        }`}
      >
        <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        {refreshing ? 'Actualizando...' : 'Actualizar'}
      </button>

      <button
        onClick={onExportPdf}
        disabled={sortedOrdersLength === 0}
        className="inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto"
      >
        <Printer className="mr-2 h-4 w-4" />
        Exportar / Imprimir PDF
      </button>

      {isAdmin && (
        <button
          onClick={onArchiveAll}
          disabled={pendingOrdersCount === 0}
          className="inline-flex w-full items-center justify-center rounded-lg border border-primary-200 bg-primary-50 px-4 py-2 text-sm font-semibold text-primary-700 shadow-sm hover:bg-primary-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          title={pendingOrdersCount > 0 ? 'Archiva todos los pedidos pendientes al final del día' : 'No hay pedidos pendientes para archivar'}
        >
          <ArchiveIcon className="mr-2 h-4 w-4" />
          Archivar pendientes ({pendingOrdersCount})
        </button>
      )}
    </div>
  </div>
)

export default DailyExportActions

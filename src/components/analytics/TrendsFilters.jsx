import { Calendar, Filter } from 'lucide-react'
import { COMPARISON_MODES } from '../../utils/analytics/trendsHelpers'

const TrendsFilters = ({
  companies = [],
  company,
  onCompanyChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  analysisType,
  onAnalysisTypeChange,
  comparisonMode,
  onComparisonModeChange,
  chartType,
  onChartTypeChange,
  onApply,
  onClear,
  onExport,
  isDirty,
  isLoading,
  isRangeValid,
  excelLogo,
  exportCount
}) => {
  return (
    <div className="bg-white rounded-xl p-3 md:p-4 shadow-sm border border-slate-200 w-full">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-slate-800">
            <Filter className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-bold">Filtros</span>
          </div>
          <div className="inline-flex rounded-full border border-slate-200 bg-slate-100 p-1 shadow-sm">
            <button
              type="button"
              onClick={() => onChartTypeChange('bar')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${
                chartType === 'bar' ? 'bg-blue-700 text-white shadow-md ring-1 ring-blue-300/40' : 'text-slate-600 hover:text-blue-700'
              }`}
            >
              Gráfico de barras
            </button>
            <button
              type="button"
              onClick={() => onChartTypeChange('donut')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${
                chartType === 'donut' ? 'bg-blue-700 text-white shadow-md ring-1 ring-blue-300/40' : 'text-slate-600 hover:text-blue-700'
              }`}
            >
              Gráfico circular
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-5">
          <div>
            <label className="text-xs font-semibold text-slate-600">Empresa</label>
            <select
              value={company}
              onChange={(e) => onCompanyChange(e.target.value)}
              className="mt-1 w-full border border-slate-300 rounded-md px-2.5 py-2 text-sm bg-white"
            >
              <option value="all">Todas</option>
              {companies.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-blue-600" />
              Desde
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => onDateFromChange(e.target.value)}
              className="mt-1 w-full border border-slate-300 rounded-md px-2.5 py-2 text-sm bg-white"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-blue-600" />
              Hasta
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => onDateToChange(e.target.value)}
              className="mt-1 w-full border border-slate-300 rounded-md px-2.5 py-2 text-sm bg-white"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Tipo de análisis</label>
            <select
              value={analysisType}
              onChange={(e) => onAnalysisTypeChange(e.target.value)}
              className="mt-1 w-full border border-slate-300 rounded-md px-2.5 py-2 text-sm bg-white"
            >
              <option value="all">Todo</option>
              <option value="menus">Menús</option>
              <option value="options">Opciones</option>
              <option value="sides">Guarniciones</option>
              <option value="beverages">Bebidas</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Comparar con</label>
            <select
              value={comparisonMode}
              onChange={(e) => onComparisonModeChange(e.target.value)}
              className="mt-1 w-full border border-slate-300 rounded-md px-2.5 py-2 text-sm bg-white"
            >
              <option value={COMPARISON_MODES.NONE}>Sin comparación</option>
              <option value={COMPARISON_MODES.PREVIOUS_PERIOD}>Período anterior</option>
              <option value={COMPARISON_MODES.PREVIOUS_YEAR}>Mismo período del año anterior</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {!isRangeValid && (
            <div className="text-xs text-red-600 font-semibold mr-auto">
              La fecha de inicio no puede ser mayor que la fecha fin.
            </div>
          )}
          <button
            type="button"
            onClick={onExport}
            disabled={isLoading || exportCount === 0}
            className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-emerald-500/30 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto"
          >
            {excelLogo && (
              <img src={excelLogo} alt="" aria-hidden="true" className="mr-2 h-5 w-5" />
            )}
            Exportar Excel
            <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold">
              {exportCount || 0}
            </span>
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={isLoading}
            className={`h-9 px-3 rounded-md font-semibold text-blue-700 border border-blue-200 shadow-sm transition-all duration-200 ${
              isLoading ? 'bg-gray-200 cursor-not-allowed text-gray-500 border-gray-200' : 'bg-white hover:bg-blue-50 hover:border-blue-400'
            }`}
          >
            Limpiar filtros
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={!isDirty || isLoading || !isRangeValid}
            className={`h-9 px-4 rounded-md font-semibold text-white shadow-sm transition-all duration-200 ${
              isDirty && !isLoading && isRangeValid
                ? 'bg-blue-600 hover:bg-blue-700 hover:shadow-md'
                : 'bg-gray-400 cursor-not-allowed'
            }`}
          >
            Aplicar filtros
          </button>
        </div>
      </div>
    </div>
  )
}

export default TrendsFilters

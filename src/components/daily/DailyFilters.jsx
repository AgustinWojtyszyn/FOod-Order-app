const DailyFilters = ({
  stats,
  locations,
  selectedLocation,
  onLocationChange,
  selectedStatus,
  onStatusChange,
  selectedDish,
  onDishChange,
  selectedSide,
  onSideChange,
  availableDishes,
  availableSides,
  sortBy,
  onSortChange
}) => (
  <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-md shadow-slate-200/50 print-hide">
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">Filtros rápidos</h3>
      <span className="text-xs text-slate-500">Aplican al listado y al resumen operativo</span>
    </div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <div>
        <label htmlFor="filter-location" className="mb-2 block text-xs font-semibold text-slate-600">
          Ubicación
        </label>
        <select
          id="filter-location"
          value={selectedLocation}
          onChange={(e) => onLocationChange(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="all">Todas ({stats.total})</option>
          {locations.map(location => (
            <option key={location} value={location}>
              {location} ({stats.byLocation[location] || 0})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="filter-status" className="mb-2 block text-xs font-semibold text-slate-600">
          Estado
        </label>
        <select
          id="filter-status"
          value={selectedStatus}
          onChange={(e) => onStatusChange(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="all">Todos</option>
          <option value="pending">Pendientes ({stats.pending})</option>
          <option value="post_report_extra">Extras post reporte ({stats.postReportExtra || 0})</option>
          <option value="archived">Archivados ({stats.archived})</option>
        </select>
      </div>

      <div>
        <label htmlFor="filter-dish" className="mb-2 block text-xs font-semibold text-slate-600">
          Platillo
        </label>
        <select
          id="filter-dish"
          value={selectedDish}
          onChange={(e) => onDishChange(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="all">Todos</option>
          {availableDishes.map(dish => (
            <option key={dish} value={dish}>
              {dish} ({stats.byDish[dish] || 0})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="filter-side" className="mb-2 block text-xs font-semibold text-slate-600">
          Guarnición
        </label>
        <select
          id="filter-side"
          value={selectedSide}
          onChange={(e) => onSideChange(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="all">Todas</option>
          {availableSides.map(side => (
            <option key={side} value={side}>{side}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="filter-sort" className="mb-2 block text-xs font-semibold text-slate-600">
          Ordenar por
        </label>
        <select
          id="filter-sort"
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="recent">Recientes</option>
          <option value="location">Empresa</option>
          <option value="hour">Hora (asc)</option>
        </select>
      </div>
    </div>
  </div>
)

export default DailyFilters

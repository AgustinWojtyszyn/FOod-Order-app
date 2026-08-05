const OrderLabelsFilters = ({
  filters,
  onFilterChange,
  onClear,
  companyOptions,
  customerOptions = [],
  accessLocations
}) => {
  const availableLocations = filters.company === 'all'
    ? (accessLocations.length > 0 ? accessLocations : companyOptions.flatMap(company => company.locations || []))
    : companyOptions.find(company => company.slug === filters.company)?.locations || []

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-lg shadow-slate-200/50 md:p-5 print-hide">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-900">Filtros</h2>
          <p className="text-sm font-semibold text-slate-500">Buscá por fecha de entrega, aunque el pedido se haya creado el día anterior.</p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
        >
          Limpiar filtros
        </button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-slate-600">Cliente</span>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            list="label-customers"
            value={filters.search}
            onChange={event => onFilterChange('search', event.target.value)}
          />
          <datalist id="label-customers">
            {customerOptions.map(option => <option key={option.value} value={option.name}>{option.email}</option>)}
          </datalist>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-slate-600">Correo</span>
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={filters.email} onChange={event => onFilterChange('email', event.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-slate-600">Empresa</span>
          <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={filters.company} onChange={event => onFilterChange('company', event.target.value)}>
            <option value="all">Todas disponibles</option>
            {companyOptions.map(company => (
              <option key={company.slug} value={company.slug}>{company.name}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-slate-600">Locación / entrega</span>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            list="label-locations"
            value={filters.location}
            onChange={event => onFilterChange('location', event.target.value)}
          />
          <datalist id="label-locations">
            {availableLocations.map(location => <option key={location} value={location} />)}
          </datalist>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-slate-600">Fecha de entrega</span>
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" type="date" value={filters.deliveryDate} onChange={event => onFilterChange('deliveryDate', event.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-slate-600">Desde</span>
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100" type="date" value={filters.fromDate} disabled={Boolean(filters.deliveryDate)} onChange={event => onFilterChange('fromDate', event.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-slate-600">Hasta</span>
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100" type="date" value={filters.toDate} disabled={Boolean(filters.deliveryDate)} onChange={event => onFilterChange('toDate', event.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-slate-600">Servicio</span>
          <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={filters.service} onChange={event => onFilterChange('service', event.target.value)}>
            <option value="all">Almuerzo y cena</option>
            <option value="lunch">Almuerzo</option>
            <option value="dinner">Cena</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-slate-600">Estado</span>
          <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={filters.status} onChange={event => onFilterChange('status', event.target.value)}>
            <option value="active">Vigentes</option>
            <option value="pending">Pendiente</option>
            <option value="archived">Archivado</option>
            <option value="cancelled">Cancelado</option>
            <option value="all">Todos</option>
          </select>
        </label>
        <label className="space-y-1 xl:col-span-2">
          <span className="text-xs font-bold uppercase text-slate-600">Producto, menú o texto de ítems</span>
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={filters.itemText} onChange={event => onFilterChange('itemText', event.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-slate-600">Bebida</span>
          <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={filters.beverage} onChange={event => onFilterChange('beverage', event.target.value)}>
            <option value="all">Todas</option>
            <option value="with">Con bebida</option>
            <option value="without">Sin bebida</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-slate-600">Observaciones / respuestas</span>
          <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={filters.hasNotes} onChange={event => onFilterChange('hasNotes', event.target.value)}>
            <option value="all">Todas</option>
            <option value="with">Con datos</option>
            <option value="without">Sin datos</option>
          </select>
        </label>
      </div>
    </section>
  )
}

export default OrderLabelsFilters

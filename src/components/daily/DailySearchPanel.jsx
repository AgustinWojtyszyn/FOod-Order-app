import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { db } from '../../supabaseClient'
import { getBeverageLabel, getDessertLabel } from '../../utils/daily/dailyOrderCalculations'
import { getStatusColor, getStatusText } from '../../utils/daily/dailyOrderFormatters'
import { getAdminExtraOrderLabel } from '../../utils/daily/adminExtraOrders'
import { getUserFriendlyErrorMessage } from '../../utils'

const PAGE_SIZE = 25

const emptyFilters = {
  search: '',
  email: '',
  companySlug: 'all',
  fromDate: '',
  toDate: '',
  remitoNumber: '',
  status: 'all',
  origin: 'all'
}

const formatDate = (value) => {
  const raw = String(value || '').slice(0, 10)
  if (!raw) return '-'
  const [year, month, day] = raw.split('-').map(Number)
  if (!year || !month || !day) return raw
  return new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day, 12)))
}

const getQuantitySummary = (order = {}) => {
  const menus = Number(order.total_items ?? order.totalItems ?? 0) || 0
  const beverages = getBeverageLabel(order)
  const desserts = getDessertLabel(order)
  return `${menus} menús · Bebida: ${beverages} · Postre: ${desserts}`
}

const getOriginLabel = (order = {}) => {
  const origin = String(order.order_origin || '').toLowerCase()
  return origin === 'admin_extra' ? 'Extra administrativo' : getAdminExtraOrderLabel(order)
}

const DailySearchPanel = ({ companyOptions = [], onViewOrder }) => {
  const [filters, setFilters] = useState(emptyFilters)
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters)
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasSubmitted, setHasSubmitted] = useState(false)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasSearched = useMemo(() => (
    hasSubmitted || Object.entries(appliedFilters).some(([key, value]) => value !== emptyFilters[key])
  ), [appliedFilters, hasSubmitted])

  useEffect(() => {
    let cancelled = false

    const runSearch = async () => {
      if (!hasSubmitted) return
      setLoading(true)
      setError('')
      try {
        const { data, error: searchError } = await db.searchHistoricalDailyOrders({
          ...appliedFilters,
          page,
          pageSize: PAGE_SIZE
        })
        if (cancelled) return
        if (searchError) {
          setRows([])
          setTotal(0)
          setError(getUserFriendlyErrorMessage(searchError, 'No pudimos buscar pedidos históricos.'))
          return
        }
        const nextRows = Array.isArray(data) ? data : []
        setRows(nextRows)
        setTotal(Number(nextRows[0]?.total_count || 0))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    runSearch()

    return () => {
      cancelled = true
    }
  }, [appliedFilters, hasSubmitted, page])

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  const submitSearch = (event) => {
    event.preventDefault()
    setPage(1)
    setAppliedFilters({ ...filters })
    setHasSubmitted(true)
  }

  const clearSearch = () => {
    setFilters(emptyFilters)
    setAppliedFilters(emptyFilters)
    setPage(1)
    setRows([])
    setTotal(0)
    setError('')
    setHasSubmitted(false)
  }

  return (
    <section className="space-y-4 print-hide">
      <form onSubmit={submitSearch} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-xs font-semibold text-slate-600">
            Nombre y apellido
            <input
              type="search"
              value={filters.search}
              onChange={(event) => updateFilter('search', event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Correo
            <input
              type="search"
              value={filters.email}
              onChange={(event) => updateFilter('email', event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Empresa
            <select
              value={filters.companySlug}
              onChange={(event) => updateFilter('companySlug', event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
            >
              <option value="all">Todas</option>
              {companyOptions.map((company) => (
                <option key={company.value} value={company.value}>{company.label}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Número de remito
            <input
              type="number"
              min="1"
              value={filters.remitoNumber}
              onChange={(event) => updateFilter('remitoNumber', event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Desde
            <input
              type="date"
              value={filters.fromDate}
              onChange={(event) => updateFilter('fromDate', event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Hasta
            <input
              type="date"
              value={filters.toDate}
              onChange={(event) => updateFilter('toDate', event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Estado
            <select
              value={filters.status}
              onChange={(event) => updateFilter('status', event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
            >
              <option value="all">Todos</option>
              <option value="pending">Pending</option>
              <option value="post_report_extra">Extra posterior al reporte</option>
              <option value="archived">Archived</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Origen
            <select
              value={filters.origin}
              onChange={(event) => updateFilter('origin', event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
            >
              <option value="all">Todos</option>
              <option value="normal">Normal</option>
              <option value="admin_extra">Extra administrativo</option>
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={clearSearch} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700">
            Limpiar
          </button>
          <button type="submit" className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white">
            <Search className="mr-2 h-4 w-4" />
            Buscar
          </button>
        </div>
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-lg font-black text-slate-900">Búsqueda histórica</h2>
            <p className="text-xs font-semibold text-slate-500">
              {loading ? 'Buscando...' : `${total} resultados`}
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="rounded-lg border border-slate-300 p-2 disabled:opacity-50"
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span>Página {page} de {totalPages}</span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((current) => current + 1)}
              className="rounded-lg border border-slate-300 p-2 disabled:opacity-50"
              aria-label="Página siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {error && <p className="px-4 py-4 text-sm font-bold text-red-700">{error}</p>}
        {!error && !loading && rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm font-semibold text-slate-500">
            {hasSearched ? 'No hay pedidos que coincidan con la búsqueda.' : 'Usá los filtros para consultar el historial.'}
          </p>
        )}
        {!error && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full table-auto">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900 text-left">
                  <th className="min-w-[110px] px-4 py-3 text-xs font-bold uppercase text-slate-100">Fecha</th>
                  <th className="min-w-[220px] px-4 py-3 text-xs font-bold uppercase text-slate-100">Persona</th>
                  <th className="min-w-[220px] px-4 py-3 text-xs font-bold uppercase text-slate-100">Correo</th>
                  <th className="min-w-[170px] px-4 py-3 text-xs font-bold uppercase text-slate-100">Empresa</th>
                  <th className="min-w-[180px] px-4 py-3 text-xs font-bold uppercase text-slate-100">Ubicación</th>
                  <th className="min-w-[280px] px-4 py-3 text-xs font-bold uppercase text-slate-100">Cantidades</th>
                  <th className="min-w-[130px] px-4 py-3 text-xs font-bold uppercase text-slate-100">Estado</th>
                  <th className="min-w-[160px] px-4 py-3 text-xs font-bold uppercase text-slate-100">Origen</th>
                  <th className="min-w-[120px] px-4 py-3 text-xs font-bold uppercase text-slate-100">Remito</th>
                  <th className="min-w-[120px] px-4 py-3 text-xs font-bold uppercase text-slate-100">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((order, index) => (
                  <tr key={order.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'} hover:bg-slate-100`}>
                    <td className="border-b border-slate-200 px-4 py-4 text-sm font-bold text-slate-900">{formatDate(order.delivery_date)}</td>
                    <td className="border-b border-slate-200 px-4 py-4 text-sm font-semibold text-slate-900">{order.person_name || '-'}</td>
                    <td className="border-b border-slate-200 px-4 py-4 text-sm text-slate-700">{order.person_email || '-'}</td>
                    <td className="border-b border-slate-200 px-4 py-4 text-sm font-semibold text-slate-800">{order.company_name || order.organization || '-'}</td>
                    <td className="border-b border-slate-200 px-4 py-4 text-sm text-slate-700">
                      <div className="font-semibold">{order.location || '-'}</div>
                      {order.delivery_location && order.delivery_location !== order.location && (
                        <div className="text-xs font-semibold text-blue-700">Entrega: {order.delivery_location}</div>
                      )}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-4 text-sm text-slate-700">{getQuantitySummary(order)}</td>
                    <td className="border-b border-slate-200 px-4 py-4">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${getStatusColor(order.status)}`}>
                        {getStatusText(order.status)}
                      </span>
                    </td>
                    <td className="border-b border-slate-200 px-4 py-4 text-sm font-semibold text-slate-700">{getOriginLabel(order)}</td>
                    <td className="border-b border-slate-200 px-4 py-4 text-sm font-mono font-bold text-slate-900">{order.remito_number || '-'}</td>
                    <td className="border-b border-slate-200 px-4 py-4">
                      <button
                        type="button"
                        onClick={() => onViewOrder?.(order.id)}
                        className="rounded-lg border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-bold text-primary-700 hover:bg-primary-100"
                      >
                        Ver pedido
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

export default DailySearchPanel

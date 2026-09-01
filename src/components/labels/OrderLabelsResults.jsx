import { Printer, Package } from 'lucide-react'
import { buildLabelOrder } from '../../utils/labels/labelOrderUtils'

const formatDate = (value) => String(value || '').slice(0, 10) || 'Sin fecha'

const OrderLabelsResults = ({
  orders,
  loading,
  selectedIds,
  allVisibleSelected,
  totalCount,
  printState,
  printStateCounts,
  page,
  maxPage,
  pageSize,
  onToggleOrder,
  onSelectVisible,
  onUnselectVisible,
  onPrintOne,
  onPrintStateChange,
  onPageChange
}) => (
  <section className="rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-200/50 print-hide">
    <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
      <div>
        <h2 className="text-lg font-black text-slate-900">Resultados</h2>
        <p className="text-sm font-semibold text-slate-500">
          {loading ? 'Consultando pedidos...' : `${orders.length} visibles de ${totalCount} encontrados`}
        </p>
      </div>
      <button
        type="button"
        onClick={allVisibleSelected ? onUnselectVisible : onSelectVisible}
        disabled={orders.length === 0}
        className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {allVisibleSelected ? 'Quitar visibles' : 'Seleccionar todos visibles'}
      </button>
    </div>

    <div className="flex flex-wrap gap-2 border-b border-slate-200 px-4 py-3 md:px-6">
      {[
        ['pending', 'Falta imprimir', printStateCounts?.pending || 0],
        ['printed', 'Ya impreso', printStateCounts?.printed || 0],
        ['all', 'Todos', printStateCounts?.all || 0]
      ].map(([value, label, count]) => (
        <button
          key={value}
          type="button"
          onClick={() => onPrintStateChange(value)}
          className={`rounded-lg px-4 py-2 text-sm font-black ${
            printState === value
              ? 'bg-slate-900 text-white'
              : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          {label} ({count})
        </button>
      ))}
    </div>

    {loading ? (
      <div className="flex min-h-56 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-700" />
      </div>
    ) : orders.length === 0 ? (
      <div className="px-4 py-12 text-center">
        <Package className="mx-auto h-12 w-12 text-slate-400" />
        <h3 className="mt-3 text-base font-black text-slate-900">No hay coincidencias</h3>
        <p className="mt-1 text-sm font-semibold text-slate-500">Cambiá los filtros o limpiá la búsqueda.</p>
      </div>
    ) : (
      <>
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full table-auto">
            <thead>
              <tr className="bg-slate-900 text-left text-xs font-bold uppercase tracking-wide text-slate-100">
                <th className="px-4 py-3">Sel.</th>
                <th className="min-w-55 px-4 py-3">Cliente</th>
                <th className="min-w-40 px-4 py-3">Empresa</th>
                <th className="min-w-37.5 px-4 py-3">Entrega</th>
                <th className="min-w-27.5 px-4 py-3">Fecha</th>
                <th className="min-w-25 px-4 py-3">Servicio</th>
                <th className="min-w-70 px-4 py-3">Resumen</th>
                <th className="min-w-27.5 px-4 py-3">Estado</th>
                <th className="min-w-32 px-4 py-3">Impresión</th>
                <th className="min-w-37.5 px-4 py-3">Acción</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order, index) => {
                const label = buildLabelOrder(order)
                const selected = selectedIds.includes(order.id)
                return (
                  <tr key={order.id} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="border-b border-slate-200 px-4 py-4">
                      <input type="checkbox" checked={selected} onChange={() => onToggleOrder(order)} aria-label={`Seleccionar ${label.customerName}`} />
                    </td>
                    <td className="border-b border-slate-200 px-4 py-4">
                      <div className="font-black text-slate-900">{label.customerName}</div>
                      <div className="text-xs font-semibold text-slate-500">{label.customerEmail || 'Sin email'}</div>
                      {label.originLabel === 'Extra' && (
                        <span className="mt-1 inline-flex rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-black text-violet-800">
                          Extra
                        </span>
                      )}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-4 text-sm font-bold text-slate-700">{label.companyLabel}</td>
                    <td className="border-b border-slate-200 px-4 py-4 text-sm font-semibold text-slate-700">{label.deliveryLocation || 'Sin locación'}</td>
                    <td className="border-b border-slate-200 px-4 py-4 text-sm font-semibold text-slate-700">{formatDate(order.delivery_date)}</td>
                    <td className="border-b border-slate-200 px-4 py-4 text-sm font-bold text-slate-700">{label.serviceLabel}</td>
                    <td className="border-b border-slate-200 px-4 py-4 text-sm text-slate-700">
                      <div className="line-clamp-2 font-semibold">{label.itemsText}</div>
                      {label.beverages.length > 0 && <div className="text-xs font-bold text-blue-800">Bebida: {label.beverages.join(', ')}</div>}
                      {label.hasImportantNotes && <div className="mt-1 text-xs font-black uppercase text-slate-900">Atención: observaciones</div>}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-4 text-sm font-bold text-slate-700">{label.statusLabel}</td>
                    <td className="border-b border-slate-200 px-4 py-4 text-sm font-bold text-slate-700">
                      {order.label_printed_at ? (
                        <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-800">
                          Ya impreso
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-black text-amber-800">
                          Falta imprimir
                        </span>
                      )}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-4">
                      <button type="button" className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-xs font-black text-white hover:bg-blue-800" onClick={() => onPrintOne(order)}>
                        <Printer className="h-4 w-4" />
                        {order.label_printed_at ? 'Reimprimir' : 'Imprimir una'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 p-4 lg:hidden">
          {orders.map((order) => {
            const label = buildLabelOrder(order)
            const selected = selectedIds.includes(order.id)
            return (
              <article key={order.id} className="rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <input type="checkbox" className="mt-1" checked={selected} onChange={() => onToggleOrder(order)} aria-label={`Seleccionar ${label.customerName}`} />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-black text-slate-900">{label.customerName}</h3>
                    <p className="text-xs font-semibold text-slate-500">{label.customerEmail || 'Sin email'}</p>
                    {label.originLabel === 'Extra' && (
                      <span className="mt-1 inline-flex rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-black text-violet-800">
                        Extra
                      </span>
                    )}
                    <p className="mt-2 text-sm font-bold text-slate-700">{label.companyLabel} · {label.serviceLabel} · {formatDate(order.delivery_date)}</p>
                    <p className="mt-1 text-xs font-black uppercase text-slate-600">
                      {order.label_printed_at ? 'Ya impreso' : 'Falta imprimir'}
                    </p>
                    <p className="mt-1 text-sm text-slate-700">{label.itemsText}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button type="button" className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-black text-white" onClick={() => onPrintOne(order)}>{order.label_printed_at ? 'Reimprimir' : 'Imprimir una'}</button>
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </>
    )}

    <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-4 text-sm font-semibold text-slate-600 md:flex-row md:items-center md:justify-between md:px-6">
      <span>Página {page + 1} de {maxPage + 1} · límite {pageSize}</span>
      <div className="flex gap-2">
        <button type="button" disabled={page <= 0} onClick={() => onPageChange(page - 1)} className="rounded-lg border border-slate-300 px-3 py-2 font-bold disabled:opacity-50">Anterior</button>
        <button type="button" disabled={page >= maxPage} onClick={() => onPageChange(page + 1)} className="rounded-lg border border-slate-300 px-3 py-2 font-bold disabled:opacity-50">Siguiente</button>
      </div>
    </div>
  </section>
)

export default OrderLabelsResults

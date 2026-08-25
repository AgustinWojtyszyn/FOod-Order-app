import { useCallback } from 'react'
import { Printer, Tag, X } from 'lucide-react'
import { useAuthContext } from '../contexts/authContextValue'
import OrderLabelsFilters from './labels/OrderLabelsFilters'
import OrderLabelsResults from './labels/OrderLabelsResults'
import { useOrderLabels } from '../hooks/labels/useOrderLabels'
import { printOrderLabelsPdf } from '../utils/labels/labelPdfGenerator'
import './labels/order-labels.css'

const OrderLabelsPage = () => {
  const { isAdmin, isCompanyAdmin, adminCompanies } = useAuthContext()

  const labels = useOrderLabels({ isAdmin, isCompanyAdmin, adminCompanies })

  const startPrint = useCallback((ordersToPrint = []) => {
    const safeOrders = Array.isArray(ordersToPrint) ? ordersToPrint.filter(order => order?.id) : []
    if (safeOrders.length === 0) {
      labels.setPrintWarning('Seleccioná al menos un pedido para imprimir etiquetas.')
      return
    }

    const result = printOrderLabelsPdf(safeOrders, labels.copiesByOrderId)
    labels.setPrintWarning(result.error ? 'No se pudo generar el PDF de etiquetas. Intentá nuevamente.' : '')
  }, [labels])

  const printSelectedLabels = useCallback(() => {
    startPrint(labels.selectedOrders)
  }, [labels.selectedOrders, startPrint])

  return (
    <div className="order-labels-page mx-auto max-w-screen-2xl p-4 md:p-6 2xl:p-10">
      <div className="space-y-5">
        <section className="rounded-xl border border-white/30 bg-white p-5 shadow-xl shadow-blue-950/10 print-hide md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-700 text-white">
                <Tag className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-900 md:text-3xl">Etiquetas</h1>
                <p className="mt-1 text-sm font-semibold text-slate-600">
                  Buscar/filtrar → seleccionar pedidos → imprimir.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-black text-blue-900">
              {labels.selectedCount} etiqueta{labels.selectedCount === 1 ? '' : 's'} seleccionada{labels.selectedCount === 1 ? '' : 's'}
            </div>
          </div>
        </section>

        <OrderLabelsFilters
          filters={labels.filters}
          onFilterChange={labels.updateFilter}
          onClear={labels.clearFilters}
          companyOptions={labels.companyOptions}
          customerOptions={labels.customerOptions}
          accessLocations={labels.accessLocations}
        />

        {labels.error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800 print-hide">
            {labels.error}
          </div>
        )}

        {labels.printWarning && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 print-hide">
            {labels.printWarning}
          </div>
        )}

        {labels.visibleOrders.length > 0 && (
          <section className="sticky top-3 z-20 rounded-xl border border-blue-200 bg-white p-3 shadow-xl shadow-blue-950/10 print-hide">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {labels.selectedCount > 0 ? (
                    <>
                      {labels.selectedOrders.slice(0, 5).map(order => (
                        <button
                          key={order.id}
                          type="button"
                          onClick={() => labels.removeSelected(order.id)}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700"
                          title="Quitar de la selección"
                        >
                          {order.customer_name || order.user_name || order.user_email || 'Pedido'}
                          <X className="h-3 w-3" />
                        </button>
                      ))}
                      {labels.selectedCount > 5 && (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                          +{labels.selectedCount - 5} más
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-sm font-bold text-slate-700">
                      Seleccioná uno, varios o todos los pedidos visibles.
                    </span>
                  )}
                </div>
                {labels.selectedCount > 0 && (
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    {labels.selectedCount} pedido{labels.selectedCount === 1 ? '' : 's'} seleccionado{labels.selectedCount === 1 ? '' : 's'} · 1 pedido = 1 etiqueta
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={labels.allVisibleSelected ? labels.unselectVisible : labels.selectVisible}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50"
                >
                  {labels.allVisibleSelected ? 'Quitar visibles' : 'Seleccionar todos visibles'}
                </button>
                {labels.selectedCount > 0 && (
                  <button
                    type="button"
                    onClick={labels.clearSelected}
                    className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50"
                  >
                    Limpiar selección
                  </button>
                )}
                <button
                  type="button"
                  onClick={printSelectedLabels}
                  disabled={labels.selectedCount === 0}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 text-sm font-black text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Printer className="h-4 w-4" />
                  Imprimir seleccionados
                </button>
              </div>
            </div>
          </section>
        )}

        <OrderLabelsResults
          orders={labels.visibleOrders}
          loading={labels.loading}
          selectedIds={labels.selectedIds}
          copiesByOrderId={labels.copiesByOrderId}
          allVisibleSelected={labels.allVisibleSelected}
          totalCount={labels.totalCount}
          printState={labels.printState}
          printStateCounts={labels.printStateCounts}
          page={labels.page}
          maxPage={labels.maxPage}
          pageSize={labels.pageSize}
          onToggleOrder={labels.toggleOrder}
          onSelectVisible={labels.selectVisible}
          onUnselectVisible={labels.unselectVisible}
          onCopiesChange={labels.setCopiesForOrder}
          onCopiesFromRations={labels.setCopiesFromRations}
          onPrintOne={(order) => startPrint([order])}
          onPrintStateChange={labels.updatePrintState}
          onPageChange={labels.setPage}
        />
      </div>
    </div>
  )
}

export default OrderLabelsPage

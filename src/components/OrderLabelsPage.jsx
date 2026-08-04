import { useState } from 'react'
import { Printer, Tag, X } from 'lucide-react'
import { useAuthContext } from '../contexts/authContextValue'
import OrderLabelsFilters from './labels/OrderLabelsFilters'
import OrderLabelsPreview from './labels/OrderLabelsPreview'
import OrderLabelsResults from './labels/OrderLabelsResults'
import { useOrderLabels } from '../hooks/labels/useOrderLabels'
import './labels/order-labels.css'

const OrderLabelsPage = () => {
  const { isAdmin, isCompanyAdmin, adminCompanies } = useAuthContext()
  const [printFormat, setPrintFormat] = useState('a4')
  const [a4Columns, setA4Columns] = useState(2)
  const [thermalPreset, setThermalPreset] = useState('100x50')
  const [customThermalSize, setCustomThermalSize] = useState({ width: 100, height: 50 })

  const labels = useOrderLabels({ isAdmin, isCompanyAdmin, adminCompanies })

  const printLabels = () => {
    window.requestAnimationFrame(() => window.print())
  }

  return (
    <div className="mx-auto max-w-screen-2xl p-4 md:p-6 2xl:p-10">
      {!labels.previewMode ? (
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
                    Buscar/filtrar → seleccionar pedidos → elegir formato → revisar → imprimir.
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

          {labels.selectedCount > 0 && (
            <section className="sticky top-3 z-20 rounded-xl border border-blue-200 bg-white p-3 shadow-xl shadow-blue-950/10 print-hide">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap gap-2">
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
                </div>
                <button
                  type="button"
                  onClick={() => labels.enterPreview()}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 text-sm font-black text-white hover:bg-blue-800"
                >
                  <Printer className="h-4 w-4" />
                  Imprimir etiquetas
                </button>
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
            page={labels.page}
            maxPage={labels.maxPage}
            pageSize={labels.pageSize}
            onToggleOrder={labels.toggleOrder}
            onSelectVisible={labels.selectVisible}
            onUnselectVisible={labels.unselectVisible}
            onCopiesChange={labels.setCopiesForOrder}
            onCopiesFromRations={labels.setCopiesFromRations}
            onPrintOne={labels.enterPreview}
            onPageChange={labels.setPage}
          />
        </div>
      ) : (
        <OrderLabelsPreview
          selectedOrders={labels.selectedOrders}
          copiesByOrderId={labels.copiesByOrderId}
          printFormat={printFormat}
          setPrintFormat={setPrintFormat}
          a4Columns={a4Columns}
          setA4Columns={setA4Columns}
          thermalPreset={thermalPreset}
          setThermalPreset={setThermalPreset}
          customThermalSize={customThermalSize}
          setCustomThermalSize={setCustomThermalSize}
          onBack={labels.cancelPreview}
          onCancel={labels.cancelPreview}
          onPrint={printLabels}
        />
      )}
    </div>
  )
}

export default OrderLabelsPage

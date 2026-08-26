import { ArrowLeft, Download, Printer, X } from 'lucide-react'
import { buildLabelOrder } from '../../utils/labels/labelOrderUtils'
import OrderLabelCard from './OrderLabelCard'

const OrderLabelsPreview = ({
  selectedOrders,
  onBack,
  onCancel,
  onPrint,
  onDownloadZpl
}) => {
  const labels = selectedOrders.map((order, index) => ({
    ...buildLabelOrder(order),
    labelInstanceId: order?.id || `selected-${index}`
  }))

  return (
    <section className="labels-preview-root">
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-lg shadow-slate-200/50 print-hide">
        <div>
          <h2 className="text-xl font-black text-slate-900">Vista previa de etiquetas</h2>
          <p className="text-sm font-semibold text-slate-500">
            {labels.length} etiqueta{labels.length === 1 ? '' : 's'} · 64 x 32 mm · 1 pedido = 1 etiqueta
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
            <ArrowLeft className="h-4 w-4" />
            Volver a editar selección
          </button>
          <button type="button" onClick={onCancel} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
            <X className="h-4 w-4" />
            Cancelar vista previa
          </button>
          <button type="button" onClick={onDownloadZpl} disabled={labels.length === 0} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
            <Download className="h-4 w-4" />
            Descargar ZPL
          </button>
          <button type="button" onClick={onPrint} disabled={labels.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-black text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
            <Printer className="h-4 w-4" />
            Imprimir desde navegador
          </button>
        </div>
      </div>

      <div className="labels-print-surface">
        {labels.map(label => (
          <OrderLabelCard key={label.labelInstanceId} label={label} />
        ))}
      </div>
    </section>
  )
}

export default OrderLabelsPreview

import { ArrowLeft, Printer, X } from 'lucide-react'
import { buildLabelOrder } from '../../utils/labels/labelOrderUtils'
import {
  LABEL_HEIGHT_CSS,
  LABEL_DIMENSIONS_TEXT,
  LABEL_PAGE_SIZE_CSS,
  LABEL_SAFE_PADDING_X_CSS,
  LABEL_SAFE_PADDING_Y_CSS,
  LABEL_WIDTH_CSS
} from '../../utils/labels/labelPrintGeometry'
import OrderLabelCard from './OrderLabelCard'

const OrderLabelsPreview = ({
  selectedOrders,
  printing = false,
  onBack,
  onCancel,
  onPrint
}) => {
  const labels = selectedOrders.map((order, index) => ({
    ...buildLabelOrder(order),
    labelInstanceId: order?.id || `selected-${index}`
  }))

  return (
    <section
      className="labels-preview-root"
      style={{
        '--label-width': LABEL_WIDTH_CSS,
        '--label-height': LABEL_HEIGHT_CSS,
        '--label-safe-x': LABEL_SAFE_PADDING_X_CSS,
        '--label-safe-y': LABEL_SAFE_PADDING_Y_CSS
      }}
    >
      <style media="print">
        {`@page { size: ${LABEL_PAGE_SIZE_CSS}; margin: 0; }`}
      </style>

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-lg shadow-slate-200/50 print-hide">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-900">Vista previa de etiquetas</h2>
            <p className="text-sm font-semibold text-slate-500">
              {labels.length} etiqueta{labels.length === 1 ? '' : 's'} · {LABEL_DIMENSIONS_TEXT} · 1 pedido = 1 etiqueta
            </p>
          </div>
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
          <button type="button" onClick={onPrint} disabled={labels.length === 0 || printing} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-black text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
            <Printer className="h-4 w-4" />
            {printing ? 'Abriendo impresión...' : 'Imprimir etiquetas'}
          </button>
        </div>
        <p className="mt-3 text-xs font-bold text-slate-500 print-hide">
          Para Zebra: {LABEL_DIMENSIONS_TEXT} · 100 % · Sin márgenes · 1 página por hoja. Si Chrome muestra una hoja grande alrededor de la etiqueta, revisá el tamaño de papel de ZDesigner GC420t.
        </p>
      </div>

      <div className="labels-print-root labels-print-surface" aria-label="Etiquetas seleccionadas para imprimir">
        {labels.map(label => (
          <OrderLabelCard key={label.labelInstanceId} label={label} />
        ))}
      </div>
    </section>
  )
}

export default OrderLabelsPreview

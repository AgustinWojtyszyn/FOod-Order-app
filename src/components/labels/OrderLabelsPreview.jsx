import { ArrowLeft, Printer, X } from 'lucide-react'
import { expandLabelsForCopies } from '../../utils/labels/labelOrderUtils'
import OrderLabelCard from './OrderLabelCard'

const THERMAL_LIMITS = {
  width: { min: 40, max: 150, fallback: 100 },
  height: { min: 25, max: 100, fallback: 50 }
}

const estimateA4Sheets = (count, columns) => {
  const perSheet = Number(columns) === 3 ? 12 : 8
  return Math.max(Math.ceil(count / perSheet), 1)
}

const normalizeThermalMillimeters = (value, { min, max, fallback }) => {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(parsed, min), max)
}

const OrderLabelsPreview = ({
  selectedOrders,
  copiesByOrderId,
  printFormat,
  setPrintFormat,
  a4Columns,
  setA4Columns,
  thermalPreset,
  setThermalPreset,
  customThermalSize,
  setCustomThermalSize,
  onBack,
  onCancel,
  onPrint,
  showControls = true,
  screenHidden = false
}) => {
  const labels = expandLabelsForCopies(selectedOrders, copiesByOrderId)
  const thermalSize = thermalPreset === 'custom' ? customThermalSize : {
    '100x50': { width: 100, height: 50 },
    '80x50': { width: 80, height: 50 }
  }[thermalPreset]
  const width = normalizeThermalMillimeters(thermalSize?.width, THERMAL_LIMITS.width)
  const height = normalizeThermalMillimeters(thermalSize?.height, THERMAL_LIMITS.height)
  const approxSheets = printFormat === 'a4' ? estimateA4Sheets(labels.length, a4Columns) : labels.length
  const previewModeClass = printFormat === 'thermal' ? 'labels-preview-thermal' : 'labels-preview-a4'
  const printPageSize = printFormat === 'thermal'
    ? `${width}mm ${height}mm`
    : 'A4'

  const updateCustomThermalSize = (dimension, value) => {
    const limits = THERMAL_LIMITS[dimension]
    const parsed = Number(String(value ?? '').replace(',', '.'))
    const nextValue = Number.isFinite(parsed) && parsed > limits.max ? limits.max : value
    setCustomThermalSize(prev => ({ ...prev, [dimension]: nextValue }))
  }

  const normalizeCustomThermalSize = (dimension) => {
    const limits = THERMAL_LIMITS[dimension]
    setCustomThermalSize(prev => ({
      ...prev,
      [dimension]: normalizeThermalMillimeters(prev?.[dimension], limits)
    }))
  }

  return (
    <section
      className={`labels-preview-root ${previewModeClass}${screenHidden ? ' labels-print-root-screen-hidden' : ''}`}
      style={{
        '--label-a4-columns': a4Columns,
        '--thermal-label-width': `${width}mm`,
        '--thermal-label-height': `${height}mm`
      }}
    >
      <style media="print">
        {`@page { size: ${printPageSize}; margin: 0; }`}
      </style>

      {showControls && (
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-lg shadow-slate-200/50 print-hide">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-900">Vista previa de etiquetas</h2>
            <p className="text-sm font-semibold text-slate-500">
              {labels.length} etiqueta{labels.length === 1 ? '' : 's'} final{labels.length === 1 ? '' : 'es'} · {printFormat === 'a4' ? `${approxSheets} hoja${approxSheets === 1 ? '' : 's'} A4 aprox.` : `${approxSheets} página${approxSheets === 1 ? '' : 's'} térmica${approxSheets === 1 ? '' : 's'}`}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-4 xl:min-w-[760px]">
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-slate-600">Formato</span>
              <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={printFormat} onChange={event => setPrintFormat(event.target.value)}>
                <option value="a4">Hoja A4</option>
                <option value="thermal">Etiqueta térmica</option>
              </select>
            </label>

            {printFormat === 'a4' ? (
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase text-slate-600">Densidad</span>
                <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={a4Columns} onChange={event => setA4Columns(Number(event.target.value))}>
                  <option value={2}>2 columnas</option>
                  <option value={3}>3 columnas</option>
                </select>
              </label>
            ) : (
              <>
                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase text-slate-600">Tamaño</span>
                  <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={thermalPreset} onChange={event => setThermalPreset(event.target.value)}>
                    <option value="100x50">100 x 50 mm</option>
                    <option value="80x50">80 x 50 mm</option>
                    <option value="custom">Personalizado</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase text-slate-600">Ancho mm</span>
                  <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100" type="number" min="40" max="150" step="1" disabled={thermalPreset !== 'custom'} value={customThermalSize.width} onChange={event => updateCustomThermalSize('width', event.target.value)} onBlur={() => normalizeCustomThermalSize('width')} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase text-slate-600">Alto mm</span>
                  <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100" type="number" min="25" max="100" step="1" disabled={thermalPreset !== 'custom'} value={customThermalSize.height} onChange={event => updateCustomThermalSize('height', event.target.value)} onBlur={() => normalizeCustomThermalSize('height')} />
                </label>
              </>
            )}
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
          <button type="button" onClick={onPrint} disabled={labels.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-black text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
            <Printer className="h-4 w-4" />
            Imprimir etiquetas
          </button>
        </div>
      </div>
      )}

      <div className={`labels-print-surface ${printFormat === 'thermal' ? 'labels-print-thermal' : 'labels-print-a4'}`}>
        {labels.map(label => (
          <OrderLabelCard key={label.labelInstanceId} label={label} />
        ))}
      </div>
    </section>
  )
}

export default OrderLabelsPreview

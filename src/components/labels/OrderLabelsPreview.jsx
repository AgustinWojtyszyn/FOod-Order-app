import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, Printer, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { expandLabelsForCopies } from '../../utils/labels/labelOrderUtils'
import {
  DEFAULT_THERMAL_LABEL_SAFE_AREA_MM,
  THERMAL_LABEL_LIMITS,
  THERMAL_LABEL_PRESETS,
  getThermalLabelContentGeometry,
  normalizeThermalMillimeters
} from './labelPrintConfig'
import OrderLabelCard from './OrderLabelCard'

const estimateA4Sheets = (count, columns) => {
  const perSheet = Number(columns) === 3 ? 12 : 8
  return Math.max(Math.ceil(count / perSheet), 1)
}

const PX_TO_MM = 25.4 / 96

const toMm = (value = 0) => `${(Number(value || 0) * PX_TO_MM).toFixed(2)}mm`
const pxToMmNumber = (value = 0) => Number((Number(value || 0) * PX_TO_MM).toFixed(2))

const isNearMm = (actual, expected, tolerance = 0.6) => Math.abs(Number(actual) - Number(expected)) <= tolerance

const getRectMetrics = (element, pageRect = null) => {
  if (!element) return null
  const rect = element.getBoundingClientRect()
  return {
    left: pageRect ? rect.left - pageRect.left : rect.left,
    top: pageRect ? rect.top - pageRect.top : rect.top,
    right: pageRect ? rect.right - pageRect.left : rect.right,
    bottom: pageRect ? rect.bottom - pageRect.top : rect.bottom,
    width: rect.width,
    height: rect.height
  }
}

const classifyDiagnostics = ({ page, content, expectedWidth, expectedHeight, safeArea } = {}) => {
  if (!page || !content) return 'Pendiente: imprimí o actualizá para medir el DOM.'

  const pageWidth = pxToMmNumber(page.width)
  const pageHeight = pxToMmNumber(page.height)
  const safeLeft = pxToMmNumber(content.left)
  const safeTop = pxToMmNumber(content.top)
  const safeRight = pxToMmNumber(content.right)
  const expectedSafeRight = Number(expectedWidth) - Number(safeArea.right)

  if (!isNearMm(pageWidth, expectedWidth) || !isNearMm(pageHeight, expectedHeight)) {
    return 'TAMANO/ESCALA: el navegador o driver esta escalando/cambiando el tamano fisico.'
  }

  if (!isNearMm(safeLeft, safeArea.left) || !isNearMm(safeTop, safeArea.top) || safeRight > expectedWidth || !isNearMm(safeRight, expectedSafeRight)) {
    return 'CSS: el area segura no coincide con la geometria compensada.'
  }

  return 'DOM OK: safe-left 4mm aplicado sin exceder 100mm.'
}

const formatDiagnostics = ({ index, page, content, card, expectedWidth, expectedHeight, safeArea } = {}) => {
  if (!page || !content || !card) {
    return [
      `Etiqueta ${index}`,
      `Esperado: ${expectedWidth}x${expectedHeight}mm`,
      `Safe: L ${safeArea.left} R ${safeArea.right} T ${safeArea.top} B ${safeArea.bottom}mm`
    ]
  }

  return [
    `Etiqueta ${index}`,
    `Clasificacion: ${classifyDiagnostics({ page, content, expectedWidth, expectedHeight, safeArea })}`,
    `Page rect: ${toMm(page.width)} x ${toMm(page.height)}`,
    `Page offset: L ${toMm(page.left)} T ${toMm(page.top)}`,
    `Safe rect: ${toMm(content.width)} x ${toMm(content.height)}`,
    `Safe offset: L ${toMm(content.left)} T ${toMm(content.top)} R ${toMm(content.right)} B ${toMm(content.bottom)}`,
    `Card rect: ${toMm(card.width)} x ${toMm(card.height)}`,
    `Card offset: L ${toMm(card.left)} T ${toMm(card.top)} R ${toMm(card.right)} B ${toMm(card.bottom)}`,
    `Esperado: ${expectedWidth}x${expectedHeight}mm | Safe L ${safeArea.left} R ${safeArea.right} T ${safeArea.top} B ${safeArea.bottom}mm`
  ]
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
  screenHidden = false,
  diagnosticsEnabled = false
}) => {
  const previewRef = useRef(null)
  const [diagnostics, setDiagnostics] = useState([])
  const labels = expandLabelsForCopies(selectedOrders, copiesByOrderId)
  const thermalSize = thermalPreset === 'custom' ? customThermalSize : THERMAL_LABEL_PRESETS[thermalPreset]
  const labelGeometry = getThermalLabelContentGeometry(thermalSize, DEFAULT_THERMAL_LABEL_SAFE_AREA_MM)
  const { width, height, safeArea, contentWidth, contentHeight } = labelGeometry
  const approxSheets = printFormat === 'a4' ? estimateA4Sheets(labels.length, a4Columns) : labels.length
  const previewModeClass = printFormat === 'thermal' ? 'labels-preview-thermal' : 'labels-preview-a4'
  const printPageSize = printFormat === 'thermal'
    ? `${width}mm ${height}mm`
    : 'A4'

  const measureDiagnostics = useCallback(() => {
    if (!diagnosticsEnabled || !previewRef.current) return
    const nextDiagnostics = [...previewRef.current.querySelectorAll('.print-label')].map((labelElement, index) => {
      const pageRect = labelElement.getBoundingClientRect()
      return {
        index: index + 1,
        page: getRectMetrics(labelElement),
        content: getRectMetrics(labelElement.querySelector('.label-content'), pageRect),
        card: getRectMetrics(labelElement.querySelector('.sf-label-card'), pageRect)
      }
    })
    setDiagnostics(nextDiagnostics)
  }, [diagnosticsEnabled])

  useLayoutEffect(() => {
    if (!diagnosticsEnabled) {
      setDiagnostics([])
      return undefined
    }

    const frame = window.requestAnimationFrame(measureDiagnostics)
    window.addEventListener('beforeprint', measureDiagnostics)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('beforeprint', measureDiagnostics)
    }
  }, [
    diagnosticsEnabled,
    labels.length,
    measureDiagnostics,
    width,
    height,
    safeArea.left,
    safeArea.right,
    safeArea.top,
    safeArea.bottom
  ])

  const updateCustomThermalSize = (dimension, value) => {
    const limits = THERMAL_LABEL_LIMITS[dimension]
    const parsed = Number(String(value ?? '').replace(',', '.'))
    const nextValue = Number.isFinite(parsed) && parsed > limits.max ? limits.max : value
    setCustomThermalSize(prev => ({ ...prev, [dimension]: nextValue }))
  }

  const normalizeCustomThermalSize = (dimension) => {
    const limits = THERMAL_LABEL_LIMITS[dimension]
    setCustomThermalSize(prev => ({
      ...prev,
      [dimension]: normalizeThermalMillimeters(prev?.[dimension], limits)
    }))
  }

  const preview = (
    <section
      ref={previewRef}
      className={`labels-preview-root ${previewModeClass}${screenHidden ? ' labels-print-root-screen-hidden' : ''}${diagnosticsEnabled ? ' labels-diagnostics-enabled' : ''}`}
      style={{
        '--label-a4-columns': a4Columns,
        '--thermal-label-width': `${width}mm`,
        '--thermal-label-height': `${height}mm`,
        '--thermal-label-safe-left': `${safeArea.left}mm`,
        '--thermal-label-safe-right': `${safeArea.right}mm`,
        '--thermal-label-safe-top': `${safeArea.top}mm`,
        '--thermal-label-safe-bottom': `${safeArea.bottom}mm`,
        '--thermal-label-content-width': `${contentWidth}mm`,
        '--thermal-label-content-height': `${contentHeight}mm`
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

      <div className={`labels-print-surface labels-print-container ${printFormat === 'thermal' ? 'labels-print-thermal' : 'labels-print-a4'}`}>
        {labels.map((label, index) => (
          <div className="print-label" key={label.labelInstanceId}>
            <div className="label-content">
              <OrderLabelCard label={label} />
              {diagnosticsEnabled && (
                <pre className="label-diagnostics-panel" aria-hidden="true">
                  {formatDiagnostics({
                    ...(diagnostics.find((item) => item.index === index + 1) || { index: index + 1 }),
                    expectedWidth: width,
                    expectedHeight: height,
                    safeArea
                  }).join('\n')}
                </pre>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )

  if (screenHidden && typeof document !== 'undefined') {
    return createPortal(preview, document.body)
  }

  return preview
}

export default OrderLabelsPreview

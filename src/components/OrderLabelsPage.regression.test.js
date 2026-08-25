import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  DEFAULT_THERMAL_LABEL_SAFE_AREA_MM,
  DEFAULT_THERMAL_LABEL_SIZE,
  getThermalLabelContentGeometry
} from './labels/labelPrintConfig'
import {
  LABEL_PDF_PAGE_SIZE_PT,
  createOrderLabelsPdfDocument,
  getPdfPageSizes
} from '../utils/labels/labelPdfGenerator'

const pageSource = readFileSync(new URL('./OrderLabelsPage.jsx', import.meta.url), 'utf8')
const previewSource = readFileSync(new URL('./labels/OrderLabelsPreview.jsx', import.meta.url), 'utf8')
const resultsSource = readFileSync(new URL('./labels/OrderLabelsResults.jsx', import.meta.url), 'utf8')
const cssSource = readFileSync(new URL('./labels/order-labels.css', import.meta.url), 'utf8')
const configSource = readFileSync(new URL('./labels/labelPrintConfig.js', import.meta.url), 'utf8')
const pdfSource = readFileSync(new URL('../utils/labels/labelPdfGenerator.js', import.meta.url), 'utf8')

const buildSampleOrder = (id) => ({
  id,
  customer_name: `Cliente ${id}`,
  company: 'ServiFoo',
  delivery_date: '2026-08-25',
  service: 'lunch',
  total_items: 1,
  items: [{ name: 'Milanesa con guarnición', quantity: 1 }],
  custom_responses: [
    { title: 'Bebida', response: 'Agua' },
    { title: 'Fruta o postre', response: 'Fruta' }
  ]
})

const expectPdfSize = (pdf, expectedPages) => {
  expect(pdf.getNumberOfPages()).toBe(expectedPages)
  getPdfPageSizes(pdf).forEach((page) => {
    expect(page.widthMm).toBeCloseTo(100, 4)
    expect(page.heightMm).toBeCloseTo(50, 4)
    expect(page.widthPt).toBeCloseTo(LABEL_PDF_PAGE_SIZE_PT[0], 2)
    expect(page.heightPt).toBeCloseTo(LABEL_PDF_PAGE_SIZE_PT[1], 2)
  })
}

describe('order labels print flow', () => {
  it('prints directly from the selected labels without entering preview mode', () => {
    expect(pageSource).toContain('onClick={printSelectedLabels}')
    expect(pageSource).toContain('printOrderLabelsPdf(safeOrders, labels.copiesByOrderId)')
    expect(pageSource).not.toContain('window.print()')
    expect(pageSource).not.toContain('OrderLabelsPreview')
    expect(pageSource).not.toContain('flushSync')
    expect(pageSource).not.toContain('printBatch')
    expect(pageSource).not.toContain('labels-print-mode')
    expect(pageSource).not.toContain('labels-print-root')
    expect(pageSource).not.toContain('afterprint')
    expect(pageSource).not.toContain('labels.markPrinted')
    expect(pageSource).not.toContain('localStorage')
    expect(pageSource).not.toContain('labelPrintOffsetX')
    expect(pageSource).not.toContain('labelPrintOffsetY')
    expect(pageSource).not.toContain('Imprimir prueba de calibración')
    expect(pageSource).not.toContain('Reset calibración')
    expect(pageSource).toContain('Seleccionar todos visibles')
    expect(pageSource).toContain('1 pedido = 1 etiqueta')
    expect(pageSource).not.toContain('labels.enterPreview')
    expect(pageSource).not.toContain('labels.previewMode')
    expect(pdfSource).toContain("unit: 'mm'")
    expect(pdfSource).toContain('format: LABEL_PDF_PAGE_SIZE_MM')
    expect(pdfSource).toContain("orientation: 'landscape'")
    expect(pdfSource).toContain('pdf.addPage(LABEL_PDF_PAGE_SIZE_MM, \'landscape\')')
    expect(pdfSource).toContain("pdf.autoPrint({ variant: 'non-conform' })")
    expect(pdfSource).toContain("window.open(url, '_blank', 'noopener,noreferrer')")
    expect(pdfSource).not.toContain('window.print()')
    expect(pdfSource).not.toContain('createElement(\'iframe\')')
    expect(pdfSource).not.toContain('contentWindow')
  })

  it('separates printed and pending labels and keeps printed labels reprintable', () => {
    expect(resultsSource).toContain('Falta imprimir')
    expect(resultsSource).toContain('Ya impreso')
    expect(resultsSource).toContain('Reimprimir')
    expect(resultsSource).toContain('onPrintStateChange')
  })

  it('generates one physical 100 x 50 mm PDF page per selected label', () => {
    const geometry = getThermalLabelContentGeometry()
    const one = createOrderLabelsPdfDocument([buildSampleOrder('order-1')], {})
    const two = createOrderLabelsPdfDocument([buildSampleOrder('order-1'), buildSampleOrder('order-2')], {})
    const five = createOrderLabelsPdfDocument([
      buildSampleOrder('order-1'),
      buildSampleOrder('order-2'),
      buildSampleOrder('order-3'),
      buildSampleOrder('order-4'),
      buildSampleOrder('order-5')
    ], {})

    expect(DEFAULT_THERMAL_LABEL_SIZE.width).toBe(100)
    expect(DEFAULT_THERMAL_LABEL_SIZE.height).toBe(50)
    expect(DEFAULT_THERMAL_LABEL_SAFE_AREA_MM.left).toBe(4)
    expect(DEFAULT_THERMAL_LABEL_SAFE_AREA_MM.right).toBe(2)
    expect(DEFAULT_THERMAL_LABEL_SAFE_AREA_MM.top).toBe(2)
    expect(DEFAULT_THERMAL_LABEL_SAFE_AREA_MM.bottom).toBe(2)
    expect(geometry.contentWidth).toBe(94)
    expect(geometry.contentHeight).toBe(46)
    expect(geometry.rightEdge + DEFAULT_THERMAL_LABEL_SAFE_AREA_MM.right).toBe(100)
    expect(geometry.bottomEdge + DEFAULT_THERMAL_LABEL_SAFE_AREA_MM.bottom).toBe(50)
    expect(one.labels).toHaveLength(1)
    expect(two.labels).toHaveLength(2)
    expect(five.labels).toHaveLength(5)
    expectPdfSize(one.pdf, 1)
    expectPdfSize(two.pdf, 2)
    expectPdfSize(five.pdf, 5)
    expect(one.pdf.output()).toContain('/MediaBox [0 0 283.4645669291338663 141.7322834645669332]')

    expect(cssSource).not.toContain('scale(')
    expect(cssSource).not.toContain('zoom')
    expect(cssSource).not.toContain('rotate(')
    expect(cssSource).not.toContain('translate(var(--label-offset-x')
    expect(cssSource).not.toContain('@page')
    expect(cssSource).not.toContain('@media print')
    expect(cssSource).not.toContain('labels-print-mode')
    expect(cssSource).not.toContain('labels-print-root')
    expect(cssSource).not.toContain('.print-label--has-next')
    expect(cssSource).not.toContain('.print-label:last-child')
    expect(previewSource).not.toContain('@page')
    expect(previewSource).not.toContain('createPortal')
    expect(previewSource).not.toContain('screenHidden')
    expect(previewSource).not.toContain('labels-print-root')
    expect(cssSource).not.toContain('body:has(')
    expect(cssSource).not.toContain('visibility: hidden')
    expect(previewSource).toContain('--thermal-label-safe-left')
    expect(previewSource).toContain('--thermal-label-safe-right')
    expect(previewSource).toContain('--thermal-label-safe-top')
    expect(previewSource).toContain('--thermal-label-safe-bottom')
    expect(previewSource).toContain('--thermal-label-content-width')
    expect(previewSource).toContain('--thermal-label-content-height')
    expect(previewSource).toContain('getBoundingClientRect()')
    expect(previewSource).toContain('Clasificacion')
    expect(previewSource).toContain('TAMANO/ESCALA')
    expect(previewSource).toContain('DOM OK')
    expect(previewSource).toContain("window.addEventListener('beforeprint', measureDiagnostics)")
    expect(previewSource).toContain('labels-print-container')
    expect(previewSource).toContain('className="print-label"')
    expect(previewSource).toContain('className="label-content"')
    expect(previewSource).not.toContain('label-calibration-test')
    expect(cssSource).toContain('.label-diagnostics-panel')
    expect(configSource).not.toContain('labelPrintOffsetX')
    expect(configSource).not.toContain('labelPrintOffsetY')
    expect(configSource).not.toContain('localStorage')
  })
})

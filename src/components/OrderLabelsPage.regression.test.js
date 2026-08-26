import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { expandLabelsForCopies } from '../utils/labels/labelOrderUtils'

const pageSource = readFileSync(new URL('./OrderLabelsPage.jsx', import.meta.url), 'utf8')
const previewSource = readFileSync(new URL('./labels/OrderLabelsPreview.jsx', import.meta.url), 'utf8')
const cardSource = readFileSync(new URL('./labels/OrderLabelCard.jsx', import.meta.url), 'utf8')
const resultsSource = readFileSync(new URL('./labels/OrderLabelsResults.jsx', import.meta.url), 'utf8')
const cssSource = readFileSync(new URL('./labels/order-labels.css', import.meta.url), 'utf8')

const buildSampleOrder = (id) => ({
  id,
  customer_name: `Cliente ${id}`,
  company: 'ServiFoo',
  delivery_date: '2026-08-25',
  service: 'lunch',
  total_items: 1,
  items: [{ name: 'Opcion 4 - Bife del dia con ensalada completa de hojas verdes y vegetales', quantity: 1 }],
  custom_responses: [
    { title: 'Guarnicion', response: 'Pure' },
    { title: 'Bebida', response: 'Agua' },
    { title: 'Fruta o postre', response: 'Fruta' }
  ]
})

describe('order labels print flow', () => {
  it('uses the August 5 DOM print pipeline for selected labels', () => {
    expect(pageSource).toContain("useState('thermal')")
    expect(pageSource).toContain('OrderLabelsPreview')
    expect(pageSource).toContain('window.requestAnimationFrame(() => window.print())')
    expect(pageSource).toContain('onClick={() => labels.enterPreview()}')
    expect(pageSource).toContain('disabled={labels.selectedCount === 0}')
    expect(pageSource).toContain('selectedOrders={labels.selectedOrders}')
    expect(pageSource).toContain('1 pedido = 1 etiqueta')
    expect(pageSource).not.toContain('printOrderLabelsPdf')
    expect(pageSource).not.toContain('localStorage')
    expect(pageSource).not.toContain('labelPrintOffsetX')
    expect(pageSource).not.toContain('labelPrintOffsetY')
  })

  it('keeps the August 5 physical print geometry and page breaks', () => {
    expect(previewSource).toContain('const THERMAL_LIMITS = {')
    expect(previewSource).toContain("'100x50': { width: 100, height: 50 }")
    expect(previewSource).toContain("'80x50': { width: 80, height: 50 }")
    expect(previewSource).toContain('const printPageSize = printFormat ===')
    expect(previewSource).toContain('<style media="print">')
    expect(previewSource).toContain('@page { size: ${printPageSize}; margin: 0; }')
    expect(previewSource).toContain('labels.map(label =>')
    expect(previewSource).not.toContain('getBoundingClientRect')
    expect(previewSource).not.toContain('diagnostics')
    expect(previewSource).not.toContain('safeArea')
    expect(previewSource).not.toContain('label-content')

    expect(cardSource).toContain('sf-label-card print-label')

    expect(cssSource).toContain('@media print')
    expect(cssSource).toContain('@page')
    expect(cssSource).toContain('size: A4')
    expect(cssSource).toContain('margin: 0')
    expect(cssSource).toContain('body *')
    expect(cssSource).toContain('visibility: hidden !important')
    expect(cssSource).toContain('.labels-preview-root')
    expect(cssSource).toContain('visibility: visible !important')
    expect(cssSource).toContain('.print-hide')
    expect(cssSource).toContain('display: none !important')
    expect(cssSource).toContain('.labels-print-thermal .print-label:not(:last-child)')
    expect(cssSource).toContain('break-after: page')
    expect(cssSource).toContain('page-break-after: always')
    expect(cssSource).not.toContain('scale(')
    expect(cssSource).not.toContain('zoom')
    expect(cssSource).not.toContain('rotate(')
    expect(cssSource).not.toContain('translate(')
    expect(cssSource).not.toContain('label-offset')
    expect(cssSource).not.toContain('label-diagnostics')
    expect(cssSource).not.toContain('min-height: 100vh')
  })

  it('selection changes which labels exist, not the label geometry', () => {
    const one = expandLabelsForCopies([buildSampleOrder('order-1')], {})
    const five = expandLabelsForCopies([
      buildSampleOrder('order-1'),
      buildSampleOrder('order-2'),
      buildSampleOrder('order-3'),
      buildSampleOrder('order-4'),
      buildSampleOrder('order-5')
    ], {})
    const none = expandLabelsForCopies([], {})

    expect(one).toHaveLength(1)
    expect(five).toHaveLength(5)
    expect(none).toHaveLength(0)
    expect(new Set(five.map(label => label.labelInstanceId)).size).toBe(5)
  })

  it('preserves current selection and print-state controls around the print layout', () => {
    expect(pageSource).toContain('Seleccionar todos visibles')
    expect(pageSource).toContain('Limpiar selección')
    expect(pageSource).toContain('Imprimir seleccionados')
    expect(resultsSource).toContain('Falta imprimir')
    expect(resultsSource).toContain('Ya impreso')
    expect(resultsSource).toContain('Reimprimir')
    expect(resultsSource).toContain('onPrintStateChange')
  })
})

import React from 'react'
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import OrderLabelsPreview from './labels/OrderLabelsPreview'
import {
  LABEL_HEIGHT_CSS,
  LABEL_HEIGHT_MM,
  LABEL_PAGE_SIZE_CSS,
  LABEL_PHYSICAL_SIZE_CSS,
  LABEL_SAFE_PADDING_X_CSS,
  LABEL_SAFE_PADDING_Y_CSS,
  LABEL_WIDTH_CSS,
  LABEL_WIDTH_MM
} from '../utils/labels/labelPrintGeometry'

const pageSource = readFileSync(new URL('./OrderLabelsPage.jsx', import.meta.url), 'utf8')
const previewSource = readFileSync(new URL('./labels/OrderLabelsPreview.jsx', import.meta.url), 'utf8')
const cardSource = readFileSync(new URL('./labels/OrderLabelCard.jsx', import.meta.url), 'utf8')
const resultsSource = readFileSync(new URL('./labels/OrderLabelsResults.jsx', import.meta.url), 'utf8')
const cssSource = readFileSync(new URL('./labels/order-labels.css', import.meta.url), 'utf8')
const labelUtilsSource = readFileSync(new URL('../utils/labels/labelOrderUtils.js', import.meta.url), 'utf8')
const indexSource = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
const geometrySource = readFileSync(new URL('../utils/labels/labelPrintGeometry.js', import.meta.url), 'utf8')

const buildSampleOrder = (id) => ({
  id,
  customer_name: `Gabriel Mercado ${id}`,
  company: 'Genneia',
  delivery_location: 'Genneia',
  delivery_date: '2026-08-05',
  service: 'lunch',
  total_items: 1,
  items: [{ name: 'Plato Principal', quantity: 1 }],
  custom_responses: [
    { title: 'Bebida', response: 'Coca cola' },
    { title: 'Fruta o postre', response: 'Fruta' }
  ]
})

const renderPreview = (count) => renderToStaticMarkup(React.createElement(OrderLabelsPreview, {
  selectedOrders: Array.from({ length: count }, (_, index) => buildSampleOrder(`order-${index + 1}`)),
  onBack: () => {},
  onCancel: () => {},
  onPrint: () => {}
}))

const countPrintLabels = (html) => (html.match(/\bprint-label\b/g) || []).length

const renderPreviewWithOrders = (orders) => renderToStaticMarkup(React.createElement(OrderLabelsPreview, {
  selectedOrders: orders,
  onBack: () => {},
  onCancel: () => {},
  onPrint: () => {}
}))

describe('order labels print flow', () => {
  it('renders one print-label for one selected order and ten for ten selected orders', () => {
    expect(countPrintLabels(renderPreview(1))).toBe(1)
    expect(countPrintLabels(renderPreview(10))).toBe(10)
    expect(countPrintLabels(renderPreview(0))).toBe(0)
  })

  it('uses window.print as the primary label print engine', () => {
    expect(pageSource).toContain('waitForPrintLayout')
    expect(pageSource).toContain('window.requestAnimationFrame')
    expect(pageSource).toContain('window.print()')
    expect(pageSource.indexOf('document.body.classList.add')).toBeLessThan(pageSource.indexOf('window.print()'))
    expect(pageSource).not.toContain('printZebraLabels')
    expect(pageSource).not.toContain('zebraLabelPrinter')
    expect(previewSource).not.toContain('BrowserPrint')
    expect(previewSource).not.toContain('printer.send')
    expect(previewSource).not.toContain('ZPL')
    expect(indexSource).not.toContain('/vendor/zebra/browserprint/')
  })

  it('uses one canonical 64 x 32 mm page geometry', () => {
    const html = renderPreview(1)

    expect(LABEL_WIDTH_CSS).toBe('64mm')
    expect(LABEL_HEIGHT_CSS).toBe('32mm')
    expect(LABEL_WIDTH_MM).toBeGreaterThan(LABEL_HEIGHT_MM)
    expect(LABEL_PHYSICAL_SIZE_CSS).toBe('64mm 32mm')
    expect(LABEL_PAGE_SIZE_CSS).toBe('64mm 32mm')
    expect(LABEL_SAFE_PADDING_X_CSS).toBe('2.2mm')
    expect(LABEL_SAFE_PADDING_Y_CSS).toBe('1.7mm')
    expect(geometrySource).toContain('widthMm: 64')
    expect(geometrySource).toContain('heightMm: 32')
    expect(geometrySource).toContain('safePaddingXmm: 2.2')
    expect(geometrySource).toContain('safePaddingYmm: 1.7')
    expect(html).toContain('@page { size: 64mm 32mm; margin: 0; }')
    expect(html).toContain('--label-width:64mm')
    expect(html).toContain('--label-height:32mm')
    expect(html).toContain('--label-safe-x:2.2mm')
    expect(html).toContain('--label-safe-y:1.7mm')
    expect(cssSource).toContain('width: var(--label-width, 64mm)')
    expect(cssSource).toContain('height: var(--label-height, 32mm)')
    expect(cssSource).toContain('padding: var(--label-safe-y, 1.7mm) var(--label-safe-x, 2.2mm)')
    expect(cssSource).toContain('justify-content: center')
    expect(cssSource).not.toContain('size: A4')
    expect(previewSource).not.toContain('size: 32mm 64mm')
    expect(previewSource).not.toContain('thermalPreset')
    expect(previewSource).not.toContain('a4Columns')
    expect(previewSource).not.toContain('printFormat')
  })

  it('does not leave old dimensions or copy expansion in the active label pipeline', () => {
    const activeSources = [pageSource, previewSource, cardSource, resultsSource, cssSource, labelUtilsSource].join('\n')
    expect(activeSources).not.toContain('100mm')
    expect(activeSources).not.toContain('50mm')
    expect(activeSources).not.toContain('94mm')
    expect(activeSources).not.toContain('46mm')
    expect(activeSources).not.toContain('100x50')
    expect(activeSources).not.toContain('80x50')
    expect(activeSources).not.toContain('expandLabelsForCopies')
    expect(activeSources).not.toContain('copiesByOrderId')
    expect(activeSources).not.toContain('labelPrintOffset')
    expect(activeSources).not.toContain('localStorage')
    expect(pageSource).toContain('window.print')
    expect(pageSource).toContain("import OrderLabelsPreview from './labels/OrderLabelsPreview'")
    expect(pageSource).not.toContain('getZebraPrinters')
    expect(pageSource).not.toContain('downloadZpl')
  })

  it('keeps print isolated from UI and prevents an extra trailing page', () => {
    expect(cssSource).toContain('@media print')
    expect(cssSource).toContain('body.labels-print-mode *')
    expect(cssSource).toContain('visibility: hidden !important')
    expect(cssSource).toContain('.labels-preview-root')
    expect(cssSource).toContain('visibility: visible !important')
    expect(cssSource).toContain('.print-hide')
    expect(cssSource).toContain('display: none !important')
    expect(cssSource).toContain('.print-label:not(:last-child)')
    expect(cssSource).toContain('break-after: page')
    expect(cssSource).toContain('page-break-after: always')
    expect(cssSource).toContain('.print-label:last-child')
    expect(cssSource).toContain('break-after: auto')
    expect(cssSource).toContain('page-break-after: auto')
    expect(cssSource).not.toContain('body:has')
  })

  it('keeps print-label height fixed regardless of content length', () => {
    expect(cssSource).toContain('overflow: hidden')
    expect(cssSource).toContain('box-sizing: border-box')
    expect(cssSource).toContain('max-height: var(--label-height, 32mm)')
    expect(cssSource).toContain('contain: layout paint')
    expect(cssSource).toContain('-webkit-line-clamp')
    expect(cssSource).toContain('text-overflow: ellipsis')
    expect(cssSource).not.toContain('height: auto !important;\n    min-height: 32mm')
    expect(cssSource).not.toContain('scale(')
    expect(cssSource).not.toContain('zoom')
    expect(cssSource).not.toContain('rotate(')
    expect(cssSource).not.toContain('rotate(90deg)')
    expect(cssSource).not.toContain('rotate(-90deg)')
    expect(cssSource).not.toContain('translate(')
  })

  it('preserves current selection, filters, and print-state controls outside print', () => {
    expect(pageSource).toContain('Seleccionar todos visibles')
    expect(pageSource).toContain('Limpiar selección')
    expect(pageSource).toContain('Imprimir seleccionados')
    expect(pageSource).toContain('openPreview')
    expect(previewSource).toContain('Imprimir etiquetas')
    expect(previewSource).not.toContain('Impresora Zebra')
    expect(previewSource).not.toContain('Descargar ZPL')
    expect(resultsSource).toContain('Falta imprimir')
    expect(resultsSource).toContain('Ya impreso')
    expect(resultsSource).toContain('Reimprimir')
    expect(resultsSource).toContain('onPrintStateChange')
  })

  it('keeps long content inside the same physical label without adding copy pages', () => {
    const longOrder = {
      ...buildSampleOrder('long-order'),
      customer_name: 'Maria De Los Angeles Fernandez Rodriguez Del Departamento Comercial Central',
      company: 'Empresa Corporativa Internacional De Servicios Alimentarios Integrales',
      delivery_location: 'Piso 23 Ala Norte Oficina Central Sala De Directorio',
      items: [
        { name: 'Milanesa napolitana con pure mixto y ensalada completa', quantity: 2 },
        { name: 'Tarta integral de verduras con guarnicion especial', quantity: 1 },
        { name: 'Wrap de pollo con vegetales asados y salsa adicional', quantity: 1 }
      ],
      custom_responses: [
        { title: 'Bebida', response: 'Agua mineral sin gas, gaseosa lima limon y jugo de naranja' },
        { title: 'Fruta o postre', response: 'Ensalada de frutas con yogurt' }
      ]
    }
    const html = renderPreviewWithOrders([longOrder])

    expect(countPrintLabels(html)).toBe(1)
    expect(html).toContain('sf-label-card--dense')
    expect(html.indexOf('Maria De Los Angeles')).toBeGreaterThan(html.indexOf('<article'))
    expect(html.indexOf('Maria De Los Angeles')).toBeLessThan(html.indexOf('</article>'))
    expect(html).toContain('Pedido:')
  })

  it('does not mark labels as printed until the operator explicitly confirms success', () => {
    expect(pageSource).toContain('requestPrintSuccessConfirmation')
    expect(pageSource).toContain('const confirmed = await requestPrintSuccessConfirmation')
    expect(pageSource).toContain('if (confirmed) {')
    expect(pageSource).toContain('await labels.markPrinted')
    expect(pageSource.indexOf('window.print()')).toBeLessThan(pageSource.indexOf('const confirmed = await requestPrintSuccessConfirmation'))
    expect(pageSource.indexOf('if (confirmed) {')).toBeLessThan(pageSource.indexOf('await labels.markPrinted'))
  })
})

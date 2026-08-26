import React from 'react'
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import OrderLabelsPreview from './labels/OrderLabelsPreview'

const pageSource = readFileSync(new URL('./OrderLabelsPage.jsx', import.meta.url), 'utf8')
const previewSource = readFileSync(new URL('./labels/OrderLabelsPreview.jsx', import.meta.url), 'utf8')
const cardSource = readFileSync(new URL('./labels/OrderLabelCard.jsx', import.meta.url), 'utf8')
const resultsSource = readFileSync(new URL('./labels/OrderLabelsResults.jsx', import.meta.url), 'utf8')
const cssSource = readFileSync(new URL('./labels/order-labels.css', import.meta.url), 'utf8')
const labelUtilsSource = readFileSync(new URL('../utils/labels/labelOrderUtils.js', import.meta.url), 'utf8')

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
    { title: 'Bebida', response: 'Coca cola' }
  ]
})

const renderPreview = (count) => renderToStaticMarkup(React.createElement(OrderLabelsPreview, {
  selectedOrders: Array.from({ length: count }, (_, index) => buildSampleOrder(`order-${index + 1}`)),
  onBack: () => {},
  onCancel: () => {},
  onPrint: () => {}
}))

const countPrintLabels = (html) => (html.match(/\bprint-label\b/g) || []).length

describe('order labels print flow', () => {
  it('renders one print-label for one selected order and ten for ten selected orders', () => {
    expect(countPrintLabels(renderPreview(1))).toBe(1)
    expect(countPrintLabels(renderPreview(10))).toBe(10)
    expect(countPrintLabels(renderPreview(0))).toBe(0)
  })

  it('uses one canonical 64 x 32 mm page geometry', () => {
    expect(cssSource).toContain('@page')
    expect(cssSource).toContain('size: 64mm 32mm;')
    expect(cssSource).toContain('width: 64mm;')
    expect(cssSource).toContain('height: 32mm;')
    expect(cssSource).toContain('min-height: 32mm;')
    expect(cssSource).toContain('max-height: 32mm;')
    expect(cssSource.match(/@page/g)).toHaveLength(1)
    expect(previewSource).not.toContain('@page')
    expect(previewSource).not.toContain('printPageSize')
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
  })

  it('keeps print isolated from UI and prevents an extra trailing page', () => {
    expect(cssSource).toContain('@media print')
    expect(cssSource).toContain('body *')
    expect(cssSource).toContain('visibility: hidden !important')
    expect(cssSource).toContain('.labels-preview-root')
    expect(cssSource).toContain('visibility: visible !important')
    expect(cssSource).toContain('.print-hide')
    expect(cssSource).toContain('display: none !important')
    expect(cssSource).toContain('break-after: page')
    expect(cssSource).toContain('page-break-after: always')
    expect(cssSource).toContain('.print-label:last-child')
    expect(cssSource).toContain('break-after: auto')
    expect(cssSource).toContain('page-break-after: auto')
  })

  it('keeps print-label height fixed regardless of content length', () => {
    expect(cssSource).toContain('overflow: hidden')
    expect(cssSource).toContain('box-sizing: border-box')
    expect(cssSource).toContain('max-height: 32mm')
    expect(cssSource).toContain('-webkit-line-clamp')
    expect(cssSource).not.toContain('height: auto !important;\n    min-height: 32mm')
    expect(cssSource).not.toContain('scale(')
    expect(cssSource).not.toContain('zoom')
    expect(cssSource).not.toContain('rotate(')
    expect(cssSource).not.toContain('translate(')
  })

  it('preserves current selection, filters, and print-state controls outside print', () => {
    expect(pageSource).toContain('Seleccionar todos visibles')
    expect(pageSource).toContain('Limpiar selección')
    expect(pageSource).toContain('Imprimir seleccionados')
    expect(resultsSource).toContain('Falta imprimir')
    expect(resultsSource).toContain('Ya impreso')
    expect(resultsSource).toContain('Reimprimir')
    expect(resultsSource).toContain('onPrintStateChange')
  })
})

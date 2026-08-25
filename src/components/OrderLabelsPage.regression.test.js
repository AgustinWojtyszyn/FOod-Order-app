import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const pageSource = readFileSync(new URL('./OrderLabelsPage.jsx', import.meta.url), 'utf8')
const previewSource = readFileSync(new URL('./labels/OrderLabelsPreview.jsx', import.meta.url), 'utf8')
const resultsSource = readFileSync(new URL('./labels/OrderLabelsResults.jsx', import.meta.url), 'utf8')
const cssSource = readFileSync(new URL('./labels/order-labels.css', import.meta.url), 'utf8')

describe('order labels print flow', () => {
  it('prints directly from the selected labels without entering preview mode', () => {
    expect(pageSource).toContain('window.print()')
    expect(pageSource).toContain('onClick={printSelectedLabels}')
    expect(pageSource).toContain('showControls={false}')
    expect(pageSource).toContain('Seleccionar todos visibles')
    expect(pageSource).toContain('1 pedido = 1 etiqueta')
    expect(pageSource).not.toContain('labels.enterPreview')
    expect(pageSource).not.toContain('labels.previewMode')
  })

  it('separates printed and pending labels and keeps printed labels reprintable', () => {
    expect(resultsSource).toContain('Falta imprimir')
    expect(resultsSource).toContain('Ya impreso')
    expect(resultsSource).toContain('Reimprimir')
    expect(resultsSource).toContain('onPrintStateChange')
  })

  it('prints each selected label as a separate page or ticket', () => {
    expect(cssSource).toContain('.print-label {')
    expect(cssSource).toContain('width: var(--thermal-label-width, 100mm) !important')
    expect(cssSource).toContain('height: var(--thermal-label-height, 50mm) !important')
    expect(cssSource).toContain('padding: var(--thermal-label-safe-padding, 2mm) !important')
    expect(cssSource).toContain('box-sizing: border-box !important')
    expect(cssSource).toContain('transform: none !important')
    expect(cssSource).toContain('break-after: page !important')
    expect(cssSource).toContain('page-break-after: always !important')
    expect(cssSource).toContain('.print-label:last-child')
    expect(cssSource).toContain('break-after: auto !important')
    expect(cssSource).toContain('@page')
    expect(cssSource).toContain('size: 100mm 50mm')
    expect(cssSource).toContain('.labels-print-root-screen-hidden')
    expect(previewSource).toContain('--thermal-label-safe-padding')
    expect(previewSource).toContain('labels-print-container')
    expect(previewSource).toContain('className="print-label"')
  })
})

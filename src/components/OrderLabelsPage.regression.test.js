import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const pageSource = readFileSync(new URL('./OrderLabelsPage.jsx', import.meta.url), 'utf8')
const resultsSource = readFileSync(new URL('./labels/OrderLabelsResults.jsx', import.meta.url), 'utf8')
const cssSource = readFileSync(new URL('./labels/order-labels.css', import.meta.url), 'utf8')

describe('order labels print flow', () => {
  it('prints directly from the selected labels without entering preview mode', () => {
    expect(pageSource).toContain('window.print()')
    expect(pageSource).toContain('onClick={printSelectedLabels}')
    expect(pageSource).toContain('showControls={false}')
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
    expect(cssSource).toContain('.labels-print-surface .sf-label-card:not(:last-child)')
    expect(cssSource).toContain('break-after: page')
    expect(cssSource).toContain('page-break-after: always')
    expect(cssSource).toContain('.labels-print-root-screen-hidden')
  })
})

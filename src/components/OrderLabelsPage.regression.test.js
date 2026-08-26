import React from 'react'
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import OrderLabelsPreview from './labels/OrderLabelsPreview'

const pageSource = readFileSync(
  new URL('./OrderLabelsPage.jsx', import.meta.url),
  'utf8'
)

const previewSource = readFileSync(
  new URL('./labels/OrderLabelsPreview.jsx', import.meta.url),
  'utf8'
)

const cardSource = readFileSync(
  new URL('./labels/OrderLabelCard.jsx', import.meta.url),
  'utf8'
)

const resultsSource = readFileSync(
  new URL('./labels/OrderLabelsResults.jsx', import.meta.url),
  'utf8'
)

const cssSource = readFileSync(
  new URL('./labels/order-labels.css', import.meta.url),
  'utf8'
)

const labelUtilsSource = readFileSync(
  new URL('../utils/labels/labelOrderUtils.js', import.meta.url),
  'utf8'
)

const orderLabelsHookSource = readFileSync(
  new URL('../hooks/labels/useOrderLabels.js', import.meta.url),
  'utf8'
)

const indexSource = readFileSync(
  new URL('../../index.html', import.meta.url),
  'utf8'
)

const buildSampleOrder = (id) => ({
  id,
  customer_name: `Gabriel Mercado ${id}`,
  company_slug: 'genneia',
  company_name: 'Genneia',
  company: 'Genneia',
  location: 'Genneia',
  delivery_location: 'Genneia',
  delivery_date: '2026-08-05',
  service: 'lunch',
  status: 'pending',
  total_items: 1,
  items: [
    {
      name: 'Plato Principal',
      quantity: 1
    }
  ],
  custom_responses: [
    {
      title: 'Bebida',
      response: 'Coca cola'
    },
    {
      title: 'Fruta o postre',
      response: 'Fruta'
    }
  ]
})

const renderPreviewWithOrders = (
  orders,
  {
    printFormat = 'thermal',
    thermalPreset = 'custom',
    customThermalSize = {
      width: 64,
      height: 32
    },
    a4Columns = 2
  } = {}
) => renderToStaticMarkup(
  React.createElement(OrderLabelsPreview, {
    selectedOrders: orders,
    printing: false,
    printFormat,
    setPrintFormat: () => {},
    a4Columns,
    setA4Columns: () => {},
    thermalPreset,
    setThermalPreset: () => {},
    customThermalSize,
    setCustomThermalSize: () => {},
    onBack: () => {},
    onCancel: () => {},
    onPrint: () => {}
  })
)

const renderPreview = (count, options = {}) =>
  renderPreviewWithOrders(
    Array.from(
      { length: count },
      (_, index) => buildSampleOrder(`order-${index + 1}`)
    ),
    options
  )

const countLabelCards = (html) =>
  (
    html.match(
      /class="sf-label-card(?: sf-label-card--dense)?"/g
    ) || []
  ).length

describe('order labels print flow', () => {
  it('renders exactly one sf-label-card per selected order', () => {
    expect(countLabelCards(renderPreview(0))).toBe(0)
    expect(countLabelCards(renderPreview(1))).toBe(1)
    expect(countLabelCards(renderPreview(2))).toBe(2)
    expect(countLabelCards(renderPreview(5))).toBe(5)
  })

  it('uses the restored August 5 print architecture without print-page wrappers', () => {
    const html = renderPreview(2)

    expect(html).toContain('labels-preview-root')
    expect(html).toContain('labels-preview-thermal')
    expect(html).toContain('labels-print-surface')
    expect(html).toContain('labels-print-thermal')
    expect(html).toContain('sf-label-card')

    expect(html).not.toContain('print-page')
    expect(html).not.toContain('print-pages')
    expect(html).not.toContain('print-safe-area')
    expect(html).not.toContain('print-label-content')
  })

  it('uses window.print as the only active print engine', () => {
    expect(pageSource).toContain('waitForPrintFrame')
    expect(pageSource).toContain('window.requestAnimationFrame')
    expect(pageSource).toContain('window.print()')

    expect(pageSource).not.toContain('printZebraLabels')
    expect(pageSource).not.toContain('zebraLabelPrinter')
    expect(pageSource).not.toContain('BrowserPrint')
    expect(pageSource).not.toContain('printer.send')

    expect(previewSource).not.toContain('BrowserPrint')
    expect(previewSource).not.toContain('printer.send')
    expect(previewSource).not.toContain('ZPL')

    expect(indexSource).not.toContain(
      '/vendor/zebra/browserprint/'
    )
  })

  it('supports the historical A4 and thermal print formats', () => {
    expect(pageSource).toContain(
      "const [printFormat, setPrintFormat] = useState('a4')"
    )

    expect(pageSource).toContain(
      "const [a4Columns, setA4Columns] = useState(2)"
    )

    expect(pageSource).toContain(
      "const [thermalPreset, setThermalPreset] = useState('100x50')"
    )

    expect(previewSource).toContain(
      '<option value="a4">'
    )

    expect(previewSource).toContain(
      '<option value="thermal">'
    )

    expect(previewSource).toContain(
      '<option value="100x50">'
    )

    expect(previewSource).toContain(
      '<option value="80x50">'
    )

    expect(previewSource).toContain(
      '<option value="custom">'
    )
  })

  it('supports a custom 64 x 32 mm thermal page through dynamic @page', () => {
    const html = renderPreview(1, {
      printFormat: 'thermal',
      thermalPreset: 'custom',
      customThermalSize: {
        width: 64,
        height: 32
      }
    })

    expect(html).toContain(
      '@page { size: 64mm 32mm; margin: 0; }'
    )

    expect(html).toContain(
      '--thermal-label-width:64mm'
    )

    expect(html).toContain(
      '--thermal-label-height:32mm'
    )

    expect(previewSource).toContain(
      "`${width}mm ${height}mm`"
    )
  })

  it('keeps thermal card height automatic like the August 5 implementation', () => {
    expect(cssSource).toContain(
      '.labels-print-thermal .sf-label-card'
    )

    expect(cssSource).toContain(
      'height: auto'
    )

    expect(cssSource).toContain(
      'min-height: 0'
    )

    expect(cssSource).toContain(
      'max-height: none'
    )

    expect(cssSource).not.toContain(
      'height: var(--label-height)'
    )

    expect(cssSource).not.toContain(
      'height: 32mm'
    )
  })

  it('forces a page break between thermal label cards', () => {
    expect(cssSource).toContain(
      '.labels-print-thermal .sf-label-card:not(:last-child)'
    )

    expect(cssSource).toContain(
      'break-after: page'
    )

    expect(cssSource).toContain(
      'page-break-after: always'
    )
  })

  it('keeps the historical print isolation rules', () => {
    expect(cssSource).toContain('@media print')

    expect(cssSource).toContain(
      'body *'
    )

    expect(cssSource).toContain(
      'visibility: hidden !important'
    )

    expect(cssSource).toContain(
      '.labels-preview-root'
    )

    expect(cssSource).toContain(
      'visibility: visible !important'
    )

    expect(cssSource).toContain(
      '.print-hide'
    )

    expect(cssSource).toContain(
      'display: none !important'
    )

    expect(cssSource).not.toContain(
      'body:has'
    )
  })

  it('does not contain the failed experimental print architecture', () => {
    const activeSources = [
      pageSource,
      previewSource,
      cardSource,
      cssSource
    ].join('\n')

    const removedConcepts = [
      'LabelPrintSettingsPanel',
      'LabelPrintConfigurator',
      'useLabelPrintSettings',
      'labelPrintSettings',
      'labelPrintGeometry',
      'print-page',
      'print-pages',
      'print-safe-area',
      'print-label-content',
      'labels-print-mode',
      'labels-calibration-mode',
      'contentScale',
      'fontScale',
      'offsetXmm',
      'offsetYmm',
      'chromeHints',
      'servifood.labelPrintSettings'
    ]

    removedConcepts.forEach((concept) => {
      expect(activeSources).not.toContain(concept)
    })
  })

  it('does not restore old copy expansion into the modern pipeline', () => {
    const activeSources = [
      pageSource,
      previewSource,
      resultsSource
    ].join('\n')

    expect(activeSources).not.toContain(
      'expandLabelsForCopies'
    )

    expect(activeSources).not.toContain(
      'copiesByOrderId'
    )

    expect(previewSource).toContain(
      'selectedOrders'
    )

    expect(previewSource).toContain(
      '.map(order => ({'
    )
  })

  it('preserves current selection, filters, and print-state controls', () => {
    expect(pageSource).toContain(
      'Seleccionar todos visibles'
    )

    expect(pageSource).toContain(
      'Limpiar selección'
    )

    expect(pageSource).toContain(
      'Imprimir seleccionados'
    )

    expect(pageSource).toContain(
      'openPreview'
    )

    expect(resultsSource).toContain(
      'Falta imprimir'
    )

    expect(resultsSource).toContain(
      'Ya impreso'
    )

    expect(resultsSource).toContain(
      'Reimprimir'
    )

    expect(resultsSource).toContain(
      'onPrintStateChange'
    )
  })

  it('preserves delivery_date based querying and modern print tracking', () => {
    expect(orderLabelsHookSource).toContain(
      'deliveryDate: filters.deliveryDate || null'
    )

    expect(orderLabelsHookSource).toContain(
      'fromDate: filters.deliveryDate ? null'
    )

    expect(orderLabelsHookSource).toContain(
      'toDate: filters.deliveryDate ? null'
    )

    expect(orderLabelsHookSource).toContain(
      'db.markOrderLabelsPrinted'
    )

    expect(orderLabelsHookSource).toContain(
      'label_printed_at'
    )

    expect(orderLabelsHookSource).toContain(
      'label_printed_by'
    )

    expect(orderLabelsHookSource).toContain(
      'label_print_count'
    )
  })

  it('preserves modern company, EPSE, and extra-order label logic', () => {
    expect(labelUtilsSource).toContain(
      'getAdminExtraOrderLabel'
    )

    expect(labelUtilsSource).toContain(
      "companySlug === 'epse' ? []"
    )

    expect(labelUtilsSource).toContain(
      'getOrderOriginLocation'
    )

    expect(labelUtilsSource).toContain(
      'getEpseLocationLabel'
    )

    expect(labelUtilsSource).toContain(
      "filters.company !== 'all'"
    )

    expect(cardSource).toContain(
      "label.originLabel === 'Extra'"
    )

    expect(cardSource).toContain(
      'label.deliveryLocation'
    )
  })

  it('keeps long content in a single label card using the dense variant', () => {
    const longOrder = {
      ...buildSampleOrder('long-order'),
      customer_name:
        'Maria De Los Angeles Fernandez Rodriguez Del Departamento Comercial Central',
      company_name:
        'Empresa Corporativa Internacional De Servicios Alimentarios Integrales',
      company:
        'Empresa Corporativa Internacional De Servicios Alimentarios Integrales',
      delivery_location:
        'Piso 23 Ala Norte Oficina Central Sala De Directorio',
      items: [
        {
          name:
            'Milanesa napolitana con pure mixto y ensalada completa',
          quantity: 2
        },
        {
          name:
            'Tarta integral de verduras con guarnicion especial',
          quantity: 1
        },
        {
          name:
            'Wrap de pollo con vegetales asados y salsa adicional',
          quantity: 1
        }
      ],
      custom_responses: [
        {
          title: 'Bebida',
          response:
            'Agua mineral sin gas, gaseosa lima limon y jugo de naranja'
        },
        {
          title: 'Fruta o postre',
          response: 'Postre'
        }
      ]
    }

    const html = renderPreviewWithOrders([
      longOrder
    ])

    expect(countLabelCards(html)).toBe(1)

    expect(html).toContain(
      'sf-label-card--dense'
    )

    expect(html).toContain(
      'Pedido:'
    )
  })

  it('does not mark labels printed until the operator explicitly confirms success', () => {
    expect(pageSource).toContain(
      'requestPrintSuccessConfirmation'
    )

    expect(pageSource).toContain(
      'const confirmed = await requestPrintSuccessConfirmation'
    )

    expect(pageSource).toContain(
      'if (confirmed) {'
    )

    expect(pageSource).toContain(
      'await labels.markPrinted'
    )

    expect(
      pageSource.indexOf('window.print()')
    ).toBeLessThan(
      pageSource.indexOf(
        'const confirmed = await requestPrintSuccessConfirmation'
      )
    )

    expect(
      pageSource.indexOf('if (confirmed) {')
    ).toBeLessThan(
      pageSource.indexOf(
        'await labels.markPrinted'
      )
    )
  })
})

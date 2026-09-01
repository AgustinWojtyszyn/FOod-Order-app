import { describe, expect, it } from 'vitest'
import {
  buildCompanyGroups,
  buildFileName,
  getPrintableDetailRows,
  buildRemitoSnapshot,
  buildRemitoWorkbook,
  buildRemitoConfigBySlug,
  getRemitoMenuTotalFromRows,
  getRemitoIssueFallbackMessage,
  getRemitoRowPriority,
  getOrderRemitoBeverages,
  getTotalMenuItemsForRemito,
  isRemitoNumberInCompanyRange,
  isValidRemitoNumberingConfig,
  isMenuCountableCategory,
  normalizeBeverageLabel,
  REMITO_ROW_CATEGORIES,
  summarizeProducts
} from './exportDailyOrderNotesExcel'

const makeOrder = (overrides = {}) => ({
  id: crypto.randomUUID(),
  created_at: '2026-08-04T12:00:00.000Z',
  delivery_date: '2026-08-05',
  status: 'pending',
  service: 'lunch',
  location: 'Genneia',
  items: [{ id: 'op-1', name: 'Opción 1 - Pollo', quantity: 1 }],
  total_items: 1,
  custom_responses: [],
  comments: '',
  ...overrides
})

describe('daily order notes Excel model', () => {
  it('includes Greif, Placo and Molinos in remito grouping and excludes global/admin companies', () => {
    const groups = buildCompanyGroups([
      makeOrder({ location: 'Greif', company_slug: 'greif' }),
      makeOrder({ id: crypto.randomUUID(), location: 'Placo', company_slug: 'placo' }),
      makeOrder({ id: crypto.randomUUID(), location: 'Molinos', company_slug: 'molinos' }),
      makeOrder({ id: crypto.randomUUID(), location: 'global', company_slug: 'global' }),
      makeOrder({ id: crypto.randomUUID(), location: 'Administración ServiFood', company_slug: 'administracion_servifood' })
    ])

    expect(groups.map((group) => group.slug).sort()).toEqual(['greif', 'molinos', 'placo'])
  })

  it('validates Greif, Placo and Molinos remito numbers from backend company config', () => {
    const configBySlug = buildRemitoConfigBySlug([
      { slug: 'greif', remito_start_number: 80000, remito_end_number: 89999, next_remito_number: 80000 },
      { slug: 'molinos', remito_start_number: 90000, remito_end_number: 99999, next_remito_number: 90000 },
      { slug: 'placo', remito_start_number: 100000, remito_end_number: 109999, next_remito_number: 100000 },
      { slug: 'sin_config', remito_start_number: null, remito_end_number: null, next_remito_number: null }
    ])

    expect(isValidRemitoNumberingConfig(configBySlug.get('greif'))).toBe(true)
    expect(isRemitoNumberInCompanyRange('greif', 80000, configBySlug)).toBe(true)
    expect(isRemitoNumberInCompanyRange('greif', 80001, configBySlug)).toBe(true)
    expect(isRemitoNumberInCompanyRange('greif', 90000, configBySlug)).toBe(false)
    expect(isRemitoNumberInCompanyRange('molinos', 90000, configBySlug)).toBe(true)
    expect(isRemitoNumberInCompanyRange('molinos', 89999, configBySlug)).toBe(false)
    expect(isValidRemitoNumberingConfig(configBySlug.get('placo'))).toBe(true)
    expect(isRemitoNumberInCompanyRange('placo', 100000, configBySlug)).toBe(true)
    expect(isRemitoNumberInCompanyRange('placo', 99999, configBySlug)).toBe(false)
    expect(isValidRemitoNumberingConfig(configBySlug.get('sin_config'))).toBe(false)
  })

  it('summarizes Greif refrigerio selected as an item without changing menu total', () => {
    const products = summarizeProducts([
      makeOrder({
        location: 'Greif',
        company_slug: 'greif',
        total_items: 1,
        items: [{ id: 'greif-refrigerio', name: 'Refrigerio', quantity: 1, isGreifRefrigerio: true }],
        custom_responses: []
      })
    ])

    expect(getRemitoMenuTotalFromRows(products)).toBe(0)
    expect(products).toContainEqual(expect.objectContaining({
      producto: 'Refrigerio',
      cantidad: 1
    }))
    expect(products).not.toContainEqual(expect.objectContaining({ producto: 'Pan' }))
  })

  it('prints Greif refrigerio once and adds total refrigerios directly below it', () => {
    const products = summarizeProducts([
      makeOrder({
        location: 'Greif',
        company_slug: 'greif',
        total_items: 1,
        items: [{ id: 'greif-refrigerio', name: 'Refrigerio', quantity: 1, isGreifRefrigerio: true }],
        custom_responses: []
      }),
      makeOrder({
        id: crypto.randomUUID(),
        location: 'Greif',
        company_slug: 'greif',
        total_items: 1,
        items: [{ id: 'greif-refrigerio', name: 'Refrigerio', quantity: 1, isGreifRefrigerio: true }],
        custom_responses: []
      })
    ])
    const detailRows = getPrintableDetailRows(products, getRemitoMenuTotalFromRows(products))
    const refrigerioIndex = detailRows.findIndex((row) => row.producto === 'Refrigerio')

    expect(products.filter((row) => row.producto === 'Refrigerio')).toEqual([
      expect.objectContaining({ producto: 'Refrigerio', cantidad: 2 })
    ])
    expect(refrigerioIndex).toBeGreaterThan(-1)
    expect(detailRows[refrigerioIndex]).toMatchObject({ producto: 'Refrigerio', cantidad: 2 })
    expect(detailRows[refrigerioIndex + 1]).toMatchObject({ producto: 'TOTAL REFRIGERIOS', cantidad: 2 })
  })

  it('keeps Genneia menu detail rows summing exactly to total viandas', () => {
    const products = summarizeProducts([
      makeOrder({
        company_slug: 'genneia',
        company_name: 'Genneia',
        location: 'Genneia',
        total_items: 10,
        items: [{ id: 'op-1', name: 'Opción 1 - Pollo', quantity: 1 }]
      }),
      makeOrder({
        id: crypto.randomUUID(),
        company_slug: 'genneia',
        company_name: 'Genneia',
        location: 'Genneia',
        total_items: 4,
        items: [{ id: 'op-2', name: 'Opción 2 - Carne', quantity: 4 }]
      })
    ])
    const detailRows = getPrintableDetailRows(products, getRemitoMenuTotalFromRows(products))
    const menuRows = detailRows.filter((row) => isMenuCountableCategory(row.category))
    const menuRowsTotal = menuRows.reduce((sum, row) => sum + Number(row.cantidad || 0), 0)
    const totalRow = detailRows.find((row) => row.producto === 'TOTAL MENÚS / VIANDAS')

    expect(products).toEqual(expect.arrayContaining([
      expect.objectContaining({ producto: 'Opción 1 - Pollo', cantidad: 10 }),
      expect.objectContaining({ producto: 'Opción 2 - Carne', cantidad: 4 })
    ]))
    expect(menuRowsTotal).toBe(14)
    expect(totalRow).toMatchObject({ producto: 'TOTAL MENÚS / VIANDAS', cantidad: 14 })
  })

  it('adds one Pan per non-celiac menu and remits it as a product', () => {
    const products = summarizeProducts([
      makeOrder({
        company_slug: 'genneia',
        company_name: 'Genneia',
        location: 'Genneia',
        total_items: 8,
        items: [{ id: 'op-1', name: 'Opción 1 - Pollo', quantity: 8 }]
      }),
      makeOrder({
        id: crypto.randomUUID(),
        company_slug: 'genneia',
        company_name: 'Genneia',
        location: 'Genneia',
        total_items: 2,
        items: [{ id: 'cel-1', name: 'Menú celíaco', quantity: 2 }]
      })
    ])
    const detailRows = getPrintableDetailRows(products, getRemitoMenuTotalFromRows(products))

    expect(getRemitoMenuTotalFromRows(products)).toBe(10)
    expect(products).toContainEqual(expect.objectContaining({
      producto: 'Pan',
      cantidad: 8,
      category: REMITO_ROW_CATEGORIES.additional
    }))
    expect(detailRows).toContainEqual(expect.objectContaining({ producto: 'Pan', cantidad: 8 }))
  })

  it('does not add Pan when the whole order is marked as celiac or sin TACC', () => {
    const products = summarizeProducts([
      makeOrder({
        company_slug: 'genneia',
        company_name: 'Genneia',
        location: 'Genneia',
        total_items: 3,
        items: [{ id: 'op-1', name: 'Opción 1 - Pollo', quantity: 3 }],
        custom_responses: [{ title: 'Restricción alimentaria', response: 'Sin TACC' }]
      })
    ])

    expect(getRemitoMenuTotalFromRows(products)).toBe(3)
    expect(products.some((row) => row.producto === 'Pan')).toBe(false)
  })

  it('adds Placo beverages to remitos by menu unit', () => {
    const products = summarizeProducts([
      makeOrder({
        company_slug: 'placo',
        company_name: 'Placo',
        location: 'Placo',
        total_items: 4,
        items: [{ id: 'op-1', name: 'Opción 1 - Pollo', quantity: 4 }],
        custom_responses: [{ title: 'Bebida', response: 'Coca Zero' }]
      }),
      makeOrder({
        id: crypto.randomUUID(),
        company_slug: 'placo',
        company_name: 'Placo',
        location: 'Placo',
        total_items: 2,
        items: [{ id: 'op-2', name: 'Opción 2 - Carne', quantity: 2 }],
        custom_responses: []
      })
    ])
    const detailRows = getPrintableDetailRows(products)

    expect(products).toEqual(expect.arrayContaining([
      expect.objectContaining({ producto: 'Bebida: Coca Zero', cantidad: 4, category: REMITO_ROW_CATEGORIES.drink }),
      expect.objectContaining({ producto: 'Bebida: Agua sin gas', cantidad: 2, category: REMITO_ROW_CATEGORIES.drink })
    ]))
    expect(detailRows.find((row) => row.producto === 'TOTAL BEBIDAS')).toMatchObject({ cantidad: 6 })
  })

  it('keeps non-beverage companies out of remito beverage totals', () => {
    const products = summarizeProducts([
      makeOrder({
        company_slug: 'molinos',
        company_name: 'Molinos',
        location: 'Molinos',
        total_items: 4,
        items: [{ id: 'op-1', name: 'Opción 1 - Pollo', quantity: 4 }],
        custom_responses: [{ title: 'Bebida', response: 'Coca Zero' }]
      })
    ])

    expect(products.some((row) => row.category === REMITO_ROW_CATEGORIES.drink)).toBe(false)
  })

  it('keeps the canonical order-note file naming for Greif and Molinos', async () => {
    const previousFetch = globalThis.fetch
    globalThis.fetch = async () => ({
      arrayBuffer: async () => new ArrayBuffer(8)
    })

    try {
      const greifWorkbook = await buildRemitoWorkbook([{
        companySlug: 'greif',
        companyName: 'Greif',
        companyDisplayName: 'Greif',
        remitoNumber: 80000,
        deliveryDate: '2026-08-21',
        totalItems: 1,
        products: [{ cantidad: 1, producto: 'Opción 1 - Pollo', category: REMITO_ROW_CATEGORIES.numberedOption }]
      }])
      const molinosWorkbook = await buildRemitoWorkbook([{
        companySlug: 'molinos',
        companyName: 'Molinos',
        companyDisplayName: 'Molinos',
        remitoNumber: 90000,
        deliveryDate: '2026-08-21',
        totalItems: 1,
        products: [{ cantidad: 1, producto: 'Opción 1 - Pollo', category: REMITO_ROW_CATEGORIES.numberedOption }]
      }])

      expect(greifWorkbook.remitos[0].sheetName).toBe('Greif 80000')
      expect(molinosWorkbook.remitos[0].sheetName).toBe('Molinos 90000')
      expect(buildFileName(greifWorkbook.remitos, '2026-08-21')).toBe('Nota_de_Pedido_GREIF_80000_21-08-2026.xlsx')
      expect(buildFileName(molinosWorkbook.remitos, '2026-08-21')).toBe('Nota_de_Pedido_MOLINOS_90000_21-08-2026.xlsx')
    } finally {
      globalThis.fetch = previousFetch
    }
  })

  it('does not blame remito start-number config for unrelated RPC errors', () => {
    const message = getRemitoIssueFallbackMessage('EPSE – Los Caracoles', {
      code: '42702',
      message: 'column reference "status" is ambiguous'
    })

    expect(message).toContain('No pudimos emitir la nota de pedido para EPSE – Los Caracoles.')
    expect(message).toContain('42702')
    expect(message).toContain('status')
    expect(message).not.toContain('número inicial')
  })

  it('centers the ServiFood logos equally in original and duplicate header blocks', async () => {
    const previousFetch = globalThis.fetch
    globalThis.fetch = async () => ({
      arrayBuffer: async () => new ArrayBuffer(8)
    })

    try {
      const { workbook } = await buildRemitoWorkbook([{
        companySlug: 'epse',
        companyName: 'EPSE',
        companyDisplayName: 'EPSE – Los Caracoles',
        remitoNumber: 30007,
        deliveryDate: '2026-08-20',
        totalItems: 1,
        products: [{ cantidad: 1, producto: 'Menú', category: 'menu' }]
      }])
      const worksheet = workbook.getWorksheet('EPSE – Los Caracoles 30007')
      const images = worksheet.getImages()

      expect(images).toHaveLength(2)
      expect(images[0].imageId).toBe(images[1].imageId)
      expect(images[0].range.ext).toEqual(images[1].range.ext)
      expect(images[0].range.ext).toEqual({ width: 50, height: 50 })
      expect(images[0].range.tl.nativeCol).toBe(1)
      expect(images[1].range.tl.nativeCol).toBe(8)
      expect(images[0].range.tl.nativeColOff).toBe(2592)
      expect(images[1].range.tl.nativeColOff).toBe(2592)
      expect(images[0].range.tl.nativeRow).toBe(0)
      expect(images[1].range.tl.nativeRow).toBe(0)
      expect(images[0].range.tl.nativeRowOff).toBe(132499)
      expect(images[1].range.tl.nativeRowOff).toBe(132499)
      expect(workbook.model.media).toHaveLength(1)
    } finally {
      globalThis.fetch = previousFetch
    }
  })

  it('uses the approved 40014 visual print layout for order note sheets', async () => {
    const previousFetch = globalThis.fetch
    globalThis.fetch = async () => ({
      arrayBuffer: async () => new ArrayBuffer(8)
    })

    try {
      const { workbook } = await buildRemitoWorkbook([{
        companySlug: 'genneia',
        companyName: 'Genneia',
        companyDisplayName: 'Genneia',
        remitoNumber: 40014,
        deliveryDate: '2026-08-21',
        totalItems: 24,
        products: [
          { cantidad: 10, producto: 'Opción 1 - Pollo', category: REMITO_ROW_CATEGORIES.numberedOption },
          { cantidad: 14, producto: 'Opción 2 - Carne', category: REMITO_ROW_CATEGORIES.numberedOption },
          { cantidad: 24, producto: 'Bebida: Agua', category: REMITO_ROW_CATEGORIES.drink },
          { cantidad: 24, producto: 'Postre: Fruta', category: REMITO_ROW_CATEGORIES.dessert }
        ]
      }])
      const worksheet = workbook.getWorksheet('Genneia 40014')
      const expectedWidths = [
        1.42578125,
        7,
        9.42578125,
        9.42578125,
        9.42578125,
        10.140625,
        10.140625,
        10,
        7,
        9.42578125,
        9.42578125,
        9.42578125,
        10.140625,
        10.140625
      ]

      expectedWidths.forEach((width, index) => {
        expect(worksheet.getColumn(index + 1).width).toBe(width)
      })

      expect(worksheet.pageSetup).toMatchObject({
        paperSize: 9,
        orientation: 'landscape',
        scale: 110,
        horizontalCentered: true,
        verticalCentered: false,
        printArea: 'A1:N33'
      })
      expect(worksheet.pageSetup.fitToPage).toBeUndefined()
      expect(worksheet.pageSetup.fitToWidth).toBeUndefined()
      expect(worksheet.pageSetup.fitToHeight).toBeUndefined()
      expect(worksheet.pageSetup.margins).toEqual({
        left: 0.23622047244094491,
        right: 0.23622047244094491,
        top: 0.39370078740157483,
        bottom: 0.39370078740157483,
        header: 0,
        footer: 0
      })
      expect(worksheet.headerFooter).toMatchObject({
        oddHeader: '',
        oddFooter: '',
        evenHeader: '',
        evenFooter: '',
        firstHeader: '',
        firstFooter: ''
      })

      expect(worksheet.getCell('E1').value).toBe('X')
      expect(worksheet.getCell('L1').value).toBe('X')
      expect(worksheet.getCell('E1').font).toMatchObject({ size: 20, bold: true })
      expect(worksheet.getCell('L1').font).toMatchObject({ size: 20, bold: true })
      expect(worksheet.getCell('F1').value).toBe('ORIGINAL')
      expect(worksheet.getCell('M1').value).toBe('DUPLICADO')
      expect(worksheet.getCell('C1').font).toMatchObject({ size: 6.5, bold: true })
      expect(worksheet.getCell('J1').font).toMatchObject({ size: 6.5, bold: true })
      expect(worksheet.getCell('B5').fill).toEqual(worksheet.getCell('I5').fill)
      expect(worksheet.getCell('E5').fill).toEqual(worksheet.getCell('L5').fill)
      expect(worksheet.getCell('B5').value.richText).toEqual([
        { text: 'Fecha: ', font: { name: 'Calibri', size: 9, bold: true } },
        { text: '21/08/2026', font: { name: 'Calibri', size: 11, bold: true } }
      ])
      expect(worksheet.getCell('E5').value.richText).toEqual([
        { text: 'Empresa: ', font: { name: 'Calibri', size: 9, bold: true } },
        { text: 'Genneia', font: { name: 'Calibri', size: 11, bold: true } }
      ])
      expect(worksheet.getCell('I5').value.richText).toEqual(worksheet.getCell('B5').value.richText)
      expect(worksheet.getCell('L5').value.richText).toEqual(worksheet.getCell('E5').value.richText)
      expect(worksheet.getCell('B8').fill.fgColor.argb).toBe('FF111827')
      expect(worksheet.getCell('I8').fill.fgColor.argb).toBe('FF111827')
      for (let rowNumber = 1; rowNumber <= 7; rowNumber += 1) {
        expect(worksheet.getRow(rowNumber).height).toBe(15.95)
      }
      for (let rowNumber = 8; rowNumber <= 27; rowNumber += 1) {
        expect(worksheet.getRow(rowNumber).height).toBe(15.6)
      }
      expect(worksheet.getRow(28).height).toBe(10.5)
      expect(worksheet.getRow(29).height).toBe(8.25)
      expect(worksheet.getRow(30).height).toBe(15.6)
      expect(worksheet.getRow(31).height).toBe(15.6)
      expect(worksheet.getRow(32).height).toBe(15.6)
      expect(worksheet.getRow(33).height).toBe(15.6)
      expect(worksheet.getCell('B27').value).toBe('DEVOLUCIONES')
      expect(worksheet.getCell('I27').value).toBe('DEVOLUCIONES')
      expect(worksheet.getCell('B30').value).toContain('CONTROL DE CALIDAD / CANTIDAD')
      expect(worksheet.getCell('I30').value).toContain('CONTROL DE CALIDAD / CANTIDAD')
      expect(worksheet.getCell('B32').value).toBe('FIRMA RESPONSABLE')
      expect(worksheet.getCell('E32').value).toBe('FIRMA TRANSPORTE')
      expect(worksheet.getCell('I32').value).toBe('FIRMA RESPONSABLE')
      expect(worksheet.getCell('L32').value).toBe('FIRMA TRANSPORTE')
      expect(worksheet.getCell('A35').value).toEqual({
        text: 'Volver al índice',
        hyperlink: "#'Índice'!A1"
      })
      expect(worksheet.getCell('A35').font).toMatchObject({
        name: 'Calibri',
        size: 8,
        underline: true,
        color: { argb: 'FF2563EB' }
      })

      ;[
        'B1', 'C1', 'E1', 'F1', 'F2', 'F4', 'B5', 'E5', 'B6', 'B7', 'E7', 'B8', 'C8',
        'B9', 'C9', 'B11', 'C11', 'B13', 'C13', 'B15', 'C15', 'B27', 'B30', 'B32', 'E32',
        'I1', 'J1', 'L1', 'M1', 'M2', 'M4', 'I5', 'L5', 'I6', 'I7', 'L7', 'I8', 'J8',
        'I9', 'J9', 'I11', 'J11', 'I13', 'J13', 'I15', 'J15', 'I27', 'I30', 'I32', 'L32',
        'A35'
      ].forEach((address) => {
        expect(worksheet.getCell(address).font?.name).toBe('Calibri')
      })
    } finally {
      globalThis.fetch = previousFetch
    }
  })

  it('formats menu totals stronger than beverage and dessert totals on both copies', async () => {
    const previousFetch = globalThis.fetch
    globalThis.fetch = async () => ({
      arrayBuffer: async () => new ArrayBuffer(8)
    })

    try {
      const { workbook } = await buildRemitoWorkbook([{
        companySlug: 'genneia',
        companyName: 'Genneia',
        companyDisplayName: 'Genneia',
        remitoNumber: 40014,
        deliveryDate: '2026-08-21',
        totalItems: 24,
        products: [
          { cantidad: 10, producto: 'Opción 1 - Pollo', category: REMITO_ROW_CATEGORIES.numberedOption },
          { cantidad: 14, producto: 'Opción 2 - Carne', category: REMITO_ROW_CATEGORIES.numberedOption },
          { cantidad: 24, producto: 'Bebida: Agua', category: REMITO_ROW_CATEGORIES.drink },
          { cantidad: 24, producto: 'Postre: Fruta', category: REMITO_ROW_CATEGORIES.dessert }
        ]
      }])
      const worksheet = workbook.getWorksheet('Genneia 40014')
      const menuTotalRow = 11
      const beverageTotalRow = 13
      const dessertTotalRow = 15

      ;['B', 'C', 'I', 'J'].forEach((column) => {
        expect(worksheet.getCell(`${column}${menuTotalRow}`).font).toMatchObject({ name: 'Calibri', size: 12, bold: true })
        expect(worksheet.getCell(`${column}${menuTotalRow}`).fill.fgColor.argb).toBe('FFD9D9D9')
      })
      ;['B', 'C', 'I', 'J'].forEach((column) => {
        expect(worksheet.getCell(`${column}${beverageTotalRow}`).font).toMatchObject({ name: 'Calibri', size: 8, bold: true })
        expect(worksheet.getCell(`${column}${beverageTotalRow}`).fill.fgColor.argb).toBe('FFF3F4F6')
        expect(worksheet.getCell(`${column}${dessertTotalRow}`).font).toMatchObject({ name: 'Calibri', size: 8, bold: true })
        expect(worksheet.getCell(`${column}${dessertTotalRow}`).fill.fgColor.argb).toBe('FFF3F4F6')
      })
      expect(worksheet.getRow(menuTotalRow).height).toBe(15.6)
      expect(worksheet.getRow(27).height).toBe(15.6)
      expect(worksheet.getRow(28).height).toBe(10.5)
      expect(worksheet.getRow(29).height).toBe(8.25)
      expect(worksheet.getRow(32).height).toBe(15.6)
      expect(worksheet.getRow(33).height).toBe(15.6)
      expect(worksheet.getCell('B32').alignment).toEqual({ horizontal: 'center' })
      expect(worksheet.getCell('E32').alignment).toEqual({ horizontal: 'center' })
    } finally {
      globalThis.fetch = previousFetch
    }
  })

  it('keeps the index sheet print setup separate from the note layout', async () => {
    const previousFetch = globalThis.fetch
    globalThis.fetch = async () => ({
      arrayBuffer: async () => new ArrayBuffer(8)
    })

    try {
      const { workbook } = await buildRemitoWorkbook([{
        companySlug: 'genneia',
        companyName: 'Genneia',
        companyDisplayName: 'Genneia',
        remitoNumber: 40014,
        deliveryDate: '2026-08-21',
        totalItems: 24,
        products: [{ cantidad: 24, producto: 'Opción 1 - Pollo', category: REMITO_ROW_CATEGORIES.numberedOption }]
      }])
      const worksheet = workbook.getWorksheet('Índice')

      expect(worksheet.getRow(1).height).toBe(21)
      expect([1, 2, 3, 4, 5].map((columnNumber) => worksheet.getColumn(columnNumber).width)).toEqual([34, 18, 14, 16, 18])
      expect(worksheet.getColumn(8).width).toBe(9)
      expect(worksheet.getColumn(9).width).toBe(9)
      expect(worksheet.getColumn(8).hidden).toBe(true)
      expect(worksheet.getColumn(9).hidden).toBe(true)
      expect(worksheet.pageSetup).toMatchObject({
        paperSize: 9,
        orientation: 'landscape',
        horizontalCentered: true,
        verticalCentered: false,
        printArea: 'A1:E7'
      })
      expect(worksheet.pageSetup.scale).toBeUndefined()
      expect(worksheet.pageSetup.fitToPage).toBeUndefined()
      expect(worksheet.pageSetup.margins).toEqual({
        left: 0.25,
        right: 0.25,
        top: 0.35,
        bottom: 0.35,
        header: 0.12,
        footer: 0.12
      })
      expect(worksheet.getCell('C3').font?.name).toBe('Calibri')
      expect(worksheet.getCell('E6').value).toEqual({
        text: 'Ir a la nota',
        hyperlink: "#'Genneia 40014'!A1"
      })
      expect(worksheet.getCell('E6').font).toMatchObject({
        name: 'Calibri',
        underline: true,
        color: { argb: 'FF2563EB' }
      })
    } finally {
      globalThis.fetch = previousFetch
    }
  })

  it('keeps reserved empty detail rows blank without removing real quantity 11 values', async () => {
    const previousFetch = globalThis.fetch
    globalThis.fetch = async () => ({
      arrayBuffer: async () => new ArrayBuffer(8)
    })

    try {
      const { workbook } = await buildRemitoWorkbook([{
        companySlug: 'epse',
        companyName: 'EPSE',
        companyDisplayName: 'EPSE – Quebrada de Ullum',
        remitoNumber: 30015,
        deliveryDate: '2026-08-20',
        totalItems: 11,
        products: [
          { cantidad: 11, producto: 'Menú principal - Carne braseada', category: REMITO_ROW_CATEGORIES.mainMenu },
          { cantidad: 11, producto: 'Postre: Fruta', category: REMITO_ROW_CATEGORIES.dessert }
        ]
      }])
      const worksheet = workbook.getWorksheet('EPSE – Quebrada de Ullum 30015')

      expect(worksheet.getCell('B9').value).toBe(11)
      expect(worksheet.getCell('C9').value).toBe('Menú principal - Carne braseada')
      expect(worksheet.getCell('I9').value).toBe(11)
      expect(worksheet.getCell('J9').value).toBe('Menú principal - Carne braseada')

      expect(worksheet.getCell('B13').value).toBeNull()
      expect(worksheet.getCell('C13').value).toBeNull()
      expect(worksheet.getCell('I13').value).toBeNull()
      expect(worksheet.getCell('J13').value).toBeNull()
    } finally {
      globalThis.fetch = previousFetch
    }
  })

  it('normalizes Genneia beverages and keeps each beverage separated', () => {
    const products = summarizeProducts([
      makeOrder({ custom_responses: [{ title: 'Bebidas (solo Genneia)', response: 'Agua' }] }),
      makeOrder({ id: crypto.randomUUID(), custom_responses: [{ title: 'Bebidas (solo Genneia)', response: 'Coca cola' }] }),
      makeOrder({ id: crypto.randomUUID(), custom_responses: [{ title: 'Bebida', response: 'Coca Zero' }] }),
      makeOrder({ id: crypto.randomUUID(), custom_responses: [{ title: 'Bebidas (solo Genneia)', response: 'Soda' }] })
    ])

    expect(products).toEqual(expect.arrayContaining([
      expect.objectContaining({ producto: 'Bebida: Agua', cantidad: 1, category: REMITO_ROW_CATEGORIES.drink }),
      expect.objectContaining({ producto: 'Bebida: Coca cola', cantidad: 1, category: REMITO_ROW_CATEGORIES.drink }),
      expect.objectContaining({ producto: 'Bebida: Coca Zero', cantidad: 1, category: REMITO_ROW_CATEGORIES.drink }),
      expect.objectContaining({ producto: 'Bebida: Soda', cantidad: 1, category: REMITO_ROW_CATEGORIES.drink })
    ]))
  })

  it('omits beverages from non-Genneia remitos even when defaulted or selected', () => {
    const orders = [
      makeOrder({
        location: 'La Laja',
        company_slug: 'laja',
        custom_responses: []
      }),
      makeOrder({
        id: crypto.randomUUID(),
        location: 'La Laja',
        company_slug: 'laja',
        custom_responses: [{ title: 'Bebida', response: 'Coca cola' }]
      })
    ]

    const products = summarizeProducts(orders)
    const snapshot = buildRemitoSnapshot({
      group: {
        slug: 'laja',
        name: 'La Laja',
        displayName: 'La Laja',
        orders
      },
      deliveryDate: '2026-08-10',
      status: 'draft'
    })
    const detailRows = getPrintableDetailRows(snapshot.products, snapshot.totalItems)

    expect(getOrderRemitoBeverages(orders[1])).toEqual([])
    expect(products.some((row) => row.category === REMITO_ROW_CATEGORIES.drink)).toBe(false)
    expect(snapshot.totalBeverages).toBe(0)
    expect(snapshot.beverageBreakdown).toEqual([])
    expect(snapshot.products.some((row) => row.category === REMITO_ROW_CATEGORIES.drink)).toBe(false)
    expect(detailRows.some((row) => row.producto === 'TOTAL BEBIDAS')).toBe(false)
  })

  it('does not duplicate the same beverage when it appears in response and options', () => {
    const products = summarizeProducts([
      makeOrder({
        custom_responses: [{
          title: 'Bebidas (solo Genneia)',
          response: 'Coca Zero',
          options: ['Coca Zero']
        }]
      })
    ])

    expect(products.filter((row) => row.producto === 'Bebida: Coca Zero')).toEqual([
      { producto: 'Bebida: Coca Zero', cantidad: 1, category: REMITO_ROW_CATEGORIES.drink }
    ])
  })

  it('does not duplicate a beverage when it appears in items and custom responses', () => {
    const products = summarizeProducts([
      makeOrder({
        service: 'cafeteria',
        items: [{ id: 'drink', name: 'Bebida: Agua', quantity: 1 }],
        custom_responses: [{ title: 'Bebidas (solo Genneia)', response: 'Agua' }]
      })
    ])

    expect(products.filter((row) => row.producto === 'Bebida: Agua')).toEqual([
      { producto: 'Bebida: Agua', cantidad: 1, category: REMITO_ROW_CATEGORIES.drink }
    ])
  })

  it('keeps unspecified historical beverage evidence explicit', () => {
    expect(normalizeBeverageLabel('Bebida sin especificar')).toBe('Bebida sin especificar')
  })

  it('sorts remito rows by business priority and option natural number', () => {
    const labels = [
      'Opción 10 - Pasta',
      'Menú principal: Pollo',
      'Observación: Saludos',
      'Bebida: Agua',
      'Guarnición: Puré',
      'Cena: Milanesa',
      'Opción 2 - Carne',
      'Fruta o postre: Fruta',
      'Menú de cena: Pastel'
    ]

    const sorted = labels
      .map((producto) => ({ producto, cantidad: 1 }))
      .sort((a, b) => {
        const [categoryA, numberA] = getRemitoRowPriority(a.producto)
        const [categoryB, numberB] = getRemitoRowPriority(b.producto)
        return categoryA - categoryB || numberA - numberB || a.producto.localeCompare(b.producto)
      })
      .map((row) => row.producto)

    expect(sorted).toEqual([
      'Menú principal: Pollo',
      'Opción 2 - Carne',
      'Opción 10 - Pasta',
      'Cena: Milanesa',
      'Menú de cena: Pastel',
      'Bebida: Agua',
      'Guarnición: Puré',
      'Fruta o postre: Fruta',
      'Observación: Saludos'
    ])
  })

  it('builds immutable remito snapshots from the same product model used by Excel', () => {
    const order = makeOrder({
      id: '7bb6f6cd-8f76-4d97-b340-681c020140c1',
      order_origin: 'admin_extra',
      total_items: 10,
      items: [{ id: 'op-1', name: 'Opción 1 - Pollo', quantity: 10 }],
      custom_responses: [{ title: 'Bebida', response: 'Agua' }]
    })
    const snapshot = buildRemitoSnapshot({
      group: {
        slug: 'genneia',
        name: 'Genneia',
        displayName: 'Genneia',
        orders: [order]
      },
      deliveryDate: '2026-08-10',
      status: 'draft'
    })

    expect(snapshot).toMatchObject({
      status: 'draft',
      companySlug: 'genneia',
      deliveryDate: '2026-08-10',
      ordersCount: 1,
      totalItems: 10,
      totalMenus: 10,
      totalBeverages: 10,
      totalDesserts: 10,
      orderIds: ['7bb6f6cd-8f76-4d97-b340-681c020140c1']
    })
    expect(snapshot.products).toContainEqual(expect.objectContaining({
      producto: 'Opción 1 - Pollo',
      cantidad: 10
    }))
    expect(snapshot.products).toContainEqual(expect.objectContaining({
      producto: 'Bebida: Agua',
      cantidad: 10
    }))
    expect(snapshot.products).toContainEqual(expect.objectContaining({
      producto: 'Postre: Fruta',
      cantidad: 10
    }))
  })

  it('sums real menu units in remito snapshots instead of counting distinct option rows', () => {
    const snapshot = buildRemitoSnapshot({
      group: {
        slug: 'laja',
        name: 'La Laja',
        displayName: 'La Laja',
        orders: [
          makeOrder({
            id: '10000000-0000-4000-8000-000000000001',
            total_items: 10,
            items: [{ id: 'op-1', name: 'Opción 1', quantity: 10 }]
          }),
          makeOrder({
            id: '10000000-0000-4000-8000-000000000002',
            total_items: 15,
            items: [{ id: 'op-2', name: 'Opción 2', quantity: 15 }]
          }),
          makeOrder({
            id: '10000000-0000-4000-8000-000000000003',
            order_origin: 'admin_extra',
            total_items: 23,
            items: [{ id: 'op-4', name: 'Opción 4', quantity: 23 }]
          })
        ]
      },
      deliveryDate: '2026-08-11',
      status: 'issued'
    })

    expect(snapshot.ordersCount).toBe(3)
    expect(snapshot.totalMenus).toBe(48)
    expect(snapshot.totalItems).toBe(48)
    expect(snapshot.products).toEqual(expect.arrayContaining([
      expect.objectContaining({ producto: 'Opción 1', cantidad: 10 }),
      expect.objectContaining({ producto: 'Opción 2', cantidad: 15 }),
      expect.objectContaining({ producto: 'Opción 4', cantidad: 23 })
    ]))
    expect(getPrintableDetailRows(snapshot.products).find((row) => row.producto === 'TOTAL MENÚS / VIANDAS'))
      .toMatchObject({ cantidad: 48 })
  })

  it('completa faltantes de bebida y postre en remitos por unidad de menú', () => {
    const products = summarizeProducts([
      makeOrder({
        total_items: 5,
        items: [{ id: 'op-1', name: 'Opción 1 - Pollo', quantity: 5 }],
        custom_responses: [
          { title: 'Bebida', quantities: { 'Coca cola': 2 } },
          { title: 'Postre', quantities: { Flan: 1 } }
        ]
      })
    ])
    const detailRows = getPrintableDetailRows(products)

    expect(products).toEqual(expect.arrayContaining([
      expect.objectContaining({ producto: 'Bebida: Coca cola', cantidad: 2, category: REMITO_ROW_CATEGORIES.drink }),
      expect.objectContaining({ producto: 'Bebida: Agua sin gas', cantidad: 3, category: REMITO_ROW_CATEGORIES.drink }),
      expect.objectContaining({ producto: 'Postre: Flan', cantidad: 1, category: REMITO_ROW_CATEGORIES.dessert }),
      expect.objectContaining({ producto: 'Postre: Fruta', cantidad: 4, category: REMITO_ROW_CATEGORIES.dessert })
    ]))
    expect(detailRows.find((row) => row.producto === 'TOTAL BEBIDAS')).toMatchObject({ cantidad: 5 })
    expect(detailRows.find((row) => row.producto === 'TOTAL POSTRES')).toMatchObject({ cantidad: 5 })
  })

  it('excludes observations from remito product rows', () => {
    const products = summarizeProducts([
      makeOrder({
        items: [{ id: 'op-10', name: 'Opción 10 - Pasta', quantity: 1 }],
        custom_responses: [{ title: 'Adicional', response: 'Observación: entregar separado' }],
        comments: 'Saludos 👋'
      }),
      makeOrder({
        id: crypto.randomUUID(),
        items: [{ id: 'op-2', name: 'Opción 2 - Carne', quantity: 1 }],
        comments: 'Saludos 👋'
      })
    ])

    expect(products).toEqual(expect.arrayContaining([
      expect.objectContaining({ producto: 'Opción 2 - Carne', cantidad: 1 }),
      expect.objectContaining({ producto: 'Opción 10 - Pasta', cantidad: 1 })
    ]))
    expect(products.some((row) => row.category === REMITO_ROW_CATEGORIES.observation)).toBe(false)
    expect(products.some((row) => row.producto.includes('Observación'))).toBe(false)
    expect(products.some((row) => row.producto.includes('Saludos'))).toBe(false)
  })

  it('excludes stored observation rows from printable original and copy detail rows', () => {
    const products = [
      { producto: 'Opción 1 - Pollo', cantidad: 2, category: REMITO_ROW_CATEGORIES.numberedOption },
      { producto: 'Observación: Saludos 👍', cantidad: '', category: REMITO_ROW_CATEGORIES.observation },
      { producto: 'Observación: solo cena', cantidad: '', category: REMITO_ROW_CATEGORIES.additional }
    ]

    const originalRows = getPrintableDetailRows(products, 2)
    const copyRows = getPrintableDetailRows(products, 2)

    expect(originalRows).toEqual(copyRows)
    expect(originalRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ producto: 'Opción 1 - Pollo', cantidad: 2 }),
      expect.objectContaining({ producto: 'TOTAL MENÚS / VIANDAS', cantidad: 2 })
    ]))
    expect(originalRows.some((row) => row.producto.includes('Observación'))).toBe(false)
    expect(originalRows.some((row) => row.producto.includes('Saludos'))).toBe(false)
    expect(originalRows.some((row) => row.producto.includes('solo cena'))).toBe(false)
  })

  it('calculates TOTAL MENU only from main food rations', () => {
    const orders = [
      makeOrder({
        items: [{ id: 'main', name: 'Menú principal: Pollo', quantity: 1 }],
        custom_responses: [
          { title: 'Bebidas (solo Genneia)', response: 'Agua' },
          { title: 'Fruta o postre', response: 'Fruta' },
          { title: 'Guarnición', response: 'Puré' }
        ],
        comments: 'No sumar'
      }),
      makeOrder({
        id: crypto.randomUUID(),
        service: 'dinner',
        items: [{ id: 'dinner', name: 'Cena: Pastel de papas', quantity: 1 }],
        custom_responses: [{ title: 'Bebidas (solo Genneia)', response: 'Soda' }]
      })
    ]

    expect(summarizeProducts(orders)).toEqual(expect.arrayContaining([
      expect.objectContaining({ producto: 'Menú principal: Pollo - Puré', cantidad: 1, category: REMITO_ROW_CATEGORIES.mainMenu }),
      expect.objectContaining({ producto: 'Bebida: Agua', cantidad: 1, category: REMITO_ROW_CATEGORIES.drink }),
      expect.objectContaining({ producto: 'Bebida: Soda', cantidad: 1, category: REMITO_ROW_CATEGORIES.drink }),
      expect.objectContaining({ producto: 'Postre: Fruta', cantidad: 2, category: REMITO_ROW_CATEGORIES.dessert })
    ]))
    expect(summarizeProducts(orders).some((row) => row.category === REMITO_ROW_CATEGORIES.side)).toBe(false)
    expect(summarizeProducts(orders).some((row) => row.category === REMITO_ROW_CATEGORIES.observation)).toBe(false)
    expect(getTotalMenuItemsForRemito(orders)).toBe(2)
  })

  it('separates the same option into different remito rows by selected side', () => {
    const products = summarizeProducts([
      makeOrder({
        items: [{ id: 'op-1', name: 'Opción 1 - Hamburguesas gratinadas', quantity: 1 }],
        custom_responses: [{ title: 'Guarnición', response: 'Puré' }]
      }),
      makeOrder({
        id: crypto.randomUUID(),
        items: [{ id: 'op-1', name: 'Opción 1 - Hamburguesas gratinadas', quantity: 2 }],
        custom_responses: [{ title: 'Guarnición', response: 'Papas' }]
      }),
      makeOrder({
        id: crypto.randomUUID(),
        order_origin: 'admin_extra',
        total_items: 1,
        items: [{ id: 'op-1', name: 'Opción 1 - Hamburguesas gratinadas', quantity: 1 }],
        custom_responses: [{ title: 'Guarnición', response: 'Puré' }]
      })
    ])

    expect(products).toEqual(expect.arrayContaining([
      expect.objectContaining({
        producto: 'Opción 1 - Hamburguesas gratinadas - Puré',
        cantidad: 2,
        category: REMITO_ROW_CATEGORIES.numberedOption
      }),
      expect.objectContaining({
        producto: 'Opción 1 - Hamburguesas gratinadas - Papas',
        cantidad: 2,
        category: REMITO_ROW_CATEGORIES.numberedOption
      })
    ]))
    expect(products.filter((row) => row.producto.startsWith('Opción 1 - Hamburguesas gratinadas'))).toHaveLength(2)
    expect(getRemitoMenuTotalFromRows(products)).toBe(4)
  })

  it('splits three units of the same option by per-unit side quantities', () => {
    const products = summarizeProducts([
      makeOrder({
        total_items: 3,
        items: [{ id: 'op-1', name: 'Opción 1 - Milanesa', quantity: 3 }],
        custom_responses: [{
          title: 'Guarnición',
          quantities: {
            Puré: 1,
            'Papas fritas': 2
          }
        }]
      })
    ])

    expect(products).toEqual(expect.arrayContaining([
      expect.objectContaining({
        producto: 'Opción 1 - Milanesa - Puré',
        cantidad: 1,
        category: REMITO_ROW_CATEGORIES.numberedOption
      }),
      expect.objectContaining({
        producto: 'Opción 1 - Milanesa - Papas fritas',
        cantidad: 2,
        category: REMITO_ROW_CATEGORIES.numberedOption
      })
    ]))
    expect(products.filter((row) => row.producto.startsWith('Opción 1 - Milanesa'))).toHaveLength(2)
    expect(products.some((row) => row.producto.startsWith('Guarnición:'))).toBe(false)
    expect(getRemitoMenuTotalFromRows(products)).toBe(3)
  })

  it('ignores null historical items and side responses without crashing remitos', () => {
    const products = summarizeProducts([
      makeOrder({
        total_items: 1,
        items: [null, { id: 'op-1', name: 'Opción 1 - Milanesa', quantity: 1 }],
        custom_responses: [null, { title: 'Guarnición', response: 'Puré' }]
      })
    ])

    expect(products).toEqual(expect.arrayContaining([
      expect.objectContaining({
        producto: 'Opción 1 - Milanesa - Puré',
        cantidad: 1,
        category: REMITO_ROW_CATEGORIES.numberedOption
      })
    ]))
    expect(getRemitoMenuTotalFromRows(products)).toBe(1)
  })

  it('groups equivalent dinner labels into one Cena row without changing TOTAL MENU', () => {
    const orders = [
      makeOrder({ items: [{ id: 'main', name: 'Menú principal', quantity: 1 }] }),
      makeOrder({ id: crypto.randomUUID(), items: [{ id: 'op-1', name: 'Opción 1', quantity: 1 }] }),
      makeOrder({ id: crypto.randomUUID(), items: [{ id: 'op-2', name: 'Opción 2', quantity: 1 }] }),
      makeOrder({
        id: crypto.randomUUID(),
        service: 'dinner',
        items: [{ id: 'dinner-1', name: 'Cena: CANELONES DE JAMÓN Y QUESO CON SALSA MIXTA', quantity: 1 }]
      }),
      makeOrder({
        id: crypto.randomUUID(),
        service: 'dinner',
        items: [{ id: 'dinner-2', name: 'Menú de cena: CANELONES DE JAMÓN Y QUESO CON SALSA MIXTA', quantity: 1 }]
      })
    ]

    const products = summarizeProducts(orders)
    const total = getRemitoMenuTotalFromRows(products)
    const originalRows = getPrintableDetailRows(products, total)
    const copyRows = getPrintableDetailRows(products, total)
    const canelonesRows = originalRows.filter((row) =>
      row.producto === 'Cena: CANELONES DE JAMÓN Y QUESO CON SALSA MIXTA'
    )

    expect(canelonesRows).toEqual([{
      producto: 'Cena: CANELONES DE JAMÓN Y QUESO CON SALSA MIXTA',
      cantidad: 2,
      category: REMITO_ROW_CATEGORIES.dinner
    }])
    expect(total).toBe(5)
    expect(originalRows.find((row) => row.producto === 'TOTAL MENÚS / VIANDAS')).toMatchObject({ cantidad: 5 })
    expect(originalRows).toEqual(copyRows)
  })

  it('keeps Washington control case TOTAL MENU at 7 and shows extras below it', () => {
    const orders = [
      makeOrder({
        items: [{ id: 'main', name: 'Menú principal', quantity: 1 }],
        custom_responses: [
          { title: 'Bebidas (solo Genneia)', response: 'Agua', quantity: 3 },
          { title: 'Guarnición', response: 'Papas fritas' }
        ]
      }),
      makeOrder({
        id: crypto.randomUUID(),
        items: [{ id: 'op-1', name: 'Opción 1', quantity: 1 }],
        custom_responses: [
          { title: 'Bebidas (solo Genneia)', response: 'Coca cola', quantity: 6 },
          { title: 'Guarnición', response: 'Papas fritas' }
        ]
      }),
      makeOrder({
        id: crypto.randomUUID(),
        items: [{ id: 'op-1', name: 'Opción 1', quantity: 1 }]
      }),
      makeOrder({
        id: crypto.randomUUID(),
        items: [{ id: 'op-2', name: 'Opción 2', quantity: 1 }],
        custom_responses: [
          { title: 'Bebidas (solo Genneia)', response: 'Coca Zero', quantity: 2 },
          { title: 'Guarnición', response: 'Papas fritas' }
        ]
      }),
      makeOrder({
        id: crypto.randomUUID(),
        items: [{ id: 'op-3', name: 'Opción 3', quantity: 1 }],
        custom_responses: [
          { title: 'Bebidas (solo Genneia)', response: 'Soda', quantity: 2 },
          { title: 'Guarnición', response: 'Verduras' }
        ]
      }),
      makeOrder({
        id: crypto.randomUUID(),
        items: [{ id: 'op-3', name: 'Opción 3', quantity: 1 }],
        custom_responses: [{ title: 'Guarnición', response: 'Verduras' }]
      }),
      makeOrder({
        id: crypto.randomUUID(),
        service: 'dinner',
        items: [{ id: 'dinner', name: 'Cena', quantity: 1 }],
        custom_responses: []
      })
    ]

    const products = summarizeProducts(orders)
    const total = getRemitoMenuTotalFromRows(products)
    const originalRows = getPrintableDetailRows(products, total)
    const copyRows = getPrintableDetailRows(products, total)
    const totalIndex = originalRows.findIndex((row) => row.producto === 'TOTAL MENÚS / VIANDAS')
    const beverageRows = products.filter((row) => row.category === REMITO_ROW_CATEGORIES.drink)
    const dessertRows = products.filter((row) => row.category === REMITO_ROW_CATEGORIES.dessert)
    const sideRows = products.filter((row) => row.category === REMITO_ROW_CATEGORIES.side)
    const panRow = products.find((row) => row.producto === 'Pan')

    expect(total).toBe(7)
    expect(originalRows[totalIndex]).toMatchObject({ producto: 'TOTAL MENÚS / VIANDAS', cantidad: 7 })
    expect(beverageRows.reduce((sum, row) => sum + row.cantidad, 0)).toBe(16)
    expect(dessertRows.reduce((sum, row) => sum + row.cantidad, 0)).toBe(7)
    expect(panRow).toMatchObject({ producto: 'Pan', cantidad: 7 })
    expect(sideRows).toHaveLength(0)
    expect(originalRows).toEqual(copyRows)
    expect(originalRows.find((row) => row.producto === 'Menú principal - Papas fritas')).toMatchObject({ cantidad: 1 })
    expect(originalRows.find((row) => row.producto === 'Opción 1 - Papas fritas')).toMatchObject({ cantidad: 1 })
    expect(originalRows.find((row) => row.producto === 'Opción 1')).toMatchObject({ cantidad: 1 })
    expect(originalRows.find((row) => row.producto === 'Opción 3 - Verduras')).toMatchObject({ cantidad: 2 })
    expect(originalRows.findIndex((row) => row.producto === 'Bebida: Agua')).toBeGreaterThan(totalIndex)
    expect([REMITO_ROW_CATEGORIES.drink, REMITO_ROW_CATEGORIES.side, REMITO_ROW_CATEGORIES.dessert, REMITO_ROW_CATEGORIES.observation]
      .every((category) => !isMenuCountableCategory(category))
    ).toBe(true)
    expect(products
      .filter((row) => !isMenuCountableCategory(row.category))
      .reduce((sum, row) => sum + Number(row.cantidad || 0), 0)
    ).toBe(30)
  })

  it('separates EPSE requesting locations with different delivery locations', () => {
    const orders = [
      makeOrder({
        id: '10000000-0000-4000-8000-000000000101',
        company_slug: 'epse',
        company_name: 'EPSE',
        requesting_location_code: 'EPSE_ESTACION_TRANSFORMADORA',
        requesting_location: 'EPSE – Estación Transformadora',
        location: 'EPSE – Estación Transformadora',
        delivery_location: 'EPSE – Estación Transformadora',
        total_items: 12,
        items: [{ id: 'op-1', name: 'Opción 1', quantity: 12 }]
      }),
      makeOrder({
        id: '10000000-0000-4000-8000-000000000102',
        company_slug: 'epse',
        company_name: 'EPSE',
        requesting_location_code: 'EPSE_PLANTA_FOTOVOLTAICA',
        requesting_location: 'EPSE – Planta Fotovoltaica',
        location: 'EPSE – Planta Fotovoltaica',
        delivery_location: 'EPSE – Planta Fotovoltaica',
        total_items: 8,
        items: [{ id: 'op-1', name: 'Opción 1', quantity: 8 }]
      })
    ]

    const groups = buildCompanyGroups(orders)

    expect(groups).toHaveLength(2)
    expect(groups.map((group) => group.locationKey).sort()).toEqual([
      'epse_estacion_transformadora',
      'epse_planta_fotovoltaica'
    ])
    expect(groups.map((group) => buildRemitoSnapshot({ group }).totalMenus).sort((a, b) => a - b)).toEqual([8, 12])
  })

  it('separates EPSE requesting locations even when they share delivery location', () => {
    const orders = [
      makeOrder({
        id: '10000000-0000-4000-8000-000000000201',
        company_slug: 'epse',
        company_name: 'EPSE',
        requesting_location_code: 'EPSE_ANCHIPURAC',
        requesting_location: 'EPSE – Anchipurac',
        location: 'EPSE – Anchipurac',
        delivery_location: 'EPSE – Estación Transformadora',
        total_items: 5,
        items: [{ id: 'op-1', name: 'Opción 1', quantity: 5 }]
      }),
      makeOrder({
        id: '10000000-0000-4000-8000-000000000202',
        company_slug: 'epse',
        company_name: 'EPSE',
        requesting_location_code: 'EPSE_OBRA_LINEA_ALTA_TENSION',
        requesting_location: 'EPSE – Obra Línea de Alta Tensión',
        location: 'EPSE – Obra Línea de Alta Tensión',
        delivery_location: 'EPSE – Estación Transformadora',
        total_items: 7,
        items: [{ id: 'op-2', name: 'Opción 2', quantity: 7 }]
      })
    ]

    const groups = buildCompanyGroups(orders)

    expect(groups).toHaveLength(2)
    expect(groups.map((group) => group.locationKey).sort()).toEqual([
      'epse_anchipurac',
      'epse_obra_linea_alta_tension'
    ])
    expect(new Set(groups.flatMap((group) => group.orders.map((order) => order.id))).size).toBe(2)
  })

  it('falls back to original EPSE location for old orders without requesting_location_code', () => {
    const orders = [
      makeOrder({
        id: '10000000-0000-4000-8000-000000000301',
        company_slug: 'epse',
        company_name: 'EPSE',
        location: 'EPSE – Estación Transformadora',
        delivery_location: 'EPSE – Planta Fotovoltaica',
        total_items: 4,
        items: [{ id: 'op-1', name: 'Opción 1', quantity: 4 }]
      }),
      makeOrder({
        id: '10000000-0000-4000-8000-000000000302',
        company_slug: 'epse',
        company_name: 'EPSE',
        location: 'EPSE – Planta Fotovoltaica',
        delivery_location: 'EPSE – Planta Fotovoltaica',
        total_items: 6,
        items: [{ id: 'op-2', name: 'Opción 2', quantity: 6 }]
      })
    ]

    const groups = buildCompanyGroups(orders)

    expect(groups).toHaveLength(2)
    expect(groups.map((group) => group.locationKey).sort()).toEqual([
      'epse_estacion_transformadora',
      'epse_planta_fotovoltaica'
    ])
  })

  it('separates ISEMAR orders by selected predio while keeping the same company slug', () => {
    const orders = [
      makeOrder({
        id: '10000000-0000-4000-8000-000000000601',
        company_slug: 'isemar',
        company_name: 'ISEMAR',
        requesting_location_code: 'ISEMAR_PREDIO_1',
        location: 'ISEMAR – PREDIO 1',
        delivery_location: 'ISEMAR – PREDIO 1',
        total_items: 4,
        items: [{ id: 'op-1', name: 'Opción 1', quantity: 4 }]
      }),
      makeOrder({
        id: '10000000-0000-4000-8000-000000000602',
        company_slug: 'isemar',
        company_name: 'ISEMAR',
        requesting_location_code: 'ISEMAR_PREDIO_2',
        location: 'ISEMAR – PREDIO 2',
        delivery_location: 'ISEMAR – PREDIO 2',
        total_items: 6,
        items: [{ id: 'op-2', name: 'Opción 2', quantity: 6 }]
      })
    ]

    const groups = buildCompanyGroups(orders)

    expect(groups).toHaveLength(2)
    expect(groups.map((group) => group.slug)).toEqual(['isemar', 'isemar'])
    expect(groups.map((group) => group.locationKey).sort()).toEqual([
      'isemar_predio_1',
      'isemar_predio_2'
    ])
    expect(groups.map((group) => group.displayName).sort()).toEqual([
      'ISEMAR – PREDIO 1',
      'ISEMAR – PREDIO 2'
    ])
    expect(groups.map((group) => buildRemitoSnapshot({ group }).totalMenus).sort((a, b) => a - b)).toEqual([4, 6])
  })

  it('keeps non-EPSE grouping by company unchanged', () => {
    const orders = [
      makeOrder({
        id: '10000000-0000-4000-8000-000000000401',
        company_slug: 'genneia',
        company_name: 'Genneia',
        location: 'Genneia',
        delivery_location: 'Entrega Norte'
      }),
      makeOrder({
        id: '10000000-0000-4000-8000-000000000402',
        company_slug: 'genneia',
        company_name: 'Genneia',
        location: 'Genneia',
        delivery_location: 'Entrega Sur'
      })
    ]

    const groups = buildCompanyGroups(orders)

    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      slug: 'genneia',
      name: 'Genneia',
      locationKey: ''
    })
    expect(groups[0].orders.map((order) => order.id).sort()).toEqual([
      '10000000-0000-4000-8000-000000000401',
      '10000000-0000-4000-8000-000000000402'
    ])
  })

  it('keeps EPSE grouped totals equal to the general EPSE total without duplicated orders', () => {
    const orders = [
      makeOrder({
        id: '10000000-0000-4000-8000-000000000501',
        company_slug: 'epse',
        company_name: 'EPSE',
        requesting_location_code: 'EPSE_ESTACION_TRANSFORMADORA',
        requesting_location: 'EPSE – Estación Transformadora',
        location: 'EPSE – Estación Transformadora',
        delivery_location: 'EPSE – Estación Transformadora',
        total_items: 10,
        items: [{ id: 'op-1', name: 'Opción 1', quantity: 10 }]
      }),
      makeOrder({
        id: '10000000-0000-4000-8000-000000000502',
        company_slug: 'epse',
        company_name: 'EPSE',
        requesting_location_code: 'EPSE_PLANTA_FOTOVOLTAICA',
        requesting_location: 'EPSE – Planta Fotovoltaica',
        location: 'EPSE – Planta Fotovoltaica',
        delivery_location: 'EPSE – Estación Transformadora',
        total_items: 11,
        items: [{ id: 'op-2', name: 'Opción 2', quantity: 11 }]
      }),
      makeOrder({
        id: '10000000-0000-4000-8000-000000000503',
        company_slug: 'epse',
        company_name: 'EPSE',
        requesting_location_code: 'EPSE_ANCHIPURAC',
        requesting_location: 'EPSE – Anchipurac',
        location: 'EPSE – Anchipurac',
        delivery_location: 'EPSE – Estación Transformadora',
        total_items: 12,
        items: [{ id: 'op-3', name: 'Opción 3', quantity: 12 }]
      })
    ]

    const groups = buildCompanyGroups(orders)
    const snapshots = groups.map((group) => buildRemitoSnapshot({ group }))
    const groupedOrderIds = groups.flatMap((group) => group.orders.map((order) => order.id))

    expect(groups).toHaveLength(3)
    expect(new Set(groupedOrderIds).size).toBe(orders.length)
    expect(snapshots.reduce((sum, snapshot) => sum + snapshot.totalMenus, 0)).toBe(33)
    expect(snapshots.flatMap((snapshot) => snapshot.orderIds).sort()).toEqual(orders.map((order) => order.id).sort())
  })
})

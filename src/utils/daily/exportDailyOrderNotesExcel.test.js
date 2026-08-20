import { describe, expect, it } from 'vitest'
import {
  buildCompanyGroups,
  getPrintableDetailRows,
  buildRemitoSnapshot,
  buildRemitoWorkbook,
  getRemitoMenuTotalFromRows,
  getRemitoIssueFallbackMessage,
  getRemitoRowPriority,
  getOrderRemitoBeverages,
  getTotalMenuItemsForRemito,
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
      expect(images[0].range.ext).toEqual(images[1].range.ext)
      expect(images[0].range.ext).toEqual({ width: 50, height: 50 })
      expect(images[0].range.tl.nativeCol).toBe(1)
      expect(images[1].range.tl.nativeCol).toBe(8)
      expect(images[0].range.tl.nativeColOff).toBe(images[1].range.tl.nativeColOff)
      expect(images[1].range.tl.col - images[0].range.tl.col).toBeCloseTo(7, 4)
      expect(images[0].range.tl.nativeRow).toBe(images[1].range.tl.nativeRow)
      expect(images[0].range.tl.nativeRowOff).toBe(images[1].range.tl.nativeRowOff)
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

    expect(total).toBe(7)
    expect(originalRows[totalIndex]).toMatchObject({ producto: 'TOTAL MENÚS / VIANDAS', cantidad: 7 })
    expect(beverageRows.reduce((sum, row) => sum + row.cantidad, 0)).toBe(16)
    expect(dessertRows.reduce((sum, row) => sum + row.cantidad, 0)).toBe(7)
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
    ).toBe(23)
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

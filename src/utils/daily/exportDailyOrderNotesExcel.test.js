import { describe, expect, it } from 'vitest'
import {
  getPrintableDetailRows,
  buildRemitoSnapshot,
  getRemitoMenuTotalFromRows,
  getRemitoRowPriority,
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

  it('places observations after operational products without counting them as products', () => {
    const products = summarizeProducts([
      makeOrder({
        items: [{ id: 'op-10', name: 'Opción 10 - Pasta', quantity: 1 }],
        comments: 'Saludos 👋'
      }),
      makeOrder({
        id: crypto.randomUUID(),
        items: [{ id: 'op-2', name: 'Opción 2 - Carne', quantity: 1 }],
        comments: 'Saludos 👋'
      })
    ])

    expect(products).toContainEqual({
      producto: 'Observación: Saludos 👋',
      cantidad: '',
      category: REMITO_ROW_CATEGORIES.observation
    })
    expect(products.filter((row) => row.producto === 'Observación: Saludos 👋')).toHaveLength(1)
    expect(products.map((row) => row.producto).indexOf('Observación: Saludos 👋'))
      .toBeGreaterThan(products.map((row) => row.producto).indexOf('Opción 2 - Carne'))
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
      expect.objectContaining({ producto: 'Bebida: Agua', cantidad: 1, category: REMITO_ROW_CATEGORIES.drink }),
      expect.objectContaining({ producto: 'Bebida: Soda', cantidad: 1, category: REMITO_ROW_CATEGORIES.drink }),
      expect.objectContaining({ producto: 'Postre: Fruta', cantidad: 2, category: REMITO_ROW_CATEGORIES.dessert }),
      expect.objectContaining({ producto: 'Guarnición: Puré', cantidad: 1, category: REMITO_ROW_CATEGORIES.side }),
      expect.objectContaining({ producto: 'Observación: No sumar', cantidad: '', category: REMITO_ROW_CATEGORIES.observation })
    ]))
    expect(getTotalMenuItemsForRemito(orders)).toBe(2)
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
    expect(sideRows.reduce((sum, row) => sum + row.cantidad, 0)).toBe(5)
    expect(originalRows).toEqual(copyRows)
    expect(originalRows.findIndex((row) => row.producto === 'Bebida: Agua')).toBeGreaterThan(totalIndex)
    expect(originalRows.findIndex((row) => row.producto === 'Guarnición: Papas fritas')).toBeGreaterThan(totalIndex)
    expect([REMITO_ROW_CATEGORIES.drink, REMITO_ROW_CATEGORIES.side, REMITO_ROW_CATEGORIES.dessert, REMITO_ROW_CATEGORIES.observation]
      .every((category) => !isMenuCountableCategory(category))
    ).toBe(true)
    expect(products
      .filter((row) => !isMenuCountableCategory(row.category))
      .reduce((sum, row) => sum + Number(row.cantidad || 0), 0)
    ).toBe(28)
  })
})

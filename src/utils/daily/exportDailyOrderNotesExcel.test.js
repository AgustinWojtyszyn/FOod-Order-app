import { describe, expect, it } from 'vitest'
import {
  getRemitoRowPriority,
  getTotalMenuItemsForRemito,
  normalizeBeverageLabel,
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
      { producto: 'Bebida: Agua', cantidad: 1 },
      { producto: 'Bebida: Coca cola', cantidad: 1 },
      { producto: 'Bebida: Coca Zero', cantidad: 1 },
      { producto: 'Bebida: Soda', cantidad: 1 }
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
      { producto: 'Bebida: Coca Zero', cantidad: 1 }
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
      'Bebida: Agua',
      'Cena: Milanesa',
      'Fruta o postre: Fruta',
      'Guarnición: Puré',
      'Menú de cena: Pastel',
      'Menú principal: Pollo',
      'Observación: Saludos',
      'Opción 2 - Carne',
      'Opción 10 - Pasta'
    ])
  })

  it('places observations before numbered options without counting them as products', () => {
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

    expect(products).toContainEqual({ producto: 'Observación: Saludos 👋', cantidad: '' })
    expect(products.filter((row) => row.producto === 'Observación: Saludos 👋')).toHaveLength(1)
    expect(products.map((row) => row.producto).indexOf('Observación: Saludos 👋'))
      .toBeLessThan(products.map((row) => row.producto).indexOf('Opción 2 - Carne'))
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
      { producto: 'Bebida: Agua', cantidad: 1 },
      { producto: 'Bebida: Soda', cantidad: 1 },
      { producto: 'Fruta o postre: Fruta', cantidad: 1 },
      { producto: 'Guarnición: Puré', cantidad: 1 },
      { producto: 'Observación: No sumar', cantidad: '' }
    ]))
    expect(getTotalMenuItemsForRemito(orders)).toBe(2)
  })
})

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BEVERAGE_LABEL,
  DEFAULT_DESSERT_LABEL,
  getOrderBeverageBreakdown,
  getOrderDessertBreakdown,
  getOrderMenuBreakdown,
  getOrderMenuTotal,
  summarizeOperationalOrder
} from './orderOperationalTotals'

const baseOrder = (overrides = {}) => ({
  id: 'order-1',
  user_id: 'user-1',
  order_origin: 'user',
  service: 'lunch',
  total_items: 1,
  items: [{ name: 'Menú principal', quantity: 1 }],
  custom_responses: [],
  ...overrides
})

describe('orderOperationalTotals', () => {
  it('A: calcula defaults por menú cuando no hay bebida ni postre', () => {
    const order = baseOrder({
      total_items: 10,
      items: [{ name: 'Menú principal', quantity: 10 }]
    })

    expect(getOrderMenuTotal(order)).toBe(10)
    expect(getOrderBeverageBreakdown(order)).toEqual([{ label: DEFAULT_BEVERAGE_LABEL, quantity: 10 }])
    expect(getOrderDessertBreakdown(order)).toEqual([{ label: DEFAULT_DESSERT_LABEL, quantity: 10 }])
  })

  it('B: usa bebidas y postres explicitos sin duplicar defaults', () => {
    const order = baseOrder({
      total_items: 10,
      items: [{ name: 'Menú principal', quantity: 10 }],
      custom_responses: [
        { title: 'Bebida', response: 'Agua', quantities: { Agua: 10 } },
        { title: 'Postre', response: 'Fruta', quantities: { Fruta: 10 } }
      ]
    })

    expect(getOrderMenuTotal(order)).toBe(10)
    expect(getOrderBeverageBreakdown(order)).toEqual([{ label: 'Agua', quantity: 10 }])
    expect(getOrderDessertBreakdown(order)).toEqual([{ label: 'Fruta', quantity: 10 }])
  })

  it('completa solo los postres faltantes con fruta', () => {
    const order = baseOrder({
      total_items: 4,
      items: [{ name: 'Menú principal', quantity: 4 }],
      custom_responses: [
        { title: 'Bebida', quantities: { Agua: 4 } },
        { title: 'Postre', quantities: { Flan: 1 } }
      ]
    })

    expect(getOrderBeverageBreakdown(order)).toEqual([{ label: 'Agua', quantity: 4 }])
    expect(getOrderDessertBreakdown(order)).toEqual([
      { label: 'Flan', quantity: 1 },
      { label: DEFAULT_DESSERT_LABEL, quantity: 3 }
    ])
  })

  it('completa solo las bebidas faltantes con agua sin gas', () => {
    const order = baseOrder({
      total_items: 4,
      items: [{ name: 'Menú principal', quantity: 4 }],
      custom_responses: [
        { title: 'Bebida', quantities: { 'Coca cola': 2 } },
        { title: 'Postre', quantities: { Fruta: 4 } }
      ]
    })

    expect(getOrderBeverageBreakdown(order)).toEqual([
      { label: 'Coca cola', quantity: 2 },
      { label: DEFAULT_BEVERAGE_LABEL, quantity: 2 }
    ])
    expect(getOrderDessertBreakdown(order)).toEqual([{ label: 'Fruta', quantity: 4 }])
  })

  it('completa bebida y postre por unidad cuando faltan ambos parcialmente', () => {
    const order = baseOrder({
      total_items: 3,
      items: [{ name: 'Opción 1', quantity: 3 }],
      custom_responses: [
        { title: 'Bebida', response: ['Agua'] },
        { title: 'Postre', quantities: { Flan: 2 } }
      ]
    })

    expect(getOrderBeverageBreakdown(order)).toEqual([{ label: 'Agua', quantity: 3 }])
    expect(getOrderDessertBreakdown(order)).toEqual([
      { label: 'Flan', quantity: 2 },
      { label: DEFAULT_DESSERT_LABEL, quantity: 1 }
    ])
  })

  it('C: respeta varios platos y aplica defaults por el total de menús', () => {
    const order = baseOrder({
      total_items: 12,
      items: [
        { name: 'Menú principal', quantity: 9 },
        { name: 'Opción 1', quantity: 2 },
        { name: 'Opción 4', quantity: 1 }
      ]
    })

    expect(getOrderMenuTotal(order)).toBe(12)
    expect(getOrderMenuBreakdown(order)).toEqual([
      { label: 'Menú principal', quantity: 9 },
      { label: 'Opción 1', quantity: 2 },
      { label: 'Opción 4', quantity: 1 }
    ])
    expect(getOrderBeverageBreakdown(order)).toEqual([{ label: DEFAULT_BEVERAGE_LABEL, quantity: 12 }])
    expect(getOrderDessertBreakdown(order)).toEqual([{ label: DEFAULT_DESSERT_LABEL, quantity: 12 }])
  })

  it('D: contabiliza pedidos extra sin usuario desde total_items', () => {
    const order = baseOrder({
      user_id: null,
      order_origin: 'admin_extra',
      total_items: 8,
      items: [{ name: 'Opción 2', quantity: 8 }],
      customer_name: null,
      customer_email: null
    })

    expect(summarizeOperationalOrder(order)).toMatchObject({
      menuTotal: 8,
      menuBreakdown: [{ label: 'Opción 2', quantity: 8 }],
      beverageBreakdown: [{ label: DEFAULT_BEVERAGE_LABEL, quantity: 8 }],
      dessertBreakdown: [{ label: DEFAULT_DESSERT_LABEL, quantity: 8 }]
    })
  })

  it('E: prefiere quantities y no suma arrays repetidos dos veces', () => {
    const order = baseOrder({
      total_items: 10,
      custom_responses: [
        {
          title: 'Bebida',
          response: ['Agua', 'Agua', 'Coca cola'],
          quantities: { Agua: 6, 'Coca cola': 4 }
        },
        {
          title: 'Postre',
          response: ['Fruta', 'Fruta'],
          quantities: { Fruta: 10 }
        }
      ]
    })

    expect(getOrderBeverageBreakdown(order)).toEqual([
      { label: 'Agua', quantity: 6 },
      { label: 'Coca cola', quantity: 4 }
    ])
    expect(getOrderDessertBreakdown(order)).toEqual([{ label: 'Fruta', quantity: 10 }])
  })

  it('respeta cantidades explicitas mayores al total sin recortarlas ni sumar defaults', () => {
    const order = baseOrder({
      total_items: 2,
      custom_responses: [
        { title: 'Bebida', response: 'Agua', quantity: 3 },
        { title: 'Postre', quantities: { Fruta: 2 } }
      ]
    })

    expect(getOrderBeverageBreakdown(order)).toEqual([{ label: 'Agua', quantity: 3 }])
    expect(getOrderDessertBreakdown(order)).toEqual([{ label: 'Fruta', quantity: 2 }])
  })
})

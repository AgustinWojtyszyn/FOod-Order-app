import { describe, expect, it } from 'vitest'
import { buildMenuCounts, buildRanking, buildSideBucketsFromOrders } from './trendsHelpers'

describe('trendsHelpers', () => {
  it('cuenta arrays historicos de bebidas como unidades, no como categoria literal', () => {
    const orders = [
      {
        id: 'order-agua-4',
        status: 'archived',
        delivery_date: '2026-08-01',
        total_items: 4,
        items: [{ name: 'Menú principal', quantity: 4 }],
        custom_responses: [
          { title: 'Bebida', response: '["Agua","Agua","Agua","Agua"]' },
          { title: 'Guarnición', response: ['Arroz', 'Arroz', 'Puré'] }
        ]
      }
    ]

    const buckets = buildSideBucketsFromOrders(orders)
    const beverageRanking = buildRanking(buckets.tiposBebidas)
    const sideRanking = buildRanking(buckets.tiposGuarniciones)

    expect(beverageRanking.items[0]).toMatchObject({ label: 'Agua', count: 4, percent: 100 })
    expect(beverageRanking.items.find((item) => item.label.includes('['))).toBeUndefined()
    expect(sideRanking.items).toEqual([
      { label: 'Arroz', count: 2, percent: expect.closeTo(66.666, 2) },
      { label: 'Puré', count: 1, percent: expect.closeTo(33.333, 2) }
    ])
  })

  it('usa cantidades operativas para menus y pedidos extra administrativos', () => {
    const counts = buildMenuCounts([
      {
        id: 'extra-1',
        order_origin: 'admin_extra',
        total_items: 8,
        items: [{ name: 'Opción 2', quantity: 8 }],
        custom_responses: []
      }
    ])

    expect(counts).toEqual({ 'Opción 2': 8 })
  })
})

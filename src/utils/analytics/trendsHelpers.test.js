import { describe, expect, it } from 'vitest'
import {
  buildComparisonMetrics,
  buildMenuCounts,
  buildRankingComparisonItems,
  buildRanking,
  buildSideBucketsFromOrders,
  buildTrendsSnapshot,
  COMPARISON_MODES,
  getComparisonRange
} from './trendsHelpers'

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

  it('calcula el periodo anterior con la misma cantidad inclusiva de dias', () => {
    expect(getComparisonRange(
      { start: '2026-08-10', end: '2026-08-13' },
      COMPARISON_MODES.PREVIOUS_PERIOD
    )).toEqual({ start: '2026-08-06', end: '2026-08-09' })
  })

  it('desplaza el mismo periodo del año anterior contemplando años bisiestos', () => {
    expect(getComparisonRange(
      { start: '2024-02-29', end: '2024-03-02' },
      COMPARISON_MODES.PREVIOUS_YEAR
    )).toEqual({ start: '2023-02-28', end: '2023-03-02' })
  })

  it('calcula variaciones absolutas, porcentuales y de participacion', () => {
    const current = buildTrendsSnapshot([
      {
        items: [{ name: 'Plato principal', quantity: 4 }],
        custom_responses: [
          { title: 'Bebida', response: '["Agua","Agua","Agua","Coca"]' },
          { title: 'Guarnición', response: ['Arroz', 'Arroz', 'Puré', 'Puré'] }
        ]
      },
      {
        items: [{ name: 'Bife de chorizo', quantity: 1 }],
        custom_responses: [{ title: 'Bebida', response: 'Agua' }]
      }
    ])
    const previous = buildTrendsSnapshot([
      {
        items: [{ name: 'Plato principal', quantity: 1 }],
        custom_responses: [
          { title: 'Bebida', response: 'Coca' },
          { title: 'Guarnición', response: 'Puré' }
        ]
      }
    ])

    const metrics = buildComparisonMetrics(current, previous)

    expect(metrics.total).toMatchObject({ current: 2, previous: 1, delta: 1, percent: 100 })
    expect(metrics.leaders.beverage).toMatchObject({
      label: 'Agua',
      previousLabel: 'Coca',
      currentShare: 80,
      previousShare: 0,
      ppDelta: 80,
      leaderChanged: true
    })
  })

  it('enriquece rankings actuales con variaciones por item sin recalcular conteos', () => {
    const currentItems = [
      { label: 'Papas fritas', count: 309, percent: 33.6 },
      { label: 'Puré', count: 80, percent: 8.7 }
    ]
    const previousRanking = {
      items: [
        { label: 'Papas fritas', count: 333, percent: 36.7 }
      ]
    }

    expect(buildRankingComparisonItems(currentItems, previousRanking)).toEqual([
      {
        label: 'Papas fritas',
        count: 309,
        percent: 33.6,
        comparison: {
          isNew: false,
          previousCount: 333,
          previousPercent: 36.7,
          countDelta: -24,
          ppDelta: expect.closeTo(-3.1, 5)
        }
      },
      {
        label: 'Puré',
        count: 80,
        percent: 8.7,
        comparison: {
          isNew: true,
          previousCount: 0,
          previousPercent: 0,
          countDelta: 80,
          ppDelta: 8.7
        }
      }
    ])

    expect(buildRankingComparisonItems(currentItems, previousRanking, true)[0].comparison)
      .toEqual({ noPreviousData: true })
  })
})

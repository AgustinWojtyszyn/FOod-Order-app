import { describe, expect, it } from 'vitest'
import { buildMonthlyOperationalSummary } from './monthlyOrderCalculations'

const day = (date, count, extra = {}) => ({
  date,
  count,
  lunch_items: 0,
  dinner_items: 0,
  ...extra
})

const buildSummary = (overrides = {}) => buildMonthlyOperationalSummary({
  totalsForView: { pedidos: 0 },
  dailyDataForView: {
    daily_breakdown: [],
    range_totals: { count: 0, lunch_items: 0, dinner_items: 0 }
  },
  ordersByDayForView: {},
  empresasForView: [],
  ...overrides
})

describe('buildMonthlyOperationalSummary', () => {
  it('devuelve valores seguros para rango vacio', () => {
    const summary = buildSummary()

    expect(summary.hasData).toBe(false)
    expect(summary.averagePerDay).toBe(0)
    expect(summary.peakDay.label).toBe('Sin datos')
    expect(summary.daysWithoutOrders).toBe(0)
    expect(summary.trend.label).toBe('Sin variación')
  })

  it('calcula un rango de un solo dia con el dia central en segunda mitad', () => {
    const summary = buildSummary({
      totalsForView: { pedidos: 5 },
      dailyDataForView: {
        daily_breakdown: [day('2026-07-01', 5)],
        range_totals: { count: 5, lunch_items: 4, dinner_items: 1 }
      }
    })

    expect(summary.calendarDays).toBe(1)
    expect(summary.averagePerDay).toBe(5)
    expect(summary.trend.firstHalfTotal).toBe(0)
    expect(summary.trend.secondHalfTotal).toBe(5)
    expect(summary.trend.label).toBe('+5 pedidos en la segunda mitad')
  })

  it('usa rango inclusivo y cuenta dias sin pedidos en el promedio', () => {
    const summary = buildSummary({
      totalsForView: { pedidos: 4 },
      dailyDataForView: {
        daily_breakdown: [
          day('2026-07-01', 2),
          day('2026-07-02', 0),
          day('2026-07-03', 2)
        ],
        range_totals: { count: 4, lunch_items: 4, dinner_items: 0 }
      }
    })

    expect(summary.calendarDays).toBe(3)
    expect(summary.averagePerDay).toBe(1.3)
    expect(summary.daysWithoutOrders).toBe(1)
  })

  it('completa dias ausentes con cero cuando daily_breakdown trae start y end', () => {
    const summary = buildSummary({
      totalsForView: { pedidos: 4 },
      dailyDataForView: {
        start: '2026-07-01',
        end: '2026-07-03',
        daily_breakdown: [
          day('2026-07-01', 2),
          day('2026-07-03', 2)
        ],
        range_totals: { count: 4, lunch_items: 4, dinner_items: 0 }
      }
    })

    expect(summary.calendarDays).toBe(3)
    expect(summary.averagePerDay).toBe(1.3)
    expect(summary.daysWithoutOrders).toBe(1)
    expect(summary.trend.firstHalfTotal).toBe(2)
    expect(summary.trend.secondHalfTotal).toBe(2)
  })

  it('redondea el promedio a un decimal', () => {
    const summary = buildSummary({
      totalsForView: { pedidos: 10 },
      dailyDataForView: {
        daily_breakdown: [day('2026-07-01', 3), day('2026-07-02', 3), day('2026-07-03', 4)],
        range_totals: { count: 10, lunch_items: 10, dinner_items: 0 }
      }
    })

    expect(summary.averagePerDay).toBe(3.3)
  })

  it('calcula dia pico y resuelve empates con la fecha mas antigua', () => {
    const summary = buildSummary({
      totalsForView: { pedidos: 8 },
      dailyDataForView: {
        daily_breakdown: [day('2026-07-01', 4), day('2026-07-02', 4)],
        range_totals: { count: 8, lunch_items: 8, dinner_items: 0 }
      }
    })

    expect(summary.peakDay).toMatchObject({ date: '2026-07-01', label: '01/07/2026', count: 4 })
  })

  it('calcula empresa principal y resuelve empates por nombre', () => {
    const summary = buildSummary({
      totalsForView: { pedidos: 6 },
      empresasForView: [
        { empresa: 'Zenit', cantidadPedidos: 3 },
        { empresa: 'Alfa', cantidadPedidos: 3 }
      ]
    })

    expect(summary.topCompany).toEqual({ name: 'Alfa', count: 3 })
  })

  it('cuenta empresas distintas validas', () => {
    const summary = buildSummary({
      empresasForView: [
        { empresa: 'Alfa', cantidadPedidos: 2 },
        { empresa: '', cantidadPedidos: 4 },
        { empresa: 'Beta', cantidadPedidos: 0 },
        { empresa: 'Gamma', cantidadPedidos: 1 }
      ]
    })

    expect(summary.companiesServed).toBe(2)
  })

  it('calcula mix almuerzo cena desde range_totals', () => {
    const summary = buildSummary({
      dailyDataForView: {
        daily_breakdown: [day('2026-07-01', 7)],
        range_totals: { count: 7, lunch_items: 5, dinner_items: 2 }
      }
    })

    expect(summary.mealMix).toEqual({ lunch: 5, dinner: 2 })
  })

  it('calcula top 3 empresas en orden descendente y porcentajes proporcionales', () => {
    const summary = buildSummary({
      empresasForView: [
        { empresa: 'B', cantidadPedidos: 8 },
        { empresa: 'A', cantidadPedidos: 10 },
        { empresa: 'C', cantidadPedidos: 5 },
        { empresa: 'D', cantidadPedidos: 1 }
      ]
    })

    expect(summary.topCompanies.map(company => company.name)).toEqual(['A', 'B', 'C'])
    expect(summary.topCompanies.map(company => company.percentage)).toEqual([100, 80, 50])
  })

  it('respeta el filtro de empresa al usar empresasForView', () => {
    const summary = buildSummary({
      totalsForView: { pedidos: 4 },
      empresasForView: [{ empresa: 'Filtrada', cantidadPedidos: 4 }]
    })

    expect(summary.topCompany).toEqual({ name: 'Filtrada', count: 4 })
    expect(summary.topCompanies).toHaveLength(1)
    expect(summary.companiesServed).toBe(1)
  })

  it('divide rangos pares en mitades equivalentes', () => {
    const summary = buildSummary({
      dailyDataForView: {
        daily_breakdown: [
          day('2026-07-01', 1),
          day('2026-07-02', 2),
          day('2026-07-03', 3),
          day('2026-07-04', 4)
        ],
        range_totals: { count: 10, lunch_items: 10, dinner_items: 0 }
      }
    })

    expect(summary.trend.firstHalfTotal).toBe(3)
    expect(summary.trend.secondHalfTotal).toBe(7)
  })

  it('asigna el dia central de rangos impares a la segunda mitad', () => {
    const summary = buildSummary({
      dailyDataForView: {
        daily_breakdown: [
          day('2026-07-01', 1),
          day('2026-07-02', 2),
          day('2026-07-03', 3)
        ],
        range_totals: { count: 6, lunch_items: 6, dinner_items: 0 }
      }
    })

    expect(summary.trend.firstHalfTotal).toBe(1)
    expect(summary.trend.secondHalfTotal).toBe(5)
  })

  it('maneja primera mitad en cero sin porcentaje infinito', () => {
    const summary = buildSummary({
      dailyDataForView: {
        daily_breakdown: [day('2026-07-01', 0), day('2026-07-02', 3)],
        range_totals: { count: 3, lunch_items: 3, dinner_items: 0 }
      }
    })

    expect(summary.trend.percentage).toBeNull()
    expect(summary.trend.label).toBe('+3 pedidos en la segunda mitad')
  })

  it('calcula tendencia positiva, negativa y estable', () => {
    const positive = buildSummary({
      dailyDataForView: {
        daily_breakdown: [day('2026-07-01', 2), day('2026-07-02', 4)],
        range_totals: { count: 6, lunch_items: 6, dinner_items: 0 }
      }
    })
    const negative = buildSummary({
      dailyDataForView: {
        daily_breakdown: [day('2026-07-01', 4), day('2026-07-02', 2)],
        range_totals: { count: 6, lunch_items: 6, dinner_items: 0 }
      }
    })
    const stable = buildSummary({
      dailyDataForView: {
        daily_breakdown: [day('2026-07-01', 3), day('2026-07-02', 3)],
        range_totals: { count: 6, lunch_items: 6, dinner_items: 0 }
      }
    })

    expect(positive.trend).toMatchObject({ direction: 'up', difference: 2, percentage: 100 })
    expect(negative.trend).toMatchObject({ direction: 'down', difference: -2, percentage: -50 })
    expect(stable.trend).toMatchObject({ direction: 'stable', difference: 0, label: 'Sin variación' })
  })
})

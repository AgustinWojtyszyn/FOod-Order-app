import { describe, expect, it } from 'vitest'
import { buildConsumptionReportModel, getMonthDates } from './consumptionReportCalculations'

describe('consumption report calculations', () => {
  it('builds all days, quantities, and totals', () => {
    const dates = getMonthDates(2026, 2)
    const model = buildConsumptionReportModel([
      { person_key: 'a', customer_name: 'Ana', delivery_date: '2026-02-01', total_items: 2, items: [] },
      { person_key: 'a', customer_name: 'Ana', delivery_date: '2026-02-03', total_items: 1, items: [] },
      { person_key: 'b', customer_name: 'Beto', delivery_date: '2026-02-01', total_items: 1, items: [] }
    ], dates)

    expect(dates).toHaveLength(28)
    expect(model.rows.map((row) => row.monthlyTotal)).toEqual([3, 1])
    expect(model.dailyTotals['2026-02-01']).toBe(3)
    expect(model.dailyTotals['2026-02-02']).toBe(0)
    expect(model.grandTotal).toBe(4)
  })

  it('uses item quantities when they are the operational source', () => {
    const model = buildConsumptionReportModel([
      { person_key: 'a', customer_name: 'Ana', delivery_date: '2026-01-01', total_items: 0, items: [{ name: 'Menu', quantity: 3 }] }
    ], ['2026-01-01'])

    expect(model.rows[0].quantities['2026-01-01']).toBe(3)
  })
})
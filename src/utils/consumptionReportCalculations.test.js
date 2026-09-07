import { describe, expect, it } from 'vitest'
import {
  buildConsumptionReportModel,
  buildConsumptionReportSummary,
  getMonthDates,
  resolveConsumptionPersonName
} from './consumptionReportCalculations'

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

  it('keeps separate rows when the same person ordered from different locations', () => {
    const model = buildConsumptionReportModel([
      {
        person_key: 'a',
        customer_name: 'Ana',
        delivery_date: '2026-01-01',
        total_items: 1,
        items: [],
        company_slug: 'isemar',
        company_name: 'ISEMAR',
        requesting_location_code: 'ISEMAR_PREDIO_1',
        location: 'ISEMAR - PREDIO 1',
        delivery_location: 'Entrega común'
      },
      {
        person_key: 'a',
        customer_name: 'Ana',
        delivery_date: '2026-01-02',
        total_items: 2,
        items: [],
        company_slug: 'isemar',
        company_name: 'ISEMAR',
        requesting_location_code: 'ISEMAR_PREDIO_2',
        location: 'ISEMAR - PREDIO 2',
        delivery_location: 'Entrega común'
      }
    ], ['2026-01-01', '2026-01-02'])

    expect(model.rows).toHaveLength(2)
    expect(model.rows.map((row) => row.locationLabel)).toEqual(['ISEMAR - PREDIO 1', 'ISEMAR - PREDIO 2'])
    expect(model.dailyTotals).toEqual({ '2026-01-01': 1, '2026-01-02': 2 })
    expect(model.grandTotal).toBe(3)
  })

  it('groups ISEMAR rows by predio before sorting names inside each predio', () => {
    const model = buildConsumptionReportModel([
      {
        person_key: 'predio2-ana',
        customer_name: 'Ana',
        delivery_date: '2026-01-01',
        total_items: 1,
        items: [],
        company_slug: 'isemar',
        location: 'ISEMAR - PREDIO 2'
      },
      {
        person_key: 'predio1-zoe',
        customer_name: 'Zoe',
        delivery_date: '2026-01-01',
        total_items: 1,
        items: [],
        company_slug: 'isemar',
        location: 'ISEMAR - PREDIO 1'
      },
      {
        person_key: 'predio1-beto',
        customer_name: 'Beto',
        delivery_date: '2026-01-01',
        total_items: 1,
        items: [],
        company_slug: 'isemar',
        location: 'ISEMAR - PREDIO 1'
      }
    ], ['2026-01-01'])

    expect(model.rows.map((row) => `${row.locationLabel}:${row.name}`)).toEqual([
      'ISEMAR - PREDIO 1:Beto',
      'ISEMAR - PREDIO 1:Zoe',
      'ISEMAR - PREDIO 2:Ana'
    ])
  })

  it('builds the monthly summary by company and ISEMAR predio', () => {
    const summary = buildConsumptionReportSummary([
      { company_slug: 'igarreta', total_items: 4, items: [], location: 'Igarreta Maquinas SA' },
      { company_slug: 'isemar', total_items: 2, items: [], location: 'ISEMAR - PREDIO 1' },
      { company_slug: 'isemar', total_items: 5, items: [], location: 'ISEMAR - PREDIO 2' }
    ])

    expect(summary).toEqual({
      total: 11,
      igarreta: 4,
      isemarPredio1: 2,
      isemarPredio2: 5,
      isemarOther: 0
    })
  })

  it('uses the RPC person_name when the order has no customer identity fields', () => {
    expect(resolveConsumptionPersonName({ person_name: 'Pedido extra administrativo' })).toBe('Pedido extra administrativo')
  })
})

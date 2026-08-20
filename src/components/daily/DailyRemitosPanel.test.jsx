import { describe, expect, it } from 'vitest'
import { buildDailyRemitoRows } from './DailyRemitosPanel.jsx'

const epseGroup = {
  slug: 'epse',
  name: 'EPSE',
  displayName: 'EPSE – Los Caracoles',
  locationKey: 'epse_los_caracoles',
  locationLabel: 'EPSE – Los Caracoles',
  orders: [{ id: '10000000-0000-4000-8000-000000000001' }]
}

describe('DailyRemitosPanel remito row matching', () => {
  it('does not show or associate an empty EPSE remito with blank location_key', () => {
    const rows = buildDailyRemitoRows({
      deliveryDate: '2026-08-21',
      locationKey: '',
      groups: [epseGroup],
      remitos: [{
        remito_id: '9baaa0ea-9cc7-4aa5-93fa-4640fec58f41',
        company_slug: 'epse',
        company_name: 'EPSE',
        delivery_date: '2026-08-21',
        remito_number: 30006,
        status: 'issued',
        order_ids: [],
        total_items: 0,
        location_key: '',
        snapshot: {
          orderIds: [],
          ordersCount: 0,
          totalItems: 0,
          totalMenus: 0,
          locationKey: '',
          locationLabel: ''
        }
      }]
    })

    expect(rows).toHaveLength(1)
    expect(rows[0].group.locationKey).toBe('epse_los_caracoles')
    expect(rows[0].existing).toBeNull()
    expect(rows.some((row) => row.existing?.remito_number === 30006)).toBe(false)
  })

  it('keeps blank location_key matching for companies without requesting locations', () => {
    const group = {
      slug: 'genneia',
      name: 'Genneia',
      displayName: 'Genneia',
      locationKey: '',
      orders: [{ id: '10000000-0000-4000-8000-000000000002' }]
    }

    const rows = buildDailyRemitoRows({
      deliveryDate: '2026-08-21',
      locationKey: '',
      groups: [group],
      remitos: [{
        remito_id: '20000000-0000-4000-8000-000000000001',
        company_slug: 'genneia',
        company_name: 'Genneia',
        delivery_date: '2026-08-21',
        remito_number: 40001,
        status: 'issued',
        order_ids: ['10000000-0000-4000-8000-000000000002'],
        location_key: '',
        snapshot: {
          orderIds: ['10000000-0000-4000-8000-000000000002'],
          ordersCount: 1,
          totalItems: 1,
          totalMenus: 1
        }
      }]
    })

    expect(rows).toHaveLength(1)
    expect(rows[0].existing?.remito_number).toBe(40001)
  })
})

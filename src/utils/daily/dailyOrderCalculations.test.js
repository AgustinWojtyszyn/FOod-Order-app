import { describe, expect, it } from 'vitest'
import { filterOrdersByCompany, getBeverageLabel } from './dailyOrderCalculations'

describe('daily order calculations', () => {
  it('handles admin extra side responses stored as arrays without treating them as beverages', () => {
    const responses = [
      {
        title: '¿Desea alguna guarnición distinta al menú?',
        response: ['Puré', 'Puré'],
        quantities: { Puré: 2 }
      }
    ]

    expect(() => getBeverageLabel(responses)).not.toThrow()
    expect(getBeverageLabel(responses)).toBe('—')
  })

  it('filters EPSE Obra Linea de Alta Tension by requesting location code', () => {
    const orders = [
      {
        id: 'alta-tension',
        company_slug: 'epse',
        location: 'EPSE - Planta Fotovoltaica',
        delivery_location: 'EPSE - Planta Fotovoltaica',
        requesting_location_code: 'EPSE_OBRA_LINEA_ALTA_TENSION'
      },
      {
        id: 'anchipurac',
        company_slug: 'epse',
        location: 'EPSE - Anchipurac',
        delivery_location: 'EPSE - Anchipurac',
        requesting_location_code: 'EPSE_ANCHIPURAC'
      }
    ]

    expect(filterOrdersByCompany(orders, 'EPSE - Obra Linea de Alta Tension')).toEqual([
      orders[0]
    ])
  })
})

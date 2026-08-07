import { describe, expect, it } from 'vitest'
import { getBeverageLabel } from './dailyOrderCalculations'

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
})

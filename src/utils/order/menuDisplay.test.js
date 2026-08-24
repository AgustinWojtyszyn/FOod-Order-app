import { describe, expect, it } from 'vitest'
import { getMenuDisplay } from './menuDisplay'

describe('company-specific menu display', () => {
  it('shows Dieta for Greif when the dish is Bife del día', () => {
    expect(getMenuDisplay({ name: 'Opción 4', description: 'BIFE DEL DÍA CARNE' }, 4, 'greif')).toMatchObject({
      label: 'Opción 4',
      dish: 'Dieta'
    })
  })

  it('shows Dieta for Molinos using the same company rule', () => {
    expect(getMenuDisplay({ name: 'Opción 4', description: 'BIFE DEL DÍA CARNE' }, 4, 'molinos').dish).toBe('Dieta')
  })

  it('shows Dieta for Placo using the same company rule as Greif', () => {
    expect(getMenuDisplay({ name: 'Opción 4', description: 'BIFE DEL DÍA CARNE' }, 4, 'placo').dish).toBe('Dieta')
  })

  it('keeps the original dish for other companies', () => {
    const item = { name: 'Opción 4', description: 'BIFE DEL DÍA CARNE' }
    expect(getMenuDisplay(item, 4, 'epse').dish).toBe('BIFE DEL DÍA CARNE')
    expect(getMenuDisplay(item, 4, 'laja').dish).toBe('BIFE DEL DÍA CARNE')
  })
})

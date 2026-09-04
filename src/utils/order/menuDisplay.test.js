import { describe, expect, it } from 'vitest'
import { filterOrderableMenuItems, getMenuDisplay } from './menuDisplay'

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

  it('keeps Igarreta lunch menu options and only applies its Celíaco rule', () => {
    const globalMenu = [
      { id: 'main', name: 'Menú principal', description: 'Milanesa', slotIndex: 0 },
      { id: 'option-1', name: 'Opción 1', description: 'Pastas', slotIndex: 1 },
      { id: 'option-2', name: 'Opción 2', description: 'Pollo', slotIndex: 2 },
      { id: 'option-3', name: 'Opción 3', description: 'Tarta', slotIndex: 3 },
      { id: 'option-4', name: 'Opción 4', description: 'Bife del día', slotIndex: 4 },
      { id: 'option-5', name: 'Opción 5', description: 'Empanadas', slotIndex: 5 },
      { id: 'option-6', name: 'Opción 6', description: 'Sándwich', slotIndex: 6 }
    ]

    const result = filterOrderableMenuItems(globalMenu, 'igarreta')

    expect(result).toHaveLength(6)
    expect(result.map((item, index) => getMenuDisplay(item, index, 'igarreta'))).toEqual([
      { label: 'Menú principal', dish: 'Milanesa', slotIndex: 0, isMainMenu: true },
      { label: 'Opción 1', dish: 'Pastas', slotIndex: 1, isMainMenu: false },
      { label: 'Opción 2', dish: 'Pollo', slotIndex: 2, isMainMenu: false },
      { label: 'Opción 3', dish: 'Tarta', slotIndex: 3, isMainMenu: false },
      { label: 'Opción 4', dish: 'Bife del día', slotIndex: 4, isMainMenu: false },
      { label: 'Opción 5', dish: 'Celíaco', slotIndex: 5, isMainMenu: false }
    ])
    const serialized = JSON.stringify(result)
    expect(serialized).toMatch(/Bife del d[ií]a/i)
    expect(serialized).not.toMatch(/Dieta/i)
    expect(serialized).not.toMatch(/Opción 6/i)
  })

  it('uses slot metadata or title inference for Igarreta even when menu order is mixed', () => {
    const mixedMenu = [
      { id: 'option-6', name: 'Opción 6', description: 'Sándwich' },
      { id: 'option-4', name: 'Bife del día', description: 'Bife del día', slotIndex: 4 },
      { id: 'main', name: 'Menú principal', description: 'Milanesa' },
      { id: 'option-5', name: 'Opción 5', description: 'Empanadas' }
    ]

    const result = filterOrderableMenuItems(mixedMenu, 'igarreta')

    expect(result.map((item) => item.id)).toEqual(['option-4', 'main', 'option-5'])
    expect(result[0]).toMatchObject({
      name: 'Bife del día',
      description: 'Bife del día',
      slotIndex: 4
    })
    expect(result[2]).toMatchObject({
      name: 'Opción 5',
      displayName: 'Opción 5',
      description: 'Celíaco',
      slotIndex: 5
    })
  })

  it('keeps Greif, Placo and Molinos Dieta conversion unchanged', () => {
    for (const companySlug of ['greif', 'placo', 'molinos']) {
      expect(getMenuDisplay({ name: 'Opción 4', description: 'Bife del día' }, 4, companySlug)).toMatchObject({
        label: 'Opción 4',
        dish: 'Dieta'
      })
    }
  })

  it('keeps EPSE hidden-slot behavior unchanged', () => {
    const menu = [
      { id: 'main', name: 'Menú principal', slotIndex: 0 },
      { id: 'option-4', name: 'Opción 4', slotIndex: 4 },
      { id: 'option-5', name: 'Opción 5', slotIndex: 5 }
    ]

    const result = filterOrderableMenuItems(menu, 'epse')

    expect(result.map((item) => item.id)).toEqual(['main', 'option-5'])
    expect(result[1]).toMatchObject({
      displayName: 'Opción 4',
      displaySlotIndex: 4
    })
  })

  it('does not alter regular companies when filtering orderable menu items', () => {
    const menu = [
      { id: 'main', name: 'Menú principal', description: 'Milanesa', slotIndex: 0 },
      { id: 'option-4', name: 'Opción 4', description: 'Bife del día', slotIndex: 4 },
      { id: 'option-5', name: 'Opción 5', description: 'Empanadas', slotIndex: 5 }
    ]

    expect(filterOrderableMenuItems(menu, 'laja')).toEqual(menu)
  })

  it('keeps ISEMAR on the shared six-slot menu', () => {
    const menu = [
      { id: 'main', name: 'Menú principal', description: 'Milanesa', slotIndex: 0 },
      { id: 'option-1', name: 'Opción 1', description: 'Pastas', slotIndex: 1 },
      { id: 'option-2', name: 'Opción 2', description: 'Pollo', slotIndex: 2 },
      { id: 'option-3', name: 'Opción 3', description: 'Tarta', slotIndex: 3 },
      { id: 'option-4', name: 'Opción 4', description: 'Bife del día', slotIndex: 4 },
      { id: 'option-5', name: 'Opción 5', description: 'Empanadas', slotIndex: 5 },
      { id: 'option-6', name: 'Opción 6', description: 'Sándwich', slotIndex: 6 }
    ]

    const result = filterOrderableMenuItems(menu, 'isemar')

    expect(result.map((item) => item.id)).toEqual([
      'main',
      'option-1',
      'option-2',
      'option-3',
      'option-4',
      'option-5'
    ])
    expect(result.map((item, index) => getMenuDisplay(item, index, 'isemar'))).toEqual([
      { label: 'Menú principal', dish: 'Milanesa', slotIndex: 0, isMainMenu: true },
      { label: 'Opción 1', dish: 'Pastas', slotIndex: 1, isMainMenu: false },
      { label: 'Opción 2', dish: 'Pollo', slotIndex: 2, isMainMenu: false },
      { label: 'Opción 3', dish: 'Tarta', slotIndex: 3, isMainMenu: false },
      { label: 'Opción 4', dish: 'Bife del día', slotIndex: 4, isMainMenu: false },
      { label: 'Opción 5', dish: 'Celíaco', slotIndex: 5, isMainMenu: false }
    ])
  })
})

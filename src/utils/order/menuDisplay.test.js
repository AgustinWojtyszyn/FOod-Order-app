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

  it('maps Igarreta to continuous options while removing only the Bife del día slot', () => {
    const globalMenu = [
      { id: 'main', name: 'Menú principal', description: 'Milanesa', slotIndex: 0 },
      { id: 'option-1', name: 'Opción 1', description: 'BIFE DE CARNE', slotIndex: 1 },
      { id: 'option-2', name: 'Opción 2', description: 'Pollo', slotIndex: 2 },
      { id: 'option-3', name: 'Opción 3', description: 'Tarta', slotIndex: 3 },
      { id: 'option-4', name: 'Opción 4', description: 'BIFE DE CARNE', slotIndex: 4 },
      { id: 'option-5', name: 'Opción 5', description: 'Mix de hojas verdes', slotIndex: 5 },
      { id: 'option-6', name: 'Opción 6', description: 'Celiaco', slotIndex: 6 },
      { id: 'option-7', name: 'Opción 7', description: 'Omelette', slotIndex: 7 }
    ]

    const result = filterOrderableMenuItems(globalMenu, 'igarreta')
    const display = result.map((item, index) => getMenuDisplay(item, index, 'igarreta'))

    expect(result).toHaveLength(6)
    expect(display).toEqual([
      { label: 'Menú principal', dish: 'Milanesa', slotIndex: 0, isMainMenu: true },
      { label: 'Opción 1', dish: 'BIFE DE CARNE', slotIndex: 1, isMainMenu: false },
      { label: 'Opción 2', dish: 'Pollo', slotIndex: 2, isMainMenu: false },
      { label: 'Opción 3', dish: 'Tarta', slotIndex: 3, isMainMenu: false },
      { label: 'Opción 4', dish: 'Mix de hojas verdes', slotIndex: 4, isMainMenu: false },
      { label: 'Opción 5', dish: 'Celíaco', slotIndex: 5, isMainMenu: false }
    ])
    expect(result.map((item) => item.id)).toEqual(['main', 'option-1', 'option-2', 'option-3', 'option-5', 'option-6'])
    expect(result.some((item) => item.id === 'option-4')).toBe(false)
    expect(display.filter((item) => item.dish === 'Celíaco')).toHaveLength(1)
    expect(display[5]).toMatchObject({ label: 'Opción 5', dish: 'Celíaco' })
    expect(display[4]).toMatchObject({ label: 'Opción 4', dish: 'Mix de hojas verdes' })
    expect(result[5].id).toBe('option-6')
    expect(result[4]).not.toBe(result[5])
    expect(result[4].id).not.toBe(result[5].id)
  })

  it('uses slot metadata or title inference for Igarreta even when menu order is mixed', () => {
    const mixedMenu = [
      { id: 'option-6', name: 'Opción 6', description: 'Sándwich' },
      { id: 'option-4', name: 'Bife del día', description: 'Bife del día', slotIndex: 4 },
      { id: 'main', name: 'Menú principal', description: 'Milanesa' },
      { id: 'option-5', name: 'Opción 5', description: 'Empanadas' }
    ]

    const result = filterOrderableMenuItems(mixedMenu, 'igarreta')

    expect(result.map((item) => item.id)).toEqual(['main', 'option-6', 'option-5', 'option-5-celiaco'])
    expect(result[0]).toMatchObject({
      name: 'Menú principal',
      slotIndex: 0
    })
    expect(result[1]).toMatchObject({
      name: 'Opción 1',
      displayName: 'Opción 1',
      slotIndex: 1
    })
    expect(result[2]).toMatchObject({
      name: 'Opción 4',
      displayName: 'Opción 4',
      slotIndex: 4
    })
    expect(result[3]).toMatchObject({
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

  it('maps ISEMAR to the shared salad and Celíaco options without the Bife del día slot', () => {
    const menu = [
      { id: 'main', name: 'Menú principal', description: 'Milanesa', slotIndex: 0 },
      { id: 'option-1', name: 'Opción 1', description: 'Pastas', slotIndex: 1 },
      { id: 'option-2', name: 'Opción 2', description: 'Pollo', slotIndex: 2 },
      { id: 'option-3', name: 'Opción 3', description: 'Tarta', slotIndex: 3 },
      { id: 'option-4', name: 'Opción 4', description: 'Bife del día', slotIndex: 4 },
      { id: 'option-5', name: 'Opción 5', description: 'Mix de hojas verdes', slotIndex: 5 },
      { id: 'option-6', name: 'Opción 6', description: 'Celiaco', slotIndex: 6 }
    ]

    const result = filterOrderableMenuItems(menu, 'isemar')

    expect(result.map((item) => item.id)).toEqual([
      'main',
      'option-1',
      'option-2',
      'option-3',
      'option-5',
      'option-6'
    ])
    expect(result.map((item, index) => getMenuDisplay(item, index, 'isemar'))).toEqual([
      { label: 'Menú principal', dish: 'Milanesa', slotIndex: 0, isMainMenu: true },
      { label: 'Opción 1', dish: 'Pastas', slotIndex: 1, isMainMenu: false },
      { label: 'Opción 2', dish: 'Pollo', slotIndex: 2, isMainMenu: false },
      { label: 'Opción 3', dish: 'Tarta', slotIndex: 3, isMainMenu: false },
      { label: 'Opción 4', dish: 'Mix de hojas verdes', slotIndex: 4, isMainMenu: false },
      { label: 'Opción 5', dish: 'Celíaco', slotIndex: 5, isMainMenu: false }
    ])
  })

  it('keeps normal Bife dishes and removes only the source Bife del día slot for Igarreta and ISEMAR', () => {
    const menu = [
      { id: 'main', name: 'Menú principal', description: 'Menú del día', slotIndex: 0 },
      { id: 'bife-option', name: 'Opción 1', description: 'BIFE DE CARNE CON PURE DE CALABAZA', slotIndex: 1 },
      { id: 'omelette', name: 'Opción 2', description: 'Omelette', slotIndex: 2 },
      { id: 'tarta', name: 'Opción 3', description: 'Tarta', slotIndex: 3 },
      { id: 'bife-day', name: 'Opción 4', description: 'BIFE DE CARNE', slotIndex: 4 },
      { id: 'salad', name: 'Opción 5', description: 'Ensalada del día', slotIndex: 5 },
      { id: 'celiac-source', name: 'Opción 6', description: 'Celiaco', slotIndex: 6 }
    ]

    for (const companySlug of ['igarreta', 'isemar']) {
      const result = filterOrderableMenuItems(menu, companySlug)
      const display = result.map((item, index) => getMenuDisplay(item, index, companySlug))

      expect(result.map((item) => item.id)).toEqual(['main', 'bife-option', 'omelette', 'tarta', 'salad', 'celiac-source'])
      expect(result.some((item) => item.id === 'bife-day')).toBe(false)
      expect(display.map((item) => item.slotIndex)).toEqual([0, 1, 2, 3, 4, 5])
      expect(display).toEqual([
        { label: 'Menú principal', dish: 'Menú del día', slotIndex: 0, isMainMenu: true },
        { label: 'Opción 1', dish: 'BIFE DE CARNE CON PURE DE CALABAZA', slotIndex: 1, isMainMenu: false },
        { label: 'Opción 2', dish: 'Omelette', slotIndex: 2, isMainMenu: false },
        { label: 'Opción 3', dish: 'Tarta', slotIndex: 3, isMainMenu: false },
        { label: 'Opción 4', dish: 'Ensalada del día', slotIndex: 4, isMainMenu: false },
        { label: 'Opción 5', dish: 'Celíaco', slotIndex: 5, isMainMenu: false }
      ])
    }
  })

  it('does not remove a normal option just because its dish name contains Bife', () => {
    const menu = [
      { id: 'main', name: 'Menú principal', description: 'Menú del día', slotIndex: 0 },
      { id: 'pasta', name: 'Opción 1', description: 'Pastas', slotIndex: 1 },
      { id: 'bife-criolla', name: 'Opción 2', description: 'BIFE A LA CRIOLLA', slotIndex: 2 },
      { id: 'tarta', name: 'Opción 3', description: 'Tarta', slotIndex: 3 },
      { id: 'bife-day', name: 'Opción 4', description: 'BIFE DEL DÍA', slotIndex: 4 },
      { id: 'salad', name: 'Opción 5', description: 'Ensalada', slotIndex: 5 },
      { id: 'celiac', name: 'Opción 6', description: 'Celíaco', slotIndex: 6 }
    ]

    const result = filterOrderableMenuItems(menu, 'isemar')

    expect(result.map((item) => item.id)).toEqual(['main', 'pasta', 'bife-criolla', 'tarta', 'salad', 'celiac'])
    expect(result.find((item) => item.id === 'bife-criolla')).toMatchObject({
      name: 'Opción 2',
      displayName: 'Opción 2',
      slotIndex: 2
    })
    expect(result.some((item) => item.id === 'bife-day')).toBe(false)
  })

  it('keeps all normal dishes from the current real menu shape and keeps numbering continuous', () => {
    const currentMenuShape = [
      { id: 'main-real', name: 'Menú principal', description: 'MILANESA CON PURE DE PAPAS' },
      { id: 'bife-1-real', name: 'Opción 1', description: 'BIFE DE CARNE CON PURE DE CALABAZA' },
      { id: 'omelette-real', name: 'Opción 2', description: 'OMELETTE DE ESPINACA RELLENO CON PURE DE PAPAS' },
      { id: 'tarta-real', name: 'Opción 3', description: 'TARTA PASCUALINA' },
      { id: 'bife-4-real', name: 'Opción 4', description: 'BIFE DE CARNE' },
      { id: 'salad-real', name: 'Opción 5', description: 'ENSALADA MIX DE HOJAS' },
      { id: 'celiac-real', name: 'Opción 6', description: 'CELIACO' }
    ]

    const result = filterOrderableMenuItems(currentMenuShape, 'isemar')
    const display = result.map((item, index) => getMenuDisplay(item, index, 'isemar'))

    expect(display).toEqual([
      { label: 'Menú principal', dish: 'MILANESA CON PURE DE PAPAS', slotIndex: 0, isMainMenu: true },
      { label: 'Opción 1', dish: 'BIFE DE CARNE CON PURE DE CALABAZA', slotIndex: 1, isMainMenu: false },
      { label: 'Opción 2', dish: 'OMELETTE DE ESPINACA RELLENO CON PURE DE PAPAS', slotIndex: 2, isMainMenu: false },
      { label: 'Opción 3', dish: 'TARTA PASCUALINA', slotIndex: 3, isMainMenu: false },
      { label: 'Opción 4', dish: 'ENSALADA MIX DE HOJAS', slotIndex: 4, isMainMenu: false },
      { label: 'Opción 5', dish: 'Celíaco', slotIndex: 5, isMainMenu: false }
    ])
    expect(result.map((item) => item.id)).toEqual(['main-real', 'bife-1-real', 'omelette-real', 'tarta-real', 'salad-real', 'celiac-real'])
    expect(result.some((item) => item.id === 'bife-4-real')).toBe(false)
    expect(display.map((item) => item.slotIndex)).toEqual([0, 1, 2, 3, 4, 5])
    expect(display.filter((item) => item.dish === 'Celíaco')).toHaveLength(1)
  })
})

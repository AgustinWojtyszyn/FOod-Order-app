import { describe, expect, it } from 'vitest'
import {
  GREIF_REFRIGERIO_MENU_ITEM_ID,
  withGreifRefrigerioMenuItem
} from './greifDefaultSnack'

describe('Greif refrigerio menu option', () => {
  const menuItems = [
    { id: 'main', name: 'Menú principal', slotIndex: 0 },
    { id: 'option-1', name: 'Opción 1', slotIndex: 1 }
  ]

  it('adds Refrigerio as a menu option only for Greif', () => {
    const greifItems = withGreifRefrigerioMenuItem({ companySlug: 'greif', items: menuItems })
    const molinosItems = withGreifRefrigerioMenuItem({ companySlug: 'molinos', items: menuItems })

    expect(greifItems).toHaveLength(3)
    expect(greifItems.at(-1)).toMatchObject({
      id: GREIF_REFRIGERIO_MENU_ITEM_ID,
      name: 'Refrigerio',
      isGreifRefrigerio: true
    })
    expect(molinosItems).toEqual(menuItems)
  })

  it('does not duplicate Refrigerio if it is already in the menu', () => {
    const sourceItems = [...menuItems, { id: GREIF_REFRIGERIO_MENU_ITEM_ID, name: 'Refrigerio' }]

    expect(withGreifRefrigerioMenuItem({ companySlug: 'greif', items: sourceItems })).toEqual(sourceItems)
  })
})

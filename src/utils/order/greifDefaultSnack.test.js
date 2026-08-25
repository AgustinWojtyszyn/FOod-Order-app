import { describe, expect, it } from 'vitest'
import {
  withGreifRefrigerioMenuItem
} from './greifDefaultSnack'

describe('Greif refrigerio menu option', () => {
  const menuItems = [
    { id: 'main', name: 'Menú principal', slotIndex: 0 },
    { id: 'option-1', name: 'Opción 1', slotIndex: 1 }
  ]

  it('does not add Refrigerio as a menu option for Greif', () => {
    const greifItems = withGreifRefrigerioMenuItem({ companySlug: 'greif', items: menuItems })
    const molinosItems = withGreifRefrigerioMenuItem({ companySlug: 'molinos', items: menuItems })

    expect(greifItems).toEqual(menuItems)
    expect(molinosItems).toEqual(menuItems)
  })

  it('keeps existing menu items without adding another Refrigerio', () => {
    const sourceItems = [...menuItems, { id: 'refrigerio', name: 'Refrigerio' }]

    expect(withGreifRefrigerioMenuItem({ companySlug: 'greif', items: sourceItems })).toEqual(sourceItems)
  })
})

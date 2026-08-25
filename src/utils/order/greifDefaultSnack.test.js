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

  it('removes existing Refrigerio menu items for Greif', () => {
    const sourceItems = [...menuItems, { id: 'refrigerio', name: 'Refrigerio' }]

    expect(withGreifRefrigerioMenuItem({ companySlug: 'greif', items: sourceItems })).toEqual(menuItems)
  })

  it('does not remove Refrigerio from other companies', () => {
    const sourceItems = [...menuItems, { id: 'refrigerio', name: 'Refrigerio' }]

    expect(withGreifRefrigerioMenuItem({ companySlug: 'molinos', items: sourceItems })).toEqual(sourceItems)
  })
})

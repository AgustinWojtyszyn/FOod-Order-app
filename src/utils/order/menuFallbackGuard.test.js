import { describe, expect, it } from 'vitest'
import {
  filterOrderableMenuItems,
  hasSyntheticFallbackMenuSelection,
  isSyntheticFallbackMenuItem
} from './menuDisplay'

const SYNTHETIC_FALLBACK = [
  { id: 1, name: 'Plato Principal 1', description: 'Delicioso plato principal' },
  { id: 2, name: 'Plato Principal 2', description: 'Otro plato delicioso' },
  { id: 3, name: 'Plato Principal 3', description: 'Plato especial del día' },
  { id: 4, name: 'Plato Principal 4', description: 'Plato vegetariano' },
  { id: 5, name: 'Plato Principal 5', description: 'Plato de la casa' },
  { id: 6, name: 'Plato Principal 6', description: 'Plato recomendado' }
]

describe('synthetic menu fallback guard', () => {
  it('never exposes the placeholder vegetarian option for Greif', () => {
    const result = filterOrderableMenuItems(SYNTHETIC_FALLBACK, 'greif')

    expect(result).toEqual([])
    expect(result.some((item) => /vegetariano/i.test(item.description || ''))).toBe(false)
  })

  it('drops the complete synthetic fallback for every company instead of inventing menu data', () => {
    for (const companySlug of ['greif', 'placo', 'molinos', 'laja', 'epse', 'igarreta', 'isemar']) {
      expect(filterOrderableMenuItems(SYNTHETIC_FALLBACK, companySlug)).toEqual([])
    }
  })

  it('recognizes stale fallback selections so submit and edit flows can reject them', () => {
    expect(isSyntheticFallbackMenuItem(SYNTHETIC_FALLBACK[3])).toBe(true)
    expect(hasSyntheticFallbackMenuSelection([SYNTHETIC_FALLBACK[3]])).toBe(true)
  })

  it('does not reject a real database menu row that happens to use the same visible text', () => {
    const realRow = {
      id: 'd07ccb90-d4b9-4a2d-8e20-e0eeb4c65b8b',
      name: 'Plato Principal 4',
      description: 'Plato vegetariano'
    }

    expect(isSyntheticFallbackMenuItem(realRow)).toBe(false)
    expect(filterOrderableMenuItems([realRow], 'greif')).toEqual([realRow])
  })
})

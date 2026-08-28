import { describe, expect, it } from 'vitest'
import {
  getMenuBeverageTitle,
  hasFruitDessertChoiceRules,
  hasGenneiaOptionRules,
  isPostreDeliveryDate,
  requiresMenuBeverageChoice
} from './companySpecialRules'

describe('company special rules', () => {
  it('applies Genneia beverage and dessert rules to Genneia and DistroCuyo only', () => {
    expect(hasGenneiaOptionRules('genneia')).toBe(true)
    expect(hasGenneiaOptionRules({ slug: 'distro_cuyo' })).toBe(true)
    expect(hasGenneiaOptionRules('placo')).toBe(false)
    expect(hasGenneiaOptionRules('igarreta')).toBe(false)
    expect(hasGenneiaOptionRules({ slug: 'padrebueno' })).toBe(false)
    expect(hasGenneiaOptionRules('laja')).toBe(false)
  })

  it('applies fruit or dessert choice rules to Igarreta without Genneia-only rules', () => {
    expect(hasFruitDessertChoiceRules('igarreta')).toBe(true)
    expect(hasFruitDessertChoiceRules({ slug: 'genneia' })).toBe(true)
    expect(hasFruitDessertChoiceRules({ slug: 'distro_cuyo' })).toBe(true)
    expect(hasFruitDessertChoiceRules('laja')).toBe(false)
    expect(hasFruitDessertChoiceRules('placo')).toBe(false)
  })

  it('requires a beverage choice for Placo without enabling Genneia dessert rules', () => {
    expect(requiresMenuBeverageChoice('placo')).toBe(true)
    expect(getMenuBeverageTitle('placo')).toBe('Bebidas (solo Genneia)')
    expect(requiresMenuBeverageChoice('genneia')).toBe(false)
    expect(getMenuBeverageTitle('genneia')).toBe('Bebidas (solo Genneia)')
  })

  it('enables postre for Tuesday and Thursday delivery dates', () => {
    expect(isPostreDeliveryDate('2026-07-07')).toBe(true)
    expect(isPostreDeliveryDate('2026-07-09')).toBe(true)
  })

  it('keeps Monday, Wednesday and Friday delivery dates on fruta', () => {
    expect(isPostreDeliveryDate('2026-07-06')).toBe(false)
    expect(isPostreDeliveryDate('2026-07-08')).toBe(false)
    expect(isPostreDeliveryDate('2026-07-10')).toBe(false)
  })
})

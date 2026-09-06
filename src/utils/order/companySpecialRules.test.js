import { describe, expect, it } from 'vitest'
import {
  getMenuBeverageTitle,
  hasFruitDessertChoiceRules,
  hasGenneiaOptionRules,
  isIgarretaIsemarCompany,
  isPostreDeliveryDate,
  requiresMenuBeverageChoice,
  shouldHideIgarretaIsemarOption
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

  it('does not apply fruit or dessert choice rules to Igarreta or ISEMAR', () => {
    expect(hasFruitDessertChoiceRules('igarreta')).toBe(false)
    expect(hasFruitDessertChoiceRules('isemar')).toBe(false)
    expect(hasFruitDessertChoiceRules({ slug: 'genneia' })).toBe(true)
    expect(hasFruitDessertChoiceRules({ slug: 'distro_cuyo' })).toBe(true)
    expect(hasFruitDessertChoiceRules('laja')).toBe(false)
    expect(hasFruitDessertChoiceRules('placo')).toBe(false)
  })

  it('identifies Igarreta and ISEMAR options that must not render', () => {
    expect(isIgarretaIsemarCompany('igarreta')).toBe(true)
    expect(isIgarretaIsemarCompany('isemar')).toBe(true)
    expect(isIgarretaIsemarCompany('laja')).toBe(false)
    expect(shouldHideIgarretaIsemarOption({ title: 'Bebida', options: ['Agua'] })).toBe(true)
    expect(shouldHideIgarretaIsemarOption({ title: 'Fruta o postre', options: ['Fruta'] })).toBe(true)
    expect(shouldHideIgarretaIsemarOption({ title: 'Guarnición', options: ['Puré'] })).toBe(false)
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

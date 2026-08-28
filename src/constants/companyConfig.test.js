import { describe, expect, it } from 'vitest'
import { COMPANY_CATALOG, COMPANY_LIST, getCompanyByLocationOrSlug } from './companyConfig'

describe('company catalog', () => {
  it('includes Placo as a visible order company using the Greif order flow base', () => {
    expect(COMPANY_CATALOG.placo).toMatchObject({
      slug: 'placo',
      name: 'Placo',
      locations: ['Placo'],
      optionsSourceSlug: 'placo'
    })
    expect(COMPANY_LIST.some((company) => company.slug === 'placo')).toBe(true)
    expect(getCompanyByLocationOrSlug('Placo')?.slug).toBe('placo')
  })

  it('includes Igarreta as a visible company using the La Laja options source', () => {
    expect(COMPANY_CATALOG.igarreta).toMatchObject({
      slug: 'igarreta',
      name: 'Igarreta Maquinas SA',
      locations: ['Igarreta Maquinas SA'],
      optionsSourceSlug: 'laja'
    })
    expect(COMPANY_LIST.some((company) => company.slug === 'igarreta')).toBe(true)
    expect(getCompanyByLocationOrSlug('igarreta')?.slug).toBe('igarreta')
    expect(getCompanyByLocationOrSlug('Igarreta Maquinas SA')?.slug).toBe('igarreta')
  })
})

import { describe, expect, it } from 'vitest'
import { COMPANY_CATALOG, COMPANY_LIST, getCompanyByLocationOrSlug } from './companyConfig'

describe('company catalog', () => {
  it('includes Placo as a visible order company using the Greif order flow base', () => {
    expect(COMPANY_CATALOG.placo).toMatchObject({
      slug: 'placo',
      name: 'Placo',
      locations: ['Placo'],
      optionsSourceSlug: 'laja'
    })
    expect(COMPANY_LIST.some((company) => company.slug === 'placo')).toBe(true)
    expect(getCompanyByLocationOrSlug('Placo')?.slug).toBe('placo')
  })
})

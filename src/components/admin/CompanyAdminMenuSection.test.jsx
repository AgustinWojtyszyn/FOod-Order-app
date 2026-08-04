import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { mergeCompanyMenuItems } from '../../utils/order/companyMenuMerge'

const currentDir = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(currentDir, 'CompanyAdminMenuSection.jsx'), 'utf8')

describe('CompanyAdminMenuSection implementation contract', () => {
  it('uses the same merge helper as /order for final preview precedence', () => {
    const globalItems = [
      { id: 'global-main', name: 'Menú principal', description: 'Pollo' },
      { id: 'global-op1', name: 'Opción 1', description: 'Pasta' }
    ]
    const companyItems = [
      { id: 'company-op1', name: 'Opción 1', description: 'Canelones' },
      { id: 'company-op2', name: 'Opción 2', description: 'Milanesa' }
    ]

    expect(mergeCompanyMenuItems(globalItems, companyItems)).toEqual([
      globalItems[0],
      companyItems[0],
      companyItems[1]
    ])
    expect(source).toContain('mergeCompanyMenuItems(normalizedGlobalItems, normalizedDraftItems)')
  })

  it('rejects global and non-authorized company slugs before saving', () => {
    expect(source).toContain("company.slug !== 'global'")
    expect(source).toContain("selectedCompanySlug === 'global'")
    expect(source).toContain('adminCompanySlugs.has(selectedCompanySlug)')
  })

  it('saves one selected company and one selected date through protected services', () => {
    expect(source).toContain('db.updateMenuItemsByDate(')
    expect(source).toContain('deliveryDate,')
    expect(source).toContain('selectedCompanySlug')
    expect(source).toContain('db.upsertDinnerMenuByDate({')
    expect(source).not.toContain('for (const menuDate of selectedDates)')
  })

  it('warns before discarding pending changes when company or date changes', () => {
    expect(source).toContain('Cambios sin guardar')
    expect(source).toContain('handleCompanyChange')
    expect(source).toContain('handleDateChange')
  })
})

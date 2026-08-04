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
    expect(source).toContain('Tenés cambios sin guardar para ${selectedCompanyName} del ${formatShortDate(deliveryDate)}')
    expect(source).toContain('Seguir editando')
    expect(source).toContain('Descartar cambios')
    expect(source).toContain('handleCompanyChange')
    expect(source).toContain('handleDateChange')
  })

  it('uses mapped Spanish errors instead of exposing raw Supabase errors', () => {
    expect(source).toContain("from '../../utils/menu/menuErrorMapper'")
    expect(source).toContain('mapMenuError(err')
    expect(source).toContain('No tenés permisos para modificar el menú de esta empresa.')
    expect(source).not.toContain("const message = err?.message || 'No pudimos guardar el menú. Revisá los datos e intentá nuevamente.'")
  })

  it('shows field-level validation and focuses the first invalid field', () => {
    expect(source).toContain('Ingresá el nombre del plato.')
    expect(source).toContain('Seleccioná una fecha de entrega.')
    expect(source).toContain('Agregá al menos un plato antes de guardar.')
    expect(source).toContain('Esta opción está repetida en el menú.')
    expect(source).toContain('Seleccioná qué opción general querés reemplazar.')
    expect(source).toContain('La fecha seleccionada ya pasó.')
    expect(source).toContain('fieldRefs.current[firstKey]?.focus?.()')
  })

  it('offers explicit conflict actions before replacing an existing company menu', () => {
    expect(source).toContain('ya tiene un menú cargado')
    expect(source).toContain('Revisar menú actual')
    expect(source).toContain('Reemplazar')
    expect(source).toContain('Cancelar')
    expect(source).toContain('allowOverwrite: true')
  })

  it('keeps retry paths for connection/unknown and partial dinner failures', () => {
    expect(source).toContain('mustReloadBeforeRetry')
    expect(source).toContain('Recargar versión actual')
    expect(source).toContain('Reintentar cena')
    expect(source).toContain('savedParts')
    expect(source).toContain("failedPart: 'cena'")
  })
})

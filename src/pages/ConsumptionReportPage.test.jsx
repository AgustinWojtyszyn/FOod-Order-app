import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const currentDir = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(currentDir, 'ConsumptionReportPage.jsx'), 'utf8')

describe('ConsumptionReportPage', () => {
  it('shows and exports the order origin location next to the user name', () => {
    expect(source).toContain("['Usuario', 'Lugar / Sede'")
    expect(source).toContain('row.locationLabel')
    expect(source).toContain('Lugar / Sede')
    expect(source).toContain('worksheet.autoFilter')
    expect(source).toContain('to: { row: worksheet.rowCount, column: headers.length }')
  })

  it('filters the report by Igarreta or ISEMAR and by ISEMAR predio', () => {
    expect(source).toContain("const [companyFilter, setCompanyFilter] = useState('all')")
    expect(source).toContain('<option value="igarreta">Igarreta Maquinas SA</option>')
    expect(source).toContain('<option value="isemar">ISEMAR</option>')
    expect(source).toContain("companyFilter === 'isemar'")
    expect(source).toContain('Predio / sede')
    expect(source).toContain('resolveConsumptionLocationLabel(order) !== locationFilter')
  })

  it('keeps both filters prominently visible and disables predio until ISEMAR is selected', () => {
    expect(source).toContain('Filtros del reporte')
    expect(source).toContain('Elegí la empresa y, para ISEMAR, el predio correspondiente.')
    expect(source).toContain("disabled={companyFilter !== 'isemar'}")
    expect(source).toContain("companyFilter === 'isemar' ? 'Todos los predios' : 'Disponible al elegir ISEMAR'")
    expect(source).toContain('border-2 border-blue-200 bg-blue-50/80')
  })

  it('shows a four-card monthly summary', () => {
    expect(source).toContain('buildConsumptionReportSummary(orders)')
    expect(source).toContain('Igarreta + ISEMAR')
    expect(source).toContain('ISEMAR · Predio 1')
    expect(source).toContain('ISEMAR · Predio 2')
    expect(source).toContain('{summary.total}')
    expect(source).toContain('{summary.igarreta}')
  })

  it('adds visible group separators for all ISEMAR predios', () => {
    expect(source).toContain("companyFilter === 'isemar' && locationFilter === 'all'")
    expect(source).toContain('startsIsemarGroup')
    expect(source).toContain('isemarGroupTotals[row.locationLabel]')
    expect(source).toContain('isemarGroupPeople[row.locationLabel]')
    expect(source).toContain('colSpan={model.dates.length + 3}')
  })

  it('makes summary cards clickable quick filters', () => {
    expect(source).toContain("applyQuickFilter('all')")
    expect(source).toContain("applyQuickFilter('igarreta')")
    expect(source).toContain("applyQuickFilter('isemar', predio1Location)")
    expect(source).toContain("applyQuickFilter('isemar', predio2Location)")
    expect(source).toContain('aria-pressed={companyFilter')
  })

  it('filters by user search and clears the search from the input', () => {
    expect(source).toContain("const [searchQuery, setSearchQuery] = useState('')")
    expect(source).toContain('Buscar usuario')
    expect(source).toContain('placeholder="Nombre o email"')
    expect(source).toContain('resolveConsumptionPersonName(order)')
    expect(source).toContain("onClick={() => setSearchQuery('')}")
  })

  it('shows a dynamic summary for the active view', () => {
    expect(source).toContain('Vista actual')
    expect(source).toContain('{activeFilterLabel}')
    expect(source).toContain('{activePeopleCount}')
    expect(source).toContain('{model.grandTotal}')
    expect(source).toContain('Búsqueda: “{searchQuery.trim()}”')
  })
})

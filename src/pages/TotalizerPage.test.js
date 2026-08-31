import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const pageSource = readFileSync(new URL('./TotalizerPage.jsx', import.meta.url), 'utf8')
const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')
const layoutSource = readFileSync(new URL('../components/Layout.jsx', import.meta.url), 'utf8')
const requireAdminSource = readFileSync(new URL('../components/RequireAdmin.jsx', import.meta.url), 'utf8')
const serviceSource = readFileSync(new URL('../services/totalizerService.js', import.meta.url), 'utf8')
const migrationSource = readFileSync(
  new URL('../../supabase/migrations/20260827140000_totalizer_admin_module_rpcs.sql', import.meta.url),
  'utf8'
)
const gitignore = readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8')

describe('Totalizer export module', () => {
  it('keeps a single protected route and global-admin navigation item', () => {
    expect(appSource).toContain("const TotalizerPage = lazy(() => import('./pages/TotalizerPage'))")
    expect(appSource).toContain("'/totalizadora'")
    expect(appSource).toContain('<Route path="/totalizadora" element={<TotalizerPage />} />')
    expect(layoutSource).toContain("menuItems.push({ name: 'Totalizadora', path: '/totalizadora'")
    expect(requireAdminSource).not.toContain("'/totalizadora'")
  })

  it('removes tabs, manual writes and configuration flows from the page', () => {
    expect(pageSource).toContain('Fecha desde')
    expect(pageSource).toContain('Fecha hasta')
    expect(pageSource).toContain('Exportar Totalizadora Excel')
    expect(pageSource).toContain('Vista previa')
    expect(pageSource).not.toContain('activeTab')
    expect(pageSource).not.toContain('Conciliación')
    expect(pageSource).not.toContain('Configuración')
    expect(pageSource).not.toContain('createConcept')
    expect(pageSource).not.toContain('createManualAccount')
    expect(pageSource).not.toContain('saveKitchenValue')
  })

  it('uses one read-only summary RPC and exports a day-per-sheet workbook', () => {
    expect(serviceSource).toContain("supabase.rpc('totalizer_get_summary'")
    expect(serviceSource).toContain('exportTotalizerWorkbook')
    expect(serviceSource).toContain('orderedDates.forEach')
    expect(serviceSource).toContain('workbook.addWorksheet')
    expect(serviceSource).not.toContain("supabase.rpc('totalizer_upsert_value'")
    expect(serviceSource).not.toContain("supabase.rpc('totalizer_create_concept'")
  })

  it('defines a secure read-only aggregation RPC without touching existing flows', () => {
    expect(migrationSource).toContain('create or replace function public.totalizer_get_summary')
    expect(migrationSource).toContain('security definer')
    expect(migrationSource).toContain('set search_path = public, pg_temp')
    expect(migrationSource).toContain('if not public.is_admin() then')
    expect(migrationSource).toContain('from public.orders o')
    expect(migrationSource).toContain("o.status in ('pending', 'archived', 'post_report_extra')")
    expect(migrationSource).toContain('jsonb_array_elements(fo.items)')
    expect(migrationSource).toContain('jsonb_array_elements(fo.custom_responses)')
    expect(migrationSource).toContain('revoke execute on function public.totalizer_get_summary(date, date, text, text[]) from public, anon')
    expect(migrationSource).toContain('grant execute on function public.totalizer_get_summary(date, date, text, text[]) to authenticated')
    expect(migrationSource).not.toContain('alter table public.orders')
    expect(migrationSource).not.toContain('update public.orders')
    expect(migrationSource).not.toContain('delete from public.orders')
    expect(migrationSource).not.toContain('alter table public.company_remitos')
    expect(migrationSource).not.toContain('alter table public.companies')
    expect(migrationSource).not.toContain('disable row level security')
    expect(migrationSource).not.toContain('create policy')
    expect(gitignore).toContain('!supabase/migrations/*.sql')
  })
})

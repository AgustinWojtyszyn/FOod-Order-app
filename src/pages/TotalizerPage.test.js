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

describe('Totalizer admin module', () => {
  it('registers the isolated admin route and global-admin navigation item', () => {
    expect(appSource).toContain("const TotalizerPage = lazy(() => import('./pages/TotalizerPage'))")
    expect(appSource).toContain("'/totalizadora'")
    expect(appSource).toContain('<Route path="/totalizadora" element={<TotalizerPage />} />')
    expect(layoutSource).toContain("menuItems.push({ name: 'Totalizadora', path: '/totalizadora'")
    expect(requireAdminSource).toContain("const companyAdminAllowedPaths = ['/admin', '/labels', '/daily-orders']")
    expect(requireAdminSource).not.toContain("'/totalizadora'")
  })

  it('keeps Supabase access centralized in the totalizer service', () => {
    expect(pageSource).toContain("from '../services/totalizerService'")
    expect(pageSource).not.toContain("from '../services/supabase'")
    expect(pageSource).not.toContain("from('../services/supabase")
    expect(serviceSource).toContain("supabase.rpc('totalizer_get_daily_payload'")
    expect(serviceSource).toContain("supabase.rpc('totalizer_upsert_value'")
    expect(serviceSource).toContain("supabase.rpc('totalizer_save_order_note'")
    expect(serviceSource).toContain("supabase.rpc('totalizer_create_manual_account'")
    expect(serviceSource).toContain("supabase.rpc('totalizer_create_concept'")
    expect(serviceSource).toContain("supabase.rpc('totalizer_create_mapping'")
    expect(serviceSource).toContain('exportTotalizerWorkbook')
  })

  it('adds security-definer RPCs without altering orders, remitos or companies', () => {
    expect(migrationSource).toContain('security definer')
    expect(migrationSource).toContain('set search_path = public, pg_temp')
    expect(migrationSource).toContain('if not public.is_admin() then')
    expect(migrationSource).toContain('public.v_totalizer_daily')
    expect(migrationSource).toContain('public.v_totalizer_reconciliation')
    expect(migrationSource).toContain('public.v_totalizer_remito_reconciliation')
    expect(migrationSource).toContain('public.totalizer_values')
    expect(migrationSource).toContain("v_value_type not")
    expect(migrationSource).toContain('revoke execute on function public.totalizer_get_daily_payload(date, text) from public, anon')
    expect(migrationSource).toContain('grant execute on function public.totalizer_get_daily_payload(date, text) to authenticated')
    expect(migrationSource).toContain("'_error', sqlerrm")
    expect(migrationSource).toContain('service::text')
    expect(migrationSource).not.toContain('where ($2 is null')
    expect(migrationSource).not.toContain('alter table public.orders')
    expect(migrationSource).not.toContain('update public.orders')
    expect(migrationSource).not.toContain('alter table public.company_remitos')
    expect(migrationSource).not.toContain('update public.company_remitos')
    expect(migrationSource).not.toContain('alter table public.companies')
    expect(migrationSource).not.toContain('disable row level security')
    expect(migrationSource).not.toContain('create policy')
    expect(gitignore).toContain('!supabase/migrations/20260827140000_totalizer_admin_module_rpcs.sql')
  })
})

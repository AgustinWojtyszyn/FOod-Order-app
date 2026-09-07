import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('./20260907162000_fix_igarreta_isemar_viewer_company_access.sql', import.meta.url),
  'utf8'
)

const TARGET_EMAILS = [
  'lcorrea@imasa.com.ar',
  'ggalvarini@imasa.com.ar',
  'vcastilla@imasa.com.ar',
  'mborras@imasa.com.ar'
]

describe('Igarreta + ISEMAR consumption viewer access repair', () => {
  it('grants the four intended viewers report access to both companies', () => {
    TARGET_EMAILS.forEach((email) => expect(migration).toContain(email))
    expect(migration).toContain("select u.id, 'consumption_report_viewer', c.slug")
    expect(migration).toContain("c.slug in ('igarreta', 'isemar')")
    expect(migration).toContain('on conflict (user_id, permission, company_slug) do nothing')
  })

  it('keeps the viewers scoped to the report instead of promoting them to company admins', () => {
    expect(migration).not.toContain('insert into public.company_admins')
    expect(migration).not.toContain('delete from public.company_admins')
    expect(migration).toContain("up.permission = 'consumption_report_viewer'")
  })

  it('returns both authorized report companies in the admin access context', () => {
    expect(migration).toContain("where c.slug in ('igarreta', 'isemar')")
    expect(migration).toContain('public.has_consumption_report_access(c.slug)')
    expect(migration).toContain("'consumption_report_companies', v_consumption_report_companies")
  })

  it('filters report rows by the viewers per-company permissions', () => {
    expect(migration).toContain('with allowed_companies as (')
    expect(migration).toContain("public.has_consumption_report_access('igarreta')")
    expect(migration).toContain("public.has_consumption_report_access('isemar')")
    expect(migration).toContain('join allowed_companies ac on ac.slug = c.slug')
    expect(migration).toContain('in (select slug from allowed_companies)')
  })
})

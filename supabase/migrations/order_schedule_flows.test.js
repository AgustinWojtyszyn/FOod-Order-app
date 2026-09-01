import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('./20260828130000_order_schedule_flows.sql', import.meta.url),
  'utf8'
)
const isemarMigration = readFileSync(
  new URL('./20260901110000_add_isemar_company_locations.sql', import.meta.url),
  'utf8'
)
const gitignore = readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8')

describe('order schedule flows migration', () => {
  it('defines standard and extended flows in San Juan time', () => {
    expect(migration).toContain('public.order_schedule_flows')
    expect(migration).toContain("('standard', time '06:00:00', time '14:00:00', 'America/Argentina/San_Juan', true)")
    expect(migration).toContain("('extended', time '09:00:00', time '22:00:00', 'America/Argentina/San_Juan', false)")
    expect(migration).toContain('order_schedule_flows_single_default_idx')
  })

  it('stores only extended location overrides and leaves Igarreta on the default flow', () => {
    for (const location of [
      'La Laja',
      'Los Berros',
      'Padre Bueno',
      'Ccp',
      'Administración ServiFood'
    ]) {
      expect(migration).toContain(`public.normalize_order_schedule_location_key('${location}')`)
    }

    expect(migration).not.toContain("public.normalize_order_schedule_location_key('Igarreta Maquinas SA'), 'extended'")
    expect(isemarMigration).not.toContain("public.normalize_order_schedule_location_key('ISEMAR – PREDIO 1'), 'extended'")
    expect(isemarMigration).not.toContain("public.normalize_order_schedule_location_key('ISEMAR – PREDIO 2'), 'extended'")
  })

  it('resolves ISEMAR to a standard-flow location like Igarreta', () => {
    expect(isemarMigration).toContain("when 'isemar' then 'ISEMAR – PREDIO 1'")
    expect(isemarMigration).not.toContain('order_schedule_location_overrides')
  })

  it('exposes a testable schedule context function with inclusive open and exclusive close', () => {
    expect(migration).toContain('create or replace function public.get_order_schedule_context')
    expect(migration).toContain('p_at timestamptz default now()')
    expect(migration).toContain('left join lateral')
    expect(migration).toContain('public.order_locations loc')
    expect(migration).toContain('public.normalize_order_schedule_location_key(loc.display_name)')
    expect(migration).toContain('public.normalize_order_schedule_location_key(loc.code)')
    expect(migration).toContain('public.normalize_order_schedule_location_key(loc.slug)')
    expect(migration).toContain('when e.local_ts::time >= e.opens_at and e.local_ts::time < e.closes_at then')
    expect(migration).toContain('next_transition_at')
  })

  it('validates normal user order creation and trigger guard through the same schedule context', () => {
    expect(migration).toContain('create or replace function public.create_order_idempotent')
    expect(migration).toContain('from public.get_order_schedule_context(v_requested_location, now())')
    expect(migration).toContain("raise exception 'ORDER_WINDOW_CLOSED'")
    expect(migration).toContain('create or replace function public.check_order_time_limit()')
    expect(migration).toContain("if lower(coalesce(NEW.order_origin, 'user')) = 'admin_extra' then")
    expect(migration).toContain('return NEW;')
    expect(migration).toContain("from public.get_order_schedule_context(v_location, v_at)")
    expect(migration).toContain("current_setting('app.order_schedule_test_at', true)")
    expect(migration).not.toContain('create trigger')
  })

  it('does not redefine report, archive or admin extra order flows', () => {
    expect(migration).not.toContain('create or replace function public.create_admin_extra_order')
    expect(migration).not.toContain('create or replace function public.archive_orders_after_daily_report')
    expect(migration).not.toContain('daily-orders-report')
  })

  it('keeps the SQL migration referenced despite ignored sql files', () => {
    expect(gitignore).toContain('!supabase/migrations/*.sql')
  })
})

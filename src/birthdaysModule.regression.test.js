import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { USER_ROLE_VALUES } from './types'
import { ROLE_OPTIONS } from './utils/admin/adminConstants'

const migration = readFileSync(
  new URL('../supabase/migrations/20260811100000_birthdays_module.sql', import.meta.url),
  'utf8'
)
const appSource = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8')
const layoutSource = readFileSync(new URL('./components/Layout.jsx', import.meta.url), 'utf8')

describe('birthdays module contract', () => {
  it('declara el rol human_resources en frontend y admin', () => {
    expect(USER_ROLE_VALUES).toContain('human_resources')
    expect(ROLE_OPTIONS).toContainEqual({ value: 'human_resources', label: 'Recursos Humanos' })
  })

  it('expone Cumpleaños en navegacion y ruta protegida independiente', () => {
    expect(layoutSource).toContain('🎂 Cumpleaños')
    expect(layoutSource).toContain("path: '/birthdays'")
    expect(appSource).toContain('RequireBirthdayAccess')
    expect(appSource).toContain('RequireNonHumanResources')
    expect(appSource).toContain('path="/birthdays"')
  })

  it('crea tablas separadas de orders con unicidad anual idempotente', () => {
    expect(migration).toContain('create table if not exists public.employee_birthdays')
    expect(migration).toContain('create table if not exists public.birthday_cake_orders')
    expect(migration).toContain('birthday_cake_orders_one_active_per_year_idx')
    expect(migration).toContain('ensure_birthday_cake_order')
    expect(migration).not.toMatch(/alter table public\.orders[\s\S]*birthday/i)
  })

  it('incluye RLS por empresa, rol y transiciones auditadas', () => {
    expect(migration).toContain('alter table public.employee_birthdays enable row level security')
    expect(migration).toContain('public.can_access_birthdays_company(company_slug)')
    expect(migration).toContain('public.can_operate_birthdays_company(v_order.company_slug)')
    expect(migration).toContain('birthday_cake_order_events')
    expect(migration).toContain('public.log_birthday_audit')
    expect(migration).toContain("v_next_status in ('prepared', 'delivered')")
    expect(migration).toContain('reschedule_reason_required')
  })

  it('no mezcla tortitas con pedidos de comida ni servicios de orders', () => {
    expect(migration).not.toContain("service = 'birthday'")
    expect(migration).not.toContain("'birthday' as service")
    expect(migration).not.toContain('total_items')
  })
})

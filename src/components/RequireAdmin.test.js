import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./RequireAdmin.jsx', import.meta.url), 'utf8')

describe('RequireAdmin company admin route scope', () => {
  it('allows company admins into scoped operational routes without granting other global routes', () => {
    expect(source).toContain("const companyAdminAllowedPaths = ['/admin', '/labels', '/daily-orders']")
    expect(source).toContain("canViewConsumptionReport && isConsumptionReportPath")
    expect(source).not.toContain("'/consumption-report']")
    expect(source).not.toContain("'/auditoria'")
    expect(source).not.toContain("'/monthly-panel'")
    expect(source).not.toContain("'/tendencias'")
  })
})

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const appSource = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8')

describe('App selective lazy routes', () => {
  it('keeps the daily critical path eager', () => {
    expect(appSource).toContain("import Dashboard from './components/Dashboard'")
    expect(appSource).toContain("import OrderCompanySelector from './components/OrderCompanySelector'")
    expect(appSource).toContain("import Layout from './components/Layout'")
    expect(appSource).toContain("import Login from './components/Login'")
  })

  it('defers heavy secondary routes from the initial bundle', () => {
    expect(appSource).not.toContain("import AdminPanel from './components/AdminPanel'")
    expect(appSource).not.toContain("import DailyOrders from './components/DailyOrders'")
    expect(appSource).not.toContain("import CafeteriaDashboardPage from './components/cafeteria/CafeteriaDashboardPage'")
    expect(appSource).not.toContain("import TendenciasPage from './pages/TendenciasPage'")
    expect(appSource).not.toContain("import ConsumptionReportPage from './pages/ConsumptionReportPage'")

    expect(appSource).toContain('const AdminPanel = lazy(loadAdminPanel)')
    expect(appSource).toContain('const DailyOrders = lazy(loadDailyOrders)')
    expect(appSource).toContain('const CafeteriaDashboardPage = lazy(loadCafeteriaDashboardPage)')
    expect(appSource).toContain('const TendenciasPage = lazy(loadTendenciasPage)')
    expect(appSource).toContain('const ConsumptionReportPage = lazy(loadConsumptionReportPage)')
  })

  it('warms deferred routes only after login and skips constrained connections', () => {
    expect(appSource).toContain('if (loading || !user || typeof window === \'undefined\') return undefined')
    expect(appSource).toContain('connection?.saveData')
    expect(appSource).toContain('requestIdleCallback')
    expect(appSource).toContain('IDLE_ROUTE_PRELOADERS')
  })
})

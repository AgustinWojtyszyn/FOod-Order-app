import { lazy, Suspense, useEffect } from 'react'
import { useAuthContext } from './contexts/authContextValue'
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import SplashScreen from './components/SplashScreen'
import './App.css'

// Importaciones inmediatas (críticas para la carga inicial)
import Layout from './components/Layout'
import Login from './components/Login'
import LandingPage from './components/LandingPage'
import { useScreenMetrics } from './hooks/useScreenMetrics'
import AdminPanel from './components/AdminPanel'
import Dashboard from './components/Dashboard'
import DailyOrders from './components/DailyOrders'
import OrderCompanySelector from './components/OrderCompanySelector'
import NoticeHost from './components/NoticeHost'
import ConfirmHost from './components/ConfirmHost'
import RequireAdmin from './components/RequireAdmin'
import { RequireNonHumanResources } from './components/RequireBirthdayAccess'
import InstallAppButton from './components/InstallAppButton'
import CafeteriaDashboardPage from './components/cafeteria/CafeteriaDashboardPage'
import TendenciasPage from './pages/TendenciasPage'

// Lazy loading de componentes (carga diferida)
const Register = lazy(() => import('./components/Register'))
const ForgotPassword = lazy(() => import('./components/ForgotPassword'))
const ResetPassword = lazy(() => import('./components/ResetPassword'))
const AuthCallback = lazy(() => import('./pages/AuthCallback'))
const OrderForm = lazy(() => import('./components/OrderForm'))
const EditOrderForm = lazy(() => import('./components/EditOrderForm'))
const Profile = lazy(() => import('./components/Profile'))
const MonthlyPanel = lazy(() => import('./components/MonthlyPanel'))
const AuditLogs = lazy(() => import('./components/AuditLogs'))
const OrderDetails = lazy(() => import('./components/OrderDetails'))
const OrderLabelsPage = lazy(() => import('./components/OrderLabelsPage'))
const CafeteriaNewOrderPage = lazy(() => import('./components/cafeteria/CafeteriaNewOrderPage'))
const CafeteriaCurrentOrderPage = lazy(() => import('./components/cafeteria/CafeteriaCurrentOrderPage'))
const CafeteriaSuccessPage = lazy(() => import('./components/cafeteria/CafeteriaSuccessPage'))

const ADMIN_ROUTE_PATHS = [
  '/cafeteria',
  '/cafeteria/new',
  '/cafeteria/order',
  '/cafeteria/confirm',
  '/admin',
  '/labels',
  '/daily-orders',
  '/monthly-panel',
  '/auditoria',
  '/tendencias'
]

// Componente de carga interno (para Suspense)
const InternalLoader = () => (
  <div className="min-h-dvh flex items-center justify-center bg-linear-to-br from-primary-700 via-primary-800 to-primary-900">
    <div className="text-center">
      <div className="animate-spin rounded-full h-16 w-16 border-4 border-white/30 border-t-white mx-auto mb-4"></div>
      <p className="text-white text-base font-medium">Cargando...</p>
    </div>
  </div>
)

const AuthenticatedLayoutRoute = ({ user, loading }) => {
  const location = useLocation()

  return (
    <Layout key={location.pathname} user={user} loading={loading}>
      <Outlet key={location.pathname} />
    </Layout>
  )
}

const AdminLayoutRoute = ({ user, loading }) => {
  const location = useLocation()

  return (
    <RequireAdmin>
      <Layout key={location.pathname} user={user} loading={loading}>
        <Outlet key={location.pathname} />
      </Layout>
    </RequireAdmin>
  )
}

const ScreenMetricsListener = () => {
  useScreenMetrics()
  return null
}

const RouteSwitch = ({ user, loading }) => {
  const location = useLocation()
  const isAdminPath = ADMIN_ROUTE_PATHS.includes(location.pathname)

  if (loading && !isAdminPath) {
    return <InternalLoader />
  }

  return (
    <Suspense key={location.pathname} fallback={<InternalLoader />}>
      <Routes location={location}>
        <Route path="/" element={
          !loading && (user ? <Navigate to="/dashboard" /> : <LandingPage />)
        } />
        <Route path="/login" element={
          !loading && (user ? <Navigate to="/dashboard" /> : <Login />)
        } />
        <Route path="/register" element={
          !loading && (user ? <Navigate to="/dashboard" /> : <Register />)
        } />
        <Route path="/forgot-password" element={
          !loading && (user ? <Navigate to="/dashboard" /> : <ForgotPassword />)
        } />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        <Route element={<AuthenticatedLayoutRoute user={user} loading={loading} />}>
          <Route path="/dashboard" element={
            !loading && (user ? <Dashboard user={user} loading={loading} /> : <Navigate to="/login" />)
          } />
          <Route path="/order" element={
            !loading && (user ? <RequireNonHumanResources><OrderCompanySelector user={user} loading={loading} /></RequireNonHumanResources> : <Navigate to="/login" />)
          } />
          <Route path="/order/:companySlug" element={
            !loading && (user ? <RequireNonHumanResources><OrderForm user={user} loading={loading} /></RequireNonHumanResources> : <Navigate to="/login" />)
          } />
          <Route path="/edit-order" element={
            !loading && (user ? <RequireNonHumanResources><EditOrderForm user={user} loading={loading} /></RequireNonHumanResources> : <Navigate to="/login" />)
          } />
          <Route path="/profile" element={
            !loading && (user ? <Profile user={user} loading={loading} /> : <Navigate to="/login" />)
          } />
          <Route path="/orders/:orderId" element={
            !loading && (user ? <RequireNonHumanResources><OrderDetails user={user} loading={loading} /></RequireNonHumanResources> : <Navigate to="/login" />)
          } />
        </Route>

        <Route element={<AdminLayoutRoute user={user} loading={loading} />}>
          <Route path="/cafeteria" element={<CafeteriaDashboardPage user={user} loading={loading} />} />
          <Route path="/cafeteria/new" element={<CafeteriaNewOrderPage user={user} loading={loading} />} />
          <Route path="/cafeteria/order" element={<CafeteriaCurrentOrderPage user={user} loading={loading} />} />
          <Route path="/cafeteria/confirm" element={<CafeteriaSuccessPage user={user} loading={loading} />} />
          <Route path="/admin" element={<AdminPanel loading={loading} />} />
          <Route path="/labels" element={<OrderLabelsPage />} />
          <Route path="/daily-orders" element={<DailyOrders user={user} loading={loading} />} />
          <Route path="/monthly-panel" element={<MonthlyPanel user={user} loading={loading} />} />
          <Route path="/auditoria" element={<AuditLogs user={user} loading={loading} />} />
          <Route path="/tendencias" element={<TendenciasPage />} />
        </Route>

        <Route
          path="*"
          element={
            !loading && (
              <Navigate
                to={user ? '/dashboard' : '/'}
                replace
              />
            )
          }
        />
      </Routes>
    </Suspense>
  )
}

function App() {
  const { user, loading } = useAuthContext()

  useEffect(() => {
    if (!import.meta.env.DEV) return

    let lastHighlighted = null

    const describeEl = (el) => {
      const tag = el.tagName?.toLowerCase?.() || 'node'
      const id = el.id ? `#${el.id}` : ''
      const classList = typeof el.className === 'string' && el.className.trim().length
        ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}`
        : ''
      return `${tag}${id}${classList}`
    }

    const captureMetrics = (el) => {
      if (!el) return null
      const style = window.getComputedStyle(el)
      const clientHeight = el.clientHeight || 0
      const scrollHeight = el.scrollHeight || 0
      const dy = scrollHeight - clientHeight
      const vbarPx = Math.max(0, el.offsetWidth - el.clientWidth)
      return {
        el,
        selector: describeEl(el),
        overflowY: style.overflowY,
        height: style.height,
        maxHeight: style.maxHeight,
        clientHeight,
        scrollHeight,
        dy,
        vbarPx
      }
    }

    const logScrollOwners = () => {
      const scopedNodes = document.body
        ? [document.body, ...document.body.querySelectorAll('*')]
        : Array.from(document.querySelectorAll('*'))

      const entries = scopedNodes
        .map((el) => {
          const metrics = captureMetrics(el)
          if (!metrics) return null
          const hasOverflow = ['auto', 'scroll', 'overlay'].includes(metrics.overflowY) && metrics.dy > 2
          const showsScrollbar = metrics.vbarPx > 0 || metrics.overflowY === 'scroll'
          return hasOverflow || showsScrollbar ? metrics : null
        })
        .filter(Boolean)
        .sort((a, b) => {
          if (b.vbarPx !== a.vbarPx) return b.vbarPx - a.vbarPx
          return b.dy - a.dy
        })

      if (lastHighlighted && (!entries.length || lastHighlighted !== entries[0].el)) {
        lastHighlighted.style.outline = ''
        lastHighlighted = null
      }

      if (entries[0]) {
        entries[0].el.style.outline = '2px solid red'
        lastHighlighted = entries[0].el
      }

      if (entries.length) {
        console.groupCollapsed('[scroll-debug] overflow-y containers / visible scrollbars (body descendants)')
        console.table(
          entries
            .slice(0, 20)
            .map(({ selector, overflowY, height, maxHeight, clientHeight, scrollHeight, dy, vbarPx }) => ({
              selector,
              overflowY,
              height,
              maxHeight,
              clientHeight,
              scrollHeight,
              dy,
              vbarPx
            }))
        )
        console.groupEnd()
      } else {
        console.log('[scroll-debug] Sin contenedores con overflow-y auto/scroll/overlay visibles')
      }

      const snapshotTargets = [
        ['html', document.documentElement],
        ['body', document.body],
        ['#root', document.getElementById('root')],
        ['.app-shell', document.querySelector('.app-shell')]
      ]

      const snapshot = snapshotTargets.reduce((acc, [label, el]) => {
        const metrics = captureMetrics(el)
        if (!metrics) return acc
        acc[label] = {
          overflowY: metrics.overflowY,
          height: metrics.height,
          maxHeight: metrics.maxHeight,
          clientHeight: metrics.clientHeight,
          scrollHeight: metrics.scrollHeight,
          dy: metrics.dy,
          vbarPx: metrics.vbarPx
        }
        return acc
      }, {})

      console.log('[scroll-debug] snapshot', snapshot)

      return entries
    }

    window.__logScrollOwners = logScrollOwners
    window.__logScrollY = logScrollOwners
    logScrollOwners()

    return () => {
      if (lastHighlighted) {
        lastHighlighted.style.outline = ''
      }
      if (window.__logScrollY === logScrollOwners) delete window.__logScrollY
      if (window.__logScrollOwners === logScrollOwners) delete window.__logScrollOwners
    }
  }, [])

  return (
      <Router>
        <ScreenMetricsListener />
        <NoticeHost />
        <ConfirmHost />
        <InstallAppButton />
        <div
          className="app-shell bg-linear-to-br from-primary-700 via-primary-800 to-primary-900 min-h-dvh min-w-0 w-full overflow-x-hidden overflow-y-visible"
        >
          <RouteSwitch user={user} loading={loading} />
        </div>
      </Router>
  )
}

export default App

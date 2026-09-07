import { useState, useEffect, useCallback, useMemo } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { auth } from '../supabaseClient'
import { Menu, X, User, LogOut, ShoppingCart, Settings, HelpCircle, UserCircle, Calendar, ClipboardList, BarChart3, Tags, Calculator, FileSpreadsheet } from 'lucide-react'
import cafeteriaLogo from '../assets/food-delivery (1).png'
import Tutorial from './Tutorial'
import AdminTutorial from './AdminTutorial'
import SupportButton from './SupportButton'
import RequireUser from './RequireUser'
import OrderSuccessConfetti from './order-form/OrderSuccessConfetti'
import { useAuthContext } from '../contexts/authContextValue'
import { useScrollLock } from '../hooks/useScrollLock'
import { OverlayLockProvider } from '../contexts/OverlayLockContext'

const Layout = ({ children, user, loading }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [adminTutorialOpen, setAdminTutorialOpen] = useState(false)
  const [externalLocks, setExternalLocks] = useState(0)
  const { isAdmin, canAccessAdminPanel, canViewConsumptionReport } = useAuthContext()
  const navigate = useNavigate()
  const location = useLocation()

  // Helpers de diagnóstico disponibles solo en dev o con flag explícito.
  const _isScrollDebug = useMemo(() => {
    if (typeof import.meta === 'undefined') return false
    const envFlag = import.meta?.env?.VITE_SCROLL_DEBUG === '1'
    const isDev = import.meta?.env?.DEV
    const urlFlag = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('scrollDebug') === '1'
    return envFlag || isDev || urlFlag
  }, [])

  const registerExternalLock = useCallback(() => {
    setExternalLocks((count) => count + 1)
    return () => setExternalLocks((count) => Math.max(0, count - 1))
  }, [])

  const isAdminTutorialVisible = adminTutorialOpen && location.pathname === '/admin'
  const isAnyOverlayOpen = sidebarOpen || tutorialOpen || isAdminTutorialVisible || externalLocks > 0

  console.log('[DEBUG Layout] render', {
    pathname: location.pathname,
    adminTutorialOpen,
    isAdminTutorialVisible
  })

  // Scroll lock centralizado para cualquier overlay (sidebar, tutoriales o locks de hijos).
  useScrollLock(isAnyOverlayOpen)

  useEffect(() => {
    if (location.pathname !== '/admin' && adminTutorialOpen) {
      setAdminTutorialOpen(false)
    }
  }, [location.pathname, adminTutorialOpen])

  // Herramienta de diagnóstico (dev) para identificar contenedores que generan barras de scroll internas.
  useEffect(() => {
    if (!_isScrollDebug) return

    const logScrollContainers = () => {
      const candidates = Array.from(document.querySelectorAll('*')).filter((el) => {
        const style = window.getComputedStyle(el)
        const oy = style.overflowY
        const hasOverflow = oy === 'auto' || oy === 'scroll' || oy === 'overlay'
        return hasOverflow && el.scrollHeight - 1 > el.clientHeight
      })
      return candidates
    }

    window.__logScrollContainers = logScrollContainers

    return () => {
      if (window.__logScrollContainers === logScrollContainers) {
        delete window.__logScrollContainers
      }
    }
  }, [_isScrollDebug])

  // Métricas de scroll para diagnosticar doble scroll en dev.
  useEffect(() => {
    if (!_isScrollDebug) return

    let currentMetrics = null
    const getScrollMetrics = () => currentMetrics
    const logMetrics = () => {
      currentMetrics = {
        innerHeight: window.innerHeight,
        docScrollHeight: document.documentElement?.scrollHeight,
        bodyScrollHeight: document.body?.scrollHeight
      }
      window.__logScrollMetrics = getScrollMetrics
    }
    logMetrics()
    window.addEventListener('resize', logMetrics)
    return () => {
      window.removeEventListener('resize', logMetrics)
      if (window.__logScrollMetrics === getScrollMetrics) {
        delete window.__logScrollMetrics
      }
    }
  }, [_isScrollDebug])

  const handleLogout = async () => {
    const result = await auth.signOut()

    if (result?.error) {
      // Limpieza defensiva si el endpoint devolvió 403/session_not_found
      try {
        const { clearSupabaseStorage } = await import('../utils/clearSupabaseStorage')
        clearSupabaseStorage()
      } catch (_err) {
        console.error('Error cleaning Supabase storage after signOut:', _err)
      }
    }

    navigate('/')
  }

  const operationItems = [
    { name: 'Panel Principal', path: '/dashboard', icon: User },
    { name: 'Nuevo Pedido', path: '/order', icon: ShoppingCart }
  ]
  const reportsItems = []
  const administrationItems = []

  if (isAdmin) {
    operationItems.push({ name: 'Cafetería', path: '/cafeteria', logoSrc: cafeteriaLogo })
    operationItems.push({ name: 'Pedidos Diarios', path: '/daily-orders', icon: Calendar })
    operationItems.push({ name: 'Etiquetas', path: '/labels', icon: Tags })

    reportsItems.push({ name: 'Totalizadora', path: '/totalizadora', icon: Calculator })
    reportsItems.push({ name: 'Tendencias', path: '/tendencias', icon: BarChart3 })
    reportsItems.push({ name: 'Panel Mensual', path: '/monthly-panel', icon: Calendar })
    reportsItems.push({ name: 'Reporte de consumo', path: '/consumption-report', icon: FileSpreadsheet })

    administrationItems.push({ name: 'Panel Admin', path: '/admin', icon: Settings })
    administrationItems.push({ name: 'Auditoría', path: '/auditoria', icon: ClipboardList })
  } else if (canAccessAdminPanel) {
    operationItems.push({ name: 'Etiquetas', path: '/labels', icon: Tags })
    administrationItems.push({ name: 'Panel Admin', path: '/admin', icon: Settings })
    if (canViewConsumptionReport) {
      reportsItems.push({ name: 'Reporte de consumo', path: '/consumption-report', icon: FileSpreadsheet })
    }
  } else if (canViewConsumptionReport) {
    reportsItems.push({ name: 'Reporte de consumo', path: '/consumption-report', icon: FileSpreadsheet })
  }

  const menuSections = [
    { label: 'Operación', items: operationItems },
    { label: 'Reportes y análisis', items: reportsItems },
    { label: 'Administración', items: administrationItems }
  ].filter((section) => section.items.length > 0)

  const navItemClasses = ({ isActive }) => [
    'flex min-h-11 items-center rounded-xl px-3 py-2.5 text-sm font-bold transition-colors duration-150',
    isActive
      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
      : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'
  ].join(' ')

  const handleNavClick = (event, item) => {
    setSidebarOpen(false)

    if (location.pathname === '/admin' && item.path !== '/admin') {
      event.preventDefault()
      window.location.assign(item.path)
    }
  }

  const renderNavItem = (item) => {
    const Icon = item.icon

    return (
      <li key={item.path}>
        <NavLink
          to={item.path}
          className={navItemClasses}
          onClick={(event) => handleNavClick(event, item)}
        >
          {item.logoSrc ? (
            <img
              src={item.logoSrc}
              alt=""
              aria-hidden="true"
              className="mr-3 h-5 w-5 shrink-0 object-contain"
            />
          ) : (
            <Icon className="mr-3 h-5 w-5 shrink-0" />
          )}
          <span className="min-w-0 flex-1 leading-tight">{item.name}</span>
        </NavLink>
      </li>
    )
  }

  return (
    <RequireUser user={user} loading={loading}>
      <OverlayLockProvider registerLock={registerExternalLock}>
      <div data-debug-component="layout" className="flex flex-col bg-linear-to-br from-blue-600 via-blue-700 to-blue-800 min-h-dvh w-full">
      {!sidebarOpen && (
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="fixed left-4 top-4 z-1000 md:hidden p-2 rounded-md text-white bg-blue-900/90 hover:bg-blue-900 shadow-lg"
          aria-label="Abrir menú"
        >
          <Menu className="h-6 w-6" />
        </button>
      )}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-900 bg-black bg-opacity-40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <aside
          className={`
            fixed left-0 top-0 z-1000 flex h-dvh w-[min(85vw,320px)] flex-col bg-white shadow-2xl transform transition-transform duration-300 ease-in-out
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            md:translate-x-0 md:static md:inset-0 md:h-auto md:w-64 border-r-4 border-secondary-500
          `}
          style={{ pointerEvents: sidebarOpen || window.innerWidth >= 768 ? 'auto' : 'none', boxSizing: 'border-box' }}
        >
          <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
            <span className="font-montserrat text-4xl font-extrabold drop-shadow-sm">
              <span style={{ color: '#2563eb', fontSize: '2.8rem', lineHeight: 1 }}>Servi</span>
              <span style={{ color: '#EB6F24', fontSize: '2.8rem', lineHeight: 1 }}>Food</span>
            </span>
            <button
              className="md:hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100"
              onClick={() => setSidebarOpen(false)}
              aria-label="Cerrar menú"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white px-3 pb-4 pt-4">
            <div className="space-y-5">
              {menuSections.map((section) => (
                <section key={section.label} aria-label={section.label}>
                  <p className="mb-1.5 px-3 text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
                    {section.label}
                  </p>
                  <ul className="space-y-1">
                    {section.items.map(renderNavItem)}
                  </ul>
                </section>
              ))}

              <section aria-label="Cuenta y ayuda">
                <p className="mb-1.5 px-3 text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
                  Cuenta y ayuda
                </p>
                <ul className="space-y-1">
                  {renderNavItem({ name: 'Mi Perfil', path: '/profile', icon: UserCircle })}

                  {isAdmin && (
                    <li>
                      <button
                        type="button"
                        onClick={() => {
                          setAdminTutorialOpen(true)
                          setSidebarOpen(false)
                        }}
                        className="flex min-h-11 w-full items-center rounded-xl px-3 py-2.5 text-sm font-bold text-purple-700 transition-colors hover:bg-purple-50"
                      >
                        <Settings className="mr-3 h-5 w-5 shrink-0" />
                        <span>Tutorial Admin</span>
                      </button>
                    </li>
                  )}

                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        setTutorialOpen(true)
                        setSidebarOpen(false)
                      }}
                      className="flex min-h-11 w-full items-center rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-100"
                    >
                      <HelpCircle className="mr-3 h-5 w-5 shrink-0" />
                      <span>Ver Tutorial</span>
                    </button>
                  </li>

                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        handleLogout()
                        setSidebarOpen(false)
                      }}
                      className="flex min-h-11 w-full items-center rounded-xl px-3 py-2.5 text-sm font-bold text-red-700 transition-colors hover:bg-red-50"
                    >
                      <LogOut className="mr-3 h-5 w-5 shrink-0" />
                      <span>Cerrar Sesión</span>
                    </button>
                  </li>
                </ul>
              </section>
            </div>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden md:overflow-visible">
          {/* En mobile el scroll vive en este contenedor para evitar recortes del viewport dinámico. */}
          <div
            className="flex-1 p-4 md:p-8 min-h-0 overflow-y-auto overflow-x-hidden md:overflow-visible"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            {children}
          </div>
        </main>
      </div>

      {/* Tutorial Modals */}
      <Tutorial isOpen={tutorialOpen} onClose={() => setTutorialOpen(false)} />
      <AdminTutorial isOpen={isAdminTutorialVisible} onClose={() => setAdminTutorialOpen(false)} />

      {/* Support Button */}
      <SupportButton />
      <OrderSuccessConfetti />
      </div>
      </OverlayLockProvider>
    </RequireUser>
  )
}

export default Layout

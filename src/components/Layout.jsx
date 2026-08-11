import { useState, useEffect, useCallback, useMemo } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { auth } from '../supabaseClient'
import { Menu, X, User, LogOut, ShoppingCart, Settings, HelpCircle, UserCircle, Calendar, ClipboardList, BarChart3, Tags, CakeSlice } from 'lucide-react'
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
  const { isAdmin, canAccessAdminPanel, isHumanResources, canAccessBirthdays } = useAuthContext()
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

  const menuItems = [
    { name: 'Panel Principal', path: '/dashboard', icon: User }
  ]

  if (!isHumanResources) {
    menuItems.push({ name: 'Nuevo Pedido', path: '/order', icon: ShoppingCart })
  }

  if (isAdmin) {
    menuItems.push({ name: 'Cafeteria', path: '/cafeteria', logoSrc: cafeteriaLogo })
    menuItems.push({ name: '🎂 Cumpleaños', path: '/birthdays', icon: CakeSlice })
    menuItems.push({ 
      name: 'Pedidos Diarios', 
      path: '/daily-orders', 
      icon: Calendar,
      highlighted: true  // Marcar como destacado
    })
    menuItems.push({ name: 'Etiquetas', path: '/labels', icon: Tags })
    menuItems.push({ name: 'Tendencias', path: '/tendencias', icon: BarChart3 })
    menuItems.push({ name: 'Panel Mensual', path: '/monthly-panel', icon: Calendar })
    menuItems.push({ name: 'Panel Admin', path: '/admin', icon: Settings })
    menuItems.push({ name: 'Auditoría', path: '/auditoria', icon: ClipboardList })
  } else if (canAccessAdminPanel) {
    if (canAccessBirthdays) {
      menuItems.push({ name: '🎂 Cumpleaños', path: '/birthdays', icon: CakeSlice })
    }
    menuItems.push({ name: 'Etiquetas', path: '/labels', icon: Tags })
    menuItems.push({ name: 'Panel Admin', path: '/admin', icon: Settings })
  } else if (canAccessBirthdays) {
    menuItems.push({ name: '🎂 Cumpleaños', path: '/birthdays', icon: CakeSlice })
  }

  // Add Profile option for all users
  menuItems.push({ name: 'Mi Perfil', path: '/profile', icon: UserCircle })

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
        {/* Overlay para mobile */}
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
          {/* Botón cerrar solo en mobile */}
          <div className="flex items-center justify-between h-16 px-4 border-b-2 border-primary-200 bg-linear-to-r from-primary-700 to-primary-800">
            <span className="text-4xl font-extrabold drop-shadow-lg font-montserrat">
              <span style={{ color: '#2563eb', fontSize: '2.8rem', lineHeight: 1 }}>Servi</span>
              <span style={{ color: '#EB6F24', fontSize: '2.8rem', lineHeight: 1 }}>Food</span>
            </span>
            <button
              className="md:hidden p-2 rounded hover:bg-primary-700/10 text-primary-100"
              onClick={() => setSidebarOpen(false)}
              aria-label="Cerrar menú"
            >
              <X className="h-7 w-7" />
            </button>
          </div>
          <nav className="mt-8 px-4 bg-white flex flex-col flex-1 min-h-0 overflow-y-auto">
            <ul className="space-y-2 flex-1 bg-white">
              {menuItems.map((item) => {
                const Icon = item.icon
                return (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      className={({ isActive }) => {
                        let classes = "flex items-center px-4 py-3 rounded-xl font-bold text-base transition-all duration-200 shadow-sm"
                        if (isActive) {
                          classes += " bg-blue-600 text-white shadow-lg"
                        } else if (item.highlighted) {
                          classes += " bg-linear-to-r from-blue-500 to-blue-600 text-white shadow-md animate-pulse-slow"
                        } else {
                          classes += " text-gray-800 hover:bg-blue-50"
                        }
                        return classes
                      }}
                      onClick={(event) => {
                        setSidebarOpen(false)

                        if (
                          location.pathname === '/admin' &&
                          item.path !== '/admin'
                        ) {
                          event.preventDefault()
                          window.location.assign(item.path)
                        }
                      }}
                    >
                      {item.logoSrc ? (
                        <img
                          src={item.logoSrc}
                          alt={`${item.name} logo`}
                          className="h-6 w-6 mr-3 shrink-0 object-contain"
                        />
                      ) : (
                        <Icon className="h-6 w-6 mr-3 shrink-0" />
                      )}
                      <span className="flex-1">{item.name}</span>
                    </NavLink>
                  </li>
                )
              })}
              {/* Botones de tutorial y cerrar sesión en la barra lateral */}
              {isAdmin && (
                <li>
                  <button
                    onClick={() => {
                      setAdminTutorialOpen(true)
                      setSidebarOpen(false)
                    }}
                    className="group flex items-center w-full px-4 py-3 text-purple-700 rounded-xl bg-white font-bold text-base transition-all duration-200 transform hover:scale-105 shadow-sm hover:shadow-lg border-2 border-purple-200 hover:border-transparent hover:bg-linear-to-r hover:from-purple-600 hover:to-purple-700 mt-4"
                  >
                    <Settings className="h-6 w-6 mr-3 shrink-0 group-hover:text-white transition-colors" />
                    <span className="group-hover:text-white transition-colors">Tutorial Admin 👨‍💼</span>
                  </button>
                </li>
              )}
              <li>
                <button
                  onClick={() => {
                    setTutorialOpen(true)
                    setSidebarOpen(false)
                  }}
                  className="group flex items-center w-full px-4 py-3 rounded-xl bg-linear-to-r from-blue-600 to-blue-700 text-white font-bold text-base transition-all duration-200 transform hover:scale-105 shadow-md hover:shadow-xl border-2 border-blue-500 hover:border-blue-400 hover:from-blue-500 hover:to-blue-600"
                >
                  <HelpCircle className="h-6 w-6 mr-3 shrink-0 text-white" />
                  <span className="text-white">Ver Tutorial</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    handleLogout()
                    setSidebarOpen(false)
                  }}
                  className="group flex items-center w-full px-4 py-3 text-red-700 rounded-xl bg-white font-bold text-base transition-all duration-200 transform hover:scale-105 shadow-sm hover:shadow-lg border-2 border-red-200 hover:border-transparent hover:bg-linear-to-r hover:from-red-600 hover:to-red-700"
                >
                  <LogOut className="h-6 w-6 mr-3 shrink-0 group-hover:text-white transition-colors" />
                  <span className="group-hover:text-white transition-colors">Cerrar Sesión</span>
                </button>
              </li>
            </ul>
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

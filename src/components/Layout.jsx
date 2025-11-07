import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth } from '../supabaseClient'
import { Menu, X, User, LogOut, ShoppingCart, Settings } from 'lucide-react'
import servifoodLogo from '../assets/servifood logo.jpg'

const Layout = ({ children, user }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const navigate = useNavigate()

  const handleLogout = async () => {
    await auth.signOut()
    navigate('/login')
  }

  const isAdmin = user?.user_metadata?.role === 'admin'

  const menuItems = [
    { name: 'Dashboard', path: '/', icon: User },
    { name: 'Nuevo Pedido', path: '/order', icon: ShoppingCart },
  ]

  if (isAdmin) {
    menuItems.push({ name: 'Panel Admin', path: '/admin', icon: Settings })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-700 via-primary-800 to-primary-900">
      {/* Header */}
      <header className="bg-gradient-to-r from-primary-900 to-primary-800 shadow-2xl border-b-4 border-secondary-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 rounded-md text-white/80 hover:text-white hover:bg-white/10 md:hidden"
              >
                <Menu className="h-6 w-6" />
              </button>
              <div className="flex items-center ml-4 md:ml-0">
                <img 
                  src={servifoodLogo} 
                  alt="Servifood Logo" 
                  className="h-12 w-auto rounded bg-white p-1.5"
                />
                <span className="ml-3 text-xl font-bold text-white drop-shadow-lg">ServiFood Catering</span>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <span className="text-sm font-medium text-white drop-shadow">Hola, {user?.email?.split('@')[0]}</span>
              <button
                onClick={handleLogout}
                className="p-2 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-4rem)]">
        {/* Sidebar */}
        <aside className={`${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-2xl transform transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:inset-0 border-r-4 border-secondary-500`}>
          <div className="flex items-center justify-center h-16 px-4 border-b-2 border-primary-200 bg-gradient-to-r from-primary-700 to-primary-800">
            <img 
              src={servifoodLogo} 
              alt="Servifood Logo" 
              className="h-12 w-auto rounded bg-white p-1"
            />
            <span className="ml-3 text-lg font-bold text-white drop-shadow">ServiFood</span>
          </div>

          <nav className="mt-8 px-4 bg-white min-h-full flex flex-col">
            <ul className="space-y-2 flex-1">
              {menuItems.map((item) => {
                const Icon = item.icon
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      className="flex items-center px-4 py-3 text-gray-800 rounded-xl hover:bg-gradient-to-r hover:from-primary-600 hover:to-primary-700 hover:text-white font-semibold transition-all duration-200 transform hover:scale-105 shadow-sm hover:shadow-lg"
                      onClick={() => setSidebarOpen(false)}
                    >
                      <Icon className="h-5 w-5 mr-3" />
                      {item.name}
                    </Link>
                  </li>
                )
              })}
            </ul>

            {/* Logout Button */}
            <div className="mt-auto mb-6">
              <button
                onClick={() => {
                  handleLogout()
                  setSidebarOpen(false)
                }}
                className="flex items-center w-full px-4 py-3 text-red-700 rounded-xl hover:bg-gradient-to-r hover:from-red-600 hover:to-red-700 hover:text-white font-semibold transition-all duration-200 transform hover:scale-105 shadow-sm hover:shadow-lg border-2 border-red-200 hover:border-transparent"
              >
                <LogOut className="h-5 w-5 mr-3" />
                Cerrar Sesión
              </button>
            </div>
          </nav>

          {/* Botón cerrar en móvil */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="absolute top-4 right-4 p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 md:hidden"
          >
            <X className="h-6 w-6" />
          </button>
        </aside>

        {/* Overlay para móvil */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black bg-opacity-50 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main content */}
        <main className="flex-1 md:ml-0">
          <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

export default Layout

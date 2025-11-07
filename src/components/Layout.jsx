import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth } from '../supabaseClient'
import { Menu, X, User, LogOut, ChefHat, ShoppingCart, Settings } from 'lucide-react'

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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 md:hidden"
              >
                <Menu className="h-6 w-6" />
              </button>
              <div className="flex items-center ml-4 md:ml-0">
                <ChefHat className="h-8 w-8 text-primary-600" />
                <span className="ml-2 text-xl font-bold text-gray-900">ServiFood</span>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-700">Hola, {user?.email?.split('@')[0]}</span>
              <button
                onClick={handleLogout}
                className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className={`${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:inset-0`}>
          <div className="flex items-center justify-center h-16 px-4 border-b border-gray-200">
            <ChefHat className="h-8 w-8 text-primary-600" />
            <span className="ml-2 text-xl font-bold text-gray-900">ServiFood</span>
          </div>

          <nav className="mt-8 px-4">
            <ul className="space-y-2">
              {menuItems.map((item) => {
                const Icon = item.icon
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      className="flex items-center px-4 py-2 text-gray-700 rounded-lg hover:bg-gray-100 hover:text-primary-600 transition-colors duration-200"
                      onClick={() => setSidebarOpen(false)}
                    >
                      <Icon className="h-5 w-5 mr-3" />
                      {item.name}
                    </Link>
                  </li>
                )
              })}
            </ul>
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

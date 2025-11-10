import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../supabaseClient'
import { ShoppingCart, Clock, CheckCircle, ChefHat, Plus, Package } from 'lucide-react'

const Dashboard = ({ user }) => {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    completed: 0
  })

  useEffect(() => {
    checkIfAdmin()
  }, [user])

  useEffect(() => {
    if (isAdmin !== null) {
      fetchOrders()
    }
  }, [isAdmin])

  const checkIfAdmin = async () => {
    try {
      const { data, error } = await db.getUsers()
      if (!error && data) {
        const currentUser = data.find(u => u.id === user.id)
        setIsAdmin(currentUser?.role === 'admin')
      }
    } catch (err) {
      console.error('Error checking admin status:', err)
    }
  }

  const fetchOrders = async () => {
    try {
      // Admins ven todos los pedidos, usuarios solo los suyos
      const { data, error } = isAdmin 
        ? await db.getOrders() 
        : await db.getOrders(user.id)

      if (error) {
        console.error('Error fetching orders:', error)
      } else {
        setOrders(data || [])
        calculateStats(data || [])
      }
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const calculateStats = (ordersData) => {
    const total = ordersData.length
    const pending = ordersData.filter(order => order.status === 'pending').length
    const completed = ordersData.filter(order => order.status === 'completed').length

    setStats({ total, pending, completed })
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const handleMarkAsDelivered = async (orderId) => {
    if (confirm('¿Marcar este pedido como entregado?')) {
      try {
        const { error } = await db.updateOrderStatus(orderId, 'delivered')
        if (error) {
          alert('Error al actualizar el pedido')
        } else {
          fetchOrders() // Recargar pedidos
        }
      } catch (err) {
        console.error('Error:', err)
        alert('Error al actualizar el pedido')
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-4xl sm:text-5xl font-bold text-white drop-shadow-2xl mb-2">Panel Principal</h1>
          <p className="mt-2 text-xl sm:text-2xl text-white font-semibold drop-shadow-lg">
            ¡Hola, {user?.user_metadata?.full_name || user?.email?.split('@')[0]}!
          </p>
          <p className="text-base sm:text-lg text-white/90 mt-1">Aquí está el resumen de tus pedidos</p>
        </div>
        <div className="mt-4 sm:mt-0 w-full sm:w-auto">
          <Link to="/order" className="btn-primary inline-flex items-center justify-center w-full sm:w-auto bg-gradient-to-r from-secondary-500 to-secondary-600 hover:from-secondary-600 hover:to-secondary-700 text-white font-bold py-3 sm:py-4 px-6 sm:px-8 text-base sm:text-lg rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200">
            <Plus className="h-5 w-5 sm:h-6 sm:w-6 mr-2" />
            Nuevo Pedido
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
        <div className="card bg-gradient-to-br from-white to-blue-50 shadow-2xl border-2 border-primary-200 transform hover:scale-105 transition-all duration-200">
          <div className="flex items-center">
            <div className="p-3 sm:p-4 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 shadow-lg">
              <ShoppingCart className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
            </div>
            <div className="ml-4 sm:ml-5">
              <p className="text-sm sm:text-base font-bold text-gray-700 uppercase tracking-wide">Total Pedidos</p>
              <p className="text-3xl sm:text-5xl font-black text-primary-700 drop-shadow">{stats.total}</p>
            </div>
          </div>
        </div>

        <div className="card bg-gradient-to-br from-white to-yellow-50 shadow-2xl border-2 border-yellow-200 transform hover:scale-105 transition-all duration-200">
          <div className="flex items-center">
            <div className="p-3 sm:p-4 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 shadow-lg">
              <Clock className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
            </div>
            <div className="ml-4 sm:ml-5">
              <p className="text-sm sm:text-base font-bold text-gray-700 uppercase tracking-wide">Pendientes</p>
              <p className="text-3xl sm:text-5xl font-black text-yellow-700 drop-shadow">{stats.pending}</p>
            </div>
          </div>
        </div>

        <div className="card bg-gradient-to-br from-white to-green-50 shadow-2xl border-2 border-green-200 transform hover:scale-105 transition-all duration-200">
          <div className="flex items-center">
            <div className="p-3 sm:p-4 rounded-full bg-gradient-to-br from-green-500 to-green-700 shadow-lg">
              <CheckCircle className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
            </div>
            <div className="ml-4 sm:ml-5">
              <p className="text-sm sm:text-base font-bold text-gray-700 uppercase tracking-wide">Completados</p>
              <p className="text-3xl sm:text-5xl font-black text-green-600 drop-shadow">{stats.completed}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="card bg-white/95 backdrop-blur-sm shadow-xl border-2 border-white/20">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-3xl font-bold text-gray-900 drop-shadow">Pedidos Activos</h2>
          <Link to="/order" className="text-secondary-600 hover:text-secondary-700 text-lg font-bold hover:underline">
            Nuevo Pedido →
          </Link>
        </div>

        {orders.filter(o => o.status !== 'delivered').length === 0 ? (
          <div className="text-center py-12">
            <ChefHat className="h-20 w-20 text-gray-400 mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-gray-900 mb-2">No hay pedidos activos</h3>
            <p className="text-xl text-gray-600 mb-6">¡Crea un nuevo pedido para comenzar!</p>
            <Link to="/order" className="btn-primary bg-gradient-to-r from-secondary-500 to-secondary-600 hover:from-secondary-600 hover:to-secondary-700 text-white font-bold py-4 px-8 text-lg rounded-xl shadow-lg">
              Crear Pedido
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.filter(o => o.status !== 'delivered').slice(0, 5).map((order) => (
              <div key={order.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 border-2 border-gray-200 rounded-xl hover:border-primary-300 hover:shadow-lg transition-all">
                <div className="flex items-center space-x-3 sm:space-x-4 flex-1 min-w-0">
                  <div className={`p-2 rounded-full flex-shrink-0 ${
                    order.status === 'delivered' ? 'bg-green-100' :
                    order.status === 'pending' ? 'bg-yellow-100' : 'bg-blue-100'
                  }`}>
                    {order.status === 'delivered' ? (
                      <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
                    ) : order.status === 'pending' ? (
                      <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-600" />
                    ) : (
                      <Package className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm sm:text-base truncate">
                      Pedido #{order.id.slice(-8)}
                    </p>
                    <p className="text-xs sm:text-sm text-gray-600 truncate">
                      {order.location} • {formatDate(order.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 justify-end sm:justify-start">
                  <span className={`inline-flex px-2 sm:px-3 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${
                    order.status === 'delivered' ? 'bg-green-100 text-green-800' :
                    order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {order.status === 'delivered' ? 'Entregado' :
                     order.status === 'pending' ? 'Pendiente' : 'En Proceso'}
                  </span>
                  
                  {isAdmin && order.status !== 'delivered' && (
                    <button
                      onClick={() => handleMarkAsDelivered(order.id)}
                      className="p-2 text-green-600 hover:bg-green-100 rounded-lg transition-colors flex-shrink-0"
                      title="Marcar como entregado"
                    >
                      <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completed Orders */}
      {orders.filter(o => o.status === 'delivered').length > 0 && (
        <div className="card bg-white/95 backdrop-blur-sm shadow-xl border-2 border-white/20">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-3xl font-bold text-gray-900 drop-shadow">Pedidos Completados</h2>
            <span className="text-sm text-gray-600 font-semibold">
              {orders.filter(o => o.status === 'delivered').length} completado(s)
            </span>
          </div>

          <div className="space-y-4">
            {orders.filter(o => o.status === 'delivered').slice(0, 10).map((order) => (
              <div key={order.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 border-2 border-green-200 bg-green-50 rounded-xl">
                <div className="flex items-center space-x-3 sm:space-x-4 flex-1 min-w-0">
                  <div className="p-2 rounded-full bg-green-100 flex-shrink-0">
                    <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm sm:text-base truncate">
                      Pedido #{order.id.slice(-8)}
                    </p>
                    <p className="text-xs sm:text-sm text-gray-600 truncate">
                      {order.location} • {formatDate(order.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 justify-end sm:justify-start">
                  <span className="inline-flex px-2 sm:px-3 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 whitespace-nowrap">
                    Entregado
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard

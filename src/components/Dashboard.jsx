import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../supabaseClient'
import { ShoppingCart, Clock, CheckCircle, ChefHat, Plus, Package } from 'lucide-react'

const Dashboard = ({ user }) => {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    completed: 0
  })

  useEffect(() => {
    fetchOrders()
  }, [user])

  const fetchOrders = async () => {
    try {
      const { data, error } = await db.getOrders(user.id)

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-5xl font-bold text-white drop-shadow-2xl mb-2">Dashboard</h1>
          <p className="mt-2 text-2xl text-white font-semibold drop-shadow-lg">¡Hola, {user?.email?.split('@')[0]}!</p>
          <p className="text-lg text-white/90 mt-1">Aquí está el resumen de tus pedidos</p>
        </div>
        <div className="mt-4 sm:mt-0">
          <Link to="/order" className="btn-primary inline-flex items-center bg-gradient-to-r from-secondary-500 to-secondary-600 hover:from-secondary-600 hover:to-secondary-700 text-white font-bold py-4 px-8 text-lg rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200">
            <Plus className="h-6 w-6 mr-2" />
            Nuevo Pedido
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card bg-gradient-to-br from-white to-blue-50 shadow-2xl border-2 border-primary-200 transform hover:scale-105 transition-all duration-200">
          <div className="flex items-center">
            <div className="p-4 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 shadow-lg">
              <ShoppingCart className="h-8 w-8 text-white" />
            </div>
            <div className="ml-5">
              <p className="text-base font-bold text-gray-700 uppercase tracking-wide">Total Pedidos</p>
              <p className="text-5xl font-black text-primary-700 drop-shadow">{stats.total}</p>
            </div>
          </div>
        </div>

        <div className="card bg-gradient-to-br from-white to-yellow-50 shadow-2xl border-2 border-yellow-200 transform hover:scale-105 transition-all duration-200">
          <div className="flex items-center">
            <div className="p-4 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 shadow-lg">
              <Clock className="h-8 w-8 text-white" />
            </div>
            <div className="ml-5">
              <p className="text-base font-bold text-gray-700 uppercase tracking-wide">Pendientes</p>
              <p className="text-5xl font-black text-yellow-700 drop-shadow">{stats.pending}</p>
            </div>
          </div>
        </div>

        <div className="card bg-gradient-to-br from-white to-green-50 shadow-2xl border-2 border-green-200 transform hover:scale-105 transition-all duration-200">
          <div className="flex items-center">
            <div className="p-4 rounded-full bg-gradient-to-br from-green-500 to-green-700 shadow-lg">
              <CheckCircle className="h-8 w-8 text-white" />
            </div>
            <div className="ml-5">
              <p className="text-base font-bold text-gray-700 uppercase tracking-wide">Completados</p>
              <p className="text-5xl font-black text-green-600 drop-shadow">{stats.completed}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="card bg-white/95 backdrop-blur-sm shadow-xl border-2 border-white/20">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-3xl font-bold text-gray-900 drop-shadow">Pedidos Recientes</h2>
          <Link to="/order" className="text-secondary-600 hover:text-secondary-700 text-lg font-bold hover:underline">
            Ver todos →
          </Link>
        </div>

        {orders.length === 0 ? (
          <div className="text-center py-12">
            <ChefHat className="h-20 w-20 text-gray-400 mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-gray-900 mb-2">No hay pedidos aún</h3>
            <p className="text-xl text-gray-600 mb-6">¡Crea tu primer pedido para comenzar!</p>
            <Link to="/order" className="btn-primary bg-gradient-to-r from-secondary-500 to-secondary-600 hover:from-secondary-600 hover:to-secondary-700 text-white font-bold py-4 px-8 text-lg rounded-xl shadow-lg">
              Crear Primer Pedido
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.slice(0, 5).map((order) => (
              <div key={order.id} className="flex items-center justify-between p-4 border-2 border-gray-200 rounded-xl hover:border-primary-300 hover:shadow-lg transition-all">
                <div className="flex items-center space-x-4 flex-1">
                  <div className={`p-2 rounded-full ${
                    order.status === 'delivered' ? 'bg-green-100' :
                    order.status === 'pending' ? 'bg-yellow-100' : 'bg-blue-100'
                  }`}>
                    {order.status === 'delivered' ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : order.status === 'pending' ? (
                      <Clock className="h-5 w-5 text-yellow-600" />
                    ) : (
                      <Package className="h-5 w-5 text-blue-600" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">
                      Pedido #{order.id.slice(-8)}
                    </p>
                    <p className="text-sm text-gray-600">
                      {order.location} • {formatDate(order.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${
                    order.status === 'delivered' ? 'bg-green-100 text-green-800' :
                    order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {order.status === 'delivered' ? 'Entregado' :
                     order.status === 'pending' ? 'Pendiente' : 'En Proceso'}
                  </span>
                  
                  {order.status !== 'delivered' && (
                    <button
                      onClick={() => handleMarkAsDelivered(order.id)}
                      className="p-2 text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                      title="Marcar como entregado"
                    >
                      <CheckCircle className="h-5 w-5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Dashboard

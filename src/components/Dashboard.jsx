import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../supabaseClient'
import { ShoppingCart, Clock, CheckCircle, ChefHat, Plus } from 'lucide-react'

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-2 text-gray-600">Bienvenido de vuelta, {user?.email?.split('@')[0]}</p>
        </div>
        <div className="mt-4 sm:mt-0">
          <Link to="/order" className="btn-primary inline-flex items-center">
            <Plus className="h-5 w-5 mr-2" />
            Nuevo Pedido
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-primary-100">
              <ShoppingCart className="h-6 w-6 text-primary-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Pedidos</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-yellow-100">
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Pendientes</p>
              <p className="text-2xl font-bold text-gray-900">{stats.pending}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-green-100">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Completados</p>
              <p className="text-2xl font-bold text-gray-900">{stats.completed}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Pedidos Recientes</h2>
          <Link to="/order" className="text-primary-600 hover:text-primary-500 text-sm font-medium">
            Ver todos
          </Link>
        </div>

        {orders.length === 0 ? (
          <div className="text-center py-12">
            <ChefHat className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No hay pedidos aún</h3>
            <p className="text-gray-600 mb-6">¡Crea tu primer pedido para comenzar!</p>
            <Link to="/order" className="btn-primary">
              Crear Primer Pedido
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.slice(0, 5).map((order) => (
              <div key={order.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
                <div className="flex items-center space-x-4">
                  <div className={`p-2 rounded-full ${
                    order.status === 'completed' ? 'bg-green-100' :
                    order.status === 'pending' ? 'bg-yellow-100' : 'bg-gray-100'
                  }`}>
                    {order.status === 'completed' ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : order.status === 'pending' ? (
                      <Clock className="h-5 w-5 text-yellow-600" />
                    ) : (
                      <ShoppingCart className="h-5 w-5 text-gray-600" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      Pedido #{order.id.slice(-8)}
                    </p>
                    <p className="text-sm text-gray-600">
                      {order.location} • {formatDate(order.created_at)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                    order.status === 'completed' ? 'bg-green-100 text-green-800' :
                    order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {order.status === 'completed' ? 'Completado' :
                     order.status === 'pending' ? 'Pendiente' : 'Procesando'}
                  </span>
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

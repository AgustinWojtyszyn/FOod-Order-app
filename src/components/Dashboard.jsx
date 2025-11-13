import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../supabaseClient'
import { ShoppingCart, Clock, CheckCircle, ChefHat, Plus, Package, Eye, X, Settings, Users, MessageCircle, Phone } from 'lucide-react'

const Dashboard = ({ user }) => {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
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
      // TODOS (admins y usuarios) solo ven sus propios pedidos en el Dashboard
      const { data, error } = await db.getOrders(user.id)

      if (error) {
        console.error('Error fetching orders:', error)
      } else {
        // Obtener información de usuarios para mostrar nombres
        const { data: usersData } = await db.getUsers()
        
        // Obtener fecha de hoy
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        
        let ordersWithUserNames = (data || []).map(order => {
          const orderUser = usersData?.find(u => u.id === order.user_id)
          // Intentar obtener el nombre de diferentes fuentes
          let userName = 'Usuario'
          if (orderUser) {
            userName = orderUser.full_name || 
                      orderUser.user_metadata?.full_name || 
                      orderUser.email?.split('@')[0] || 
                      order.customer_name ||
                      'Usuario'
          } else if (order.customer_name) {
            userName = order.customer_name
          }
          
          return {
            ...order,
            user_name: userName
          }
        })
        
        // Si NO es admin, filtrar solo pedidos de hoy Y excluir completados/entregados
        if (!isAdmin) {
          ordersWithUserNames = ordersWithUserNames.filter(order => {
            const orderDate = new Date(order.created_at)
            orderDate.setHours(0, 0, 0, 0)
            const isToday = orderDate.getTime() === today.getTime()
            const isNotCompleted = order.status !== 'completed' && order.status !== 'delivered'
            return isToday && isNotCompleted
          })
        }
        
        setOrders(ordersWithUserNames)
        calculateStats(ordersWithUserNames)
      }
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const calculateStats = (ordersData) => {
    // Obtener fecha de hoy a las 00:00:00
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    // Filtrar solo pedidos de hoy
    const todayOrders = ordersData.filter(order => {
      const orderDate = new Date(order.created_at)
      orderDate.setHours(0, 0, 0, 0)
      return orderDate.getTime() === today.getTime()
    })
    
    const total = todayOrders.length
    const pending = todayOrders.filter(order => order.status === 'pending').length
    const completed = todayOrders.filter(order => 
      order.status === 'completed' || order.status === 'delivered'
    ).length

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

  const handleStatusChange = async (orderId, newStatus, currentStatus) => {
    if (currentStatus === newStatus) return // No hacer nada si es el mismo estado
    
    const statusNames = {
      'completed': 'Completado',
      'cancelled': 'Cancelado'
    }
    
    if (confirm(`¿Cambiar estado a "${statusNames[newStatus]}"?`)) {
      try {
        const { error } = await db.updateOrderStatus(orderId, newStatus)
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

  const handleMarkAllAsCompleted = async () => {
    const pendingOrders = orders.filter(order => order.status === 'pending')
    
    if (pendingOrders.length === 0) {
      alert('No hay pedidos pendientes para marcar como completados')
      return
    }

    if (confirm(`¿Marcar todos los ${pendingOrders.length} pedidos pendientes como completados?`)) {
      try {
        const promises = pendingOrders.map(order => 
          db.updateOrderStatus(order.id, 'completed')
        )
        
        const results = await Promise.all(promises)
        const errors = results.filter(r => r.error)
        
        if (errors.length > 0) {
          alert(`Se actualizaron ${pendingOrders.length - errors.length} pedidos. ${errors.length} fallaron.`)
        } else {
          alert(`✓ ${pendingOrders.length} pedidos marcados como completados`)
        }
        
        fetchOrders() // Recargar pedidos
      } catch (err) {
        console.error('Error:', err)
        alert('Error al actualizar los pedidos')
      }
    }
  }

  const formatCustomResponses = (customResponses) => {
    if (!customResponses || customResponses.length === 0) {
      return null
    }
    
    return customResponses.filter(resp => resp.response).map((resp, index) => (
      <div key={index} className="border-l-4 border-purple-500 pl-3 py-2 bg-purple-50 rounded">
        <p className="font-semibold text-gray-900 text-sm">{resp.title}</p>
        <p className="text-gray-700 text-sm mt-1">
          {Array.isArray(resp.response) 
            ? resp.response.join(', ') 
            : resp.response}
        </p>
      </div>
    ))
  }

  const OrderDetailsModal = ({ order, onClose }) => {
    if (!order) return null

    return (
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <div 
          className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sticky top-0 bg-gradient-to-r from-primary-600 to-primary-700 text-white p-6 rounded-t-2xl flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">Detalles del Pedido</h2>
              <p className="text-primary-100 mt-1">#{order.id.slice(-8)}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Información del Usuario */}
            <div className="bg-gray-50 rounded-xl p-4">
              <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                <Users className="h-5 w-5 text-primary-600" />
                Información del Cliente
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-600">Usuario:</span>
                  <p className="font-semibold text-gray-900">{order.user_name}</p>
                </div>
                <div>
                  <span className="text-gray-600">Ubicación:</span>
                  <p className="font-semibold text-gray-900">{order.location}</p>
                </div>
                {order.customer_name && (
                  <div>
                    <span className="text-gray-600">Nombre:</span>
                    <p className="font-semibold text-gray-900">{order.customer_name}</p>
                  </div>
                )}
                {order.customer_email && (
                  <div>
                    <span className="text-gray-600">Email:</span>
                    <p className="font-semibold text-gray-900">{order.customer_email}</p>
                  </div>
                )}
                {order.customer_phone && (
                  <div>
                    <span className="text-gray-600">Teléfono:</span>
                    <p className="font-semibold text-gray-900">{order.customer_phone}</p>
                  </div>
                )}
                <div>
                  <span className="text-gray-600">Fecha de pedido:</span>
                  <p className="font-semibold text-gray-900">{formatDate(order.created_at)}</p>
                </div>
              </div>
            </div>

            {/* Items del Pedido */}
            <div className="bg-blue-50 rounded-xl p-4">
              <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                <ChefHat className="h-5 w-5 text-blue-600" />
                Platillos Ordenados
              </h3>
              <div className="space-y-2">
                {order.items && order.items.map((item, index) => (
                  <div key={index} className="flex justify-between items-center bg-white p-3 rounded-lg">
                    <span className="font-medium text-gray-900">{item.name}</span>
                    <span className="text-gray-600 bg-gray-100 px-3 py-1 rounded-full text-sm font-semibold">
                      Cantidad: {item.quantity}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Opciones Personalizadas */}
            {order.custom_responses && order.custom_responses.length > 0 && (
              <div className="bg-purple-50 rounded-xl p-4">
                <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <Settings className="h-5 w-5 text-purple-600" />
                  Opciones Adicionales
                </h3>
                <div className="space-y-3">
                  {formatCustomResponses(order.custom_responses)}
                </div>
              </div>
            )}

            {/* Comentarios */}
            {order.comments && (
              <div className="bg-yellow-50 rounded-xl p-4">
                <h3 className="font-bold text-gray-900 mb-2">Comentarios:</h3>
                <p className="text-gray-700 italic">{order.comments}</p>
              </div>
            )}

            {/* Estado */}
            <div className="bg-gray-50 rounded-xl p-4">
              <h3 className="font-bold text-gray-900 mb-2">Estado:</h3>
              <span className={`inline-flex px-4 py-2 text-sm font-bold rounded-full ${
                order.status === 'delivered' || order.status === 'completed' ? 'bg-green-100 text-green-800' :
                order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                order.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                'bg-blue-100 text-blue-800'
              }`}>
                {order.status === 'delivered' ? 'Entregado' :
                 order.status === 'completed' ? 'Completado' :
                 order.status === 'pending' ? 'Pendiente' : 
                 order.status === 'cancelled' ? 'Cancelado' : order.status}
              </span>
            </div>
          </div>
        </div>
      </div>
    )
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
        <div className="flex flex-col sm:flex-row gap-3 mt-4 sm:mt-0 w-full sm:w-auto">
          {isAdmin && (
            <button
              onClick={handleMarkAllAsCompleted}
              className="inline-flex items-center justify-center bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-3 px-6 text-base rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
            >
              <CheckCircle className="h-5 w-5 mr-2" />
              Marcar Todos Completos
            </button>
          )}
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
              <p className="text-sm sm:text-base font-bold text-gray-700 uppercase tracking-wide">Pedidos Hoy</p>
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

      {/* Support Card - Para usuarios normales */}
      {!isAdmin && (
        <div className="card bg-gradient-to-br from-green-50 to-emerald-50 shadow-xl border-2 border-green-300">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="bg-gradient-to-r from-green-500 to-green-600 text-white p-4 rounded-xl">
              <MessageCircle className="h-10 w-10" />
            </div>
            <div className="flex-1 text-center sm:text-left">
              <h3 className="text-2xl font-bold text-gray-900 mb-2">¿Necesitas ayuda?</h3>
              <p className="text-gray-700 mb-4">Estamos aquí para ayudarte. ¡Hablemos por WhatsApp! 😊</p>
              <a
                href="https://wa.me/2644405294?text=¡Hola!%20Necesito%20ayuda%20con%20ServiFood%20Catering%20🍽️"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
              >
                <Phone className="h-5 w-5" />
                Contactar por WhatsApp
              </a>
              <p className="text-sm text-gray-600 mt-3 font-semibold">
                📱 +54 264 440 5294
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Recent Orders */}
      <div className="card bg-white/95 backdrop-blur-sm shadow-xl border-2 border-white/20">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-3xl font-bold text-gray-900 drop-shadow">Pedidos Activos</h2>
          <Link to="/order" className="text-secondary-600 hover:text-secondary-700 text-lg font-bold hover:underline">
            Nuevo Pedido →
          </Link>
        </div>

        {orders.filter(o => o.status !== 'delivered' && o.status !== 'completed').length === 0 ? (
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
            {orders.filter(o => o.status !== 'delivered' && o.status !== 'completed').slice(0, 5).map((order) => (
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
                      {order.user_name} - Pedido #{order.id.slice(-8)}
                    </p>
                    <p className="text-xs sm:text-sm text-gray-600 truncate">
                      {order.location} • {formatDate(order.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 justify-end sm:justify-start">
                  {isAdmin && (
                    <button
                      onClick={() => setSelectedOrder(order)}
                      className="p-2 hover:bg-primary-100 rounded-lg transition-colors text-primary-600"
                      title="Ver detalles"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  )}
                  {isAdmin ? (
                    <select
                      value={order.status}
                      onChange={(e) => handleStatusChange(order.id, e.target.value, order.status)}
                      className={`text-xs font-semibold rounded-full px-2 sm:px-3 py-1 border-2 focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                        order.status === 'completed' || order.status === 'delivered' ? 'bg-green-100 text-green-800 border-green-300' :
                        order.status === 'cancelled' ? 'bg-red-100 text-red-800 border-red-300' :
                        'bg-yellow-100 text-yellow-800 border-yellow-300'
                      }`}
                    >
                      <option value="pending">Pendiente</option>
                      <option value="completed">Completado</option>
                      <option value="cancelled">Cancelado</option>
                    </select>
                  ) : (
                    <span className={`inline-flex px-2 sm:px-3 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${
                      order.status === 'delivered' ? 'bg-green-100 text-green-800' :
                      order.status === 'completed' ? 'bg-green-100 text-green-800' :
                      order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      order.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {order.status === 'delivered' ? 'Entregado' :
                       order.status === 'completed' ? 'Completado' :
                       order.status === 'pending' ? 'Pendiente' : 
                       order.status === 'processing' ? 'En Proceso' : 'Cancelado'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completed Orders - Solo para admins */}
      {isAdmin && orders.filter(o => o.status === 'delivered' || o.status === 'completed').length > 0 && (
        <div className="card bg-white/95 backdrop-blur-sm shadow-xl border-2 border-white/20">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-3xl font-bold text-gray-900 drop-shadow">Pedidos Completados</h2>
            <span className="text-sm text-gray-600 font-semibold">
              {orders.filter(o => o.status === 'delivered' || o.status === 'completed').length} completado(s)
            </span>
          </div>

          <div className="space-y-4">
            {orders.filter(o => o.status === 'delivered' || o.status === 'completed').slice(0, 10).map((order) => (
              <div key={order.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 border-2 border-green-200 bg-green-50 rounded-xl">
                <div className="flex items-center space-x-3 sm:space-x-4 flex-1 min-w-0">
                  <div className="p-2 rounded-full bg-green-100 flex-shrink-0">
                    <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm sm:text-base truncate">
                      {isAdmin ? `${order.user_name} - ` : ''}Pedido #{order.id.slice(-8)}
                    </p>
                    <p className="text-xs sm:text-sm text-gray-600 truncate">
                      {order.location} • {formatDate(order.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 justify-end sm:justify-start">
                  {isAdmin && (
                    <button
                      onClick={() => setSelectedOrder(order)}
                      className="p-2 hover:bg-green-200 rounded-lg transition-colors text-green-700"
                      title="Ver detalles"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  )}
                  <span className="inline-flex px-2 sm:px-3 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 whitespace-nowrap">
                    Entregado
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal de Detalles */}
      {selectedOrder && (
        <OrderDetailsModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
      )}
    </div>
  )
}

export default Dashboard

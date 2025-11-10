import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../supabaseClient'
import { ShoppingCart, Plus, Minus, X, ChefHat, User } from 'lucide-react'

const OrderForm = ({ user }) => {
  const [menuItems, setMenuItems] = useState([])
  const [selectedItems, setSelectedItems] = useState({})
  const [formData, setFormData] = useState({
    location: '',
    name: '',
    email: '',
    phone: '',
    comments: '',
    deliveryDate: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [hasOrderToday, setHasOrderToday] = useState(false)
  const navigate = useNavigate()

  const locations = ['Los Berros', 'La Laja', 'Padre Bueno']

  useEffect(() => {
    fetchMenuItems()
    checkTodayOrder()
    // Pre-fill user data
    setFormData(prev => ({
      ...prev,
      name: user?.user_metadata?.full_name || '',
      email: user?.email || ''
    }))
  }, [user])

  const checkTodayOrder = async () => {
    try {
      // Obtener solo los pedidos del usuario actual
      const { data, error } = await db.getOrders(user.id)
      if (!error && data) {
        // Verificar si tiene algún pedido pendiente (no entregado)
        const hasPendingOrder = data.some(order => 
          order.status === 'pending' || 
          order.status === 'preparing' || 
          order.status === 'ready'
        )
        setHasOrderToday(hasPendingOrder)
        
        if (hasPendingOrder) {
          console.log('Usuario ya tiene un pedido pendiente:', data.filter(o => 
            o.status === 'pending' || o.status === 'preparing' || o.status === 'ready'
          ))
        }
      }
    } catch (err) {
      console.error('Error checking today order:', err)
    }
  }

  const fetchMenuItems = async () => {
    try {
      const { data, error } = await db.getMenuItems()

      if (error) {
        console.error('Error fetching menu:', error)
        // Set default menu items if none exist
        setMenuItems([
          { id: 1, name: 'Plato Principal 1', description: 'Delicioso plato principal' },
          { id: 2, name: 'Plato Principal 2', description: 'Otro plato delicioso' },
          { id: 3, name: 'Plato Principal 3', description: 'Plato especial del día' },
          { id: 4, name: 'Plato Principal 4', description: 'Plato vegetariano' },
          { id: 5, name: 'Plato Principal 5', description: 'Plato de la casa' },
          { id: 6, name: 'Plato Principal 6', description: 'Plato recomendado' }
        ])
      } else {
        setMenuItems(data || [])
      }
    } catch (err) {
      console.error('Error:', err)
    }
  }

  const handleItemSelect = (itemId, quantity) => {
    const item = menuItems.find(m => m.id === itemId)
    const isEnsalada = item?.name?.toLowerCase().includes('ensalada')
    
    // Limitar ensaladas a 1 unidad máxima
    if (isEnsalada && quantity > 1) {
      alert('Solo puedes seleccionar 1 ensalada')
      return
    }
    
    // Contar cuántos menús principales ya están seleccionados (sin ensaladas)
    const mainMenuCount = menuItems
      .filter(m => !m.name?.toLowerCase().includes('ensalada'))
      .reduce((count, m) => count + (selectedItems[m.id] || 0), 0)
    
    // Si intentamos agregar un menú principal y ya hay uno seleccionado
    if (!isEnsalada && quantity > 0 && mainMenuCount >= 1 && !selectedItems[itemId]) {
      alert('Solo puedes seleccionar 1 menú principal por persona. Si necesitas más, haz múltiples pedidos.')
      return
    }
    
    // Si ya tiene un menú principal seleccionado, no puede cambiar la cantidad a más de 1
    if (!isEnsalada && quantity > 1) {
      alert('Solo puedes seleccionar 1 unidad del menú principal')
      return
    }
    
    setSelectedItems(prev => ({
      ...prev,
      [itemId]: Math.max(0, quantity)
    }))
  }

  const handleFormChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const getSelectedItemsList = () => {
    return menuItems.filter(item => selectedItems[item.id] > 0)
  }

  const calculateTotal = () => {
    return getSelectedItemsList().reduce((total, item) => {
      return total + (selectedItems[item.id] || 0)
    }, 0)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Verificar si ya tiene un pedido pendiente
    if (hasOrderToday) {
      setError('Ya tienes un pedido pendiente. Espera a que se complete para crear uno nuevo.')
      setLoading(false)
      return
    }

    const selectedItemsList = getSelectedItemsList()

    if (!formData.location) {
      setError('Por favor selecciona un lugar de trabajo')
      setLoading(false)
      return
    }

    if (selectedItemsList.length === 0) {
      setError('Por favor selecciona al menos un plato del menú')
      setLoading(false)
      return
    }

    try {
      const orderData = {
        user_id: user.id,
        location: formData.location,
        customer_name: formData.name,
        customer_email: formData.email,
        customer_phone: formData.phone,
        items: selectedItemsList.map(item => ({
          id: item.id,
          name: item.name,
          quantity: selectedItems[item.id]
        })),
        comments: formData.comments,
        delivery_date: formData.deliveryDate,
        status: 'pending',
        total_items: calculateTotal()
      }

      const { error } = await db.createOrder(orderData)

      if (error) {
        // Verificar si es error de política de base de datos
        if (error.message.includes('violates row-level security policy') || 
            error.message.includes('new row violates row-level security')) {
          setError('Ya tienes un pedido pendiente. Espera a que se complete para crear uno nuevo.')
        } else {
          setError('Error al crear el pedido: ' + error.message)
        }
      } else {
        setSuccess(true)
        setTimeout(() => {
          navigate('/')
        }, 2000)
      }
    } catch (err) {
      setError('Error al crear el pedido')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="p-3 sm:p-6 flex items-center justify-center min-h-screen">
        <div className="max-w-2xl mx-auto text-center px-4">
          <div className="bg-white/95 backdrop-blur-sm border-2 border-green-300 rounded-2xl p-6 sm:p-8 shadow-2xl">
            <div className="flex justify-center mb-3 sm:mb-4">
              <div className="p-3 sm:p-4 rounded-full bg-green-100">
                <ChefHat className="h-10 w-10 sm:h-12 sm:w-12 text-green-600" />
              </div>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-green-900 mb-2">¡Pedido creado exitosamente!</h2>
            <p className="text-base sm:text-lg text-green-700">Tu pedido ha sido registrado y será procesado pronto.</p>
            <p className="text-xs sm:text-sm text-green-600 mt-2">Redirigiendo al dashboard...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-3 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8">
        <div className="text-center">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white drop-shadow-2xl mb-2 sm:mb-3">Nuevo Pedido</h1>
        <p className="text-lg sm:text-xl md:text-2xl text-white font-semibold drop-shadow-lg">Selecciona tu menú y completa tus datos</p>
        <p className="text-base sm:text-lg text-white/90 mt-1 sm:mt-2">¡Es rápido y fácil!</p>
      </div>

      {hasOrderToday && (
        <div className="bg-yellow-50 border-2 border-yellow-400 rounded-xl p-4 sm:p-6 shadow-lg">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 bg-yellow-100 rounded-full p-2">
              <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-yellow-900 mb-1">Ya tienes un pedido pendiente</h3>
              <p className="text-yellow-800">Solo puedes tener un pedido activo a la vez. Espera a que tu pedido actual sea entregado para crear uno nuevo, o elimínalo desde el Dashboard.</p>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8">
        {/* Información Personal */}
        <div className="card bg-white/95 backdrop-blur-sm shadow-xl border-2 border-white/20">
          <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
            <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white p-2 sm:p-3 rounded-xl">
              <User className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Información Personal</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Lugar de trabajo *
              </label>
              <select
                name="location"
                value={formData.location}
                onChange={handleFormChange}
                className="input-field"
                required
              >
                <option value="">Seleccionar lugar</option>
                {locations.map(location => (
                  <option key={location} value={location}>{location}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nombre completo *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleFormChange}
                className="input-field"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Correo electrónico *
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleFormChange}
                className="input-field"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Teléfono
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleFormChange}
                className="input-field"
              />
            </div>
          </div>
        </div>

        {/* Selección de Menú */}
        <div className="card bg-white/95 backdrop-blur-sm shadow-xl border-2 border-white/20">
          <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
            <div className="bg-gradient-to-r from-secondary-500 to-secondary-600 text-white p-2 sm:p-3 rounded-xl">
              <ChefHat className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Selecciona tu Menú</h2>
              <p className="text-xs sm:text-sm text-gray-600 font-medium mt-1">Elige uno o más platos disponibles</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {menuItems.map((item) => (
              <div key={item.id} className="border-2 border-gray-200 rounded-xl p-4 sm:p-5 hover:border-primary-400 hover:shadow-lg transition-all bg-gradient-to-br from-white to-gray-50">
                <div className="flex justify-between items-start mb-2 sm:mb-3">
                  <div className="flex-1">
                    <h3 className="font-bold text-base sm:text-lg text-gray-900">{item.name}</h3>
                    {item.description && (
                      <p className="text-xs sm:text-sm text-gray-600 mt-1">{item.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between bg-gray-100 rounded-lg p-2">
                  <span className="text-xs font-semibold text-gray-600">CANTIDAD:</span>
                  <div className="flex items-center space-x-2 sm:space-x-3">
                    <button
                      type="button"
                      onClick={() => handleItemSelect(item.id, (selectedItems[item.id] || 0) - 1)}
                      className="p-1.5 sm:p-2 rounded-full bg-red-500 hover:bg-red-600 text-white transition-colors shadow"
                    >
                      <Minus className="h-3 w-3 sm:h-4 sm:w-4" />
                    </button>
                    <span className="w-8 sm:w-10 text-center font-bold text-lg sm:text-xl text-gray-900">
                      {selectedItems[item.id] || 0}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleItemSelect(item.id, (selectedItems[item.id] || 0) + 1)}
                      className="p-1.5 sm:p-2 rounded-full bg-green-500 hover:bg-green-600 text-white transition-colors shadow"
                    >
                      <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Resumen del Pedido */}
        {getSelectedItemsList().length > 0 && (
          <div className="card bg-gradient-to-br from-green-50 to-emerald-50 backdrop-blur-sm shadow-xl border-2 border-green-300">
            <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
              <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white p-2 sm:p-3 rounded-xl">
                <ShoppingCart className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Resumen del Pedido</h2>
                <p className="text-xs sm:text-sm text-gray-700 font-semibold mt-1">Revisa tu selección antes de confirmar</p>
              </div>
            </div>

            <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-6">
              {getSelectedItemsList().map((item) => (
                <div key={item.id} className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 py-2 border-b border-gray-100">
                  <div className="flex items-center justify-between sm:justify-start">
                    <span className="font-medium text-gray-900 text-sm sm:text-base">{item.name}</span>
                    <button
                      type="button"
                      onClick={() => handleItemSelect(item.id, 0)}
                      className="ml-2 p-1 rounded-full hover:bg-red-100 text-red-600"
                    >
                      <X className="h-3 w-3 sm:h-4 sm:w-4" />
                    </button>
                  </div>
                  <span className="text-gray-600 text-sm sm:text-base">Cantidad: {selectedItems[item.id]}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-200 pt-3 sm:pt-4">
              <div className="flex justify-between items-center text-base sm:text-lg font-semibold">
                <span>Total de items:</span>
                <span>{calculateTotal()}</span>
              </div>
            </div>
          </div>
        )}

        {/* Información Adicional */}
        <div className="card">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4 sm:mb-6">Información Adicional</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fecha de entrega
              </label>
              <input
                type="date"
                name="deliveryDate"
                value={formData.deliveryDate}
                onChange={handleFormChange}
                className="input-field"
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>

          <div className="mt-4 sm:mt-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Comentarios adicionales
            </label>
            <textarea
              name="comments"
              value={formData.comments}
              onChange={handleFormChange}
              rows={4}
              className="input-field"
              placeholder="Instrucciones especiales, alergias, etc."
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 sm:px-4 py-2 sm:py-3 rounded-lg text-sm sm:text-base">
            {error}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading || getSelectedItemsList().length === 0 || hasOrderToday}
            className="btn-primary flex items-center disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base px-4 sm:px-6 py-2 sm:py-3"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-3 w-3 sm:h-4 sm:w-4 border-b-2 border-white mr-2"></div>
                Creando pedido...
              </>
            ) : hasOrderToday ? (
              'Ya tienes un pedido pendiente'
            ) : (
              <>
                <ShoppingCart className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                Crear Pedido
              </>
            )}
          </button>
        </div>
      </form>
      </div>
    </div>
  )
}

export default OrderForm

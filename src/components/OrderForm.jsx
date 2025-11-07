import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../supabaseClient'
import { ShoppingCart, Plus, Minus, X, ChefHat } from 'lucide-react'

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
  const navigate = useNavigate()

  const locations = ['Los Berros', 'La Laja', 'Padre Bueno']

  useEffect(() => {
    fetchMenuItems()
    // Pre-fill user data
    setFormData(prev => ({
      ...prev,
      name: user?.user_metadata?.full_name || '',
      email: user?.email || ''
    }))
  }, [user])

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
        setError('Error al crear el pedido: ' + error.message)
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
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="bg-green-50 border border-green-200 rounded-lg p-8">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-green-100">
              <ChefHat className="h-8 w-8 text-green-600" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-green-900 mb-2">¡Pedido creado exitosamente!</h2>
          <p className="text-green-700">Tu pedido ha sido registrado y será procesado pronto.</p>
          <p className="text-sm text-green-600 mt-2">Redirigiendo al dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900">Nuevo Pedido</h1>
        <p className="mt-2 text-gray-600">Selecciona tu comida y completa la información</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Información Personal */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Información Personal</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Selección de Menú</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {menuItems.map((item) => (
              <div key={item.id} className="border border-gray-200 rounded-lg p-4 hover:border-primary-300 transition-colors">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900">{item.name}</h3>
                    {item.description && (
                      <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => handleItemSelect(item.id, (selectedItems[item.id] || 0) - 1)}
                      className="p-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-8 text-center font-medium">
                      {selectedItems[item.id] || 0}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleItemSelect(item.id, (selectedItems[item.id] || 0) + 1)}
                      className="p-1 rounded-full bg-primary-100 hover:bg-primary-200 text-primary-600"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Resumen del Pedido */}
        {getSelectedItemsList().length > 0 && (
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Resumen del Pedido</h2>

            <div className="space-y-3 mb-6">
              {getSelectedItemsList().map((item) => (
                <div key={item.id} className="flex justify-between items-center py-2 border-b border-gray-100">
                  <div className="flex items-center">
                    <span className="font-medium text-gray-900">{item.name}</span>
                    <button
                      type="button"
                      onClick={() => handleItemSelect(item.id, 0)}
                      className="ml-2 p-1 rounded-full hover:bg-red-100 text-red-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <span className="text-gray-600">Cantidad: {selectedItems[item.id]}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-200 pt-4">
              <div className="flex justify-between items-center text-lg font-semibold">
                <span>Total de items:</span>
                <span>{calculateTotal()}</span>
              </div>
            </div>
          </div>
        )}

        {/* Información Adicional */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Información Adicional</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

          <div className="mt-6">
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
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading || getSelectedItemsList().length === 0}
            className="btn-primary flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Creando pedido...
              </>
            ) : (
              <>
                <ShoppingCart className="h-5 w-5 mr-2" />
                Crear Pedido
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

export default OrderForm

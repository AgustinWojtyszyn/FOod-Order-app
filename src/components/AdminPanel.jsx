import { useState, useEffect } from 'react'
import { db } from '../supabaseClient'
import { Users, ChefHat, Edit3, Save, X, Plus, Trash2, Settings, ArrowUp, ArrowDown } from 'lucide-react'

const AdminPanel = () => {
  const [activeTab, setActiveTab] = useState('users')
  const [users, setUsers] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [customOptions, setCustomOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingMenu, setEditingMenu] = useState(false)
  const [newMenuItems, setNewMenuItems] = useState([])
  const [editingOptions, setEditingOptions] = useState(false)
  const [newOption, setNewOption] = useState(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [usersResult, menuResult, optionsResult] = await Promise.all([
        db.getUsers(),
        db.getMenuItems(),
        db.getCustomOptions()
      ])

      if (usersResult.error) {
        console.error('Error fetching users:', usersResult.error)
      } else {
        setUsers(usersResult.data || [])
      }

      if (menuResult.error) {
        console.error('Error fetching menu:', menuResult.error)
        // Set default menu items
        setNewMenuItems([
          { name: 'Plato Principal 1', description: 'Delicioso plato principal' },
          { name: 'Plato Principal 2', description: 'Otro plato delicioso' },
          { name: 'Ensalada César', description: 'Fresca ensalada' }
        ])
      } else {
        setMenuItems(menuResult.data || [])
        if (menuResult.data && menuResult.data.length > 0) {
          setNewMenuItems(menuResult.data.map(item => ({
            id: item.id,
            name: item.name,
            description: item.description || ''
          })))
        } else {
          // Menú por defecto si no hay items
          setNewMenuItems([
            { name: 'Plato Principal 1', description: 'Delicioso plato principal' },
            { name: 'Plato Principal 2', description: 'Otro plato delicioso' },
            { name: 'Ensalada César', description: 'Fresca ensalada' }
          ])
        }
      }

      if (optionsResult.error) {
        console.error('Error fetching custom options:', optionsResult.error)
      } else {
        setCustomOptions(optionsResult.data || [])
      }
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleRoleChange = async (userId, newRole) => {
    try {
      const { error } = await db.updateUserRole(userId, newRole)
      if (error) {
        console.error('Error updating role:', error)
        alert('Error al actualizar el rol del usuario: ' + error.message)
      } else {
        // Refrescar datos para obtener el cambio actualizado
        await fetchData()
        alert('Rol actualizado exitosamente')
      }
    } catch (err) {
      console.error('Error:', err)
      alert('Error al actualizar el rol')
    }
  }

  const handleDeleteUser = async (userId, userName) => {
    const confirmed = window.confirm(
      `¿Estás seguro de que deseas eliminar al usuario "${userName}"?\n\n` +
      'Esta acción eliminará:\n' +
      '- El usuario de la base de datos\n' +
      '- Todos los pedidos asociados\n\n' +
      'Esta acción NO se puede deshacer.'
    )

    if (!confirmed) return

    try {
      const { error } = await db.deleteUser(userId)
      
      if (error) {
        console.error('Error deleting user:', error)
        alert('Error al eliminar el usuario: ' + error.message)
      } else {
        // Update local state
        setUsers(users.filter(user => user.id !== userId))
        alert('Usuario eliminado exitosamente')
      }
    } catch (err) {
      console.error('Error:', err)
      alert('Error al eliminar el usuario')
    }
  }

  const handleMenuUpdate = async () => {
    try {
      // Filter out empty items
      const validItems = newMenuItems.filter(item => item.name.trim() !== '')

      if (validItems.length === 0) {
        alert('Debe haber al menos un plato en el menú')
        return
      }

      const { error } = await db.updateMenuItems(validItems)

      if (error) {
        console.error('Error updating menu:', error)
        alert('Error al actualizar el menú')
      } else {
        setEditingMenu(false)
        alert('Menú actualizado exitosamente')
        fetchData() // Refresh data
      }
    } catch (err) {
      console.error('Error:', err)
      alert('Error al actualizar el menú')
    }
  }

  const handleMenuItemChange = (index, field, value) => {
    const updatedItems = [...newMenuItems]
    updatedItems[index] = { ...updatedItems[index], [field]: value }
    setNewMenuItems(updatedItems)
  }

  const addMenuItem = () => {
    setNewMenuItems([...newMenuItems, { name: '', description: '' }])
  }

  const removeMenuItem = (index) => {
    if (newMenuItems.length <= 1) {
      alert('Debe haber al menos un plato en el menú')
      return
    }
    const updatedItems = newMenuItems.filter((_, i) => i !== index)
    setNewMenuItems(updatedItems)
  }

  // Funciones para opciones personalizadas
  const handleCreateOption = () => {
    setNewOption({
      title: '',
      type: 'multiple_choice',
      options: [''],
      required: false,
      active: true
    })
    setEditingOptions(true)
  }

  const handleSaveOption = async () => {
    if (!newOption.title.trim()) {
      alert('El título es requerido')
      return
    }

    if ((newOption.type === 'multiple_choice' || newOption.type === 'checkbox') && 
        newOption.options.filter(opt => opt.trim()).length === 0) {
      alert('Debes agregar al menos una opción')
      return
    }

    try {
      const optionData = {
        ...newOption,
        options: (newOption.type === 'multiple_choice' || newOption.type === 'checkbox') 
          ? newOption.options.filter(opt => opt.trim()) 
          : null,
        order_position: customOptions.length
      }

      const { error } = await db.createCustomOption(optionData)
      
      if (error) {
        alert('Error al crear la opción: ' + error.message)
      } else {
        setNewOption(null)
        setEditingOptions(false)
        fetchData()
        alert('Opción creada exitosamente')
      }
    } catch (err) {
      console.error('Error:', err)
      alert('Error al crear la opción')
    }
  }

  const handleDeleteOption = async (optionId) => {
    if (!confirm('¿Estás seguro de eliminar esta opción?')) return

    try {
      const { error } = await db.deleteCustomOption(optionId)
      if (error) {
        alert('Error al eliminar la opción')
      } else {
        fetchData()
        alert('Opción eliminada exitosamente')
      }
    } catch (err) {
      console.error('Error:', err)
      alert('Error al eliminar la opción')
    }
  }

  const handleToggleOption = async (optionId, currentState) => {
    try {
      const { error } = await db.updateCustomOption(optionId, { active: !currentState })
      if (error) {
        alert('Error al actualizar la opción')
      } else {
        fetchData()
      }
    } catch (err) {
      console.error('Error:', err)
      alert('Error al actualizar la opción')
    }
  }

  const handleMoveOption = async (index, direction) => {
    const newOptions = [...customOptions]
    const targetIndex = direction === 'up' ? index - 1 : index + 1

    if (targetIndex < 0 || targetIndex >= newOptions.length) return

    // Intercambiar
    [newOptions[index], newOptions[targetIndex]] = [newOptions[targetIndex], newOptions[index]]

    try {
      await db.updateCustomOptionsOrder(newOptions)
      fetchData()
    } catch (err) {
      console.error('Error:', err)
      alert('Error al reordenar')
    }
  }

  const handleOptionFieldChange = (field, value) => {
    setNewOption(prev => ({ ...prev, [field]: value }))
  }

  const handleAddOptionChoice = () => {
    setNewOption(prev => ({
      ...prev,
      options: [...(prev.options || []), '']
    }))
  }

  const handleRemoveOptionChoice = (index) => {
    setNewOption(prev => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index)
    }))
  }

  const handleOptionChoiceChange = (index, value) => {
    setNewOption(prev => ({
      ...prev,
      options: prev.options.map((opt, i) => i === index ? value : opt)
    }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="p-3 sm:p-6 space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white drop-shadow-2xl mb-2">Panel de Administración</h1>
        <p className="text-base sm:text-lg md:text-xl text-white/90 drop-shadow-lg mt-2">Gestiona usuarios y el menú de opciones</p>
      </div>

      {/* Tabs */}
      <div className="border-b-2 border-white/30">
        <nav className="-mb-0.5 flex space-x-4 sm:space-x-8 overflow-x-auto">
          <button
            onClick={() => setActiveTab('users')}
            className={`py-2 sm:py-3 px-1 border-b-4 font-bold text-sm sm:text-base transition-colors whitespace-nowrap ${
              activeTab === 'users'
                ? 'border-secondary-500 text-white drop-shadow'
                : 'border-transparent text-white/70 hover:text-white hover:border-white/50'
            }`}
          >
            <Users className="h-4 w-4 sm:h-5 sm:w-5 inline mr-1 sm:mr-2" />
            Usuarios
          </button>
          <button
            onClick={() => setActiveTab('menu')}
            className={`py-2 sm:py-3 px-1 border-b-4 font-bold text-sm sm:text-base transition-colors whitespace-nowrap ${
              activeTab === 'menu'
                ? 'border-secondary-500 text-white drop-shadow'
                : 'border-transparent text-white/70 hover:text-white hover:border-white/50'
            }`}
          >
            <ChefHat className="h-4 w-4 sm:h-5 sm:w-5 inline mr-1 sm:mr-2" />
            Menú
          </button>
          <button
            onClick={() => setActiveTab('options')}
            className={`py-2 sm:py-3 px-1 border-b-4 font-bold text-sm sm:text-base transition-colors whitespace-nowrap ${
              activeTab === 'options'
                ? 'border-secondary-500 text-white drop-shadow'
                : 'border-transparent text-white/70 hover:text-white hover:border-white/50'
            }`}
          >
            <Settings className="h-4 w-4 sm:h-5 sm:w-5 inline mr-1 sm:mr-2" />
            Opciones
          </button>
        </nav>
      </div>

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="card bg-white/95 backdrop-blur-sm shadow-xl border-2 border-white/20">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 sm:mb-6 drop-shadow">👥 Gestión de Usuarios</h2>

          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gradient-to-r from-primary-600 to-primary-700">
                <tr>
                  <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
                    Usuario
                  </th>
                  <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
                    Rol
                  </th>
                  <th className="hidden md:table-cell px-3 sm:px-6 py-3 sm:py-4 text-left text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
                    Fecha de Registro
                  </th>
                  <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                      <div className="text-sm sm:text-base font-bold text-gray-900">
                        {user.full_name || user.email || 'Sin nombre'}
                      </div>
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                      <div className="text-xs sm:text-base text-gray-900 truncate max-w-[120px] sm:max-w-none">{user.email}</div>
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 sm:px-3 py-1 text-xs sm:text-sm font-bold rounded-full ${
                        user.role === 'admin'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {user.role === 'admin' ? 'Admin' : 'Usuario'}
                      </span>
                    </td>
                    <td className="hidden md:table-cell px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-500">
                      {new Date(user.created_at).toLocaleDateString('es-ES')}
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm font-medium">
                      <div className="flex items-center gap-2">
                        <select
                          value={user.role || 'user'}
                          onChange={(e) => handleRoleChange(user.id, e.target.value)}
                          className="text-xs sm:text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                          <option value="user">Usuario</option>
                          <option value="admin">Admin</option>
                        </select>
                        <button
                          onClick={() => handleDeleteUser(user.id, user.full_name || user.email)}
                          className="p-1.5 sm:p-2 rounded-lg bg-red-100 hover:bg-red-200 text-red-600 hover:text-red-700 transition-colors"
                          title="Eliminar usuario"
                        >
                          <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Menu Tab */}
      {activeTab === 'menu' && (
        <div className="card bg-white/95 backdrop-blur-sm shadow-xl border-2 border-white/20">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mb-4 sm:mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Gestión del Menú</h2>
            {!editingMenu ? (
              <button
                onClick={() => setEditingMenu(true)}
                className="btn-primary flex items-center justify-center text-sm sm:text-base"
              >
                <Edit3 className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                Editar Menú
              </button>
            ) : (
              <div className="flex space-x-2">
                <button
                  onClick={handleMenuUpdate}
                  className="btn-primary flex items-center text-sm sm:text-base px-3 sm:px-4 py-2"
                >
                  <Save className="h-4 w-4 sm:h-5 sm:w-5 mr-1 sm:mr-2" />
                  Guardar
                </button>
                <button
                  onClick={() => {
                    setEditingMenu(false)
                    fetchData() // Reset changes
                  }}
                  className="btn-secondary flex items-center text-sm sm:text-base px-3 sm:px-4 py-2"
                >
                  <X className="h-4 w-4 sm:h-5 sm:w-5 mr-1 sm:mr-2" />
                  Cancelar
                </button>
              </div>
            )}
          </div>

          {!editingMenu ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {menuItems.map((item, index) => (
                <div key={item.id || index} className="border border-gray-200 rounded-lg p-3 sm:p-4">
                  <h3 className="font-medium text-gray-900 mb-2 text-sm sm:text-base">{item.name}</h3>
                  {item.description && (
                    <p className="text-xs sm:text-sm text-gray-600">{item.description}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3 sm:space-y-4">
              <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-3 sm:p-4 mb-4 sm:mb-6">
                <p className="text-blue-800 font-semibold text-center text-sm sm:text-base">
                  Puedes agregar, editar o eliminar opciones del menú. Debe haber al menos un plato.
                </p>
              </div>
              
              {newMenuItems.map((item, index) => (
                <div key={index} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:space-x-4 p-3 sm:p-4 border-2 border-gray-200 rounded-xl bg-white">
                  <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold text-sm sm:text-base">
                    {index + 1}
                  </div>
                  <div className="flex-1 grid grid-cols-1 gap-3 sm:gap-4">
                    <input
                      type="text"
                      placeholder="Nombre del plato"
                      value={item.name}
                      onChange={(e) => handleMenuItemChange(index, 'name', e.target.value)}
                      className="input-field font-semibold text-sm sm:text-base"
                      required
                    />
                    <input
                      type="text"
                      placeholder="Descripción (opcional)"
                      value={item.description}
                      onChange={(e) => handleMenuItemChange(index, 'description', e.target.value)}
                      className="input-field text-sm sm:text-base"
                    />
                  </div>
                  <button
                    onClick={() => removeMenuItem(index)}
                    className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors flex-shrink-0 self-end sm:self-auto"
                    title="Eliminar plato"
                  >
                    <Trash2 className="h-4 w-4 sm:h-5 sm:w-5" />
                  </button>
                </div>
              ))}
              
              <button
                onClick={addMenuItem}
                className="w-full flex items-center justify-center gap-2 p-3 sm:p-4 border-2 border-dashed border-primary-300 rounded-xl text-primary-600 hover:bg-primary-50 hover:border-primary-500 transition-all font-semibold text-sm sm:text-base"
              >
                <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
                Agregar nuevo plato
              </button>
            </div>
          )}
        </div>
      )}

      {/* Custom Options Tab */}
      {activeTab === 'options' && (
        <div className="card bg-white/95 backdrop-blur-sm shadow-xl border-2 border-white/20">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mb-4 sm:mb-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Opciones Personalizables</h2>
              <p className="text-sm text-gray-600 mt-1">Agrega preguntas, encuestas u opciones adicionales para los pedidos</p>
            </div>
            {!editingOptions && (
              <button
                onClick={handleCreateOption}
                className="btn-primary flex items-center justify-center text-sm sm:text-base"
              >
                <Plus className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                Nueva Opción
              </button>
            )}
          </div>

          {/* Lista de opciones existentes */}
          {!editingOptions && customOptions.length > 0 && (
            <div className="space-y-3 mb-6">
              {customOptions.map((option, index) => (
                <div key={option.id} className="border-2 border-gray-200 rounded-xl p-4 bg-white hover:border-primary-300 transition-all">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-bold text-lg text-gray-900">{option.title}</h3>
                        <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                          option.type === 'multiple_choice' ? 'bg-blue-100 text-blue-800' :
                          option.type === 'checkbox' ? 'bg-purple-100 text-purple-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {option.type === 'multiple_choice' ? 'Opción Múltiple' :
                           option.type === 'checkbox' ? 'Casillas' : 'Texto'}
                        </span>
                        {option.required && (
                          <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-800 font-semibold">
                            Requerido
                          </span>
                        )}
                        <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                          option.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {option.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                      
                      {(option.type === 'multiple_choice' || option.type === 'checkbox') && option.options && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {option.options.map((opt, i) => (
                            <span key={i} className="text-sm px-3 py-1 bg-gray-100 rounded-full text-gray-700">
                              {opt}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {/* Botones de orden */}
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => handleMoveOption(index, 'up')}
                          disabled={index === 0}
                          className="p-1 text-gray-600 hover:bg-gray-100 rounded disabled:opacity-30"
                          title="Subir"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleMoveOption(index, 'down')}
                          disabled={index === customOptions.length - 1}
                          className="p-1 text-gray-600 hover:bg-gray-100 rounded disabled:opacity-30"
                          title="Bajar"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                      </div>
                      
                      {/* Toggle activo/inactivo */}
                      <button
                        onClick={() => handleToggleOption(option.id, option.active)}
                        className={`px-3 py-1 rounded-lg text-sm font-semibold transition-colors ${
                          option.active 
                            ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {option.active ? 'Desactivar' : 'Activar'}
                      </button>
                      
                      {/* Eliminar */}
                      <button
                        onClick={() => handleDeleteOption(option.id)}
                        className="p-2 rounded-lg bg-red-100 hover:bg-red-200 text-red-600"
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {customOptions.length === 0 && !editingOptions && (
            <div className="text-center py-12">
              <Settings className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">No hay opciones personalizadas</h3>
              <p className="text-gray-600 mb-6">Crea opciones adicionales para tus pedidos</p>
            </div>
          )}

          {/* Formulario para nueva opción */}
          {editingOptions && newOption && (
            <div className="border-2 border-primary-300 rounded-xl p-6 bg-primary-50">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900">Nueva Opción Personalizable</h3>
                <button
                  onClick={() => {
                    setEditingOptions(false)
                    setNewOption(null)
                  }}
                  className="p-2 hover:bg-red-100 rounded-lg text-red-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Título */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Título/Pregunta *
                  </label>
                  <input
                    type="text"
                    value={newOption.title}
                    onChange={(e) => handleOptionFieldChange('title', e.target.value)}
                    className="input-field"
                    placeholder="Ej: ¿Prefieres alguna bebida?"
                  />
                </div>

                {/* Tipo */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tipo de Respuesta *
                  </label>
                  <select
                    value={newOption.type}
                    onChange={(e) => handleOptionFieldChange('type', e.target.value)}
                    className="input-field"
                  >
                    <option value="multiple_choice">Opción Múltiple (una respuesta)</option>
                    <option value="checkbox">Casillas (múltiples respuestas)</option>
                    <option value="text">Texto Libre</option>
                  </select>
                </div>

                {/* Opciones (solo para multiple_choice y checkbox) */}
                {(newOption.type === 'multiple_choice' || newOption.type === 'checkbox') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Opciones de Respuesta
                    </label>
                    <div className="space-y-2">
                      {newOption.options.map((opt, index) => (
                        <div key={index} className="flex gap-2">
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => handleOptionChoiceChange(index, e.target.value)}
                            className="input-field flex-1"
                            placeholder={`Opción ${index + 1}`}
                          />
                          {newOption.options.length > 1 && (
                            <button
                              onClick={() => handleRemoveOptionChoice(index)}
                              className="p-2 text-red-600 hover:bg-red-100 rounded-lg"
                            >
                              <X className="h-5 w-5" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={handleAddOptionChoice}
                        className="w-full flex items-center justify-center gap-2 p-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-all"
                      >
                        <Plus className="h-4 w-4" />
                        Agregar opción
                      </button>
                    </div>
                  </div>
                )}

                {/* Requerido */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="required"
                    checked={newOption.required}
                    onChange={(e) => handleOptionFieldChange('required', e.target.checked)}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <label htmlFor="required" className="text-sm font-medium text-gray-700">
                    Campo requerido
                  </label>
                </div>

                {/* Botones */}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleSaveOption}
                    className="btn-primary flex-1 flex items-center justify-center"
                  >
                    <Save className="h-5 w-5 mr-2" />
                    Guardar Opción
                  </button>
                  <button
                    onClick={() => {
                      setEditingOptions(false)
                      setNewOption(null)
                    }}
                    className="btn-secondary flex-1"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default AdminPanel

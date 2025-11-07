import { useState, useEffect } from 'react'
import { db } from '../supabaseClient'
import { Users, ChefHat, Edit3, Save, X, Plus, Trash2 } from 'lucide-react'

const AdminPanel = () => {
  const [activeTab, setActiveTab] = useState('users')
  const [users, setUsers] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingMenu, setEditingMenu] = useState(false)
  const [newMenuItems, setNewMenuItems] = useState([
    { name: '', description: '' },
    { name: '', description: '' },
    { name: '', description: '' },
    { name: '', description: '' },
    { name: '', description: '' },
    { name: '', description: '' }
  ])

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [usersResult, menuResult] = await Promise.all([
        db.getUsers(),
        db.getMenuItems()
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
          { name: 'Plato Principal 3', description: 'Plato especial del día' },
          { name: 'Plato Principal 4', description: 'Plato vegetariano' },
          { name: 'Plato Principal 5', description: 'Plato de la casa' },
          { name: 'Plato Principal 6', description: 'Plato recomendado' }
        ])
      } else {
        setMenuItems(menuResult.data || [])
        if (menuResult.data && menuResult.data.length > 0) {
          setNewMenuItems(menuResult.data.map(item => ({
            name: item.name,
            description: item.description || ''
          })))
        }
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
        alert('Error al actualizar el rol del usuario')
      } else {
        // Update local state
        setUsers(users.map(user =>
          user.id === userId ? { ...user, role: newRole } : user
        ))
        alert('Rol actualizado exitosamente')
      }
    } catch (err) {
      console.error('Error:', err)
      alert('Error al actualizar el rol')
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
    if (newMenuItems.length > 1) {
      setNewMenuItems(newMenuItems.filter((_, i) => i !== index))
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
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Panel de Administración</h1>
        <p className="mt-2 text-gray-600">Gestiona usuarios y menú del sistema</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('users')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'users'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Users className="h-5 w-5 inline mr-2" />
            Usuarios
          </button>
          <button
            onClick={() => setActiveTab('menu')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'menu'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <ChefHat className="h-5 w-5 inline mr-2" />
            Menú
          </button>
        </nav>
      </div>

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Gestión de Usuarios</h2>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Usuario
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rol
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha de Registro
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {user.user_metadata?.full_name || 'Sin nombre'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{user.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        user.user_metadata?.role === 'admin'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {user.user_metadata?.role === 'admin' ? 'Admin' : 'Usuario'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(user.created_at).toLocaleDateString('es-ES')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <select
                        value={user.user_metadata?.role || 'user'}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        className="text-sm border border-gray-300 rounded px-2 py-1"
                      >
                        <option value="user">Usuario</option>
                        <option value="admin">Admin</option>
                      </select>
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
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Gestión del Menú</h2>
            {!editingMenu ? (
              <button
                onClick={() => setEditingMenu(true)}
                className="btn-primary flex items-center"
              >
                <Edit3 className="h-5 w-5 mr-2" />
                Editar Menú
              </button>
            ) : (
              <div className="flex space-x-2">
                <button
                  onClick={handleMenuUpdate}
                  className="btn-primary flex items-center"
                >
                  <Save className="h-5 w-5 mr-2" />
                  Guardar
                </button>
                <button
                  onClick={() => {
                    setEditingMenu(false)
                    fetchData() // Reset changes
                  }}
                  className="btn-secondary flex items-center"
                >
                  <X className="h-5 w-5 mr-2" />
                  Cancelar
                </button>
              </div>
            )}
          </div>

          {!editingMenu ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {menuItems.map((item, index) => (
                <div key={item.id || index} className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-medium text-gray-900 mb-2">{item.name}</h3>
                  {item.description && (
                    <p className="text-sm text-gray-600">{item.description}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {newMenuItems.map((item, index) => (
                <div key={index} className="flex items-center space-x-4 p-4 border border-gray-200 rounded-lg">
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input
                      type="text"
                      placeholder="Nombre del plato"
                      value={item.name}
                      onChange={(e) => handleMenuItemChange(index, 'name', e.target.value)}
                      className="input-field"
                    />
                    <input
                      type="text"
                      placeholder="Descripción (opcional)"
                      value={item.description}
                      onChange={(e) => handleMenuItemChange(index, 'description', e.target.value)}
                      className="input-field"
                    />
                  </div>
                  <button
                    onClick={() => removeMenuItem(index)}
                    disabled={newMenuItems.length <= 1}
                    className="p-2 text-red-600 hover:bg-red-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              ))}

              <button
                onClick={addMenuItem}
                className="btn-secondary flex items-center w-full justify-center"
              >
                <Plus className="h-5 w-5 mr-2" />
                Agregar Plato
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default AdminPanel

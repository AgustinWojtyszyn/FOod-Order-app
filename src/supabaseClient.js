import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'your-supabase-url'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-supabase-anon-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Configuración de autenticación
export const auth = {
  signUp: async (email, password, metadata = {}) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
        emailRedirectTo: `${window.location.origin}/verify-email`
      }
    })
    return { data, error }
  },

  signIn: async (email, password, rememberMe = false) => {
    const { data, error} = await supabase.auth.signInWithPassword({
      email,
      password,
      options: {
        // Si rememberMe es true, la sesión persiste indefinidamente
        // Si es false, la sesión solo dura mientras el navegador esté abierto
        persistSession: true,
        ...(rememberMe && { storageOptions: { type: 'local' } })
      }
    })
    return { data, error }
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut()
    return { error }
  },

  resetPassword: async (email) => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    })
    return { data, error }
  },

  updatePassword: async (newPassword) => {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword
    })
    return { data, error }
  },

  updateProfile: async (updates) => {
    const { data, error } = await supabase.auth.updateUser({
      email: updates.email,
      data: {
        full_name: updates.full_name
      }
    })
    return { data, error }
  },

  getUser: async () => {
    const { data: { user }, error } = await supabase.auth.getUser()
    return { user, error }
  },

  onAuthStateChange: (callback) => {
    return supabase.auth.onAuthStateChange(callback)
  }
}

// Funciones de base de datos
export const db = {
  // Usuarios
  getUsers: async () => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })
    return { data, error }
  },

  updateUserRole: async (userId, role) => {
    const { data, error } = await supabase
      .from('users')
      .update({ role })
      .eq('id', userId)
    return { data, error }
  },

  deleteUser: async (userId) => {
    // Primero eliminar todos los pedidos del usuario
    const { error: ordersError } = await supabase
      .from('orders')
      .delete()
      .eq('user_id', userId)

    if (ordersError) return { error: ordersError }

    // Eliminar notificaciones del usuario (solo si la tabla existe)
    // Comentado temporalmente hasta que se cree la tabla notifications
    /*
    const { error: notificationsError } = await supabase
      .from('notifications')
      .delete()
      .eq('user_id', userId)

    if (notificationsError) return { error: notificationsError }
    */

    // Luego eliminar el usuario de auth usando Admin API
    // Nota: Esto requiere que tengas configurado el Service Role Key
    // Por ahora solo eliminamos de la tabla users
    const { data, error } = await supabase
      .from('users')
      .delete()
      .eq('id', userId)
    
    return { data, error }
  },

  deleteAllOrders: async () => {
    const { data, error } = await supabase
      .from('orders')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Eliminar todos
    return { data, error }
  },

  deleteAllNotifications: async () => {
    // Comentado temporalmente hasta que se cree la tabla notifications
    /*
    const { data, error } = await supabase
      .from('notifications')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Eliminar todos
    return { data, error }
    */
    // Retornar éxito sin hacer nada si la tabla no existe
    return { data: null, error: null }
  },

  // Pedidos
  createOrder: async (orderData) => {
    const { data, error } = await supabase
      .from('orders')
      .insert([orderData])
      .select()
    return { data, error }
  },

  getOrders: async (userId = null) => {
    let query = supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })

    if (userId) {
      query = query.eq('user_id', userId)
    }

    const { data, error } = await query
    return { data, error }
  },

  updateOrderStatus: async (orderId, status) => {
    const { data, error } = await supabase
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .select()
    return { data, error }
  },

  deleteOrder: async (orderId) => {
    const { data, error } = await supabase
      .from('orders')
      .delete()
      .eq('id', orderId)
    return { data, error }
  },

  // Menú
  getMenuItems: async () => {
    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
      .order('created_at', { ascending: false })
    return { data, error }
  },

  updateMenuItems: async (menuItems) => {
    try {
      // Obtener items existentes
      const { data: existingItems, error: fetchError } = await supabase
        .from('menu_items')
        .select('id')
      
      if (fetchError) {
        console.error('Error fetching existing items:', fetchError)
        return { error: fetchError }
      }

      const existingIds = existingItems?.map(item => item.id) || []
      const itemsToUpdate = menuItems.filter(item => item.id && existingIds.includes(item.id))
      const itemsToInsert = menuItems.filter(item => !item.id || !existingIds.includes(item.id))
      const idsToKeep = menuItems.filter(item => item.id).map(item => item.id)
      const itemsToDelete = existingIds.filter(id => !idsToKeep.includes(id))

      // Eliminar items que ya no están en la lista
      if (itemsToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('menu_items')
          .delete()
          .in('id', itemsToDelete)
        
        if (deleteError) {
          console.error('Error deleting items:', deleteError)
          return { error: deleteError }
        }
      }

      // Actualizar items existentes
      for (const item of itemsToUpdate) {
        const { error: updateError } = await supabase
          .from('menu_items')
          .update({
            name: item.name,
            description: item.description
          })
          .eq('id', item.id)
        
        if (updateError) {
          console.error('Error updating item:', updateError)
          return { error: updateError }
        }
      }

      // Insertar nuevos items
      if (itemsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('menu_items')
          .insert(itemsToInsert.map(item => ({
            name: item.name,
            description: item.description
          })))
        
        if (insertError) {
          console.error('Error inserting items:', insertError)
          return { error: insertError }
        }
      }

      // Obtener todos los items actualizados
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .order('created_at', { ascending: true })
      
      return { data, error }
    } catch (err) {
      console.error('Unexpected error in updateMenuItems:', err)
      return { error: err }
    }
  },

  // Opciones personalizables
  getCustomOptions: async () => {
    const { data, error } = await supabase
      .from('custom_options')
      .select('*')
      .eq('active', true)
      .order('order_position', { ascending: true })
    return { data, error }
  },

  createCustomOption: async (option) => {
    const { data, error } = await supabase
      .from('custom_options')
      .insert([option])
      .select()
    return { data, error }
  },

  updateCustomOption: async (id, updates) => {
    const { data, error } = await supabase
      .from('custom_options')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
    return { data, error }
  },

  deleteCustomOption: async (id) => {
    const { data, error } = await supabase
      .from('custom_options')
      .delete()
      .eq('id', id)
    return { data, error }
  },

  updateCustomOptionsOrder: async (options) => {
    // Actualizar el orden de múltiples opciones
    const promises = options.map((option, index) =>
      supabase
        .from('custom_options')
        .update({ order_position: index })
        .eq('id', option.id)
    )
    const results = await Promise.all(promises)
    const error = results.find(r => r.error)?.error
    return { error }
  }
}

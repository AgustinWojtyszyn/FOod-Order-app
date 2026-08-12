import { supabase, supabaseService, sanitizeQuery, instrumentRpc } from './supabase'
import { usersService } from './users'
import { handleError } from '../utils'
import { ORDER_STATUS } from '../types'

const ORDER_USER_SELECT = '*, users(*)'
const DELETED_USER_FALLBACK = 'Usuario eliminado'

const normalizeOrderUserFallback = (order) => {
  if (!order || typeof order !== 'object') return order

  const hasUserProfile = order.users && typeof order.users === 'object'
  if (hasUserProfile) return order

  const userFallback = {
    id: order.user_id || null,
    email: null,
    full_name: DELETED_USER_FALLBACK,
    role: 'user'
  }

  return {
    ...order,
    users: userFallback,
    user_name: order.user_name || order.user_full_name || order.full_name || order.customer_name || DELETED_USER_FALLBACK,
    user_email: order.user_email || order.customer_email || ''
  }
}

const normalizeOrdersUserFallback = (orders) => (
  Array.isArray(orders) ? orders.map(normalizeOrderUserFallback) : orders
)

const resolveIsAdminForUser = async (user) => {
  if (!user?.id) return false
  const roleFromMetadata = user?.user_metadata?.role || user?.app_metadata?.role || user?.role
  if (roleFromMetadata === 'admin') return true
  try {
    const { data } = await usersService.getUserById(user.id)
    return data?.role === 'admin'
  } catch (_error) {
    return false
  }
}

const createRequestId = (prefix) => {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${prefix}-${random}`
}

class OrdersService {
  // Crear pedido con validación
  async createOrder(orderData) {
    try {
      const sanitizedData = sanitizeQuery(orderData)

      // Validaciones básicas
      if (!sanitizedData.user_id) {
        throw new Error('ID de usuario requerido')
      }

      if (!sanitizedData.items || !Array.isArray(sanitizedData.items) || sanitizedData.items.length === 0) {
        throw new Error('Debe incluir al menos un item')
      }

      if (!sanitizedData.location) {
        throw new Error('Ubicación requerida')
      }

      // Añadir timestamp y estado por defecto
      const orderWithDefaults = {
        ...sanitizedData,
        service: sanitizedData.service || 'lunch',
        status: ORDER_STATUS.PENDING,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      let attempt = 0
      const { data } = await supabaseService.withRetry(
        async () => {
          attempt += 1
          const { data: rpcData, error } = await instrumentRpc(
            'create_order_idempotent',
            {
              p_user_id: orderWithDefaults.user_id,
              p_idempotency_key: orderWithDefaults.idempotency_key || null,
              p_payload: orderWithDefaults
            },
            {
              context: 'createOrder',
              admin: Boolean(orderWithDefaults?.is_admin || orderWithDefaults?.isAdmin),
              attempt,
              retried: attempt > 1
            }
          )

          if (error) throw error
          return { data: rpcData, error: null }
        },
        'createOrder'
      )

      // Invalidar cache relacionado con pedidos
      supabaseService.invalidateCache('orders')

      return { data, error: null }
    } catch (error) {
      return { data: null, error: handleError(error, 'createOrder') }
    }
  }

  // Obtener pedidos con cache inteligente
  async getOrders(userId = null, options = {}) {
    try {
      const {
        status,
        deliveryDate,
        service,
        limit = 50,
        offset = 0,
        includeUserData = false,
        force = false
      } = options

      const userDataKey = includeUserData ? 'with_user' : 'base'
      const cacheKey = `orders_${userId || 'all'}_${status || 'all'}_${deliveryDate || 'all'}_${service || 'all'}_${userDataKey}_${limit}_${offset}`

      const queryFn = async () => {
        let query = supabase
          .from('orders')
          .select(includeUserData ? ORDER_USER_SELECT : '*')
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1)

        if (userId) {
          query = query.eq('user_id', userId)
        }

        if (status) {
          query = query.eq('status', status)
        }

        if (deliveryDate) {
          query = query.eq('delivery_date', deliveryDate)
        }

        if (service) {
          query = query.eq('service', service)
        }

        const { data, error } = await query

        if (error) throw error

        return includeUserData ? normalizeOrdersUserFallback(data || []) : (data || [])
      }

      const data = await supabaseService.cachedQuery(cacheKey, queryFn, 30000, force)

      return { data, error: null }
    } catch (error) {
      return { data: [], error: handleError(error, 'getOrders') }
    }
  }

  // Obtener pedido por ID
  async getOrderById(orderId) {
    try {
      if (!orderId) {
        throw new Error('ID de pedido requerido')
      }

      const cacheKey = `order_${orderId}`

      const queryFn = async () => {
        let { data, error } = await supabase
          .from('orders')
          .select(ORDER_USER_SELECT)
          .eq('id', orderId)
          .single()

        if (error) {
          const fallback = await supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .single()

          if (fallback.error) throw fallback.error
          data = fallback.data
        }

        return normalizeOrderUserFallback(data)
      }

      const data = await supabaseService.cachedQuery(cacheKey, queryFn, 60000)

      return { data, error: null }
    } catch (error) {
      return { data: null, error: handleError(error, 'getOrderById') }
    }
  }

  // Actualizar estado del pedido
  async updateOrderStatus(orderId, status, additionalData = {}) {
    try {
      if (!orderId) {
        throw new Error('ID de pedido requerido')
      }

      if (!Object.values(ORDER_STATUS).includes(status)) {
        throw new Error('Estado de pedido inválido')
      }

      const sanitizedData = sanitizeQuery(additionalData)

      const updateData = {
        status,
        updated_at: new Date().toISOString(),
        ...sanitizedData
      }

      const { data, error } = await supabaseService.withRetry(
        () => supabase
          .from('orders')
          .update(updateData)
          .eq('id', orderId)
          .select()
          .single(),
        'updateOrderStatus'
      )

      if (error) throw error

      // Invalidar cache
      supabaseService.invalidateCache('orders')
      supabaseService.invalidateCache(`order_${orderId}`)

      return { data, error: null }
    } catch (error) {
      return { data: null, error: handleError(error, 'updateOrderStatus') }
    }
  }

  // Actualizar pedido completo
  async updateOrder(orderId, updates, { adminAudit = false, reason = null } = {}) {
    try {
      if (!orderId) {
        throw new Error('ID de pedido requerido')
      }

      // Obtener pedido actual
      const { data: order, error: orderError } = await this.getOrderById(orderId)
      if (orderError || !order) {
        throw new Error('Pedido no encontrado')
      }

      // Obtener usuario actual
      const authModule = await import('./auth')
      const authService = authModule?.default
      if (!authService?.getUser) {
        throw new Error('Servicio de autenticación no disponible')
      }
      const { user } = await authService.getUser()
      if (!user) throw new Error('Usuario no autenticado')

      // Verificar si es admin
      const isAdmin = await resolveIsAdminForUser(user)

      // Validar tiempo para usuarios normales
      if (!isAdmin) {
        const createdAt = new Date(order.created_at)
        const now = new Date()
        const diffMinutes = (now - createdAt) / (1000 * 60)
        if (diffMinutes > 15) {
          throw new Error('Solo puedes editar el pedido dentro de los 15 minutos posteriores a su creación')
        }
      }

      const sanitizedUpdates = sanitizeQuery(updates)

      if (adminAudit) {
        if (!isAdmin) {
          throw new Error('Solo un administrador puede usar edición administrativa')
        }
        const normalizedReason = String(reason || '').trim()
        if (!normalizedReason) {
          throw new Error('Motivo obligatorio para edición administrativa')
        }
        const { data, error } = await supabase.rpc('admin_update_order_with_reason', {
          p_order_id: orderId,
          p_updates: sanitizedUpdates,
          p_reason: normalizedReason,
          p_request_id: createRequestId('admin-order-update')
        })
        if (error) throw error

        supabaseService.invalidateCache('orders')
        supabaseService.invalidateCache(`order_${orderId}`)

        return { data, error: null }
      }

      const updateData = {
        ...sanitizedUpdates,
        updated_at: new Date().toISOString()
      }

      const { data, error } = await supabaseService.withRetry(
        () => supabase
          .from('orders')
          .update(updateData)
          .eq('id', orderId)
          .select()
          .single(),
        'updateOrder'
      )

      if (error) throw error

      // Invalidar cache
      supabaseService.invalidateCache('orders')
      supabaseService.invalidateCache(`order_${orderId}`)

      return { data, error: null }
    } catch (error) {
      return { data: null, error: handleError(error, 'updateOrder') }
    }
  }

  // Eliminar pedido
  async deleteOrder(orderId) {
    try {
      if (!orderId) {
        throw new Error('ID de pedido requerido')
      }

      // Obtener pedido actual
      const { data: order, error: orderError } = await this.getOrderById(orderId)
      if (orderError || !order) {
        throw new Error('Pedido no encontrado')
      }

      // Obtener usuario actual
      const { user } = await import('./auth').then(m => m.default.getUser())
      if (!user) throw new Error('Usuario no autenticado')

      // Verificar si es admin
      const isAdmin = await resolveIsAdminForUser(user)

      // Validar tiempo para usuarios normales
      if (!isAdmin) {
        const createdAt = new Date(order.created_at)
        const now = new Date()
        const diffMinutes = (now - createdAt) / (1000 * 60)
        if (diffMinutes > 15) {
          throw new Error('Solo puedes borrar el pedido dentro de los 15 minutos posteriores a su creación')
        }
      }

      const { error } = await supabaseService.withRetry(
        () => supabase
          .from('orders')
          .delete()
          .eq('id', orderId),
        'deleteOrder'
      )

      if (error) throw error

      // Invalidar cache
      supabaseService.invalidateCache('orders')
      supabaseService.invalidateCache(`order_${orderId}`)

      return { error: null }
    } catch (error) {
      return { error: handleError(error, 'deleteOrder') }
    }
  }

  // Eliminar pedidos archivados (admin)
  async deleteArchivedOrders() {
    try {
      const requestId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const { data, error } = await supabaseService.withRetry(
        () => supabase.rpc('admin_delete_archived_orders', {
          p_request_id: `orders-archived-delete-${requestId}`
        }),
        'deleteArchivedOrders'
      )

      if (error) throw error

      // Invalidar cache
      supabaseService.invalidateCache('orders')

      return { data, error: null }
    } catch (error) {
      return { data: null, error: handleError(error, 'deleteArchivedOrders') }
    }
  }

  // Obtener estadísticas de pedidos
  async getOrderStats(userId = null, dateRange = null) {
    try {
      const cacheKey = `order_stats_${userId || 'all'}_${dateRange || 'all'}`

      const queryFn = async () => {
        let query = supabase
          .from('orders')
          .select('status, created_at')

        if (userId) {
          query = query.eq('user_id', userId)
        }

        if (dateRange) {
          const { start, end } = dateRange
          query = query.gte('created_at', start).lte('created_at', end)
        }

        const { data, error } = await query

        if (error) throw error

        const stats = {
          total: data.length,
          pending: data.filter(o => o.status === ORDER_STATUS.PENDING).length,
          archived: data.filter(o => o.status === ORDER_STATUS.ARCHIVED).length,
          cancelled: data.filter(o => o.status === ORDER_STATUS.CANCELLED).length
        }

        return stats
      }

      const data = await supabaseService.cachedQuery(cacheKey, queryFn, 60000)

      return { data, error: null }
    } catch (error) {
      return { data: null, error: handleError(error, 'getOrderStats') }
    }
  }

  // Buscar pedidos
  async searchOrders(searchTerm, userId = null, options = {}) {
    try {
      const { limit = 20, status } = options

      const cacheKey = `search_orders_${searchTerm}_${userId || 'all'}_${status || 'all'}_${limit}`

      const queryFn = async () => {
        let query = supabase
          .from('orders')
          .select(ORDER_USER_SELECT)
          .or(`customer_name.ilike.%${searchTerm}%,location.ilike.%${searchTerm}%,comments.ilike.%${searchTerm}%`)
          .order('created_at', { ascending: false })
          .limit(limit)

        if (userId) {
          query = query.eq('user_id', userId)
        }

        if (status) {
          query = query.eq('status', status)
        }

        const { data, error } = await query

        if (error) throw error

        return normalizeOrdersUserFallback(data || [])
      }

      const data = await supabaseService.cachedQuery(cacheKey, queryFn, 30000)

      return { data, error: null }
    } catch (error) {
      return { data: [], error: handleError(error, 'searchOrders') }
    }
  }

  // Marcar múltiples pedidos como completados
  async bulkUpdateStatus(orderIds, status) {
    try {
      if (!Array.isArray(orderIds) || orderIds.length === 0) {
        throw new Error('Lista de IDs de pedidos requerida')
      }

      if (!Object.values(ORDER_STATUS).includes(status)) {
        throw new Error('Estado de pedido inválido')
      }

      const updateData = {
        status,
        updated_at: new Date().toISOString()
      }

      const { data, error } = await supabaseService.withRetry(
        () => supabase
          .from('orders')
          .update(updateData)
          .in('id', orderIds)
          .select(),
        'bulkUpdateStatus'
      )

      if (error) throw error

      // Invalidar cache
      supabaseService.invalidateCache('orders')

      return { data, error: null }
    } catch (error) {
      return { data: null, error: handleError(error, 'bulkUpdateStatus') }
    }
  }

  // Último pedido del usuario (no cancelado, máx 60 días)
  async getLastOrderByUser(userId) {
    try {
      if (!userId) throw new Error('ID de usuario requerido')

      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
      const sixtyIso = sixtyDaysAgo.toISOString()

      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('user_id', userId)
        .neq('status', ORDER_STATUS.CANCELLED)
        .gte('created_at', sixtyIso)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') { // sin filas
        throw error
      }

      return { data: data || null, error: null }
    } catch (error) {
      return { data: null, error: handleError(error, 'getLastOrderByUser') }
    }
  }
}

// Instancia singleton del servicio
export const ordersService = new OrdersService()

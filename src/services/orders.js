import { db, supabase } from '../supabaseClient'

// Compatibility facade for the few legacy imports that still exist.
// The canonical order service is createOrdersService, exposed through db.
const ORDER_USER_SELECT = '*, users(*)'
const DELETED_USER_FALLBACK = 'Usuario eliminado'

const normalizeOrderUserFallback = (order) => {
  if (!order || typeof order !== 'object') return order
  if (order.users && typeof order.users === 'object') return order

  return {
    ...order,
    users: {
      id: order.user_id || null,
      email: null,
      full_name: DELETED_USER_FALLBACK,
      role: 'user'
    },
    user_name: order.user_name || order.user_full_name || order.full_name || order.customer_name || DELETED_USER_FALLBACK,
    user_email: order.user_email || order.customer_email || ''
  }
}

const normalizeOrdersUserFallback = (orders) => (
  Array.isArray(orders) ? orders.map(normalizeOrderUserFallback) : orders
)

const createRequestId = (prefix) => {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${prefix}-${random}`
}

const getOrders = async (userId = null, options = {}) => {
  const {
    status = null,
    deliveryDate = null,
    service = null,
    limit = null,
    offset = 0,
    includeUserData = false
  } = options

  if (!includeUserData && (!offset || offset === 0)) {
    return db.getOrders(userId, { status, deliveryDate, service, limit })
  }

  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 50
  const safeOffset = Math.max(Number(offset) || 0, 0)
  let query = supabase
    .from('orders')
    .select(includeUserData ? ORDER_USER_SELECT : '*')
    .order('created_at', { ascending: false })
    .range(safeOffset, safeOffset + safeLimit - 1)

  if (userId) query = query.eq('user_id', userId)
  if (status) query = query.eq('status', status)
  if (deliveryDate) query = query.eq('delivery_date', deliveryDate)
  if (service) query = query.eq('service', service)

  const { data, error } = await query
  return {
    data: includeUserData ? normalizeOrdersUserFallback(data || []) : (data || []),
    error
  }
}

const getOrderById = async (orderId) => {
  if (!orderId) {
    return { data: null, error: new Error('ID de pedido requerido') }
  }

  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_USER_SELECT)
    .eq('id', orderId)
    .single()

  return { data: error ? null : normalizeOrderUserFallback(data), error }
}

const updateOrder = async (orderId, updates, { adminAudit = false, reason = null } = {}) => {
  if (!orderId) {
    return { data: null, error: new Error('ID de pedido requerido') }
  }

  if (adminAudit) {
    const normalizedReason = String(reason || '').trim()
    if (!normalizedReason) {
      return { data: null, error: new Error('Motivo obligatorio para edición administrativa') }
    }

    const { data, error } = await supabase.rpc('admin_update_order_with_reason', {
      p_order_id: orderId,
      p_updates: updates || {},
      p_reason: normalizedReason,
      p_request_id: createRequestId('admin-order-update')
    })
    return { data, error }
  }

  const { data, error } = await supabase
    .from('orders')
    .update({ ...(updates || {}), updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .select()
    .single()

  return { data, error }
}

const getOrderStats = async (userId = null, dateRange = null) => {
  let query = supabase.from('orders').select('status, created_at')
  if (userId) query = query.eq('user_id', userId)
  if (dateRange?.start) query = query.gte('created_at', dateRange.start)
  if (dateRange?.end) query = query.lte('created_at', dateRange.end)

  const { data, error } = await query
  if (error) return { data: null, error }

  const rows = Array.isArray(data) ? data : []
  return {
    data: {
      total: rows.length,
      pending: rows.filter(order => order.status === 'pending').length,
      archived: rows.filter(order => order.status === 'archived').length,
      cancelled: rows.filter(order => order.status === 'cancelled').length
    },
    error: null
  }
}

const searchOrders = async (searchTerm, userId = null, { limit = 20, status = null } = {}) => {
  let query = supabase
    .from('orders')
    .select(ORDER_USER_SELECT)
    .or(`customer_name.ilike.%${searchTerm}%,location.ilike.%${searchTerm}%,comments.ilike.%${searchTerm}%`)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (userId) query = query.eq('user_id', userId)
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  return { data: error ? [] : normalizeOrdersUserFallback(data || []), error }
}

const bulkUpdateStatus = async (orderIds, status) => {
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return { data: null, error: new Error('Lista de IDs de pedidos requerida') }
  }

  const { data, error } = await supabase
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .in('id', orderIds)
    .select()

  return { data, error }
}

export const ordersService = {
  getOrders,
  getOrderById,
  getOrderStats,
  searchOrders,
  bulkUpdateStatus,
  updateOrder,
  createOrder: (...args) => db.createOrder(...args),
  updateOrderStatus: (...args) => db.updateOrderStatus(...args),
  deleteOrder: (...args) => db.deleteOrder(...args),
  deleteArchivedOrders: (...args) => db.deleteArchivedOrders(...args)
}

export default ordersService

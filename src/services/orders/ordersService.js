export const isTransientSupabaseError = (error) => {
  if (!error) return false

  const status = Number(error.status || error.code)
  if ([502, 503, 504].includes(status)) return true

  const message = String(error.message || error.name || error.code || error).toLowerCase()
  return [
    'failed to fetch',
    'err_connection_closed',
    'err_network',
    'network request failed',
    'networkerror',
    'timeout'
  ].some((pattern) => message.includes(pattern))
}

export const withSupabaseRetry = async (
  operation,
  {
    attempts = 3,
    delays = [300, 800, 1500],
    context = 'supabase query'
  } = {}
) => {
  let lastError
  let lastResult

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await operation()
      lastResult = result

      if (!isTransientSupabaseError(result?.error)) {
        return result
      }

      lastError = result.error
    } catch (error) {
      if (!isTransientSupabaseError(error)) {
        throw error
      }
      lastError = error
    }

    if (attempt >= attempts) {
      if (lastResult) return lastResult
      throw lastError
    }

    const delay = delays[Math.min(attempt - 1, delays.length - 1)] || 0
    if (import.meta.env.DEV) {
      console.warn(`[supabase-retry] ${context} failed on attempt ${attempt}; retrying in ${delay}ms`, lastError)
    }
    await new Promise((resolve) => setTimeout(resolve, delay))
  }

  if (lastResult) return lastResult
  throw lastError
}

const normalizeStatuses = (statuses) => {
  if (statuses === undefined || statuses === null) return []
  if (Array.isArray(statuses)) return statuses.map(status => String(status || '').trim()).filter(Boolean)
  const status = String(statuses || '').trim()
  return status ? [status] : []
}

const normalizeLocationCandidates = (locations) => {
  const rawLocations = Array.isArray(locations) ? locations : [locations]
  return [...new Set(rawLocations.map(location => String(location || '').trim()).filter(Boolean))]
}

const normalizeLocationLookup = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')

export const createOrdersService = ({ supabase, invalidateCache = () => {} } = {}) => {
  if (!supabase) {
    throw new Error('createOrdersService requires a supabase client')
  }

  const archivePendingOrdersByDeliveryDate = async ({ deliveryDate, statuses = ['pending'] } = {}) => {
    if (!deliveryDate) {
      return { data: null, error: new Error('deliveryDate es requerido para archivar pedidos') }
    }

    const { data, error } = await supabase.rpc('archive_orders_bulk_by_delivery_date', {
      p_delivery_date: deliveryDate,
      p_statuses: statuses
    })
    return { data, error }
  }

  const getDailyReportRunStatus = async ({ reportDate, reportType = 'daily_orders' } = {}) => {
    if (!reportDate) {
      return { data: null, error: new Error('reportDate es requerido para consultar el reporte diario') }
    }

    const { data, error } = await supabase.rpc('get_daily_report_run_status', {
      p_report_date: reportDate,
      p_report_type: reportType
    })
    const row = Array.isArray(data) ? (data[0] || null) : data
    return { data: row || null, error }
  }

  const createRequestId = (prefix) => {
    const random = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    return `${prefix}-${random}`
  }

  return {
    archivePendingOrdersByDeliveryDate,
    archiveAllPendingOrders: archivePendingOrdersByDeliveryDate,
    getDailyReportRunStatus,

    // "Eliminar" pendientes: se cancelan para conservarlos en el histórico (panel mensual)
    deleteAllPendingOrders: async ({ deliveryDate } = {}) => {
      if (!deliveryDate) {
        return { data: null, error: new Error('deliveryDate es requerido para cancelar pedidos pendientes') }
      }
      const { data, error } = await supabase
        .from('orders')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('status', 'pending')
        .eq('delivery_date', deliveryDate)
        .select('id')
      return { data, error }
    },

    // Marcar todos los pedidos pendientes de días anteriores como archivados
    completeAllOldPendingOrders: async () => {
      const { data, error } = await supabase
        .from('orders')
        .update({ status: 'archived', archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('status', 'pending')
        .lt('delivery_date', new Date().toISOString().slice(0, 10))
      return { data, error }
    },

    // Marcar pedidos pendientes de días anteriores como cancelados (no borrar)
    cancelPreviousDaysPendingOrders: async () => {
      const { data, error } = await supabase
        .from('orders')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('status', 'pending')
        .lt('delivery_date', new Date().toISOString().slice(0, 10))
        .select('id') // devuelve ids para confirmar que se actualizaron
      return { data, error }
    },

    deleteAllOrders: async () => {
      invalidateCache()
      const { data, error } = await supabase.rpc('admin_delete_all_orders', {
        p_request_id: createRequestId('orders-all-delete')
      })
      return { data, error }
    },

    createOrder: async (orderData) => {
      invalidateCache()
      const idempotencyKey = orderData?.idempotency_key || createRequestId('order-create')
      const { data, error } = await supabase.rpc('create_order_idempotent', {
        p_user_id: orderData?.user_id,
        p_idempotency_key: idempotencyKey,
        p_payload: {
          ...orderData,
          idempotency_key: idempotencyKey
        }
      })
      return { data, error }
    },

    createAdminExtraOrder: async (payload) => {
      invalidateCache()
      const idempotencyKey = payload?.idempotency_key || createRequestId('admin-extra-order')
      const { data, error } = await supabase.rpc('create_admin_extra_order', {
        p_payload: {
          ...payload,
          idempotency_key: idempotencyKey
        }
      })
      return { data, error }
    },

    createLateAdminExtraOrder: async (payload) => {
      invalidateCache()
      const idempotencyKey = payload?.idempotency_key || createRequestId('late-admin-extra-order')
      const { data, error } = await supabase.rpc('create_late_admin_extra_order', {
        p_payload: {
          ...payload,
          idempotency_key: idempotencyKey
        }
      })
      return { data, error }
    },

    getDailyOrdersForAdmin: async ({ deliveryDate, statuses = ['pending', 'archived', 'post_report_extra'] } = {}) => {
      if (!deliveryDate) {
        return { data: null, error: new Error('deliveryDate es requerido para consultar pedidos diarios') }
      }
      return withSupabaseRetry(async () => {
        const { data, error } = await supabase.rpc('get_daily_orders_for_admin', {
          p_delivery_date: deliveryDate,
          p_statuses: normalizeStatuses(statuses)
        })
        return { data, error }
      }, { context: 'admin daily orders rpc' })
    },

    searchHistoricalDailyOrders: async ({
      search = '',
      email = '',
      companySlug = '',
      fromDate = null,
      toDate = null,
      remitoNumber = null,
      status = '',
      origin = '',
      page = 1,
      pageSize = 25
    } = {}) => {
      const safePage = Math.max(Number(page) || 1, 1)
      const safePageSize = Math.min(Math.max(Number(pageSize) || 25, 1), 100)
      const safeRemitoNumber = Number(remitoNumber)

      return withSupabaseRetry(async () => {
        const { data, error } = await supabase.rpc('search_historical_daily_orders', {
          p_search: String(search || '').trim(),
          p_email: String(email || '').trim(),
          p_company_slug: companySlug && companySlug !== 'all' ? companySlug : null,
          p_from_date: fromDate || null,
          p_to_date: toDate || null,
          p_remito_number: Number.isFinite(safeRemitoNumber) && safeRemitoNumber > 0 ? safeRemitoNumber : null,
          p_status: status && status !== 'all' ? status : null,
          p_origin: origin && origin !== 'all' ? origin : null,
          p_page: safePage,
          p_page_size: safePageSize
        })
        return { data, error }
      }, { context: 'historical daily orders search rpc' })
    },

    deleteAdminExtraOrder: async ({ orderId, reason, requestId = null } = {}) => {
      invalidateCache()
      if (!orderId) {
        return { data: null, error: new Error('orderId es requerido para eliminar un pedido extra') }
      }
      if (!String(reason || '').trim()) {
        return { data: null, error: new Error('reason es requerido para eliminar un pedido extra') }
      }
      const deleteRequestId = requestId || createRequestId('admin-extra-order-delete')
      const { data, error } = await supabase.rpc('delete_admin_extra_order', {
        p_order_id: orderId,
        p_reason: reason,
        p_request_id: deleteRequestId
      })
      return { data, error }
    },

    getLateAdminExtraHistoryDays: async ({ fromDate = null, toDate = null } = {}) => {
      const { data, error } = await supabase.rpc('get_late_admin_extra_history_days', {
        p_from_date: fromDate || null,
        p_to_date: toDate || null
      })
      return { data, error }
    },

    getLateAdminExtraHistoryForDay: async ({ operationalDate } = {}) => {
      if (!operationalDate) {
        return { data: null, error: new Error('operationalDate es requerido para consultar extras históricos') }
      }
      const { data, error } = await supabase.rpc('get_late_admin_extra_history_for_day', {
        p_operational_date: operationalDate
      })
      return { data, error }
    },

    closeLateAdminExtraOperationalDay: async ({ operationalDate } = {}) => {
      invalidateCache()
      if (!operationalDate) {
        return { data: null, error: new Error('operationalDate es requerido para cerrar la jornada de extras') }
      }
      const { data, error } = await supabase.rpc('close_late_admin_extra_operational_day', {
        p_operational_date: operationalDate
      })
      return { data: Array.isArray(data) ? data[0] : data, error }
    },

    getLateAdminExtraClosure: async ({ operationalDate } = {}) => {
      if (!operationalDate) {
        return { data: null, error: new Error('operationalDate es requerido para consultar el cierre de extras') }
      }
      const { data, error } = await supabase.rpc('get_late_admin_extra_closure', {
        p_operational_date: operationalDate
      })
      return { data: Array.isArray(data) ? (data[0] || null) : data, error }
    },

    getOrders: async (userId = null, {
      status = null,
      deliveryDate = null,
      service = null,
      limit = null
    } = {}) => {
      let query = supabase
        .from('orders')
        .select('*') // Seleccionar TODOS los campos
        .order('created_at', { ascending: false })

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

      if (Number.isInteger(limit) && limit > 0) {
        query = query.limit(limit)
      }

      const { data, error } = await query
      return { data, error }
    },

    hasArchivedOrderForLocation: async ({ userId, locations = [] } = {}) => {
      const normalizedLocations = normalizeLocationCandidates(locations)
      if (!userId || normalizedLocations.length === 0) {
        return { data: false, error: null }
      }

      const lookupSet = new Set(normalizedLocations.map(normalizeLocationLookup))
      const { data, error } = await supabase
        .from('orders')
        .select('location, organization, delivery_location')
        .eq('user_id', userId)
        .eq('status', 'archived')
        .limit(1000)

      if (error) return { data: false, error }

      const hasMatch = (Array.isArray(data) ? data : []).some((order) => (
        ['location', 'organization', 'delivery_location'].some((column) => (
          lookupSet.has(normalizeLocationLookup(order?.[column]))
        ))
      ))

      return { data: hasMatch, error: null }
    },

    // Pedidos con person_key para agrupar por persona (grupo o usuario suelto)
    getOrdersWithPersonKey: async ({ userId = null, personKey = null } = {}) => {
      if (!userId && !personKey) {
        return {
          data: null,
          error: new Error('getOrdersWithPersonKey requiere userId/personKey; usar getOrdersWithPersonKeyByDate para /daily-orders')
        }
      }

      let query = supabase
        .from('orders_with_person_key')
        .select('*')
        .order('created_at', { ascending: false })

      if (userId) {
        query = query.eq('user_id', userId)
      }

      if (personKey) {
        query = query.eq('person_key', personKey)
      }

      const { data, error } = await query
      return { data, error }
    },

    getOrdersWithPersonKeyByDate: async ({
      deliveryDate,
      statuses = ['pending', 'archived', 'post_report_extra'],
      userId = null,
      personKey = null
    } = {}) => {
      if (!deliveryDate) {
        return { data: null, error: new Error('deliveryDate es requerido para consultar pedidos diarios') }
      }

      return withSupabaseRetry(async () => {
        let query = supabase
          .from('orders_with_person_key')
          .select('*')
          .eq('delivery_date', deliveryDate)

        const normalizedStatuses = normalizeStatuses(statuses)
        if (normalizedStatuses.length === 1) {
          query = query.eq('status', normalizedStatuses[0])
        } else if (normalizedStatuses.length > 1) {
          query = query.in('status', normalizedStatuses)
        }

        if (userId) {
          query = query.eq('user_id', userId)
        }

        if (personKey) {
          query = query.eq('person_key', personKey)
        }

        query = query.order('created_at', { ascending: false })

        const { data, error } = await query
        return { data, error }
      }, { context: 'orders_with_person_key daily date query' })
    },

    getOrdersForLabels: async ({
      fromDate = null,
      toDate = null,
      deliveryDate = null,
      statuses = [],
      service = null,
      locations = [],
      limit = 50,
      offset = 0
    } = {}) => {
      const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100)
      const safeOffset = Math.max(Number(offset) || 0, 0)

      return withSupabaseRetry(async () => {
        let query = supabase
          .from('orders_with_person_key')
          .select('*', { count: 'exact' })

        if (deliveryDate) {
          query = query.eq('delivery_date', deliveryDate)
        } else {
          if (fromDate) query = query.gte('delivery_date', fromDate)
          if (toDate) query = query.lte('delivery_date', toDate)
        }

        const normalizedStatuses = normalizeStatuses(statuses)
        if (normalizedStatuses.length === 1) {
          query = query.eq('status', normalizedStatuses[0])
        } else if (normalizedStatuses.length > 1) {
          query = query.in('status', normalizedStatuses)
        }

        if (service) {
          query = query.eq('service', service)
        }

        const normalizedLocations = Array.isArray(locations)
          ? [...new Set(locations.map(location => String(location || '').trim()).filter(Boolean))]
          : []
        if (normalizedLocations.length > 0) {
          query = query.in('location', normalizedLocations)
        }

        query = query
          .order('delivery_date', { ascending: false })
          .order('created_at', { ascending: false })
          .range(safeOffset, safeOffset + safeLimit - 1)

        const { data, error, count } = await query
        return { data, error, count }
      }, { context: 'orders labels query' })
    },

    // Conteo de pedidos agrupado por persona
    getOrdersCountByPerson: async () => {
      const { data, error } = await supabase
        .from('orders_count_by_person')
        .select('*')
        .order('total_orders', { ascending: false })
      return { data, error }
    },

    updateOrderStatus: async (orderId, status, { reason = null, adminAudit = false } = {}) => {
      invalidateCache()
      if (adminAudit) {
        const normalizedReason = String(reason || '').trim()
        if (!normalizedReason) {
          return { data: null, error: new Error('reason es requerido para acciones administrativas') }
        }
        const rpcName = status === 'cancelled'
          ? 'admin_cancel_order_with_reason'
          : 'admin_update_order_with_reason'
        const rpcArgs = status === 'cancelled'
          ? {
              p_order_id: orderId,
              p_reason: normalizedReason,
              p_request_id: createRequestId('admin-order-cancel')
            }
          : {
              p_order_id: orderId,
              p_updates: { status },
              p_reason: normalizedReason,
              p_request_id: createRequestId('admin-order-status')
            }
        const { data, error } = await supabase.rpc(rpcName, rpcArgs)
        return { data, error }
      }
      const { data, error } = await supabase
        .from('orders')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', orderId)
        .select()
      return { data, error }
    },

    cancelOwnPendingOrder: async ({ orderId }) => {
      invalidateCache()
      const { data, error } = await supabase.rpc('cancel_own_pending_order', {
        order_id: orderId
      })
      if (error && ['400', '404', 400, 404].includes(error?.status)) {
        const fallback = await supabase
          .from('orders')
          .delete()
          .eq('id', orderId)
          .eq('status', 'pending')
          .select()
        return fallback
      }
      return { data, error }
    },

    deleteOrder: async (orderId) => {
      invalidateCache()
      const { data, error } = await supabase
        .from('orders')
        .delete()
        .eq('id', orderId)
      return { data, error }
    },

    deleteArchivedOrders: async () => {
      invalidateCache()
      const { data, error } = await supabase.rpc('admin_delete_archived_orders', {
        p_request_id: createRequestId('orders-archived-delete')
      })
      return { data, error }
    },

    getArchivedOrdersCount: async () => {
      const { count, error } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'archived')
      return { count, error }
    }
  }
}

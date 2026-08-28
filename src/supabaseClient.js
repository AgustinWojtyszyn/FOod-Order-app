// Usamos una única instancia compartida desde services/supabase para evitar
// el warning de múltiples GoTrueClient en el mismo storage.
import { supabase } from './services/supabase'
import { createOrdersService } from './services/orders/ordersService'
import { createMenuService } from './services/menu/menuService'
import { createCustomOptionsService } from './services/customOptions/customOptionsService'
import { createUsersService } from './services/users/usersService'
import { createAnalyticsService } from './services/analytics/analyticsService'
import { clearSupabaseStorage } from './utils/clearSupabaseStorage'
export { supabase, clearSupabaseStorage }

const hasUsableAccessToken = (session) => {
  const token = session?.access_token
  return typeof token === 'string' && token.split('.').length === 3 && token.split('.').every(Boolean)
}

// Eliminar todos los pedidos pendientes de días anteriores
// Se agrega como método a db más abajo
// Cache simple en memoria para reducir consultas repetidas
const cache = {
  data: new Map(),
  ttl: new Map(),
  
  get(key) {
    const expiry = this.ttl.get(key)
    if (expiry && Date.now() > expiry) {
      this.data.delete(key)
      this.ttl.delete(key)
      return null
    }
    return this.data.get(key)
  },
  
  set(key, value, ttlMs = 30000) { // TTL por defecto: 30 segundos
    this.data.set(key, value)
    this.ttl.set(key, Date.now() + ttlMs)
  },
  
  clear() {
    this.data.clear()
    this.ttl.clear()
  }
}

const ordersService = createOrdersService({
  supabase,
  invalidateCache: () => cache.clear()
})

// Configuración de autenticación
export const auth = {
  signUp: async (email, password, metadata = {}) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    })
    return { data, error }
  },

  signIn: async (email, password) => {
    const { data, error} = await supabase.auth.signInWithPassword({
      email,
      password,
      options: {
        persistSession: true
      }
    })
    return { data, error }
  },

  signOut: async () => {
    // Evitamos scope global (403 con anon key). Si falla, limpiamos storage local.
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) {
        clearSupabaseStorage()
        return { error }
      }
      return { error: null }
    } catch (error) {
      clearSupabaseStorage()
      return { error }
    }
  },

  resetPassword: async (email) => {
    const redirectTo = `${window.location.origin}/reset-password`
    if (import.meta.env.DEV) {
      console.debug('[auth-recovery] resetPassword redirectTo', redirectTo)
    }
    const { data, error } = await supabase.auth.resetPasswordForEmail((email || '').toLowerCase().trim(), {
      redirectTo
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
    const nextFullName = String(updates?.full_name || '').trim()
    const nextEmail = String(updates?.email || '').trim().toLowerCase()
    if (nextEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      return { data: null, error: new Error('Ingresá un correo válido.') }
    }
    const payload = {
      data: {
        full_name: nextFullName
      }
    }
    if (nextEmail) payload.email = nextEmail
    const { data, error } = await supabase.auth.updateUser(payload)
    return { data, error }
  },

  getUser: async () => {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !hasUsableAccessToken(session)) {
      return { user: null, error: sessionError || null }
    }
    const { data: { user }, error } = await supabase.auth.getUser()
    return { user, error }
  },

  onAuthStateChange: (callback) => {
    return supabase.auth.onAuthStateChange(callback)
  }
}

// Funciones de base de datos
import { Archive as ArchiveIcon } from 'lucide-react'

// --- Auditoría básica (inserta registros en audit_logs) ---
const logAudit = async ({
  action,
  details = '',
  target_id = null,
  target_email = null,
  target_name = null,
  metadata = null,
  request_id = null
}) => {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const actor = session?.user
    const payload = {
      action,
      details,
      actor_id: actor?.id || null,
      actor_email: actor?.email || null,
      actor_name: actor?.user_metadata?.full_name || actor?.email || 'Administrador',
      target_id,
      target_email,
      target_name,
      metadata,
      created_at: new Date().toISOString(),
      request_id: request_id || null
    }
    // Idempotencia por request_id + action
    await supabase.from('audit_logs').upsert([payload], { onConflict: 'request_id,action' })
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[audit][logAudit] no se pudo registrar auditoría:', err?.message || err)
    }
  }
}

const menuService = createMenuService({
  supabase,
  cache,
  invalidateCache: () => cache.clear(),
  logAudit
})

const customOptionsService = createCustomOptionsService({
  supabase,
  cache,
  invalidateCache: () => cache.clear()
})

const usersService = createUsersService({
  supabase,
  cache,
  invalidateCache: () => cache.clear(),
  logAudit
})

const analyticsService = createAnalyticsService({ supabase })

const CAFETERIA_ORDER_COLUMNS = 'id, user_id, items, total_items, status, delivery_date, created_at, updated_at, company_slug, company_name, admin_name, admin_email, notes'
const CAFETERIA_ORDER_LEGACY_COLUMNS = 'id, user_id, items, total_items, status, created_at, updated_at, company_slug, company_name, admin_name, admin_email, notes'

const isMissingDeliveryDateColumn = (error) => {
  const message = String(error?.message || '').toLowerCase()
  return error?.code === '42703' && message.includes('delivery_date')
}

const withLegacyDeliveryDate = (rows) => {
  if (!Array.isArray(rows)) return rows
  return rows.map((row) => ({ delivery_date: null, ...row }))
}

export const db = {
  ...ordersService,
  ...menuService,
  ...customOptionsService,
  ...usersService,
  ...analyticsService,

  getOrderScheduleContext: async ({ location = '', at = null } = {}) => {
    const { data, error } = await supabase.rpc('get_order_schedule_context', {
      p_location: location || null,
      p_at: at || null
    })
    return { data: Array.isArray(data) ? (data[0] || null) : data, error }
  },

  getCompaniesRemitoConfig: async () => {
    const { data, error } = await supabase.rpc('get_companies_remito_config')
    return { data, error }
  },

  updateCompanyRemitoStart: async ({ companySlug, remitoStartNumber }) => {
    const { data, error } = await supabase.rpc('update_company_remito_start', {
      p_company_slug: companySlug,
      p_remito_start_number: remitoStartNumber
    })
    return { data, error }
  },

  getCompanyRemitosForDate: async ({ deliveryDate, companySlug = null, locationKey = null } = {}) => {
    const { data, error } = await supabase.rpc('get_company_remitos_for_date', {
      p_delivery_date: deliveryDate,
      p_company_slug: companySlug && companySlug !== 'all' ? companySlug : null,
      p_location_key: locationKey && locationKey !== 'all' ? locationKey : null
    })
    return { data, error }
  },

  issueCompanyRemito: async ({ companySlug, companyName, deliveryDate, orderIds, requestId = null, snapshot = null, locationKey = '' }) => {
    const { data, error } = await supabase.rpc('issue_company_remito', {
      p_company_slug: companySlug,
      p_company_name: companyName,
      p_delivery_date: deliveryDate,
      p_order_ids: Array.isArray(orderIds) ? orderIds : [],
      p_request_id: requestId,
      p_snapshot: snapshot,
      p_location_key: locationKey || ''
    })
    return { data: Array.isArray(data) ? data[0] : data, error }
  },

  refreshCompanyRemitoSnapshot: async ({ remitoId, orderIds, snapshot, requestId = null }) => {
    const { data, error } = await supabase.rpc('refresh_company_remito_snapshot', {
      p_remito_id: remitoId,
      p_order_ids: Array.isArray(orderIds) ? orderIds : [],
      p_snapshot: snapshot,
      p_request_id: requestId
    })
    return { data: Array.isArray(data) ? data[0] : data, error }
  },

  getAdminAccessContext: async () => {
    const { data, error } = await supabase.rpc('get_admin_access_context')
    return { data, error }
  },

  getCompanyAdminAssignments: async () => {
    const { data, error } = await supabase.rpc('get_company_admin_assignments')
    return { data, error }
  },

  assignCompanyAdminByEmail: async ({ companySlug, email }) => {
    const { data, error } = await supabase.rpc('assign_company_admin_by_email', {
      p_company_slug: companySlug,
      p_email: email
    })
    return { data, error }
  },

  removeCompanyAdmin: async ({ companySlug, userId }) => {
    const { data, error } = await supabase.rpc('remove_company_admin', {
      p_company_slug: companySlug,
      p_user_id: userId
    })
    return { data, error }
  },

    
  // Cafeteria orders (admin only via RLS)
  getCafeteriaOrders: async ({ deliveryDate = null, statuses = null, userId = null, adminEmail = null } = {}) => {
    const buildQuery = ({ includeDeliveryDate }) => {
      let query = supabase
        .from('cafeteria_orders')
        .select(includeDeliveryDate ? CAFETERIA_ORDER_COLUMNS : CAFETERIA_ORDER_LEGACY_COLUMNS)
        .order('created_at', { ascending: false })

      if (includeDeliveryDate && deliveryDate) {
        query = query.eq('delivery_date', deliveryDate)
      }

      if (Array.isArray(statuses) && statuses.length > 0) {
        query = query.in('status', statuses)
      } else if (typeof statuses === 'string' && statuses) {
        query = query.eq('status', statuses)
      }

      if (userId && adminEmail) {
        query = query.or(`user_id.eq.${userId},admin_email.eq.${adminEmail}`)
      } else if (userId) {
        query = query.eq('user_id', userId)
      } else if (adminEmail) {
        query = query.eq('admin_email', adminEmail)
      }

      return query
    }

    let { data, error } = await buildQuery({ includeDeliveryDate: true })
    if (isMissingDeliveryDateColumn(error)) {
      const fallback = await buildQuery({ includeDeliveryDate: false })
      data = withLegacyDeliveryDate(fallback.data)
      error = fallback.error
    }
    return { data, error }
  },

  getCafeteriaOrderById: async (orderId) => {
    let { data, error } = await supabase
      .from('cafeteria_orders')
      .select(CAFETERIA_ORDER_COLUMNS)
      .eq('id', orderId)
      .single()
    if (isMissingDeliveryDateColumn(error)) {
      const fallback = await supabase
        .from('cafeteria_orders')
        .select(CAFETERIA_ORDER_LEGACY_COLUMNS)
        .eq('id', orderId)
        .single()
      data = fallback.data ? { delivery_date: null, ...fallback.data } : fallback.data
      error = fallback.error
    }
    return { data, error }
  },

  createCafeteriaOrder: async ({ userId, items, totalItems, deliveryDate, companySlug, companyName, adminName, adminEmail, notes }) => {
    const payload = {
      user_id: userId,
      items,
      total_items: totalItems,
      status: 'pending',
      delivery_date: deliveryDate || null,
      company_slug: companySlug || null,
      company_name: companyName || null,
      admin_name: adminName || null,
      admin_email: adminEmail || null,
      notes: notes || null
    }

    let { data, error } = await supabase
      .from('cafeteria_orders')
      .insert([payload])
      .select()
      .single()
    if (isMissingDeliveryDateColumn(error)) {
      const { delivery_date: _deliveryDate, ...legacyPayload } = payload
      const fallback = await supabase
        .from('cafeteria_orders')
        .insert([legacyPayload])
        .select()
        .single()
      data = fallback.data ? { delivery_date: null, ...fallback.data } : fallback.data
      error = fallback.error
    }
    return { data, error }
  },

  updateCafeteriaOrder: async (orderId, { items, totalItems, deliveryDate, companySlug, companyName, notes }) => {
    const payload = {
      items,
      total_items: totalItems,
      delivery_date: deliveryDate || null,
      company_slug: companySlug || null,
      company_name: companyName || null,
      notes: notes || null
    }

    let { data, error } = await supabase
      .from('cafeteria_orders')
      .update(payload)
      .eq('id', orderId)
      .select()
      .single()
    if (isMissingDeliveryDateColumn(error)) {
      const { delivery_date: _deliveryDate, ...legacyPayload } = payload
      const fallback = await supabase
        .from('cafeteria_orders')
        .update(legacyPayload)
        .eq('id', orderId)
        .select()
        .single()
      data = fallback.data ? { delivery_date: null, ...fallback.data } : fallback.data
      error = fallback.error
    }
    return { data, error }
  },

  deleteCafeteriaOrder: async (orderId) => {
    const { error } = await supabase
      .from('cafeteria_orders')
      .delete()
      .eq('id', orderId)
    return { error }
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

  // users/admin moved to usersService
  // analytics moved to analyticsService

  // custom_options/custom_option_overrides moved to customOptionsService
  // dinner_menu_by_date methods moved to menuService
}

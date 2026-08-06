import { updateUserRoleWithRpc } from './roleUpdates'

export const createUsersService = ({
  supabase,
  cache = null,
  invalidateCache = () => {},
  logAudit = null
} = {}) => {
  if (!supabase) {
    throw new Error('createUsersService requires a supabase client')
  }

  return {
    getUserCompanySwitchContext: async () => {
      const { data, error } = await supabase.rpc('get_user_company_switch_context')
      return { data, error }
    },

    changeActiveCompanyForToday: async ({ newCompanySlug, reason = null } = {}) => {
      invalidateCache()
      const { data, error } = await supabase.rpc('change_active_company_for_today', {
        p_new_company_slug: newCompanySlug,
        p_reason: reason
      })
      return { data, error }
    },

    getUserOrderLocations: async ({ companySlug = null } = {}) => {
      const normalizedSlug = (companySlug || '').toString().trim().toLowerCase()
      const { data, error } = await supabase.rpc('get_user_order_locations', {
        p_company_slug: normalizedSlug || null
      })
      if (error) {
        return { data: null, error }
      }
      const rows = Array.isArray(data) ? data : []
      return { data: rows, error }
    },

    // Usuarios
    getUsers: async (force = false) => {
      // Usar cache para reducir consultas repetidas
      const cacheKey = 'users-list'
      if (!force) {
        const cached = cache?.get?.(cacheKey)
        if (cached) return { data: cached, error: null }
      }
      const { data, error } = await supabase
        .from('users')
        .select('id, email, full_name, role, created_at') // Solo campos necesarios
        .order('created_at', { ascending: false })
      if (!error && data && cache?.set) {
        cache.set(cacheKey, data, 60000) // Cache por 1 minuto
      }
      return { data, error }
    },

    // Personas admin (usuarios agrupados + sueltos, sin duplicados)
    getAdminPeopleUnified: async (force = false) => {
      const cacheKey = 'admin-people-unified'
      if (!force) {
        const cached = cache?.get?.(cacheKey)
        if (cached) return { data: cached, error: null }
      }

      const { data, error } = await supabase
        .from('admin_people_unified')
        .select('person_id, group_id, display_name, emails, user_ids, members_count, first_created, last_created, is_grouped')
        .order('display_name', { ascending: true })

      if (!error && data && cache?.set) {
        cache.set(cacheKey, data, 60000)
      }

      return { data, error }
    },

    getAdminPeoplePage: async ({
      search = '',
      role = 'all',
      sort = 'name_asc',
      page = 1,
      pageSize = 40
    } = {}) => {
      const normalizedRole = ['all', 'admin', 'user'].includes(role) ? role : 'all'
      const normalizedSort = ['name_asc', 'name_desc', 'newest', 'oldest'].includes(sort) ? sort : 'name_asc'
      const normalizedPage = Math.max(1, Number(page) || 1)
      const normalizedPageSize = Math.max(1, Number(pageSize) || 40)

      const { data, error } = await supabase.rpc('get_admin_people_page', {
        p_search: (search || '').toString().trim(),
        p_role: normalizedRole,
        p_sort: normalizedSort,
        p_page: normalizedPage,
        p_page_size: normalizedPageSize
      })

      return { data, error }
    },

    updateUserRole: async (userId, role) => {
      return updateUserRoleWithRpc({
        rpc: (name, args) => supabase.rpc(name, args),
        userId,
        role,
        invalidateCache: () => invalidateCache(),
        logAudit
      })
    },

    deleteUser: async (userId) => {
      if (!userId) {
        return { data: null, error: new Error('ID de usuario requerido') }
      }

      return {
        data: null,
        error: new Error('No existe un backend seguro para eliminar auth.users desde el Panel Admin. No se eliminó el usuario y todos sus pedidos históricos se conservan.')
      }
    },

    // Pedidos
    getUserFeatures: async (userId = null) => {
      const normalizedUserId = (userId || '').toString().trim().toLowerCase() || 'me'
      const cacheKey = `user-features:${normalizedUserId}`
      const cached = cache?.get?.(cacheKey)
      if (cached) return { data: cached, error: null }
      let query = supabase
        .from('user_features')
        .select('feature, enabled')
      if (userId) {
        query = query.eq('user_id', userId)
      }
      const { data, error } = await query
      if (!error && data && cache?.set) {
        cache.set(cacheKey, data, 60_000)
      }
      return { data, error }
    }
  }
}

import { updateUserRoleWithRpc } from './roleUpdates'

const normalizeSearchText = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

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

      if (error?.code === 'PGRST202' || /get_admin_people_page/i.test(error?.message || '')) {
        const [{ data: peopleData, error: peopleError }, { data: accountsData, error: accountsError }] = await Promise.all([
          supabase
            .from('admin_people_unified')
            .select('person_id, group_id, display_name, emails, user_ids, members_count, first_created, last_created, is_grouped'),
          supabase
            .from('users')
            .select('id, email, full_name, role, created_at')
        ])

        if (peopleError || accountsError) {
          return { data: null, error: peopleError || accountsError || error }
        }

        const accountsById = new Map((accountsData || []).map((account) => [account.id, account]))
        const searchText = normalizeSearchText(search)
        const items = (peopleData || []).map((person) => {
          const emails = Array.isArray(person.emails) ? person.emails.filter(Boolean) : []
          const userIds = Array.isArray(person.user_ids) ? person.user_ids.filter(Boolean) : []
          const accounts = userIds.map((id) => accountsById.get(id)).filter(Boolean)
          const role = accounts.some((account) => account.role === 'admin') ? 'admin' : 'user'
          return {
            ...person,
            full_name: person.display_name || emails[0] || 'Sin nombre',
            email: emails[0] || '',
            role,
            primary_user_id: userIds[0] || accounts[0]?.id || null,
            accounts
          }
        }).filter((person) => {
          if (normalizedRole !== 'all' && person.role !== normalizedRole) return false
          if (!searchText) return true
          const haystack = normalizeSearchText([
            person.full_name,
            person.email,
            ...(person.emails || []),
            ...(person.accounts || []).flatMap((account) => [account.full_name, account.email])
          ].filter(Boolean).join(' '))
          return haystack.includes(searchText)
        }).sort((a, b) => {
          if (normalizedSort === 'name_desc') return String(b.full_name || '').localeCompare(String(a.full_name || ''), 'es')
          if (normalizedSort === 'newest') return new Date(b.first_created || b.created_at || 0) - new Date(a.first_created || a.created_at || 0)
          if (normalizedSort === 'oldest') return new Date(a.first_created || a.created_at || 0) - new Date(b.first_created || b.created_at || 0)
          return String(a.full_name || '').localeCompare(String(b.full_name || ''), 'es')
        })
        const from = (normalizedPage - 1) * normalizedPageSize
        const pageItems = items.slice(from, from + normalizedPageSize)
        return {
          data: {
            items: pageItems,
            total_count: items.length,
            total_pages: Math.max(1, Math.ceil(items.length / normalizedPageSize))
          },
          error: null
        }
      }

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

const USER_ROLES = new Set(['user', 'admin'])

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

    updateUserRole: async (userId, role) => {
      if (!userId) {
        return { data: null, error: new Error('ID de usuario requerido') }
      }
      if (!USER_ROLES.has(role)) {
        return { data: null, error: new Error('invalid_role') }
      }

      invalidateCache() // Limpiar cache al actualizar
      const { data, error } = await supabase.rpc('admin_update_user_role', {
        p_user_id: userId,
        p_role: role
      })
      // data es array, tomar el primero si existe
      const normalizedData = Array.isArray(data) ? data[0] : data

      if (!error && normalizedData && typeof logAudit === 'function') {
        // Auditoría: cambio de rol
        await logAudit({
          action: 'role_changed',
          details: `Rol actualizado a "${role}"`,
          target_id: userId,
          target_email: null,
          target_name: null,
          metadata: { role }
        })
      }

      return { data: normalizedData, error }
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

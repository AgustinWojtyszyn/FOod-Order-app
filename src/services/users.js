import { supabase, supabaseService, sanitizeQuery } from './supabase'
import { handleError } from '../utils'
import { USER_ROLES } from '../types'
import { updateUserRoleWithRpc } from './users/roleUpdates'

const PUBLIC_USER_COLUMNS = new Set(['full_name'])

const pickPublicUserColumns = (updates = {}) => Object.fromEntries(
  Object.entries(updates).filter(([column]) => PUBLIC_USER_COLUMNS.has(column))
)

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
    await supabase.from('audit_logs').upsert([payload], { onConflict: 'request_id,action' })
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[audit][logAudit] no se pudo registrar auditoría:', err?.message || err)
    }
  }
}

class UsersService {
  // Obtener usuarios con cache
  async getUsers(options = {}) {
    try {
      const {
        role,
        limit = 100,
        offset = 0,
        includeAuthData = false,
        force = false
      } = options

      const cacheKey = `users_${role || 'all'}_${limit}_${offset}_${includeAuthData}`

      const queryFn = async () => {
        let query = supabase
          .from('users')
          .select(includeAuthData ? '*' : 'id, email, full_name, role, created_at')
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1)

        if (role) {
          query = query.eq('role', role)
        }

        const { data, error } = await query

        if (error) throw error

        return data || []
      }

      const data = await supabaseService.cachedQuery(cacheKey, queryFn, 60000, force)

      return { data, error: null }
    } catch (error) {
      return { data: [], error: handleError(error, 'getUsers') }
    }
  }

  // Obtener usuario por ID
  async getUserById(userId) {
    try {
      if (!userId) {
        throw new Error('ID de usuario requerido')
      }

      const cacheKey = `user_${userId}`

      const queryFn = async () => {
        const { data, error } = await supabase
          .from('users')
          .select('id, email, full_name, role, created_at, email_confirmed_at')
          .eq('id', userId)
          .maybeSingle()

        if (error) {
          // Usuario inexistente/no visible: no reintentar ni loguear como error duro.
          if (error.code === 'PGRST116' || error.status === 406) {
            return null
          }
          throw error
        }

        return data
      }

      const data = await supabaseService.cachedQuery(cacheKey, queryFn, 300000) // 5 minutos

      return { data, error: null }
    } catch (error) {
      return { data: null, error: handleError(error, 'getUserById') }
    }
  }

  async getAdminAccessContext() {
    try {
      const { data, error } = await supabase.rpc('get_admin_access_context')
      if (error) throw error
      return { data, error: null }
    } catch (error) {
      return { data: null, error: handleError(error, 'getAdminAccessContext') }
    }
  }

  // Actualizar rol de usuario
  async updateUserRole(userId, role) {
    try {
      const result = await updateUserRoleWithRpc({
        rpc: (name, args) => supabaseService.withRetry(
          () => supabase.rpc(name, args),
          'updateUserRole'
        ),
        userId,
        role,
        invalidateCache: (targetUserId) => {
          supabaseService.invalidateCache('users')
          supabaseService.invalidateCache(`user_${targetUserId}`)
        },
        logAudit
      })

      if (result.error) throw result.error

      return result
    } catch (error) {
      return { data: null, error: handleError(error, 'updateUserRole') }
    }
  }

  // Actualizar perfil de usuario
  async updateUserProfile(userId, updates) {
    try {
      if (!userId) {
        throw new Error('ID de usuario requerido')
      }

      const sanitizedUpdates = sanitizeQuery(updates)

      const updateData = pickPublicUserColumns(sanitizedUpdates)

      const { data, error } = await supabaseService.withRetry(
        () => supabase
          .from('users')
          .update(updateData)
          .eq('id', userId)
          .select()
          .single(),
        'updateUserProfile'
      )

      if (error) throw error

      // Invalidar cache
      supabaseService.invalidateCache('users')
      supabaseService.invalidateCache(`user_${userId}`)

      return { data, error: null }
    } catch (error) {
      return { data: null, error: handleError(error, 'updateUserProfile') }
    }
  }

  // Eliminar usuario
  async deleteUser(userId) {
    try {
      if (!userId) {
        throw new Error('ID de usuario requerido')
      }

      return {
        data: null,
        error: new Error('No existe un backend seguro para eliminar auth.users desde el Panel Admin. No se eliminó el usuario y todos sus pedidos históricos se conservan.')
      }
    } catch (error) {
      return { data: null, error: handleError(error, 'deleteUser') }
    }
  }

  // Buscar usuarios
  async searchUsers(searchTerm, options = {}) {
    try {
      const { role, limit = 20 } = options

      const cacheKey = `search_users_${searchTerm}_${role || 'all'}_${limit}`

      const queryFn = async () => {
        let query = supabase
          .from('users')
          .select('id, email, full_name, role, created_at')
          .or(`email.ilike.%${searchTerm}%,full_name.ilike.%${searchTerm}%`)
          .order('created_at', { ascending: false })
          .limit(limit)

        if (role) {
          query = query.eq('role', role)
        }

        const { data, error } = await query

        if (error) throw error

        return data || []
      }

      const data = await supabaseService.cachedQuery(cacheKey, queryFn, 30000)

      return { data, error: null }
    } catch (error) {
      return { data: [], error: handleError(error, 'searchUsers') }
    }
  }

  // Obtener estadísticas de usuarios
  async getUserStats() {
    try {
      const cacheKey = 'user_stats'

      const queryFn = async () => {
        const { data, error } = await supabase
          .from('users')
          .select('role, created_at')

        if (error) throw error

        const stats = {
          total: data.length,
          users: data.filter(u => u.role === USER_ROLES.USER).length,
          admins: data.filter(u => u.role === USER_ROLES.ADMIN).length,
          recentRegistrations: data.filter(u => {
            const weekAgo = new Date()
            weekAgo.setDate(weekAgo.getDate() - 7)
            return new Date(u.created_at) > weekAgo
          }).length
        }

        return stats
      }

      const data = await supabaseService.cachedQuery(cacheKey, queryFn, 300000) // 5 minutos

      return { data, error: null }
    } catch (error) {
      return { data: null, error: handleError(error, 'getUserStats') }
    }
  }

  // Verificar si usuario es admin
  async isUserAdmin(userId) {
    try {
      const { data } = await this.getUserById(userId)

      if (!data) return false

      return data.role === USER_ROLES.ADMIN
    } catch (error) {
      console.error('Error verificando rol de admin:', error)
      return false
    }
  }

}

// Instancia singleton del servicio
export const usersService = new UsersService()

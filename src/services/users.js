import { db, supabase } from '../supabaseClient'

// Compatibility facade for legacy imports.
// Business operations live in createUsersService and are exposed through db.
const getUserById = async (userId) => {
  if (!userId) {
    return { data: null, error: new Error('ID de usuario requerido') }
  }

  const { data, error } = await supabase
    .from('users')
    .select('id, email, full_name, role, created_at, email_confirmed_at')
    .eq('id', userId)
    .maybeSingle()

  if (error?.code === 'PGRST116' || error?.status === 406) {
    return { data: null, error: null }
  }

  return { data: data || null, error: error || null }
}

export const usersService = {
  getUserById,
  getAdminAccessContext: (...args) => db.getAdminAccessContext(...args),
  updateUserRole: (...args) => db.updateUserRole(...args),
  deleteUser: (...args) => db.deleteUser(...args)
}

export default usersService

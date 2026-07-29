import { USER_ROLE_VALUES } from '../../types'

export const normalizeUserRole = (role) => String(role ?? '').trim().toLowerCase()

export const isValidUserRole = (role) => USER_ROLE_VALUES.includes(role)

export const updateUserRoleWithRpc = async ({
  rpc,
  userId,
  role,
  invalidateCache = () => {},
  logAudit = null
}) => {
  if (!userId) {
    return { data: null, error: new Error('ID de usuario requerido') }
  }

  const roleValue = normalizeUserRole(role)

  if (!isValidUserRole(roleValue)) {
    return { data: null, error: new Error('invalid_role') }
  }

  const { data, error } = await rpc('admin_update_user_role', {
    p_user_id: userId,
    p_role: roleValue
  })

  if (error) {
    return { data: null, error }
  }

  const normalizedData = Array.isArray(data) ? data[0] : data

  invalidateCache(userId)

  if (normalizedData && typeof logAudit === 'function') {
    await logAudit({
      action: 'role_changed',
      details: `Rol actualizado a "${roleValue}"`,
      target_id: userId,
      target_email: null,
      target_name: null,
      metadata: { role: roleValue }
    })
  }

  return { data: normalizedData, error: null }
}

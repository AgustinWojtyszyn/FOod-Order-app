import { supabase, supabaseService, sanitizeQuery } from './supabase'
import { validateEmail, validatePassword } from '../utils'
import { handleError } from '../utils'

const hasUsableAccessToken = (session) => {
  const token = session?.access_token
  return typeof token === 'string' && token.split('.').length === 3 && token.split('.').every(Boolean)
}

class AuthService {
  // Registro de usuario con validación
  async signUp(email, password, metadata = {}) {
    try {
      // Validaciones
      if (!validateEmail(email)) {
        throw new Error('Correo electrónico inválido')
      }

      if (!validatePassword(password)) {
        throw new Error('La contraseña debe tener al menos 6 caracteres')
      }

      const sanitizedMetadata = sanitizeQuery(metadata)

      // No retry: signUp no es idempotente y puede enviar múltiples emails
      const { data, error } = await supabase.auth.signUp({
        email: email.toLowerCase().trim(),
        password,
        options: {
          data: sanitizedMetadata,
          emailRedirectTo: `${window.location.origin}/auth/callback`
        }
      })

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      return { data: null, error: handleError(error, 'signUp') }
    }
  }

  // Inicio de sesión con validación
  async signIn(email, password) {
    try {
      if (!validateEmail(email)) {
        throw new Error('Correo electrónico inválido')
      }

      if (!password) {
        throw new Error('Contraseña requerida')
      }

      const { data, error } = await supabaseService.withRetry(
        () => supabase.auth.signInWithPassword({
          email: email.toLowerCase().trim(),
          password,
          options: {
            persistSession: true
          }
        }),
        'signIn'
      )

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      return { data: null, error: handleError(error, 'signIn') }
    }
  }

  // Cerrar sesión
  async signOut() {
    try {
      const { error } = await supabaseService.withRetry(
        () => supabase.auth.signOut({ scope: 'local' }),
        'signOut'
      )

      if (error) {
        // fallback: limpiar storage local si el endpoint devolvió error
        import('../utils/clearSupabaseStorage').then(({ clearSupabaseStorage }) => clearSupabaseStorage())
        throw error
      }

      // Limpiar cache al cerrar sesión
      supabaseService.invalidateCache()

      return { error: null }
    } catch (error) {
      return { error: handleError(error, 'signOut') }
    }
  }

  // Reset de contraseña
  async resetPassword(email) {
    try {
      if (!validateEmail(email)) {
        throw new Error('Correo electrónico inválido')
      }
      const redirectTo = `${window.location.origin}/reset-password`
      if (import.meta.env.DEV) {
        console.debug('[auth-recovery] resetPassword redirectTo', redirectTo)
      }

      // No retry: resetPasswordForEmail no es idempotente y puede enviar múltiples emails
      const { data, error } = await supabase.auth.resetPasswordForEmail(email.toLowerCase().trim(), {
        redirectTo
      })

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      return { data: null, error: handleError(error, 'resetPassword') }
    }
  }

  // Actualizar contraseña
  async updatePassword(newPassword) {
    try {
      if (!validatePassword(newPassword)) {
        throw new Error('La contraseña debe tener al menos 6 caracteres')
      }

      const { data, error } = await supabaseService.withRetry(
        () => supabase.auth.updateUser({
          password: newPassword
        }),
        'updatePassword'
      )

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      return { data: null, error: handleError(error, 'updatePassword') }
    }
  }

  // Actualizar perfil
  async updateProfile(updates) {
    try {
      const sanitizedUpdates = sanitizeQuery(updates)
      const nextFullName = String(sanitizedUpdates.full_name || '').trim()
      const nextEmail = String(sanitizedUpdates.email || '').trim().toLowerCase()

      const updatePayload = {
        data: {
          ...sanitizedUpdates,
          full_name: nextFullName
        }
      }
      if (nextEmail) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
          throw new Error('Ingresá un correo válido.')
        }
        updatePayload.email = nextEmail
        delete updatePayload.data.email
      }

      // No retry cuando hay cambio de email: no es idempotente y puede disparar múltiples emails
      const { data, error } = nextEmail
        ? await supabase.auth.updateUser(updatePayload)
        : await supabaseService.withRetry(
            () => supabase.auth.updateUser(updatePayload),
            'updateProfile'
          )

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      return { data: null, error: handleError(error, 'updateProfile') }
    }
  }

  // Obtener usuario actual
  async getUser() {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()

      if (sessionError) throw sessionError

      if (!hasUsableAccessToken(session)) {
        return { user: null, error: null }
      }

      const { data: { user }, error } = await supabase.auth.getUser()

      if (error) throw error

      return { user, error: null }
    } catch (error) {
      return { user: null, error: handleError(error, 'getUser') }
    }
  }

  // Obtener sesión actual
  async getSession() {
    try {
      const { data: { session }, error } = await supabase.auth.getSession()

      if (error) throw error

      return { session, error: null }
    } catch (error) {
      return { session: null, error: handleError(error, 'getSession') }
    }
  }

  // Listener de cambios de autenticación
  onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange(callback)
  }

  // Verificar si el usuario está autenticado
  async isAuthenticated() {
    const { session } = await this.getSession()
    return hasUsableAccessToken(session)
  }

  // Refresh token manual
  async refreshSession() {
    try {
      const { data, error } = await supabase.auth.refreshSession()

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      return { data: null, error: handleError(error, 'refreshSession') }
    }
  }
}

// Instancia singleton del servicio
export const authService = new AuthService()
export default authService

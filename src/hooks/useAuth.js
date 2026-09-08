import { useState, useEffect, useCallback, useRef } from 'react'
import { authService } from '../services/auth'
import { usersService } from '../services/users'
import { setTelemetryAuthState } from '../services/supabase'
import {
  createPermissionTimeoutError,
  fetchPermissionAccessContext,
  withPermissionTimeout
} from '../utils/authPermissionValidation'

const ROLE_VALIDATION_TIMEOUT_MS = 7000
const ACCESS_CONTEXT_TIMEOUT_MS = 5000
const ACCESS_CONTEXT_RETRY_ATTEMPTS = 2
const ACCESS_CONTEXT_RETRY_DELAY_MS = 350

export const useAuth = () => {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [permissionLoading, setPermissionLoading] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isCompanyAdmin, setIsCompanyAdmin] = useState(false)
  const [canViewConsumptionReport, setCanViewConsumptionReport] = useState(false)
  const [canCreateLateAdminExtraOrder, setCanCreateLateAdminExtraOrder] = useState(false)
  const [canManageLateExtraHistory, setCanManageLateExtraHistory] = useState(false)
  const [canManageOrderDiscounts, setCanManageOrderDiscounts] = useState(false)
  const [adminCompanies, setAdminCompanies] = useState([])
  const [permissionError, setPermissionError] = useState(null)
  const roleRequestIdRef = useRef(0)
  const mountedRef = useRef(true)
  const refreshInFlightRef = useRef(null)

  const logRoleDebug = useCallback((...args) => {
    if (import.meta.env.DEV) {
      console.log('[Auth][role-debug]', ...args)
    }
  }, [])

  const validateUserRole = useCallback(async (authUser) => {
    const requestId = roleRequestIdRef.current + 1
    roleRequestIdRef.current = requestId
    if (!mountedRef.current) {
      return { data: null, error: null, cancelled: true }
    }

    setPermissionLoading(true)
    setPermissionError(null)
    setIsAdmin(false)
    setIsCompanyAdmin(false)
    setCanViewConsumptionReport(false)
    setCanCreateLateAdminExtraOrder(false)
    setCanManageLateExtraHistory(false)
    setCanManageOrderDiscounts(false)
    setAdminCompanies([])

    try {
      if (import.meta.env.DEV) {
        console.log('[Auth] validateUserRole start', authUser?.id)
      }

      let roleFromDb = null
      let roleError = null
      let accessContext = null
      let accessContextError = null
      let accessContextAttempts = 0

      if (authUser?.id) {
        const roleRequest = withPermissionTimeout(
          usersService.getUserById(authUser.id),
          ROLE_VALIDATION_TIMEOUT_MS,
          createPermissionTimeoutError
        )
          .then(({ data, error }) => ({ data: data || null, error: error || null }))
          .catch((error) => ({ data: null, error }))

        const accessContextRequest = fetchPermissionAccessContext(
          () => usersService.getAdminAccessContext(),
          {
            attempts: ACCESS_CONTEXT_RETRY_ATTEMPTS,
            timeoutMs: ACCESS_CONTEXT_TIMEOUT_MS,
            retryDelayMs: ACCESS_CONTEXT_RETRY_DELAY_MS
          }
        )

        const [roleResult, accessResult] = await Promise.all([
          roleRequest,
          accessContextRequest
        ])

        roleError = roleResult.error || null
        roleFromDb = roleResult.data?.role || null
        accessContextError = accessResult.error || null
        accessContext = accessResult.data || null
        accessContextAttempts = accessResult.attempts || 0

        if (roleError && import.meta.env.DEV) {
          console.warn('[Auth][role-debug] error fetching role from db', roleError)
        }

        if (accessContextError && import.meta.env.DEV) {
          console.warn('[Auth][role-debug] error fetching admin access context', accessContextError)
        }
      }

      const normalizedRole = roleFromDb || null
      const contextCompanies = Array.isArray(accessContext?.companies) ? accessContext.companies : []
      const isAdminRole = normalizedRole === 'admin' || accessContext?.is_global_admin === true
      const isCompanyAdminRole = !isAdminRole && (accessContext?.is_company_admin === true || contextCompanies.length > 0)
      const canViewConsumption = isAdminRole || accessContext?.can_view_consumption_report === true
      const canCreateLateExtra = accessContext?.can_create_late_admin_extra_order === true
      const canManageLateHistory = accessContext?.can_manage_late_extra_history === true
      const canManageDiscounts = accessContext?.can_manage_order_discounts === true

      logRoleDebug('raw user metadata', {
        id: authUser?.id,
        email: authUser?.email,
        roleFromDb,
        roleError,
        accessContextAttempts,
        accessContextError,
        app_metadata: authUser?.app_metadata,
        user_metadata: authUser?.user_metadata
      })

      if (!mountedRef.current || roleRequestIdRef.current !== requestId) {
        return { data: null, error: null, cancelled: true }
      }

      setUser((prev) => (prev ? { ...prev, ...authUser, role: normalizedRole } : { ...authUser, role: normalizedRole }))
      setIsAdmin(isAdminRole)
      setIsCompanyAdmin(isCompanyAdminRole)
      setCanViewConsumptionReport(canViewConsumption)
      setCanCreateLateAdminExtraOrder(canCreateLateExtra)
      setCanManageLateExtraHistory(canManageLateHistory)
      setCanManageOrderDiscounts(canManageDiscounts)
      setAdminCompanies(contextCompanies)

      // Access context is the canonical source for protected-route permissions.
      // A failure here must never be interpreted as "the user has no permission".
      setPermissionError(accessContextError)

      logRoleDebug('computed flags', {
        isAdmin: isAdminRole,
        isCompanyAdmin: isCompanyAdminRole,
        canViewConsumptionReport: canViewConsumption,
        canCreateLateAdminExtraOrder: canCreateLateExtra,
        canManageLateExtraHistory: canManageLateHistory,
        canManageOrderDiscounts: canManageDiscounts,
        adminCompanies: contextCompanies,
        permissionError: accessContextError
      })

      return {
        data: {
          user: authUser,
          isAdmin: isAdminRole,
          isCompanyAdmin: isCompanyAdminRole,
          canViewConsumptionReport: canViewConsumption,
          canCreateLateAdminExtraOrder: canCreateLateExtra,
          canManageLateExtraHistory: canManageLateHistory,
          canManageOrderDiscounts: canManageDiscounts,
          adminCompanies: contextCompanies
        },
        error: accessContextError
      }
    } catch (error) {
      console.error('Error validating user role:', error)
      if (!mountedRef.current || roleRequestIdRef.current !== requestId) {
        return { data: null, error, cancelled: true }
      }

      setUser((prev) => prev || authUser)
      setIsAdmin(false)
      setIsCompanyAdmin(false)
      setCanViewConsumptionReport(false)
      setCanCreateLateAdminExtraOrder(false)
      setCanManageLateExtraHistory(false)
      setCanManageOrderDiscounts(false)
      setAdminCompanies([])
      setPermissionError(error)
      return { data: null, error }
    } finally {
      if (mountedRef.current && roleRequestIdRef.current === requestId) {
        setPermissionLoading(false)
      }
      if (import.meta.env.DEV) {
        console.log('[Auth] validateUserRole done')
      }
    }
  }, [logRoleDebug])

  // Cargar usuario inicial
  useEffect(() => {
    mountedRef.current = true
    setTelemetryAuthState({ initialized: false, session: null, user: null })

    const initializeAuth = async () => {
      try {
        const { session, error } = await authService.getSession()

        if (error) {
          if (import.meta.env.DEV) {
            console.error('[Auth] getSession error', error)
          }
          throw error
        }

        if (import.meta.env.DEV) {
          console.log('[Auth] initial session', session ? 'found' : 'none')
        }

        if (session?.access_token) {
          const { user: currentUser, error: userError } = await authService.getUser()
          if (userError && import.meta.env.DEV) {
            console.warn('[Auth] getUser error after session restore', userError)
          }

          if (!currentUser) {
            roleRequestIdRef.current += 1
            setUser(null)
            setSession(null)
            setIsAdmin(false)
            setIsCompanyAdmin(false)
            setCanViewConsumptionReport(false)
            setCanCreateLateAdminExtraOrder(false)
            setCanManageLateExtraHistory(false)
            setCanManageOrderDiscounts(false)
            setAdminCompanies([])
            setPermissionError(userError || null)
            setPermissionLoading(false)
            setTelemetryAuthState({ initialized: true, session: null, user: null })
            setLoading(false)
            return
          }

          setUser(currentUser)
          setSession(session)
          setTelemetryAuthState({ initialized: true, session, user: currentUser })
          setLoading(false)
          validateUserRole(currentUser)
        } else {
          roleRequestIdRef.current += 1
          setUser(null)
          setSession(null)
          setIsAdmin(false)
          setIsCompanyAdmin(false)
          setCanViewConsumptionReport(false)
          setCanCreateLateAdminExtraOrder(false)
          setCanManageLateExtraHistory(false)
          setCanManageOrderDiscounts(false)
          setAdminCompanies([])
          setPermissionError(null)
          setPermissionLoading(false)
          setTelemetryAuthState({ initialized: true, session: null, user: null })
          setLoading(false)
        }
      } catch (error) {
        console.error('Error initializing auth:', error)
        roleRequestIdRef.current += 1
        setUser(null)
        setSession(null)
        setIsAdmin(false)
        setIsCompanyAdmin(false)
        setCanViewConsumptionReport(false)
        setCanCreateLateAdminExtraOrder(false)
        setCanManageLateExtraHistory(false)
        setCanManageOrderDiscounts(false)
        setAdminCompanies([])
        setPermissionError(error)
        setPermissionLoading(false)
        setTelemetryAuthState({ initialized: true, session: null, user: null })
        setLoading(false)
      }
    }

    initializeAuth()

    // Listener para cambios de autenticación
    const { data: { subscription } } = authService.onAuthStateChange(async (event, nextSession) => {
      if (import.meta.env.DEV) {
        console.log('[Auth] onAuthStateChange', event, nextSession ? 'has session' : 'no session')
      }
      if (event === 'SIGNED_IN' && nextSession?.access_token && nextSession?.user) {
        setUser(nextSession.user)
        setSession(nextSession)
        setTelemetryAuthState({ initialized: true, session: nextSession, user: nextSession.user })
        setLoading(false)
        validateUserRole(nextSession.user)
      } else if (event === 'SIGNED_OUT') {
        roleRequestIdRef.current += 1
        setUser(null)
        setSession(null)
        setIsAdmin(false)
        setIsCompanyAdmin(false)
        setCanViewConsumptionReport(false)
        setCanCreateLateAdminExtraOrder(false)
        setCanManageLateExtraHistory(false)
        setCanManageOrderDiscounts(false)
        setAdminCompanies([])
        setPermissionError(null)
        setPermissionLoading(false)
        setTelemetryAuthState({ initialized: true, session: null, user: null })
        setLoading(false)
      }
    })

    return () => {
      mountedRef.current = false
      roleRequestIdRef.current += 1
      setTelemetryAuthState({ initialized: false, session: null, user: null })
      subscription.unsubscribe()
    }
  }, [validateUserRole])

  const signIn = useCallback(async (email, password) => {
    setLoading(true)
    try {
      const result = await authService.signIn(email, password)

      if (result.error) {
        setLoading(false)
        return result
      }

      // Usuario ya se cargará automáticamente por el listener
      return result
    } catch (error) {
      setLoading(false)
      return { data: null, error }
    }
  }, [])

  const signUp = useCallback(async (email, password, metadata = {}) => {
    setLoading(true)
    try {
      const result = await authService.signUp(email, password, metadata)

      if (result.error) {
        setLoading(false)
        return result
      }

      // Usuario ya se cargará automáticamente por el listener
      return result
    } catch (error) {
      setLoading(false)
      return { data: null, error }
    }
  }, [])

  const signOut = useCallback(async () => {
    setLoading(true)
    setTelemetryAuthState({ initialized: true, session: null, user: null })
    try {
      const result = await authService.signOut()

      if (result.error) {
        setLoading(false)
        return result
      }

      // Usuario ya se limpiará automáticamente por el listener
      return result
    } catch (error) {
      setLoading(false)
      return { data: null, error }
    }
  }, [])

  const updateProfile = useCallback(async (updates) => {
    if (!user) return { error: { message: 'Usuario no autenticado' } }

    try {
      const result = await authService.updateProfile(updates)

      if (result.error) {
        return result
      }

      // Actualizar estado local
      setUser(prev => prev ? { ...prev, ...updates } : null)

      return result
    } catch (error) {
      return { data: null, error }
    }
  }, [user])

  const updatePassword = useCallback(async (newPassword) => {
    try {
      return await authService.updatePassword(newPassword)
    } catch (error) {
      return { data: null, error }
    }
  }, [])

  const resetPassword = useCallback(async (email) => {
    try {
      return await authService.resetPassword(email)
    } catch (error) {
      return { data: null, error }
    }
  }, [])

  const refreshSession = useCallback(async () => {
    try {
      if (refreshInFlightRef.current) {
        return await refreshInFlightRef.current
      }

      refreshInFlightRef.current = authService.refreshSession()
      const result = await refreshInFlightRef.current

      if (result.error) {
        return result
      }

      // Recargar datos del usuario si es necesario
      if (result.data?.user) {
        setUser(result.data.user)
        setSession(result.data.session || null)
        setTelemetryAuthState({
          initialized: true,
          session: result.data.session || null,
          user: result.data.user
        })
        validateUserRole(result.data.user)
      }

      return result
    } catch (error) {
      return { data: null, error }
    } finally {
      refreshInFlightRef.current = null
    }
  }, [validateUserRole])

  const refreshPermissions = useCallback(async () => {
    if (!user) return { data: null, error: new Error('Usuario no autenticado') }
    return validateUserRole(user)
  }, [user, validateUserRole])

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('[Auth] state', { user, loading, permissionLoading, isAdmin, isCompanyAdmin, canViewConsumptionReport, canCreateLateAdminExtraOrder, canManageLateExtraHistory, canManageOrderDiscounts, adminCompanies, permissionError })
    }
  }, [user, loading, permissionLoading, isAdmin, isCompanyAdmin, canViewConsumptionReport, canCreateLateAdminExtraOrder, canManageLateExtraHistory, canManageOrderDiscounts, adminCompanies, permissionError])

  return {
    // Estado
    user,
    session,
    loading,
    permissionLoading,
    isAdmin,
    isCompanyAdmin,
    canViewConsumptionReport,
    canCreateLateAdminExtraOrder,
    canManageLateExtraHistory,
    canManageOrderDiscounts,
    canAccessAdminPanel: isAdmin || isCompanyAdmin,
    adminCompanies,
    permissionError,
    isAuthenticated: !!user,

    // Acciones
    signIn,
    signUp,
    signOut,
    updateProfile,
    updatePassword,
    resetPassword,
    refreshSession,
    refreshPermissions
  }
}

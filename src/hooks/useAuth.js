import { useState, useEffect, useCallback, useRef } from 'react'
import { authService } from '../services/auth'
import { usersService } from '../services/users'
import { setTelemetryAuthState } from '../services/supabase'

const ROLE_VALIDATION_TIMEOUT_MS = 7000

const createPermissionTimeoutError = () => new Error('No pudimos validar tus permisos a tiempo.')

const withTimeout = (promise, timeoutMs, createError) => {
  let timeoutId

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(createError())
    }, timeoutMs)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    window.clearTimeout(timeoutId)
  })
}

export const useAuth = () => {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [permissionLoading, setPermissionLoading] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isCompanyAdmin, setIsCompanyAdmin] = useState(false)
  const [isHumanResources, setIsHumanResources] = useState(false)
  const [adminCompanies, setAdminCompanies] = useState([])
  const [humanResourcesCompanies, setHumanResourcesCompanies] = useState([])
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
    if (!mountedRef.current) return
    setPermissionLoading(true)
    setPermissionError(null)
    setIsAdmin(false)
    setIsCompanyAdmin(false)
    setIsHumanResources(false)
    setAdminCompanies([])
    setHumanResourcesCompanies([])

    try {
      if (import.meta.env.DEV) {
        console.log('[Auth] validateUserRole start', authUser?.id)
      }
      let roleFromDb = null
      let roleError = null
      let accessContext = null
      let humanResourcesContext = null

      if (authUser?.id) {
        try {
          const { data, error } = await withTimeout(
            usersService.getUserById(authUser.id),
            ROLE_VALIDATION_TIMEOUT_MS,
            createPermissionTimeoutError
          )
          roleError = error || null
          roleFromDb = data?.role || null
        } catch (err) {
          roleError = err
          if (import.meta.env.DEV) {
            console.warn('[Auth][role-debug] error fetching role from db', err)
          }
        }

        try {
          const { data, error } = await withTimeout(
            usersService.getAdminAccessContext(),
            ROLE_VALIDATION_TIMEOUT_MS,
            createPermissionTimeoutError
          )
          if (!error) accessContext = data || null
        } catch (err) {
          if (import.meta.env.DEV) {
            console.warn('[Auth][role-debug] error fetching admin access context', err)
          }
        }

        try {
          const { data, error } = await withTimeout(
            usersService.getHumanResourcesAccessContext(),
            ROLE_VALIDATION_TIMEOUT_MS,
            createPermissionTimeoutError
          )
          if (!error) humanResourcesContext = data || null
        } catch (err) {
          if (import.meta.env.DEV) {
            console.warn('[Auth][role-debug] error fetching human resources access context', err)
          }
        }
      }

      const normalizedRole = roleFromDb || null
      const contextCompanies = Array.isArray(accessContext?.companies) ? accessContext.companies : []
      const hrCompanies = Array.isArray(humanResourcesContext?.companies) ? humanResourcesContext.companies : []
      const isAdminRole = normalizedRole === 'admin' || accessContext?.is_global_admin === true
      const isCompanyAdminRole = !isAdminRole && (accessContext?.is_company_admin === true || contextCompanies.length > 0)
      const isHumanResourcesRole = normalizedRole === 'human_resources' || humanResourcesContext?.is_human_resources === true

      logRoleDebug('raw user metadata', {
        id: authUser?.id,
        email: authUser?.email,
        roleFromDb,
        app_metadata: authUser?.app_metadata,
        user_metadata: authUser?.user_metadata
      })

      if (!mountedRef.current || roleRequestIdRef.current !== requestId) return

      setUser((prev) => (prev ? { ...prev, ...authUser, role: normalizedRole } : { ...authUser, role: normalizedRole }))
      setIsAdmin(isAdminRole)
      setIsCompanyAdmin(isCompanyAdminRole)
      setIsHumanResources(isHumanResourcesRole)
      setAdminCompanies(contextCompanies)
      setHumanResourcesCompanies(hrCompanies)
      setPermissionError(roleError)

      logRoleDebug('computed flags', {
        isAdmin: isAdminRole,
        isCompanyAdmin: isCompanyAdminRole,
        isHumanResources: isHumanResourcesRole,
        adminCompanies: contextCompanies,
        humanResourcesCompanies: hrCompanies,
        permissionError: roleError
      })
    } catch (error) {
      console.error('Error validating user role:', error)
      if (!mountedRef.current || roleRequestIdRef.current !== requestId) return
      setUser((prev) => prev || authUser)
      setIsAdmin(false)
      setIsCompanyAdmin(false)
      setIsHumanResources(false)
      setAdminCompanies([])
      setHumanResourcesCompanies([])
      setPermissionError(error)
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
            setIsHumanResources(false)
            setAdminCompanies([])
            setHumanResourcesCompanies([])
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
          setIsHumanResources(false)
          setAdminCompanies([])
          setHumanResourcesCompanies([])
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
        setIsHumanResources(false)
        setAdminCompanies([])
        setHumanResourcesCompanies([])
        setPermissionError(error)
        setPermissionLoading(false)
        setTelemetryAuthState({ initialized: true, session: null, user: null })
        setLoading(false)
      }
    }

    initializeAuth()

    // Listener para cambios de autenticación
    const { data: { subscription } } = authService.onAuthStateChange(async (event, session) => {
      if (import.meta.env.DEV) {
        console.log('[Auth] onAuthStateChange', event, session ? 'has session' : 'no session')
      }
      if (event === 'SIGNED_IN' && session?.access_token && session?.user) {
        setUser(session.user)
        setSession(session)
        setTelemetryAuthState({ initialized: true, session, user: session.user })
        setLoading(false)
        validateUserRole(session.user)
      } else if (event === 'SIGNED_OUT') {
        roleRequestIdRef.current += 1
        setUser(null)
        setSession(null)
        setIsAdmin(false)
        setIsCompanyAdmin(false)
        setIsHumanResources(false)
        setAdminCompanies([])
        setHumanResourcesCompanies([])
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

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('[Auth] state', { user, loading, permissionLoading, isAdmin, isCompanyAdmin, isHumanResources, adminCompanies, humanResourcesCompanies, permissionError })
    }
  }, [user, loading, permissionLoading, isAdmin, isCompanyAdmin, isHumanResources, adminCompanies, humanResourcesCompanies, permissionError])

  return {
    // Estado
    user,
    session,
    loading,
    permissionLoading,
    isAdmin,
    isCompanyAdmin,
    isHumanResources,
    canAccessAdminPanel: isAdmin || isCompanyAdmin,
    canAccessBirthdays: isAdmin || isCompanyAdmin || isHumanResources,
    adminCompanies,
    humanResourcesCompanies,
    permissionError,
    isAuthenticated: !!user,

    // Acciones
    signIn,
    signUp,
    signOut,
    updateProfile,
    updatePassword,
    resetPassword,
    refreshSession
  }
}

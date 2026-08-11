import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import RequireAdmin from './RequireAdmin'
import { useAuthContext } from '../contexts/authContextValue'

const PERMISSION_VALIDATION_TIMEOUT_MS = 7000

const Loader = () => (
  <div className="min-h-dvh flex items-center justify-center bg-linear-to-br from-primary-700 via-primary-800 to-primary-900">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-white/30 border-t-white mx-auto mb-4"></div>
      <p className="text-white font-medium">Verificando permisos...</p>
    </div>
  </div>
)

const Denied = () => (
  <div className="min-h-dvh flex items-center justify-center bg-linear-to-br from-primary-700 via-primary-800 to-primary-950 px-5 py-10">
    <main className="w-full max-w-md rounded-lg border border-white/20 bg-white/10 px-6 py-8 text-center text-white shadow-2xl backdrop-blur-md">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/75">Acceso restringido</p>
      <h1 className="mt-3 text-3xl font-bold">Cumpleaños</h1>
      <p className="mt-4 text-base leading-7 text-white/90">No tenés permisos para acceder a esta sección.</p>
      <a href="/dashboard" className="mt-7 inline-flex min-h-11 items-center justify-center rounded-lg bg-white px-5 py-3 text-sm font-semibold text-slate-900">
        Ir al dashboard
      </a>
    </main>
  </div>
)

export const RequireNonHumanResources = ({ children }) => {
  const { user, loading, permissionLoading, isHumanResources } = useAuthContext()
  const location = useLocation()
  const isValidating = loading || permissionLoading

  if (isValidating) return <Loader />
  if (!user?.id) {
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }
  if (isHumanResources) return <Denied />
  return <>{children}</>
}

export default function RequireBirthdayAccess({ children }) {
  const { user, loading, permissionLoading, isHumanResources, canAccessBirthdays, permissionError } = useAuthContext()
  const location = useLocation()
  const [validationTimedOut, setValidationTimedOut] = useState(false)
  const isValidating = loading || permissionLoading

  useEffect(() => {
    if (!isValidating) {
      setValidationTimedOut(false)
      return undefined
    }
    const timeoutId = window.setTimeout(() => setValidationTimedOut(true), PERMISSION_VALIDATION_TIMEOUT_MS)
    return () => window.clearTimeout(timeoutId)
  }, [isValidating])

  if (isValidating) return validationTimedOut ? <Denied /> : <Loader />
  if (!user?.id) {
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }
  if (permissionError || !canAccessBirthdays) return <Denied />

  if (!isHumanResources) {
    return <RequireAdmin>{children}</RequireAdmin>
  }

  return <>{children}</>
}

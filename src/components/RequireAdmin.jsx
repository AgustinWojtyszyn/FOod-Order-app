import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuthContext } from '../contexts/authContextValue'
import serviFoodLogo from '../assets/servifood_logo_white_text_HQ.png'

const PERMISSION_VALIDATION_TIMEOUT_MS = 12000

const AdminLoader = () => (
  <div
    className="min-h-dvh flex items-center justify-center bg-linear-to-br from-primary-700 via-primary-800 to-primary-900"
    style={{ backgroundImage: 'linear-gradient(135deg, #1d4ed8 0%, #1e40af 52%, #172554 100%)' }}
  >
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-white/30 border-t-white mx-auto mb-4"></div>
      <p className="text-white font-medium">Verificando permisos...</p>
    </div>
  </div>
)

const AccessDeniedScreen = ({ variant = 'denied', onRetry = null, retrying = false }) => {
  const isValidationError = variant === 'validation-error'

  return (
    <div
      className="min-h-dvh flex items-center justify-center bg-linear-to-br from-primary-700 via-primary-800 to-primary-950 px-5 py-10"
      style={{ backgroundImage: 'linear-gradient(135deg, #1d4ed8 0%, #1e40af 52%, #172554 100%)' }}
    >
      <main className="w-full max-w-md text-center text-white">
        <img
          src={serviFoodLogo}
          alt="ServiFood"
          className="mx-auto mb-9 h-auto w-44 max-w-[70vw] object-contain sm:w-56"
        />

        <section className="rounded-lg border border-white/20 bg-white/10 px-6 py-8 shadow-2xl shadow-black/20 backdrop-blur-md sm:px-8">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/75">
            Acceso restringido
          </p>
          <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
            Ruta protegida
          </h1>
          <p className="mt-4 text-base leading-7 text-white/90">
            {isValidationError
              ? 'No pudimos validar tus permisos. Podés reintentar sin cerrar sesión.'
              : 'No tenés permisos para acceder a esta sección.'}
          </p>
          {!isValidationError && (
            <p className="mt-2 text-sm leading-6 text-white/70">
              Si creés que esto es un error, contactá a un administrador.
            </p>
          )}

          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {isValidationError && typeof onRetry === 'function' && (
              <button
                type="button"
                onClick={onRetry}
                disabled={retrying}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-emerald-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-black/15 transition hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-70 sm:w-auto"
              >
                {retrying ? 'Validando...' : 'Reintentar permisos'}
              </button>
            )}

            <Link
              to="/dashboard"
              replace
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-black/15 transition hover:bg-primary-50 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-primary-900 sm:w-auto"
            >
              Ir al dashboard
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}

export default function RequireAdmin({ children }) {
  const {
    user,
    loading,
    permissionLoading,
    isAdmin,
    isCompanyAdmin,
    canAccessAdminPanel,
    canViewConsumptionReport,
    permissionError,
    refreshPermissions
  } = useAuthContext()
  const location = useLocation()
  const [validationTimedOut, setValidationTimedOut] = useState(false)
  const isValidating = loading || permissionLoading

  useEffect(() => {
    if (!isValidating) {
      setValidationTimedOut(false)
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      setValidationTimedOut(true)
    }, PERMISSION_VALIDATION_TIMEOUT_MS)

    return () => window.clearTimeout(timeoutId)
  }, [isValidating])

  const retryPermissionValidation = async () => {
    setValidationTimedOut(false)
    await refreshPermissions?.()
  }

  if (isValidating) {
    if (validationTimedOut) {
      return (
        <AccessDeniedScreen
          variant="validation-error"
          onRetry={retryPermissionValidation}
          retrying={permissionLoading}
        />
      )
    }

    return <AdminLoader />
  }

  if (!user?.id) {
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }

  if (permissionError) {
    return (
      <AccessDeniedScreen
        variant="validation-error"
        onRetry={retryPermissionValidation}
        retrying={permissionLoading}
      />
    )
  }

  const isConsumptionReportPath = location.pathname === '/consumption-report'

  if (!canAccessAdminPanel && !(canViewConsumptionReport && isConsumptionReportPath)) {
    return <AccessDeniedScreen />
  }

  if (!isAdmin && !isCompanyAdmin && canViewConsumptionReport && !isConsumptionReportPath) {
    return <AccessDeniedScreen />
  }

  if (!isAdmin && isConsumptionReportPath && canViewConsumptionReport) {
    return <>{children}</>
  }

  const companyAdminAllowedPaths = ['/admin', '/labels', '/daily-orders']

  if (!isAdmin && isCompanyAdmin && !companyAdminAllowedPaths.includes(location.pathname)) {
    return <AccessDeniedScreen />
  }

  return <>{children}</>
}

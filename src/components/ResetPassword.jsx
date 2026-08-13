import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { Eye, EyeOff, CheckCircle } from 'lucide-react'
import servifoodLogo from '../assets/servifood_logo_white_text_HQ.png'
import { getUserFriendlyErrorMessage } from '../utils'
import {
  clearAuthLinkFromUrl,
  exchangeCodeForSessionOnce,
  getAuthLinkErrorMessage,
  getAuthLinkParams
} from '../utils/authLinks'

const ResetPassword = () => {
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: ''
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checkingRecovery, setCheckingRecovery] = useState(true)
  const [hasRecoverySession, setHasRecoverySession] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    let isMounted = true

    const initializeRecoverySession = async () => {
      setCheckingRecovery(true)
      const {
        code,
        type,
        tokenHash,
        accessToken,
        refreshToken,
        error,
        errorCode,
        errorDescription
      } = getAuthLinkParams()
      const hasRecoveryHints = Boolean(code || type === 'recovery' || tokenHash || accessToken)

      console.info('[auth-recovery] enter /reset-password', {
        hasCode: Boolean(code),
        type: type || null,
        hasTokenHash: Boolean(tokenHash),
        hasAccessToken: Boolean(accessToken),
        hasRefreshToken: Boolean(refreshToken),
        hasRecoveryHints
      })

      try {
        const linkErrorMessage = getAuthLinkErrorMessage({ error, errorCode, errorDescription })
        if (linkErrorMessage) {
          if (!isMounted) return
          setHasRecoverySession(false)
          setError(linkErrorMessage)
          clearAuthLinkFromUrl()
          return
        }

        // PKCE: el link trae `code` y requiere exchange explícito para obtener sesión válida.
        if (code) {
          const { error: exchangeError } = await exchangeCodeForSessionOnce(supabase, code)
          console.info('[auth-recovery] exchangeCodeForSession', {
            ok: !exchangeError,
            hasError: Boolean(exchangeError)
          })

          if (exchangeError) {
            if (!isMounted) return
            setHasRecoverySession(false)
            setError('El enlace de recuperación es inválido o expiró. Pedí uno nuevo.')
            return
          }

          clearAuthLinkFromUrl()
        }
        // Implicit recovery: algunos links llegan con access_token/refresh_token en el hash.
        else if (accessToken && refreshToken && (!type || type === 'recovery')) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          })
          console.info('[auth-recovery] setSession(access_token)', {
            ok: !sessionError,
            hasError: Boolean(sessionError)
          })

          if (sessionError) {
            if (!isMounted) return
            setHasRecoverySession(false)
            setError('El enlace de recuperación es inválido o expiró. Pedí uno nuevo.')
            return
          }

          clearAuthLinkFromUrl()
        }
        // OTP recovery: el link trae `token_hash` + `type=recovery`.
        else if (tokenHash && type === 'recovery') {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            type: 'recovery',
            token_hash: tokenHash
          })
          console.info('[auth-recovery] verifyOtp(recovery)', {
            ok: !verifyError,
            hasError: Boolean(verifyError)
          })

          if (verifyError) {
            if (!isMounted) return
            setHasRecoverySession(false)
            setError('El enlace de recuperación es inválido o expiró. Pedí uno nuevo.')
            return
          }

          clearAuthLinkFromUrl()
        }

        const { data: { session } } = await supabase.auth.getSession()
        console.info('[auth-recovery] getSession', { hasSession: Boolean(session) })

        if (!isMounted) return
        if (!session) {
          setHasRecoverySession(false)
          setError('Enlace inválido o expirado. Pedí uno nuevo.')
          return
        }

        setHasRecoverySession(true)
      } catch (err) {
        console.error('[auth-recovery] initializeRecoverySession error', err)
        if (!isMounted) return
        setHasRecoverySession(false)
        setError('No se pudo validar el enlace de recuperación. Pedí uno nuevo.')
      } finally {
        if (isMounted) {
          setCheckingRecovery(false)
        }
      }
    }

    initializeRecoverySession()

    return () => {
      isMounted = false
    }
  }, [])

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const validateForm = () => {
    if (formData.password !== formData.confirmPassword) {
      setError('Las contraseñas no coinciden')
      return false
    }
    if (formData.password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      return false
    }
    return true
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (checkingRecovery || !hasRecoverySession) return

    setLoading(true)
    setError('')

    if (!validateForm()) {
      setLoading(false)
      return
    }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      console.info('[auth-recovery] pre-update getSession', { hasSession: Boolean(session) })
      if (!session) {
        setError('La sesión de recuperación no es válida o expiró. Pedí un nuevo enlace.')
        setLoading(false)
        return
      }

      const { error: updErr } = await supabase.auth.updateUser({ password: formData.password })
      console.info('[auth-recovery] updateUser', { ok: !updErr, hasError: Boolean(updErr) })

      if (updErr) {
        setError(getUserFriendlyErrorMessage(updErr, 'No pudimos actualizar la contraseña. Intentá nuevamente.'))
        setLoading(false)
        return
      }

      setSuccess(true)
      await supabase.auth.signOut().catch(() => {})
      setTimeout(() => {
        navigate('/login?reset=ok')
      }, 1500)
    } catch (err) {
      setError(getUserFriendlyErrorMessage(err, 'No pudimos actualizar la contraseña. Intentá nuevamente.'))
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="w-full min-h-dvh flex flex-col justify-center items-center px-2 py-2 sm:py-4" style={{background: 'linear-gradient(to bottom right, #1a237e, #283593, #303f9f)', minHeight: '100dvh'}}>
        <div className="w-full max-w-md mx-auto flex flex-col justify-center items-center" style={{maxHeight: '98vh'}}>
          <div className="text-center bg-white rounded-2xl sm:rounded-3xl shadow-2xl p-6 sm:p-10 border-4 border-white/20 w-full">
            <div className="flex justify-center mb-4 sm:mb-6">
              <div className="bg-green-100 rounded-full p-3 sm:p-4">
                <CheckCircle className="h-14 w-14 sm:h-20 sm:w-20 text-green-600" />
              </div>
            </div>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-gray-900 mb-3 sm:mb-4">
              ¡Contraseña actualizada!
            </h2>
            <p className="text-base sm:text-lg text-gray-600 mb-4 sm:mb-6">
              Tu contraseña ha sido restablecida exitosamente.
            </p>
            <p className="text-sm sm:text-base text-gray-500 mb-4">
              Contraseña actualizada correctamente. Ya podés iniciar sesión.
            </p>
            <p className="text-sm sm:text-base text-gray-500">
              Redirigiendo al inicio de sesión...
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full min-h-dvh flex flex-col justify-center items-center px-2 py-2 sm:py-4" style={{background: 'linear-gradient(to bottom right, #1a237e, #283593, #303f9f)', minHeight: '100dvh'}}>
      <div className="w-full max-w-md mx-auto flex flex-col justify-center items-center" style={{maxHeight: '98vh'}}>
        <div className="text-center mb-2 sm:mb-6 pt-1 pb-1">
          <div className="flex justify-center mb-2 sm:mb-4">
            <img 
              src={servifoodLogo} 
              alt="Servifood Catering Logo" 
              className="max-h-20 sm:max-h-32 md:max-h-40 w-auto object-contain"
              style={{maxWidth: '90vw'}}
            />
          </div>
          <h2 className="text-xl sm:text-3xl md:text-4xl font-extrabold text-white drop-shadow-2xl mb-1 sm:mb-2">
            Nueva Contraseña
          </h2>
          <p className="text-sm sm:text-lg md:text-xl font-bold text-white drop-shadow-lg mb-1 sm:mb-2">
            Ingresa tu nueva contraseña
          </p>
          <p className="text-xs sm:text-sm mt-1">
            <Link to="/login" className="font-semibold hover:underline" style={{color: '#ffcc80'}}>
              ← Volver a iniciar sesión
            </Link>
          </p>
        </div>

        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl p-3 sm:p-8 border-4 border-white/20" style={{maxHeight: 'none', overflow: 'visible', minWidth: '320px', width: '100%'}}>
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="space-y-3 bg-red-50 border-2 border-red-400 text-red-800 px-5 py-4 rounded-xl font-bold text-base">
                <p>{error}</p>
                {!hasRecoverySession && !checkingRecovery && (
                  <Link
                    to="/forgot-password"
                    className="inline-flex w-full justify-center rounded-xl bg-red-700 px-4 py-3 text-white hover:bg-red-800"
                  >
                    Pedir nuevo enlace
                  </Link>
                )}
              </div>
            )}

            <div>
              <label htmlFor="password" className="block text-base font-bold text-gray-900 mb-2">
                Nueva Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  className="input-field pr-12 text-base font-medium bg-white text-gray-900"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 hover:text-primary-600 transition-colors"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-6 w-6" />
                  ) : (
                    <Eye className="h-6 w-6" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-base font-bold text-gray-900 mb-2">
                Repetir Contraseña
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  className="input-field pr-12 text-base font-medium bg-white text-gray-900"
                  placeholder="••••••••"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 hover:text-primary-600 transition-colors"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-6 w-6" />
                  ) : (
                    <Eye className="h-6 w-6" />
                  )}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading || checkingRecovery || !hasRecoverySession}
                className="w-full flex justify-center items-center disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 px-6 text-lg rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
                style={{background: loading ? '#9e9e9e' : 'linear-gradient(to right, #ff9800, #fb8c00)'}}
                onMouseEnter={(e) => !loading && (e.currentTarget.style.background = 'linear-gradient(to right, #fb8c00, #f57c00)')}
                onMouseLeave={(e) => !loading && (e.currentTarget.style.background = 'linear-gradient(to right, #ff9800, #fb8c00)')}
              >
                {loading || checkingRecovery ? (
                  <>
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mr-3"></div>
                    {checkingRecovery ? 'Validando enlace...' : 'Actualizando...'}
                  </>
                ) : (
                  'Actualizar Contraseña'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default ResetPassword

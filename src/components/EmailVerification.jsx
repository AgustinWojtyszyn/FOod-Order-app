import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { CheckCircle, XCircle, Loader } from 'lucide-react'

const EmailVerification = () => {
  const [verificationState, setVerificationState] = useState('loading') // loading, success, error
  const [message, setMessage] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    const handleEmailVerification = async () => {
      try {
        // Obtener el hash de la URL (contiene el token de verificación)
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        const accessToken = hashParams.get('access_token')
        const type = hashParams.get('type')

        if (type === 'signup' && accessToken) {
          // Establecer la sesión con el token de acceso
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: hashParams.get('refresh_token')
          })

          if (error) {
            throw error
          }

          if (data.user) {
            setVerificationState('success')
            setMessage('¡Tu correo ha sido verificado exitosamente! Ahora puedes iniciar sesión.')
            
            // Cerrar sesión automáticamente después de la verificación
            // para que el usuario inicie sesión normalmente
            setTimeout(async () => {
              await supabase.auth.signOut()
              navigate('/login')
            }, 3000)
          }
        } else {
          setVerificationState('error')
          setMessage('El enlace de verificación no es válido o ha expirado.')
        }
      } catch (error) {
        console.error('Error al verificar email:', error)
        setVerificationState('error')
        setMessage(error.message || 'Hubo un error al verificar tu correo electrónico.')
      }
    }

    handleEmailVerification()
  }, [navigate])

  return (
    <div 
      className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8" 
      style={{background: 'linear-gradient(to bottom right, #1a237e, #283593, #303f9f)'}}
    >
      <div className="max-w-md w-full">
        <div className="text-center bg-white rounded-3xl shadow-2xl p-10 border-4 border-white/20">
          {verificationState === 'loading' && (
            <>
              <div className="flex justify-center mb-6">
                <div className="bg-blue-100 rounded-full p-4">
                  <Loader className="h-20 w-20 text-blue-600 animate-spin" />
                </div>
              </div>
              <h2 className="text-3xl font-extrabold text-gray-900 mb-4">
                Verificando tu correo...
              </h2>
              <p className="text-lg text-gray-600">
                Por favor espera un momento mientras confirmamos tu email.
              </p>
            </>
          )}

          {verificationState === 'success' && (
            <>
              <div className="flex justify-center mb-6">
                <div className="bg-green-100 rounded-full p-4">
                  <CheckCircle className="h-20 w-20 text-green-600" />
                </div>
              </div>
              <h2 className="text-3xl font-extrabold text-green-600 mb-4">
                ¡Verificación exitosa!
              </h2>
              <p className="text-lg text-gray-700 mb-6">
                {message}
              </p>
              <div className="bg-green-50 border-2 border-green-300 rounded-xl p-4 mb-6">
                <p className="text-sm text-green-700">
                  ✅ Tu cuenta ha sido activada correctamente.
                  <br />
                  Serás redirigido automáticamente a la página de inicio de sesión...
                </p>
              </div>
              <Link
                to="/login"
                className="inline-block w-full text-white font-bold py-4 px-8 text-lg rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
                style={{background: 'linear-gradient(to right, #4caf50, #388e3c)'}}
              >
                Ir a Iniciar Sesión
              </Link>
            </>
          )}

          {verificationState === 'error' && (
            <>
              <div className="flex justify-center mb-6">
                <div className="bg-red-100 rounded-full p-4">
                  <XCircle className="h-20 w-20 text-red-600" />
                </div>
              </div>
              <h2 className="text-3xl font-extrabold text-red-600 mb-4">
                Error de verificación
              </h2>
              <p className="text-lg text-gray-700 mb-6">
                {message}
              </p>
              <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 mb-6">
                <p className="text-sm text-red-700">
                  ❌ No pudimos verificar tu correo electrónico.
                  <br />
                  El enlace puede haber expirado o ya fue utilizado.
                </p>
              </div>
              <div className="space-y-3">
                <Link
                  to="/login"
                  className="block w-full text-white font-bold py-4 px-8 text-lg rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
                  style={{background: 'linear-gradient(to right, #2196f3, #1976d2)'}}
                >
                  Ir a Iniciar Sesión
                </Link>
                <Link
                  to="/register"
                  className="block w-full text-gray-700 font-semibold py-3 px-6 text-base rounded-xl border-2 border-gray-300 hover:border-gray-400 hover:bg-gray-50 transition-all duration-200"
                >
                  Crear Nueva Cuenta
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default EmailVerification

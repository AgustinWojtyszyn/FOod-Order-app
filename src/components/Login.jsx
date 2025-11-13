import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth } from '../supabaseClient'
import { Eye, EyeOff } from 'lucide-react'
import servifoodLogo from '../assets/servifood logo.jpg'

const Login = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false
  })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleChange = (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setFormData({
      ...formData,
      [e.target.name]: value
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const { data, error } = await auth.signIn(formData.email, formData.password, formData.rememberMe)

      if (error) {
        // Mensajes de error más específicos
        if (error.message.includes('Email not confirmed')) {
          setError('📧 Debes verificar tu correo electrónico antes de iniciar sesión. Revisa tu bandeja de entrada y haz clic en el enlace de confirmación.')
        } else if (error.message.includes('Invalid login credentials')) {
          setError('❌ Correo o contraseña incorrectos. Por favor, verifica tus datos.')
        } else {
          setError(error.message || 'Error al iniciar sesión')
        }
      } else {
        // Verificar si el email está confirmado
        if (data?.user && !data.user.email_confirmed_at) {
          setError('📧 Tu correo electrónico aún no ha sido verificado. Por favor, revisa tu bandeja de entrada y confirma tu email antes de iniciar sesión.')
          await auth.signOut()
        } else {
          navigate('/')
        }
      }
    } catch (err) {
      setError('Error al iniciar sesión. Por favor, intenta nuevamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8" style={{background: 'linear-gradient(to bottom right, #1a237e, #283593, #303f9f)'}}>
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <img 
              src={servifoodLogo} 
              alt="Servifood Catering Logo" 
              className="h-40 w-auto"
            />
          </div>
          <h2 className="mt-8 text-5xl font-extrabold text-white drop-shadow-2xl">
            Bienvenido
          </h2>
          <p className="mt-4 text-xl font-semibold text-white drop-shadow-lg">
            Inicia sesión para continuar
          </p>
          <p className="mt-2 text-sm" style={{color: 'rgba(255, 255, 255, 0.8)'}}>
            ¿No tienes cuenta?{' '}
            <Link to="/register" className="font-semibold hover:underline" style={{color: '#ffa726'}}>
              Regístrate aquí
            </Link>
          </p>
        </div>

        <div className="card bg-white/95 backdrop-blur-sm shadow-2xl border-2 border-white/20">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 border-2 border-red-300 text-red-700 px-4 py-3 rounded-xl font-medium">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-gray-700">
                Correo electrónico
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="input-field mt-1 border-2 border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
                placeholder="tu@email.com"
                value={formData.email}
                onChange={handleChange}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-700">
                Contraseña
              </label>
              <div className="relative mt-1">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  className="input-field pr-10 border-2 border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-primary-600"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="rememberMe"
                  name="rememberMe"
                  type="checkbox"
                  checked={formData.rememberMe}
                  onChange={handleChange}
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded cursor-pointer"
                />
                <label htmlFor="rememberMe" className="ml-2 block text-sm text-gray-700 font-medium cursor-pointer">
                  Mantener sesión iniciada
                </label>
              </div>
              <Link to="/forgot-password" className="text-sm font-semibold hover:underline" style={{color: '#ffa726'}}>
                ¿Olvidaste tu contraseña?
              </Link>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full flex justify-center items-center disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
                style={{background: loading ? '#9e9e9e' : 'linear-gradient(to right, #ff9800, #fb8c00)'}}
                onMouseEnter={(e) => !loading && (e.currentTarget.style.background = 'linear-gradient(to right, #fb8c00, #f57c00)')}
                onMouseLeave={(e) => !loading && (e.currentTarget.style.background = 'linear-gradient(to right, #ff9800, #fb8c00)')}
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Iniciando sesión...
                  </>
                ) : (
                  'Iniciar Sesión'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default Login

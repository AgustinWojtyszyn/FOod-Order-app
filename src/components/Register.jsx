import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth } from '../supabaseClient'
import { Eye, EyeOff, CheckCircle } from 'lucide-react'
import servifoodLogo from '../assets/servifood logo.jpg'

const Register = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: ''
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const navigate = useNavigate()

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
    if (formData.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return false
    }
    return true
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (!validateForm()) {
      setLoading(false)
      return
    }

    try {
      const { error } = await auth.signUp(formData.email, formData.password, {
        full_name: formData.fullName
      })

      if (error) {
        setError(error.message)
      } else {
        setSuccess(true)
      }
    } catch (err) {
      setError('Error al crear la cuenta')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8" style={{background: 'linear-gradient(to bottom right, #1a237e, #283593, #303f9f)'}}>
        <div className="max-w-md w-full">
          <div className="text-center bg-white rounded-3xl shadow-2xl p-10 border-4 border-white/20">
            <div className="flex justify-center mb-6">
              <div className="bg-green-100 rounded-full p-4">
                <CheckCircle className="h-20 w-20 text-green-600" />
              </div>
            </div>
            <h2 className="text-4xl font-extrabold text-gray-900 mb-4">
              ¡Cuenta creada!
            </h2>
            <p className="text-lg text-gray-600 mb-6">
              Hemos enviado un enlace de confirmación a tu correo electrónico.
            </p>
            <p className="text-base text-gray-500 mb-8">
              Revisa tu bandeja de entrada y haz clic en el enlace para activar tu cuenta.
            </p>
            <div className="mt-6">
              <Link
                to="/login"
                className="inline-block text-white font-bold py-4 px-8 text-lg rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
                style={{background: 'linear-gradient(to right, #ff9800, #fb8c00)'}}
                onMouseEnter={(e) => e.currentTarget.style.background = 'linear-gradient(to right, #fb8c00, #f57c00)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'linear-gradient(to right, #ff9800, #fb8c00)'}
              >
                Ir al Inicio de Sesión
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8" style={{background: 'linear-gradient(to bottom right, #1a237e, #283593, #303f9f)'}}>
      <div className="max-w-md w-full">
        <div className="text-center mb-10">
          <div className="flex justify-center mb-8">
            <img 
              src={servifoodLogo} 
              alt="Servifood Catering Logo" 
              className="h-40 w-auto"
            />
          </div>
          <h2 className="text-6xl font-extrabold text-white drop-shadow-2xl mb-3">
            Crear Cuenta
          </h2>
          <p className="text-2xl font-bold text-white drop-shadow-lg mb-3">
            ¡Únete a ServiFood!
          </p>
          <p className="text-lg drop-shadow" style={{color: 'rgba(255, 255, 255, 0.9)'}}>
            ¿Ya tienes cuenta?{' '}
            <Link to="/login" className="font-bold hover:underline transition-colors" style={{color: '#ffa726'}}>
              Inicia sesión aquí
            </Link>
          </p>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-8 border-4 border-white/20">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 border-2 border-red-400 text-red-800 px-5 py-4 rounded-xl font-bold text-base">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="fullName" className="block text-base font-bold text-gray-800 mb-2">
                Nombre Completo
              </label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                autoComplete="name"
                required
                className="input-field text-base font-medium"
                placeholder="Juan Pérez"
                value={formData.fullName}
                onChange={handleChange}
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-base font-bold text-gray-800 mb-2">
                Correo Electrónico
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="input-field text-base font-medium"
                placeholder="tu@email.com"
                value={formData.email}
                onChange={handleChange}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-base font-bold text-gray-800 mb-2">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  className="input-field pr-12 text-base font-medium"
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
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-base font-bold text-gray-800 mb-2">
                Confirmar Contraseña
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  className="input-field pr-12 text-base font-medium"
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
                disabled={loading}
                className="w-full flex justify-center items-center disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 px-6 text-lg rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
                style={{background: loading ? '#9e9e9e' : 'linear-gradient(to right, #ff9800, #fb8c00)'}}
                onMouseEnter={(e) => !loading && (e.currentTarget.style.background = 'linear-gradient(to right, #fb8c00, #f57c00)')}
                onMouseLeave={(e) => !loading && (e.currentTarget.style.background = 'linear-gradient(to right, #ff9800, #fb8c00)')}
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mr-3"></div>
                    Creando tu cuenta...
                  </>
                ) : (
                  'Crear Cuenta Gratis'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default Register

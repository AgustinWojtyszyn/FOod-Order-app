import { Link } from 'react-router-dom'
import { ChefHat, ShoppingCart, Clock, Star, ArrowRight, CheckCircle } from 'lucide-react'
import servifoodLogo from '../assets/servifood logo.jpg'

const LandingPage = () => {
  const features = [
    {
      icon: <ShoppingCart className="h-10 w-10" />,
      title: '🛒 Pedidos Fáciles',
      description: 'Realiza tus pedidos de comida de manera rápida y sencilla'
    },
    {
      icon: <Clock className="h-10 w-10" />,
      title: '⏰ Seguimiento en Tiempo Real',
      description: 'Monitorea el estado de tus pedidos en cualquier momento'
    },
    {
      icon: <Star className="h-10 w-10" />,
      title: '⭐ Menú Variado',
      description: 'Amplia selección de platos deliciosos para elegir'
    },
    {
      icon: <CheckCircle className="h-10 w-10" />,
      title: '✅ Gestión Completa',
      description: 'Administra todos tus pedidos desde un solo lugar'
    }
  ]

  return (
    <div className="min-h-screen relative overflow-hidden" style={{background: 'linear-gradient(to bottom right, #1a237e, #283593, #303f9f)'}}>
      {/* Animated Background Circles */}
      <div className="relative z-10">
        {/* Navigation */}
        <nav className="container mx-auto px-4 sm:px-6 py-6">
          <div className="flex items-center justify-end">
            <div className="flex gap-3">
              <Link
                to="/login"
                className="px-4 py-2 sm:px-6 sm:py-3 text-white font-bold text-sm sm:text-base hover:text-secondary-300 transition-colors"
              >
                Iniciar Sesión
              </Link>
              <Link
                to="/admin-login"
                className="px-4 py-2 sm:px-6 sm:py-3 text-white font-bold text-sm sm:text-base hover:text-secondary-300 transition-colors"
              >
                Admin
              </Link>
              <Link
                to="/register"
                className="px-4 py-2 sm:px-6 sm:py-3 text-white font-bold text-sm sm:text-base rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
                style={{background: 'linear-gradient(to right, #ff9800, #fb8c00)'}}
                onMouseEnter={(e) => e.currentTarget.style.background = 'linear-gradient(to right, #fb8c00, #f57c00)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'linear-gradient(to right, #ff9800, #fb8c00)'}
              >
                Registrarse
              </Link>
            </div>
          </div>
        </nav>

        {/* Hero Content */}
        <div className="container mx-auto px-4 sm:px-6 py-12 sm:py-20 md:py-28">
          <div className="max-w-4xl mx-auto">
            <div className="text-white text-center">
              {/* Logo y nombre de la empresa centrados */}
              <div className="flex flex-col items-center mb-8">
                <img 
                  src={servifoodLogo} 
                  alt="Servifood" 
                  className="h-32 sm:h-40 w-auto mb-4"
                />
                <h2 className="text-2xl sm:text-3xl font-bold text-white">ServiFood Catering</h2>
              </div>
              
              <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold mb-6 leading-tight text-white">
                Tu Comida
                <span className="block mt-2" style={{color: '#ffa726'}}>A Un Click</span>
              </h1>
              <p className="text-lg sm:text-xl md:text-2xl mb-8 leading-relaxed font-semibold drop-shadow-lg" style={{color: 'rgba(255, 255, 255, 0.9)'}}>
                La mejor plataforma para gestionar tus pedidos de comida de manera profesional. 
                <span className="block mt-2">Fácil, rápido y eficiente.</span>
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  to="/register"
                  className="flex items-center justify-center gap-2 px-8 py-4 text-white font-bold text-lg rounded-xl shadow-2xl hover:shadow-3xl transform hover:scale-105 transition-all duration-200"
                  style={{background: 'linear-gradient(to right, #ff9800, #fb8c00)'}}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'linear-gradient(to right, #fb8c00, #f57c00)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'linear-gradient(to right, #ff9800, #fb8c00)'}
                >
                  Comenzar Ahora
                  <ArrowRight className="h-6 w-6" />
                </Link>
                <Link
                  to="/login"
                  className="flex items-center justify-center gap-2 px-8 py-4 backdrop-blur-sm text-white font-bold text-lg rounded-xl border-2 transition-all duration-200"
                  style={{backgroundColor: 'rgba(255, 255, 255, 0.1)', borderColor: 'rgba(255, 255, 255, 0.3)'}}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)'
                  }}
                >
                  🔑 Iniciar Sesión
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div className="backdrop-blur-sm py-16 sm:py-20 mt-12" style={{backgroundColor: 'rgba(255, 255, 255, 0.05)'}}>
          <div className="container mx-auto px-4 sm:px-6">
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white mb-4 drop-shadow-lg">
                💡 ¿Por qué ServiFood?
              </h2>
              <p className="text-lg sm:text-xl font-semibold" style={{color: 'rgba(255, 255, 255, 0.9)'}}>
                La mejor plataforma para gestionar tus pedidos de comida
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
              {features.map((feature, index) => (
                <div
                  key={index}
                  className="backdrop-blur-sm p-8 rounded-2xl border-2 transition-all duration-300 transform hover:scale-105 hover:shadow-2xl text-center"
                  style={{backgroundColor: 'rgba(255, 255, 255, 0.1)', borderColor: 'rgba(255, 255, 255, 0.2)'}}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'
                    e.currentTarget.style.borderColor = '#ffa726'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
                  }}
                >
                  <div className="text-white p-4 rounded-xl w-fit mx-auto mb-4" style={{background: 'linear-gradient(to right, #ff9800, #fb8c00)'}}>
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3">
                    {feature.title}
                  </h3>
                  <p className="font-medium" style={{color: 'rgba(255, 255, 255, 0.9)'}}>
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="py-16 sm:py-20">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="rounded-3xl p-8 sm:p-12 shadow-2xl text-center" style={{background: 'linear-gradient(to right, #ff9800, #fb8c00)'}}>
              <div className="bg-white rounded-full p-4 w-fit mx-auto mb-6">
                <ChefHat className="h-16 w-16" style={{color: '#fb8c00'}} />
              </div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white mb-6">
                🚀 ¿Listo para comenzar?
              </h2>
              <p className="text-lg sm:text-xl mb-8 max-w-2xl mx-auto font-semibold" style={{color: 'rgba(255, 255, 255, 0.95)'}}>
                Únete a ServiFood hoy y lleva la gestión de tus pedidos al siguiente nivel
              </p>
              <Link
                to="/register"
                className="inline-flex items-center gap-2 px-10 py-4 bg-white font-bold text-lg rounded-xl shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-200"
                style={{color: '#fb8c00'}}
              >
                ✨ Crear Cuenta Gratis
                <ArrowRight className="h-6 w-6" />
              </Link>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="backdrop-blur-sm py-8 border-t" style={{backgroundColor: 'rgba(26, 35, 126, 0.5)', borderColor: 'rgba(255, 255, 255, 0.1)'}}>
          <div className="container mx-auto px-4 sm:px-6 text-center font-medium" style={{color: 'rgba(255, 255, 255, 0.9)'}}>
            <p>© 2025 ServiFood Catering. Todos los derechos reservados.</p>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default LandingPage

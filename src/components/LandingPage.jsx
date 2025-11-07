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
    <div className="min-h-screen bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 relative overflow-hidden">
      {/* Animated Background Circles */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-secondary-500/30 rounded-full blur-3xl animate-pulse"></div>
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-primary-600/30 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>
      
      <div className="relative z-10">
        {/* Navigation */}
        <nav className="container mx-auto px-4 sm:px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-white p-2 rounded-xl shadow-2xl">
                <img 
                  src={servifoodLogo} 
                  alt="Servifood Logo" 
                  className="h-14 w-auto"
                />
              </div>
              <span className="text-xl sm:text-2xl font-extrabold text-white drop-shadow-lg hidden sm:inline">ServiFood Catering</span>
            </div>
            <div className="flex gap-3">
              <Link
                to="/login"
                className="px-4 py-2 sm:px-6 sm:py-3 text-white font-bold text-sm sm:text-base hover:text-secondary-300 transition-colors"
              >
                Iniciar Sesión
              </Link>
              <Link
                to="/register"
                className="px-4 py-2 sm:px-6 sm:py-3 bg-gradient-to-r from-secondary-500 to-secondary-600 hover:from-secondary-600 hover:to-secondary-700 text-white font-bold text-sm sm:text-base rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
              >
                Registrarse
              </Link>
            </div>
          </div>
        </nav>

        {/* Hero Content */}
        <div className="container mx-auto px-4 sm:px-6 py-12 sm:py-20 md:py-28">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="text-white text-center md:text-left">
              <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold mb-6 leading-tight">
                🍽️ Tu Comida
                <span className="block text-secondary-400 mt-2">A Un Click</span>
              </h1>
              <p className="text-lg sm:text-xl md:text-2xl text-white/90 mb-8 leading-relaxed font-semibold drop-shadow-lg">
                La mejor plataforma para gestionar tus pedidos de comida de manera profesional. 
                <span className="block mt-2">✨ Fácil, rápido y eficiente.</span>
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
                <Link
                  to="/register"
                  className="flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-secondary-500 to-secondary-600 hover:from-secondary-600 hover:to-secondary-700 text-white font-bold text-lg rounded-xl shadow-2xl hover:shadow-3xl transform hover:scale-105 transition-all duration-200"
                >
                  ✨ Comenzar Ahora
                  <ArrowRight className="h-6 w-6" />
                </Link>
                <Link
                  to="/login"
                  className="flex items-center justify-center gap-2 px-8 py-4 bg-white/10 backdrop-blur-sm hover:bg-white/20 text-white font-bold text-lg rounded-xl border-2 border-white/30 hover:border-white/50 transition-all duration-200"
                >
                  🔑 Iniciar Sesión
                </Link>
              </div>
            </div>

            <div className="hidden md:block">
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-secondary-500 to-primary-600 rounded-3xl blur-2xl opacity-50 group-hover:opacity-70 transition-opacity"></div>
                <div className="relative bg-white p-8 rounded-3xl shadow-2xl transform group-hover:scale-105 transition-transform duration-300">
                  <img 
                    src={servifoodLogo} 
                    alt="Servifood" 
                    className="w-full h-auto"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div className="bg-white/5 backdrop-blur-sm py-16 sm:py-20 mt-12">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white mb-4 drop-shadow-lg">
                💡 ¿Por qué ServiFood?
              </h2>
              <p className="text-lg sm:text-xl text-white/90 font-semibold">
                La mejor plataforma para gestionar tus pedidos de comida
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
              {features.map((feature, index) => (
                <div
                  key={index}
                  className="bg-white/10 backdrop-blur-sm p-8 rounded-2xl border-2 border-white/20 hover:bg-white/20 hover:border-secondary-400 transition-all duration-300 transform hover:scale-105 hover:shadow-2xl text-center"
                >
                  <div className="bg-gradient-to-r from-secondary-500 to-secondary-600 text-white p-4 rounded-xl w-fit mx-auto mb-4">
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3">
                    {feature.title}
                  </h3>
                  <p className="text-white/90 font-medium">
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
            <div className="bg-gradient-to-r from-secondary-500 to-secondary-600 rounded-3xl p-8 sm:p-12 shadow-2xl text-center">
              <div className="bg-white rounded-full p-4 w-fit mx-auto mb-6">
                <ChefHat className="h-16 w-16 text-secondary-600" />
              </div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white mb-6">
                🚀 ¿Listo para comenzar?
              </h2>
              <p className="text-lg sm:text-xl text-white/95 mb-8 max-w-2xl mx-auto font-semibold">
                Únete a ServiFood hoy y lleva la gestión de tus pedidos al siguiente nivel
              </p>
              <Link
                to="/register"
                className="inline-flex items-center gap-2 px-10 py-4 bg-white text-secondary-600 font-bold text-lg rounded-xl shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-200"
              >
                ✨ Crear Cuenta Gratis
                <ArrowRight className="h-6 w-6" />
              </Link>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="bg-primary-900/50 backdrop-blur-sm py-8 border-t border-white/10">
          <div className="container mx-auto px-4 sm:px-6 text-center text-white/90 font-medium">
            <p>© 2025 ServiFood Catering. Todos los derechos reservados.</p>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default LandingPage

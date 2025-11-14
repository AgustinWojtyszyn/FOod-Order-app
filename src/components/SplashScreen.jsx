import { useState, useEffect } from 'react'
import servilogo from '../assets/servifood logo.jpg'

const SplashScreen = ({ onComplete }) => {
  const [progress, setProgress] = useState(0)
  const [fadeOut, setFadeOut] = useState(false)

  useEffect(() => {
    // Simular progreso de carga
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(progressInterval)
          // Iniciar fade out
          setTimeout(() => {
            setFadeOut(true)
            // Notificar que completó después de la animación
            setTimeout(() => {
              onComplete?.()
            }, 500)
          }, 300)
          return 100
        }
        // Progreso más rápido al inicio, más lento al final
        const increment = prev < 60 ? 15 : prev < 80 ? 10 : 5
        return Math.min(prev + increment, 100)
      })
    }, 150)

    return () => clearInterval(progressInterval)
  }, [onComplete])

  return (
    <div 
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-primary-700 via-primary-800 to-primary-900 transition-opacity duration-500 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Logo con animación */}
      <div className="mb-10 transform transition-all duration-1000">
        <img 
          src={servilogo} 
          alt="ServiFood Logo" 
          className="w-28 h-28 md:w-36 md:h-36 rounded-3xl shadow-2xl animate-pulse"
          style={{
            filter: 'drop-shadow(0 10px 30px rgba(0, 0, 0, 0.5))'
          }}
        />
      </div>

      {/* Nombre de la app */}
      <h1 className="text-white text-3xl md:text-4xl font-bold mb-8 tracking-wide">
        ServiFood
      </h1>

      {/* Contenedor de barra de progreso */}
      <div className="w-3/4 max-w-sm px-4">
        {/* Barra de progreso */}
        <div className="relative bg-white/20 rounded-full h-2.5 overflow-hidden backdrop-blur-sm shadow-inner">
          <div 
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 rounded-full transition-all duration-300 ease-out"
            style={{ 
              width: `${progress}%`,
              boxShadow: '0 0 20px rgba(59, 130, 246, 0.6)'
            }}
          >
            {/* Efecto de brillo en la barra */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
          </div>
        </div>

        {/* Porcentaje */}
        <div className="flex justify-between items-center mt-3">
          <p className="text-white/80 text-sm font-medium">
            Cargando...
          </p>
          <p className="text-white/90 text-sm font-semibold">
            {progress}%
          </p>
        </div>
      </div>

      {/* Spinner decorativo */}
      <div className="mt-8">
        <div className="relative">
          <div className="animate-spin rounded-full h-10 w-10 border-3 border-white/20 border-t-white/80"></div>
          <div className="absolute inset-0 animate-ping rounded-full h-10 w-10 border border-white/10"></div>
        </div>
      </div>

      {/* Mensaje adicional para móviles */}
      <p className="text-white/60 text-xs mt-6 text-center px-8 md:hidden">
        Preparando tu experiencia móvil...
      </p>

      {/* CSS para animación shimmer */}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
      `}</style>
    </div>
  )
}

export default SplashScreen

import { useState } from 'react'
import { X, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react'

const Tutorial = ({ isOpen, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0)

  const steps = [
    {
      title: '¡Bienvenido a ServiFood! 👋',
      content: 'Esta es tu plataforma para gestionar pedidos de comida de manera fácil y rápida. Te guiaremos por las funciones principales.',
      image: '🍽️'
    },
    {
      title: 'Dashboard 📊',
      content: 'En el dashboard puedes ver un resumen de todos tus pedidos: totales, pendientes y entregados. Aquí también verás tus pedidos más recientes.',
      image: '📈'
    },
    {
      title: 'Crear Nuevo Pedido 🛒',
      content: 'Haz clic en "Nuevo Pedido" para crear un pedido. Selecciona los platos del menú, completa tus datos y elige la fecha de entrega.',
      image: '📝'
    },
    {
      title: 'Gestionar Pedidos ✅',
      content: 'Puedes marcar pedidos como entregados haciendo clic en el botón verde ✓. También puedes eliminar pedidos con el botón rojo 🗑️.',
      image: '⚙️'
    },
    {
      title: 'Panel de Admin (Solo Admin) 👨‍💼',
      content: 'Si eres administrador, puedes gestionar usuarios, cambiar roles y editar el menú de platos disponibles.',
      image: '🔐'
    },
    {
      title: '¡Listo para comenzar! 🎉',
      content: 'Ya conoces las funciones básicas. Puedes volver a ver este tutorial en cualquier momento desde el menú de ayuda.',
      image: '🚀'
    }
  ]

  if (!isOpen) return null

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      handleClose()
    }
  }

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleClose = () => {
    setCurrentStep(0)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gradient-to-br from-primary-700 via-primary-800 to-primary-900 rounded-2xl shadow-2xl max-w-2xl w-full mx-4 overflow-hidden border-4 border-white/20">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-900 to-primary-800 p-6 text-white relative border-b-4 border-secondary-500">
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3">
            <BookOpen className="h-8 w-8" />
            <div>
              <h2 className="text-2xl font-bold">Tutorial de ServiFood</h2>
              <p className="text-primary-100 text-sm">Paso {currentStep + 1} de {steps.length}</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 bg-white/95 backdrop-blur-sm">
          <div className="text-center mb-6">
            <div className="text-6xl mb-4">{steps[currentStep].image}</div>
            <h3 className="text-2xl font-bold text-gray-900 mb-3">
              {steps[currentStep].title}
            </h3>
            <p className="text-gray-600 text-lg leading-relaxed">
              {steps[currentStep].content}
            </p>
          </div>

          {/* Progress Dots */}
          <div className="flex justify-center gap-2 mb-6">
            {steps.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentStep(index)}
                className={`h-2 rounded-full transition-all ${
                  index === currentStep 
                    ? 'w-8 bg-primary-600' 
                    : 'w-2 bg-gray-300 hover:bg-gray-400'
                }`}
              />
            ))}
          </div>

          {/* Navigation */}
          <div className="flex justify-between items-center">
            <button
              onClick={handlePrev}
              disabled={currentStep === 0}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                currentStep === 0
                  ? 'text-gray-400 cursor-not-allowed'
                  : 'text-primary-600 hover:bg-primary-50'
              }`}
            >
              <ChevronLeft className="h-5 w-5" />
              Anterior
            </button>

            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all"
            >
              {currentStep === steps.length - 1 ? 'Finalizar' : 'Siguiente'}
              {currentStep < steps.length - 1 && <ChevronRight className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Tutorial

import { MessageCircle, Phone } from 'lucide-react'

const SupportButton = () => {
  const whatsappNumber = '2644405294'
  const whatsappMessage = encodeURIComponent('¡Hola! Necesito ayuda con ServiFood Catering 🍽️')
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center gap-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-4 px-6 rounded-full shadow-2xl hover:shadow-green-500/50 transform hover:scale-110 transition-all duration-300 animate-bounce hover:animate-none"
      >
        <MessageCircle className="h-6 w-6" />
        <span className="hidden sm:inline">¿Necesitas ayuda?</span>
        <div className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
        </div>
      </a>
      
      {/* Tooltip */}
      <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block">
        <div className="bg-gray-900 text-white text-sm rounded-lg px-4 py-2 whitespace-nowrap shadow-xl">
          <p className="font-bold flex items-center gap-2">
            <Phone className="h-4 w-4" />
            WhatsApp: +54 264 440 5294
          </p>
          <p className="text-xs text-gray-300 mt-1">¡Hablemos! Estamos aquí para ayudarte 😊</p>
        </div>
      </div>
    </div>
  )
}

export default SupportButton

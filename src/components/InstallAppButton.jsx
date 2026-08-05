import { useEffect, useMemo, useState } from 'react'
import { Download, X } from 'lucide-react'

const isStandaloneDisplay = () => {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator?.standalone === true
}

const getInstallHelpText = () => {
  if (typeof navigator === 'undefined') return 'Usá el menú del navegador y elegí instalar o agregar a pantalla principal.'

  const userAgent = navigator.userAgent || ''
  const isIos = /iphone|ipad|ipod/i.test(userAgent)

  if (isIos) {
    return 'En iPhone: tocá Compartir y luego Agregar a pantalla de inicio.'
  }

  return 'En Android/Chrome: abrí el menú del navegador y elegí Instalar app o Agregar a pantalla principal.'
}

const InstallAppButton = () => {
  const [installPrompt, setInstallPrompt] = useState(null)
  const [visible, setVisible] = useState(false)
  const [helpVisible, setHelpVisible] = useState(false)
  const helpText = useMemo(getInstallHelpText, [])

  useEffect(() => {
    if (isStandaloneDisplay()) return

    setVisible(true)

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault()
      setInstallPrompt(event)
      setVisible(true)
    }

    const handleInstalled = () => {
      setInstallPrompt(null)
      setHelpVisible(false)
      setVisible(false)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) {
      setHelpVisible((current) => !current)
      return
    }

    installPrompt.prompt()
    const choice = await installPrompt.userChoice.catch(() => null)
    if (choice?.outcome === 'accepted') {
      setVisible(false)
    }
    setInstallPrompt(null)
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-4 left-4 z-40 max-w-[calc(100vw-2rem)] sm:bottom-5 sm:left-5">
      {helpVisible && (
        <div className="mb-2 max-w-72 rounded-lg border border-blue-200 bg-white p-3 text-xs font-semibold text-slate-700 shadow-xl">
          <div className="flex items-start gap-2">
            <p className="flex-1">{helpText}</p>
            <button
              type="button"
              onClick={() => setHelpVisible(false)}
              className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              aria-label="Cerrar indicación de instalación"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handleInstall}
        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/70 bg-white px-3 py-2 text-xs font-black text-blue-800 shadow-xl shadow-blue-950/20 transition hover:bg-blue-50"
      >
        <Download className="h-4 w-4" />
        <span>Instalar app</span>
      </button>
    </div>
  )
}

export default InstallAppButton

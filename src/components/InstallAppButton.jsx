import { useEffect, useMemo, useState } from 'react'
import { Download, X } from 'lucide-react'

const getPwaState = () => {
  if (typeof window === 'undefined') return null
  window.__servifoodPwa = window.__servifoodPwa || {
    deferredPrompt: null,
    beforeInstallPromptReceived: false,
    installed: false,
    listeners: []
  }
  return window.__servifoodPwa
}

const isStandaloneDisplay = () => {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator?.standalone === true
}

const isIosBrowser = () => {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent || '')
}

const getInstallUnavailableText = () => {
  if (typeof navigator === 'undefined') return 'Usá el menú del navegador y elegí instalar o agregar a pantalla principal.'

  if (isIosBrowser()) {
    return 'En iPhone: tocá Compartir y luego Agregar a pantalla de inicio.'
  }

  return 'Chrome todavía no habilitó la instalación para esta sesión. Verificá que estés en HTTPS, que el manifest y el service worker carguen sin errores, y recargá la página después del deploy.'
}

const InstallAppButton = () => {
  const [installPrompt, setInstallPrompt] = useState(null)
  const [visible, setVisible] = useState(false)
  const [helpVisible, setHelpVisible] = useState(false)
  const helpText = useMemo(getInstallUnavailableText, [])

  useEffect(() => {
    const pwaState = getPwaState()
    const standalone = isStandaloneDisplay()
    console.info('[PWA] InstallAppButton estado inicial', {
      standalone,
      hasDeferredPrompt: Boolean(pwaState?.deferredPrompt),
      beforeInstallPromptReceived: Boolean(pwaState?.beforeInstallPromptReceived),
      installed: Boolean(pwaState?.installed)
    })

    if (standalone || pwaState?.installed) return

    setInstallPrompt(pwaState?.deferredPrompt || null)
    setVisible(true)

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault()
      pwaState.deferredPrompt = event
      setInstallPrompt(event)
      setVisible(true)
      setHelpVisible(false)
      console.info('[PWA] InstallAppButton recibió beforeinstallprompt', {
        platforms: event?.platforms || []
      })
    }

    const handleInstalled = () => {
      setInstallPrompt(null)
      setHelpVisible(false)
      setVisible(false)
    }

    pwaState.listeners.push(handleBeforeInstallPrompt)
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      pwaState.listeners = pwaState.listeners.filter((listener) => listener !== handleBeforeInstallPrompt)
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  const handleInstall = async () => {
    const pwaState = getPwaState()
    const promptEvent = installPrompt || pwaState?.deferredPrompt

    if (isStandaloneDisplay() || pwaState?.installed) {
      setVisible(false)
      return
    }

    if (!promptEvent || isIosBrowser()) {
      setHelpVisible((current) => !current)
      console.info('[PWA] instalación no disponible al tocar botón', {
        hasDeferredPrompt: Boolean(promptEvent),
        beforeInstallPromptReceived: Boolean(pwaState?.beforeInstallPromptReceived),
        standalone: isStandaloneDisplay(),
        isIos: isIosBrowser()
      })
      return
    }

    console.info('[PWA] ejecutando prompt nativo')
    await promptEvent.prompt()
    const choice = await promptEvent.userChoice.catch((error) => ({
      outcome: 'error',
      error: error?.message || String(error)
    }))
    console.info('[PWA] userChoice', choice)

    setVisible(choice?.outcome !== 'accepted' ? true : false)

    if (pwaState) {
      pwaState.deferredPrompt = null
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

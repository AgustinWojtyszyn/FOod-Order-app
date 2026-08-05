import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './mobile-optimizations.css'

import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext'
import AppErrorBoundary from './components/ui/ErrorBoundary'

// No limpiar localStorage ni sessionStorage para mantener la sesión activa

const logPwaDiagnostic = (label, data = {}) => {
  console.info(`[PWA] ${label}`, data)
}

const isStandaloneDisplay = () =>
  window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator?.standalone === true

const registerServiceWorker = () => {
  logPwaDiagnostic('standalone', { standalone: isStandaloneDisplay() })

  fetch('/manifest.json', { cache: 'no-store' })
    .then((response) => {
      logPwaDiagnostic('manifest', {
        ok: response.ok,
        status: response.status,
        contentType: response.headers.get('content-type')
      })
      return response.ok ? response.json() : null
    })
    .then((manifest) => {
      if (!manifest) return
      logPwaDiagnostic('manifest cargado', {
        name: manifest.name,
        shortName: manifest.short_name,
        startUrl: manifest.start_url,
        scope: manifest.scope,
        display: manifest.display,
        icons: Array.isArray(manifest.icons) ? manifest.icons.map((icon) => icon.src) : []
      })
    })
    .catch((error) => logPwaDiagnostic('manifest error', { message: error?.message || String(error) }))

  if (!('serviceWorker' in navigator)) {
    logPwaDiagnostic('service worker no soportado')
    return
  }

  navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
    .then((registration) => {
      logPwaDiagnostic('service worker registrado', {
        scope: registration.scope,
        active: Boolean(registration.active),
        waiting: Boolean(registration.waiting),
        installing: Boolean(registration.installing)
      })
      return navigator.serviceWorker.ready
    })
    .then((registration) => {
      logPwaDiagnostic('service worker activo', {
        scope: registration.scope,
        active: Boolean(registration.active)
      })
    })
    .catch((error) => logPwaDiagnostic('service worker error', { message: error?.message || String(error) }))
}

registerServiceWorker()

// Diagnóstico de arranque en desarrollo
if (import.meta.env.DEV) {
  console.log('[App] Boot start', {
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    hasAnonKey: !!import.meta.env.VITE_SUPABASE_ANON_KEY
  })

  window.addEventListener('error', (event) => {
    console.error('[App] window error', event.error || event.message || event)
  })
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[App] unhandled rejection', event.reason)
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </AuthProvider>
  </StrictMode>,
)

if (import.meta.env.DEV) {
  console.log('[App] Boot rendered')
}

// Ocultar loader amigable al montar React
if (window.__servifood_loader_hide) window.__servifood_loader_hide();

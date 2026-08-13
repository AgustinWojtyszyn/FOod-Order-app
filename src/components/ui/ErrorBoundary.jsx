import { Component } from 'react'
import { ErrorBoundary as ReactErrorBoundary } from 'react-error-boundary'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import Button from './Button'

const isChunkLoadError = (error) => {
  const text = `${error?.name || ''} ${error?.message || ''} ${error?.stack || ''}`.toLowerCase()
  return text.includes('loading chunk') ||
    text.includes('chunkloaderror') ||
    text.includes('failed to fetch dynamically imported module') ||
    text.includes('importing a module script failed') ||
    text.includes('module script load')
}

const clearRuntimeCaches = async () => {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))
  }
  if ('caches' in window) {
    const keys = await caches.keys()
    await Promise.all(keys.map((key) => caches.delete(key)))
  }
}

class ErrorFallback extends Component {
  constructor(props) {
    super(props)
    this.state = { errorId: Date.now() }
  }

  componentDidCatch(error, errorInfo) {
    // Log error to service
    console.error('Error caught by boundary:', error, errorInfo)

    // Here you could send to error reporting service
    // reportError(error, errorInfo, this.state.errorId)
  }

  render() {
    const { error, resetErrorBoundary } = this.props

    return (
      <div className="min-h-dvh bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-xl shadow-lg p-6 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>

            <h1 className="text-xl font-semibold text-gray-900 mb-2">
              ¡Ups! Algo salió mal
            </h1>

            <p className="text-gray-600 mb-6">
              No pudimos cargar esta parte de la aplicación. Intentá nuevamente o volvé al inicio.
            </p>

            <details className="mb-6 text-left">
              <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                Detalles técnicos
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto rounded bg-gray-100 p-2 text-xs">
                {error?.name && `${error.name}: `}
                {error?.message || 'Error sin mensaje'}
                {error?.stack && (
                  <>
                    {'\n\n'}
                    {error.stack}
                  </>
                )}
              </pre>
            </details>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={() => {
                  clearRuntimeCaches()
                    .catch((cacheError) => console.error('[ServiFood ErrorBoundary] cache cleanup failed', cacheError))
                    .finally(resetErrorBoundary)
                }}
                className="flex-1"
                variant="primary"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Intentar de nuevo
              </Button>

              <Button
                onClick={() => window.location.href = '/'}
                variant="outline"
                className="flex-1"
              >
                <Home className="w-4 h-4 mr-2" />
                Ir al inicio
              </Button>
            </div>

            <p className="text-xs text-gray-500 mt-4">
              ID de error: {this.state.errorId}
            </p>
          </div>
        </div>
      </div>
    )
  }
}

const logError = (error, errorInfo) => {
  console.group('[ServiFood ErrorBoundary]')
  console.error('Error:', error)
  console.error('Message:', error?.message)
  console.error('Stack:', error?.stack)
  console.error('Component stack:', errorInfo?.componentStack)
  console.error('Error info:', errorInfo)
  console.groupEnd()

  if (isChunkLoadError(error) && !sessionStorage.getItem('servifood_chunk_recovered')) {
    sessionStorage.setItem('servifood_chunk_recovered', '1')
    clearRuntimeCaches()
      .catch((cacheError) => console.error('[ServiFood ErrorBoundary] cache cleanup failed', cacheError))
      .finally(() => window.location.reload())
  }

  // Here you could send to error reporting service
  // Example: Sentry, LogRocket, etc.
  // Sentry.captureException(error, { contexts: { errorInfo } })
}

export const AppErrorBoundary = ({ children }) => {
  return (
    <ReactErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={logError}
      onReset={() => {
        // Clear any error state if needed
        window.location.reload()
      }}
    >
      {children}
    </ReactErrorBoundary>
  )
}

export default AppErrorBoundary

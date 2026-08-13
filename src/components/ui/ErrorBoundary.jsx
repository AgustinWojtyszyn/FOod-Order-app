import { Component } from 'react'
import { ErrorBoundary as ReactErrorBoundary } from 'react-error-boundary'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import Button from './Button'

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

            {import.meta.env.DEV && (
              <details className="mb-6 text-left">
                <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                  Detalles técnicos
                </summary>
                <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto">
                  {error.message}
                  {error.stack && (
                    <>
                      {'\n\n'}
                      {error.stack}
                    </>
                  )}
                </pre>
              </details>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={resetErrorBoundary}
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

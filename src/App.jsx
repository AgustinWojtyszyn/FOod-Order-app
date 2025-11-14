import { useState, useEffect, lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { supabase, auth } from './supabaseClient'
import SplashScreen from './components/SplashScreen'
import './App.css'

// Importaciones inmediatas (críticas para la carga inicial)
import Layout from './components/Layout'
import Login from './components/Login'
import LandingPage from './components/LandingPage'

// Lazy loading de componentes (carga diferida)
const Register = lazy(() => import('./components/Register'))
const ForgotPassword = lazy(() => import('./components/ForgotPassword'))
const ResetPassword = lazy(() => import('./components/ResetPassword'))
const Dashboard = lazy(() => import('./components/Dashboard'))
const AdminPanel = lazy(() => import('./components/AdminPanel'))
const SuperAdminPanel = lazy(() => import('./components/SuperAdminPanel'))
const DailyOrders = lazy(() => import('./components/DailyOrders'))
const AdminChat = lazy(() => import('./components/AdminChat'))
const OrderForm = lazy(() => import('./components/OrderForm'))
const Profile = lazy(() => import('./components/Profile'))

// Componente de carga interno (para Suspense)
const InternalLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-700 via-primary-800 to-primary-900">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-3 border-white/30 border-t-white mx-auto mb-4"></div>
      <p className="text-white/80 text-sm">Cargando componente...</p>
    </div>
  </div>
)

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showSplash, setShowSplash] = useState(() => {
    // Solo mostrar splash en primera carga (no en recargas)
    const hasLoadedBefore = sessionStorage.getItem('hasLoadedApp')
    return !hasLoadedBefore
  })

  useEffect(() => {
    // Obtener usuario inicial
    auth.getUser().then(({ user }) => {
      setUser(user)
      setLoading(false)
      // Marcar que la app ya cargó en esta sesión
      sessionStorage.setItem('hasLoadedApp', 'true')
    })

    // Escuchar cambios de autenticación
    const { data: { subscription } } = auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Mostrar splash screen solo en primera carga
  if (showSplash && loading) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />
  }

  return (
    <Router>
      <div className="min-h-screen bg-gradient-to-br from-primary-700 via-primary-800 to-primary-900">
        <Suspense fallback={<InternalLoader />}>
          <Routes>
            <Route path="/" element={
              user ? <Navigate to="/dashboard" /> : <LandingPage />
            } />
            <Route path="/dashboard" element={
              user ? <Layout user={user}><Dashboard user={user} /></Layout> : <Navigate to="/login" />
            } />
            <Route path="/login" element={
              user ? <Navigate to="/dashboard" /> : <Login />
            } />
            <Route path="/register" element={
              user ? <Navigate to="/dashboard" /> : <Register />
            } />
            <Route path="/forgot-password" element={
              user ? <Navigate to="/dashboard" /> : <ForgotPassword />
            } />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/order" element={
              user ? <Layout user={user}><OrderForm user={user} /></Layout> : <Navigate to="/login" />
            } />
            <Route path="/profile" element={
              user ? <Layout user={user}><Profile user={user} /></Layout> : <Navigate to="/login" />
            } />
            <Route path="/admin" element={
              user ? <Layout user={user}><AdminPanel user={user} /></Layout> : <Navigate to="/login" />
            } />
            <Route path="/superadmin" element={
              user ? <Layout user={user}><SuperAdminPanel user={user} /></Layout> : <Navigate to="/login" />
            } />
            <Route path="/daily-orders" element={
              user ? <Layout user={user}><DailyOrders user={user} /></Layout> : <Navigate to="/login" />
            } />
            <Route path="/admin-chat" element={
              user ? <Layout user={user}><AdminChat user={user} /></Layout> : <Navigate to="/login" />
            } />
            <Route path="/auth/callback" element={<AuthCallback />} />
          </Routes>
        </Suspense>
      </div>
    </Router>
  )
}

// Componente para manejar callback de autenticación
function AuthCallback() {
  useEffect(() => {
    const handleAuthCallback = async () => {
      const { data, error } = await supabase.auth.getSession()
      if (error) {
        console.error('Error en callback de auth:', error)
      }
      // Redirigir al dashboard
      window.location.href = '/dashboard'
    }

    handleAuthCallback()
  }, [])

  return <InternalLoader />
}

export default App

import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { supabase, auth } from './supabaseClient'
import Layout from './components/Layout'
import Login from './components/Login'
import Register from './components/Register'
import EmailVerification from './components/EmailVerification'
import ForgotPassword from './components/ForgotPassword'
import ResetPassword from './components/ResetPassword'
import Dashboard from './components/Dashboard'
import AdminPanel from './components/AdminPanel'
import SuperAdminPanel from './components/SuperAdminPanel'
import DailyOrders from './components/DailyOrders'
import AdminChat from './components/AdminChat'
import OrderForm from './components/OrderForm'
import Profile from './components/Profile'
import LandingPage from './components/LandingPage'
import './App.css'

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Obtener usuario inicial
    auth.getUser().then(({ user }) => {
      setUser(user)
      setLoading(false)
    })

    // Escuchar cambios de autenticación
    const { data: { subscription } } = auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-700 via-primary-800 to-primary-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    )
  }

  return (
    <Router>
      <div className="min-h-screen bg-gradient-to-br from-primary-700 via-primary-800 to-primary-900">
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
          <Route path="/verify-email" element={<EmailVerification />} />
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-700 via-primary-800 to-primary-900">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
        <p className="text-white font-bold text-lg">Verificando tu cuenta...</p>
      </div>
    </div>
  )
}

export default App

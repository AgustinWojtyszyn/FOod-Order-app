import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { supabase, auth } from './supabaseClient'
import Layout from './components/Layout'
import Login from './components/Login'
import Register from './components/Register'
import Dashboard from './components/Dashboard'
import AdminPanel from './components/AdminPanel'
import OrderForm from './components/OrderForm'
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Routes>
          <Route path="/" element={
            user ? <Layout user={user}><Dashboard user={user} /></Layout> : <Navigate to="/login" />
          } />
          <Route path="/login" element={
            user ? <Navigate to="/" /> : <Login />
          } />
          <Route path="/register" element={
            user ? <Navigate to="/" /> : <Register />
          } />
          <Route path="/order" element={
            user ? <Layout user={user}><OrderForm user={user} /></Layout> : <Navigate to="/login" />
          } />
          <Route path="/admin" element={
            user?.user_metadata?.role === 'admin' ? <Layout user={user}><AdminPanel /></Layout> : <Navigate to="/" />
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
      window.location.href = '/'
    }

    handleAuthCallback()
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Verificando tu cuenta...</p>
      </div>
    </div>
  )
}

export default App

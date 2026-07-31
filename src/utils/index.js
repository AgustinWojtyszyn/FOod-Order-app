import DOMPurify from 'dompurify'
import { EDIT_WINDOW_MINUTES } from '../constants/orderRules'
export { cn } from './cn'

// Utilidades de validación y sanitización
export const sanitizeInput = (input) => {
  if (!input || typeof input !== 'string') return ''
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [] }).trim()
}

export const sanitizeHtml = (html) => {
  if (!html || typeof html !== 'string') return ''
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u'],
    ALLOWED_ATTR: []
  })
}

// Utilidades de formato
export const formatDate = (dateString, options = {}) => {
  if (!dateString) return '-'
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return dateString
  return date.toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options
  })
}

export const timeAgo = (dateString) => {
  if (!dateString || typeof dateString !== 'string') return null
  const diffMs = Date.now() - new Date(dateString).getTime()
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 10) return 'Recién'
  if (seconds < 60) return `Hace ${seconds} s`
  const minutes = Math.floor(seconds / 60)
  if (minutes === 1) return 'Hace 1 min'
  if (minutes < 60) return `Hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours === 1) return 'Hace 1 hora'
  if (hours < 24) return `Hace ${hours} horas`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Ayer'
  return `Hace ${days} días`
}

export const formatCurrency = (amount, currency = 'ARS') => {
  if (amount === null || amount === undefined || typeof amount !== 'number') return '-'
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency
  }).format(amount)
}

// Utilidades de validación
export const validateEmail = (email) => {
  if (!email || typeof email !== 'string') return false
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export const validatePassword = (password) => {
  return password && password.length >= 6
}

export const validatePhone = (phone) => {
  const phoneRegex = /^\+?[\d\s\-()]{8,}$/
  return phoneRegex.test(phone)
}

// Utilidades de debounce y throttle
export const debounce = (func, wait) => {
  let timeout
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

export const throttle = (func, limit) => {
  let inThrottle
  return function executedFunction(...args) {
    if (!inThrottle) {
      func.apply(this, args)
      inThrottle = true
      setTimeout(() => inThrottle = false, limit)
    }
  }
}

// Utilidades de localStorage con error handling
export const safeLocalStorage = {
  get: (key, defaultValue = null) => {
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : defaultValue
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error)
      return defaultValue
    }
  },

  set: (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
      return true
    } catch (error) {
      console.warn(`Error writing localStorage key "${key}":`, error)
      return false
    }
  },

  remove: (key) => {
    try {
      localStorage.removeItem(key)
      return true
    } catch (error) {
      console.warn(`Error removing localStorage key "${key}":`, error)
      return false
    }
  }
}

// Utilidades de sessionStorage
export const safeSessionStorage = {
  get: (key, defaultValue = null) => {
    try {
      const item = sessionStorage.getItem(key)
      return item ? JSON.parse(item) : defaultValue
    } catch (error) {
      console.warn(`Error reading sessionStorage key "${key}":`, error)
      return defaultValue
    }
  },

  set: (key, value) => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value))
      return true
    } catch (error) {
      console.warn(`Error writing sessionStorage key "${key}":`, error)
      return false
    }
  },

  remove: (key) => {
    try {
      sessionStorage.removeItem(key)
      return true
    } catch (error) {
      console.warn(`Error removing sessionStorage key "${key}":`, error)
      return false
    }
  }
}

// Utilidades de arrays y objetos
export const groupBy = (array, key) => {
  if (!Array.isArray(array)) return {}
  return array.reduce((result, item) => {
    const groupKey = item[key]
    if (!result[groupKey]) {
      result[groupKey] = []
    }
    result[groupKey].push(item)
    return result
  }, {})
}

export const sortBy = (array, key, direction = 'asc') => {
  if (!Array.isArray(array)) return []
  return [...array].sort((a, b) => {
    if (a[key] < b[key]) return direction === 'asc' ? -1 : 1
    if (a[key] > b[key]) return direction === 'asc' ? 1 : -1
    return 0
  })
}

// Utilidades de strings
export const capitalize = (str) => {
  if (!str || typeof str !== 'string') return str
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

export const truncate = (str, length = 100, suffix = '...') => {
  if (!str || typeof str !== 'string' || str.length <= length) return str || ''
  return str.substring(0, length - suffix.length) + suffix
}

// Utilidades de números
export const clamp = (num, min, max) => {
  if (typeof num !== 'number') return min
  return Math.min(Math.max(num, min), max)
}

export const roundTo = (num, decimals = 2) => {
  if (typeof num !== 'number') return 0
  return Number(Math.round(num + 'e' + decimals) + 'e-' + decimals)
}

// Utilidades de tiempo
export const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export const isOrderEditable = (createdAt, minutesLimit = EDIT_WINDOW_MINUTES) => {
  if (!createdAt) return false
  const now = new Date()
  const created = new Date(createdAt)
  if (Number.isNaN(created.getTime())) return false
  const diffInMinutes = (now - created) / (1000 * 60)
  return diffInMinutes <= minutesLimit
}

export const getTimeAgo = (dateString) => {
  if (!dateString || typeof dateString !== 'string') return 'ahora mismo'
  const now = new Date()
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return 'ahora mismo'
  const diffInSeconds = Math.floor((now - date) / 1000)

  const intervals = [
    { label: 'año', seconds: 31536000 },
    { label: 'mes', seconds: 2592000 },
    { label: 'día', seconds: 86400 },
    { label: 'hora', seconds: 3600 },
    { label: 'minuto', seconds: 60 },
    { label: 'segundo', seconds: 1 }
  ]

  for (const interval of intervals) {
    const count = Math.floor(diffInSeconds / interval.seconds)
    if (count >= 1) {
      return `hace ${count} ${interval.label}${count !== 1 ? 's' : ''}`
    }
  }

  return 'ahora mismo'
}

// Utilidades de errores
export const getUserFriendlyErrorMessage = (error, fallback = 'No pudimos completar la acción. Intentá nuevamente.') => {
  if (!error) return fallback
  const rawMessage = typeof error === 'string'
    ? error
    : (error?.message || error?.error_description || error?.description || '')
  const rawCode = error?.code || error?.error || error?.status || ''
  const normalized = `${rawCode} ${rawMessage}`.toLowerCase()

  if (!normalized.trim()) return fallback

  if (
    normalized.includes('invalid login credentials') ||
    normalized.includes('invalid credentials') ||
    normalized.includes('email not confirmed')
  ) {
    return 'El correo o la contraseña no son correctos. Revisá los datos e intentá nuevamente.'
  }

  if (
    normalized.includes('user already registered') ||
    normalized.includes('already registered') ||
    normalized.includes('already exists')
  ) {
    return 'Ya existe una cuenta con ese correo. Iniciá sesión o recuperá tu contraseña.'
  }

  if (
    normalized.includes('rate limit') ||
    normalized.includes('too many requests') ||
    normalized.includes('over_email_send_rate_limit')
  ) {
    return 'Hiciste varios intentos seguidos. Esperá unos minutos antes de volver a probar.'
  }

  if (
    normalized.includes('expired') ||
    normalized.includes('otp_expired') ||
    normalized.includes('invalid_grant') ||
    normalized.includes('invalid token') ||
    normalized.includes('token has expired')
  ) {
    return 'El enlace es inválido, expiró o ya fue usado. Pedí uno nuevo.'
  }

  if (
    normalized.includes('weak password') ||
    normalized.includes('password should') ||
    normalized.includes('password must') ||
    normalized.includes('password')
  ) {
    return 'La contraseña no cumple los requisitos. Usá al menos 8 caracteres y evitá claves fáciles de adivinar.'
  }

  if (
    normalized.includes('network') ||
    normalized.includes('failed to fetch') ||
    normalized.includes('fetch') ||
    normalized.includes('timeout')
  ) {
    return 'No pudimos conectar con el servidor. Revisá tu conexión e intentá nuevamente.'
  }

  if (
    normalized.includes('row-level security') ||
    normalized.includes('rls') ||
    normalized.includes('permission denied') ||
    normalized.includes('403') ||
    normalized.includes('not authorized') ||
    normalized.includes('not_authorized') ||
    normalized.includes('not_authenticated') ||
    normalized.includes('unauthorized')
  ) {
    return 'No tenés permisos para realizar esta acción. Si creés que es un error, contactá a un administrador.'
  }

  if (normalized.includes('remito_start_number_required')) {
    return 'La numeración de nota de pedido debe estar inicializada en 0 para la empresa.'
  }

  if (
    normalized.includes('remito_start_number_must_be_positive') ||
    normalized.includes('remito_start_number_must_be_zero')
  ) {
    return 'El número inicial de nota de pedido es fijo y debe ser 0.'
  }

  if (normalized.includes('company_has_issued_remitos')) {
    return 'La empresa ya emitió notas de pedido. El número inicial no puede modificarse libremente.'
  }

  if (normalized.includes('company_required') || normalized.includes('company_not_found')) {
    return 'No pudimos identificar la empresa para emitir la nota de pedido.'
  }

  if (
    normalized.includes('could not find the function') ||
    normalized.includes('schema cache')
  ) {
    return 'Falta aplicar el SQL de numeración de notas de pedido en la base de datos.'
  }

  if (normalized.includes('invalid_role')) {
    return 'El rol seleccionado no es válido.'
  }

  if (normalized.includes('user_not_found') || normalized.includes('target_user_required')) {
    return 'No encontramos el usuario indicado. Actualizá la pantalla e intentá nuevamente.'
  }

  if (normalized.includes('last_admin')) {
    return 'No se puede quitar el rol al último administrador.'
  }

  if (
    normalized.includes('duplicate') ||
    normalized.includes('unique constraint') ||
    normalized.includes('duplicate_active_order')
  ) {
    return 'Ya existe un registro similar. Revisá la información e intentá nuevamente.'
  }

  if (
    normalized.includes('violates foreign key constraint') ||
    normalized.includes('foreign key') ||
    normalized.includes('23503')
  ) {
    return 'No pudimos completar la acción porque falta información relacionada. Actualizá la pantalla e intentá nuevamente.'
  }

  if (normalized.includes('correo electrónico inválido') || normalized.includes('invalid email')) {
    return 'Ingresá un correo electrónico válido.'
  }

  return fallback
}

export const handleError = (error, context = '') => {
  console.error(`Error${context ? ` in ${context}` : ''}:`, error)

  // Aquí podrías enviar errores a un servicio de logging
  // logErrorToService(error, context)

  return {
    message: getUserFriendlyErrorMessage(error, 'Ha ocurrido un error inesperado. Intentá nuevamente.'),
    code: error.code || 'UNKNOWN_ERROR',
    context
  }
}

// Utilidades de performance
export const measurePerformance = async (label, asyncFn) => {
  const start = performance.now()
  try {
    const result = await asyncFn()
    const end = performance.now()
    console.log(`${label} tomó ${roundTo(end - start, 2)}ms`)
    return result
  } catch (error) {
    const end = performance.now()
    console.error(`${label} falló después de ${roundTo(end - start, 2)}ms:`, error)
    throw error
  }
}

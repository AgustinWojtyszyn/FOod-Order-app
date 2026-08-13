// Tipos y interfaces para la aplicación
export const USER_ROLES = {
  USER: 'user',
  ADMIN: 'admin'
}

export const USER_ROLE_VALUES = Object.values(USER_ROLES)

export const ORDER_STATUS = {
  PENDING: 'pending',
  ARCHIVED: 'archived',
  CANCELLED: 'cancelled'
}

export const NOTIFICATION_TYPES = {
  ORDER_UPDATE: 'order_update',
  SYSTEM: 'system',
  PROMOTION: 'promotion'
}

// Interfaces para validación
export const validateEmail = (email) => {
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

// Sanitización básica
export const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input
  return input.trim().replace(/[<>]/g, '')
}

export const sanitizeHtml = (html) => {
  if (typeof html !== 'string') return html
  return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
}

import { USER_ROLES } from '../../types'

export const ROLE_FILTER_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: USER_ROLES.ADMIN, label: 'Administradores' },
  { value: USER_ROLES.USER, label: 'Usuarios' }
]

export const ROLE_OPTIONS = [
  { value: USER_ROLES.USER, label: 'Usuario' },
  { value: USER_ROLES.ADMIN, label: 'Admin' }
]

export const USER_SORT_OPTIONS = [
  { value: 'name_asc', label: 'Nombre (A-Z)' },
  { value: 'name_desc', label: 'Nombre (Z-A)' },
  { value: 'newest', label: 'Más recientes' },
  { value: 'oldest', label: 'Más antiguos' }
]

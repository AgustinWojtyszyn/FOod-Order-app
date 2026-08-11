import { USER_ROLES } from '../../types'

export const ROLE_FILTER_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: USER_ROLES.ADMIN, label: 'Administradores' },
  { value: USER_ROLES.HUMAN_RESOURCES, label: 'Recursos Humanos' },
  { value: USER_ROLES.USER, label: 'Usuarios' }
]

export const ROLE_OPTIONS = [
  { value: USER_ROLES.USER, label: 'Usuario' },
  { value: USER_ROLES.ADMIN, label: 'Admin' },
  { value: USER_ROLES.HUMAN_RESOURCES, label: 'Recursos Humanos' }
]

export const ROLE_DISPLAY = {
  [USER_ROLES.USER]: { label: 'Usuario', className: 'bg-blue-100 text-blue-800' },
  [USER_ROLES.ADMIN]: { label: 'Admin', className: 'bg-purple-100 text-purple-800' },
  [USER_ROLES.HUMAN_RESOURCES]: { label: 'Recursos Humanos', className: 'bg-emerald-100 text-emerald-800' }
}

export const getRoleDisplay = (role) => ROLE_DISPLAY[role] || ROLE_DISPLAY[USER_ROLES.USER]

export const USER_SORT_OPTIONS = [
  { value: 'name_asc', label: 'Nombre (A-Z)' },
  { value: 'name_desc', label: 'Nombre (Z-A)' },
  { value: 'newest', label: 'Más recientes' },
  { value: 'oldest', label: 'Más antiguos' }
]

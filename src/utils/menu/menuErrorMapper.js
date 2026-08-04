const TECHNICAL_ERROR_PATTERNS = [
  /new row violates row-level security policy/i,
  /violates row-level security/i,
  /permission denied/i,
  /unauthorized/i,
  /\b42501\b/i
]

const CONNECTION_ERROR_PATTERNS = [
  /failed to fetch/i,
  /networkerror/i,
  /network request failed/i,
  /load failed/i,
  /fetch failed/i
]

const CONFLICT_ERROR_PATTERNS = [
  /\b23505\b/i,
  /duplicate key/i,
  /unique constraint/i,
  /conflict/i
]

const normalizeText = (value = '') => String(value || '').trim()

const stringifyError = (error) => {
  if (!error) return ''
  if (typeof error === 'string') return error
  return [
    error.message,
    error.details,
    error.hint,
    error.code,
    error.status,
    error.name
  ].filter(Boolean).join(' ')
}

const formatMenuDate = (dateISO = '') => {
  if (!dateISO) return 'la fecha seleccionada'
  try {
    return new Intl.DateTimeFormat('es-AR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(new Date(`${dateISO}T00:00:00`))
  } catch {
    return dateISO
  }
}

const formatShortMenuDate = (dateISO = '') => {
  if (!dateISO) return 'la fecha seleccionada'
  try {
    return new Intl.DateTimeFormat('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(new Date(`${dateISO}T00:00:00`))
  } catch {
    return dateISO
  }
}

const isPermissionMenuError = (error) => {
  const text = stringifyError(error)
  return TECHNICAL_ERROR_PATTERNS.some((pattern) => pattern.test(text))
}

const isConnectionMenuError = (error) => {
  const text = stringifyError(error)
  return CONNECTION_ERROR_PATTERNS.some((pattern) => pattern.test(text)) ||
    error?.name === 'TypeError'
}

const isConflictMenuError = (error) => {
  const text = stringifyError(error)
  return CONFLICT_ERROR_PATTERNS.some((pattern) => pattern.test(text))
}

export const createMenuValidationError = ({ field, message }) => ({
  kind: 'validation',
  field,
  message
})

export const createMenuPermissionError = ({ companyName }) => ({
  kind: 'permission',
  message: `No tenés permiso para modificar el menú de ${companyName}.\nVerificá que estés utilizando la empresa que tenés asignada.`
})

export const createMenuStaleError = () => ({
  kind: 'stale',
  message: 'Otra persona modificó este menú mientras lo estabas editando.\nRecargá la versión actual antes de continuar.'
})

export const createMenuUnconfirmedSaveError = ({ companyName, dateISO }) => ({
  kind: 'unknown',
  message: `No pudimos confirmar si el menú se guardó.\nActualizaremos la información antes de permitir otro intento.`,
  retryMessage: `Volvé a revisar el menú de ${companyName} para el ${formatShortMenuDate(dateISO)} antes de reintentar.`
})

export const mapMenuError = (error, {
  companyName = 'esta empresa',
  dateISO = '',
  action = 'guardar',
  savedParts = [],
  failedPart = '',
  resultUnknown = false
} = {}) => {
  if (error?.kind === 'unknown' || resultUnknown) {
    return createMenuUnconfirmedSaveError({ companyName, dateISO })
  }

  if ([
    'validation',
    'permission',
    'stale',
    'partial',
    'connection',
    'conflict',
    'server'
  ].includes(error?.kind)) {
    return error
  }

  if (savedParts.length > 0 && failedPart) {
    const savedText = savedParts.join(' y ')
    return {
      kind: 'partial',
      message: `El menú de ${savedText} se guardó correctamente, pero ${failedPart} no pudo guardarse.\nTus cambios de ${failedPart} siguen disponibles para reintentar.`
    }
  }

  if (isPermissionMenuError(error)) {
    return createMenuPermissionError({ companyName })
  }

  if (isConnectionMenuError(error)) {
    return {
      kind: 'connection',
      message: `No pudimos conectarnos para ${action} el menú.\nTus cambios siguen en pantalla. Revisá la conexión e intentá nuevamente.`,
      retryText: 'Reintentar'
    }
  }

  if (isConflictMenuError(error)) {
    return {
      kind: 'conflict',
      message: `${companyName} ya tiene un menú cargado para el ${formatShortMenuDate(dateISO)}.\nRevisá los cambios antes de reemplazarlo.`
    }
  }

  return {
    kind: 'server',
    message: `Ocurrió un problema al ${action} el menú de ${companyName} para el ${formatShortMenuDate(dateISO)}.\nNo se confirmó ningún cambio. Intentá nuevamente.`
  }
}

export const formatCompanyMenuSuccess = ({ companyName, dateISO, savedDinner = false }) => {
  const subject = savedDinner ? 'Menú y cena' : 'Menú'
  const verb = savedDinner ? 'guardados' : 'guardado'
  return `${subject} de ${companyName} ${verb} para el ${formatMenuDate(dateISO)}.`
}

export const getWeeklyMenuFailureReason = (result = {}) => {
  if (result.status === 'invalid') return 'falta el nombre de una opción'
  if (result.status === 'busy') return 'el menú todavía se estaba guardando'
  if (result.status === 'cancelled') return 'operación cancelada'
  const mapped = mapMenuError(result.error, {
    companyName: 'General',
    dateISO: result.menuDate
  })
  if (mapped.kind === 'connection') return 'error de conexión'
  if (mapped.kind === 'permission') return 'sin permisos para modificar esa fecha'
  if (mapped.kind === 'conflict') return 'conflicto con un menú existente'
  return 'error de servidor'
}

export const hasTechnicalMenuErrorText = (message = '') =>
  TECHNICAL_ERROR_PATTERNS.some((pattern) => pattern.test(normalizeText(message)))

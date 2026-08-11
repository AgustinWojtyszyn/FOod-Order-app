export const BIRTHDAY_STATUS_LABELS = {
  upcoming: 'Próximo',
  pending: 'Pendiente',
  prepared: 'Preparado',
  delivered: 'Entregado',
  cancelled: 'Cancelado'
}

export const BIRTHDAY_STATUS_VALUES = Object.keys(BIRTHDAY_STATUS_LABELS)

const normalizeText = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

export const normalizeBirthdayForm = (form = {}) => ({
  person_name: String(form.person_name || form.personName || '').trim(),
  birth_day: Number(form.birth_day || form.birthDay || 0),
  birth_month: Number(form.birth_month || form.birthMonth || 0),
  birth_year: form.birth_year || form.birthYear ? Number(form.birth_year || form.birthYear) : null,
  company_slug: String(form.company_slug || form.companySlug || '').trim(),
  company_name: String(form.company_name || form.companyName || '').trim(),
  delivery_location: String(form.delivery_location || form.deliveryLocation || '').trim(),
  cake_quantity: Number(form.cake_quantity || form.cakeQuantity || 1),
  comment: String(form.comment || '').trim(),
  is_active: form.is_active ?? form.isActive ?? true
})

export const isLeapYear = (year) =>
  Number.isInteger(year) && (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0))

export const getDaysInBirthdayMonth = (month, year = 2024) => {
  const numericMonth = Number(month)
  if (!Number.isInteger(numericMonth) || numericMonth < 1 || numericMonth > 12) return 0
  return new Date(year, numericMonth, 0).getDate()
}

export const isValidBirthdayDayMonth = (day, month) => {
  const numericDay = Number(day)
  const numericMonth = Number(month)
  if (!Number.isInteger(numericDay) || !Number.isInteger(numericMonth)) return false
  if (numericMonth < 1 || numericMonth > 12) return false
  if (numericDay < 1) return false
  return numericDay <= getDaysInBirthdayMonth(numericMonth, 2024)
}

export const getBirthdayDateForYear = ({ day, month, year }) => {
  const numericYear = Number(year)
  const numericMonth = Number(month)
  const numericDay = Number(day)
  const maxDay = getDaysInBirthdayMonth(numericMonth, numericYear)
  if (!maxDay) return null
  const safeDay = Math.min(numericDay, maxDay)
  return `${numericYear}-${String(numericMonth).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`
}

export const getAgeOnDate = ({ day, month, year }, today = new Date()) => {
  const numericYear = Number(year)
  if (!Number.isInteger(numericYear)) return null
  const todayStart = new Date(today)
  todayStart.setHours(0, 0, 0, 0)
  const birthdayThisYear = getBirthdayDateForYear({
    day,
    month,
    year: todayStart.getFullYear()
  })
  if (!birthdayThisYear) return null
  const hasHadBirthday = birthdayThisYear <= todayStart.toISOString().slice(0, 10)
  return todayStart.getFullYear() - numericYear - (hasHadBirthday ? 0 : 1)
}

export const getMinimumBirthYearForMaxAge = ({ day, month, maxAge = 99 }, today = new Date()) => {
  const todayStart = new Date(today)
  todayStart.setHours(0, 0, 0, 0)
  const birthdayThisYear = getBirthdayDateForYear({
    day,
    month,
    year: todayStart.getFullYear()
  })
  const hadBirthday = birthdayThisYear ? birthdayThisYear <= todayStart.toISOString().slice(0, 10) : true
  return todayStart.getFullYear() - maxAge - (hadBirthday ? 0 : 1)
}

export const getNextBirthdayYear = ({ day, month, today = new Date() }) => {
  const currentYear = today.getFullYear()
  const currentOccurrence = getBirthdayDateForYear({ day, month, year: currentYear })
  if (!currentOccurrence) return currentYear
  const todayISO = today.toISOString().slice(0, 10)
  return currentOccurrence >= todayISO ? currentYear : currentYear + 1
}

export const validateBirthdayForm = (form = {}, { allowedCompanies = [], companyLocations = {}, today = new Date() } = {}) => {
  const birthday = normalizeBirthdayForm(form)
  const errors = {}

  if (!birthday.person_name) errors.person_name = 'Ingresá el nombre y apellido.'
  if (!isValidBirthdayDayMonth(birthday.birth_day, birthday.birth_month)) {
    errors.birth_date = 'Ingresá un día y mes válidos.'
  }
  if (birthday.birth_year) {
    const currentYear = today.getFullYear()
    if (!Number.isInteger(birthday.birth_year) || birthday.birth_year < 1900) {
      errors.birth_year = 'Ingresá un año válido o dejalo vacío.'
    } else if (birthday.birth_year > currentYear) {
      errors.birth_year = 'No se permiten años futuros.'
    } else if (getAgeOnDate({
      day: birthday.birth_day,
      month: birthday.birth_month,
      year: birthday.birth_year
    }, today) > 99) {
      errors.birth_year = 'La edad no puede superar los 99 años'
    }
  }
  if (!birthday.company_slug) errors.company_slug = 'Seleccioná una empresa.'

  const allowedSlugs = allowedCompanies.map((company) => company.slug)
  if (birthday.company_slug && allowedSlugs.length && !allowedSlugs.includes(birthday.company_slug)) {
    errors.company_slug = 'No tenés permisos para esta empresa.'
  }

  const validLocations = companyLocations[birthday.company_slug] || []
  if (!birthday.delivery_location) {
    errors.delivery_location = 'Seleccioná una ubicación.'
  } else if (validLocations.length && !validLocations.includes(birthday.delivery_location)) {
    errors.delivery_location = 'La ubicación no pertenece a la empresa.'
  }

  if (!Number.isInteger(birthday.cake_quantity) || birthday.cake_quantity <= 0) {
    errors.cake_quantity = 'La cantidad debe ser un entero mayor que cero.'
  }

  return {
    birthday,
    errors,
    valid: Object.keys(errors).length === 0
  }
}

export const findBirthdayDuplicate = (birthday, existingBirthdays = []) => {
  const normalized = normalizeBirthdayForm(birthday)
  const personKey = normalizeText(normalized.person_name)
  return existingBirthdays.find((item) => {
    if (!item?.is_active) return false
    if (normalized.id && item.id === normalized.id) return false
    return item.company_slug === normalized.company_slug &&
      Number(item.birth_day) === normalized.birth_day &&
      Number(item.birth_month) === normalized.birth_month &&
      normalizeText(item.person_name) === personKey
  }) || null
}

export const isHumanResourcesRole = (user) =>
  String(user?.role || user?.user_metadata?.role || '').trim().toLowerCase() === 'human_resources'

export const canOperateBirthdayOrder = ({ isAdmin = false, isCompanyAdmin = false } = {}) =>
  Boolean(isAdmin || isCompanyAdmin)

export const summarizeBirthdayOrders = (orders = [], today = new Date()) => {
  const todayISO = today.toISOString().slice(0, 10)
  const base = {
    today: 0,
    upcoming: 0,
    pending: 0,
    prepared: 0,
    delivered: 0,
    cancelled: 0
  }

  return orders.reduce((summary, order) => {
    const quantity = Number(order?.cake_quantity || 0)
    if (order?.planned_delivery_date === todayISO && order?.status !== 'cancelled') {
      summary.today += quantity
    }
    if (Object.prototype.hasOwnProperty.call(summary, order?.status)) {
      summary[order.status] += quantity
    }
    return summary
  }, base)
}

export const isOperationalBirthdayOrder = (order = {}) => order?.status !== 'cancelled'

export const filterBirthdayCakeOrders = (orders = [], filters = {}) => orders.filter((order) => {
  if (filters.company && filters.company !== 'all' && order.company_slug !== filters.company) return false
  if (filters.location && filters.location !== 'all' && order.delivery_location !== filters.location) return false
  if (filters.status && filters.status !== 'all') return order.status === filters.status
  return isOperationalBirthdayOrder(order)
})

export const filterBirthdays = (birthdays = [], filters = {}) => {
  const search = normalizeText(filters.search)
  return birthdays.filter((birthday) => {
    if (search && !normalizeText(birthday.person_name).includes(search)) return false
    if (filters.company && filters.company !== 'all' && birthday.company_slug !== filters.company) return false
    if (filters.location && filters.location !== 'all' && birthday.delivery_location !== filters.location) return false
    if (filters.month && filters.month !== 'all' && Number(birthday.birth_month) !== Number(filters.month)) return false
    if (filters.status === 'active' && !birthday.is_active) return false
    if (filters.status === 'inactive' && birthday.is_active) return false
    return true
  })
}

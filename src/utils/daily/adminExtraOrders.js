const isAdminExtraOrder = (order = {}) =>
  String(order?.order_origin || '').toLowerCase() === 'admin_extra' ||
  Boolean(order?.created_by_admin_id || order?.admin_extra_created_at)

const getAdminExtraOrderLabel = (order = {}) =>
  isAdminExtraOrder(order) ? 'Extra' : 'Normal'

const normalizeText = (value = '') => String(value ?? '').trim()

const firstValue = (value) => {
  if (Array.isArray(value)) return normalizeText(value.find(Boolean))
  return normalizeText(value)
}

const getPersonName = (person = {}) =>
  normalizeText(
    person?.display_name ||
    person?.full_name ||
    person?.name ||
    person?.primary_name
  )

const getPersonEmail = (person = {}) =>
  normalizeText(
    person?.email ||
    firstValue(person?.emails) ||
    person?.primary_email
  )

const getResolvedAdminPerson = (order = {}, peopleById = new Map()) => {
  const adminId = normalizeText(order.created_by_admin_id)
  if (!adminId || !peopleById?.get) return null
  return peopleById.get(adminId) || null
}

const resolveAdminExtraCreator = (order = {}, { peopleById } = {}) => {
  if (!isAdminExtraOrder(order)) {
    return {
      label: '',
      name: '',
      email: '',
      hasTraceability: false
    }
  }

  const resolvedPerson = getResolvedAdminPerson(order, peopleById)
  const directName = normalizeText(order.created_by_admin_name || order.admin_extra_creator_name)
  const directEmail = normalizeText(order.created_by_admin_email || order.admin_extra_creator_email)
  const resolvedName = getPersonName(resolvedPerson)
  const resolvedEmail = getPersonEmail(resolvedPerson)
  const name = directName || resolvedName
  const email = directEmail || resolvedEmail
  const display = name || email

  if (display) {
    return {
      label: `Solicitado por ${display}`,
      name: display,
      email,
      hasTraceability: true
    }
  }

  return {
    label: 'Solicitado por administrador',
    name: 'administrador',
    email: '',
    hasTraceability: false
  }
}

export {
  getAdminExtraOrderLabel,
  isAdminExtraOrder,
  resolveAdminExtraCreator
}

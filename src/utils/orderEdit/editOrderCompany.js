import { getCompanyByLocationOrSlug } from '../../constants/companyConfig'

const ORDER_COMPANY_KEYS = [
  'company_slug',
  'company',
  'company_id',
  'company_name',
  'organization',
  'location',
  'delivery_location'
]

const firstString = (values = []) =>
  values.map(value => String(value || '').trim()).find(Boolean) || ''

const normalizeLookup = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

export const resolveEditOrderCompany = (order = {}, fallbackLocation = '') => {
  for (const key of ORDER_COMPANY_KEYS) {
    const company = getCompanyByLocationOrSlug(order?.[key])
    if (company) return company
  }
  return getCompanyByLocationOrSlug(fallbackLocation)
}

export const resolveEditOrderLocation = (order = {}) => {
  const company = resolveEditOrderCompany(order)
  const explicitLocation = firstString([
    order?.location,
    order?.organization,
    order?.delivery_location
  ])

  if (explicitLocation) {
    const explicitCompany = getCompanyByLocationOrSlug(explicitLocation)
    if (!company || explicitCompany?.slug === company.slug || !explicitCompany) {
      return explicitLocation
    }
  }

  return company?.locations?.[0] || explicitLocation
}

export const resolveEditOrderCompanySlug = (order = {}, fallbackLocation = '') => {
  const company = resolveEditOrderCompany(order, fallbackLocation)
  return company?.slug || ''
}

export const resolveEditOrderOptionsSlug = (order = {}, fallbackLocation = '') => {
  const company = resolveEditOrderCompany(order, fallbackLocation)
  return company?.optionsSourceSlug || company?.slug || ''
}

export const appendOriginalLocation = (locations = [], originalLocation = '') => {
  const next = [...new Set((locations || []).map(location => String(location || '').trim()).filter(Boolean))]
  const original = String(originalLocation || '').trim()
  if (original && !next.some(location => normalizeLookup(location) === normalizeLookup(original))) {
    next.push(original)
  }
  return next
}

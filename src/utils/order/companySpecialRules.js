import { getTomorrowISOInTimeZone } from '../dateUtils'

const GENNEIA_OPTION_RULE_COMPANIES = new Set(['genneia', 'distro_cuyo'])
const MENU_BEVERAGE_CHOICE_COMPANIES = new Set(['placo'])
const FRUIT_DESSERT_CHOICE_COMPANIES = new Set(['genneia', 'distro_cuyo', 'igarreta'])
const POSTRE_DELIVERY_WEEKDAYS = new Set([2, 4])

const normalizeCompanySlug = (value = '') =>
  String(value || '').trim().toLowerCase()

export const hasGenneiaOptionRules = (companyOrSlug) => {
  const slug = typeof companyOrSlug === 'string'
    ? companyOrSlug
    : companyOrSlug?.slug
  return GENNEIA_OPTION_RULE_COMPANIES.has(normalizeCompanySlug(slug))
}

export const requiresMenuBeverageChoice = (companyOrSlug) => {
  const slug = typeof companyOrSlug === 'string'
    ? companyOrSlug
    : companyOrSlug?.slug
  return MENU_BEVERAGE_CHOICE_COMPANIES.has(normalizeCompanySlug(slug))
}

export const hasFruitDessertChoiceRules = (companyOrSlug) => {
  const slug = typeof companyOrSlug === 'string'
    ? companyOrSlug
    : companyOrSlug?.slug
  return FRUIT_DESSERT_CHOICE_COMPANIES.has(normalizeCompanySlug(slug))
}

export const getMenuBeverageTitle = () => 'Bebidas (solo Genneia)'

export const isPostreDeliveryDate = (isoDate) => {
  const deliveryDate = String(isoDate || getTomorrowISOInTimeZone() || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) return false

  const [year, month, day] = deliveryDate.split('-').map(Number)
  const weekday = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay()
  return POSTRE_DELIVERY_WEEKDAYS.has(weekday)
}

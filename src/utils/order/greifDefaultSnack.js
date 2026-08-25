export const GREIF_DEFAULT_SNACK_RESPONSE_ID = 'greif-default-refrigerio'
export const GREIF_REFRIGERIO_MENU_ITEM_ID = 'greif-refrigerio'
export const GREIF_REFRIGERIO_LABEL = 'Refrigerio'

const normalizeSlug = (value = '') => String(value || '').trim().toLowerCase()

export const isGreifCompany = (companySlug = '') => normalizeSlug(companySlug) === 'greif'

export const isGreifDefaultSnackResponse = (response = {}) =>
  String(response?.id || '').trim() === GREIF_DEFAULT_SNACK_RESPONSE_ID ||
  response?.auto_applied === true && String(response?.source || '') === GREIF_DEFAULT_SNACK_RESPONSE_ID

const normalizeLabel = (value = '') =>
  String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

export const isGreifRefrigerioMenuItem = (item = {}) =>
  String(item?.id || '').trim() === GREIF_REFRIGERIO_MENU_ITEM_ID ||
  item?.isGreifRefrigerio === true ||
  normalizeLabel(item?.name || item?.title || item?.description || item?.label) === normalizeLabel(GREIF_REFRIGERIO_LABEL)

export const withGreifRefrigerioMenuItem = ({
  companySlug = '',
  items = []
} = {}) => {
  const safeItems = Array.isArray(items) ? items.filter(Boolean) : []
  if (!isGreifCompany(companySlug)) return safeItems
  return safeItems.filter((item) => !isGreifRefrigerioMenuItem(item))
}

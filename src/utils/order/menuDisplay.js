const normalizeText = (value = '') => (value || '').toString().trim()
const normalizeSlotTitle = (value = '') => normalizeText(value).toLowerCase()
const HIDDEN_ORDER_MENU_SLOT_INDEX = 4
const HIDDEN_ORDER_MENU_COMPANY_SLUG = 'epse'
const IGARRETA_COMPANY_SLUG = 'igarreta'
const ISEMAR_COMPANY_SLUG = 'isemar'
const IGARRETA_ISEMAR_LAST_MENU_SLOT_INDEX = 5
const IGARRETA_ISEMAR_SALAD_SLOT_INDEX = 4
const IGARRETA_SALAD_DISH = 'Ensalada del día'
const IGARRETA_ISEMAR_CELIAC_DISH = 'Celíaco'
const DIETA_COMPANY_SLUGS = new Set(['greif', 'placo', 'molinos'])

const getMenuLabelByIndex = (index = 0) => (index === 0 ? 'Menú principal' : `Opción ${index}`)

const getSlotIndexFromTitle = (title = '') => {
  const normalized = normalizeSlotTitle(title)
  if (!normalized) return null
  if (
    normalized.includes('menú principal') ||
    normalized.includes('menu principal') ||
    normalized.includes('plato principal')
  ) {
    return 0
  }
  const optionMatch = normalized.match(/opci[oó]n\s*0?([1-6])\b/)
  if (optionMatch) return Number(optionMatch[1])
  return null
}

const getMenuDish = (item = {}, labelUsesTitle = false) => {
  const description = normalizeText(item.description)
  if (description) return description
  if (labelUsesTitle) return ''
  return normalizeText(item.name)
}

const getMenuDisplay = (item = {}, index = 0, companySlug = '') => {
  const title = normalizeText(item?.displayName || item?.name)
  const inferredSlot = getSlotIndexFromTitle(title)
  const slotIndex = Number.isFinite(item?.slotIndex)
    ? item.slotIndex
    : (Number.isFinite(inferredSlot) ? inferredSlot : index)
  const label = title || getMenuLabelByIndex(slotIndex)
  const dish = getMenuDish(item, Boolean(title))
  return getCompanyMenuDisplay({
    label,
    dish,
    slotIndex,
    isMainMenu: slotIndex === 0
  }, companySlug)
}

const withMenuSlotIndex = (items = []) => {
  return (items || []).map((item, index) => ({
    ...item,
    slotIndex: Number.isFinite(item?.slotIndex)
      ? item.slotIndex
      : (Number.isFinite(getSlotIndexFromTitle(item?.name)) ? getSlotIndexFromTitle(item?.name) : index)
  }))
}

const isMainMenuSlot = (item = {}) => (Number.isFinite(item?.slotIndex) ? item.slotIndex === 0 : item?.isMainMenu === true)

const getMenuSlotIndex = (item = {}, fallbackIndex = null) => {
  if (Number.isFinite(item?.slotIndex)) return item.slotIndex
  const inferred = getSlotIndexFromTitle(item?.name)
  if (Number.isFinite(inferred)) return inferred
  return Number.isFinite(fallbackIndex) ? fallbackIndex : null
}

const normalizeCompanySlug = (value = '') => {
  const raw = typeof value === 'object' && value !== null ? value.slug : value
  return (raw || '').toString().trim().toLowerCase()
}
const isIgarretaIsemarCompany = (companySlug = '') => {
  const slug = normalizeCompanySlug(companySlug)
  return slug === IGARRETA_COMPANY_SLUG || slug === ISEMAR_COMPANY_SLUG
}

const getConfiguredMenuItems = (companyOrSlug) =>
  (typeof companyOrSlug === 'object' && companyOrSlug !== null && Array.isArray(companyOrSlug.menuItems))
    ? companyOrSlug.menuItems
    : []

const getMenuItemKey = (item = {}, fallbackIndex = null) => {
  const slotIndex = getMenuSlotIndex(item, fallbackIndex)
  if (slotIndex === 0) return 'menu_principal'
  if (slotIndex >= 1 && slotIndex <= 3) return `opcion_${slotIndex}`
  const text = normalizeSlotTitle(`${item?.name || ''} ${item?.description || ''}`)
  if (text.includes('dieta')) return 'dieta'
  if (text.includes('celiac')) return 'celiacos'
  if (text.includes('lomo')) return 'bife_lomo'
  if (text.includes('pollo')) return 'bife_pollo'
  if (text.includes('guarnicion') || text.includes('guarnición')) return 'guarniciones'
  return 'otros_menus'
}

const isMenuItemEnabledForCompany = (item = {}, companyOrSlug = '', fallbackIndex = null) => {
  const configuredItems = getConfiguredMenuItems(companyOrSlug)
  if (configuredItems.length === 0) return true
  const key = getMenuItemKey(item, fallbackIndex)
  const configured = configuredItems.find((entry) => entry?.key === key || entry?.menuItemKey === key)
  return configured?.enabled !== false
}

const replaceDietaLabel = (value, companySlug) => {
  const text = normalizeText(value)
  if (!DIETA_COMPANY_SLUGS.has(normalizeCompanySlug(companySlug)) || !/bife\s+del\s+d[ií]a/i.test(text)) return value
  return 'Dieta'
}

const getCompanyMenuDisplay = (display, companySlug) => {
  if (isIgarretaIsemarCompany(companySlug) && display?.slotIndex === IGARRETA_ISEMAR_SALAD_SLOT_INDEX) {
    return {
      ...display,
      label: getMenuLabelByIndex(IGARRETA_ISEMAR_SALAD_SLOT_INDEX),
      dish: IGARRETA_SALAD_DISH
    }
  }
  if (isIgarretaIsemarCompany(companySlug) && display?.slotIndex === IGARRETA_ISEMAR_LAST_MENU_SLOT_INDEX) {
    return {
      ...display,
      label: getMenuLabelByIndex(IGARRETA_ISEMAR_LAST_MENU_SLOT_INDEX),
      dish: IGARRETA_ISEMAR_CELIAC_DISH
    }
  }
  if (!DIETA_COMPANY_SLUGS.has(normalizeCompanySlug(companySlug))) return display
  return {
    ...display,
    label: replaceDietaLabel(display.label, companySlug),
    dish: replaceDietaLabel(display.dish, companySlug)
  }
}

const isHiddenOrderMenuSlot = (item = {}, companySlug = '') =>
  normalizeCompanySlug(companySlug) === HIDDEN_ORDER_MENU_COMPANY_SLUG &&
  getMenuSlotIndex(item) === HIDDEN_ORDER_MENU_SLOT_INDEX

const isHiddenIgarretaMenuSlot = (item = {}, fallbackIndex = null) =>
  getMenuSlotIndex(item, fallbackIndex) > IGARRETA_ISEMAR_LAST_MENU_SLOT_INDEX

const withIgarretaIsemarMenuItem = (item = {}, fallbackIndex = null) => {
  const slotIndex = getMenuSlotIndex(item, fallbackIndex)
  if (slotIndex === IGARRETA_ISEMAR_SALAD_SLOT_INDEX) {
    return {
      ...item,
      name: getMenuLabelByIndex(IGARRETA_ISEMAR_SALAD_SLOT_INDEX),
      displayName: getMenuLabelByIndex(IGARRETA_ISEMAR_SALAD_SLOT_INDEX),
      description: IGARRETA_SALAD_DISH,
      slotIndex
    }
  }
  if (slotIndex !== IGARRETA_ISEMAR_LAST_MENU_SLOT_INDEX) return item
  return {
    ...item,
    name: getMenuLabelByIndex(IGARRETA_ISEMAR_LAST_MENU_SLOT_INDEX),
    displayName: getMenuLabelByIndex(IGARRETA_ISEMAR_LAST_MENU_SLOT_INDEX),
    description: IGARRETA_ISEMAR_CELIAC_DISH,
    slotIndex
  }
}

const withCompanyMenuDisplay = (item = {}, companySlug = '', fallbackIndex = null) => {
  if (isIgarretaIsemarCompany(companySlug)) return withIgarretaIsemarMenuItem(item, fallbackIndex)
  if (normalizeCompanySlug(companySlug) !== HIDDEN_ORDER_MENU_COMPANY_SLUG) return item
  const slotIndex = getMenuSlotIndex(item, fallbackIndex)
  if (!Number.isFinite(slotIndex) || slotIndex <= HIDDEN_ORDER_MENU_SLOT_INDEX) return item

  const displaySlotIndex = slotIndex - 1
  const name = normalizeText(item?.name)
  const displayName = name
    ? name.replace(/opci[oó]n\s*0?[1-6]\b/i, `Opción ${displaySlotIndex}`)
    : getMenuLabelByIndex(displaySlotIndex)

  return {
    ...item,
    displayName,
    displaySlotIndex
  }
}

const filterOrderableMenuItems = (items = [], companySlug = '') =>
  (items || [])
    .filter((item, index) => {
      if (isIgarretaIsemarCompany(companySlug)) return !isHiddenIgarretaMenuSlot(item, index) && isMenuItemEnabledForCompany(item, companySlug, index)
      return !isHiddenOrderMenuSlot(item, companySlug) && isMenuItemEnabledForCompany(item, companySlug, index)
    })
    .map((item, index) => withCompanyMenuDisplay(item, companySlug, index))

const hasHiddenOrderMenuSelection = (items = [], companySlug = '') =>
  (items || []).some((item) => isHiddenOrderMenuSlot(item, companySlug))

export {
  HIDDEN_ORDER_MENU_SLOT_INDEX,
  getMenuLabelByIndex,
  getMenuDish,
  getMenuDisplay,
  getMenuSlotIndex,
  getSlotIndexFromTitle,
  filterOrderableMenuItems,
  hasHiddenOrderMenuSelection,
  isHiddenOrderMenuSlot,
  withMenuSlotIndex,
  isMainMenuSlot
}

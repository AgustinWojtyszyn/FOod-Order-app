const normalizeText = (value = '') => (value || '').toString().trim()
const normalizeSlotTitle = (value = '') => normalizeText(value).toLowerCase()
const HIDDEN_ORDER_MENU_SLOT_INDEX = 4
const HIDDEN_ORDER_MENU_COMPANY_SLUG = 'epse'
const DIETA_COMPANY_SLUGS = new Set(['greif', 'molinos'])

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

const normalizeCompanySlug = (value = '') => (value || '').toString().trim().toLowerCase()

const replaceDietaLabel = (value, companySlug) => {
  const text = normalizeText(value)
  if (!DIETA_COMPANY_SLUGS.has(normalizeCompanySlug(companySlug)) || !/bife\s+del\s+d[ií]a/i.test(text)) return value
  return 'Dieta'
}

const getCompanyMenuDisplay = (display, companySlug) => {
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

const withCompanyMenuDisplay = (item = {}, companySlug = '') => {
  if (normalizeCompanySlug(companySlug) !== HIDDEN_ORDER_MENU_COMPANY_SLUG) return item
  const slotIndex = getMenuSlotIndex(item)
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
    .filter((item) => !isHiddenOrderMenuSlot(item, companySlug))
    .map((item) => withCompanyMenuDisplay(item, companySlug))

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

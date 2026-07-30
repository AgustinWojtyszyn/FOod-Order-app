const normalizeText = (value = '') => (value || '').toString().trim()
const normalizeSlotTitle = (value = '') => normalizeText(value).toLowerCase()
const HIDDEN_ORDER_MENU_SLOT_INDEX = 4

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

const getMenuDisplay = (item = {}, index = 0) => {
  const title = normalizeText(item?.name)
  const inferredSlot = getSlotIndexFromTitle(title)
  const slotIndex = Number.isFinite(item?.slotIndex)
    ? item.slotIndex
    : (Number.isFinite(inferredSlot) ? inferredSlot : index)
  const label = title || getMenuLabelByIndex(slotIndex)
  const dish = getMenuDish(item, Boolean(title))
  return {
    label,
    dish,
    slotIndex,
    isMainMenu: slotIndex === 0
  }
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

const isHiddenOrderMenuSlot = (item = {}, fallbackIndex = null) =>
  getMenuSlotIndex(item, fallbackIndex) === HIDDEN_ORDER_MENU_SLOT_INDEX

const filterOrderableMenuItems = (items = []) =>
  (items || []).filter((item, index) => !isHiddenOrderMenuSlot(item, index))

const hasHiddenOrderMenuSelection = (items = []) =>
  (items || []).some((item, index) => isHiddenOrderMenuSlot(item, index))

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

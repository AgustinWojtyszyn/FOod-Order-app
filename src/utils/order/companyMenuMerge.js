import { getMenuSlotIndex } from './menuDisplay'

const normalizeCompanySlug = (value = '') => (value || '').toString().trim().toLowerCase()

const getMenuMergeKey = (item = {}) => {
  const slotIndex = getMenuSlotIndex(item)
  if (Number.isFinite(slotIndex)) return `slot:${slotIndex}`
  const name = (item?.name || '').toString().trim().toLowerCase()
  return name ? `name:${name}` : null
}

const mergeCompanyMenuItems = (globalItems = [], companyItems = []) => {
  const merged = []
  const indexByKey = new Map()

  ;(globalItems || []).forEach((item) => {
    const key = getMenuMergeKey(item)
    if (key) indexByKey.set(key, merged.length)
    merged.push(item)
  })

  ;(companyItems || []).forEach((item) => {
    const key = getMenuMergeKey(item)
    if (key && indexByKey.has(key)) {
      merged[indexByKey.get(key)] = item
      return
    }
    if (key) indexByKey.set(key, merged.length)
    merged.push(item)
  })

  return merged
}

export {
  getMenuMergeKey,
  mergeCompanyMenuItems,
  normalizeCompanySlug
}

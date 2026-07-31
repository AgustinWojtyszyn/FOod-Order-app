import { addDaysToISO } from '../../utils/dateUtils'
import { sortMenuItems } from '../../utils/admin/adminCalculations'
import { db } from '../../supabaseClient'
import { notifyError, notifyInfo, notifySuccess } from '../../utils/notice'
import { confirmAction } from '../../utils/confirm'
import { Sound } from '../../utils/Sound'

const useAdminMenuActions = ({
  menuItemsByDate,
  draftMenuItemsByDate,
  savingMenuByDate,
  setMenuItemsForDate,
  setDraftItemsForDate,
  setEditingForDate,
  setSavingForDate,
  fetchMenuForDate,
  companySlug = 'global'
}) => {
  const normalizeForComparison = (items = []) =>
    items.map(item => ({
      name: (item.name || '').trim(),
      description: (item.description || '').trim()
    }))

  const isSameMenu = (a, b) =>
    JSON.stringify(normalizeForComparison(a)) === JSON.stringify(normalizeForComparison(b))

  const getPreviousDateISO = (dateISO) => addDaysToISO(dateISO, -1)

  const handleMenuUpdate = async (menuDate, { silent = false } = {}) => {
    if (savingMenuByDate[menuDate]) return

    try {
      const draftItems = draftMenuItemsByDate[menuDate] || []
      const validItems = draftItems.filter(item => item.name.trim() !== '')

      if (validItems.length === 0) {
        if (!silent) notifyInfo('Debe haber al menos un plato en el menú')
        return
      }

      const prevDate = getPreviousDateISO(menuDate)
      let prevItems = menuItemsByDate[prevDate]
      if (!prevItems) {
        const { data: prevData, error: prevError } = await db.getMenuItemsByDate(prevDate, companySlug)
        if (prevError) {
          console.error('Error fetching previous menu:', prevError)
        } else {
          prevItems = sortMenuItems(prevData || [])
          setMenuItemsForDate(prevDate, prevItems)
        }
      }

      if ((prevItems || []).length > 0 && isSameMenu(validItems, prevItems)) {
        if (!silent) {
          const confirmed = await confirmAction({
            title: 'Repetir menú',
            message: 'Estás repitiendo el menú del día anterior. ¿Querés continuar?',
            confirmText: 'Sí, repetir'
          })
          if (!confirmed) return
        }
      }

      setSavingForDate(menuDate, true)
      const requestId = crypto.randomUUID?.() || Math.random().toString(36).slice(2)
      console.debug('[menu][save] request_id', requestId, 'items', validItems.length, 'menu_date', menuDate)
      const { error } = await db.updateMenuItemsByDate(menuDate, validItems, requestId, companySlug)

      if (error) {
        console.error('Error updating menu:', error)
        if (!silent) notifyError('Error al actualizar el menú')
      } else {
        setEditingForDate(menuDate, false)
        Sound.playSuccess()
        if (!silent) notifySuccess('Menú actualizado exitosamente')
        await fetchMenuForDate(menuDate)
      }
    } catch (err) {
      console.error('Error:', err)
      if (!silent) notifyError('Error al actualizar el menú')
    } finally {
      setSavingForDate(menuDate, false)
    }
  }

  const handleMenuItemChange = (menuDate, index, field, value) => {
    const current = draftMenuItemsByDate[menuDate] || []
    const updatedItems = [...current]
    updatedItems[index] = { ...updatedItems[index], [field]: value }
    setDraftItemsForDate(menuDate, updatedItems)
  }

  const addMenuItem = (menuDate) => {
    const current = draftMenuItemsByDate[menuDate] || []
    const nextIndex = current.length
    const optionsCount = Math.max(current.length - 1, 0)
    const nextName = nextIndex === 0 ? 'Menú principal' : `Opción ${optionsCount + 1}`
    setDraftItemsForDate(menuDate, [...current, { name: nextName, description: '' }])
  }

  const removeMenuItem = (menuDate, index) => {
    const current = draftMenuItemsByDate[menuDate] || []
    if (current.length <= 1) {
      notifyInfo('Debe haber al menos un plato en el menú')
      return
    }
    const updatedItems = current.filter((_, i) => i !== index)
    setDraftItemsForDate(menuDate, updatedItems)
  }

  return {
    handleMenuUpdate,
    handleMenuItemChange,
    addMenuItem,
    removeMenuItem
  }
}

export { useAdminMenuActions }

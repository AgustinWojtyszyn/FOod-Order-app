import { useState } from 'react'
import { addDaysToISO } from '../../utils/dateUtils'
import { sortMenuItems } from '../../utils/admin/adminCalculations'
import { db } from '../../supabaseClient'
import { notifyError, notifyInfo, notifySuccess } from '../../utils/notice'
import { confirmAction } from '../../utils/confirm'
import { Sound } from '../../utils/Sound'
import { mapMenuError } from '../../utils/menu/menuErrorMapper'

const logAdminMenuError = (...args) => {
  if (import.meta.env.DEV) console.error(...args)
}

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
  const [deletedMenuItemsByDate, setDeletedMenuItemsByDate] = useState({})

  const normalizeForComparison = (items = []) =>
    items.map(item => ({
      name: (item.name || '').trim(),
      description: (item.description || '').trim()
    }))

  const isSameMenu = (a, b) =>
    JSON.stringify(normalizeForComparison(a)) === JSON.stringify(normalizeForComparison(b))

  const getPreviousDateISO = (dateISO) => addDaysToISO(dateISO, -1)

  const getMenuItemChangeSummary = (menuDate) => {
    const draftItems = draftMenuItemsByDate[menuDate] || []
    const currentItems = menuItemsByDate[menuDate] || []
    const currentById = new Map(currentItems.filter(item => item.id).map(item => [item.id, item]))
    const validItems = draftItems.filter(item => (item.name || '').trim() !== '')
    const newItems = validItems.filter(item => !item.id)
    const modifiedItems = validItems.filter(item => {
      if (!item.id || !currentById.has(item.id)) return false
      const current = currentById.get(item.id)
      return (item.name || '').trim() !== (current.name || '').trim() ||
        (item.description || '').trim() !== (current.description || '').trim()
    })
    const deletedItems = deletedMenuItemsByDate[menuDate] || []

    return {
      newItems,
      modifiedItems,
      deletedItems,
      hasChanges: newItems.length > 0 || modifiedItems.length > 0 || deletedItems.length > 0
    }
  }

  const clearDeletedMenuItemsForDate = (menuDate) => {
    setDeletedMenuItemsByDate(prev => {
      const next = { ...prev }
      delete next[menuDate]
      return next
    })
  }

  const handleMenuUpdate = async (menuDate, { silent = false } = {}) => {
    if (savingMenuByDate[menuDate]) return { ok: false, status: 'busy', menuDate }

    try {
      const draftItems = draftMenuItemsByDate[menuDate] || []
      const validItems = draftItems.filter(item => (item.name || '').trim() !== '')

      if (validItems.length === 0) {
        const message = 'Agregá al menos un plato antes de guardar.'
        if (!silent) notifyInfo(message)
        return { ok: false, status: 'invalid', menuDate, message }
      }

      const changeSummary = getMenuItemChangeSummary(menuDate)
      const itemsToPersist = [
        ...changeSummary.newItems,
        ...changeSummary.modifiedItems
      ]

      if (itemsToPersist.length === 0) {
        setEditingForDate(menuDate, false)
        clearDeletedMenuItemsForDate(menuDate)
        await fetchMenuForDate(menuDate)
        if (!silent) {
          if (changeSummary.deletedItems.length > 0) {
            notifySuccess('Cambios del menú registrados')
          } else {
            notifyInfo('No hay cambios para guardar')
          }
        }
        return { ok: true, status: changeSummary.deletedItems.length > 0 ? 'deleted-only' : 'unchanged', menuDate }
      }

      const prevDate = getPreviousDateISO(menuDate)
      let prevItems = menuItemsByDate[prevDate]
      if (!prevItems) {
        const { data: prevData, error: prevError } = await db.getMenuItemsByDate(prevDate, companySlug)
        if (prevError) {
          logAdminMenuError('Error fetching previous menu:', prevError)
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
          if (!confirmed) return { ok: false, status: 'cancelled', menuDate }
        }
      }

      setSavingForDate(menuDate, true)
      const requestId = crypto.randomUUID?.() || Math.random().toString(36).slice(2)
      console.debug('[menu][save] request_id', requestId, 'items', itemsToPersist.length, 'menu_date', menuDate)
      const { error } = await db.updateMenuItemsByDate(menuDate, itemsToPersist, requestId, companySlug)

      if (error) {
        logAdminMenuError('Error updating menu:', error)
        const mapped = mapMenuError(error, { companyName: 'General', dateISO: menuDate })
        if (!silent) notifyError(mapped.message)
        return { ok: false, status: 'error', menuDate, error, message: mapped.message }
      } else {
        setEditingForDate(menuDate, false)
        clearDeletedMenuItemsForDate(menuDate)
        Sound.playSuccess()
        if (!silent) notifySuccess('Menú actualizado exitosamente')
        await fetchMenuForDate(menuDate)
        return { ok: true, status: 'saved', menuDate }
      }
    } catch (err) {
      logAdminMenuError('Error:', err)
      const mapped = mapMenuError(err, { companyName: 'General', dateISO: menuDate })
      if (!silent) notifyError(mapped.message)
      return { ok: false, status: 'error', menuDate, error: err, message: mapped.message }
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

  const removeMenuItem = async (menuDate, index) => {
    const current = draftMenuItemsByDate[menuDate] || []
    if (current.length <= 1) {
      notifyInfo('Agregá al menos un plato antes de guardar.')
      return
    }
    const item = current[index]
    if (item?.id) {
      const confirmed = await confirmAction({
        title: 'Eliminar plato',
        message: `Se eliminará solo "${item.name || 'este plato'}" de ${menuDate}. Los demás platos no se modificarán.`,
        confirmText: 'Eliminar plato'
      })
      if (!confirmed) return

      const requestId = crypto.randomUUID?.() || Math.random().toString(36).slice(2)
      const { data, error } = await db.deleteMenuItemById({
        menuDate,
        itemId: item.id,
        companySlug,
        requestId
      })
      if (error) {
        logAdminMenuError('Error deleting menu item:', error)
        notifyError(mapMenuError(error, {
          companyName: companySlug === 'global' ? 'General' : companySlug,
          dateISO: menuDate,
          action: 'eliminar'
        }).message)
        return
      }
      setDeletedMenuItemsByDate(prev => ({
        ...prev,
        [menuDate]: [...(prev[menuDate] || []), data || item]
      }))
      setMenuItemsForDate(menuDate, (menuItemsByDate[menuDate] || []).filter(existing => existing.id !== item.id))
      notifySuccess('Plato eliminado')
    }
    const updatedItems = current.filter((_, i) => i !== index)
    setDraftItemsForDate(menuDate, updatedItems)
  }

  return {
    handleMenuUpdate,
    handleMenuItemChange,
    addMenuItem,
    removeMenuItem,
    getMenuItemChangeSummary,
    clearDeletedMenuItemsForDate
  }
}

export { useAdminMenuActions }

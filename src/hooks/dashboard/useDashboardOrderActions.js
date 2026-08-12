import { useCallback, useState } from 'react'
import { getUserFriendlyErrorMessage } from '../../utils'

export const useDashboardOrderActions = ({
  orders,
  setOrders,
  fetchOrders,
  calculateStats,
  navigate,
  db,
  isAdmin = false,
  isOrderEditable,
  EDIT_WINDOW_MINUTES,
  confirmAction,
  notifyError,
  notifyInfo,
  notifySuccess,
  notifyWarning,
  showToast
} = {}) => {
  const [deleteConfirmOrder, setDeleteConfirmOrder] = useState(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)

  const handleMarkAsArchived = useCallback(async (orderId) => {
    const confirmed = await confirmAction({
      title: 'Archivar pedido',
      message: 'Este pedido pasará a estado archivado y no se podrá modificar.',
      confirmText: 'Archivar'
    })
    if (confirmed) {
      try {
        const reason = isAdmin && typeof window !== 'undefined'
          ? String(window.prompt('Motivo obligatorio para la acción administrativa:') || '').trim()
          : ''
        if (isAdmin && !reason) {
          notifyError('Indicá el motivo para continuar.')
          return
        }
        const { error } = await db.updateOrderStatus(orderId, 'archived', {
          adminAudit: isAdmin,
          reason
        })
        if (error) {
          notifyError('Error al actualizar el pedido')
        } else {
          setOrders((prev) => {
            if (!Array.isArray(prev)) return prev
            const next = prev.map((order) =>
              order?.id === orderId ? { ...order, status: 'archived', displayStatus: 'archived' } : order
            )
            calculateStats(next)
            return next
          })
          setTimeout(() => fetchOrders(true), 1500)
        }
      } catch (err) {
        console.error('Error:', err)
        notifyError('Error al actualizar el pedido')
      }
    }
  }, [calculateStats, confirmAction, db, fetchOrders, isAdmin, notifyError, setOrders])

  const handleStatusChange = useCallback(async (orderId, newStatus, currentStatus) => {
    if (currentStatus === newStatus) return

    const statusNames = {
      pending: 'Pendiente',
      archived: 'Archivado',
      cancelled: 'Cancelado'
    }

    const confirmed = await confirmAction({
      title: 'Cambiar estado del pedido',
      message: `¿Querés cambiar el estado a "${statusNames[newStatus]}"?`,
      confirmText: 'Cambiar estado'
    })
    if (confirmed) {
      try {
        const reason = isAdmin && typeof window !== 'undefined'
          ? String(window.prompt('Motivo obligatorio para la acción administrativa:') || '').trim()
          : ''
        if (isAdmin && !reason) {
          notifyError('Indicá el motivo para continuar.')
          return
        }
        const { error } = await db.updateOrderStatus(orderId, newStatus, {
          adminAudit: isAdmin,
          reason
        })
        if (error) {
          notifyError('Error al actualizar el pedido')
        } else {
          setOrders((prev) => {
            if (!Array.isArray(prev)) return prev
            const next = prev.map((order) =>
              order?.id === orderId ? { ...order, status: newStatus, displayStatus: newStatus } : order
            )
            calculateStats(next)
            return next
          })
          setTimeout(() => fetchOrders(true), 1500)
        }
      } catch (err) {
        console.error('Error:', err)
        notifyError('Error al actualizar el pedido')
      }
    }
  }, [calculateStats, confirmAction, db, fetchOrders, isAdmin, notifyError, setOrders])

  const handleArchiveAllPending = useCallback(async () => {
    const pendingOrders = (Array.isArray(orders) ? orders : []).filter(order => order.status === 'pending')

    if (pendingOrders.length === 0) {
      notifyInfo('No hay pedidos pendientes para archivar')
      return
    }

    const confirmed = await confirmAction({
      title: 'Archivar pedidos pendientes',
      message: `Se archivarán ${pendingOrders.length} pedidos pendientes.`,
      confirmText: 'Archivar todos'
    })
    if (confirmed) {
      try {
        const reason = isAdmin && typeof window !== 'undefined'
          ? String(window.prompt('Motivo obligatorio para archivar pedidos administrativamente:') || '').trim()
          : ''
        if (isAdmin && !reason) {
          notifyError('Indicá el motivo para continuar.')
          return
        }
        const promises = pendingOrders.map(order =>
          db.updateOrderStatus(order.id, 'archived', {
            adminAudit: isAdmin,
            reason
          })
        )

        const results = await Promise.all(promises)
        const errors = results.filter(r => r.error)

        if (errors.length > 0) {
          notifyWarning(`Se actualizaron ${pendingOrders.length - errors.length} pedidos. ${errors.length} fallaron.`)
        } else {
          notifySuccess(`✓ ${pendingOrders.length} pedidos archivados`)
        }

        setOrders((prev) => {
          if (!Array.isArray(prev)) return prev
          const next = prev.map((order) =>
            order?.status === 'pending' ? { ...order, status: 'archived', displayStatus: 'archived' } : order
          )
          calculateStats(next)
          return next
        })
        setTimeout(() => fetchOrders(true), 1500)
      } catch (err) {
        console.error('Error:', err)
        notifyError('Error al actualizar los pedidos')
      }
    }
  }, [calculateStats, confirmAction, db, fetchOrders, isAdmin, notifyError, notifyInfo, notifySuccess, notifyWarning, orders, setOrders])

  const handleEditOrder = useCallback((order) => {
    if (!isAdmin && !isOrderEditable(order.created_at, EDIT_WINDOW_MINUTES)) {
      notifyInfo(`Solo puedes editar tu pedido dentro de los primeros ${EDIT_WINDOW_MINUTES} minutos.`)
      return
    }
    navigate('/edit-order', { state: { order } })
  }, [EDIT_WINDOW_MINUTES, isAdmin, isOrderEditable, navigate, notifyInfo])

  const handleDeleteOrder = useCallback((order) => {
    if (!isAdmin && !isOrderEditable(order.created_at, EDIT_WINDOW_MINUTES)) {
      showToast(`Solo puedes cancelar tu pedido dentro de los primeros ${EDIT_WINDOW_MINUTES} minutos.`)
      return
    }

    setDeleteConfirmOrder(order)
  }, [EDIT_WINDOW_MINUTES, isAdmin, isOrderEditable, showToast])

  const confirmDeleteOrder = useCallback(async () => {
    if (!deleteConfirmOrder) return
    setDeleteSubmitting(true)
    try {
      const editableSince = new Date(Date.now() - EDIT_WINDOW_MINUTES * 60 * 1000).toISOString()
      const adminReason = isAdmin && typeof window !== 'undefined'
        ? String(window.prompt('Motivo obligatorio para la cancelación administrativa:') || '').trim()
        : ''
      if (isAdmin && !adminReason) {
        showToast('Indicá el motivo para continuar.', 'error')
        return
      }
      const result = isAdmin
        ? await db.updateOrderStatus(deleteConfirmOrder.id, 'cancelled', {
            adminAudit: true,
            reason: adminReason
          })
        : await db.cancelOwnPendingOrder({
            orderId: deleteConfirmOrder.id,
            userId: deleteConfirmOrder.user_id,
            editableSince
          })
      const { data, error } = result
      if (error) {
        showToast(
          getUserFriendlyErrorMessage(error, 'No pudimos cancelar el pedido. Intentá nuevamente.'),
          'error'
        )
        return
      }
      if (!isAdmin && (data == null || (Array.isArray(data) && data.length === 0))) {
        showToast(`No se pudo cancelar el pedido. Verificá que siga pendiente y dentro de los primeros ${EDIT_WINDOW_MINUTES} minutos.`, 'error')
        return
      }
      showToast('Pedido cancelado exitosamente')
      if (!isAdmin) {
        setOrders((prev) => {
          if (!Array.isArray(prev)) return prev
          const next = prev.filter((order) => order?.id !== deleteConfirmOrder.id)
          calculateStats(next)
          return next
        })
      }
      fetchOrders()
      setDeleteConfirmOrder(null)
    } catch (err) {
      console.error('Error:', err)
      showToast(
        getUserFriendlyErrorMessage(err, 'No pudimos cancelar el pedido. Intentá nuevamente.'),
        'error'
      )
    } finally {
      setDeleteSubmitting(false)
    }
  }, [EDIT_WINDOW_MINUTES, calculateStats, db, deleteConfirmOrder, fetchOrders, isAdmin, setOrders, showToast])

  const closeDeleteConfirm = useCallback(() => {
    if (deleteSubmitting) return
    setDeleteConfirmOrder(null)
  }, [deleteSubmitting])

  const handleViewOrder = useCallback((orderId) => {
    if (!orderId) return
    navigate(`/orders/${orderId}`)
  }, [navigate])

  return {
    deleteConfirmOrder,
    deleteSubmitting,
    handleMarkAsArchived,
    handleStatusChange,
    handleArchiveAllPending,
    handleEditOrder,
    handleDeleteOrder,
    confirmDeleteOrder,
    closeDeleteConfirm,
    handleViewOrder
  }
}

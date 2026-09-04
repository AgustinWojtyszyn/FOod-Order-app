import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '../supabaseClient'
import { useAuthContext } from '../contexts/authContextValue'
import { Sound } from '../utils/Sound'
import { calculateStats, getOperationalOrderUnits } from '../utils/daily/dailyOrderCalculations'
import { notifyError, notifyInfo, notifySuccess } from '../utils/notice'
import { confirmAction } from '../utils/confirm'
import { getTomorrowISOInTimeZone } from '../utils/dateUtils'
import { getUserFriendlyErrorMessage } from '../utils'
import { isAdminExtraOrder, resolveAdminExtraCreator } from '../utils/daily/adminExtraOrders'

export const useDailyOrdersData = (user) => {
  const {
    isAdmin: isGlobalAdmin,
    isCompanyAdmin,
    canCreateLateAdminExtraOrder,
    canManageLateExtraHistory,
    adminCompanies
  } = useAuthContext()
  const [orders, setOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [availableDishes, setAvailableDishes] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [ordersError, setOrdersError] = useState('')
  const [reportRun, setReportRun] = useState(null)
  const [reportRunError, setReportRunError] = useState('')
  const [lastUpdatedAt, setLastUpdatedAt] = useState('')
  const [operationalDate, setOperationalDate] = useState(() => getTomorrowISOInTimeZone())
  const [cancellingExtraOrders, setCancellingExtraOrders] = useState(false)
  const [stats, setStats] = useState({
    total: 0,
    byLocation: {},
    byDish: {},
    totalItems: 0,
    archived: 0,
    pending: 0,
    postReportExtra: 0
  })
  const isFetchingRef = useRef(false)
  const hasAdminAccess = isGlobalAdmin || isCompanyAdmin

  const fetchDailyReportRunStatus = useCallback(async (reportDate) => {
    if (!reportDate) return

    try {
      setReportRunError('')
      const { data, error } = await db.getDailyReportRunStatus({ reportDate })
      if (error) {
        console.error('Error fetching daily report run status:', error)
        setReportRun(null)
        setReportRunError('No se pudo consultar el estado del reporte automático.')
        return
      }
      setReportRun(data || null)
    } catch (err) {
      console.error('Error fetching daily report run status:', err)
      setReportRun(null)
      setReportRunError('No se pudo consultar el estado del reporte automático.')
    }
  }, [])

  const fetchDailyOrders = useCallback(async (silent = false, deliveryDate = operationalDate) => {
    if (!user?.id) return
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    try {
      if (!silent) {
        setOrdersLoading(true)
      }

      const nextOperationalDate = deliveryDate || getTomorrowISOInTimeZone()

      const { data: ordersData, error } = await db.getDailyOrdersForAdmin({
        deliveryDate: nextOperationalDate,
        statuses: ['pending', 'archived', 'post_report_extra']
      })

      if (error) {
        console.error('Error fetching orders:', error)
        if (!silent) {
          setOrders([])
          setAvailableDishes([])
          setStats(calculateStats([]))
        }
        setOrdersError('No se pudieron cargar los pedidos diarios. Usá Actualizar para reintentar.')
      } else {
        setOrdersError('')
        let peopleData = []
        try {
          const peopleResult = await db.getAdminPeopleUnified()
          peopleData = peopleResult?.data || []
        } catch (peopleError) {
          if (import.meta.env.DEV) {
            console.warn('[daily-orders] No se pudo enriquecer personas:', peopleError)
          }
        }
        const personById = new Map()
        ;(Array.isArray(peopleData) ? peopleData : []).forEach((person) => {
          ;[person?.person_id, person?.id, person?.primary_user_id, ...(Array.isArray(person?.user_ids) ? person.user_ids : [])]
            .filter(Boolean)
            .forEach((id) => personById.set(String(id), person))
        })

        const dishesSet = new Set()

        const todayOrders = Array.isArray(ordersData) ? ordersData.map(order => {
          if (!order) return false
          const personId = order.person_key || (order.user_id ? String(order.user_id) : null)
          const person = personId ? personById.get(personId) : null
          const emails = Array.isArray(person?.emails) ? person.emails.filter(Boolean) : []
          const orderEmail = order.customer_email || order.user_email || ''
          const orderName = order.customer_name || order.user_name || order.user_full_name || order.full_name || ''
          const isExtra = isAdminExtraOrder(order)
          const adminCreator = isExtra ? resolveAdminExtraCreator(order, { peopleById: personById }) : null
          let userName = isExtra ? adminCreator.label : orderName || (orderEmail ? orderEmail.split('@')[0] : '') || 'Usuario'
          if (!isExtra && person) {
            userName = (person.display_name !== undefined ? person.display_name : null)
              || (emails[0] ? emails[0].split('@')[0] : null)
              || orderName
              || 'Usuario'
          }

          if (Array.isArray(order.items)) {
            order.items.forEach(item => {
              if (item && typeof item === 'object' && item.name !== undefined) {
                dishesSet.add(item.name)
              }
            })
          }
          return {
            ...order,
            ...(isExtra
              ? {
                  admin_extra_creator_name: adminCreator.hasTraceability ? adminCreator.name : '',
                  admin_extra_creator_email: adminCreator.email
                }
              : {}),
            user_name: userName,
            user_email: isExtra ? adminCreator.email : orderEmail || emails[0] || ''
          }
        }).filter(Boolean) : []

        setOrders(todayOrders)
        setAvailableDishes(Array.from(dishesSet).sort())
        setStats(calculateStats(todayOrders))
        setLastUpdatedAt(new Date().toISOString())
        await fetchDailyReportRunStatus(nextOperationalDate)
        return todayOrders
      }
    } catch (err) {
      console.error('Error:', err)
      if (!silent) {
        setOrders([])
        setAvailableDishes([])
        setStats(calculateStats([]))
      }
      setOrdersError('No se pudieron cargar los pedidos diarios. Usá Actualizar para reintentar.')
    } finally {
      isFetchingRef.current = false
      if (!silent) {
        setOrdersLoading(false)
      }
    }
    return []
  }, [fetchDailyReportRunStatus, operationalDate, user])

  useEffect(() => {
    if (!user?.id || !hasAdminAccess) return
    if (hasAdminAccess) {
      fetchDailyOrders()

      const interval = setInterval(() => {
        fetchDailyOrders(true)
      }, 30000)

      return () => clearInterval(interval)
    }
  }, [hasAdminAccess, user, fetchDailyOrders])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    const refreshedOrders = await fetchDailyOrders(false, operationalDate)
    setRefreshing(false)
    return refreshedOrders
  }, [fetchDailyOrders, operationalDate])

  const handleDeliveryDateChange = useCallback((nextDate) => {
    if (!nextDate || nextDate === operationalDate) return
    setOperationalDate(nextDate)
  }, [operationalDate])

  const handleArchiveOrder = useCallback(async (order) => {
    if (!order?.id || order.status === 'archived') return
    const confirmArchive = await confirmAction({
      title: 'Archivar pedido',
      message: `¿Archivar el pedido de ${order.user_name || 'cliente'}?`,
      confirmText: 'Archivar'
    })
    if (!confirmArchive) return

    const { error } = await db.updateOrderStatus(order.id, 'archived')
    if (error) {
      notifyError(getUserFriendlyErrorMessage(error, 'No pudimos archivar el pedido. Intentá nuevamente.'))
      return
    }
    Sound.playSuccess()
    setOrders((prev) => {
      if (!Array.isArray(prev)) return prev
      const next = prev.map((item) =>
        item?.id === order.id ? { ...item, status: 'archived' } : item
      )
      setStats(calculateStats(next))
      return next
    })
    handleRefresh()
  }, [handleRefresh])

  const handleArchiveAllPending = useCallback(async () => {
    const pendingCount = (Array.isArray(orders) ? orders : []).reduce((sum, order) => (
      String(order?.status || '').toLowerCase() === 'pending' &&
      String(order?.delivery_date || '') === operationalDate
        ? sum + getOperationalOrderUnits(order)
        : sum
    ), 0)

    if (pendingCount === 0) {
      notifyInfo('No hay pedidos pendientes para archivar.')
      return
    }

    const confirmed = await confirmAction({
      title: 'Archivar todos los pedidos pendientes',
      message: `Se archivarán ${pendingCount} pedido${pendingCount === 1 ? '' : 's'} pendiente${pendingCount === 1 ? '' : 's'} con fecha de entrega ${operationalDate}. Esta acción no se puede deshacer.`,
      confirmText: 'Archivar todos'
    })
    if (confirmed) {
      const { data, error } = await db.archivePendingOrdersByDeliveryDate({
        deliveryDate: operationalDate,
        statuses: ['pending']
      })
      if (!error) {
        const affected = Array.isArray(data) ? data.length : 0
        if (affected === 0) {
          notifyInfo('No hay pedidos pendientes para archivar.')
        } else {
          notifySuccess(`Pedidos archivados correctamente: ${affected}`)
        }
        Sound.playSuccess()
        setOrders((prev) => {
          if (!Array.isArray(prev)) return prev
          const next = prev.map((item) =>
            item?.status === 'pending' && String(item?.delivery_date || '') === operationalDate
              ? { ...item, status: 'archived' }
              : item
          )
          setStats(calculateStats(next))
          return next
        })
        handleRefresh()
      } else {
        notifyError(getUserFriendlyErrorMessage(error, 'No pudimos archivar los pedidos. Intentá nuevamente.'))
      }
    }
  }, [handleRefresh, operationalDate, orders])

  const handleDeleteExtraOrder = useCallback(async (order) => {
    if (!order?.id || !isAdminExtraOrder(order)) return
    const confirmed = await confirmAction({
      title: 'Cancelar pedido extra',
      message: 'Se cancelará este pedido extra solicitado por admin. Esta acción queda auditada con snapshot completo.',
      confirmText: 'Continuar'
    })
    if (!confirmed) return

    const reason = typeof window !== 'undefined'
      ? window.prompt('Motivo obligatorio para cancelar el pedido extra:')
      : ''
    const normalizedReason = String(reason || '').trim()
    if (!normalizedReason) {
      notifyError('Indicá el motivo para cancelar el pedido extra.')
      return
    }

    const { error } = await db.deleteAdminExtraOrder({
      orderId: order.id,
      reason: normalizedReason
    })
    if (error) {
      notifyError(getUserFriendlyErrorMessage(error, 'No pudimos cancelar el pedido extra. Intentá nuevamente.'))
      return
    }

    notifySuccess('Pedido extra cancelado correctamente.')
    Sound.playSuccess()
    setOrders((prev) => {
      if (!Array.isArray(prev)) return prev
      const next = prev.filter((item) => item?.id !== order.id)
      setStats(calculateStats(next))
      return next
    })
    handleRefresh()
  }, [handleRefresh])

  const handleCancelExtraOrders = useCallback(async ({
    orders: selectedOrders = [],
    scope = 'single',
    companyLabel = ''
  } = {}) => {
    if (cancellingExtraOrders) return

    const extraOrders = (Array.isArray(selectedOrders) ? selectedOrders : [])
      .filter((order) =>
        order?.id &&
        isAdminExtraOrder(order) &&
        String(order.delivery_date || '') === String(operationalDate || '')
      )

    if (extraOrders.length === 0) {
      notifyInfo('No hay pedidos extra seleccionados para cancelar.')
      return
    }

    const uniqueOrders = Array.from(
      new Map(extraOrders.map((order) => [String(order.id), order])).values()
    )
    const count = uniqueOrders.length
    const title = scope === 'single' ? 'Cancelar pedido extra' : 'Cancelar pedidos extra'
    const message = scope === 'company'
      ? `Cancelar ${count} pedido${count === 1 ? '' : 's'} extra de ${companyLabel || 'esta empresa'} para ${operationalDate}.`
      : scope === 'all'
        ? `Cancelar los ${count} pedido${count === 1 ? '' : 's'} extra de este día (${operationalDate}).`
        : `Cancelar este pedido extra para ${operationalDate}.`

    const confirmed = await confirmAction({
      title,
      message,
      confirmText: 'Cancelar extras'
    })
    if (!confirmed) return

    setCancellingExtraOrders(true)
    try {
      const failures = []
      for (const order of uniqueOrders) {
        const { error } = await db.deleteAdminExtraOrder({
          orderId: order.id,
          reason: 'Cancelación administrativa de pedido extra'
        })
        if (error) failures.push({ order, error })
      }

      if (failures.length > 0) {
        notifyError(`No pudimos cancelar ${failures.length} pedido${failures.length === 1 ? '' : 's'} extra. Actualizá y revisá el listado.`)
      }

      const successCount = count - failures.length
      if (successCount > 0) {
        notifySuccess(`Pedidos extra cancelados correctamente: ${successCount}`)
        Sound.playSuccess()
        setOrders((prev) => {
          if (!Array.isArray(prev)) return prev
          const cancelledIds = new Set(uniqueOrders.filter((order) =>
            !failures.some((failure) => String(failure.order.id) === String(order.id))
          ).map((order) => String(order.id)))
          const next = prev.filter((item) => !cancelledIds.has(String(item?.id)))
          setStats(calculateStats(next))
          return next
        })
      }
      handleRefresh()
    } finally {
      setCancellingExtraOrders(false)
    }
  }, [cancellingExtraOrders, handleRefresh, operationalDate])

  return {
    orders,
    ordersLoading,
    isAdmin: hasAdminAccess,
    isGlobalAdmin,
    isCompanyAdmin,
    canCreateLateAdminExtraOrder,
    canManageLateExtraHistory,
    adminCompanies,
    availableDishes,
    refreshing,
    ordersError,
    reportRun,
    reportRunError,
    lastUpdatedAt,
    operationalDate,
    stats,
    cancellingExtraOrders,
    handleRefresh,
    handleDeliveryDateChange,
    handleArchiveOrder,
    handleArchiveAllPending,
    handleDeleteExtraOrder,
    handleCancelExtraOrders
  }
}

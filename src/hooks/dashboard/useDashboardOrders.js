import { useCallback, useEffect, useRef, useState } from 'react'

const isVisibleDashboardOrder = (order = {}) =>
  String(order?.displayStatus || order?.status || '').toLowerCase() !== 'cancelled'

export const useDashboardOrders = ({ user, db, usersService } = {}) => {
  const [orders, setOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    archived: 0
  })
  const isFetchingRef = useRef(false)

  const calculateStats = useCallback((ordersData) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const todayOrders = (Array.isArray(ordersData) ? ordersData : []).filter(order => {
      if (!isVisibleDashboardOrder(order)) return false
      const orderDate = new Date(order.created_at)
      orderDate.setHours(0, 0, 0, 0)
      return orderDate.getTime() === today.getTime()
    })

    const total = todayOrders.length
    const pending = todayOrders.filter(order => (order.displayStatus || order.status) === 'pending').length
    const archived = todayOrders.filter(order => (order.displayStatus || order.status) === 'archived').length

    setStats({ total, pending, archived })
  }, [])

  const fetchOrders = useCallback(async (silent = false) => {
    if (!user?.id) return
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    try {
      if (!silent) {
        setOrdersLoading(true)
      }

      // TODOS (admins y usuarios) solo ven sus propios pedidos en el Dashboard
      const { data, error } = await db.getOrdersWithPersonKey({ userId: user.id })

      if (error) {
        console.error('Error fetching orders:', error)
      } else {
        // Resolver nombre/email por persona unificada (grupo o usuario suelto)
        const { data: peopleData } = await db.getAdminPeopleUnified()
        const personById = new Map(
          (Array.isArray(peopleData) ? peopleData : []).map(person => [person.person_id, person])
        )

        const ordersWithUserNames = (data || []).filter(isVisibleDashboardOrder).map(order => {
          const displayStatus = order.status
          const personId = order.person_key || (order.user_id ? String(order.user_id) : null)
          const person = personId ? personById.get(personId) : null
          const emails = Array.isArray(person?.emails) ? person.emails.filter(Boolean) : []
          let userName = 'Usuario'
          if (person) {
            userName = person.display_name ||
              emails[0]?.split('@')[0] ||
              order.customer_name ||
              'Usuario'
          } else if (order.customer_name) {
            userName = order.customer_name
          }

          return {
            ...order,
            displayStatus,
            user_name: userName,
            user_email: order.customer_email || emails[0] || ''
          }
        })

        setOrders(ordersWithUserNames)
        calculateStats(ordersWithUserNames)
      }
    } catch (err) {
      console.error('Error:', err)
    } finally {
      isFetchingRef.current = false
      if (!silent) {
        setOrdersLoading(false)
      }
    }
  }, [calculateStats, db, user?.id])

  const checkIfAdmin = useCallback(async () => {
    if (!user?.id) return
    try {
      const { data, error } = await usersService.getUserById(user.id)
      if (!error && data) {
        setIsAdmin(data?.role === 'admin')
      }
    } catch (err) {
      console.error('Error checking admin status:', err)
    }
  }, [user?.id, usersService])

  useEffect(() => {
    if (!user?.id) return
    checkIfAdmin()
  }, [checkIfAdmin, user?.id])

  useEffect(() => {
    if (!user?.id || isAdmin === null) return
    if (isAdmin !== null) {
      fetchOrders()

      // Auto-refresh cada 30 segundos
      const interval = setInterval(() => {
        fetchOrders(true) // true = silent refresh
      }, 30000)

      return () => clearInterval(interval)
    }
  }, [fetchOrders, isAdmin, user?.id])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchOrders()
    setRefreshing(false)
  }, [fetchOrders])

  return {
    orders,
    setOrders,
    ordersLoading,
    isAdmin,
    refreshing,
    stats,
    fetchOrders,
    calculateStats,
    handleRefresh
  }
}

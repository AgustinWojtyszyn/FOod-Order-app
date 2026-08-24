import { useCallback, useEffect, useMemo, useState } from 'react'
import { db } from '../../supabaseClient'
import { getTodayISOInTimeZone } from '../../utils/dateUtils'
import {
  getOrderCustomerEmail,
  getOrderCustomerName,
  getCompanyLocationsForAccess,
  getCompanyOptionsForLabels,
  orderMatchesLabelFilters
} from '../../utils/labels/labelOrderUtils'

const PAGE_SIZE = 50

const createInitialFilters = () => ({
  search: '',
  email: '',
  company: 'all',
  deliveryDate: getTodayISOInTimeZone(),
  fromDate: '',
  toDate: '',
  location: '',
  service: 'all',
  status: 'active',
  itemText: '',
  beverage: 'all',
  hasNotes: 'all'
})

const getStatusesForLabels = (statusFilter) => {
  if (statusFilter === 'active') return ['pending', 'archived', 'post_report_extra']
  if (statusFilter === 'all') return ['pending', 'archived', 'post_report_extra', 'cancelled']
  return [statusFilter]
}

const isLabelPrinted = (order = {}) => Boolean(order?.label_printed_at)

export const useOrderLabels = ({ isAdmin = false, isCompanyAdmin = false, adminCompanies = [] } = {}) => {
  const [filters, setFilters] = useState(createInitialFilters)
  const [page, setPage] = useState(0)
  const [orders, setOrders] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [selectedOrderById, setSelectedOrderById] = useState({})
  const [copiesByOrderId, setCopiesByOrderId] = useState({})
  const [previewMode, setPreviewMode] = useState(false)
  const [printWarning, setPrintWarning] = useState('')
  const [printState, setPrintState] = useState('pending')

  const companyOptions = useMemo(
    () => getCompanyOptionsForLabels({ isAdmin, adminCompanies }),
    [adminCompanies, isAdmin]
  )

  const accessLocations = useMemo(() => {
    if (isAdmin) return []
    return getCompanyLocationsForAccess(adminCompanies)
  }, [adminCompanies, isAdmin])

  const selectedCompanyLocations = useMemo(() => {
    if (filters.company === 'all') return []
    const company = companyOptions.find(option => option.slug === filters.company)
    return company?.locations || []
  }, [companyOptions, filters.company])

  const customerOptions = useMemo(() => {
    const optionsByKey = new Map()
    orders.forEach((order) => {
      const name = getOrderCustomerName(order)
      const email = getOrderCustomerEmail(order)
      const value = [name, email].filter(Boolean).join(' · ')
      const key = value.toLowerCase()
      if (value && !optionsByKey.has(key)) {
        optionsByKey.set(key, { value, name, email })
      }
    })
    return [...optionsByKey.values()].sort((a, b) => a.value.localeCompare(b.value))
  }, [orders])

  const effectiveLocations = useMemo(() => {
    if (isAdmin) return selectedCompanyLocations
    if (selectedCompanyLocations.length > 0) {
      const allowed = new Set(accessLocations)
      return selectedCompanyLocations.filter(location => allowed.has(location))
    }
    return accessLocations
  }, [accessLocations, isAdmin, selectedCompanyLocations])

  const updateFilter = useCallback((name, value) => {
    setFilters(prev => ({ ...prev, [name]: value }))
    setPage(0)
    setPreviewMode(false)
    setPrintWarning('')
  }, [])

  const clearFilters = useCallback(() => {
    setFilters(createInitialFilters())
    setPage(0)
    setPreviewMode(false)
    setPrintWarning('')
    setPrintState('pending')
  }, [])

  const fetchOrders = useCallback(async () => {
    if (!isAdmin && !isCompanyAdmin) return
    if (!isAdmin && effectiveLocations.length === 0) {
      setOrders([])
      setTotalCount(0)
      setError('No tenés empresas asignadas para consultar etiquetas.')
      return
    }

    setLoading(true)
    setError('')
    try {
      const { data, error: queryError, count } = await db.getOrdersForLabels({
        deliveryDate: filters.deliveryDate || null,
        fromDate: filters.deliveryDate ? null : (filters.fromDate || null),
        toDate: filters.deliveryDate ? null : (filters.toDate || null),
        statuses: getStatusesForLabels(filters.status),
        service: filters.service === 'all' ? null : filters.service,
        locations: effectiveLocations,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE
      })

      if (queryError) {
        setOrders([])
        setTotalCount(0)
        setError('No se pudieron cargar los pedidos para etiquetas. Revisá los filtros e intentá nuevamente.')
        return
      }

      setOrders(Array.isArray(data) ? data : [])
      setTotalCount(Number(count || 0))
    } catch (_err) {
      setOrders([])
      setTotalCount(0)
      setError('Ocurrió un error consultando los pedidos para etiquetas.')
    } finally {
      setLoading(false)
    }
  }, [effectiveLocations, filters.deliveryDate, filters.fromDate, filters.service, filters.status, filters.toDate, isAdmin, isCompanyAdmin, page])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  const filteredOrders = useMemo(
    () => orders.filter(order => orderMatchesLabelFilters(order, filters)),
    [filters, orders]
  )

  const printStateCounts = useMemo(() => {
    const pending = filteredOrders.filter(order => !isLabelPrinted(order)).length
    const printed = filteredOrders.filter(isLabelPrinted).length
    return {
      pending,
      printed,
      all: filteredOrders.length
    }
  }, [filteredOrders])

  const visibleOrders = useMemo(
    () => filteredOrders.filter((order) => {
      if (printState === 'printed') return isLabelPrinted(order)
      if (printState === 'all') return true
      return !isLabelPrinted(order)
    }),
    [filteredOrders, printState]
  )

  const selectedOrders = useMemo(
    () => selectedIds.map(id => selectedOrderById[id]).filter(Boolean),
    [selectedIds, selectedOrderById]
  )

  const selectedCount = selectedIds.length
  const visibleSelectedCount = visibleOrders.filter(order => selectedIds.includes(order.id)).length
  const allVisibleSelected = visibleOrders.length > 0 && visibleSelectedCount === visibleOrders.length
  const maxPage = Math.max(Math.ceil(totalCount / PAGE_SIZE) - 1, 0)

  const toggleOrder = useCallback((order) => {
    const orderId = order?.id
    if (!orderId) return
    setSelectedOrderById(prev => ({ ...prev, [orderId]: order }))
    setSelectedIds(prev => prev.includes(orderId)
      ? prev.filter(id => id !== orderId)
      : [...prev, orderId]
    )
    setPrintWarning('')
  }, [])

  const selectVisible = useCallback(() => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      visibleOrders.forEach(order => next.add(order.id))
      return [...next]
    })
    setSelectedOrderById(prev => {
      const next = { ...prev }
      visibleOrders.forEach(order => {
        next[order.id] = order
      })
      return next
    })
    setPrintWarning('')
  }, [visibleOrders])

  const unselectVisible = useCallback(() => {
    const visibleIds = new Set(visibleOrders.map(order => order.id))
    setSelectedIds(prev => prev.filter(id => !visibleIds.has(id)))
  }, [visibleOrders])

  const removeSelected = useCallback((orderId) => {
    setSelectedIds(prev => prev.filter(id => id !== orderId))
  }, [])

  const setCopiesForOrder = useCallback((orderId, copies) => {
    const safeCopies = Math.min(Math.max(Number(copies) || 1, 1), 99)
    setCopiesByOrderId(prev => ({ ...prev, [orderId]: safeCopies }))
  }, [])

  const setCopiesFromRations = useCallback((order) => {
    const rationCount = Math.min(Math.max(Number(order?.total_items || 1) || 1, 1), 99)
    setCopiesForOrder(order.id, rationCount)
  }, [setCopiesForOrder])

  const enterPreview = useCallback((order = null) => {
    if (order?.id) {
      setSelectedOrderById(prev => ({ ...prev, [order.id]: order }))
      setSelectedIds([order.id])
      setCopiesByOrderId(prev => ({ ...prev, [order.id]: prev[order.id] || 1 }))
      setPreviewMode(true)
      setPrintWarning('')
      return
    }

    if (selectedIds.length === 0) {
      setPrintWarning('Seleccioná al menos un pedido para imprimir etiquetas.')
      return
    }
    setPreviewMode(true)
    setPrintWarning('')
  }, [selectedIds.length])

  const cancelPreview = useCallback(() => setPreviewMode(false), [])

  const updatePrintState = useCallback((nextState) => {
    setPrintState(['pending', 'printed', 'all'].includes(nextState) ? nextState : 'pending')
    setPage(0)
    setPrintWarning('')
  }, [])

  const markPrinted = useCallback(async (orderIds = []) => {
    const safeOrderIds = [...new Set((Array.isArray(orderIds) ? orderIds : [])
      .map(id => String(id || '').trim())
      .filter(Boolean))]
    if (safeOrderIds.length === 0) return { data: [], error: null }

    const { data, error } = await db.markOrderLabelsPrinted({ orderIds: safeOrderIds })
    if (error) {
      setPrintWarning('La impresión se inició, pero no pudimos guardar el estado impreso. Recargá e intentá nuevamente.')
      return { data, error }
    }

    const printedById = new Map((Array.isArray(data) ? data : []).map(row => [row.id, row]))
    const applyPrintedState = (order) => {
      const printed = printedById.get(order?.id)
      if (!printed) return order
      return {
        ...order,
        label_printed_at: printed.label_printed_at,
        label_printed_by: printed.label_printed_by,
        label_print_count: printed.label_print_count
      }
    }

    setOrders(prev => prev.map(applyPrintedState))
    setSelectedOrderById(prev => {
      const next = { ...prev }
      Object.keys(next).forEach((id) => {
        next[id] = applyPrintedState(next[id])
      })
      return next
    })
    setSelectedIds(prev => prev.filter(id => !safeOrderIds.includes(id)))
    setPrintState('printed')
    setPrintWarning('')
    return { data, error: null }
  }, [])

  return {
    filters,
    updateFilter,
    clearFilters,
    loading,
    error,
    page,
    setPage,
    maxPage,
    pageSize: PAGE_SIZE,
    totalCount,
    orders,
    visibleOrders,
    filteredOrders,
    printState,
    printStateCounts,
    updatePrintState,
    selectedIds,
    selectedOrders,
    selectedCount,
    allVisibleSelected,
    toggleOrder,
    selectVisible,
    unselectVisible,
    removeSelected,
    copiesByOrderId,
    setCopiesForOrder,
    setCopiesFromRations,
    previewMode,
    enterPreview,
    cancelPreview,
    markPrinted,
    setPrintWarning,
    printWarning,
    companyOptions,
    customerOptions,
    accessLocations
  }
}

import { useMemo } from 'react'
import { getCustomSideFromResponses } from '../utils/daily/dailyOrderCalculations'

export const matchesDailyOrderStatusFilter = (order, selectedStatus) => {
  if (!order) return false
  if (selectedStatus === 'all') return true
  if (selectedStatus === 'archived') return order.status === 'archived'
  if (selectedStatus === 'pending') return order.status === 'pending'
  if (selectedStatus === 'post_report_extra') return order.status === 'post_report_extra'
  return false
}

export const useDailyOrdersFilters = ({
  orders,
  selectedLocation,
  selectedStatus,
  selectedDish,
  selectedSide,
  sortBy
}) => {
  const allOrders = useMemo(
    () => (Array.isArray(orders) ? orders : []),
    [orders]
  )

  const availableSides = useMemo(() => {
    const sides = allOrders.map(order => {
      if (order && Array.isArray(order.custom_responses)) {
        return getCustomSideFromResponses(order.custom_responses)
      }
      return null
    }).filter(Boolean)
    return [...new Set(sides)]
  }, [allOrders])

  const sortedOrders = useMemo(() => {
    const filteredOrders = selectedLocation === 'all'
      ? allOrders
      : allOrders.filter(order => order && order.location === selectedLocation)

    const statusFilteredOrders = Array.isArray(filteredOrders)
      ? filteredOrders.filter(order => matchesDailyOrderStatusFilter(order, selectedStatus))
      : []

    let dishFilteredOrders = selectedDish === 'all'
      ? Array.isArray(statusFilteredOrders) ? statusFilteredOrders : []
      : Array.isArray(statusFilteredOrders) ? statusFilteredOrders.filter(order => {
        if (!order || !Array.isArray(order.items)) return false
        return order.items.some(item => item && typeof item === 'object' && item.name !== undefined && item.name === selectedDish)
      }) : []

    if (selectedSide !== 'all') {
      dishFilteredOrders = Array.isArray(dishFilteredOrders) ? dishFilteredOrders.filter(order => {
        const customResponses = Array.isArray(order?.custom_responses) ? order.custom_responses : []
        const customSide = getCustomSideFromResponses(customResponses)
        return customSide === selectedSide
      }) : []
    }

    return [...dishFilteredOrders].sort((a, b) => {
      const dateA = new Date(a.created_at)
      const dateB = new Date(b.created_at)
      switch (sortBy) {
        case 'location': {
          const loc = (a.location || '').localeCompare(b.location || '')
          if (loc !== 0) return loc
          return dateA - dateB
        }
        case 'hour':
          return dateA - dateB
        case 'status':
          return (a.status || '').localeCompare(b.status || '')
        case 'recent':
        default:
          return dateB - dateA
      }
    })
  }, [
    allOrders,
    selectedLocation,
    selectedStatus,
    selectedDish,
    selectedSide,
    sortBy
  ])

  return {
    allOrders,
    sortedOrders,
    availableSides
  }
}

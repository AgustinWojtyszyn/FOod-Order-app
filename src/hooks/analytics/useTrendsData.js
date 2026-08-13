import { useEffect, useMemo, useRef, useState } from 'react'
import { filterOrdersByCompany } from '../../utils/daily/dailyOrderCalculations'
import {
  buildComparisonMetrics,
  buildTrendsSnapshot,
  COMPARISON_MODES,
  fetchOrdersByRange
} from '../../utils/analytics/trendsHelpers'

export const useTrendsData = ({ company, dateRange, comparisonMode = COMPARISON_MODES.NONE, comparisonRange = null }) => {
  const [orders, setOrders] = useState([])
  const [comparisonOrders, setComparisonOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const fetchId = useRef(0)
  const hasComparison = comparisonMode !== COMPARISON_MODES.NONE && comparisonRange?.start && comparisonRange?.end

  useEffect(() => {
    let mounted = true
    const loadOrders = async () => {
      const currentId = ++fetchId.current
      try {
        setLoading(true)
        setError(null)
        const data = await fetchOrdersByRange({
          start: dateRange?.start || '',
          end: dateRange?.end || ''
        })
        const comparisonData = hasComparison
          ? await fetchOrdersByRange({
              start: comparisonRange.start,
              end: comparisonRange.end
            })
          : []
        if (!mounted || currentId !== fetchId.current) return
        setOrders(data || [])
        setComparisonOrders(comparisonData || [])
      } catch (err) {
        if (!mounted || currentId !== fetchId.current) return
        setError(err)
        setComparisonOrders([])
      } finally {
        if (mounted && currentId === fetchId.current) {
          setLoading(false)
        }
      }
    }

    loadOrders()
    return () => {
      mounted = false
    }
  }, [comparisonRange?.end, comparisonRange?.start, dateRange?.end, dateRange?.start, hasComparison])

  const filteredOrders = useMemo(() => {
    let list = orders || []
    if (company && company !== 'all') {
      list = filterOrdersByCompany(list, company)
    }
    return list
  }, [orders, company])

  const filteredComparisonOrders = useMemo(() => {
    let list = comparisonOrders || []
    if (company && company !== 'all') {
      list = filterOrdersByCompany(list, company)
    }
    return list
  }, [comparisonOrders, company])

  const snapshot = useMemo(() => buildTrendsSnapshot(filteredOrders), [filteredOrders])
  const comparisonSnapshot = useMemo(
    () => (hasComparison ? buildTrendsSnapshot(filteredComparisonOrders) : null),
    [filteredComparisonOrders, hasComparison]
  )
  const comparison = useMemo(
    () => buildComparisonMetrics(snapshot, comparisonSnapshot),
    [comparisonSnapshot, snapshot]
  )

  return {
    loading,
    error,
    totalOrders: snapshot.totalOrders,
    menuRanking: snapshot.menuRanking,
    optionRanking: snapshot.optionRanking,
    mainMenuRanking: snapshot.mainMenuRanking,
    bifeRanking: snapshot.bifeRanking,
    sidesRanking: snapshot.sidesRanking,
    beveragesRanking: snapshot.beveragesRanking,
    topMenu: snapshot.topMenu,
    topBife: snapshot.topBife,
    topSide: snapshot.topSide,
    topBeverage: snapshot.topBeverage,
    comparison,
    comparisonSnapshot,
    comparisonOrdersCount: filteredComparisonOrders.length
  }
}

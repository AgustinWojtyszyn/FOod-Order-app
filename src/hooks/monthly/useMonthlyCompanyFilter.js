import { useMemo, useState, useCallback } from 'react'
import { buildDailyBreakdownFromOrdersByDay } from '../../utils/monthly/monthlyOrderCalculations'

export const useMonthlyCompanyFilter = ({
  metrics,
  ordersByDay,
  dailyData
} = {}) => {
  const ALL_EMPRESAS = '__ALL__'
  const [draftEmpresas, setDraftEmpresas] = useState([ALL_EMPRESAS])
  const [empresaFilter, setEmpresaFilter] = useState([ALL_EMPRESAS])

  const normalizeEmpresas = useCallback((list) => {
    const unique = Array.from(new Set((list || []).filter(Boolean)))
    if (unique.length === 0) return [ALL_EMPRESAS]
    if (unique.includes(ALL_EMPRESAS)) return [ALL_EMPRESAS]
    return unique
  }, [])

  const handleToggleDraftEmpresa = useCallback((empresa) => {
    setDraftEmpresas(prev => {
      const exists = prev.includes(empresa)
      let next = exists ? prev.filter(e => e !== empresa) : [...prev, empresa]
      if (empresa === ALL_EMPRESAS) {
        next = [ALL_EMPRESAS]
      } else {
        next = next.filter(e => e !== ALL_EMPRESAS)
      }
      return normalizeEmpresas(next)
    })
  }, [normalizeEmpresas])

  const handleApplyEmpresas = useCallback(() => {
    setEmpresaFilter(normalizeEmpresas(draftEmpresas))
  }, [draftEmpresas, normalizeEmpresas])

  const handleClearEmpresas = useCallback(() => {
    setDraftEmpresas([ALL_EMPRESAS])
    setEmpresaFilter([ALL_EMPRESAS])
  }, [])

  const isEmpresaAll = empresaFilter.includes(ALL_EMPRESAS)
  const empresaFilterSet = useMemo(() => new Set(empresaFilter), [empresaFilter])

  const ordersByDayForView = useMemo(() => {
    if (isEmpresaAll) return ordersByDay || {}
    const filtered = {}
    Object.entries(ordersByDay || {}).forEach(([date, dayOrders]) => {
      const match = (dayOrders || []).filter(order => empresaFilterSet.has(order.location || 'Sin ubicación'))
      if (match.length) filtered[date] = match
    })
    return filtered
  }, [ordersByDay, isEmpresaAll, empresaFilterSet])

  const dailyDataForView = useMemo(() => {
    if (!dailyData?.daily_breakdown) return dailyData
    if (isEmpresaAll) return dailyData
    const dates = dailyData.daily_breakdown.map(d => d.date)
    const recalculated = buildDailyBreakdownFromOrdersByDay(dates, ordersByDayForView)
    return { ...dailyData, ...recalculated }
  }, [dailyData, ordersByDayForView, isEmpresaAll])

  const empresasAll = useMemo(() => metrics?.empresas || [], [metrics?.empresas])
  const empresasOptions = useMemo(() => {
    const names = empresasAll.map(e => e.empresa || 'Sin ubicación')
    const unique = Array.from(new Set(names))
    return unique.sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
  }, [empresasAll])

  const isEmpresasDirty =
    JSON.stringify(normalizeEmpresas(draftEmpresas)) !== JSON.stringify(normalizeEmpresas(empresaFilter))

  const empresasForView = isEmpresaAll
    ? empresasAll
    : empresasAll.filter(e => empresaFilterSet.has(e.empresa))

  const totalsForView = empresasForView.reduce((acc, e) => {
    acc.pedidos += e.cantidadPedidos || 0
    acc.cenasPedidos += e.cantidadCenas || 0
    acc.menusPrincipales += e.totalMenusPrincipales ?? (e.totalMenus - e.totalOpciones)
    acc.opciones += e.totalOpciones || 0
    acc.menusTotal += e.totalMenusTotal ?? e.totalMenus
    acc.guarniciones += e.totalGuarniciones || 0
    acc.bebidas += e.totalBebidas || 0
    acc.postres += e.totalPostres || 0
    return acc
  }, {
    pedidos: 0,
    cenasPedidos: 0,
    menusPrincipales: 0,
    opciones: 0,
    menusTotal: 0,
    guarniciones: 0,
    bebidas: 0,
    postres: 0
  })

  return {
    ALL_EMPRESAS,
    draftEmpresas,
    empresaFilter,
    empresaFilterSet,
    isEmpresaAll,
    empresasOptions,
    isEmpresasDirty,
    handleToggleDraftEmpresa,
    handleApplyEmpresas,
    handleClearEmpresas,
    ordersByDayForView,
    dailyDataForView,
    empresasForView,
    totalsForView
  }
}

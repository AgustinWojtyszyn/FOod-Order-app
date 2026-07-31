import { useCallback, useEffect, useState } from 'react'
import { db } from '../../supabaseClient'

const normalizeDate = (value) => {
  if (!value) return null
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate())
  const parsed = new Date(`${value}T00:00:00`)
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
}

const toISODate = (date) => {
  if (!(date instanceof Date)) return ''
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const getWeekDates = (baseDate) => {
  const start = normalizeDate(baseDate) || normalizeDate(new Date())
  return Array.from({ length: 7 }, (_, index) => {
    const d = new Date(start)
    d.setDate(start.getDate() + index)
    return d
  })
}

const createDefaultDinnerMenu = (dateISO, companySlug = '') => ({
  delivery_date: dateISO,
  company: companySlug || '',
  title: 'Menú de cena',
  options: ['']
})

const useAdminDinnerMenuData = ({ active = false, defaultCompanySlug = '' } = {}) => {
  const [dinnerWeekBaseDate, setDinnerWeekBaseDate] = useState(() => {
    const now = new Date()
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    base.setDate(base.getDate() + 1)
    return base
  })
  const [dinnerSelectedDates, setDinnerSelectedDates] = useState([])
  const [dinnerLoadedDates, setDinnerLoadedDates] = useState([])
  const [dinnerMenusByDate, setDinnerMenusByDate] = useState({})
  const [dinnerDateLoading, setDinnerDateLoading] = useState({})

  const loadDinnerMenusForWeek = useCallback(async () => {
    try {
      const week = getWeekDates(dinnerWeekBaseDate)
      const startISO = toISODate(week[0])
      const endISO = toISODate(week[week.length - 1])
      const { data, error } = await db.getDinnerMenusByDateRange({ start: startISO, end: endISO })
      if (error) {
        console.error('Error loading dinner menus range', error)
        return
      }
      const rows = Array.isArray(data) ? data : []
      const byDate = {}
      rows.forEach(row => {
        if (!row?.delivery_date) return
        if (!byDate[row.delivery_date]) {
          byDate[row.delivery_date] = {
            ...row,
            options: Array.isArray(row.options) && row.options.length > 0 ? row.options : ['']
          }
        }
      })
      const dates = Object.keys(byDate).sort()
      setDinnerMenusByDate(byDate)
      setDinnerLoadedDates(dates)
    } catch (err) {
      console.error('Error loading dinner menus for week', err)
    }
  }, [dinnerWeekBaseDate])

  useEffect(() => {
    if (!active) return
    loadDinnerMenusForWeek()
  }, [active, loadDinnerMenusForWeek])

  const loadDinnerMenuForDate = useCallback(async (dateISO, company = null) => {
    setDinnerDateLoading(prev => ({ ...prev, [dateISO]: true }))
    try {
      const { data, error } = await db.getDinnerMenuByDate({ date: dateISO, company })
      if (error) {
        console.error('Error fetching dinner menu:', error)
      }
      const base = data || {
        delivery_date: dateISO,
        company: company || null,
        title: 'Menú de cena',
        options: ['']
      }
      setDinnerMenusByDate(prev => ({
        ...prev,
        [dateISO]: {
          ...base,
          options: Array.isArray(base.options) && base.options.length > 0 ? base.options : ['']
        }
      }))
    } catch (err) {
      console.error('Error fetching dinner menu', err)
    } finally {
      setDinnerDateLoading(prev => ({ ...prev, [dateISO]: false }))
    }
  }, [])

  const toggleDinnerDate = useCallback(async (dateISO) => {
    const isSelected = dinnerSelectedDates.includes(dateISO)
    setDinnerSelectedDates(prev => {
      if (isSelected) return prev.filter(d => d !== dateISO)
      return [...prev, dateISO].sort()
    })
    if (isSelected) {
      if (!dinnerLoadedDates.includes(dateISO)) {
        setDinnerMenusByDate(prev => {
          const next = { ...prev }
          delete next[dateISO]
          return next
        })
      }
      return
    }
    setDinnerMenusByDate(prev => ({
      ...prev,
        [dateISO]: prev[dateISO] || createDefaultDinnerMenu(dateISO, defaultCompanySlug)
    }))
    if (!dinnerLoadedDates.includes(dateISO)) {
      await loadDinnerMenuForDate(dateISO, defaultCompanySlug || null)
    }
  }, [dinnerSelectedDates, dinnerLoadedDates, loadDinnerMenuForDate, defaultCompanySlug])

  const updateDinnerMenuField = useCallback(async (dateISO, field, value) => {
    setDinnerMenusByDate(prev => ({
      ...prev,
      [dateISO]: {
        ...(prev[dateISO] || { delivery_date: dateISO, options: [''] }),
        [field]: value
      }
    }))
    if (field === 'company') {
      await loadDinnerMenuForDate(dateISO, value || null)
    }
  }, [loadDinnerMenuForDate])

  const updateDinnerMenuOption = useCallback((dateISO, index, value) => {
    setDinnerMenusByDate(prev => ({
      ...prev,
      [dateISO]: {
        ...(prev[dateISO] || { delivery_date: dateISO, options: [''] }),
        options: (prev[dateISO]?.options || []).map((opt, i) => i === index ? value : opt)
      }
    }))
  }, [])

  const addDinnerMenuOption = useCallback((dateISO) => {
    setDinnerMenusByDate(prev => ({
      ...prev,
      [dateISO]: {
        ...(prev[dateISO] || { delivery_date: dateISO, options: [''] }),
        options: [...(prev[dateISO]?.options || []), '']
      }
    }))
  }, [])

  const removeDinnerMenuOption = useCallback((dateISO, index) => {
    setDinnerMenusByDate(prev => ({
      ...prev,
      [dateISO]: {
        ...(prev[dateISO] || { delivery_date: dateISO, options: [''] }),
        options: (prev[dateISO]?.options || []).filter((_, i) => i !== index)
      }
    }))
  }, [])

  return {
    dinnerWeekBaseDate,
    setDinnerWeekBaseDate,
    dinnerSelectedDates,
    dinnerLoadedDates,
    dinnerMenusByDate,
    dinnerDateLoading,
    loadDinnerMenusForWeek,
    loadDinnerMenuForDate,
    toggleDinnerDate,
    updateDinnerMenuField,
    updateDinnerMenuOption,
    addDinnerMenuOption,
    removeDinnerMenuOption
  }
}

export { useAdminDinnerMenuData }

import { useCallback, useEffect, useMemo, useState } from 'react'
import { db } from '../../supabaseClient'
import { sortMenuItems } from '../../utils/admin/adminCalculations'
import { addDaysToISO, getTodayISOInTimeZone } from '../../utils/dateUtils'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const EMPTY_SELECTED_DATES = []

const normalizeISODate = (value) => {
  if (!value || typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!ISO_DATE_RE.test(trimmed)) return null
  const parsed = new Date(`${trimmed}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return null
  return trimmed
}

const isWithinRetention = (dateISO) => {
  const todayISO = getTodayISOInTimeZone()
  const minISO = addDaysToISO(todayISO, -1)
  return dateISO >= minISO
}

const getWeekDates = (baseDate) => {
  const start = baseDate instanceof Date ? baseDate : new Date()
  return Array.from({ length: 7 }, (_, index) => {
    const d = new Date(start)
    d.setDate(start.getDate() + index)
    return d
  })
}

const toISODate = (date) => {
  if (!(date instanceof Date)) return ''
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const useAdminMenuData = ({
  editingMenuByDate,
  draftMenuItemsByDate,
  setDraftItemsForDate,
  initialSelectedDates = EMPTY_SELECTED_DATES,
  userId,
  weekBaseDate,
  companySlug = 'global'
}) => {
  const normalizedCompanySlug = (companySlug || 'global').toString().trim().toLowerCase() || 'global'
  const storageKey = userId ? `admin_menu_selected_dates:${userId}:${normalizedCompanySlug}` : `admin_menu_selected_dates:${normalizedCompanySlug}`

  const readStoredSelectedDates = useCallback(() => {
    if (typeof window === 'undefined') return initialSelectedDates
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) {
          const sanitized = parsed
            .map(normalizeISODate)
            .filter(Boolean)
            .filter(isWithinRetention)
            .sort()
          if (sanitized.length > 0) return sanitized
        }
      }
    } catch (err) {
      console.error('Error reading menu selected dates', err)
    }
    const normalizedInitial = (initialSelectedDates || [])
      .map(normalizeISODate)
      .filter(Boolean)
      .filter(isWithinRetention)
      .sort()
    return normalizedInitial
  }, [initialSelectedDates, storageKey])

  const [selectedDates, setSelectedDates] = useState(() => readStoredSelectedDates())
  const [menuItemsByDate, setMenuItemsByDate] = useState({})
  const [loadingMenuByDate, setLoadingMenuByDate] = useState({})
  const [loadedDates, setLoadedDates] = useState([])
  const [dinnerMenuEnabled, setDinnerMenuEnabled] = useState(() => {
    if (typeof window === 'undefined') return false
    const stored = localStorage.getItem('dinner_menu_enabled')
    return stored === null ? true : stored === 'true'
  })

  const buildDefaultMenuItems = () => sortMenuItems([
    { name: 'Menú principal', description: '' }
  ])

  const normalizeMenuItems = (items = []) =>
    sortMenuItems(items.map(item => ({
      id: item.id,
      name: item.name,
      description: item.description || ''
    })))

  const setMenuItemsForDate = (menuDate, items) => {
    setMenuItemsByDate(prev => ({ ...prev, [menuDate]: items }))
  }

  const setLoadingForDate = (menuDate, value) => {
    setLoadingMenuByDate(prev => ({ ...prev, [menuDate]: value }))
  }

  const fetchMenuForDate = async (menuDate) => {
    setLoadingForDate(menuDate, true)
    try {
      const { data, error } = await db.getMenuItemsByDate(menuDate, normalizedCompanySlug)
      if (error) {
        console.error('Error fetching menu:', error)
        setMenuItemsForDate(menuDate, [])
        if (!editingMenuByDate[menuDate]) {
          setDraftItemsForDate(menuDate, buildDefaultMenuItems())
        }
        return
      }

      const sorted = sortMenuItems(data || [])
      setMenuItemsForDate(menuDate, sorted)

      const shouldUpdateDraft = !editingMenuByDate[menuDate] || !draftMenuItemsByDate[menuDate]
      if (shouldUpdateDraft) {
        if (sorted.length > 0) {
          setDraftItemsForDate(menuDate, normalizeMenuItems(sorted))
        } else {
          setDraftItemsForDate(menuDate, buildDefaultMenuItems())
        }
      }
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoadingForDate(menuDate, false)
    }
  }

  const persistSelectedDates = (dates) => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(storageKey, JSON.stringify(dates))
    } catch (err) {
      console.error('Error saving menu selected dates', err)
    }
  }

  const setSelectedDatesSafe = (dates) => {
    const normalized = (dates || [])
      .map(normalizeISODate)
      .filter(Boolean)
      .filter(isWithinRetention)
      .sort()
    setSelectedDates(normalized)
    persistSelectedDates(normalized)
  }

  const addSelectedDate = (menuDate) => {
    if (!menuDate) return
    setSelectedDates(prev => {
      const normalized = normalizeISODate(menuDate)
      if (!normalized) return prev
      const next = prev.includes(normalized) ? prev : [...prev, normalized]
      const sorted = next.sort()
      persistSelectedDates(sorted)
      return sorted
    })
  }

  const removeSelectedDate = (menuDate) => {
    setSelectedDates(prev => {
      const normalized = normalizeISODate(menuDate)
      if (!normalized) return prev
      const next = prev.filter(date => date !== normalized)
      persistSelectedDates(next)
      return next
    })
  }

  const clearMenuDate = (menuDate) => {
    setLoadingMenuByDate(prev => {
      const next = { ...prev }
      delete next[menuDate]
      return next
    })
    setMenuItemsByDate(prev => {
      const next = { ...prev }
      delete next[menuDate]
      return next
    })
  }

  const toggleDinnerMenu = (checked) => {
    setDinnerMenuEnabled(checked)
    if (typeof window !== 'undefined') {
      localStorage.setItem('dinner_menu_enabled', checked ? 'true' : 'false')
    }
  }

  const weekRange = useMemo(() => {
    const base = weekBaseDate instanceof Date ? weekBaseDate : new Date()
    const days = getWeekDates(base)
    const startISO = toISODate(days[0])
    const endISO = toISODate(days[days.length - 1])
    return { startISO, endISO }
  }, [weekBaseDate])

  useEffect(() => {
    const loadDatesWithMenu = async () => {
      if (!weekRange.startISO || !weekRange.endISO) return
      try {
        const { data, error } = await db.getMenuDatesByRange({
          start: weekRange.startISO,
          end: weekRange.endISO,
          companySlug: normalizedCompanySlug
        })
        if (error) {
          console.error('Error fetching menu dates:', error)
          return
        }
        const dates = (Array.isArray(data) ? data : [])
          .map(row => normalizeISODate(row?.menu_date))
          .filter(Boolean)
          .filter(isWithinRetention)
          .sort()
        setLoadedDates(dates)
      } catch (err) {
        console.error('Error loading menu dates range', err)
      }
    }
    loadDatesWithMenu()
  }, [weekRange.startISO, weekRange.endISO, normalizedCompanySlug])

  useEffect(() => {
    const next = readStoredSelectedDates()
    setSelectedDates(next)
  }, [readStoredSelectedDates, storageKey])

  return {
    selectedDates,
    setSelectedDatesSafe,
    loadedDates,
    menuItemsByDate,
    loadingMenuByDate,
    dinnerMenuEnabled,
    fetchMenuForDate,
    addSelectedDate,
    removeSelectedDate,
    clearMenuDate,
    setMenuItemsForDate,
    toggleDinnerMenu
  }
}

export { useAdminMenuData }

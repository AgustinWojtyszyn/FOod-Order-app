import { useCallback, useEffect, useState } from 'react'
import { db } from '../supabaseClient'
import { sortMenuItems } from '../utils/order/orderMenuHelpers'
import { filterOrderableMenuItems, withMenuSlotIndex } from '../utils/order/menuDisplay'
import { DINNER_FALLBACK_WHITELIST } from '../constants/dinnerWhitelist'
import { buildSuggestionSummary, buildOptionsSummary } from '../utils/order/orderFormatters'
import { hasMainMenuSelected } from '../utils/order/orderSelectionHelpers'
import { getTomorrowISOInTimeZone } from '../utils/dateUtils'

const DEFAULT_MENU_ITEMS = [
  { id: 1, name: 'Plato Principal 1', description: 'Delicioso plato principal' },
  { id: 2, name: 'Plato Principal 2', description: 'Otro plato delicioso' },
  { id: 3, name: 'Plato Principal 3', description: 'Plato especial del día' },
  { id: 4, name: 'Plato Principal 4', description: 'Plato vegetariano' },
  { id: 5, name: 'Plato Principal 5', description: 'Plato de la casa' },
  { id: 6, name: 'Plato Principal 6', description: 'Plato recomendado' }
]

const filterByMealScope = (options = [], meal) =>
  (options || []).filter(opt => {
    const scope = opt?.meal_scope || (opt?.dinner_only ? 'dinner' : 'both')
    return scope === 'both' || scope === meal
  })

const isBeverageDessertOrFruitOption = (option = {}) => {
  const text = [
    option.title,
    ...(Array.isArray(option.options) ? option.options : [])
  ].join(' ').toLowerCase()

  return text.includes('bebida') ||
    text.includes('postre') ||
    text.includes('fruta') ||
    text.includes('coca') ||
    text.includes('agua')
}

const hasBeverageDessertOrFruitOption = (options = []) =>
  (options || []).some(isBeverageDessertOrFruitOption)

const mergeFallbackSpecialOptions = (options = [], fallbackOptions = []) => {
  if (hasBeverageDessertOrFruitOption(options)) return options
  const existingIds = new Set((options || []).map((option) => option?.id).filter(Boolean))
  const additions = (fallbackOptions || [])
    .filter(isBeverageDessertOrFruitOption)
    .filter((option) => !existingIds.has(option?.id))
    .map((option) => ({ ...option, id: `distro-cuyo-${option.id}` }))
  return [...options, ...additions]
}

const ACTIVE_ORDER_STATUSES = new Set(['pending'])

const isActiveOrderForDelivery = (order, deliveryDate, service) => {
  const orderService = (order?.service || 'lunch').toLowerCase()
  const orderStatus = (order?.status || '').toLowerCase()
  return order?.delivery_date === deliveryDate &&
    orderService === service &&
    ACTIVE_ORDER_STATUSES.has(orderStatus)
}

const useOrderBootstrap = ({
  user,
  rawCompanySlug,
  companyOptionsSlug,
  setDinnerEnabled,
  setSelectedTurns,
  setMode,
  setFormData,
  setMenuItems,
  setDinnerMenuItems,
  setCustomOptionsLunch,
  setCustomOptionsDinner,
  selectedDinnerDate,
  setSelectedDinnerDate,
  setDinnerMenuSpecial,
  setPendingLunch,
  setPendingDinner,
  setHasOrderToday,
  setSuggestion,
  setSuggestionMode,
  setSuggestionVisible,
  setSuggestionSummary,
  setSuggestionLoading
}) => {
  const [bootstrapping, setBootstrapping] = useState(false)

  const fetchMenuItems = useCallback(async () => {
    try {
      const menuDate = getTomorrowISOInTimeZone()
      const { data, error } = await db.getMenuItemsByDate(menuDate)

      if (error) {
        console.error('Error fetching menu:', error)
        setMenuItems(filterOrderableMenuItems(withMenuSlotIndex(sortMenuItems(DEFAULT_MENU_ITEMS))))
        return
      }

      setMenuItems(filterOrderableMenuItems(withMenuSlotIndex(sortMenuItems(data || []))))
    } catch (err) {
      console.error('Error:', err)
    }
  }, [setMenuItems])

  const fetchLunchCustomOptions = useCallback(async () => {
    try {
      const deliveryDate = getTomorrowISOInTimeZone()
      const { data, error } = await db.getVisibleCustomOptions({
        company: companyOptionsSlug,
        meal: 'lunch',
        date: deliveryDate
      })
      if (error) {
        console.error('Error fetching lunch custom options:', error)
        setCustomOptionsLunch([])
        return
      }
      let lunchOptions = filterByMealScope(data, 'lunch')
      if (companyOptionsSlug === 'distro_cuyo' && !hasBeverageDessertOrFruitOption(lunchOptions)) {
        const { data: fallbackData, error: fallbackError } = await db.getVisibleCustomOptions({
          company: 'genneia',
          meal: 'lunch',
          date: deliveryDate
        })
        if (fallbackError) console.error('Error fetching DistroCuyo lunch fallback options:', fallbackError)
        lunchOptions = mergeFallbackSpecialOptions(lunchOptions, filterByMealScope(fallbackData, 'lunch'))
      }
      setCustomOptionsLunch(lunchOptions)
    } catch (err) {
      console.error('Error fetching lunch custom options:', err)
      setCustomOptionsLunch([])
    }
  }, [companyOptionsSlug, setCustomOptionsLunch])

  const fetchDinnerCustomOptions = useCallback(async () => {
    try {
      const fallbackDate = getTomorrowISOInTimeZone()
      const dinnerDate = selectedDinnerDate || fallbackDate
      const { data, error } = await db.getVisibleCustomOptions({
        company: companyOptionsSlug,
        meal: 'dinner',
        date: dinnerDate
      })
      if (error) {
        console.error('Error fetching dinner custom options:', error)
        setCustomOptionsDinner([])
        return
      }
      // Cena siempre se resuelve con su consulta específica, sin reutilizar catálogo de almuerzo.
      let dinnerOptions = filterByMealScope(data, 'dinner')
      if (companyOptionsSlug === 'distro_cuyo' && !hasBeverageDessertOrFruitOption(dinnerOptions)) {
        const { data: fallbackData, error: fallbackError } = await db.getVisibleCustomOptions({
          company: 'genneia',
          meal: 'dinner',
          date: dinnerDate
        })
        if (fallbackError) console.error('Error fetching DistroCuyo dinner fallback options:', fallbackError)
        dinnerOptions = mergeFallbackSpecialOptions(dinnerOptions, filterByMealScope(fallbackData, 'dinner'))
      }
      setCustomOptionsDinner(dinnerOptions)
    } catch (err) {
      console.error('Error fetching dinner custom options:', err)
      setCustomOptionsDinner([])
    }
  }, [companyOptionsSlug, selectedDinnerDate, setCustomOptionsDinner])

  const fetchDinnerMenuSpecial = useCallback(async () => {
    try {
      const fallbackDate = getTomorrowISOInTimeZone()
      const deliveryDate = selectedDinnerDate || fallbackDate
      // En cena se muestra primero el menú completo base (mismo bloque que almuerzo).
      const { data: lunchMenuData, error: lunchMenuError } = await db.getMenuItemsByDate(deliveryDate)
      if (lunchMenuError) {
        console.error('Error fetching base menu for dinner:', lunchMenuError)
        setDinnerMenuItems([])
        setDinnerMenuSpecial(null)
        return
      }

      const normalizedLunchMenu = filterOrderableMenuItems(withMenuSlotIndex(sortMenuItems(lunchMenuData || [])))
      setDinnerMenuItems(
        normalizedLunchMenu.map((item, index) => ({
          ...item,
          id: `dinner-fallback-${deliveryDate}-${item.id || index + 1}`,
          slotIndex: Number.isFinite(item?.slotIndex) ? item.slotIndex : index
        }))
      )

      // Además, cargar el menú específico de cena desde admin como opciones adicionales exclusivas.
      const { data: dinnerData, error: dinnerError } = await db.getDinnerMenuByDate({
        date: deliveryDate,
        company: companyOptionsSlug
      })
      if (dinnerError) {
        console.error('Error fetching dinner special options:', dinnerError)
        setDinnerMenuSpecial(null)
        return
      }

      const dinnerOptions = Array.isArray(dinnerData?.options)
        ? dinnerData.options.map(opt => (opt || '').toString().trim()).filter(Boolean)
        : []

      if (dinnerData && dinnerData.active && dinnerOptions.length > 0) {
        setDinnerMenuSpecial({
          title: dinnerData.title || 'Opción de cena',
          options: dinnerOptions
        })
      } else {
        setDinnerMenuSpecial(null)
      }
    } catch (err) {
      console.error('Error fetching dinner menu by date:', err)
      setDinnerMenuItems([])
      setDinnerMenuSpecial(null)
    }
  }, [companyOptionsSlug, selectedDinnerDate, setDinnerMenuItems, setDinnerMenuSpecial])

  const fetchUserFeatures = useCallback(async () => {
    if (!user?.id) return
    try {
      const { data, error } = await db.getUserFeatures(user.id)
      if (!error && Array.isArray(data)) {
        const dinner = data.find(f => f.feature === 'dinner' && f.enabled)
        if (dinner) {
          setDinnerEnabled(true)
          setSelectedTurns(prev => ({ ...prev, dinner: true }))
        } else {
          const lowerId = (user?.id || '').toString().trim().toLowerCase()
          const lowerEmail = (user?.email || '').toString().trim().toLowerCase()
          const fallback = DINNER_FALLBACK_WHITELIST.has(lowerId) || DINNER_FALLBACK_WHITELIST.has(lowerEmail)
          setDinnerEnabled(fallback)
          if (fallback) {
            setSelectedTurns({ lunch: true, dinner: true })
            setMode('both')
          } else {
            setSelectedTurns({ lunch: true, dinner: false })
            setMode('lunch')
          }
        }
      }
    } catch (err) {
      console.error('Error fetching user features', err)
    }
  }, [setDinnerEnabled, setMode, setSelectedTurns, user?.email, user?.id])

  const checkTodayOrder = useCallback(async () => {
    if (!user?.id) return
    setSuggestionLoading(true)
    try {
      const { data, error } = await db.getOrders(user.id)
      if (!error && data) {
        const lunchDeliveryDate = getTomorrowISOInTimeZone()
        const dinnerDeliveryDate = selectedDinnerDate || lunchDeliveryDate

        const pendingLunch = data.some(order => isActiveOrderForDelivery(order, lunchDeliveryDate, 'lunch'))
        const pendingDinner = data.some(order => isActiveOrderForDelivery(order, dinnerDeliveryDate, 'dinner'))

        setPendingLunch(pendingLunch)
        setPendingDinner(pendingDinner)
        setHasOrderToday(pendingLunch || pendingDinner)

        const yesterday = new Date()
        yesterday.setHours(0, 0, 0, 0)
        yesterday.setDate(yesterday.getDate() - 1)

        const ordersFromYesterday = data.filter(order => {
          if (!order?.created_at) return false
          if ((order?.status || '').toLowerCase() === 'cancelled') return false
          const d = new Date(order.created_at)
          d.setHours(0, 0, 0, 0)
          return d.getTime() === yesterday.getTime()
        })

        if (ordersFromYesterday.length > 0) {
          const latestYesterday = [...ordersFromYesterday].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
          setSuggestion(latestYesterday)
          setSuggestionMode('last')
          setSuggestionVisible(true)
          setSuggestionSummary(buildSuggestionSummary(latestYesterday, hasMainMenuSelected, buildOptionsSummary))
        } else {
          setSuggestion(null)
          setSuggestionMode('last')
          setSuggestionVisible(false)
          setSuggestionSummary('')
        }
      }
    } catch (err) {
      console.error('Error checking today order:', err)
      setSuggestion(null)
      setSuggestionMode('last')
      setSuggestionVisible(false)
      setSuggestionSummary('')
    } finally {
      setSuggestionLoading(false)
    }
  }, [
    setHasOrderToday,
    setPendingDinner,
    setPendingLunch,
    setSuggestion,
    setSuggestionLoading,
    setSuggestionMode,
    setSuggestionSummary,
    setSuggestionVisible,
    selectedDinnerDate,
    user?.id
  ])

  useEffect(() => {
    if (selectedDinnerDate) return
    setSelectedDinnerDate(getTomorrowISOInTimeZone())
  }, [selectedDinnerDate, setSelectedDinnerDate])

  useEffect(() => {
    if (!user?.id) return
    let isMounted = true

    const run = async () => {
      setBootstrapping(true)
      await Promise.all([
        fetchMenuItems(),
        fetchLunchCustomOptions(),
        fetchUserFeatures(),
        checkTodayOrder()
      ])

      if (!isMounted) return
      setFormData(prev => ({
        ...prev,
        name: user?.user_metadata?.full_name || prev.name || '',
        email: user?.email || prev.email || ''
      }))
      setBootstrapping(false)
    }

    run()
    return () => {
      isMounted = false
    }
  }, [
    user?.id,
    user?.email,
    user?.user_metadata?.full_name,
    rawCompanySlug,
    companyOptionsSlug,
    fetchMenuItems,
    fetchLunchCustomOptions,
    fetchUserFeatures,
    checkTodayOrder,
    setFormData
  ])

  useEffect(() => {
    if (!user?.id) return
    fetchDinnerMenuSpecial()
    fetchDinnerCustomOptions()
  }, [user?.id, companyOptionsSlug, selectedDinnerDate, fetchDinnerCustomOptions, fetchDinnerMenuSpecial])

  return { bootstrapping }
}

export { useOrderBootstrap }

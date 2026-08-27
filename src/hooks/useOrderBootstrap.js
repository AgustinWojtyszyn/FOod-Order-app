import { useCallback, useEffect, useState } from 'react'
import { db } from '../supabaseClient'
import { sortMenuItems } from '../utils/order/orderMenuHelpers'
import { filterOrderableMenuItems, withMenuSlotIndex } from '../utils/order/menuDisplay'
import { mergeCompanyMenuItems, normalizeCompanySlug } from '../utils/order/companyMenuMerge'
import { DINNER_FALLBACK_WHITELIST } from '../constants/dinnerWhitelist'
import { buildSuggestionSummary, buildOptionsSummary } from '../utils/order/orderFormatters'
import { hasMainMenuSelected } from '../utils/order/orderSelectionHelpers'
import { getTomorrowISOInTimeZone } from '../utils/dateUtils'
import { withGreifRefrigerioMenuItem } from '../utils/order/greifDefaultSnack'
import { getMenuBeverageTitle, requiresMenuBeverageChoice } from '../utils/order/companySpecialRules'

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

const normalizeOptionTitle = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[()]/g, '')
    .replace(/\s+/g, ' ')

const isBeverageOption = (option = {}) => {
  const text = [
    option.title,
    ...(Array.isArray(option.options) ? option.options : [])
  ].join(' ').toLowerCase()
  return text.includes('bebida') ||
    text.includes('coca') ||
    text.includes('agua') ||
    text.includes('gaseosa') ||
    text.includes('soda') ||
    text.includes('jugo')
}

const isGenneiaBeverageOptionTitle = (option = {}) =>
  normalizeOptionTitle(option.title) === 'bebidas solo genneia'

const mergeMissingBeverageOptions = (options = [], fallbackOptions = []) => {
  if ((options || []).some(isBeverageOption)) return options
  const existingIds = new Set((options || []).map(option => option?.id).filter(Boolean))
  const additions = (fallbackOptions || [])
    .filter(isGenneiaBeverageOptionTitle)
    .filter(option => !existingIds.has(option?.id))
    .map(option => ({ ...option, id: `dinner-${option.id}` }))
  return [...options, ...additions]
}

const mergeFallbackBeverageOptions = ({
  options = [],
  fallbackOptions = [],
  idPrefix = 'beverage-fallback',
  title = 'Bebida'
} = {}) => {
  if ((options || []).some(isBeverageOption)) return options
  const existingIds = new Set((options || []).map(option => option?.id).filter(Boolean))
  const additions = (fallbackOptions || [])
    .filter(isBeverageOption)
    .filter(option => !existingIds.has(option?.id))
    .map(option => ({
      ...option,
      id: `${idPrefix}-${option.id}`,
      title,
      required: true
    }))
  return [...options, ...additions]
}

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
      const normalizedCompanySlug = normalizeCompanySlug(rawCompanySlug || companyOptionsSlug)
      const shouldFetchCompanyMenu = normalizedCompanySlug && normalizedCompanySlug !== 'global'
      const [
        { data: globalData, error: globalError },
        companyResult
      ] = await Promise.all([
        db.getMenuItemsByDate(menuDate, 'global'),
        shouldFetchCompanyMenu
          ? db.getMenuItemsByDate(menuDate, normalizedCompanySlug)
          : Promise.resolve({ data: [], error: null })
      ])

      if (globalError && (!shouldFetchCompanyMenu || companyResult?.error)) {
        console.error('Error fetching menu:', globalError)
        if (companyResult?.error) console.error('Error fetching company menu:', companyResult.error)
        setMenuItems(withGreifRefrigerioMenuItem({
          companySlug: normalizedCompanySlug,
          items: filterOrderableMenuItems(withMenuSlotIndex(sortMenuItems(DEFAULT_MENU_ITEMS)), normalizedCompanySlug)
        }))
        return
      }

      if (globalError) console.error('Error fetching global menu:', globalError)
      if (companyResult?.error) console.error('Error fetching company menu:', companyResult.error)

      const mergedItems = mergeCompanyMenuItems(
        globalError ? [] : (globalData || []),
        companyResult?.error ? [] : (companyResult?.data || [])
      )
      setMenuItems(withGreifRefrigerioMenuItem({
        companySlug: normalizedCompanySlug,
        items: filterOrderableMenuItems(withMenuSlotIndex(sortMenuItems(mergedItems)), normalizedCompanySlug)
      }))
    } catch (err) {
      console.error('Error:', err)
    }
  }, [companyOptionsSlug, rawCompanySlug, setMenuItems])

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
      if (requiresMenuBeverageChoice(rawCompanySlug || companyOptionsSlug) && !lunchOptions.some(isBeverageOption)) {
        const { data: fallbackData, error: fallbackError } = await db.getVisibleCustomOptions({
          company: 'genneia',
          meal: 'lunch',
          date: deliveryDate
        })
        if (fallbackError) console.error('Error fetching beverage fallback options:', fallbackError)
        lunchOptions = mergeFallbackBeverageOptions({
          options: lunchOptions,
          fallbackOptions: filterByMealScope(fallbackData, 'lunch'),
          idPrefix: companyOptionsSlug,
          title: getMenuBeverageTitle(rawCompanySlug || companyOptionsSlug)
        })
      }
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
  }, [companyOptionsSlug, rawCompanySlug, setCustomOptionsLunch])

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
      if (requiresMenuBeverageChoice(rawCompanySlug || companyOptionsSlug) && !dinnerOptions.some(isBeverageOption)) {
        const { data: fallbackData, error: fallbackError } = await db.getVisibleCustomOptions({
          company: 'genneia',
          meal: 'dinner',
          date: dinnerDate
        })
        if (fallbackError) console.error('Error fetching dinner beverage fallback options:', fallbackError)
        dinnerOptions = mergeFallbackBeverageOptions({
          options: dinnerOptions,
          fallbackOptions: filterByMealScope(fallbackData, 'dinner'),
          idPrefix: `dinner-${companyOptionsSlug}`,
          title: getMenuBeverageTitle(rawCompanySlug || companyOptionsSlug)
        })
      }
      if (companyOptionsSlug === 'genneia' && !dinnerOptions.some(isBeverageOption)) {
        const { data: lunchFallbackData, error: lunchFallbackError } = await db.getVisibleCustomOptions({
          company: 'genneia',
          meal: 'lunch',
          date: dinnerDate
        })
        if (lunchFallbackError) console.error('Error fetching Genneia dinner beverage fallback options:', lunchFallbackError)
        dinnerOptions = mergeMissingBeverageOptions(dinnerOptions, filterByMealScope(lunchFallbackData, 'lunch'))
      }
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
  }, [companyOptionsSlug, rawCompanySlug, selectedDinnerDate, setCustomOptionsDinner])

  const fetchDinnerMenuSpecial = useCallback(async () => {
    try {
      const fallbackDate = getTomorrowISOInTimeZone()
      const deliveryDate = selectedDinnerDate || fallbackDate
      // En cena se muestra primero el menú completo base (mismo bloque que almuerzo).
      const normalizedCompanySlug = normalizeCompanySlug(rawCompanySlug || companyOptionsSlug)
      const shouldFetchCompanyMenu = normalizedCompanySlug && normalizedCompanySlug !== 'global'
      const [
        { data: globalLunchMenuData, error: globalLunchMenuError },
        companyLunchMenuResult
      ] = await Promise.all([
        db.getMenuItemsByDate(deliveryDate, 'global'),
        shouldFetchCompanyMenu
          ? db.getMenuItemsByDate(deliveryDate, normalizedCompanySlug)
          : Promise.resolve({ data: [], error: null })
      ])
      if (globalLunchMenuError && (!shouldFetchCompanyMenu || companyLunchMenuResult?.error)) {
        console.error('Error fetching base menu for dinner:', globalLunchMenuError)
        if (companyLunchMenuResult?.error) console.error('Error fetching company base menu for dinner:', companyLunchMenuResult.error)
        setDinnerMenuItems([])
        setDinnerMenuSpecial(null)
        return
      }

      if (globalLunchMenuError) console.error('Error fetching global base menu for dinner:', globalLunchMenuError)
      if (companyLunchMenuResult?.error) console.error('Error fetching company base menu for dinner:', companyLunchMenuResult.error)

      const mergedLunchMenu = mergeCompanyMenuItems(
        globalLunchMenuError ? [] : (globalLunchMenuData || []),
        companyLunchMenuResult?.error ? [] : (companyLunchMenuResult?.data || [])
      )
      const normalizedLunchMenu = filterOrderableMenuItems(
        withMenuSlotIndex(sortMenuItems(mergedLunchMenu)),
        normalizedCompanySlug
      )
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
  }, [companyOptionsSlug, rawCompanySlug, selectedDinnerDate, setDinnerMenuItems, setDinnerMenuSpecial])

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

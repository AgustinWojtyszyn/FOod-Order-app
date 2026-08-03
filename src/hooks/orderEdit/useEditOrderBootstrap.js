import { useCallback, useEffect, useState } from 'react'
import { db } from '../../supabaseClient'
import { isOrderEditable } from '../../utils'
import { EDIT_WINDOW_MINUTES } from '../../constants/orderRules'
import { notifyInfo } from '../../utils/notice'
import { getTomorrowISOInTimeZone } from '../../utils/dateUtils'
import { sortMenuItems } from '../../utils/order/orderMenuHelpers'
import { filterOrderableMenuItems, withMenuSlotIndex } from '../../utils/order/menuDisplay'
import { mergeCompanyMenuItems, normalizeCompanySlug } from '../../utils/order/companyMenuMerge'
import { mapOrderToEditForm } from '../../utils/orderEdit/mapOrderToEditForm'
import { getCompanyByLocationOrSlug } from '../../constants/companyConfig'

const DEFAULT_MENU_ITEMS = [
  { id: 1, name: 'Plato Principal 1', description: 'Delicioso plato principal' },
  { id: 2, name: 'Plato Principal 2', description: 'Otro plato delicioso' },
  { id: 3, name: 'Plato Principal 3', description: 'Plato especial del día' },
  { id: 4, name: 'Plato Principal 4', description: 'Plato vegetariano' },
  { id: 5, name: 'Plato Principal 5', description: 'Plato de la casa' },
  { id: 6, name: 'Plato Principal 6', description: 'Plato recomendado' }
]

const resolveOrderCompanySlug = (order = {}) => {
  const company = getCompanyByLocationOrSlug(order?.company_slug || order?.company || order?.company_id || order?.location)
    || getCompanyByLocationOrSlug(order?.location)
  return normalizeCompanySlug(company?.slug || order?.company_slug || order?.company || order?.company_id || '')
}

export const useEditOrderBootstrap = ({ order, user, navigate }) => {
  const [menuItems, setMenuItems] = useState([])
  const [customOptions, setCustomOptions] = useState([])
  const [dinnerMenuSpecial, setDinnerMenuSpecial] = useState(null)
  const [customResponses, setCustomResponses] = useState({})
  const [selectedItems, setSelectedItems] = useState({})
  const [formData, setFormData] = useState({
    location: '',
    name: '',
    email: '',
    phone: '',
    comments: ''
  })

  const fetchMenuItems = useCallback(async () => {
    try {
      const fallbackDate = getTomorrowISOInTimeZone()
      const menuDate = order?.delivery_date || fallbackDate
      const normalizedCompanySlug = resolveOrderCompanySlug(order)
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
        setMenuItems(filterOrderableMenuItems(withMenuSlotIndex(sortMenuItems(DEFAULT_MENU_ITEMS)), normalizedCompanySlug))
        return
      }

      if (globalError) console.error('Error fetching global menu:', globalError)
      if (companyResult?.error) console.error('Error fetching company menu:', companyResult.error)

      const mergedItems = mergeCompanyMenuItems(
        globalError ? [] : (globalData || []),
        companyResult?.error ? [] : (companyResult?.data || [])
      )
      setMenuItems(filterOrderableMenuItems(withMenuSlotIndex(sortMenuItems(mergedItems)), normalizedCompanySlug))
    } catch (err) {
      console.error('Error:', err)
    }
  }, [order])

  const fetchCustomOptions = useCallback(async () => {
    try {
      const fallbackDate = getTomorrowISOInTimeZone()
      const deliveryDate = order?.delivery_date || fallbackDate
      const service = order?.service || 'lunch'

      const filterByMealScope = (options = [], meal) =>
        (options || []).filter(opt => {
          const scope = opt?.meal_scope || (opt?.dinner_only ? 'dinner' : 'both')
          return scope === 'both' || scope === meal
        })

      if (service === 'dinner') {
        const [{ data: lunchData, error: lunchError }, { data: dinnerData, error: dinnerError }] = await Promise.all([
          db.getVisibleCustomOptions({
            company: order?.company || order?.company_id || null,
            meal: 'lunch',
            date: deliveryDate
          }),
          db.getVisibleCustomOptions({
            company: order?.company || order?.company_id || null,
            meal: 'dinner',
            date: deliveryDate
          })
        ])

        if (lunchError) console.error('Error fetching visible lunch custom options:', lunchError)
        if (dinnerError) console.error('Error fetching visible dinner custom options:', dinnerError)

        const dinnerOptionsFromDinnerQuery = filterByMealScope(dinnerData, 'dinner')
        const dinnerOptions = dinnerOptionsFromDinnerQuery.length > 0
          ? dinnerOptionsFromDinnerQuery
          : filterByMealScope(lunchData, 'dinner')
        setCustomOptions(dinnerOptions)
      } else {
        const { data, error } = await db.getVisibleCustomOptions({
          company: order?.company || order?.company_id || null,
          meal: service,
          date: deliveryDate
        })
        if (!error && data) setCustomOptions(filterByMealScope(data, service))
        if (error) console.error('Error fetching visible custom options:', error)
      }
    } catch (err) {
      console.error('Error fetching custom options:', err)
    }
  }, [order?.company, order?.company_id, order?.delivery_date, order?.service])

  const fetchDinnerMenuSpecial = useCallback(async () => {
    const service = (order?.service || 'lunch').toLowerCase()
    if (service !== 'dinner') {
      setDinnerMenuSpecial(null)
      return
    }

    try {
      const fallbackDate = getTomorrowISOInTimeZone()
      const deliveryDate = order?.delivery_date || fallbackDate
      const { data, error } = await db.getDinnerMenuByDate({
        date: deliveryDate,
        company: order?.company || order?.company_id || null
      })
      if (error) {
        console.error('Error fetching dinner menu special:', error)
        setDinnerMenuSpecial(null)
        return
      }
      if (data && data.active) {
        setDinnerMenuSpecial({
          title: data.title,
          options: Array.isArray(data.options) ? data.options : []
        })
      } else {
        setDinnerMenuSpecial(null)
      }
    } catch (err) {
      console.error('Error fetching dinner menu special:', err)
      setDinnerMenuSpecial(null)
    }
  }, [order?.company, order?.company_id, order?.delivery_date, order?.service])

  useEffect(() => {
    if (!order) {
      navigate('/dashboard')
      return
    }

    if (!isOrderEditable(order.created_at, EDIT_WINDOW_MINUTES)) {
      notifyInfo(
        `Solo puedes editar tu pedido dentro de los primeros ${EDIT_WINDOW_MINUTES} minutos de haberlo creado.`
      )
      navigate('/dashboard')
      return
    }

    fetchMenuItems()
    fetchCustomOptions()
    fetchDinnerMenuSpecial()

    const { formData, selectedItems, customResponses } = mapOrderToEditForm({ order, user })
    setFormData(formData)
    setSelectedItems(selectedItems)
    setCustomResponses(customResponses)
  }, [order, user, navigate, fetchMenuItems, fetchCustomOptions, fetchDinnerMenuSpecial])

  useEffect(() => {
    const service = (order?.service || 'lunch').toLowerCase()
    const shouldShowDinnerSpecial = service === 'dinner'
      && dinnerMenuSpecial
      && Array.isArray(dinnerMenuSpecial.options)
      && dinnerMenuSpecial.options.length > 0

    setCustomOptions(prev => {
      const base = Array.isArray(prev) ? prev : []
      const next = base.filter(opt => opt?.id !== 'dinner-special')
      if (!shouldShowDinnerSpecial) return next
      next.push({
        id: 'dinner-special',
        title: dinnerMenuSpecial.title || 'Opción de cena',
        type: 'multiple_choice',
        options: dinnerMenuSpecial.options,
        required: false,
        active: true
      })
      return next
    })
  }, [dinnerMenuSpecial, order?.service])

  return {
    menuItems,
    customOptions,
    dinnerMenuSpecial,
    customResponses,
    selectedItems,
    formData,
    setFormData,
    setCustomResponses,
    setSelectedItems
  }
}

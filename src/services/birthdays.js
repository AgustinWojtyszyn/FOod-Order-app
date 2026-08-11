import { supabase, supabaseService } from './supabase'
import { handleError } from '../utils'
import { normalizeBirthdayForm } from '../utils/birthdays/birthdayUtils'

const BIRTHDAY_COLUMNS = `
  id,
  person_name,
  birth_day,
  birth_month,
  birth_year,
  company_slug,
  company_name,
  delivery_location,
  cake_quantity,
  comment,
  is_active,
  created_by,
  updated_by,
  deactivated_by,
  deactivated_at,
  created_at,
  updated_at
`

const ORDER_COLUMNS = `
  id,
  birthday_id,
  birthday_year,
  person_name,
  company_slug,
  company_name,
  delivery_location,
  planned_delivery_date,
  cake_quantity,
  comment,
  status,
  created_by,
  updated_by,
  status_changed_by,
  status_changed_at,
  reschedule_reason,
  created_at,
  updated_at
`

class BirthdaysService {
  async getAccessContext() {
    try {
      const { data, error } = await supabase.rpc('get_human_resources_access_context')
      if (error) throw error
      return { data, error: null }
    } catch (error) {
      return { data: null, error: handleError(error, 'getHumanResourcesAccessContext') }
    }
  }

  async getBirthdays(filters = {}) {
    try {
      const cacheKey = `birthdays_${JSON.stringify(filters)}`
      const queryFn = async () => {
        let query = supabase
          .from('employee_birthdays')
          .select(BIRTHDAY_COLUMNS)
          .order('birth_month', { ascending: true })
          .order('birth_day', { ascending: true })

        if (filters.companySlug && filters.companySlug !== 'all') {
          query = query.eq('company_slug', filters.companySlug)
        }
        if (filters.location && filters.location !== 'all') {
          query = query.eq('delivery_location', filters.location)
        }
        if (filters.month && filters.month !== 'all') {
          query = query.eq('birth_month', Number(filters.month))
        }
        if (filters.activeOnly) {
          query = query.eq('is_active', true)
        }

        const { data, error } = await query
        if (error) throw error
        return data || []
      }

      const data = await supabaseService.cachedQuery(cacheKey, queryFn, 15000, filters.force)
      return { data, error: null }
    } catch (error) {
      return { data: [], error: handleError(error, 'getBirthdays') }
    }
  }

  async createBirthday(form) {
    try {
      const birthday = normalizeBirthdayForm(form)
      const { data, error } = await supabase
        .from('employee_birthdays')
        .insert([birthday])
        .select(BIRTHDAY_COLUMNS)
        .single()

      if (error) throw error

      await this.ensureAnnualOrder(data.id)
      supabaseService.invalidateCache('birthdays')
      supabaseService.invalidateCache('birthday_orders')
      return { data, error: null }
    } catch (error) {
      return { data: null, error: handleError(error, 'createBirthday') }
    }
  }

  async updateBirthday(id, form) {
    try {
      const birthday = normalizeBirthdayForm(form)
      const { data, error } = await supabase
        .from('employee_birthdays')
        .update({
          ...birthday,
          updated_by: (await supabase.auth.getUser()).data?.user?.id || null
        })
        .eq('id', id)
        .select(BIRTHDAY_COLUMNS)
        .single()

      if (error) throw error

      if (data?.is_active) {
        await this.ensureAnnualOrder(data.id)
      }
      supabaseService.invalidateCache('birthdays')
      supabaseService.invalidateCache('birthday_orders')
      return { data, error: null }
    } catch (error) {
      return { data: null, error: handleError(error, 'updateBirthday') }
    }
  }

  async deactivateBirthday(id) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('employee_birthdays')
        .update({
          is_active: false,
          updated_by: user?.id || null,
          deactivated_by: user?.id || null,
          deactivated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select(BIRTHDAY_COLUMNS)
        .single()

      if (error) throw error
      supabaseService.invalidateCache('birthdays')
      return { data, error: null }
    } catch (error) {
      return { data: null, error: handleError(error, 'deactivateBirthday') }
    }
  }

  async ensureAnnualOrder(birthdayId, year = null) {
    try {
      const { data, error } = await supabase.rpc('ensure_birthday_cake_order', {
        p_birthday_id: birthdayId,
        p_year: year
      })
      if (error) throw error
      return { data, error: null }
    } catch (error) {
      return { data: null, error: handleError(error, 'ensureBirthdayCakeOrder') }
    }
  }

  async advanceOrders() {
    try {
      const { data, error } = await supabase.rpc('advance_birthday_cake_orders')
      if (error) throw error
      supabaseService.invalidateCache('birthday_orders')
      return { data, error: null }
    } catch (error) {
      return { data: null, error: handleError(error, 'advanceBirthdayCakeOrders') }
    }
  }

  async getCakeOrders(filters = {}) {
    try {
      const cacheKey = `birthday_orders_${JSON.stringify(filters)}`
      const queryFn = async () => {
        let query = supabase
          .from('birthday_cake_orders')
          .select(ORDER_COLUMNS)
          .order('planned_delivery_date', { ascending: true })

        if (filters.companySlug && filters.companySlug !== 'all') {
          query = query.eq('company_slug', filters.companySlug)
        }
        if (filters.location && filters.location !== 'all') {
          query = query.eq('delivery_location', filters.location)
        }
        if (filters.status && filters.status !== 'all') {
          query = query.eq('status', filters.status)
        }
        if (filters.from) {
          query = query.gte('planned_delivery_date', filters.from)
        }
        if (filters.to) {
          query = query.lte('planned_delivery_date', filters.to)
        }

        const { data, error } = await query
        if (error) throw error
        return data || []
      }

      const data = await supabaseService.cachedQuery(cacheKey, queryFn, 15000, filters.force)
      return { data, error: null }
    } catch (error) {
      return { data: [], error: handleError(error, 'getBirthdayCakeOrders') }
    }
  }

  async transitionCakeOrder({ orderId, status, plannedDeliveryDate = null, reason = null }) {
    try {
      const { data, error } = await supabase.rpc('transition_birthday_cake_order', {
        p_order_id: orderId,
        p_status: status,
        p_planned_delivery_date: plannedDeliveryDate,
        p_reason: reason
      })
      if (error) throw error
      supabaseService.invalidateCache('birthday_orders')
      return { data, error: null }
    } catch (error) {
      return { data: null, error: handleError(error, 'transitionBirthdayCakeOrder') }
    }
  }

  async getOrderEvents(orderId) {
    try {
      const { data, error } = await supabase
        .from('birthday_cake_order_events')
        .select('id, order_id, action, actor_id, previous_values, new_values, created_at')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return { data: data || [], error: null }
    } catch (error) {
      return { data: [], error: handleError(error, 'getBirthdayCakeOrderEvents') }
    }
  }
}

export const birthdaysService = new BirthdaysService()

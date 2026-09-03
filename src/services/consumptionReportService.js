import { supabase } from './supabase'

export const getIgarretaIsemarConsumptionOrders = async ({ startDate, endDate }) => {
  const { data, error } = await supabase.rpc('get_igarreta_isemar_consumption_report', {
    p_month_start: startDate,
    p_month_end: endDate
  })
  return { data: Array.isArray(data) ? data : [], error }
}
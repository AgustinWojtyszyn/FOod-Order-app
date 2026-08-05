import { resolveEditOrderLocation } from './editOrderCompany'

export const mapOrderToEditForm = ({ order, user }) => {
  const formData = {
    location: resolveEditOrderLocation(order),
    name: order?.customer_name || user?.user_metadata?.full_name || '',
    email: order?.customer_email || user?.email || '',
    phone: order?.customer_phone || '',
    comments: order?.comments || ''
  }

  const selectedItems = {}
  ;(order?.items || []).forEach(item => {
    if (!item?.id) return
    selectedItems[item.id] = true
  })

  // Persisted shape: [{ id, title, response }]
  const customResponses = {}
  ;(order?.custom_responses || []).forEach(resp => {
    if (!resp?.id) return
    customResponses[resp.id] = resp.response
  })

  return { formData, selectedItems, customResponses }
}

import { useMemo, useState } from 'react'
import { Ban } from 'lucide-react'
import { getOperationalOrderUnits } from '../../utils/daily/dailyOrderCalculations'
import { getOrderCustomerDisplay, isAdminExtraOrder } from '../../utils/daily/adminExtraOrders'

const ACTIVE_EXTRA_STATUSES = new Set(['pending', 'archived', 'post_report_extra'])

const normalizeText = (value = '') => String(value || '').trim()

const getCompanyKey = (order = {}) =>
  normalizeText(order.company_slug).toLowerCase() ||
  normalizeText(order.company_name).toLowerCase() ||
  normalizeText(order.location).toLowerCase()

const getCompanyLabel = (order = {}) =>
  normalizeText(order.company_name) ||
  normalizeText(order.company_slug) ||
  normalizeText(order.location) ||
  'Empresa sin identificar'

const getExtraLabel = (order = {}) => {
  const customer = getOrderCustomerDisplay(order)
  const location = normalizeText(order.location || order.delivery_location)
  const units = getOperationalOrderUnits(order)
  return [customer.name, location, `${units} menú${units === 1 ? '' : 's'}`].filter(Boolean).join(' - ')
}

const AdminExtraCancelPanel = ({
  orders = [],
  operationalDate,
  cancelling = false,
  onCancelExtras
}) => {
  const [mode, setMode] = useState('single')
  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [selectedCompanyKey, setSelectedCompanyKey] = useState('')

  const extraOrders = useMemo(() => {
    return (Array.isArray(orders) ? orders : [])
      .filter((order) =>
        order?.id &&
        isAdminExtraOrder(order) &&
        String(order.delivery_date || '') === String(operationalDate || '') &&
        ACTIVE_EXTRA_STATUSES.has(String(order.status || '').toLowerCase())
      )
  }, [operationalDate, orders])

  const companyOptions = useMemo(() => {
    const byKey = new Map()
    extraOrders.forEach((order) => {
      const key = getCompanyKey(order)
      if (!key || byKey.has(key)) return
      byKey.set(key, {
        key,
        label: getCompanyLabel(order),
        count: extraOrders.filter((item) => getCompanyKey(item) === key).length
      })
    })
    return Array.from(byKey.values()).sort((a, b) => a.label.localeCompare(b.label, 'es'))
  }, [extraOrders])

  const selectedOrders = useMemo(() => {
    if (mode === 'single') return extraOrders.filter((order) => String(order.id) === selectedOrderId)
    if (mode === 'company') return extraOrders.filter((order) => getCompanyKey(order) === selectedCompanyKey)
    return extraOrders
  }, [extraOrders, mode, selectedCompanyKey, selectedOrderId])

  if (extraOrders.length === 0) return null

  const handleSubmit = (event) => {
    event.preventDefault()
    onCancelExtras?.({
      orders: selectedOrders,
      scope: mode,
      companyLabel: companyOptions.find((company) => company.key === selectedCompanyKey)?.label || ''
    })
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 rounded-xl border border-red-200 bg-white p-4 shadow-sm print-hide">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-sm font-black uppercase tracking-wide text-red-900">Pedidos extra</h3>
          <p className="text-xs font-semibold text-slate-600">
            {extraOrders.length} extra{extraOrders.length === 1 ? '' : 's'} activos para {operationalDate}
          </p>
        </div>

        <div className="grid flex-1 gap-3 sm:grid-cols-[minmax(180px,220px)_minmax(220px,1fr)_auto] lg:max-w-4xl">
          <label className="text-xs font-bold uppercase text-slate-600">
            Cancelar
            <select
              value={mode}
              onChange={(event) => {
                setMode(event.target.value)
                setSelectedOrderId('')
                setSelectedCompanyKey('')
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
              disabled={cancelling}
            >
              <option value="single">Un pedido extra</option>
              <option value="company">Todos los extras de una empresa</option>
              <option value="all">Todos los extras</option>
            </select>
          </label>

          {mode === 'single' && (
            <label className="text-xs font-bold uppercase text-slate-600">
              Extra
              <select
                value={selectedOrderId}
                onChange={(event) => setSelectedOrderId(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                disabled={cancelling}
                required
              >
                <option value="">Seleccionar extra</option>
                {extraOrders.map((order) => (
                  <option key={order.id} value={order.id}>{getExtraLabel(order)}</option>
                ))}
              </select>
            </label>
          )}

          {mode === 'company' && (
            <label className="text-xs font-bold uppercase text-slate-600">
              Empresa
              <select
                value={selectedCompanyKey}
                onChange={(event) => setSelectedCompanyKey(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                disabled={cancelling}
                required
              >
                <option value="">Seleccionar empresa</option>
                {companyOptions.map((company) => (
                  <option key={company.key} value={company.key}>
                    {company.label} ({company.count})
                  </option>
                ))}
              </select>
            </label>
          )}

          {mode === 'all' && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
              Se seleccionan los {extraOrders.length} extras del día.
            </div>
          )}

          <button
            type="submit"
            disabled={cancelling || selectedOrders.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-black text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Ban className="h-4 w-4" />
            {cancelling ? 'Cancelando...' : 'Cancelar'}
          </button>
        </div>
      </div>
    </form>
  )
}

export default AdminExtraCancelPanel

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Download,
  Plus,
  RefreshCw,
  Save,
  Settings,
  SlidersHorizontal
} from 'lucide-react'
import { totalizerService, exportTotalizerWorkbook } from '../services/totalizerService'
import { notifyError, notifySuccess } from '../utils/notice'

const TABS = [
  { id: 'totalizer', label: 'Totalizadora' },
  { id: 'kitchen', label: 'Cocina' },
  { id: 'reconciliation', label: 'Conciliación' },
  { id: 'settings', label: 'Configuración' }
]

const SERVICES = [
  { id: 'all', label: 'Todos' },
  { id: 'almuerzo', label: 'Almuerzo' },
  { id: 'cena', label: 'Cena' }
]

const CATEGORY_LABELS = {
  menu: 'Menú',
  option: 'Opción',
  diet: 'Dieta',
  side_dish: 'Guarnición',
  snack: 'Refrigerio',
  route: 'Ruta',
  return: 'Devolución',
  other: 'Otro'
}

const todayISO = () => new Date().toISOString().slice(0, 10)

const shiftDate = (date, offset) => {
  const next = new Date(`${date}T12:00:00`)
  next.setDate(next.getDate() + offset)
  return next.toISOString().slice(0, 10)
}

const numberOrNull = (value) => {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const readQuantity = (row, fallback = 0) =>
  Number(row?.total_quantity ?? row?.quantity ?? row?.totalizer_quantity ?? row?.totalizer_total ?? row?.total ?? fallback)

const accountName = (row) => row?.account_name || row?.company_name || row?.company_slug || row?.name || 'Sin empresa'
const conceptName = (row) => row?.concept_name || row?.name || row?.concept_code || 'Sin concepto'
const rowKey = (row) => `${row.account_id || row.company_slug || accountName(row)}:${row.concept_id || row.concept_code || conceptName(row)}`
const unmappedKey = (row) => [
  row.source_kind || '',
  row.source_title || '',
  row.source_value || '',
  row.company_slug || ''
].join(':')

const getManualValue = (values, accountId, conceptId, valueType) =>
  values.find((value) =>
    value.account_id === accountId &&
    value.concept_id === conceptId &&
    value.value_type === valueType
  )

const FieldNumber = ({ value, placeholder = '', onBlur, className = '' }) => {
  const [draft, setDraft] = useState(value ?? '')

  useEffect(() => {
    setDraft(value ?? '')
  }, [value])

  return (
    <input
      type="number"
      inputMode="decimal"
      value={draft}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onBlur(numberOrNull(draft))}
      className={`h-10 w-28 rounded-md border border-slate-300 px-3 text-right text-sm font-semibold text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 ${className}`}
    />
  )
}

const EmptyState = ({ title, detail }) => (
  <div className="rounded-lg border border-dashed border-slate-300 bg-white px-5 py-8 text-center">
    <p className="text-sm font-bold text-slate-700">{title}</p>
    {detail && <p className="mt-1 text-sm text-slate-500">{detail}</p>}
  </div>
)

const StatusBadge = ({ status, difference }) => {
  if (status === 'ok' || Number(difference) === 0) {
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Conciliado</span>
  }
  if (status === 'sin_carga_cocina') {
    return <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">Pendiente de Cocina</span>
  }
  return <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700">{Number(difference || 0) > 0 ? '+' : ''}{difference ?? 'Diferencia'}</span>
}

const RemitoStatusBadge = ({ status }) => {
  if (status === 'ok') return <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Conciliado</span>
  if (status === 'sin_mapeo') return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">Pendiente de clasificación</span>
  return <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700">Diferencia</span>
}

export default function TotalizerPage() {
  const [deliveryDate, setDeliveryDate] = useState(todayISO())
  const [service, setService] = useState('all')
  const [activeTab, setActiveTab] = useState('totalizer')
  const [payload, setPayload] = useState({
    accounts: [],
    concepts: [],
    daily: [],
    appDaily: [],
    values: [],
    reconciliation: [],
    remitos: [],
    unmapped: []
  })
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState('')
  const [reconciliationFilter, setReconciliationFilter] = useState('all')
  const [conceptForm, setConceptForm] = useState({ name: '', code: '', category: 'menu', countsAsMenu: false, sortOrder: 100, active: true })
  const [accountForm, setAccountForm] = useState({ name: '', sortOrder: 999, active: true })
  const [mappingDrafts, setMappingDrafts] = useState({})

  const accounts = useMemo(() => [...(payload.accounts || [])].sort((a, b) => {
    if ((a.source_mode === 'app') !== (b.source_mode === 'app')) return a.source_mode === 'app' ? -1 : 1
    return Number(a.sort_order || 9999) - Number(b.sort_order || 9999) || String(a.name || '').localeCompare(String(b.name || ''))
  }), [payload.accounts])
  const concepts = payload.concepts || []
  const values = payload.values || []

  const loadData = useCallback(async () => {
    setLoading(true)
    const { data, error } = await totalizerService.getDailyPayload({ deliveryDate, service })
    setLoading(false)
    if (error) {
      console.error('[totalizer] load error', error)
      const message = error?.message ? ` ${error.message}` : ''
      notifyError(`No se pudo cargar Totalizadora.${message}`)
      return
    }
    setPayload({
      accounts: data?.accounts || [],
      concepts: data?.concepts || [],
      daily: data?.daily || [],
      appDaily: data?.appDaily || [],
      values: data?.values || [],
      reconciliation: data?.reconciliation || [],
      remitos: data?.remitos || [],
      unmapped: data?.unmapped || []
    })
    if (Array.isArray(data?._warnings) && data._warnings.length > 0) {
      console.warn('[totalizer] partial payload', data)
      notifyError(`Totalizadora cargó parcial: ${data._warnings[0]?.message || 'revisá configuración de vistas.'}`)
    }
  }, [deliveryDate, service])

  useEffect(() => {
    loadData()
  }, [loadData])

  const saveValue = async ({ accountId, conceptId, valueType, quantity }) => {
    const key = `${valueType}:${accountId}:${conceptId}`
    setSavingKey(key)
    const method = valueType === 'kitchen'
      ? totalizerService.saveKitchenValue
      : valueType === 'adjustment'
        ? totalizerService.saveAdjustment
        : totalizerService.saveManualTotalizerValue
    const { error } = await method({ deliveryDate, accountId, service, conceptId, quantity })
    setSavingKey('')
    if (error) {
      notifyError('No se pudo guardar el valor.')
      return
    }
    await loadData()
  }

  const createConcept = async (event) => {
    event.preventDefault()
    const { error } = await totalizerService.createConcept(conceptForm)
    if (error) {
      notifyError('No se pudo guardar el concepto.')
      return
    }
    notifySuccess('Concepto guardado.')
    setConceptForm({ name: '', code: '', category: 'menu', countsAsMenu: false, sortOrder: 100, active: true })
    await loadData()
  }

  const createManualAccount = async (event) => {
    event.preventDefault()
    const { error } = await totalizerService.createManualAccount(accountForm)
    if (error) {
      notifyError('No se pudo agregar la empresa manual.')
      return
    }
    notifySuccess('Empresa manual agregada.')
    setAccountForm({ name: '', sortOrder: 999, active: true })
    await loadData()
  }

  const createMapping = async (unmappedRow) => {
    const draft = mappingDrafts[unmappedKey(unmappedRow)] || {}
    if (!draft.conceptId) {
      notifyError('Seleccioná un concepto.')
      return
    }
    const { error } = await totalizerService.createMapping({
      conceptId: draft.conceptId,
      sourceKind: unmappedRow.source_kind,
      sourceTitle: unmappedRow.source_title,
      sourceValue: unmappedRow.source_value,
      companySlug: draft.companyScoped ? unmappedRow.company_slug : null,
      matchMode: draft.matchMode || 'exact',
      priority: draft.priority || 100
    })
    if (error) {
      notifyError('No se pudo crear el mapeo.')
      return
    }
    notifySuccess('Mapeo creado.')
    await loadData()
  }

  const saveOrderNote = async (remito, orderNoteNumber) => {
    const remitoId = remito.remito_id || remito.company_remito_id || remito.id
    if (!remitoId) return
    const { error } = await totalizerService.saveOrderNote({ remitoId, orderNoteNumber })
    if (error) {
      notifyError('No se pudo guardar la nota de pedido.')
      return
    }
    await loadData()
  }

  const exportExcel = async () => {
    await exportTotalizerWorkbook({
      deliveryDate,
      service,
      accounts,
      concepts,
      totalizerRows: payload.daily || [],
      kitchenRows: payload.reconciliation || [],
      reconciliationRows: payload.reconciliation || [],
      remitoRows: payload.remitos || []
    })
  }

  const reconciliationRows = useMemo(() => {
    const rows = payload.reconciliation || []
    if (reconciliationFilter === 'differences') return rows.filter((row) => row.status !== 'ok' && row.status !== 'sin_carga_cocina')
    if (reconciliationFilter === 'ok') return rows.filter((row) => row.status === 'ok' || Number(row.difference || 0) === 0)
    if (reconciliationFilter === 'pending') return rows.filter((row) => row.status === 'sin_carga_cocina')
    return rows
  }, [payload.reconciliation, reconciliationFilter])

  const reconciliationStats = useMemo(() => {
    const rows = payload.reconciliation || []
    return {
      total: rows.length,
      ok: rows.filter((row) => row.status === 'ok' || Number(row.difference || 0) === 0).length,
      diff: rows.filter((row) => row.status !== 'ok' && row.status !== 'sin_carga_cocina' && Number(row.difference || 0) !== 0).length,
      pending: rows.filter((row) => row.status === 'sin_carga_cocina').length
    }
  }, [payload.reconciliation])

  return (
    <div className="min-h-dvh bg-slate-100 px-4 py-5 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Administración</p>
              <h1 className="mt-1 text-3xl font-bold text-slate-950">Totalizadora y Conciliación</h1>
              <p className="mt-2 text-sm text-slate-600">Consolidación diaria de pedidos, cocina, remitos y notas de pedido.</p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <button type="button" onClick={() => setDeliveryDate(shiftDate(deliveryDate, -1))} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
                <ArrowLeft className="h-4 w-4" /> Día anterior
              </button>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Fecha</span>
                <input type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} className="h-10 rounded-md border border-slate-300 px-3 text-sm font-bold text-slate-800" />
              </label>
              <button type="button" onClick={() => setDeliveryDate(todayISO())} className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-700 px-3 text-sm font-bold text-white hover:bg-blue-800">
                <CalendarDays className="h-4 w-4" /> Hoy
              </button>
              <button type="button" onClick={() => setDeliveryDate(shiftDate(deliveryDate, 1))} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
                Día siguiente <ArrowRight className="h-4 w-4" />
              </button>
              <select value={service} onChange={(event) => setService(event.target.value)} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800">
                {SERVICES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
              <button type="button" onClick={loadData} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
                <RefreshCw className="h-4 w-4" /> Actualizar
              </button>
              <button type="button" onClick={exportExcel} className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-bold text-white hover:bg-emerald-800">
                <Download className="h-4 w-4" /> Exportar Excel
              </button>
            </div>
          </div>
        </header>

        <nav className="flex flex-wrap gap-2 rounded-lg bg-white p-2 shadow-sm ring-1 ring-slate-200">
          {TABS.map((tab) => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`h-10 rounded-md px-4 text-sm font-bold transition ${activeTab === tab.id ? 'bg-blue-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {tab.label}
            </button>
          ))}
        </nav>

        {loading ? (
          <div className="rounded-lg bg-white p-8 text-center font-bold text-slate-600 shadow-sm ring-1 ring-slate-200">Cargando Totalizadora...</div>
        ) : activeTab === 'totalizer' ? (
          <section className="space-y-4">
            {concepts.length === 0 ? (
              <EmptyState title="No hay conceptos configurados" detail="Creá conceptos en Configuración para empezar a clasificar los pedidos." />
            ) : accounts.length === 0 ? (
              <EmptyState title="No hay cuentas configuradas" detail="Las cuentas automáticas y manuales se administran desde la base de Totalizadora." />
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {accounts.map((account) => {
                  const automatic = account.source_mode === 'app'
                  return (
                    <article key={account.id} className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <h2 className="text-lg font-extrabold text-slate-950">{account.name}</h2>
                          <p className="text-xs text-slate-500">{automatic ? 'Valores calculados desde pedidos reales.' : 'Carga manual de Totalizadora.'}</p>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${automatic ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-700'}`}>
                          {automatic ? 'Automático' : 'Manual'}
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                              <th className="py-2 pr-3">Concepto</th>
                              <th className="py-2 pr-3 text-right">Automático</th>
                              <th className="py-2 pr-3 text-right">{automatic ? 'Ajuste' : 'Carga'}</th>
                              <th className="py-2 text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {concepts.map((concept) => {
                              const autoRow = payload.daily.find((row) => row.account_id === account.id && row.concept_id === concept.id)
                              const autoQuantity = readQuantity(autoRow, 0)
                              const manual = getManualValue(values, account.id, concept.id, automatic ? 'adjustment' : 'totalizer')
                              const manualQuantity = manual?.quantity ?? ''
                              const total = automatic ? autoQuantity + Number(manualQuantity || 0) : Number(manualQuantity || 0)
                              return (
                                <tr key={concept.id} className="border-b border-slate-100 last:border-0">
                                  <td className="py-2 pr-3 font-semibold text-slate-700">{concept.name}</td>
                                  <td className="py-2 pr-3 text-right font-bold text-slate-900">{automatic ? autoQuantity : '-'}</td>
                                  <td className="py-2 pr-3 text-right">
                                    <FieldNumber
                                      value={manualQuantity}
                                      placeholder={automatic ? '+/-' : ''}
                                      onBlur={(quantity) => saveValue({ accountId: account.id, conceptId: concept.id, valueType: automatic ? 'adjustment' : 'totalizer', quantity })}
                                      className={savingKey === `${automatic ? 'adjustment' : 'totalizer'}:${account.id}:${concept.id}` ? 'opacity-60' : ''}
                                    />
                                  </td>
                                  <td className="py-2 text-right text-base font-extrabold text-slate-950">{total}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        ) : activeTab === 'kitchen' ? (
          <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-3 pr-3">Empresa</th>
                    <th className="py-3 pr-3">Concepto</th>
                    <th className="py-3 pr-3 text-right">Totalizadora</th>
                    <th className="py-3 text-right">Cocina</th>
                  </tr>
                </thead>
                <tbody>
                  {(payload.reconciliation || []).map((row) => (
                    <tr key={rowKey(row)} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 pr-3 font-bold text-slate-800">{accountName(row)}</td>
                      <td className="py-2 pr-3 text-slate-700">{conceptName(row)}</td>
                      <td className="py-2 pr-3 text-right font-bold">{row.totalizer_quantity ?? row.totalizer_total ?? ''}</td>
                      <td className="py-2 text-right">
                        <div className="inline-flex items-center gap-2">
                          {row.kitchen_quantity === null || row.kitchen_quantity === undefined
                            ? <span className="text-xs font-bold text-amber-600">Sin cargar</span>
                            : <span className="text-xs font-bold text-slate-500">{Number(row.kitchen_quantity) === 0 ? 'Cargado en 0' : 'Cargado'}</span>}
                          <FieldNumber value={row.kitchen_quantity ?? ''} onBlur={(quantity) => saveValue({ accountId: row.account_id, conceptId: row.concept_id, valueType: 'kitchen', quantity })} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : activeTab === 'reconciliation' ? (
          <section className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Total conceptos', reconciliationStats.total],
                ['Conciliados', reconciliationStats.ok],
                ['Con diferencias', reconciliationStats.diff],
                ['Pendientes de Cocina', reconciliationStats.pending]
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
                  <p className="mt-2 text-3xl font-extrabold text-slate-950">{value}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-200">
              <SlidersHorizontal className="h-4 w-4 text-slate-500" />
              {[
                ['all', 'Todos'],
                ['differences', 'Sólo diferencias'],
                ['ok', 'Conciliados'],
                ['pending', 'Pendientes']
              ].map(([id, label]) => (
                <button key={id} type="button" onClick={() => setReconciliationFilter(id)} className={`h-9 rounded-md px-3 text-sm font-bold ${reconciliationFilter === id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{label}</button>
              ))}
            </div>
            <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-3 pr-3">Empresa</th>
                      <th className="py-3 pr-3">Concepto</th>
                      <th className="py-3 pr-3 text-right">Totalizadora</th>
                      <th className="py-3 pr-3 text-right">Cocina</th>
                      <th className="py-3 pr-3 text-right">Diferencia</th>
                      <th className="py-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reconciliationRows.map((row) => (
                      <tr key={rowKey(row)} className="border-b border-slate-100 last:border-0">
                        <td className="py-2 pr-3 font-bold text-slate-800">{accountName(row)}</td>
                        <td className="py-2 pr-3 text-slate-700">{conceptName(row)}</td>
                        <td className="py-2 pr-3 text-right font-bold">{row.totalizer_quantity ?? row.totalizer_total ?? ''}</td>
                        <td className="py-2 pr-3 text-right">{row.kitchen_quantity ?? '-'}</td>
                        <td className="py-2 pr-3 text-right font-extrabold">{row.difference ?? '-'}</td>
                        <td className="py-2"><StatusBadge status={row.status} difference={row.difference} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <h2 className="mb-3 text-lg font-extrabold text-slate-950">Remitos y Notas de Pedido</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-3 pr-3">Fecha</th>
                      <th className="py-3 pr-3">Empresa</th>
                      <th className="py-3 pr-3">Sede</th>
                      <th className="py-3 pr-3">Nº Remito</th>
                      <th className="py-3 pr-3">Nº Nota de Pedido</th>
                      <th className="py-3 pr-3 text-right">Total remito</th>
                      <th className="py-3 pr-3 text-right">Total menú calculado</th>
                      <th className="py-3 pr-3 text-right">Diferencia</th>
                      <th className="py-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(payload.remitos || []).map((row) => (
                      <tr key={row.remito_id || row.id || `${row.company_slug}:${row.remito_number}`} className="border-b border-slate-100 last:border-0">
                        <td className="py-2 pr-3">{row.delivery_date || deliveryDate}</td>
                        <td className="py-2 pr-3 font-bold">{accountName(row)}</td>
                        <td className="py-2 pr-3">{row.location_key || row.location_name || '-'}</td>
                        <td className="py-2 pr-3 font-bold">{row.remito_number || '-'}</td>
                        <td className="py-2 pr-3">
                          <input defaultValue={row.order_note_number || ''} onBlur={(event) => saveOrderNote(row, event.target.value)} className="h-9 w-36 rounded-md border border-slate-300 px-2 text-sm font-semibold" />
                        </td>
                        <td className="py-2 pr-3 text-right">{row.remito_total ?? '-'}</td>
                        <td className="py-2 pr-3 text-right">{row.calculated_menu_total ?? row.menu_total ?? '-'}</td>
                        <td className="py-2 pr-3 text-right font-bold">{row.difference ?? '-'}</td>
                        <td className="py-2"><RemitoStatusBadge status={row.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : (
          <section className="grid gap-4 xl:grid-cols-[420px_1fr]">
            <div className="space-y-4">
              <form onSubmit={createManualAccount} className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold text-slate-950"><Plus className="h-5 w-5" /> Agregar empresa manual</h2>
                <div className="space-y-3">
                  <input required value={accountForm.name} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} placeholder="Nombre" className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" />
                  <input value={accountForm.sortOrder} onChange={(event) => setAccountForm({ ...accountForm, sortOrder: event.target.value })} type="number" placeholder="Orden de visualización" className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" />
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={accountForm.active} onChange={(event) => setAccountForm({ ...accountForm, active: event.target.checked })} /> Activa</label>
                  <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-700 px-3 text-sm font-bold text-white hover:bg-blue-800"><Save className="h-4 w-4" /> Guardar empresa</button>
                </div>
              </form>
              <form onSubmit={createConcept} className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold text-slate-950"><Settings className="h-5 w-5" /> Conceptos</h2>
                <div className="space-y-3">
                  <input required value={conceptForm.name} onChange={(event) => setConceptForm({ ...conceptForm, name: event.target.value })} placeholder="Nombre" className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" />
                  <input required value={conceptForm.code} onChange={(event) => setConceptForm({ ...conceptForm, code: event.target.value })} placeholder="Código" className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" />
                  <select value={conceptForm.category} onChange={(event) => setConceptForm({ ...conceptForm, category: event.target.value })} className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm">
                    {Object.entries(CATEGORY_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                  <input value={conceptForm.sortOrder} onChange={(event) => setConceptForm({ ...conceptForm, sortOrder: event.target.value })} type="number" placeholder="Orden" className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" />
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={conceptForm.countsAsMenu} onChange={(event) => setConceptForm({ ...conceptForm, countsAsMenu: event.target.checked })} /> Cuenta como menú</label>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={conceptForm.active} onChange={(event) => setConceptForm({ ...conceptForm, active: event.target.checked })} /> Activo</label>
                  <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-700 px-3 text-sm font-bold text-white hover:bg-blue-800"><Save className="h-4 w-4" /> Guardar concepto</button>
                </div>
              </form>
            </div>
            <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <h2 className="mb-3 text-lg font-extrabold text-slate-950">Mapeo de pedidos</h2>
              {(payload.unmapped || []).length === 0 ? (
                <EmptyState title="No hay valores pendientes de mapeo" detail="Los totales se actualizarán automáticamente cuando existan conceptos y mappings." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="py-3 pr-3">Origen</th>
                        <th className="py-3 pr-3">Valor</th>
                        <th className="py-3 pr-3">Empresa</th>
                        <th className="py-3 pr-3 text-right">Apariciones</th>
                        <th className="py-3">Asignar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.unmapped.map((row) => {
                        const key = unmappedKey(row)
                        const draft = mappingDrafts[key] || {}
                        return (
                          <tr key={key} className="border-b border-slate-100 last:border-0">
                            <td className="py-2 pr-3 font-bold">{row.source_kind} · {row.source_title || '-'}</td>
                            <td className="py-2 pr-3">{row.source_value || '-'}</td>
                            <td className="py-2 pr-3">{row.company_slug || 'Todas'}</td>
                            <td className="py-2 pr-3 text-right font-bold">{row.appearances}</td>
                            <td className="py-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <select value={draft.conceptId || ''} onChange={(event) => setMappingDrafts({ ...mappingDrafts, [key]: { ...draft, conceptId: event.target.value } })} className="h-9 rounded-md border border-slate-300 px-2 text-sm">
                                  <option value="">Concepto</option>
                                  {concepts.map((concept) => <option key={concept.id} value={concept.id}>{concept.name}</option>)}
                                </select>
                                <select value={draft.matchMode || 'exact'} onChange={(event) => setMappingDrafts({ ...mappingDrafts, [key]: { ...draft, matchMode: event.target.value } })} className="h-9 rounded-md border border-slate-300 px-2 text-sm">
                                  <option value="exact">Exacto</option>
                                  <option value="contains">Contiene</option>
                                </select>
                                <label className="flex items-center gap-1 text-xs font-semibold text-slate-600"><input type="checkbox" checked={!!draft.companyScoped} onChange={(event) => setMappingDrafts({ ...mappingDrafts, [key]: { ...draft, companyScoped: event.target.checked } })} /> Sólo empresa</label>
                                <button type="button" onClick={() => createMapping(row)} className="h-9 rounded-md bg-slate-900 px-3 text-xs font-bold text-white hover:bg-slate-800">Asignar</button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

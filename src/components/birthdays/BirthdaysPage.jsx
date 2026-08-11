import { useEffect, useMemo, useState } from 'react'
import { CakeSlice, CalendarDays, CheckCircle2, Edit3, Plus, Search, XCircle } from 'lucide-react'
import { useAuthContext } from '../../contexts/authContextValue'
import { birthdaysService } from '../../services/birthdays'
import { ALL_COMPANY_LIST } from '../../constants/companyConfig'
import {
  BIRTHDAY_STATUS_LABELS,
  BIRTHDAY_STATUS_VALUES,
  canOperateBirthdayOrder,
  filterBirthdays,
  findBirthdayDuplicate,
  summarizeBirthdayOrders,
  validateBirthdayForm
} from '../../utils/birthdays/birthdayUtils'
import LoadingState from '../ui/LoadingState'
import { getUserFriendlyErrorMessage } from '../../utils'

const MONTH_OPTIONS = [
  ['1', 'Enero'],
  ['2', 'Febrero'],
  ['3', 'Marzo'],
  ['4', 'Abril'],
  ['5', 'Mayo'],
  ['6', 'Junio'],
  ['7', 'Julio'],
  ['8', 'Agosto'],
  ['9', 'Septiembre'],
  ['10', 'Octubre'],
  ['11', 'Noviembre'],
  ['12', 'Diciembre']
]

const blankForm = {
  person_name: '',
  birth_day: '',
  birth_month: '',
  birth_year: '',
  company_slug: '',
  delivery_location: '',
  cake_quantity: 1,
  comment: '',
  is_active: true
}

const getCompanyOptions = ({ isAdmin, isCompanyAdmin, isHumanResources, adminCompanies, humanResourcesCompanies }) => {
  if (isAdmin) return ALL_COMPANY_LIST.filter((company) => company.slug !== 'global')
  if (isCompanyAdmin) return adminCompanies || []
  if (isHumanResources) return humanResourcesCompanies || []
  return []
}

const getCompanyLocations = (companies = []) => Object.fromEntries(
  companies.map((company) => {
    const catalogCompany = ALL_COMPANY_LIST.find((item) => item.slug === company.slug)
    return [company.slug, catalogCompany?.locations || [company.name].filter(Boolean)]
  })
)

const formatDate = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('es-AR') : '-'

const SummaryCard = ({ label, value }) => (
  <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
    <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
    <p className="mt-2 text-2xl font-black text-slate-900">{value}</p>
  </div>
)

const BirthdaysPage = () => {
  const {
    isAdmin,
    isCompanyAdmin,
    isHumanResources,
    adminCompanies,
    humanResourcesCompanies
  } = useAuthContext()
  const [activeTab, setActiveTab] = useState('people')
  const [birthdays, setBirthdays] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingBirthday, setEditingBirthday] = useState(null)
  const [form, setForm] = useState(blankForm)
  const [formErrors, setFormErrors] = useState({})
  const [duplicateWarning, setDuplicateWarning] = useState('')
  const [filters, setFilters] = useState({
    search: '',
    company: 'all',
    location: 'all',
    month: 'all',
    status: 'active'
  })
  const [orderFilters, setOrderFilters] = useState({
    company: 'all',
    location: 'all',
    status: 'all'
  })
  const [reschedule, setReschedule] = useState({ orderId: '', date: '', reason: '' })

  const companyOptions = useMemo(() => getCompanyOptions({
    isAdmin,
    isCompanyAdmin,
    isHumanResources,
    adminCompanies,
    humanResourcesCompanies
  }), [adminCompanies, humanResourcesCompanies, isAdmin, isCompanyAdmin, isHumanResources])

  const companyLocations = useMemo(() => getCompanyLocations(companyOptions), [companyOptions])
  const canOperate = canOperateBirthdayOrder({ isAdmin, isCompanyAdmin })

  const locationOptions = useMemo(() => {
    const selectedCompany = activeTab === 'people' ? filters.company : orderFilters.company
    if (selectedCompany !== 'all') return companyLocations[selectedCompany] || []
    return [...new Set(Object.values(companyLocations).flat())]
  }, [activeTab, companyLocations, filters.company, orderFilters.company])

  const loadData = async () => {
    setLoading(true)
    setError('')
    const [birthdaysResult, ordersResult] = await Promise.all([
      birthdaysService.getBirthdays({ force: true }),
      birthdaysService.getCakeOrders({ force: true })
    ])
    if (birthdaysResult.error || ordersResult.error) {
      setError(getUserFriendlyErrorMessage(birthdaysResult.error || ordersResult.error, 'No pudimos cargar cumpleaños.'))
    }
    setBirthdays(birthdaysResult.data || [])
    setOrders(ordersResult.data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const visibleBirthdays = useMemo(() => filterBirthdays(birthdays, filters), [birthdays, filters])
  const visibleOrders = useMemo(() => orders.filter((order) => {
    if (orderFilters.company !== 'all' && order.company_slug !== orderFilters.company) return false
    if (orderFilters.location !== 'all' && order.delivery_location !== orderFilters.location) return false
    if (orderFilters.status !== 'all' && order.status !== orderFilters.status) return false
    return true
  }), [orders, orderFilters])
  const summary = useMemo(() => summarizeBirthdayOrders(visibleOrders), [visibleOrders])

  const openCreateForm = () => {
    const firstCompany = companyOptions[0]
    setEditingBirthday(null)
    setForm({
      ...blankForm,
      company_slug: firstCompany?.slug || '',
      delivery_location: getCompanyLocations(companyOptions)[firstCompany?.slug]?.[0] || '',
      cake_quantity: 1
    })
    setFormErrors({})
    setDuplicateWarning('')
    setFormOpen(true)
  }

  const openEditForm = (birthday) => {
    setEditingBirthday(birthday)
    setForm({
      person_name: birthday.person_name || '',
      birth_day: birthday.birth_day || '',
      birth_month: birthday.birth_month || '',
      birth_year: birthday.birth_year || '',
      company_slug: birthday.company_slug || '',
      delivery_location: birthday.delivery_location || '',
      cake_quantity: birthday.cake_quantity || 1,
      comment: birthday.comment || '',
      is_active: birthday.is_active
    })
    setFormErrors({})
    setDuplicateWarning('')
    setFormOpen(true)
  }

  const updateForm = (key, value) => {
    setForm((current) => {
      const next = { ...current, [key]: value }
      if (key === 'company_slug') {
        next.delivery_location = companyLocations[value]?.[0] || ''
      }
      return next
    })
  }

  const submitForm = async (event) => {
    event.preventDefault()
    const company = companyOptions.find((item) => item.slug === form.company_slug)
    const validation = validateBirthdayForm({
      ...form,
      company_name: company?.name || form.company_slug
    }, { allowedCompanies: companyOptions, companyLocations })

    setFormErrors(validation.errors)
    if (!validation.valid) return

    const duplicate = findBirthdayDuplicate({ ...validation.birthday, id: editingBirthday?.id }, birthdays)
    if (duplicate && !duplicateWarning) {
      setDuplicateWarning(`Ya existe un cumpleaños activo similar para ${duplicate.person_name}. Volvé a guardar para confirmar.`)
      return
    }

    setSaving(true)
    const payload = {
      ...validation.birthday,
      company_name: company?.name || validation.birthday.company_slug
    }
    const result = editingBirthday
      ? await birthdaysService.updateBirthday(editingBirthday.id, payload)
      : await birthdaysService.createBirthday(payload)
    setSaving(false)

    if (result.error) {
      setError(getUserFriendlyErrorMessage(result.error, 'No pudimos guardar el cumpleaños.'))
      return
    }

    setFormOpen(false)
    await loadData()
  }

  const deactivateBirthday = async (birthday) => {
    setSaving(true)
    const result = await birthdaysService.deactivateBirthday(birthday.id)
    setSaving(false)
    if (result.error) {
      setError(getUserFriendlyErrorMessage(result.error, 'No pudimos desactivar el cumpleaños.'))
      return
    }
    await loadData()
  }

  const transitionOrder = async (order, status) => {
    setSaving(true)
    const result = await birthdaysService.transitionCakeOrder({ orderId: order.id, status })
    setSaving(false)
    if (result.error) {
      setError(getUserFriendlyErrorMessage(result.error, 'No pudimos actualizar el pedido de tortita.'))
      return
    }
    await loadData()
  }

  const submitReschedule = async (event) => {
    event.preventDefault()
    if (!reschedule.orderId || !reschedule.date || !reschedule.reason.trim()) {
      setError('Para reprogramar necesitás fecha y motivo.')
      return
    }
    const order = orders.find((item) => item.id === reschedule.orderId)
    setSaving(true)
    const result = await birthdaysService.transitionCakeOrder({
      orderId: reschedule.orderId,
      status: order?.status || 'pending',
      plannedDeliveryDate: reschedule.date,
      reason: reschedule.reason
    })
    setSaving(false)
    if (result.error) {
      setError(getUserFriendlyErrorMessage(result.error, 'No pudimos reprogramar la entrega.'))
      return
    }
    setReschedule({ orderId: '', date: '', reason: '' })
    await loadData()
  }

  if (loading) {
    return <div className="py-8"><LoadingState message="Cargando cumpleaños..." /></div>
  }

  return (
    <div className="space-y-6 p-3 sm:p-6">
      <header className="rounded-lg border border-white/20 bg-white/95 p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Módulo independiente</p>
            <h1 className="mt-1 text-2xl sm:text-3xl font-black text-slate-900">Cumpleaños</h1>
            <p className="mt-1 text-sm font-semibold text-slate-600">Gestión de cumpleaños del personal y pedidos de tortitas.</p>
          </div>
          <button type="button" onClick={openCreateForm} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white">
            <Plus className="h-4 w-4" />
            Agregar cumpleaños
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <SummaryCard label="Tortitas de hoy" value={summary.today} />
        <SummaryCard label="Próximas" value={summary.upcoming} />
        <SummaryCard label="Pendientes" value={summary.pending} />
        <SummaryCard label="Preparadas" value={summary.prepared} />
        <SummaryCard label="Entregadas" value={summary.delivered} />
        <SummaryCard label="Canceladas" value={summary.cancelled} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex border-b border-slate-200">
          <button type="button" onClick={() => setActiveTab('people')} className={`flex-1 px-4 py-3 text-sm font-black ${activeTab === 'people' ? 'bg-slate-900 text-white' : 'text-slate-700'}`}>
            Cumpleaños del personal
          </button>
          <button type="button" onClick={() => setActiveTab('orders')} className={`flex-1 px-4 py-3 text-sm font-black ${activeTab === 'orders' ? 'bg-slate-900 text-white' : 'text-slate-700'}`}>
            Pedidos de tortitas
          </button>
        </div>

        {activeTab === 'people' ? (
          <section className="space-y-4 p-4">
            <div className="grid gap-3 md:grid-cols-5">
              <label className="text-xs font-bold text-slate-600">
                Buscar
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm font-semibold" />
                </div>
              </label>
              <FilterSelect label="Empresa" value={filters.company} onChange={(value) => setFilters({ ...filters, company: value, location: 'all' })} options={[['all', 'Todas'], ...companyOptions.map((company) => [company.slug, company.name])]} />
              <FilterSelect label="Ubicación" value={filters.location} onChange={(value) => setFilters({ ...filters, location: value })} options={[['all', 'Todas'], ...locationOptions.map((item) => [item, item])]} />
              <FilterSelect label="Mes" value={filters.month} onChange={(value) => setFilters({ ...filters, month: value })} options={[['all', 'Todos'], ...MONTH_OPTIONS]} />
              <FilterSelect label="Estado" value={filters.status} onChange={(value) => setFilters({ ...filters, status: value })} options={[['all', 'Todos'], ['active', 'Activo'], ['inactive', 'Inactivo']]} />
            </div>

            {visibleBirthdays.length === 0 ? (
              <EmptyState text="No hay cumpleaños para los filtros seleccionados." />
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {visibleBirthdays.map((birthday) => (
                  <article key={birthday.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-lg font-black text-slate-900">{birthday.person_name}</h3>
                        <p className="text-sm font-semibold text-slate-600">{String(birthday.birth_day).padStart(2, '0')}/{String(birthday.birth_month).padStart(2, '0')} · {birthday.company_name}</p>
                        <p className="text-xs font-semibold text-slate-500">{birthday.delivery_location} · {birthday.cake_quantity} tortita{Number(birthday.cake_quantity) === 1 ? '' : 's'}</p>
                        <p className="mt-2 text-xs text-slate-500">Cargado: {new Date(birthday.created_at).toLocaleString('es-AR')}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-black ${birthday.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {birthday.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                    {birthday.comment && <p className="mt-3 text-sm font-semibold text-slate-700">{birthday.comment}</p>}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" onClick={() => openEditForm(birthday)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700">
                        <Edit3 className="h-4 w-4" /> Editar
                      </button>
                      {birthday.is_active && (
                        <button type="button" disabled={saving} onClick={() => deactivateBirthday(birthday)} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-700">
                          <XCircle className="h-4 w-4" /> Desactivar
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="space-y-4 p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <FilterSelect label="Empresa" value={orderFilters.company} onChange={(value) => setOrderFilters({ ...orderFilters, company: value, location: 'all' })} options={[['all', 'Todas'], ...companyOptions.map((company) => [company.slug, company.name])]} />
              <FilterSelect label="Ubicación" value={orderFilters.location} onChange={(value) => setOrderFilters({ ...orderFilters, location: value })} options={[['all', 'Todas'], ...locationOptions.map((item) => [item, item])]} />
              <FilterSelect label="Estado" value={orderFilters.status} onChange={(value) => setOrderFilters({ ...orderFilters, status: value })} options={[['all', 'Todos'], ...BIRTHDAY_STATUS_VALUES.map((status) => [status, BIRTHDAY_STATUS_LABELS[status]])]} />
            </div>

            {visibleOrders.length === 0 ? (
              <EmptyState text="No hay pedidos de tortitas para los filtros seleccionados." />
            ) : (
              <div className="space-y-3">
                {visibleOrders.map((order) => (
                  <article key={order.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr_auto] lg:items-center">
                      <div>
                        <h3 className="text-lg font-black text-slate-900">{order.person_name}</h3>
                        <p className="text-sm font-semibold text-slate-600">{order.company_name} · {order.delivery_location}</p>
                        <p className="text-xs font-semibold text-slate-500">Entrega: {formatDate(order.planned_delivery_date)} · Año {order.birthday_year}</p>
                      </div>
                      <div>
                        <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-black text-blue-700">{BIRTHDAY_STATUS_LABELS[order.status] || order.status}</span>
                        <p className="mt-2 text-sm font-black text-slate-900">{order.cake_quantity} tortita{Number(order.cake_quantity) === 1 ? '' : 's'}</p>
                      </div>
                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        {order.status !== 'cancelled' && (
                          <button type="button" disabled={saving} onClick={() => transitionOrder(order, 'cancelled')} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-700">Cancelar</button>
                        )}
                        {canOperate && order.status !== 'prepared' && order.status !== 'delivered' && order.status !== 'cancelled' && (
                          <button type="button" disabled={saving} onClick={() => transitionOrder(order, 'prepared')} className="inline-flex items-center gap-2 rounded-lg border border-amber-200 px-3 py-2 text-sm font-bold text-amber-700">
                            <CalendarDays className="h-4 w-4" /> Preparado
                          </button>
                        )}
                        {canOperate && order.status !== 'delivered' && order.status !== 'cancelled' && (
                          <button type="button" disabled={saving} onClick={() => transitionOrder(order, 'delivered')} className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 px-3 py-2 text-sm font-bold text-emerald-700">
                            <CheckCircle2 className="h-4 w-4" /> Entregado
                          </button>
                        )}
                        {canOperate && (
                          <button type="button" onClick={() => setReschedule({ orderId: order.id, date: order.planned_delivery_date, reason: '' })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700">Reprogramar</button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <form onSubmit={submitForm} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-black text-slate-900">{editingBirthday ? 'Editar cumpleaños' : 'Agregar cumpleaños'}</h2>
              <button type="button" onClick={() => setFormOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            {duplicateWarning && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">{duplicateWarning}</p>}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <TextField label="Nombre y apellido" value={form.person_name} error={formErrors.person_name} onChange={(value) => updateForm('person_name', value)} />
              <NumberField label="Cantidad de tortitas" min="1" value={form.cake_quantity} error={formErrors.cake_quantity} onChange={(value) => updateForm('cake_quantity', value)} />
              <NumberField label="Día" min="1" max="31" value={form.birth_day} error={formErrors.birth_date} onChange={(value) => updateForm('birth_day', value)} />
              <FilterSelect label="Mes" value={String(form.birth_month)} onChange={(value) => updateForm('birth_month', value)} options={[['', 'Seleccionar'], ...MONTH_OPTIONS]} error={formErrors.birth_date} />
              <NumberField label="Año de nacimiento (opcional)" min="1900" max="2200" value={form.birth_year} error={formErrors.birth_year} onChange={(value) => updateForm('birth_year', value)} />
              <FilterSelect label="Empresa" value={form.company_slug} onChange={(value) => updateForm('company_slug', value)} options={[['', 'Seleccionar'], ...companyOptions.map((company) => [company.slug, company.name])]} error={formErrors.company_slug} />
              <FilterSelect label="Ubicación de entrega" value={form.delivery_location} onChange={(value) => updateForm('delivery_location', value)} options={[['', 'Seleccionar'], ...(companyLocations[form.company_slug] || []).map((item) => [item, item])]} error={formErrors.delivery_location} />
              <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <input type="checkbox" checked={Boolean(form.is_active)} onChange={(event) => updateForm('is_active', event.target.checked)} />
                Activo
              </label>
              <label className="sm:col-span-2 text-xs font-bold text-slate-600">
                Comentario
                <textarea value={form.comment} onChange={(event) => updateForm('comment', event.target.value)} className="mt-1 min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setFormOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">Cancelar</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white">{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </form>
        </div>
      )}

      {reschedule.orderId && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <form onSubmit={submitReschedule} className="w-full max-w-md rounded-lg bg-white p-5 shadow-2xl">
            <h2 className="text-xl font-black text-slate-900">Reprogramar entrega</h2>
            <label className="mt-4 block text-xs font-bold text-slate-600">
              Nueva fecha
              <input type="date" value={reschedule.date} onChange={(event) => setReschedule({ ...reschedule, date: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" />
            </label>
            <label className="mt-4 block text-xs font-bold text-slate-600">
              Motivo
              <textarea value={reschedule.reason} onChange={(event) => setReschedule({ ...reschedule, reason: event.target.value })} className="mt-1 min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setReschedule({ orderId: '', date: '', reason: '' })} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">Cancelar</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white">Guardar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

const EmptyState = ({ text }) => (
  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
    <CakeSlice className="mx-auto h-8 w-8 text-slate-400" />
    <p className="mt-3 text-sm font-bold text-slate-600">{text}</p>
  </div>
)

const FilterSelect = ({ label, value, onChange, options, error }) => (
  <label className="text-xs font-bold text-slate-600">
    {label}
    <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">
      {options.map(([optionValue, optionLabel]) => (
        <option key={optionValue} value={optionValue}>{optionLabel}</option>
      ))}
    </select>
    {error && <span className="mt-1 block text-xs font-bold text-red-700">{error}</span>}
  </label>
)

const TextField = ({ label, value, onChange, error }) => (
  <label className="text-xs font-bold text-slate-600">
    {label}
    <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" />
    {error && <span className="mt-1 block text-xs font-bold text-red-700">{error}</span>}
  </label>
)

const NumberField = ({ label, value, onChange, error, min, max }) => (
  <label className="text-xs font-bold text-slate-600">
    {label}
    <input type="number" min={min} max={max} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" />
    {error && <span className="mt-1 block text-xs font-bold text-red-700">{error}</span>}
  </label>
)

export default BirthdaysPage

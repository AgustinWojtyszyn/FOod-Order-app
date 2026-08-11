import { useEffect, useMemo, useState } from 'react'
import { CakeSlice, CalendarDays, CheckCircle2, Edit3, Plus, Search, SlidersHorizontal, XCircle } from 'lucide-react'
import { useAuthContext } from '../../contexts/authContextValue'
import { birthdaysService } from '../../services/birthdays'
import { ALL_COMPANY_LIST } from '../../constants/companyConfig'
import {
  BIRTHDAY_STATUS_LABELS,
  BIRTHDAY_STATUS_VALUES,
  canOperateBirthdayOrder,
  filterBirthdays,
  findBirthdayDuplicate,
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

const formatDate = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : '-'

const getOccurrenceDate = (day, month, today = new Date()) => {
  const year = today.getFullYear()
  const maxDay = new Date(year, Number(month), 0).getDate()
  const currentYearDate = new Date(year, Number(month) - 1, Math.min(Number(day), maxDay))
  currentYearDate.setHours(0, 0, 0, 0)
  const todayStart = new Date(today)
  todayStart.setHours(0, 0, 0, 0)
  if (currentYearDate >= todayStart) return currentYearDate
  const nextYear = year + 1
  const nextMaxDay = new Date(nextYear, Number(month), 0).getDate()
  return new Date(nextYear, Number(month) - 1, Math.min(Number(day), nextMaxDay))
}

const getDaysUntilBirthday = (birthday, today = new Date()) => {
  const target = getOccurrenceDate(birthday.birth_day, birthday.birth_month, today)
  const start = new Date(today)
  start.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - start.getTime()) / 86400000)
}

const getCountdownLabel = (days) => {
  if (days === 0) return 'Hoy'
  if (days === 1) return 'Mañana'
  if (days === 2) return 'Falta 1 día'
  return `Faltan ${Math.max(0, days - 1)} días`
}

const formatActor = (id) => id ? `Usuario ${String(id).slice(0, 8)}` : 'Sin dato'

const SummaryCard = ({ label, value, tone = 'blue' }) => (
  <div className={`rounded-lg border bg-white px-4 py-3 shadow-sm ${tone === 'orange' ? 'border-orange-200' : tone === 'amber' ? 'border-amber-200' : 'border-blue-100'}`}>
    <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</p>
    <p className={`mt-1 text-2xl font-black ${tone === 'orange' ? 'text-orange-700' : tone === 'amber' ? 'text-amber-700' : 'text-blue-700'}`}>{value}</p>
  </div>
)

const getStatusClass = (status, active = true) => {
  if (!active) return 'bg-slate-100 text-slate-600 border-slate-200'
  if (status === 'pending') return 'bg-orange-50 text-orange-700 border-orange-200'
  if (status === 'prepared') return 'bg-amber-50 text-amber-700 border-amber-200'
  if (status === 'delivered') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (status === 'cancelled') return 'bg-red-50 text-red-700 border-red-200'
  return 'bg-blue-50 text-blue-700 border-blue-200'
}

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

  const visibleBirthdays = useMemo(() => filterBirthdays(birthdays, filters)
    .map((birthday) => ({ ...birthday, daysUntil: getDaysUntilBirthday(birthday) }))
    .sort((a, b) => a.daysUntil - b.daysUntil || String(a.person_name || '').localeCompare(String(b.person_name || ''), 'es')), [birthdays, filters])
  const visibleOrders = useMemo(() => orders.filter((order) => {
    if (orderFilters.company !== 'all' && order.company_slug !== orderFilters.company) return false
    if (orderFilters.location !== 'all' && order.delivery_location !== orderFilters.location) return false
    if (orderFilters.status !== 'all' && order.status !== orderFilters.status) return false
    return true
  }), [orders, orderFilters])
  const birthdaySummary = useMemo(() => {
    const activeBirthdays = birthdays.filter((birthday) => birthday.is_active)
    return {
      today: activeBirthdays.filter((birthday) => getDaysUntilBirthday(birthday) === 0).length,
      next30: activeBirthdays.filter((birthday) => {
        const days = getDaysUntilBirthday(birthday)
        return days >= 0 && days <= 30
      }).length,
      pendingDelivery: orders
        .filter((order) => order.status === 'pending')
        .reduce((total, order) => total + Number(order.cake_quantity || 0), 0)
    }
  }, [birthdays, orders])

  const hasPeopleFilters = filters.search || filters.company !== 'all' || filters.location !== 'all' || filters.month !== 'all' || filters.status !== 'active'
  const hasOrderFilters = orderFilters.company !== 'all' || orderFilters.location !== 'all' || orderFilters.status !== 'all'

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
    <div className="min-w-0 space-y-4 p-3 sm:p-5">
      <header className="rounded-lg border border-blue-100 bg-white/95 p-4 shadow-lg shadow-blue-950/10 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-slate-900 sm:text-3xl">Cumpleaños del personal</h1>
            <p className="mt-1 text-sm font-semibold text-slate-600">Gestioná los cumpleaños y las entregas de tortitas</p>
          </div>
          <button type="button" onClick={openCreateForm} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-orange-700 sm:w-auto">
            <Plus className="h-4 w-4" />
            Registrar cumpleaños
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Cumpleaños de hoy" value={birthdaySummary.today} tone="orange" />
        <SummaryCard label="Próximos 30 días" value={birthdaySummary.next30} />
        <SummaryCard label="Pendientes de entrega" value={birthdaySummary.pendingDelivery} tone="amber" />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-2">
          <div className="grid rounded-lg bg-slate-100 p-1 sm:inline-grid sm:grid-cols-2">
            <button type="button" onClick={() => setActiveTab('people')} className={`rounded-md px-3 py-2 text-sm font-black transition ${activeTab === 'people' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
              Cumpleaños del personal
            </button>
            <button type="button" onClick={() => setActiveTab('orders')} className={`rounded-md px-3 py-2 text-sm font-black transition ${activeTab === 'orders' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
              Pedidos de tortitas
            </button>
          </div>
        </div>

        {activeTab === 'people' ? (
          <section className="space-y-3 p-3 sm:p-4">
            <div className="grid gap-2 md:grid-cols-[minmax(180px,1.4fr)_repeat(4,minmax(120px,1fr))_auto] md:items-end">
              <label className="min-w-0 text-xs font-bold text-slate-600">
                Buscar
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input placeholder="Buscar por nombre" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm font-semibold outline-none focus:border-blue-500" />
                </div>
              </label>
              <FilterSelect label="Empresa" value={filters.company} onChange={(value) => setFilters({ ...filters, company: value, location: 'all' })} options={[['all', 'Todas'], ...companyOptions.map((company) => [company.slug, company.name])]} />
              <FilterSelect label="Ubicación" value={filters.location} onChange={(value) => setFilters({ ...filters, location: value })} options={[['all', 'Todas'], ...locationOptions.map((item) => [item, item])]} />
              <FilterSelect label="Mes" value={filters.month} onChange={(value) => setFilters({ ...filters, month: value })} options={[['all', 'Todos'], ...MONTH_OPTIONS]} />
              <FilterSelect label="Estado" value={filters.status} onChange={(value) => setFilters({ ...filters, status: value })} options={[['all', 'Todos'], ['active', 'Activo'], ['inactive', 'Inactivo']]} />
              {hasPeopleFilters && (
                <button type="button" onClick={() => setFilters({ search: '', company: 'all', location: 'all', month: 'all', status: 'active' })} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 text-xs font-black text-slate-700 hover:bg-slate-50">
                  <SlidersHorizontal className="h-4 w-4" />
                  Limpiar filtros
                </button>
              )}
            </div>

            {visibleBirthdays.length === 0 ? (
              <EmptyState
                text={hasPeopleFilters ? 'No hay cumpleaños para esos filtros.' : 'Todavía no hay cumpleaños cargados.'}
                action={hasPeopleFilters ? 'Limpiar filtros' : ''}
                onAction={hasPeopleFilters ? () => setFilters({ search: '', company: 'all', location: 'all', month: 'all', status: 'active' }) : null}
              />
            ) : (
              <div className="grid gap-3 xl:grid-cols-2">
                {visibleBirthdays.map((birthday) => (
                  <article key={birthday.id} className="min-w-0 rounded-lg border border-blue-100 bg-white p-3 shadow-sm shadow-blue-950/5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="min-w-0 truncate text-lg font-black text-slate-900">{birthday.person_name}</h3>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-black ${getStatusClass(null, birthday.is_active)}`}>
                            {birthday.is_active ? 'Activo' : 'Inactivo'}
                          </span>
                        </div>
                        <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                          <InfoLine label="Fecha" value={`${String(birthday.birth_day).padStart(2, '0')}/${String(birthday.birth_month).padStart(2, '0')}`} />
                          <InfoLine label="Cuenta regresiva" value={getCountdownLabel(birthday.daysUntil)} accent />
                          <InfoLine label="Empresa" value={birthday.company_name} />
                          <InfoLine label="Ubicación" value={birthday.delivery_location} />
                          <InfoLine label="Tortitas" value={`${birthday.cake_quantity} tortita${Number(birthday.cake_quantity) === 1 ? '' : 's'}`} />
                          <InfoLine label="Cargó" value={`${formatActor(birthday.created_by)} · ${new Date(birthday.created_at).toLocaleDateString('es-AR')}`} />
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                        <button type="button" onClick={() => openEditForm(birthday)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-blue-200 px-3 text-sm font-bold text-blue-700 hover:bg-blue-50">
                          <Edit3 className="h-4 w-4" /> Editar
                        </button>
                        {birthday.is_active && (
                          <button type="button" disabled={saving} onClick={() => deactivateBirthday(birthday)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-200 px-3 text-sm font-bold text-red-700 hover:bg-red-50">
                            <XCircle className="h-4 w-4" /> Desactivar
                          </button>
                        )}
                      </div>
                    </div>
                    {birthday.comment && <p className="mt-3 rounded-lg bg-orange-50 px-3 py-2 text-sm font-semibold text-slate-700">{birthday.comment}</p>}
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="space-y-3 p-3 sm:p-4">
            <div className="grid gap-2 md:grid-cols-[repeat(3,minmax(140px,1fr))_auto] md:items-end">
              <FilterSelect label="Empresa" value={orderFilters.company} onChange={(value) => setOrderFilters({ ...orderFilters, company: value, location: 'all' })} options={[['all', 'Todas'], ...companyOptions.map((company) => [company.slug, company.name])]} />
              <FilterSelect label="Ubicación" value={orderFilters.location} onChange={(value) => setOrderFilters({ ...orderFilters, location: value })} options={[['all', 'Todas'], ...locationOptions.map((item) => [item, item])]} />
              <FilterSelect label="Estado" value={orderFilters.status} onChange={(value) => setOrderFilters({ ...orderFilters, status: value })} options={[['all', 'Todos'], ...BIRTHDAY_STATUS_VALUES.map((status) => [status, BIRTHDAY_STATUS_LABELS[status]])]} />
              {hasOrderFilters && (
                <button type="button" onClick={() => setOrderFilters({ company: 'all', location: 'all', status: 'all' })} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 text-xs font-black text-slate-700 hover:bg-slate-50">
                  <SlidersHorizontal className="h-4 w-4" />
                  Limpiar filtros
                </button>
              )}
            </div>

            {visibleOrders.length === 0 ? (
              <EmptyState
                text={hasOrderFilters ? 'No hay pedidos de tortitas para esos filtros.' : 'Todavía no hay pedidos de tortitas.'}
                action={hasOrderFilters ? 'Limpiar filtros' : ''}
                onAction={hasOrderFilters ? () => setOrderFilters({ company: 'all', location: 'all', status: 'all' }) : null}
              />
            ) : (
              <div className="grid gap-3 xl:grid-cols-2">
                {visibleOrders.map((order) => (
                  <article key={order.id} className="min-w-0 rounded-lg border border-blue-100 bg-white p-3 shadow-sm shadow-blue-950/5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="min-w-0 truncate text-lg font-black text-slate-900">{order.person_name}</h3>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-black ${getStatusClass(order.status)}`}>{BIRTHDAY_STATUS_LABELS[order.status] || order.status}</span>
                        </div>
                        <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                          <InfoLine label="Entrega" value={formatDate(order.planned_delivery_date)} />
                          <InfoLine label="Año" value={order.birthday_year} />
                          <InfoLine label="Empresa" value={order.company_name} />
                          <InfoLine label="Ubicación" value={order.delivery_location} />
                          <InfoLine label="Tortitas" value={`${order.cake_quantity} tortita${Number(order.cake_quantity) === 1 ? '' : 's'}`} />
                          <InfoLine label="Cargó" value={`${formatActor(order.created_by)} · ${new Date(order.created_at).toLocaleDateString('es-AR')}`} />
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2 lg:max-w-[260px] lg:justify-end">
                        {order.status !== 'cancelled' && (
                          <button type="button" disabled={saving} onClick={() => transitionOrder(order, 'cancelled')} className="h-9 rounded-lg border border-red-200 px-3 text-sm font-bold text-red-700 hover:bg-red-50">Cancelar</button>
                        )}
                        {canOperate && order.status !== 'prepared' && order.status !== 'delivered' && order.status !== 'cancelled' && (
                          <button type="button" disabled={saving} onClick={() => transitionOrder(order, 'prepared')} className="inline-flex h-9 items-center gap-2 rounded-lg border border-amber-200 px-3 text-sm font-bold text-amber-700 hover:bg-amber-50">
                            <CalendarDays className="h-4 w-4" /> Preparado
                          </button>
                        )}
                        {canOperate && order.status !== 'delivered' && order.status !== 'cancelled' && (
                          <button type="button" disabled={saving} onClick={() => transitionOrder(order, 'delivered')} className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-200 px-3 text-sm font-bold text-emerald-700 hover:bg-emerald-50">
                            <CheckCircle2 className="h-4 w-4" /> Entregado
                          </button>
                        )}
                        {canOperate && (
                          <button type="button" onClick={() => setReschedule({ orderId: order.id, date: order.planned_delivery_date, reason: '' })} className="h-9 rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50">Reprogramar</button>
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
              <h2 className="text-xl font-black text-slate-900">{editingBirthday ? 'Editar cumpleaños' : 'Registrar cumpleaños'}</h2>
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

const EmptyState = ({ text, action, onAction }) => (
  <div className="rounded-lg border border-dashed border-orange-200 bg-orange-50/60 p-6 text-center">
    <CakeSlice className="mx-auto h-8 w-8 text-orange-400" />
    <p className="mt-3 text-sm font-bold text-slate-700">{text}</p>
    {action && onAction && (
      <button type="button" onClick={onAction} className="mt-4 rounded-lg border border-orange-200 bg-white px-3 py-2 text-xs font-black text-orange-700 hover:bg-orange-50">
        {action}
      </button>
    )}
  </div>
)

const InfoLine = ({ label, value, accent = false }) => (
  <div className="min-w-0 rounded-md bg-slate-50 px-3 py-2">
    <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
    <p className={`mt-0.5 min-w-0 truncate text-sm font-bold ${accent ? 'text-orange-700' : 'text-slate-800'}`}>{value || '-'}</p>
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

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Copy, Eye, EyeOff, ExternalLink, Plus, Save, Send, Trash2, UserPlus } from 'lucide-react'

const STEPS = [
  'Datos básicos',
  'Sedes',
  'Horarios',
  'Servicios',
  'Opciones y etiquetas',
  'Remitos',
  'Resumen'
]

const RULE_LABELS = {
  beverages: 'Bebidas visibles',
  sides: 'Guarniciones',
  automaticSnack: 'Refrigerio automático',
  extraOrders: 'Pedidos extra',
  customOptions: 'Preguntas / custom options',
  labelsReportsTotalizer: 'Etiquetas, reportes y totalizadora'
}

const LABEL_FIELD_LABELS = {
  showCompany: 'Empresa',
  showLocation: 'Sede',
  showName: 'Nombre',
  showMenu: 'Menú',
  showSide: 'Guarnición',
  showBeverage: 'Bebida',
  showNotes: 'Observaciones'
}

const INTEGRATION_LABELS = {
  dailyReport: 'Reporte diario',
  totalizer: 'Totalizadora',
  excel: 'Excel',
  monthlyPanel: 'Panel mensual',
  extraOrders: 'Pedidos extra'
}

const MENU_ITEMS = [
  ['menu_principal', 'Menú principal'],
  ['opcion_1', 'Opción 1'],
  ['opcion_2', 'Opción 2'],
  ['opcion_3', 'Opción 3'],
  ['otros_menus', 'Otros menús'],
  ['dieta', 'Dieta'],
  ['celiacos', 'Celíacos'],
  ['bife_lomo', 'Bife de lomo'],
  ['bife_pollo', 'Bife de pollo'],
  ['guarniciones', 'Guarniciones']
]

const inputClass = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-gray-100 disabled:text-gray-500'
const smallButtonClass = 'inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50'
const primaryButtonClass = 'inline-flex items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-bold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50'

const updateNested = (object, key, value) => ({ ...object, [key]: value })

const slugifyName = (value) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')

const StatusPill = ({ active, visibility }) => (
  <div className="flex flex-wrap gap-2">
    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>
      {active ? 'Activa' : 'Inactiva'}
    </span>
    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${visibility === 'public' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
      {visibility === 'public' ? 'Pública' : 'Solo admins'}
    </span>
  </div>
)

const Toggle = ({ checked, onChange, label, help }) => (
  <label className="flex items-start justify-between gap-4 rounded-md border border-gray-200 bg-white px-3 py-2.5">
    <span>
      <span className="block text-sm font-semibold text-gray-800">{label}</span>
      {help && <span className="mt-0.5 block text-xs text-gray-500">{help}</span>}
    </span>
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className="h-5 w-5 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
    />
  </label>
)

const Field = ({ label, children, error, help, required = false }) => (
  <label className="block space-y-1.5">
    <span className="text-sm font-bold text-gray-800">
      {label}{required && <span className="text-red-600"> *</span>}
    </span>
    {children}
    {help && <span className="block text-xs leading-5 text-gray-500">{help}</span>}
    {error && <span className="block text-xs font-semibold text-red-600">{error}</span>}
  </label>
)

const buildInlineErrors = (draft) => {
  const errors = {}
  if (!draft.name?.trim()) errors.name = 'Ingresá un nombre.'
  if (!draft.slug?.trim()) errors.slug = 'Definí un nombre interno.'
  if (!draft.services?.some((service) => service.enabled)) errors.services = 'Habilitá al menos un servicio.'
  if (draft.schedule?.mode === 'custom' && (!draft.schedule.opensAt || !draft.schedule.closesAt)) {
    errors.schedule = 'Completá apertura y cierre.'
  }
  if (draft.remitos?.enabled && !draft.remitos.startNumber) {
    errors.remitos = 'Indicá el número inicial.'
  }
  return errors
}

const StepIntro = ({ title, children }) => (
  <div className="mb-5">
    <h3 className="text-base font-bold text-gray-900">{title}</h3>
    {children && <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-600">{children}</p>}
  </div>
)

const AdvancedPanel = ({ title = 'Configuración avanzada', children }) => {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-bold text-gray-800"
      >
        {title}
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-gray-200 p-4">{children}</div>}
    </div>
  )
}

const StepActions = ({ step, saving, onStepChange, onClose, onSave, onPublish }) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <button type="button" onClick={onClose} className={smallButtonClass}>Cancelar</button>
    <div className="flex flex-col-reverse gap-2 sm:flex-row">
      <button type="button" className={smallButtonClass} disabled={step === 0 || saving} onClick={() => onStepChange(Math.max(0, step - 1))}>Anterior</button>
      <button type="button" className={smallButtonClass} disabled={step === STEPS.length - 1 || saving} onClick={() => onStepChange(Math.min(STEPS.length - 1, step + 1))}>Siguiente</button>
      <button type="button" onClick={onSave} disabled={saving} className={smallButtonClass}>Guardar solo para administradores</button>
      <button type="button" onClick={onPublish} disabled={saving} className={primaryButtonClass}><Send className="mr-2 h-4 w-4" />Publicar para todos</button>
    </div>
  </div>
)

const CompanyWizard = ({
  draft,
  step,
  checklist,
  saving,
  onStepChange,
  onDraftChange,
  onClose,
  onSave,
  onPublish
}) => {
  const errors = buildInlineErrors(draft)
  const setDraft = (patch) => onDraftChange((prev) => ({ ...prev, ...patch }))
  const setName = (name) => onDraftChange((prev) => ({ ...prev, name, slug: prev.slug || slugifyName(name) }))
  const setSchedule = (patch) => onDraftChange((prev) => ({ ...prev, schedule: { ...prev.schedule, ...patch } }))
  const setRemitos = (patch) => onDraftChange((prev) => ({ ...prev, remitos: { ...prev.remitos, ...patch } }))
  const setSettings = (patch) => onDraftChange((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }))
  const setService = (service, enabled) => onDraftChange((prev) => ({
    ...prev,
    services: prev.services.map((item) => item.service === service ? { ...item, enabled } : item)
  }))
  const setLocation = (index, patch) => onDraftChange((prev) => ({
    ...prev,
    locations: prev.locations.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)
  }))
  const addLocation = () => onDraftChange((prev) => ({
    ...prev,
    locations: [...prev.locations, { name: '', code: '', slug: '', active: true, deliveryName: '', scheduleMode: 'inherit', scheduleFlow: '' }]
  }))
  const removeLocation = (index) => onDraftChange((prev) => ({
    ...prev,
    locations: prev.locations.filter((_, itemIndex) => itemIndex !== index)
  }))
  const toggleRule = (key, enabled) => onDraftChange((prev) => ({
    ...prev,
    rules: { ...prev.rules, [key]: { ...(prev.rules?.[key] || {}), enabled } }
  }))
  const toggleMenuItem = (key, enabled) => onDraftChange((prev) => {
    const current = new Map((prev.menuItems || []).map((item) => [item.key, item]))
    current.set(key, { ...(current.get(key) || { key }), enabled })
    return { ...prev, menuItems: Array.from(current.values()) }
  })
  const toggleLabel = (key, value) => onDraftChange((prev) => ({
    ...prev,
    labelSettings: updateNested(prev.labelSettings, key, value)
  }))
  const toggleIntegration = (key, value) => onDraftChange((prev) => ({
    ...prev,
    integrationSettings: updateNested(prev.integrationSettings, key, value)
  }))

  return (
    <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/50 p-3 sm:p-6">
      <div className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl sm:max-h-[calc(100vh-3rem)]">
        <div className="shrink-0 border-b border-gray-200 bg-white p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Administración de empresa</h2>
              <p className="mt-1 text-sm text-gray-600">Configuración completa para publicar sin cambios de código.</p>
            </div>
            <button type="button" onClick={onClose} className={smallButtonClass}>Cerrar</button>
          </div>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {STEPS.map((label, index) => (
              <button
                key={label}
                type="button"
                onClick={() => onStepChange(index)}
                className={`h-9 min-w-24 rounded-lg px-3 text-xs font-bold ${step === index ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                {index + 1}. {label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {step === 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nombre" error={errors.name} required>
                <input className={inputClass} value={draft.name} onChange={(event) => setName(event.target.value)} />
              </Field>
              <Field label="Subtítulo">
                <input className={inputClass} value={draft.subtitle} onChange={(event) => setDraft({ subtitle: event.target.value })} />
              </Field>
              <div className="md:col-span-2">
                <Field label="Descripción">
                  <textarea className={inputClass} rows={3} value={draft.description} onChange={(event) => setDraft({ description: event.target.value })} />
                </Field>
              </div>
              <Toggle checked={draft.active} onChange={(active) => setDraft({ active })} label="Empresa activa" />
              <Field label="Quién puede verla">
                <select className={inputClass} value={draft.visibility} onChange={(event) => setDraft({ visibility: event.target.value })}>
                  <option value="admins">Solo administradores</option>
                  <option value="public">Visible para todos</option>
                </select>
              </Field>
              <div className="md:col-span-2">
                <AdvancedPanel>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Nombre interno" error={errors.slug} help="Se usa para identificar la empresa internamente.">
                      <input className={inputClass} value={draft.slug} onChange={(event) => setDraft({ slug: event.target.value })} />
                    </Field>
                    <Field label="Tomar opciones de" help="Dejá vacío para usar las opciones de esta empresa.">
                      <input className={inputClass} value={draft.optionsSourceSlug} onChange={(event) => setDraft({ optionsSourceSlug: event.target.value })} />
                    </Field>
                  </div>
                </AdvancedPanel>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <button type="button" onClick={addLocation} className={smallButtonClass}><Plus className="mr-2 h-4 w-4" />Agregar sede</button>
              {draft.locations.length === 0 && <p className="rounded-lg bg-gray-50 p-4 text-sm font-semibold text-gray-600">Esta empresa puede operar sin sedes configuradas.</p>}
              {draft.locations.map((location, index) => (
                <div key={index} className="grid gap-3 rounded-lg border border-gray-200 p-3 md:grid-cols-6">
                  <Field label="Nombre"><input className={inputClass} value={location.name} onChange={(event) => setLocation(index, { name: event.target.value })} /></Field>
                  <Field label="Código"><input className={inputClass} value={location.code} onChange={(event) => setLocation(index, { code: event.target.value })} /></Field>
                  <Field label="Nombre interno"><input className={inputClass} value={location.slug} onChange={(event) => setLocation(index, { slug: event.target.value })} /></Field>
                  <Field label="Entrega"><input className={inputClass} value={location.deliveryName} onChange={(event) => setLocation(index, { deliveryName: event.target.value })} /></Field>
                  <Toggle checked={location.active} onChange={(active) => setLocation(index, { active })} label="Activa" />
                  <button type="button" onClick={() => removeLocation(index)} className={smallButtonClass}><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Flujo">
                <select className={inputClass} value={draft.schedule.mode} onChange={(event) => setSchedule({ mode: event.target.value })}>
                  <option value="standard">Estándar 06:00-14:00</option>
                  <option value="extended">Extendido 09:00-22:00</option>
                  <option value="custom">Personalizado</option>
                </select>
              </Field>
              <Toggle checked={draft.schedule.perLocation} onChange={(perLocation) => setSchedule({ perLocation })} label="Configurar por sede" />
              <Field label="Apertura" error={errors.schedule}><input type="time" className={inputClass} value={draft.schedule.opensAt} onChange={(event) => setSchedule({ opensAt: event.target.value })} /></Field>
              <Field label="Cierre"><input type="time" className={inputClass} value={draft.schedule.closesAt} onChange={(event) => setSchedule({ closesAt: event.target.value })} /></Field>
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-3">
                <h3 className="text-sm font-bold uppercase text-gray-500">Servicios</h3>
                {draft.services.map((service) => (
                  <Toggle key={service.service} checked={service.enabled} onChange={(enabled) => setService(service.service, enabled)} label={service.service === 'lunch' ? 'Almuerzo' : 'Cena'} />
                ))}
                {errors.services && <p className="text-sm font-semibold text-red-600">{errors.services}</p>}
              </div>
              <div className="space-y-3">
                <h3 className="text-sm font-bold uppercase text-gray-500">Productos habilitados</h3>
                {MENU_ITEMS.map(([key, label]) => {
                  const configured = draft.menuItems.find((item) => item.key === key)
                  return <Toggle key={key} checked={configured?.enabled !== false} onChange={(enabled) => toggleMenuItem(key, enabled)} label={label} />
                })}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <StepIntro title="Qué se puede pedir" />
              <div className="grid gap-3 md:grid-cols-2">
              {Object.entries(RULE_LABELS).map(([key, label]) => (
                <Toggle key={key} checked={draft.rules?.[key]?.enabled !== false} onChange={(enabled) => toggleRule(key, enabled)} label={label} />
              ))}
              <Toggle checked={draft.settings.requiresAuthorizedLocations} onChange={(requiresAuthorizedLocations) => setSettings({ requiresAuthorizedLocations })} label="Requiere sedes autorizadas por usuario" />
              </div>
              <StepIntro title="Qué información mostrar" />
              <div className="grid gap-3 md:grid-cols-2">
              {Object.entries(LABEL_FIELD_LABELS).map(([key, label]) => (
                <Toggle key={key} checked={draft.labelSettings?.[key] !== false} onChange={(value) => toggleLabel(key, value)} label={label} />
              ))}
              </div>
              <AdvancedPanel>
                <div className="grid gap-3 md:grid-cols-2">
                  {Object.entries(INTEGRATION_LABELS).map(([key, label]) => (
                    <Toggle key={key} checked={draft.integrationSettings?.[key] !== false} onChange={(value) => toggleIntegration(key, value)} label={label} />
                  ))}
                </div>
              </AdvancedPanel>
            </div>
          )}

          {step === 5 && (
            <div className="grid gap-4 md:grid-cols-3">
              <Toggle checked={draft.remitos.enabled} onChange={(enabled) => setRemitos({ enabled })} label="Usa remitos" />
              <Field label="Inicial" error={errors.remitos}><input type="number" className={inputClass} value={draft.remitos.startNumber} onChange={(event) => setRemitos({ startNumber: event.target.value })} disabled={!draft.remitos.enabled} /></Field>
              <Field label="Final"><input type="number" className={inputClass} value={draft.remitos.endNumber} onChange={(event) => setRemitos({ endNumber: event.target.value })} disabled={!draft.remitos.enabled} /></Field>
              <Field label="Próximo"><input type="number" className={inputClass} value={draft.remitos.nextNumber} onChange={(event) => setRemitos({ nextNumber: event.target.value })} disabled={!draft.remitos.enabled} /></Field>
            </div>
          )}

          {step === 6 && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-gray-200 p-4">
                <h3 className="font-bold text-gray-900">{draft.name || 'Nueva empresa'}</h3>
                <p className="mt-1 text-sm text-gray-600">Nombre interno: {draft.slug || 'Pendiente'}</p>
                <div className="mt-3"><StatusPill active={draft.active} visibility={draft.visibility} /></div>
                <dl className="mt-4 grid gap-2 text-sm text-gray-700">
                  <div><dt className="font-bold">Sedes</dt><dd>{draft.locations.length || 'Sin sedes'}</dd></div>
                  <div><dt className="font-bold">Servicios</dt><dd>{draft.services.filter((service) => service.enabled).map((service) => service.service === 'lunch' ? 'Almuerzo' : 'Cena').join(', ') || '-'}</dd></div>
                  <div><dt className="font-bold">Horario</dt><dd>{draft.schedule.opensAt}-{draft.schedule.closesAt}</dd></div>
                  <div><dt className="font-bold">Remitos</dt><dd>{draft.remitos.enabled ? `${draft.remitos.startNumber || '?'} / ${draft.remitos.nextNumber || draft.remitos.startNumber || '?'}` : 'No usa'}</dd></div>
                </dl>
              </div>
              <div className="rounded-lg border border-gray-200 p-4">
                <h3 className="font-bold text-gray-900">Checklist de publicación</h3>
                {Object.keys(errors).length === 0 && checklist.length === 0 ? (
                  <p className="mt-2 text-sm font-semibold text-emerald-700">La configuración mínima está completa.</p>
                ) : (
                  <ul className="mt-2 space-y-2 text-sm font-semibold text-red-700">
                    {[...Object.values(errors), ...checklist].map((error, index) => <li key={index}>{error}</li>)}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-gray-200 bg-white p-4 sm:p-6">
          <StepActions step={step} saving={saving} onStepChange={onStepChange} onClose={onClose} onSave={onSave} onPublish={onPublish} />
        </div>
      </div>
    </div>
  )
}

const AdminCompaniesSection = ({
  companies,
  selectedCompany,
  selectedCompanySlug,
  companyDraft,
  wizardOpen,
  wizardStep,
  publishChecklist,
  companyActivity,
  adminEmailDrafts,
  companiesLoading,
  savingCompanySlug,
  onSelectCompany,
  onOpenCompanyWizard,
  onCloseCompanyWizard,
  onWizardStepChange,
  onCompanyDraftChange,
  onSaveCompanyDraft,
  onDuplicateCompany,
  onAdminEmailChange,
  onAssignCompanyAdmin,
  onRemoveCompanyAdmin,
  onCompanyLifecycle
}) => (
  <div className="space-y-4">
    <div className="rounded-lg border border-white/20 bg-white/95 p-4 shadow-xl sm:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Administración de empresas</h2>
          <p className="mt-1 text-sm text-gray-600">Alta, pruebas y publicación de empresas desde configuración centralizada.</p>
        </div>
        <button type="button" onClick={() => onOpenCompanyWizard(null)} className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white hover:bg-gray-800">
          <Plus className="mr-2 h-4 w-4" />Nueva empresa
        </button>
      </div>
    </div>

    <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
      <div className="rounded-lg border border-white/20 bg-white/95 p-3 shadow-xl">
        {companiesLoading ? (
          <div className="rounded-lg bg-gray-50 p-4 text-sm font-semibold text-gray-700">Cargando empresas...</div>
        ) : (
          <div className="space-y-2">
            {(companies || []).map((company) => (
              <button
                type="button"
                key={company.slug}
                onClick={() => onSelectCompany(company.slug)}
                className={`w-full rounded-lg border p-3 text-left transition ${selectedCompanySlug === company.slug ? 'border-gray-900 bg-gray-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-gray-900">{company.name}</p>
                  </div>
                  <StatusPill active={company.active} visibility={company.visibility} />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-white/20 bg-white/95 p-4 shadow-xl sm:p-6">
        {selectedCompany ? (
          <div className="space-y-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  {selectedCompany.visibility === 'public' ? <Eye className="h-5 w-5 text-blue-600" /> : <EyeOff className="h-5 w-5 text-amber-600" />}
                  <h3 className="text-lg font-bold text-gray-900">{selectedCompany.name}</h3>
                </div>
                <p className="mt-1 text-sm text-gray-600">{selectedCompany.description || 'Sin descripción'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={`/order/${selectedCompany.slug}?adminPreview=1`} target="_blank" rel="noreferrer" className={smallButtonClass}>
                  <ExternalLink className="mr-2 h-4 w-4" />Probar flujo
                </a>
                <button type="button" onClick={() => onDuplicateCompany(selectedCompany)} className={smallButtonClass} disabled={savingCompanySlug === selectedCompany.slug}>
                  <Copy className="mr-2 h-4 w-4" />Duplicar
                </button>
                <button type="button" onClick={() => onOpenCompanyWizard(selectedCompany)} className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-3 py-2 text-sm font-bold text-white hover:bg-gray-800">
                  Editar
                </button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs font-bold uppercase text-gray-500">Sedes</p><p className="mt-1 text-xl font-bold text-gray-900">{selectedCompany.locations.length}</p></div>
              <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs font-bold uppercase text-gray-500">Servicios</p><p className="mt-1 text-xl font-bold text-gray-900">{selectedCompany.services.filter((item) => item.enabled).length}</p></div>
              <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs font-bold uppercase text-gray-500">Horario</p><p className="mt-1 text-sm font-bold text-gray-900">{selectedCompany.schedule.opensAt}-{selectedCompany.schedule.closesAt}</p></div>
              <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs font-bold uppercase text-gray-500">Remitos emitidos</p><p className="mt-1 text-xl font-bold text-gray-900">{selectedCompany.issuedCount}</p></div>
            </div>

            <div className="rounded-lg border border-gray-200 p-4">
              <h4 className="font-bold text-gray-900">Administradores de la empresa</h4>
              <div className="mt-3 space-y-2">
                {(selectedCompany.admins || []).length === 0 ? (
                  <p className="text-sm font-semibold text-gray-500">Sin administradores asignados.</p>
                ) : selectedCompany.admins.map((admin) => (
                  <div key={admin.user_id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-gray-900">{admin.email}</p>
                      {admin.full_name && <p className="truncate text-xs text-gray-500">{admin.full_name}</p>}
                    </div>
                    <button type="button" onClick={() => onRemoveCompanyAdmin({ companySlug: selectedCompany.slug, userId: admin.user_id, email: admin.email })} className="rounded-md p-2 text-red-600 hover:bg-red-100">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={adminEmailDrafts?.[selectedCompany.slug] || ''}
                    onChange={(event) => onAdminEmailChange(selectedCompany.slug, event.target.value)}
                    className={inputClass}
                    placeholder="correo@empresa.com"
                  />
                  <button type="button" onClick={() => onAssignCompanyAdmin(selectedCompany.slug)} className={smallButtonClass}>
                    <UserPlus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <h4 className="font-bold text-red-900">Zona de riesgo</h4>
              <p className="mt-1 text-sm leading-6 text-red-800">
                {companyActivity[selectedCompany.slug]
                  ? 'Esta empresa tiene actividad registrada y no puede eliminarse. Podés desactivarla para que deje de utilizarse.'
                  : 'Eliminar una empresa es definitivo y solo está permitido si nunca tuvo actividad.'}
              </p>
              <button
                type="button"
                onClick={() => onCompanyLifecycle(selectedCompany)}
                disabled={savingCompanySlug === selectedCompany.slug}
                className="mt-3 inline-flex items-center justify-center rounded-md border border-red-300 bg-red-600 px-3 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {companyActivity[selectedCompany.slug] ? 'Desactivar empresa' : 'Eliminar empresa'}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm font-semibold text-gray-600">Seleccioná una empresa.</p>
        )}
      </div>
    </div>

    {wizardOpen && createPortal(
      <CompanyWizard
        draft={companyDraft}
        step={wizardStep}
        checklist={publishChecklist}
        saving={Boolean(savingCompanySlug)}
        onStepChange={onWizardStepChange}
        onDraftChange={onCompanyDraftChange}
        onClose={onCloseCompanyWizard}
        onSave={() => onSaveCompanyDraft({ publish: false })}
        onPublish={() => onSaveCompanyDraft({ publish: true })}
      />,
      document.body
    )}
  </div>
)

export default AdminCompaniesSection

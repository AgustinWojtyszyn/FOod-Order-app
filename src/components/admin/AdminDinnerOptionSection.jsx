import { Plus, Save, Calendar, CheckCircle } from 'lucide-react'

const AdminDinnerOptionSection = ({
  weekBaseDate,
  onWeekBaseDateChange,
  visibleDates = [],
  selectedDates = [],
  loadedDates = [],
  onToggleDate,
  dateLoadingMap = {},
  dinnerMenusByDate = {},
  onFieldChange,
  onOptionChoiceChange,
  onAddOptionChoice,
  onRemoveOptionChoice,
  onSaveDate,
  savingMap = {},
  companyOptions = [],
  canUseGlobalCompany = false
}) => {
  const orderedDates = Array.isArray(visibleDates) ? [...visibleDates].sort() : []
  const selectedSet = new Set(selectedDates || [])
  const loadedSet = new Set(loadedDates || [])

  const normalizeDate = (value) => {
    if (!value) return null
    if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate())
    const parsed = new Date(`${value}T00:00:00`)
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
  }

  const toISODate = (date) => {
    if (!(date instanceof Date)) return ''
    const yyyy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  const startOfWeek = normalizeDate(weekBaseDate) || normalizeDate(new Date())

  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const d = new Date(startOfWeek)
    d.setDate(startOfWeek.getDate() + index)
    return d
  })

  const formatDayLabel = (date) => {
    try {
      return new Intl.DateTimeFormat('es-AR', { weekday: 'short' })
        .format(date)
        .replace('.', '')
        .toUpperCase()
    } catch (_err) {
      return toISODate(date)
    }
  }

  const formatDayNumber = (date) => {
    try {
      return new Intl.DateTimeFormat('es-AR', { day: '2-digit' }).format(date)
    } catch (_err) {
      return String(date.getDate()).padStart(2, '0')
    }
  }

  const formatMonthLabel = (date) => {
    try {
      return new Intl.DateTimeFormat('es-AR', { month: 'short' })
        .format(date)
        .replace('.', '')
        .toUpperCase()
    } catch (_err) {
      return ''
    }
  }

  return (
    <div className="card bg-white/95 backdrop-blur-sm shadow-xl border-2 border-white/20">
      <div className="flex flex-col gap-3 mb-4 sm:mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Cena</h2>
          <p className="text-sm text-gray-600 mt-1">
            Seleccioná los días de entrega y cargá el menú de cena por día.
          </p>
        </div>
      </div>

      <div className="mb-6">
        <div className="bg-secondary-50 border-2 border-secondary-300 text-black rounded-2xl px-5 py-4 shadow-sm">
          <p className="text-base sm:text-lg font-black uppercase tracking-wide text-black">
            Siempre el día seleccionado es el día de entrega
          </p>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[11px] text-gray-400">
          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5" />
            <label htmlFor="dinner-week-picker" className="sr-only">Cambiar inicio de entregas</label>
            <span className="uppercase tracking-wide">Inicio</span>
            <input
              id="dinner-week-picker"
              type="date"
              value={toISODate(normalizeDate(weekBaseDate))}
              onChange={(e) => onWeekBaseDateChange(normalizeDate(e.target.value))}
              className="input-field text-[11px] bg-gray-50 text-gray-600 border border-gray-200/60 w-32 sm:w-36"
            />
          </div>
          {selectedDates.length === 0 ? (
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
              Mostrando menús cargados automáticamente
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
              Modo edición activa
            </span>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {weekDays.map((date) => {
            const dateISO = toISODate(date)
            const isSelected = selectedSet.has(dateISO)
            const isBusy = Boolean(dateLoadingMap[dateISO])
            const baseStyles = 'rounded-2xl border-2 px-4 py-4 text-left transition-all relative overflow-hidden'
            const selectedStyles = isSelected
              ? 'border-primary-700 bg-primary-100 text-gray-900 shadow-lg shadow-primary-900/10 ring-1 ring-primary-500/30'
              : 'border-gray-200 bg-gray-50 text-gray-900 hover:border-primary-300 hover:bg-primary-50/60 hover:shadow-md hover:-translate-y-0.5'
            return (
              <button
                key={dateISO}
                onClick={() => onToggleDate(dateISO)}
                className={`${baseStyles} ${selectedStyles} ${isBusy ? 'opacity-60 pointer-events-none' : ''}`}
                type="button"
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold ${isSelected ? 'text-gray-900' : 'text-gray-500'}`}>
                    {formatDayLabel(date)}
                  </span>
                  {loadedSet.has(dateISO) && (
                    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">
                      CENA
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-end gap-2">
                  <span className="text-2xl font-black">{formatDayNumber(date)}</span>
                  <span className={`text-xs font-semibold ${isSelected ? 'text-gray-900' : 'text-gray-500'}`}>
                    {formatMonthLabel(date)}
                  </span>
                </div>
                {isSelected && (
                  <span className="absolute top-3 right-3 text-primary-700">
                    <CheckCircle className="h-5 w-5" />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {orderedDates.length === 0 && (
        <div className="text-center py-8 text-gray-600 font-semibold">
          Seleccioná al menos un día para cargar el menú de cena.
        </div>
      )}

      {orderedDates.map((dateISO) => {
        const draft = dinnerMenusByDate[dateISO]
        return (
          <div key={dateISO} className="mt-6 border-2 border-primary-300 rounded-xl p-4 sm:p-6 bg-primary-50">
            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-primary-600 font-bold">Entrega</p>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900">{dateISO}</h3>
              </div>
              <button
                onClick={() => onSaveDate(dateISO)}
                disabled={Boolean(savingMap[dateISO])}
                className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-black text-sm font-bold flex items-center gap-2 shadow-md disabled:opacity-60"
                type="button"
              >
                <Save className="h-4 w-4" />
                {savingMap[dateISO] ? 'Guardando...' : 'Guardar día'}
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  Título *
                </label>
                <input
                  type="text"
                  value={draft?.title || ''}
                  onChange={(e) => onFieldChange(dateISO, 'title', e.target.value)}
                  className="input-field w-full bg-white text-gray-900"
                  placeholder="Ej: Menú de cena"
                  autoComplete="off"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  Empresa / alcance
                </label>
                <select
                  value={draft?.company || ''}
                  onChange={(e) => onFieldChange(dateISO, 'company', e.target.value)}
                  className="input-field w-full bg-white text-gray-900 text-sm sm:text-base"
                >
                  {canUseGlobalCompany && <option value="">Visible para todas las empresas</option>}
                  {companyOptions.map(company => (
                    <option key={company.slug} value={company.slug}>
                      Solo {company.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  Opciones de cena
                </label>
                <div className="space-y-2">
                  {(draft?.options || []).map((opt, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => onOptionChoiceChange(dateISO, index, e.target.value)}
                        className="input-field flex-1 bg-white text-gray-900"
                        placeholder={`Opción ${index + 1}`}
                      />
                      {draft?.options?.length > 1 && (
                        <button
                          onClick={() => onRemoveOptionChoice(dateISO, index)}
                          className="p-2.5 text-red-600 hover:bg-red-100 rounded-lg shrink-0"
                          type="button"
                        >
                          Quitar
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => onAddOptionChoice(dateISO)}
                    className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-all font-medium"
                    type="button"
                  >
                    <Plus className="h-4 w-4" />
                    Agregar opción
                  </button>
                </div>
              </div>

            </div>
          </div>
        )
      })}
    </div>
  )
}

export default AdminDinnerOptionSection

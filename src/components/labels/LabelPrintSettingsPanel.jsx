import { RotateCcw, Save, X } from 'lucide-react'
import {
  LABEL_PRINT_PROFILES,
  getLabelPrintValidation,
  getProfileSettings
} from '../../utils/labels/labelPrintSettings'

const NumberField = ({ label, value, min, max, step, onChange }) => (
  <label className="space-y-1">
    <span className="text-xs font-bold text-slate-600">{label}</span>
    <input
      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      type="number"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={event => onChange(Number(event.target.value))}
    />
  </label>
)

const LabelPrintSettingsPanel = ({ settings, onChange, onReset, onSave, onSaveCustomProfile, onCancel, onPrintCalibration }) => {
  const validation = getLabelPrintValidation(settings)
  const update = (name, value) => onChange({ ...settings, [name]: value })
  const updateMargin = (name, value) => onChange({ ...settings, margins: { ...settings.margins, [name]: value } })
  const selectProfile = (profile) => {
    const preset = profile === 'custom-saved' ? settings.savedProfiles?.custom : getProfileSettings(profile)
    onChange({ ...settings, ...(preset || {}), profile })
  }
  const swapDimensions = () => onChange({ ...settings, widthMm: settings.heightMm, heightMm: settings.widthMm })
  const saveCustomProfile = () => {
    const nextSettings = {
      ...settings,
      profile: 'custom-saved',
      savedProfiles: { ...settings.savedProfiles, custom: { ...settings, profile: 'custom-saved', savedProfiles: {} } }
    }
    onChange(nextSettings)
    return nextSettings
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 md:p-8 print-hide">
      <div className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-slate-900">Configuración de impresión</h3>
            <p className="mt-1 text-sm font-semibold text-slate-500">Los cambios se reflejan inmediatamente en la vista previa.</p>
          </div>
          <button type="button" onClick={onCancel} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Cerrar configuración"><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-5 space-y-5">
          <section>
            <h4 className="text-sm font-black uppercase tracking-wide text-slate-800">Papel</h4>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="space-y-1 sm:col-span-2 lg:col-span-1">
                <span className="text-xs font-bold text-slate-600">Perfil</span>
                <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={settings.profile} onChange={event => selectProfile(event.target.value)}>
                  {Object.entries(LABEL_PRINT_PROFILES).map(([value, profile]) => <option key={value} value={value}>{profile.label}</option>)}
                  <option value="custom-saved">Personalizado guardado</option>
                </select>
              </label>
              <NumberField label="Ancho de página (mm)" value={settings.widthMm} min="20" max="150" step="0.5" onChange={value => update('widthMm', value)} />
              <NumberField label="Alto de página (mm)" value={settings.heightMm} min="20" max="150" step="0.5" onChange={value => update('heightMm', value)} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm font-bold text-slate-700"><span>Orientación</span><select className="rounded-lg border border-slate-300 px-3 py-2" value={settings.orientation} onChange={event => update('orientation', event.target.value)}><option value="landscape">Horizontal</option><option value="portrait">Vertical</option></select></label>
              <button type="button" onClick={swapDimensions} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">↔ Intercambiar ancho / alto</button>
            </div>
            {validation.orientationMismatch && <p className="mt-2 text-sm font-bold text-amber-700">La orientación no coincide con las dimensiones actuales.</p>}
          </section>

          <section>
            <h4 className="text-sm font-black uppercase tracking-wide text-slate-800">Safe area y contenido</h4>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <NumberField label="Margen izquierdo" value={settings.margins.left} min="0" max="10" step="0.25" onChange={value => updateMargin('left', value)} />
              <NumberField label="Margen derecho" value={settings.margins.right} min="0" max="10" step="0.25" onChange={value => updateMargin('right', value)} />
              <NumberField label="Margen superior" value={settings.margins.top} min="0" max="10" step="0.25" onChange={value => updateMargin('top', value)} />
              <NumberField label="Margen inferior" value={settings.margins.bottom} min="0" max="10" step="0.25" onChange={value => updateMargin('bottom', value)} />
              <NumberField label="Desplazamiento X (mm)" value={settings.offsetXmm} min="-10" max="10" step="0.25" onChange={value => update('offsetXmm', value)} />
              <NumberField label="Desplazamiento Y (mm)" value={settings.offsetYmm} min="-10" max="10" step="0.25" onChange={value => update('offsetYmm', value)} />
              <NumberField label="Escala del contenido (%)" value={Math.round(settings.contentScale * 100)} min="60" max="120" step="1" onChange={value => update('contentScale', value / 100)} />
              <NumberField label="Escala tipográfica (%)" value={Math.round(settings.fontScale * 100)} min="70" max="130" step="1" onChange={value => update('fontScale', value / 100)} />
            </div>
            {!validation.valid && <p className="mt-2 text-sm font-bold text-red-700">Revisá dimensiones, márgenes u offset: el área útil debe quedar dentro del papel.</p>}
            {validation.warning && <p className="mt-2 text-sm font-bold text-amber-700">La escala elegida es extrema; verificá el contenido antes de imprimir.</p>}
          </section>

          <section>
            <h4 className="text-sm font-black uppercase tracking-wide text-slate-800">Copias</h4>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <NumberField label="Copias por pedido" value={settings.copiesPerOrder} min="1" max="10" step="1" onChange={value => update('copiesPerOrder', Math.round(value))} />
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-black text-blue-900">Páginas por hoja: 1</div>
            </div>
          </section>

          <section>
            <h4 className="text-sm font-black uppercase tracking-wide text-slate-800">Impresora / Chrome</h4>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1"><span className="text-xs font-bold text-slate-600">Impresora objetivo</span><select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={settings.printerName} onChange={event => update('printerName', event.target.value)}><option>ZDesigner GC420t</option><option>Otra</option></select></label>
              <label className="space-y-1"><span className="text-xs font-bold text-slate-600">Escala recomendada de Chrome</span><select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={settings.chromeHints.scale} onChange={event => update('chromeHints', { ...settings.chromeHints, scale: event.target.value === 'custom' ? 'custom' : Number(event.target.value) })}><option value="100">100 %</option><option value="81">81 %</option><option value="custom">Personalizada</option></select></label>
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-500">Destino: {settings.printerName} · Orientación: según este perfil · Tamaño: según este perfil · Márgenes: Ninguno · Encabezado y pie: Desactivado. La aplicación no puede cambiar estos valores del diálogo nativo.</p>
          </section>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" onClick={onReset} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700"><RotateCcw className="h-4 w-4" />Restaurar valores recomendados</button>
          <button type="button" onClick={() => onSaveCustomProfile(saveCustomProfile())} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700">Guardar como perfil personalizado</button>
          <button type="button" onClick={onPrintCalibration} disabled={!validation.valid} className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900 disabled:opacity-50">Imprimir prueba de calibración</button>
          <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700">Cancelar</button>
          <button type="button" onClick={onSave} disabled={!validation.valid} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-black text-white disabled:opacity-50"><Save className="h-4 w-4" />Guardar configuración</button>
        </div>
      </div>
    </div>
  )
}

export default LabelPrintSettingsPanel

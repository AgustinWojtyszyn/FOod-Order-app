import { useState } from 'react'
import { ArrowLeft, Printer, Settings, X } from 'lucide-react'
import { buildLabelOrder } from '../../utils/labels/labelOrderUtils'
import LabelPrintSettingsPanel from './LabelPrintSettingsPanel'
import { useLabelPrintSettings } from '../../hooks/labels/useLabelPrintSettings'
import {
  createDefaultLabelPrintSettings,
  expandLabelInstances,
  getLabelPrintValidation
} from '../../utils/labels/labelPrintSettings'
import OrderLabelCard from './OrderLabelCard'

const waitForPreviewFrame = () => new Promise(resolve => window.requestAnimationFrame(resolve))

const CalibrationLabel = ({ settings }) => (
  <article className="calibration-label print-label">
    <div className="calibration-corner calibration-corner--top-left" />
    <div className="calibration-corner calibration-corner--top-right" />
    <div className="calibration-corner calibration-corner--bottom-left" />
    <div className="calibration-corner calibration-corner--bottom-right" />
    <strong>PAPEL: {settings.widthMm} x {settings.heightMm} mm</strong>
    <span>ORIENTACIÓN: {settings.orientation === 'landscape' ? 'HORIZONTAL' : 'VERTICAL'}</span>
    <span>SAFE: L{settings.margins.left} R{settings.margins.right} T{settings.margins.top} B{settings.margins.bottom}</span>
    <span>OFFSET: X {settings.offsetXmm} / Y {settings.offsetYmm} mm</span>
    <span>ESCALA APP: {Math.round(settings.contentScale * 100)} % · PERFIL: {settings.profile}</span>
    <div className="calibration-cross calibration-cross--horizontal" />
    <div className="calibration-cross calibration-cross--vertical" />
  </article>
)

const OrderLabelsPreview = ({
  selectedOrders,
  printing = false,
  onBack,
  onCancel,
  onPrint,
  onPrintCalibration
}) => {
  const printSettings = useLabelPrintSettings()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draftSettings, setDraftSettings] = useState(printSettings.settings)
  const [calibrationMode, setCalibrationMode] = useState(false)
  const settings = settingsOpen ? draftSettings : printSettings.settings
  const validation = getLabelPrintValidation(settings)
  const labels = expandLabelInstances(selectedOrders, settings.copiesPerOrder).map(({ order, labelInstanceId }) => ({
    ...buildLabelOrder(order),
    labelInstanceId
  }))
  const openSettings = () => {
    setDraftSettings(printSettings.settings)
    setSettingsOpen(true)
  }
  const saveSettings = () => {
    printSettings.save(draftSettings)
    setSettingsOpen(false)
  }
  const saveCustomProfile = (nextSettings) => {
    printSettings.save(nextSettings)
    setDraftSettings(nextSettings)
  }
  const printCalibration = async () => {
    setCalibrationMode(true)
    await waitForPreviewFrame()
    await onPrintCalibration()
    setCalibrationMode(false)
  }
  const printStyle = {
    '--label-width': `${settings.widthMm}mm`,
    '--label-height': `${settings.heightMm}mm`,
    '--label-safe-left': `${settings.margins.left}mm`,
    '--label-safe-right': `${settings.margins.right}mm`,
    '--label-safe-top': `${settings.margins.top}mm`,
    '--label-safe-bottom': `${settings.margins.bottom}mm`,
    '--label-offset-x': `${settings.offsetXmm}mm`,
    '--label-offset-y': `${settings.offsetYmm}mm`,
    '--label-content-scale': settings.contentScale,
    '--label-font-scale': settings.fontScale
  }

  return (
    <section
      className="labels-preview-root"
      style={printStyle}
    >
      <style media="print">
        {`@page { size: ${settings.widthMm}mm ${settings.heightMm}mm; margin: 0; }`}
      </style>

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-lg shadow-slate-200/50 print-hide">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-900">Vista previa de etiquetas</h2>
            <p className="text-sm font-semibold text-slate-500">
              Perfil: {settings.profile} · Página: {settings.widthMm} x {settings.heightMm} mm · {settings.orientation === 'landscape' ? 'Horizontal' : 'Vertical'}
            </p>
            <p className="text-xs font-bold text-slate-500">Safe: L {settings.margins.left} · R {settings.margins.right} · T {settings.margins.top} · B {settings.margins.bottom} mm · Offset: X {settings.offsetXmm} · Y {settings.offsetYmm} mm · Escala: {Math.round(settings.contentScale * 100)} % · Copias: {settings.copiesPerOrder}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
            <ArrowLeft className="h-4 w-4" />
            Volver a editar selección
          </button>
          <button type="button" onClick={onCancel} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
            <X className="h-4 w-4" />
            Cancelar vista previa
          </button>
          <button type="button" onClick={openSettings} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
            <Settings className="h-4 w-4" />
            Configurar impresión
          </button>
          <button type="button" onClick={() => onPrint(labels.length)} disabled={labels.length === 0 || printing || !validation.valid} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-black text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
            <Printer className="h-4 w-4" />
            {printing ? 'Abriendo impresión...' : 'Imprimir etiquetas'}
          </button>
        </div>
        <p className="mt-3 text-xs font-bold text-slate-500 print-hide">
          Impresora esperada: {settings.printerName} · Chrome: 1 página por hoja · Márgenes ninguno · Encabezado y pie desactivados. La escala del diálogo de Chrome es sólo una referencia: la aplicación no puede cambiarla.
        </p>
      </div>

      <div className={`labels-print-root print-pages labels-print-surface${calibrationMode ? ' calibration-print-root' : ''}`} aria-label="Etiquetas seleccionadas para imprimir">
        {calibrationMode ? <section className="print-page"><CalibrationLabel settings={settings} /></section> : null}
        {!calibrationMode && labels.map(label => (
          <section className="print-page" key={label.labelInstanceId}>
            <OrderLabelCard label={label} />
          </section>
        ))}
      </div>
      {settingsOpen && <LabelPrintSettingsPanel settings={draftSettings} onChange={setDraftSettings} onReset={() => setDraftSettings(createDefaultLabelPrintSettings())} onSave={saveSettings} onSaveCustomProfile={saveCustomProfile} onCancel={() => setSettingsOpen(false)} onPrintCalibration={printCalibration} />}
    </section>
  )
}

export default OrderLabelsPreview

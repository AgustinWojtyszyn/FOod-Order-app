export const THERMAL_LABEL_PRESETS = {
  '100x50': { width: 100, height: 50 },
  '80x50': { width: 80, height: 50 }
}

export const DEFAULT_THERMAL_LABEL_PRESET = '100x50'
export const DEFAULT_THERMAL_LABEL_SIZE = THERMAL_LABEL_PRESETS[DEFAULT_THERMAL_LABEL_PRESET]
export const DEFAULT_THERMAL_LABEL_SAFE_PADDING_MM = 2
export const DEFAULT_LABEL_PRINT_CALIBRATION = { offsetX: 0, offsetY: 0 }

export const LABEL_PRINT_CALIBRATION_STORAGE_KEYS = {
  offsetX: 'labelPrintOffsetX',
  offsetY: 'labelPrintOffsetY'
}

export const LABEL_PRINT_CALIBRATION_LIMITS = {
  min: -5,
  max: 5,
  step: 0.25,
  fallback: 0
}

export const THERMAL_LABEL_LIMITS = {
  width: { min: 40, max: 150, fallback: DEFAULT_THERMAL_LABEL_SIZE.width },
  height: { min: 25, max: 100, fallback: DEFAULT_THERMAL_LABEL_SIZE.height }
}

export const normalizeThermalMillimeters = (value, { min, max, fallback }) => {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(parsed, min), max)
}

export const normalizeLabelPrintOffset = (value) => {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  if (!Number.isFinite(parsed)) return LABEL_PRINT_CALIBRATION_LIMITS.fallback
  const clamped = Math.min(Math.max(parsed, LABEL_PRINT_CALIBRATION_LIMITS.min), LABEL_PRINT_CALIBRATION_LIMITS.max)
  return Math.round(clamped / LABEL_PRINT_CALIBRATION_LIMITS.step) * LABEL_PRINT_CALIBRATION_LIMITS.step
}

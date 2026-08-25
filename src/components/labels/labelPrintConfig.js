export const THERMAL_LABEL_PRESETS = {
  '100x50': { width: 100, height: 50 },
  '80x50': { width: 80, height: 50 }
}

export const DEFAULT_THERMAL_LABEL_PRESET = '100x50'
export const DEFAULT_THERMAL_LABEL_SIZE = THERMAL_LABEL_PRESETS[DEFAULT_THERMAL_LABEL_PRESET]

export const THERMAL_LABEL_LIMITS = {
  width: { min: 40, max: 150, fallback: DEFAULT_THERMAL_LABEL_SIZE.width },
  height: { min: 25, max: 100, fallback: DEFAULT_THERMAL_LABEL_SIZE.height }
}

export const normalizeThermalMillimeters = (value, { min, max, fallback }) => {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(parsed, min), max)
}

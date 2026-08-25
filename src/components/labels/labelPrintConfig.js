export const THERMAL_LABEL_PRESETS = {
  '100x50': { width: 100, height: 50 },
  '80x50': { width: 80, height: 50 }
}

export const DEFAULT_THERMAL_LABEL_PRESET = '100x50'
export const DEFAULT_THERMAL_LABEL_SIZE = THERMAL_LABEL_PRESETS[DEFAULT_THERMAL_LABEL_PRESET]
export const DEFAULT_THERMAL_LABEL_SAFE_AREA_MM = {
  left: 4,
  right: 2,
  top: 2,
  bottom: 2
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

export const getThermalLabelContentGeometry = (
  size = DEFAULT_THERMAL_LABEL_SIZE,
  safeArea = DEFAULT_THERMAL_LABEL_SAFE_AREA_MM
) => {
  const width = normalizeThermalMillimeters(size?.width, THERMAL_LABEL_LIMITS.width)
  const height = normalizeThermalMillimeters(size?.height, THERMAL_LABEL_LIMITS.height)
  const contentWidth = Math.max(width - safeArea.left - safeArea.right, 0)
  const contentHeight = Math.max(height - safeArea.top - safeArea.bottom, 0)

  return {
    width,
    height,
    safeArea,
    contentWidth,
    contentHeight,
    rightEdge: safeArea.left + contentWidth,
    bottomEdge: safeArea.top + contentHeight
  }
}

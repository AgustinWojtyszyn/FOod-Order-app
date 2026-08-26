import { LABEL_HEIGHT_MM, LABEL_WIDTH_MM } from './labelPrintGeometry'

export const LABEL_PRINT_SETTINGS_KEY = 'servifood.labelPrintSettings.v2'
const LEGACY_LABEL_PRINT_SETTINGS_KEY = 'servifood.labelPrintSettings.v1'

export const LABEL_PRINT_PROFILES = {
  recommended: {
    label: 'ZDesigner GC420t - ServiFood',
    widthMm: LABEL_WIDTH_MM,
    heightMm: LABEL_HEIGHT_MM,
    orientation: 'landscape'
  },
  landscape64x32: {
    label: '64x32 horizontal',
    widthMm: LABEL_WIDTH_MM,
    heightMm: LABEL_HEIGHT_MM,
    orientation: 'landscape'
  },
  portrait32x64: {
    label: '32x64 vertical',
    widthMm: 32,
    heightMm: 64,
    orientation: 'portrait'
  },
  thermal100x50: {
    label: '100x50',
    widthMm: 100,
    heightMm: 50,
    orientation: 'landscape'
  },
  thermal80x50: {
    label: '80x50',
    widthMm: 80,
    heightMm: 50,
    orientation: 'landscape'
  }
}

const numberInRange = (value, min, max, fallback) => {
  const number = Number(value)
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback
}

export const createDefaultLabelPrintSettings = () => ({
  profile: 'recommended',
  printerName: 'ZDesigner GC420t',
  widthMm: 64,
  heightMm: 32,
  orientation: 'landscape',
  margins: { top: 1.5, right: 2, bottom: 1.5, left: 2 },
  offsetXmm: 0,
  offsetYmm: 0,
  contentScale: 1,
  fontScale: 1,
  copiesPerOrder: 1,
  chromeHints: {
    scale: 100,
    pagesPerSheet: 1,
    margins: 'none',
    headersFooters: false
  },
  savedProfiles: {}
})

const normalizeSettings = (value) => {
  const defaults = createDefaultLabelPrintSettings()
  const source = value && typeof value === 'object' ? value : {}
  const margins = source.margins && typeof source.margins === 'object' ? source.margins : {}
  const chromeHints = source.chromeHints && typeof source.chromeHints === 'object' ? source.chromeHints : {}
  const savedProfiles = source.savedProfiles && typeof source.savedProfiles === 'object' ? source.savedProfiles : {}

  return {
    ...defaults,
    ...source,
    profile: typeof source.profile === 'string' ? source.profile : defaults.profile,
    printerName: source.printerName === 'Otra' ? 'Otra' : 'ZDesigner GC420t',
    widthMm: numberInRange(source.widthMm, 20, 150, defaults.widthMm),
    heightMm: numberInRange(source.heightMm, 20, 150, defaults.heightMm),
    orientation: source.orientation === 'portrait' ? 'portrait' : 'landscape',
    margins: {
      top: numberInRange(margins.top, 0, 10, defaults.margins.top),
      right: numberInRange(margins.right, 0, 10, defaults.margins.right),
      bottom: numberInRange(margins.bottom, 0, 10, defaults.margins.bottom),
      left: numberInRange(margins.left, 0, 10, defaults.margins.left)
    },
    offsetXmm: numberInRange(source.offsetXmm, -10, 10, defaults.offsetXmm),
    offsetYmm: numberInRange(source.offsetYmm, -10, 10, defaults.offsetYmm),
    contentScale: numberInRange(source.contentScale, 0.6, 1.2, defaults.contentScale),
    fontScale: numberInRange(source.fontScale, 0.7, 1.3, defaults.fontScale),
    copiesPerOrder: Math.round(numberInRange(source.copiesPerOrder, 1, 10, defaults.copiesPerOrder)),
    chromeHints: {
      ...defaults.chromeHints,
      ...chromeHints,
      scale: chromeHints.scale === 'custom'
        ? 'custom'
        : numberInRange(chromeHints.scale, 60, 120, defaults.chromeHints.scale)
    },
    savedProfiles
  }
}

export const readLabelPrintSettings = () => {
  if (typeof window === 'undefined') return createDefaultLabelPrintSettings()
  try {
    window.localStorage.removeItem(LEGACY_LABEL_PRINT_SETTINGS_KEY)
    return normalizeSettings(JSON.parse(window.localStorage.getItem(LABEL_PRINT_SETTINGS_KEY) || 'null'))
  } catch {
    return createDefaultLabelPrintSettings()
  }
}

export const saveLabelPrintSettings = (settings) => {
  const normalized = normalizeSettings(settings)
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(LEGACY_LABEL_PRINT_SETTINGS_KEY)
    window.localStorage.setItem(LABEL_PRINT_SETTINGS_KEY, JSON.stringify(normalized))
  }
  return normalized
}

export const getProfileSettings = (profile) => {
  const preset = LABEL_PRINT_PROFILES[profile]
  if (!preset) return null
  return {
    widthMm: preset.widthMm,
    heightMm: preset.heightMm,
    orientation: preset.orientation,
    profile
  }
}

export const expandLabelInstances = (orders = [], copiesPerOrder = 1) => {
  const copies = Math.round(numberInRange(copiesPerOrder, 1, 10, 1))
  return (Array.isArray(orders) ? orders : []).flatMap((order, orderIndex) =>
    Array.from({ length: copies }, (_, copyIndex) => ({
      order,
      orderIndex,
      copyIndex,
      labelInstanceId: `${order?.id || `selected-${orderIndex}`}-${copyIndex + 1}`
    }))
  )
}

export const getLabelPrintValidation = (settings) => {
  const width = Number(settings?.widthMm)
  const height = Number(settings?.heightMm)
  const margins = settings?.margins || {}
  const horizontalMargins = Number(margins.left) + Number(margins.right)
  const verticalMargins = Number(margins.top) + Number(margins.bottom)
  const orientationMismatch = settings?.orientation === 'landscape' ? height > width : width > height
  const offsetOutside = Number(settings?.offsetXmm) < -Number(margins.left) ||
    Number(settings?.offsetXmm) > Number(margins.right) ||
    Number(settings?.offsetYmm) < -Number(margins.top) ||
    Number(settings?.offsetYmm) > Number(margins.bottom)

  return {
    valid: Number.isFinite(width) && Number.isFinite(height) &&
      width >= 20 && width <= 150 && height >= 20 && height <= 150 &&
      horizontalMargins < width && verticalMargins < height && !offsetOutside,
    orientationMismatch,
    offsetOutside,
    horizontalMargins,
    verticalMargins,
    warning: Number(settings?.contentScale) < 0.75 || Number(settings?.contentScale) > 1.1 ||
      Number(settings?.fontScale) < 0.8 || Number(settings?.fontScale) > 1.2
  }
}

export const getSafeAreaDimensions = (settings) => ({
  widthMm: Number(settings?.widthMm) - Number(settings?.margins?.left || 0) - Number(settings?.margins?.right || 0),
  heightMm: Number(settings?.heightMm) - Number(settings?.margins?.top || 0) - Number(settings?.margins?.bottom || 0)
})

export { normalizeSettings }

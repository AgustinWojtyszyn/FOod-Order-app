import { describe, expect, it } from 'vitest'
import {
  LABEL_PRINT_SETTINGS_KEY,
  LABEL_PRINT_PROFILES,
  createDefaultLabelPrintSettings,
  expandLabelInstances,
  getLabelPrintValidation,
  getSafeAreaDimensions,
  normalizeSettings
} from './labelPrintSettings'

describe('labelPrintSettings', () => {
  it('provides the recommended defaults and one persisted key', () => {
    const settings = createDefaultLabelPrintSettings()
    expect(LABEL_PRINT_SETTINGS_KEY).toBe('servifood.labelPrintSettings.v2')
    expect(settings).toMatchObject({
      profile: 'recommended',
      printerName: 'ZDesigner GC420t',
      widthMm: 64,
      heightMm: 32,
      orientation: 'landscape',
      offsetXmm: 0,
      offsetYmm: 0,
      contentScale: 1,
      fontScale: 1,
      copiesPerOrder: 1
    })
    expect(settings.margins).toEqual({ top: 1.5, right: 2, bottom: 1.5, left: 2 })
  })

  it('normalizes corrupt values and keeps valid profile presets', () => {
    const settings = normalizeSettings({ widthMm: 999, heightMm: -1, copiesPerOrder: 99, margins: { left: 99 } })
    expect(settings.widthMm).toBe(64)
    expect(settings.heightMm).toBe(32)
    expect(getSafeAreaDimensions(settings)).toEqual({ widthMm: 60, heightMm: 29 })
    expect(settings.copiesPerOrder).toBe(1)
    expect(settings.margins.left).toBe(2)
    expect(LABEL_PRINT_PROFILES.portrait32x64).toMatchObject({ widthMm: 32, heightMm: 64, orientation: 'portrait' })
  })

  it('validates safe area and offset boundaries without changing page size', () => {
    const settings = createDefaultLabelPrintSettings()
    expect(getLabelPrintValidation(settings).valid).toBe(true)
    expect(getLabelPrintValidation({ ...settings, margins: { ...settings.margins, left: 64 } }).valid).toBe(false)
    expect(getLabelPrintValidation({ ...settings, offsetXmm: 3 }).valid).toBe(false)
    expect(settings.widthMm).toBe(64)
    expect(settings.heightMm).toBe(32)
  })

  it('ignores legacy settings and resets to the official horizontal profile', () => {
    expect(createDefaultLabelPrintSettings()).toMatchObject({
      widthMm: 64,
      heightMm: 32,
      orientation: 'landscape',
      margins: { left: 2, right: 2, top: 1.5, bottom: 1.5 },
      offsetXmm: 0,
      offsetYmm: 0,
      contentScale: 1,
      fontScale: 1
    })
  })

  it('expands two orders into six independent physical pages', () => {
    const instances = expandLabelInstances([{ id: 'fernando' }, { id: 'diego' }], 3)
    expect(instances).toHaveLength(6)
    expect(instances.map(instance => instance.order.id)).toEqual([
      'fernando', 'fernando', 'fernando', 'diego', 'diego', 'diego'
    ])
    expect(new Set(instances.map(instance => instance.labelInstanceId)).size).toBe(6)
  })
})

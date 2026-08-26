import { useState } from 'react'
import {
  createDefaultLabelPrintSettings,
  readLabelPrintSettings,
  saveLabelPrintSettings
} from '../../utils/labels/labelPrintSettings'

export const useLabelPrintSettings = () => {
  const [settings, setSettings] = useState(readLabelPrintSettings)

  const save = (nextSettings = settings) => {
    const saved = saveLabelPrintSettings(nextSettings)
    setSettings(saved)
    return saved
  }

  const reset = () => {
    const defaults = createDefaultLabelPrintSettings()
    if (typeof window !== 'undefined') window.localStorage.removeItem('servifood.labelPrintSettings.v1')
    return save(defaults)
  }

  return { settings, setSettings, save, reset }
}

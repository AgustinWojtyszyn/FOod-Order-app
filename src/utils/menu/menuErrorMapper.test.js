import { describe, expect, it } from 'vitest'
import {
  formatCompanyMenuSuccess,
  getWeeklyMenuFailureReason,
  hasTechnicalMenuErrorText,
  mapMenuError
} from './menuErrorMapper'

describe('menuErrorMapper', () => {
  it('translates permission/RLS errors without exposing technical details', () => {
    const mapped = mapMenuError(
      { message: 'new row violates row-level security policy', code: '42501' },
      { companyName: 'Genneia', dateISO: '2026-08-05' }
    )

    expect(mapped.message).toContain('No tenés permiso para modificar el menú de Genneia.')
    expect(mapped.message).toContain('Verificá que estés utilizando la empresa que tenés asignada.')
    expect(hasTechnicalMenuErrorText(mapped.message)).toBe(false)
  })

  it('explains connection errors and keeps changes available', () => {
    const mapped = mapMenuError(
      new TypeError('Failed to fetch'),
      { companyName: 'Genneia', dateISO: '2026-08-05', action: 'guardar' }
    )

    expect(mapped.kind).toBe('connection')
    expect(mapped.message).toContain('No pudimos conectarnos para guardar el menú.')
    expect(mapped.message).toContain('Tus cambios siguen en pantalla.')
    expect(mapped.retryText).toBe('Reintentar')
  })

  it('does not report full success when dinner fails after lunch was saved', () => {
    const mapped = mapMenuError(
      { message: 'permission denied' },
      {
        companyName: 'Genneia',
        dateISO: '2026-08-05',
        savedParts: ['almuerzo'],
        failedPart: 'cena'
      }
    )

    expect(mapped.kind).toBe('partial')
    expect(mapped.message).toContain('El menú de almuerzo se guardó correctamente, pero cena no pudo guardarse.')
    expect(mapped.message).toContain('Tus cambios de cena siguen disponibles para reintentar.')
  })

  it('explains the menu option cutoff with the allowed time', () => {
    const mapped = mapMenuError(
      { message: 'menu_add_cutoff_expired:10:00' },
      { companyName: 'La Laja', dateISO: '2026-08-05' }
    )

    expect(mapped.kind).toBe('cutoff')
    expect(mapped.message).toContain('Ya venció el límite para agregar opciones al menú de La Laja')
    expect(mapped.message).toContain('La hora máxima permitida era 10:00 hs de Argentina.')
  })

  it('formats contextual success with company and readable date', () => {
    expect(formatCompanyMenuSuccess({
      companyName: 'Genneia',
      dateISO: '2026-08-05',
      savedDinner: false
    })).toBe('Menú de Genneia guardado para el miércoles, 5 de agosto de 2026.')

    expect(formatCompanyMenuSuccess({
      companyName: 'Genneia',
      dateISO: '2026-08-05',
      savedDinner: true
    })).toBe('Menú y cena de Genneia guardados para el miércoles, 5 de agosto de 2026.')
  })

  it('maps weekly partial failures to readable reasons', () => {
    expect(getWeeklyMenuFailureReason({ status: 'invalid' })).toBe('falta el nombre de una opción')
    expect(getWeeklyMenuFailureReason({ status: 'error', error: new TypeError('Failed to fetch') })).toBe('error de conexión')
  })
})

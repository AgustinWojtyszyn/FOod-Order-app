import { describe, expect, it } from 'vitest'
import { getUserFriendlyErrorMessage } from './index'

describe('role update friendly errors', () => {
  it('transforma errores de permisos en un mensaje cerrado', () => {
    expect(getUserFriendlyErrorMessage(new Error('not_authorized'))).toBe(
      'No tenés permisos para realizar esta acción. Si creés que es un error, contactá a un administrador.'
    )
  })

  it('transforma rol invalido, usuario inexistente y ultimo admin', () => {
    expect(getUserFriendlyErrorMessage(new Error('invalid_role'))).toBe('El rol seleccionado no es válido.')
    expect(getUserFriendlyErrorMessage(new Error('user_not_found'))).toBe('No encontramos el usuario indicado. Actualizá la pantalla e intentá nuevamente.')
    expect(getUserFriendlyErrorMessage(new Error('last_admin'))).toBe('No se puede quitar el rol al último administrador.')
  })

  it('transforma errores de numeracion de nota de pedido', () => {
    expect(getUserFriendlyErrorMessage(new Error('remito_start_number_required'))).toBe(
      'La empresa no tiene configurado el número inicial de nota de pedido.'
    )
    expect(getUserFriendlyErrorMessage(new Error('remito_start_number_must_be_positive'))).toBe(
      'El número inicial de nota de pedido debe ser un entero positivo.'
    )
    expect(getUserFriendlyErrorMessage(new Error('company_remito_range_exhausted'))).toBe(
      'La empresa agotó su rango de numeración de notas de pedido.'
    )
    expect(getUserFriendlyErrorMessage(new Error('company_remito_numbering_not_configured'))).toBe(
      'La empresa existe, pero no tiene configurados todos los datos de numeración de notas de pedido.'
    )
    expect(getUserFriendlyErrorMessage(new Error('Could not find the function public.issue_company_remito'))).toBe(
      'Falta aplicar el SQL de numeración de notas de pedido en la base de datos.'
    )
  })
})

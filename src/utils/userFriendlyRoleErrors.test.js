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
})

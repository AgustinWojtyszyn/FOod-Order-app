import { describe, expect, it } from 'vitest'
import {
  isAdminExtraOrder,
  resolveAdminExtraCreator
} from './adminExtraOrders'

describe('adminExtraOrders', () => {
  it('identifica al creador por nombre y conserva el correo', () => {
    const creator = resolveAdminExtraCreator({
      order_origin: 'admin_extra',
      created_by_admin_id: 'admin-1',
      created_by_admin_name: 'Claudia Sarmiento',
      created_by_admin_email: 'claudia@servifood.com'
    })

    expect(isAdminExtraOrder({ order_origin: 'admin_extra' })).toBe(true)
    expect(creator).toMatchObject({
      label: 'Solicitado por Claudia Sarmiento',
      name: 'Claudia Sarmiento',
      email: 'claudia@servifood.com',
      hasTraceability: true
    })
  })

  it('usa el correo cuando es el unico dato de trazabilidad disponible', () => {
    const creator = resolveAdminExtraCreator({
      order_origin: 'admin_extra',
      created_by_admin_email: 'admin@example.com'
    })

    expect(creator).toMatchObject({
      label: 'Solicitado por admin@example.com',
      name: 'admin@example.com',
      email: 'admin@example.com',
      hasTraceability: true
    })
  })

  it('usa el fallback antiguo solo cuando no hay trazabilidad', () => {
    const creator = resolveAdminExtraCreator({
      order_origin: 'admin_extra'
    })

    expect(creator).toMatchObject({
      label: 'Solicitado por administrador',
      name: 'administrador',
      email: '',
      hasTraceability: false
    })
  })

  it('resuelve nombre por created_by_admin_id desde el mapa de personas', () => {
    const peopleById = new Map([
      ['admin-1', {
        person_id: 'person-1',
        display_name: 'Admin Resuelto',
        emails: ['resuelto@example.com']
      }]
    ])

    const creator = resolveAdminExtraCreator({
      order_origin: 'admin_extra',
      created_by_admin_id: 'admin-1'
    }, { peopleById })

    expect(creator).toMatchObject({
      label: 'Solicitado por Admin Resuelto',
      name: 'Admin Resuelto',
      email: 'resuelto@example.com',
      hasTraceability: true
    })
  })
})

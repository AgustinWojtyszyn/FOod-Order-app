import { describe, expect, it } from 'vitest'
import {
  canOperateBirthdayOrder,
  filterBirthdays,
  filterBirthdayCakeOrders,
  findBirthdayDuplicate,
  getAgeOnDate,
  getBirthdayDateForYear,
  getMinimumBirthYearForMaxAge,
  getNextBirthdayYear,
  isValidBirthdayDayMonth,
  summarizeBirthdayOrders,
  validateBirthdayForm
} from './birthdayUtils'

const companies = [
  { slug: 'laja', name: 'La Laja' },
  { slug: 'genneia', name: 'Genneia' }
]

const locations = {
  laja: ['La Laja'],
  genneia: ['Genneia']
}

describe('birthday utilities', () => {
  it('valida 29 de febrero y rechaza fechas imposibles', () => {
    expect(isValidBirthdayDayMonth(29, 2)).toBe(true)
    expect(isValidBirthdayDayMonth(30, 2)).toBe(false)
    expect(getBirthdayDateForYear({ day: 29, month: 2, year: 2028 })).toBe('2028-02-29')
    expect(getBirthdayDateForYear({ day: 29, month: 2, year: 2027 })).toBe('2027-02-28')
  })

  it('normaliza formulario, valida empresa/ubicacion y usa 1 tortita por defecto', () => {
    const result = validateBirthdayForm({
      person_name: '  Susana Agrello ',
      birth_day: '29',
      birth_month: '2',
      company_slug: 'laja',
      delivery_location: 'La Laja'
    }, { allowedCompanies: companies, companyLocations: locations })

    expect(result.valid).toBe(true)
    expect(result.birthday.person_name).toBe('Susana Agrello')
    expect(result.birthday.cake_quantity).toBe(1)
  })

  it('valida año de nacimiento opcional con edad real maxima de 99 años', () => {
    const today = new Date('2026-08-11T12:00:00Z')
    const baseForm = {
      person_name: 'Susana Agrello',
      birth_day: 11,
      birth_month: 8,
      company_slug: 'laja',
      delivery_location: 'La Laja'
    }

    expect(validateBirthdayForm(baseForm, { allowedCompanies: companies, companyLocations: locations, today }).valid).toBe(true)
    expect(validateBirthdayForm({ ...baseForm, birth_year: 1927 }, { allowedCompanies: companies, companyLocations: locations, today }).valid).toBe(true)
    expect(validateBirthdayForm({ ...baseForm, birth_year: 1926 }, { allowedCompanies: companies, companyLocations: locations, today }).errors.birth_year).toBe('La edad no puede superar los 99 años')
    expect(validateBirthdayForm({ ...baseForm, birth_year: 2027 }, { allowedCompanies: companies, companyLocations: locations, today }).errors.birth_year).toBe('No se permiten años futuros.')
  })

  it('calcula edad real y minimo visual contemplando dia y mes', () => {
    const today = new Date('2026-08-11T12:00:00Z')

    expect(getAgeOnDate({ day: 12, month: 8, year: 1926 }, today)).toBe(99)
    expect(getAgeOnDate({ day: 10, month: 8, year: 1926 }, today)).toBe(100)
    expect(getMinimumBirthYearForMaxAge({ day: 12, month: 8 }, today)).toBe(1926)
    expect(getMinimumBirthYearForMaxAge({ day: 10, month: 8 }, today)).toBe(1927)
  })

  it('bloquea empresas y ubicaciones fuera del alcance', () => {
    const result = validateBirthdayForm({
      person_name: 'Susana',
      birth_day: 10,
      birth_month: 3,
      company_slug: 'genneia',
      delivery_location: 'La Laja'
    }, { allowedCompanies: [companies[0]], companyLocations: locations })

    expect(result.valid).toBe(false)
    expect(result.errors.company_slug).toBe('No tenés permisos para esta empresa.')
    expect(result.errors.delivery_location).toBe('La ubicación no pertenece a la empresa.')
  })

  it('detecta duplicados razonables por persona empresa y fecha', () => {
    const duplicate = findBirthdayDuplicate({
      person_name: 'susana agrello',
      birth_day: 10,
      birth_month: 3,
      company_slug: 'laja'
    }, [{
      id: 'b-1',
      person_name: 'Susana Agrello',
      birth_day: 10,
      birth_month: 3,
      company_slug: 'laja',
      is_active: true
    }])

    expect(duplicate?.id).toBe('b-1')
  })

  it('calcula proxima ocurrencia y resume tortitas sin tocar pedidos de comida', () => {
    const today = new Date('2026-08-11T12:00:00Z')
    expect(getNextBirthdayYear({ day: 12, month: 8, today })).toBe(2026)
    expect(getNextBirthdayYear({ day: 10, month: 8, today })).toBe(2027)

    const summary = summarizeBirthdayOrders([
      { planned_delivery_date: '2026-08-11', status: 'pending', cake_quantity: 2 },
      { planned_delivery_date: '2026-08-12', status: 'prepared', cake_quantity: 1 },
      { planned_delivery_date: '2026-08-11', status: 'cancelled', cake_quantity: 4 }
    ], today)

    expect(summary).toMatchObject({
      today: 2,
      pending: 2,
      prepared: 1,
      cancelled: 4
    })
  })

  it('filtra cumpleaños y limita operaciones de estado a ServiFood', () => {
    const rows = [
      { person_name: 'Ana', company_slug: 'laja', delivery_location: 'La Laja', birth_month: 8, is_active: true },
      { person_name: 'Beto', company_slug: 'genneia', delivery_location: 'Genneia', birth_month: 9, is_active: false }
    ]

    expect(filterBirthdays(rows, { search: 'ana', company: 'all', location: 'all', month: 'all', status: 'active' })).toHaveLength(1)
    expect(canOperateBirthdayOrder({ isAdmin: false, isCompanyAdmin: false })).toBe(false)
    expect(canOperateBirthdayOrder({ isAdmin: false, isCompanyAdmin: true })).toBe(true)
  })

  it('filtra pedidos cancelados solo cuando se seleccionan explicitamente', () => {
    const orders = [
      { id: '1', company_slug: 'laja', delivery_location: 'La Laja', status: 'pending' },
      { id: '2', company_slug: 'laja', delivery_location: 'La Laja', status: 'prepared' },
      { id: '3', company_slug: 'laja', delivery_location: 'La Laja', status: 'cancelled' }
    ]

    expect(filterBirthdayCakeOrders(orders, { company: 'all', location: 'all', status: 'all' }).map((order) => order.id)).toEqual(['1', '2'])
    expect(filterBirthdayCakeOrders(orders, { company: 'all', location: 'all', status: 'cancelled' }).map((order) => order.id)).toEqual(['3'])
    expect(filterBirthdayCakeOrders(orders, { company: 'laja', location: 'La Laja', status: 'all' }).map((order) => order.id)).toEqual(['1', '2'])
  })
})

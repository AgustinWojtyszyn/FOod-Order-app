import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import OrderLunchMenuSection from './OrderLunchMenuSection'
import { filterOrderableMenuItems } from '../../utils/order/menuDisplay'

const sourceMenu = [
  { id: 'main', name: 'Menú principal', description: 'MILANESA CON PURE DE PAPAS', slotIndex: 0 },
  { id: 'bife-option', name: 'Opción 1', description: 'BIFE DE CARNE CON PURE DE CALABAZA', slotIndex: 1 },
  { id: 'omelette', name: 'Opción 2', description: 'OMELETTE DE ESPINACA RELLENO CON PURE DE PAPAS', slotIndex: 2 },
  { id: 'tarta', name: 'Opción 3', description: 'TARTA PASCUALINA', slotIndex: 3 },
  { id: 'bife-day', name: 'Opción 4', description: 'BIFE DE CARNE', slotIndex: 4 },
  { id: 'salad', name: 'Opción 5', description: 'ENSALADA MIX DE HOJAS', slotIndex: 5 },
  { id: 'celiac-source', name: 'Opción 6', description: 'CELIACO', slotIndex: 6 }
]

const renderLunchMenu = (companySlug, items = filterOrderableMenuItems(sourceMenu, companySlug)) =>
  renderToStaticMarkup(
    <OrderLunchMenuSection
      items={items}
      selectedItems={{}}
      onToggleItem={() => {}}
      companySlug={companySlug}
    />
  )

const textBetween = (html, from, to) => {
  const start = html.indexOf(from)
  const end = html.indexOf(to, start + from.length)
  return start >= 0 && end >= 0 ? html.slice(start, end) : ''
}

describe('OrderLunchMenuSection', () => {
  it.each(['isemar', 'igarreta'])('renders %s with continuous semantic slots and only removes Bife del día', (companySlug) => {
    const html = renderLunchMenu(companySlug)
    const option1 = textBetween(html, 'Opción 1', 'Opción 2')
    const option2 = textBetween(html, 'Opción 2', 'Opción 3')
    const option3 = textBetween(html, 'Opción 3', 'Opción 4')
    const option4 = textBetween(html, 'Opción 4', 'Opción 5')
    const option5 = html.slice(html.indexOf('Opción 5'))

    expect(option1).toContain('BIFE DE CARNE CON PURE DE CALABAZA')
    expect(option2).toContain('OMELETTE DE ESPINACA RELLENO CON PURE DE PAPAS')
    expect(option3).toContain('TARTA PASCUALINA')
    expect(option4).toContain('ENSALADA MIX DE HOJAS')
    expect(option5).toContain('Celíaco')
    expect((html.match(/Celíaco/g) || [])).toHaveLength(1)
    expect(option4).not.toContain('BIFE DE CARNE')
    expect(option3).not.toContain('ENSALADA MIX DE HOJAS')
    expect(option4).not.toContain('Celíaco')
    expect(html.indexOf('Opción 1')).toBeLessThan(html.indexOf('Opción 2'))
    expect(html.indexOf('Opción 2')).toBeLessThan(html.indexOf('Opción 3'))
    expect(html.indexOf('Opción 3')).toBeLessThan(html.indexOf('Opción 4'))
    expect(html.indexOf('Opción 4')).toBeLessThan(html.indexOf('Opción 5'))
  })

  it('keeps regular company rendering unchanged', () => {
    const html = renderLunchMenu('laja', sourceMenu)

    expect(textBetween(html, 'Opción 1', 'Opción 2')).toContain('BIFE DE CARNE CON PURE DE CALABAZA')
    expect(textBetween(html, 'Opción 3', 'Opción 4')).toContain('TARTA PASCUALINA')
    expect(textBetween(html, 'Opción 4', 'Opción 5')).toContain('BIFE DE CARNE')
    expect(textBetween(html, 'Opción 5', 'Opción 6')).toContain('ENSALADA MIX DE HOJAS')
    expect(html.slice(html.indexOf('Opción 6'))).toContain('CELIACO')
  })
})

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import OrderLunchMenuSection from './OrderLunchMenuSection'
import { filterOrderableMenuItems } from '../../utils/order/menuDisplay'

const sourceMenu = [
  { id: 'main', name: 'Menú principal', description: 'MILANESA CON PURE DE PAPAS', slotIndex: 0 },
  { id: 'bife', name: 'Opción 1', description: 'BIFE DE CARNE', slotIndex: 1 },
  { id: 'omelette', name: 'Opción 2', description: 'OMELETTE DE ESPINACA RELLENO CON PURE DE PAPAS', slotIndex: 2 },
  { id: 'tarta', name: 'Opción 3', description: 'TARTA PASCUALINA', slotIndex: 3 },
  { id: 'celiac-source', name: 'Opción 4', description: 'Celíaco', slotIndex: 4 },
  { id: 'salad', name: 'Opción 5', description: 'ENSALADA MIX DE HOJAS', slotIndex: 5 }
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
  it.each(['isemar', 'igarreta'])('renders %s semantic slots without shifting salad or duplicating Celíaco', (companySlug) => {
    const html = renderLunchMenu(companySlug)
    const option3 = textBetween(html, 'Opción 3', 'Opción 4')
    const option4 = textBetween(html, 'Opción 4', 'Opción 5')
    const option5 = html.slice(html.indexOf('Opción 5'))

    expect(option4).toContain('ENSALADA MIX DE HOJAS')
    expect(option5).toContain('Celíaco')
    expect((html.match(/Celíaco/g) || [])).toHaveLength(1)
    expect(html).not.toMatch(/BIFE/i)
    expect(option3).not.toContain('ENSALADA MIX DE HOJAS')
    expect(option4).not.toContain('Celíaco')
  })

  it('keeps regular company rendering unchanged', () => {
    const html = renderLunchMenu('laja', sourceMenu)

    expect(textBetween(html, 'Opción 3', 'Opción 4')).toContain('TARTA PASCUALINA')
    expect(textBetween(html, 'Opción 4', 'Opción 5')).toContain('Celíaco')
    expect(html).toMatch(/BIFE DE CARNE/)
  })
})

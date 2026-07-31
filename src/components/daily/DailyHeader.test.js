import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import DailyHeader from './DailyHeader.jsx'
import { addDaysToISO, getTodayISOInTimeZone, getTomorrowISOInTimeZone } from '../../utils/dateUtils'

const textFromChildren = (children) => {
  if (children === null || children === undefined || typeof children === 'boolean') return ''
  if (typeof children === 'string' || typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(textFromChildren).join('')
  if (React.isValidElement(children)) return textFromChildren(children.props.children)
  return ''
}

const findElements = (node, predicate, results = []) => {
  if (node === null || node === undefined || typeof node === 'boolean') return results
  if (Array.isArray(node)) {
    node.forEach(child => findElements(child, predicate, results))
    return results
  }
  if (!React.isValidElement(node)) return results

  if (predicate(node)) results.push(node)
  findElements(node.props.children, predicate, results)
  return results
}

const baseProps = {
  stats: { total: 0, pending: 0, archived: 0 },
  activeLocationsCount: 0,
  tomorrowLabel: 'jueves, 2 de julio de 2026',
  operationalDate: '2026-07-02',
  onDeliveryDateChange: () => {},
  exportCompany: 'all',
  onExportCompanyChange: () => {},
  locations: [],
  exportableOrdersCount: 0,
  onExportExcel: () => {},
  onGenerateNotaPedido: () => {},
  onShareWhatsApp: () => {},
  refreshing: false,
  onRefresh: () => {},
  onExportPdf: () => {},
  onArchiveAll: () => {},
  sortedOrdersLength: 0,
  pendingOrdersCount: 0,
  isAdmin: true
}

const getQuickButton = (tree, label) => {
  const button = findElements(tree, element =>
    element.type === 'button' && textFromChildren(element.props.children) === label
  )[0]
  expect(button, `button ${label}`).toBeTruthy()
  return button
}

describe('DailyHeader delivery date selector', () => {
  it.each([
    ['Día anterior', addDaysToISO(baseProps.operationalDate, -1)],
    ['Hoy', getTodayISOInTimeZone()],
    ['Mañana', getTomorrowISOInTimeZone()],
    ['Día siguiente', addDaysToISO(baseProps.operationalDate, 1)]
  ])('updates deliveryDate when pressing %s', (label, expectedDate) => {
    const onDeliveryDateChange = vi.fn()
    const tree = DailyHeader({
      ...baseProps,
      onDeliveryDateChange
    })

    getQuickButton(tree, label).props.onClick()

    expect(onDeliveryDateChange).toHaveBeenCalledWith(expectedDate)
  })

  it('updates deliveryDate from the date input', () => {
    const onDeliveryDateChange = vi.fn()
    const tree = DailyHeader({
      ...baseProps,
      onDeliveryDateChange
    })

    const input = findElements(tree, element =>
      element.type === 'input' && element.props.id === 'daily-delivery-date'
    )[0]

    expect(input.props.value).toBe(baseProps.operationalDate)
    input.props.onChange({ target: { value: '2026-07-05' } })

    expect(onDeliveryDateChange).toHaveBeenCalledWith('2026-07-05')
  })
})

import React from 'react'
import { describe, expect, it } from 'vitest'
import MonthlyOperationalSummary from './MonthlyOperationalSummary'

const textFromChildren = (children) => {
  if (children === null || children === undefined || typeof children === 'boolean') return ''
  if (typeof children === 'string' || typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(textFromChildren).join('')
  if (React.isValidElement(children)) {
    if (typeof children.type === 'function') return textFromChildren(children.type(children.props))
    return textFromChildren(children.props.children)
  }
  return ''
}

const findElements = (node, predicate, results = []) => {
  if (node === null || node === undefined || typeof node === 'boolean') return results
  if (Array.isArray(node)) {
    node.forEach(child => findElements(child, predicate, results))
    return results
  }
  if (!React.isValidElement(node)) return results
  if (typeof node.type === 'function') {
    findElements(node.type(node.props), predicate, results)
    return results
  }
  if (predicate(node)) results.push(node)
  findElements(node.props.children, predicate, results)
  return results
}

const baseProps = {
  totalsForView: { pedidos: 6 },
  dailyDataForView: {
    daily_breakdown: [
      { date: '2026-07-01', count: 1 },
      { date: '2026-07-02', count: 0 },
      { date: '2026-07-03', count: 5 }
    ],
    range_totals: {
      count: 6,
      lunch_items: 4,
      dinner_items: 2
    }
  },
  ordersByDayForView: {},
  empresasForView: [
    { empresa: 'Genneia Norte con nombre largo', cantidadPedidos: 4 },
    { empresa: 'DistroCuyo', cantidadPedidos: 2 }
  ]
}

describe('MonthlyOperationalSummary', () => {
  it('renderiza metricas operativas principales', () => {
    const tree = MonthlyOperationalSummary(baseProps)
    const text = textFromChildren(tree)

    expect(text).toContain('Resumen operativo del rango')
    expect(text).toContain('3 días calendario analizados')
    expect(text).toContain('Promedio diario')
    expect(text).toContain('2')
    expect(text).toContain('Día pico')
    expect(text).toContain('03/07/2026')
    expect(text).toContain('Almuerzo / cena')
    expect(text).toContain('4 / 2')
  })

  it('renderiza estado vacio cerrado', () => {
    const tree = MonthlyOperationalSummary({
      totalsForView: { pedidos: 0 },
      dailyDataForView: {
        daily_breakdown: [{ date: '2026-07-01', count: 0 }],
        range_totals: { count: 0, lunch_items: 0, dinner_items: 0 }
      },
      ordersByDayForView: {},
      empresasForView: []
    })
    const text = textFromChildren(tree)

    expect(text).toContain('Sin pedidos para el rango filtrado')
    expect(text).toContain('Sin datos')
    expect(text).toContain('Sin variación')
  })

  it('renderiza top 3 y tendencia', () => {
    const tree = MonthlyOperationalSummary({
      ...baseProps,
      empresasForView: [
        { empresa: 'Alfa', cantidadPedidos: 6 },
        { empresa: 'Beta', cantidadPedidos: 4 },
        { empresa: 'Cuyo', cantidadPedidos: 2 },
        { empresa: 'Delta', cantidadPedidos: 1 }
      ]
    })
    const text = textFromChildren(tree)

    expect(text).toContain('Top 3 empresas')
    expect(text).toContain('Alfa')
    expect(text).toContain('Beta')
    expect(text).toContain('Cuyo')
    expect(text).not.toContain('Delta')
    expect(text).toContain('Tendencia del rango')
    expect(text).toContain('+4 pedidos')
  })

  it('mantiene una estructura responsive sin scroll horizontal propio', () => {
    const tree = MonthlyOperationalSummary(baseProps)
    const sections = findElements(tree, element => element.type === 'section')
    expect(sections[0].props.className).toContain('rounded-xl')
    expect(sections[0].props.className).not.toContain('overflow-x-auto')

    const metricGrid = findElements(tree, element =>
      typeof element.props.className === 'string' &&
      element.props.className.includes('xl:grid-cols-6')
    )[0]
    expect(metricGrid.props.className).toContain('grid-cols-1')
    expect(metricGrid.props.className).toContain('sm:grid-cols-2')
  })
})

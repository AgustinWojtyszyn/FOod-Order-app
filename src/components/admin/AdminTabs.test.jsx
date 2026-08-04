import React from 'react'
import { describe, expect, it } from 'vitest'
import AdminTabs from './AdminTabs.jsx'

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

describe('AdminTabs role-specific visibility', () => {
  it('keeps global admin tabs including Cena', () => {
    const tree = AdminTabs({
      activeTab: 'menu',
      onChange: () => {},
      showCafeteria: true,
      canManageGlobalAdmin: true,
      showDinner: true
    })

    const labels = findElements(tree, element => element.type === 'button')
      .map((button) => textFromChildren(button.props.children))

    expect(labels).toEqual(expect.arrayContaining(['Usuarios', 'Menú', 'Cena', 'Opciones', 'Empresas', 'Cafeteria']))
  })

  it('hides the separate Cena tab for company admins', () => {
    const tree = AdminTabs({
      activeTab: 'menu',
      onChange: () => {},
      showCafeteria: false,
      canManageGlobalAdmin: false,
      showDinner: false
    })

    const labels = findElements(tree, element => element.type === 'button')
      .map((button) => textFromChildren(button.props.children))

    expect(labels).toEqual(['Menú'])
  })
})

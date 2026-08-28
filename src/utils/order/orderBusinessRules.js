const isGenneiaPostreOption = (isGenneia, option = {}) => {
  return isGenneia && (option.title || '').toLowerCase().includes('postre')
}

const normalizeText = (val = '') => {
  return (val || '').toString().trim().toLowerCase()
}

const isBeverageOption = (option = {}) => {
  const title = normalizeText(option.title || '')
  return title.includes('bebida')
}

const isDessertOption = (option = {}) => {
  const title = normalizeText(option.title || '')
  return title.includes('postre')
}

const isBeverageOrDessertOption = (option = {}) => {
  return isBeverageOption(option) || isDessertOption(option)
}

const matchesOverrideKeyword = (val = '') => {
  const t = (val || '').toString().toLowerCase()
  return (
    t.includes('mp') ||
    t.includes('mp cena') ||
    t.includes('menú principal') ||
    t.includes('menu principal') ||
    t.includes('menú cena') ||
    t.includes('menu cena') ||
    t.includes('menu de cena') ||
    t.includes('menú de cena') ||
    t.includes('opción cena') ||
    t.includes('veggie') ||
    t.includes('veg') ||
    t.includes('vegetar')
  )
}

const isDinnerOverrideValue = (val) => {
  if (Array.isArray(val)) return val.some(v => matchesOverrideKeyword(v))
  return matchesOverrideKeyword(val)
}

const hasDinnerOverrideInResponses = (responses = []) => {
  if (!Array.isArray(responses)) return false
  return responses.some(r => {
    if (!r) return false
    const resp = r.response
    if (isDinnerOverrideValue(resp)) return true
    if (matchesOverrideKeyword(r.title || '')) return true
    return false
  })
}

export {
  isGenneiaPostreOption,
  isBeverageOption,
  isDessertOption,
  isBeverageOrDessertOption,
  matchesOverrideKeyword,
  isDinnerOverrideValue,
  hasDinnerOverrideInResponses
}

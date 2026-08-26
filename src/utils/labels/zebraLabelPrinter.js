import { buildLabelOrder } from './labelOrderUtils'

export const ZEBRA_LABEL_WIDTH_MM = 64
export const ZEBRA_LABEL_HEIGHT_MM = 32
export const ZEBRA_DPI = 203
export const ZEBRA_DOTS_PER_MM = 8
export const ZEBRA_LABEL_WIDTH_DOTS = Math.round(ZEBRA_LABEL_WIDTH_MM * ZEBRA_DOTS_PER_MM)
export const ZEBRA_LABEL_HEIGHT_DOTS = Math.round(ZEBRA_LABEL_HEIGHT_MM * ZEBRA_DOTS_PER_MM)

const normalizeText = (value = '') =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\^~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const uppercase = (value) => normalizeText(value).toUpperCase()

const formatDate = (value) => {
  const raw = String(value || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return 'SIN FECHA'
  const [year, month, day] = raw.split('-')
  return `${day}/${month}/${year}`
}

const zplText = (x, y, fontHeight, fontWidth, width, maxLines, text) =>
  `^FO${x},${y}^A0N,${fontHeight},${fontWidth}^FB${width},${maxLines},2,L,0^FD${uppercase(text)}^FS`

export const buildZebraLabelZpl = (order = {}) => {
  const label = buildLabelOrder(order)
  const meta = [label.companyLabel, label.serviceLabel, formatDate(label.delivery_date)].filter(Boolean).join('   ')
  const delivery = label.deliveryLocation ? `ENTREGA: ${label.deliveryLocation}` : ''
  const orderText = `PEDIDO: ${label.itemsText || 'Sin detalle'}`
  const beverage = label.beverages.length > 0 ? `BEBIDA: ${label.beverages.join(', ')}` : ''
  const footer = label.fruitDessertChoice ? `FRUTA O POSTRE: ${label.fruitDessertChoice}` : ''

  return [
    '^XA',
    '^CI28',
    '^PON',
    '^MNY',
    '^MMT',
    '^MTD',
    '^PR3',
    '^MD10',
    `^PW${ZEBRA_LABEL_WIDTH_DOTS}`,
    `^LL${ZEBRA_LABEL_HEIGHT_DOTS}`,
    '^LH0,0',
    '^LS0',
    '^LT0',
    '^FO8,8^GB496,240,3^FS',
    zplText(22, 20, 30, 26, 405, 1, label.customerName || 'Cliente sin nombre'),
    zplText(423, 19, 18, 16, 66, 1, label.shortCode || ''),
    '^FO18,56^GB476,0,2^FS',
    zplText(22, 68, 18, 16, 455, 1, meta),
    zplText(22, 96, 17, 15, 455, 1, delivery),
    zplText(22, 124, 17, 15, 455, 2, orderText),
    zplText(22, 178, 17, 15, 455, 1, beverage),
    zplText(22, 206, 16, 14, 455, 1, footer),
    '^PQ1,0,1,Y',
    '^XZ'
  ].filter(Boolean).join('\n')
}

export const buildZebraLabelsZpl = (orders = []) =>
  (Array.isArray(orders) ? orders : [])
    .filter(order => order?.id)
    .map(buildZebraLabelZpl)
    .join('\n')

export const downloadZpl = (zpl) => {
  const blob = new Blob([zpl], { type: 'application/vnd.zebra-zpl' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `etiquetas-zebra-${new Date().toISOString().slice(0, 10)}.zpl`
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export const isZebraBrowserPrintAvailable = () => Boolean(window.BrowserPrint?.getLocalDevices)

export const getDefaultZebraPrinter = () => new Promise((resolve, reject) => {
  const browserPrint = window.BrowserPrint
  if (!browserPrint?.getDefaultDevice) {
    reject(new Error('Zebra Browser Print no esta disponible.'))
    return
  }

  browserPrint.getDefaultDevice('printer', resolve, reject)
})

export const getZebraPrinters = () => new Promise((resolve, reject) => {
  const browserPrint = window.BrowserPrint
  if (!browserPrint?.getLocalDevices) {
    reject(new Error('Zebra Browser Print no esta disponible.'))
    return
  }

  browserPrint.getLocalDevices(
    devices => resolve((Array.isArray(devices) ? devices : []).filter(device => device)),
    reject,
    'printer'
  )
})

const sendToPrinter = (printer, zpl) => new Promise((resolve, reject) => {
  if (!printer?.send) {
    reject(new Error('No se encontro una impresora Zebra disponible.'))
    return
  }
  printer.send(zpl, resolve, reject)
})

export const getPrinterId = (printer = {}) =>
  String(printer.uid || printer.name || printer.deviceType || '').trim()

export const getPrinterLabel = (printer = {}) =>
  [printer.name, printer.connection, printer.uid].map(value => String(value || '').trim()).filter(Boolean).join(' · ') || 'Impresora Zebra'

export const printZebraLabelsToPrinter = async (orders = [], printer = null) => {
  const safeOrders = (Array.isArray(orders) ? orders : []).filter(order => order?.id)
  if (safeOrders.length === 0) {
    return { printed: false, count: 0, error: new Error('No hay etiquetas para imprimir.') }
  }

  const zpl = buildZebraLabelsZpl(safeOrders)
  await sendToPrinter(printer, zpl)
  return { printed: true, count: safeOrders.length, zpl, error: null }
}

export const printZebraLabels = async (orders = [], printer = null) => {
  const safeOrders = (Array.isArray(orders) ? orders : []).filter(order => order?.id)
  if (safeOrders.length === 0) {
    return { printed: false, downloaded: false, count: 0, error: new Error('No hay etiquetas para imprimir.') }
  }

  const zpl = buildZebraLabelsZpl(safeOrders)

  try {
    const targetPrinter = printer || await getDefaultZebraPrinter()
    await sendToPrinter(targetPrinter, zpl)
    return { printed: true, downloaded: false, count: safeOrders.length, zpl, error: null }
  } catch (error) {
    return { printed: false, downloaded: false, count: safeOrders.length, zpl, error }
  }
}

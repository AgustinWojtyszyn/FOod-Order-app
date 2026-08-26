import { buildLabelOrder } from './labelOrderUtils'

export const ZEBRA_LABEL_WIDTH_MM = 64
export const ZEBRA_LABEL_HEIGHT_MM = 32
export const ZEBRA_DPI = 203
export const ZEBRA_DOTS_PER_MM = 8
export const ZEBRA_LABEL_WIDTH_DOTS = Math.round(ZEBRA_LABEL_WIDTH_MM * ZEBRA_DOTS_PER_MM)
export const ZEBRA_LABEL_HEIGHT_DOTS = Math.round(ZEBRA_LABEL_HEIGHT_MM * ZEBRA_DOTS_PER_MM)
export const ZEBRA_DEFAULT_PRINTER_ID = '__zebra_default__'
export const ZEBRA_FALLBACK_PRINTER_ID = '__zebra_fallback_default__'
export const ZEBRA_BROWSER_PRINT_TIMEOUT_MS = 5000
const ZEBRA_BROWSER_PRINT_ENDPOINTS = [
  'https://localhost:9101/',
  'https://127.0.0.1:9101/',
  'http://localhost:9100/',
  'http://127.0.0.1:9100/'
]

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
    zplText(22, 102, 20, 18, 455, 2, orderText),
    zplText(22, 164, 18, 16, 455, 1, beverage),
    zplText(22, 194, 17, 15, 455, 1, footer),
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

export class ZebraBrowserPrintTimeoutError extends Error {
  constructor(operation) {
    super(`${operation} excedio ${ZEBRA_BROWSER_PRINT_TIMEOUT_MS} ms`)
    this.name = 'ZebraBrowserPrintTimeoutError'
    this.code = 'ZEBRA_BROWSER_PRINT_TIMEOUT'
  }
}

const withBrowserPrintTimeout = (operation, register, timeoutMs = ZEBRA_BROWSER_PRINT_TIMEOUT_MS) =>
  new Promise((resolve, reject) => {
    let settled = false
    const timeoutId = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new ZebraBrowserPrintTimeoutError(operation))
    }, timeoutMs)

    const finish = (handler, value) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      handler(value)
    }

    try {
      register(
        value => finish(resolve, value),
        error => finish(reject, error instanceof Error ? error : new Error(String(error || operation)))
      )
    } catch (error) {
      finish(reject, error)
    }
  })

const requestBrowserPrint = (baseUrl, method, path, body = null) => new Promise((resolve, reject) => {
  const xhr = new XMLHttpRequest()
  let settled = false
  const rejectOnce = (error) => {
    if (settled) return
    settled = true
    reject(error)
  }
  const resolveOnce = (value) => {
    if (settled) return
    settled = true
    resolve(value)
  }

  xhr.open(method, `${baseUrl}${path}`, true)
  xhr.timeout = ZEBRA_BROWSER_PRINT_TIMEOUT_MS
  xhr.setRequestHeader('Content-Type', 'text/plain;charset=UTF-8')
  xhr.onreadystatechange = () => {
    if (xhr.readyState !== XMLHttpRequest.DONE) return
    if (xhr.status >= 200 && xhr.status < 300) {
      resolveOnce(xhr.responseText)
      return
    }
    rejectOnce(new Error(xhr.responseText || `Zebra Browser Print respondio ${xhr.status}`))
  }
  xhr.onerror = () => rejectOnce(new Error(`No se pudo conectar a ${baseUrl}`))
  xhr.onabort = () => rejectOnce(new Error(`Conexion abortada con ${baseUrl}`))
  xhr.ontimeout = () => rejectOnce(new ZebraBrowserPrintTimeoutError(`${method} ${baseUrl}${path}`))
  xhr.send(body ? JSON.stringify(body) : undefined)
})

const parseBrowserPrintDevice = (raw) => {
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (_error) {
    const fields = {}
    String(raw)
      .split(/\r?\n\t?/)
      .map(line => line.trim())
      .filter(Boolean)
      .forEach(line => {
        const separatorIndex = line.indexOf(':')
        if (separatorIndex === -1) return
        const key = line.slice(0, separatorIndex).trim()
        const value = line.slice(separatorIndex + 1).trim()
        if (key) fields[key] = value
      })

    return fields.name || fields.uid || fields.deviceType ? {
      connection: fields.connection,
      deviceType: fields.deviceType,
      manufacturer: fields.manufacturer,
      name: fields.name,
      provider: fields.provider,
      uid: fields.uid,
      version: fields.version ? Number(fields.version) || fields.version : 0
    } : null
  }
}

const getDefaultPrinterFromLocalEndpoint = async (endpoint) => {
  const paths = ['default?type=printer', 'default']
  let lastError = null

  for (const path of paths) {
    try {
      const raw = await requestBrowserPrint(endpoint, 'GET', path)
      const device = parseBrowserPrintDevice(raw)
      if (device) return createLocalBrowserPrintDevice(device, endpoint)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error('No se encontro una impresora Zebra predeterminada.')
}

const withFirstAvailableEndpoint = async (handler) => {
  let lastError = null
  for (const endpoint of ZEBRA_BROWSER_PRINT_ENDPOINTS) {
    try {
      return await handler(endpoint)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error('No se pudo conectar a Zebra Browser Print.')
}

const createLocalBrowserPrintDevice = (device, endpoint) => ({
  ...device,
  send: (data, success, failure) => {
    requestBrowserPrint(endpoint, 'POST', 'write', { device, data })
      .then(response => success?.(response))
      .catch(error => failure?.(error?.message || String(error)))
  }
})

const getBrowserPrintSdk = () => globalThis.window?.BrowserPrint || globalThis.BrowserPrint || null

export const isZebraBrowserPrintAvailable = () => Boolean(getBrowserPrintSdk()?.getDefaultDevice)

export const getDefaultZebraPrinter = () => new Promise((resolve, reject) => {
  const browserPrint = getBrowserPrintSdk()
  if (browserPrint?.getDefaultDevice) {
    withBrowserPrintTimeout(
      'BrowserPrint.getDefaultDevice',
      (success, failure) => browserPrint.getDefaultDevice('printer', success, failure)
    ).then(resolve).catch(reject)
    return
  }

  withFirstAvailableEndpoint(getDefaultPrinterFromLocalEndpoint).then(resolve).catch(() => {
    reject(new Error('Zebra Browser Print no esta disponible.'))
  })
})

export const getZebraPrinters = () => new Promise((resolve, reject) => {
  const browserPrint = getBrowserPrintSdk()
  if (browserPrint?.getLocalDevices) {
    withBrowserPrintTimeout(
      'BrowserPrint.getLocalDevices',
      (success, failure) => browserPrint.getLocalDevices(
        devices => success((Array.isArray(devices) ? devices : []).filter(device => device)),
        failure,
        'printer'
      )
    ).then(resolve).catch(reject)
    return
  }

  if (browserPrint?.getDefaultDevice) {
    resolve([])
    return
  }

  withFirstAvailableEndpoint(async (endpoint) => {
    const raw = await requestBrowserPrint(endpoint, 'GET', 'available')
    const response = JSON.parse(raw || '{}')
    const printers = Array.isArray(response.printer) ? response.printer : []
    return printers.map(device => createLocalBrowserPrintDevice(device, endpoint))
  }).then(resolve).catch(() => {
    reject(new Error('Zebra Browser Print no esta disponible.'))
  })
})

const sendToPrinter = (printer, zpl) => {
  if (!printer?.send) {
    return Promise.reject(new Error('No se encontro una impresora Zebra disponible.'))
  }
  return withBrowserPrintTimeout(
    'BrowserPrint.device.send',
    (success, failure) => printer.send(zpl, success, failure)
  )
}

export const getPrinterIdentity = (printer = {}) =>
  [printer.uid, printer.name, printer.connection, printer.deviceType]
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .join('|')

export const getPrinterId = (printer = {}) =>
  getPrinterIdentity(printer) || String(printer.uid || printer.name || printer.deviceType || '').trim()

export const getPrinterLabel = (printer = {}) =>
  [printer.name, printer.connection, printer.uid].map(value => String(value || '').trim()).filter(Boolean).join(' · ') || 'Impresora Zebra'

export const dedupeZebraPrinters = (printers = [], defaultPrinter = null) => {
  const seen = new Set()
  if (defaultPrinter) {
    const defaultIdentity = getPrinterIdentity(defaultPrinter)
    if (defaultIdentity) seen.add(defaultIdentity)
  }

  return (Array.isArray(printers) ? printers : []).filter(printer => {
    const identity = getPrinterIdentity(printer)
    if (!identity || seen.has(identity)) return false
    seen.add(identity)
    return true
  })
}

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
    return {
      printed: false,
      downloaded: false,
      uncertain: error instanceof ZebraBrowserPrintTimeoutError && error.message.includes('device.send'),
      count: safeOrders.length,
      zpl,
      error
    }
  }
}

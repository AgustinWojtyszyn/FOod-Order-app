import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ZEBRA_BROWSER_PRINT_TIMEOUT_MS,
  ZebraBrowserPrintTimeoutError,
  ZEBRA_LABEL_HEIGHT_DOTS,
  ZEBRA_LABEL_WIDTH_DOTS,
  buildZebraLabelsZpl,
  dedupeZebraPrinters,
  getDefaultZebraPrinter,
  getPrinterId,
  getPrinterLabel,
  getZebraPrinters,
  isZebraBrowserPrintAvailable,
  printZebraLabels
} from './zebraLabelPrinter'

const buildOrder = (id = 'order-1') => ({
  id,
  customer_name: 'Gabriel Mercado',
  company: 'Genneia',
  delivery_date: '2026-08-05',
  service: 'lunch',
  items: [{ name: 'Plato Principal', quantity: 1 }],
  custom_responses: [
    { title: 'Bebida', response: 'Coca cola' },
    { title: 'Fruta o postre', response: 'Fruta' }
  ]
})

const installMockXhr = ({ responses = {}, failures = [], timeouts = [] } = {}) => {
  const requests = []

  class MockXhr {
    static DONE = 4

    open(method, url) {
      this.method = method
      this.url = url
    }

    setRequestHeader(key, value) {
      this.headers = { ...(this.headers || {}), [key]: value }
    }

    send(body) {
      requests.push({ method: this.method, url: this.url, body, headers: this.headers || {} })
      const shouldTimeout = timeouts.some(pattern => this.url.includes(pattern))
      if (shouldTimeout) {
        setTimeout(() => this.ontimeout?.(), this.timeout || ZEBRA_BROWSER_PRINT_TIMEOUT_MS)
        return
      }

      const shouldFail = failures.some(pattern => this.url.includes(pattern))
      if (shouldFail) {
        this.onerror?.()
        return
      }

      this.status = 200
      this.readyState = MockXhr.DONE
      this.responseText = responses[this.url] ?? ''
      this.onreadystatechange?.()
    }
  }

  vi.stubGlobal('XMLHttpRequest', MockXhr)
  return requests
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('zebraLabelPrinter', () => {
  it('generates one 64 x 32 mm 203 dpi ZPL label per order', () => {
    const zpl = buildZebraLabelsZpl([buildOrder('order-1'), buildOrder('order-2')])

    expect(ZEBRA_LABEL_WIDTH_DOTS).toBe(512)
    expect(ZEBRA_LABEL_HEIGHT_DOTS).toBe(256)
    expect((zpl.match(/\^XA/g) || [])).toHaveLength(2)
    expect(zpl).toContain('^PW512')
    expect(zpl).toContain('^LL256')
    expect(zpl).toContain('^PQ1,0,1,Y')
    expect(zpl).not.toContain('ENTREGA:')
  })

  it('lists Zebra printers through the local Browser Print service when the global SDK is absent', async () => {
    const availableUrl = 'https://localhost:9101/available'
    const requests = installMockXhr({
      responses: {
        [availableUrl]: JSON.stringify({
          printer: [
            { name: 'ZDesigner ZD220', uid: 'usb-zebra-1', connection: 'usb', deviceType: 'printer' }
          ]
        })
      }
    })

    const printers = await getZebraPrinters()

    expect(printers).toHaveLength(1)
    expect(getPrinterId(printers[0])).toContain('usb-zebra-1')
    expect(getPrinterLabel(printers[0])).toContain('ZDesigner ZD220')
    expect(requests[0]).toMatchObject({ method: 'GET', url: availableUrl })
  })

  it('gets the default printer and sends ZPL through the local write endpoint', async () => {
    const defaultUrl = 'https://localhost:9101/default?type=printer'
    const requests = installMockXhr({
      responses: {
        [defaultUrl]: JSON.stringify({ name: 'Zebra default', uid: 'default-zebra', connection: 'usb', deviceType: 'printer' }),
        'https://localhost:9101/write': 'OK'
      }
    })

    const printer = await getDefaultZebraPrinter()
    const result = await printZebraLabels([buildOrder()], printer)
    const writeRequest = requests.find(request => request.url === 'https://localhost:9101/write')
    const payload = JSON.parse(writeRequest.body)

    expect(result.printed).toBe(true)
    expect(writeRequest).toMatchObject({ method: 'POST' })
    expect(payload.device.uid).toBe('default-zebra')
    expect(payload.data).toContain('^PW512')
    expect(payload.data).toContain('GABRIEL MERCADO')
  })

  it('detects the local default printer from the text /default endpoint when the typed endpoint fails', async () => {
    const requests = installMockXhr({
      failures: ['https://localhost:9101/default?type=printer'],
      responses: {
        'https://localhost:9101/default': [
          'device:',
          '\tname: Zebra texto local',
          '\tdeviceType: printer',
          '\tconnection: usb',
          '\tuid: texto-local-uid',
          '\tprovider: Zebra',
          '\tmanufacturer: Zebra'
        ].join('\n')
      }
    })

    const printer = await getDefaultZebraPrinter()

    expect(printer.name).toBe('Zebra texto local')
    expect(printer.uid).toBe('texto-local-uid')
    expect(printer.send).toBeTypeOf('function')
    expect(requests.map(request => request.url)).toEqual([
      'https://localhost:9101/default?type=printer',
      'https://localhost:9101/default'
    ])
  })

  it('falls through to the next endpoint when the first Browser Print endpoint refuses connection', async () => {
    const requests = installMockXhr({
      failures: ['https://localhost:9101/available'],
      responses: {
        'https://127.0.0.1:9101/available': JSON.stringify({
          printer: [{ name: 'Fallback Zebra', uid: 'fallback-zebra', connection: 'usb', deviceType: 'printer' }]
        })
      }
    })

    const printers = await getZebraPrinters()

    expect(printers[0].uid).toBe('fallback-zebra')
    expect(requests.map(request => request.url)).toEqual([
      'https://localhost:9101/available',
      'https://127.0.0.1:9101/available'
    ])
  })

  it('prints through the default SDK printer even when local device listing fails', async () => {
    const send = vi.fn((zpl, success) => success?.('OK'))
    const defaultPrinter = { name: 'Impresora real desde Browser Print', uid: 'default-sdk-printer', send }
    const getLocalDevices = vi.fn((_success, failure) => failure?.(new Error('list failed')))
    const getDefaultDevice = vi.fn((_type, success) => success(defaultPrinter))

    vi.stubGlobal('BrowserPrint', { getDefaultDevice, getLocalDevices })

    const listResult = await getZebraPrinters().catch(error => error)
    const printResult = await printZebraLabels([buildOrder()])

    expect(listResult).toBeInstanceOf(Error)
    expect(printResult.printed).toBe(true)
    expect(getDefaultDevice).toHaveBeenCalledWith('printer', expect.any(Function), expect.any(Function))
    expect(getLocalDevices).toHaveBeenCalled()
    expect(send).toHaveBeenCalledWith(expect.stringContaining('^PW512'), expect.any(Function), expect.any(Function))
  })

  it('gets the default SDK printer and lists SDK printers when both callbacks succeed', async () => {
    const defaultPrinter = { name: 'Default SDK Zebra', uid: 'default-sdk', send: vi.fn() }
    const localPrinter = { name: 'Local SDK Zebra', uid: 'local-sdk', send: vi.fn() }
    const getDefaultDevice = vi.fn((_type, success) => success(defaultPrinter))
    const getLocalDevices = vi.fn((success) => success([localPrinter]))

    vi.stubGlobal('BrowserPrint', { getDefaultDevice, getLocalDevices })

    await expect(getDefaultZebraPrinter()).resolves.toBe(defaultPrinter)
    await expect(getZebraPrinters()).resolves.toEqual([localPrinter])
  })

  it('times out getLocalDevices when the SDK never calls back', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('BrowserPrint', {
      getDefaultDevice: vi.fn(),
      getLocalDevices: vi.fn()
    })

    const promise = getZebraPrinters()
    const assertion = expect(promise).rejects.toBeInstanceOf(ZebraBrowserPrintTimeoutError)
    await vi.advanceTimersByTimeAsync(ZEBRA_BROWSER_PRINT_TIMEOUT_MS)

    await assertion
  })

  it('times out getDefaultDevice when the SDK never calls back', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('BrowserPrint', {
      getDefaultDevice: vi.fn(),
      getLocalDevices: vi.fn()
    })

    const promise = getDefaultZebraPrinter()
    const assertion = expect(promise).rejects.toBeInstanceOf(ZebraBrowserPrintTimeoutError)
    await vi.advanceTimersByTimeAsync(ZEBRA_BROWSER_PRINT_TIMEOUT_MS)

    await assertion
  })

  it('rejects local Browser Print requests on XHR timeout', async () => {
    vi.useFakeTimers()
    installMockXhr({ timeouts: ['available'] })

    const promise = getZebraPrinters()
    const assertion = expect(promise).rejects.toBeInstanceOf(Error)
    await vi.advanceTimersByTimeAsync(ZEBRA_BROWSER_PRINT_TIMEOUT_MS * 4)

    await assertion
  })

  it('marks print result as uncertain when printer.send times out', async () => {
    vi.useFakeTimers()
    const printer = { name: 'Timeout Zebra', uid: 'timeout-zebra', send: vi.fn() }

    const promise = printZebraLabels([buildOrder()], printer)
    await vi.advanceTimersByTimeAsync(ZEBRA_BROWSER_PRINT_TIMEOUT_MS)
    const result = await promise

    expect(result.printed).toBe(false)
    expect(result.uncertain).toBe(true)
    expect(result.error).toBeInstanceOf(ZebraBrowserPrintTimeoutError)
    expect(printer.send).toHaveBeenCalledTimes(1)
  })

  it('deduplicates the default printer when it also appears in local devices', () => {
    const defaultPrinter = { name: 'Zebra Compartida', uid: 'same-zebra', connection: 'usb' }
    const printers = dedupeZebraPrinters([
      { name: 'Zebra Compartida', uid: 'same-zebra', connection: 'usb' },
      { name: 'Otra Zebra', uid: 'other-zebra', connection: 'usb' }
    ], defaultPrinter)

    expect(printers).toHaveLength(1)
    expect(printers[0].uid).toBe('other-zebra')
  })

  it('treats Browser Print as usable when getDefaultDevice exists without getLocalDevices', async () => {
    vi.stubGlobal('BrowserPrint', { getDefaultDevice: vi.fn() })

    expect(isZebraBrowserPrintAvailable()).toBe(true)
    await expect(getZebraPrinters()).resolves.toEqual([])
  })
})

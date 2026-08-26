import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ZEBRA_LABEL_HEIGHT_DOTS,
  ZEBRA_LABEL_WIDTH_DOTS,
  buildZebraLabelsZpl,
  getDefaultZebraPrinter,
  getPrinterId,
  getPrinterLabel,
  getZebraPrinters,
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

const installMockXhr = ({ responses = {}, failures = [] } = {}) => {
  const requests = []

  class MockXhr {
    static DONE = 4

    open(method, url) {
      this.method = method
      this.url = url
    }

    send(body) {
      requests.push({ method: this.method, url: this.url, body })
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
    expect(getPrinterId(printers[0])).toBe('usb-zebra-1')
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
})

import { describe, expect, it, vi } from 'vitest'
import { createOrderScheduleRequestController } from './orderScheduleRequest'

const standardContext = {
  flow: 'standard',
  opens_at: '06:00',
  closes_at: '14:00',
  is_open: true,
  state: 'open',
  next_transition_at: '2026-08-31T14:00:00-03:00'
}

const extendedContext = {
  flow: 'extended',
  opens_at: '09:00',
  closes_at: '22:00',
  is_open: true,
  state: 'open',
  next_transition_at: '2026-08-31T22:00:00-03:00'
}

const createDeferred = () => {
  let resolve
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

const createController = (fetchScheduleContext, options = {}) => {
  const events = []
  const controller = createOrderScheduleRequestController({
    fetchScheduleContext,
    onUnknown: (event) => events.push({ type: 'unknown', ...event }),
    onStart: (event) => events.push({ type: 'start', ...event }),
    onSuccess: (event) => events.push({ type: 'success', ...event }),
    onError: (event) => events.push({ type: 'error', ...event }),
    ...options
  })
  return { controller, events }
}

describe('order schedule request controller', () => {
  it('keeps schedule unknown when location is initially undefined, then resolves extended location', async () => {
    const fetchScheduleContext = vi.fn().mockResolvedValue({ data: extendedContext, error: null })
    const { controller, events } = createController(fetchScheduleContext)

    const unknownResult = await controller.load({ location: undefined })
    expect(unknownResult).toMatchObject({
      status: 'unknown',
      context: { opensAt: null, closesAt: null, state: 'unknown' }
    })
    expect(fetchScheduleContext).not.toHaveBeenCalled()

    const extendedResult = await controller.load({ location: 'Administración ServiFood' })
    expect(extendedResult).toMatchObject({
      status: 'success',
      context: { flow: 'extended', opensAt: '09:00', closesAt: '22:00' }
    })
    expect(events.at(-1)).toMatchObject({
      type: 'success',
      locationKey: 'Administración ServiFood',
      context: { opensAt: '09:00', closesAt: '22:00' }
    })
  })

  it('ignores a late standard response after switching quickly to extended location', async () => {
    const standardRequest = createDeferred()
    const extendedRequest = createDeferred()
    const fetchScheduleContext = vi
      .fn()
      .mockReturnValueOnce(standardRequest.promise)
      .mockReturnValueOnce(extendedRequest.promise)
    const { controller, events } = createController(fetchScheduleContext)

    const standardLoad = controller.load({ location: 'Planta Standard' })
    const extendedLoad = controller.load({ location: 'Administración ServiFood' })

    extendedRequest.resolve({ data: extendedContext, error: null })
    await expect(extendedLoad).resolves.toMatchObject({
      status: 'success',
      context: { opensAt: '09:00', closesAt: '22:00' }
    })

    standardRequest.resolve({ data: standardContext, error: null })
    await expect(standardLoad).resolves.toMatchObject({ status: 'stale' })

    const successEvents = events.filter((event) => event.type === 'success')
    expect(successEvents).toHaveLength(1)
    expect(successEvents[0]).toMatchObject({
      locationKey: 'Administración ServiFood',
      context: { opensAt: '09:00', closesAt: '22:00' }
    })
  })

  it('fails closed on RPC error for extended location without falling back to standard hours', async () => {
    const fetchScheduleContext = vi.fn().mockResolvedValue({
      data: null,
      error: new Error('rpc failed')
    })
    const { controller, events } = createController(fetchScheduleContext)

    const result = await controller.load({ location: 'Administración ServiFood' })
    expect(result).toMatchObject({
      status: 'error',
      context: { opensAt: null, closesAt: null, isOpen: false, state: 'error' }
    })
    expect(events.at(-1)).toMatchObject({
      type: 'error',
      locationKey: 'Administración ServiFood',
      context: { opensAt: null, closesAt: null, state: 'error' }
    })
  })

  it('keeps valid standard locations on standard hours', async () => {
    const fetchScheduleContext = vi.fn().mockResolvedValue({ data: standardContext, error: null })
    const { controller } = createController(fetchScheduleContext)

    await expect(controller.load({ location: 'Planta Standard' })).resolves.toMatchObject({
      status: 'success',
      context: { flow: 'standard', opensAt: '06:00', closesAt: '14:00' }
    })
  })

  it('keeps ISEMAR location codes on standard hours', async () => {
    const fetchScheduleContext = vi.fn().mockResolvedValue({ data: standardContext, error: null })
    const { controller } = createController(fetchScheduleContext)

    await expect(controller.load({ location: 'ISEMAR_PREDIO_1' })).resolves.toMatchObject({
      status: 'success',
      context: { flow: 'standard', opensAt: '06:00', closesAt: '14:00' }
    })
    expect(fetchScheduleContext).toHaveBeenCalledWith({
      location: 'ISEMAR_PREDIO_1',
      at: null
    })
  })

  it('keeps valid extended locations on extended hours', async () => {
    const fetchScheduleContext = vi.fn().mockResolvedValue({ data: extendedContext, error: null })
    const { controller } = createController(fetchScheduleContext)

    await expect(controller.load({ location: 'administracion_servifood' })).resolves.toMatchObject({
      status: 'success',
      context: { flow: 'extended', opensAt: '09:00', closesAt: '22:00' }
    })
  })

  it('fails closed instead of staying loading when schedule validation hangs', async () => {
    const fetchScheduleContext = vi.fn().mockReturnValue(new Promise(() => {}))
    const { controller, events } = createController(fetchScheduleContext, { timeoutMs: 1 })

    await expect(controller.load({ location: 'ISEMAR_PREDIO_1' })).resolves.toMatchObject({
      status: 'error',
      context: { state: 'error', isOpen: false }
    })
    expect(events.at(-1)).toMatchObject({
      type: 'error',
      locationKey: 'ISEMAR_PREDIO_1',
      context: { state: 'error', isOpen: false }
    })
  })
})

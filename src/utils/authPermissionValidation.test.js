import { describe, expect, it, vi } from 'vitest'
import {
  fetchPermissionAccessContext,
  isTransientPermissionError,
  withPermissionTimeout
} from './authPermissionValidation'

describe('auth permission validation helpers', () => {
  it('retries a transient access-context error and returns the successful retry', async () => {
    const operation = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { status: 503, message: 'service unavailable' } })
      .mockResolvedValueOnce({
        data: {
          is_global_admin: false,
          is_company_admin: false,
          can_view_consumption_report: true,
          companies: []
        },
        error: null
      })

    const result = await fetchPermissionAccessContext(operation, {
      attempts: 2,
      timeoutMs: 100,
      retryDelayMs: 0
    })

    expect(operation).toHaveBeenCalledTimes(2)
    expect(result.error).toBeNull()
    expect(result.attempts).toBe(2)
    expect(result.data?.can_view_consumption_report).toBe(true)
  })

  it('does not retry a non-transient authorization/database error', async () => {
    const error = { status: 400, message: 'permission rpc contract error' }
    const operation = vi.fn().mockResolvedValue({ data: null, error })

    const result = await fetchPermissionAccessContext(operation, {
      attempts: 2,
      timeoutMs: 100,
      retryDelayMs: 0
    })

    expect(operation).toHaveBeenCalledTimes(1)
    expect(result.error).toBe(error)
    expect(result.data).toBeNull()
  })

  it('surfaces a timeout as a transient validation error', async () => {
    const timeoutError = new Error('No pudimos validar tus permisos a tiempo.')
    timeoutError.code = 'PERMISSION_VALIDATION_TIMEOUT'

    await expect(
      withPermissionTimeout(
        new Promise(() => {}),
        1,
        () => timeoutError
      )
    ).rejects.toBe(timeoutError)

    expect(isTransientPermissionError(timeoutError)).toBe(true)
  })

  it('returns the final error when every transient attempt fails', async () => {
    const operation = vi.fn().mockResolvedValue({
      data: null,
      error: { status: 504, message: 'gateway timeout' }
    })

    const result = await fetchPermissionAccessContext(operation, {
      attempts: 2,
      timeoutMs: 100,
      retryDelayMs: 0
    })

    expect(operation).toHaveBeenCalledTimes(2)
    expect(result.error?.status).toBe(504)
    expect(result.attempts).toBe(2)
  })
})

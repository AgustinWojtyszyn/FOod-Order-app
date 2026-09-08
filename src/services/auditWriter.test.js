import { describe, expect, it, vi } from 'vitest'
import { createAuditLogger } from './auditWriter'

describe('createAuditLogger', () => {
  it('routes client audit events through log_audit rpc', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'audit-1', error: null })
    const logAudit = createAuditLogger({ rpc })

    await logAudit({
      action: 'menu_updated',
      details: 'Menú actualizado',
      target_id: '00000000-0000-0000-0000-000000000001',
      target_email: 'test@example.com',
      target_name: 'Test',
      metadata: { company_slug: 'test' },
      request_id: 'req-1'
    })

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('log_audit', {
      p_action: 'menu_updated',
      p_details: 'Menú actualizado',
      p_target_id: '00000000-0000-0000-0000-000000000001',
      p_target_email: 'test@example.com',
      p_target_name: 'Test',
      p_metadata: { company_slug: 'test' },
      p_request_id: 'req-1'
    })
  })
})

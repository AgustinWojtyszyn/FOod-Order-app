export const createAuditLogger = (supabase) => async ({
  action,
  details = '',
  target_id = null,
  target_email = null,
  target_name = null,
  metadata = null,
  request_id = null
}) => {
  try {
    const { error } = await supabase.rpc('log_audit', {
      p_action: action,
      p_details: details || null,
      p_target_id: target_id || null,
      p_target_email: target_email || null,
      p_target_name: target_name || null,
      p_metadata: metadata || null,
      p_request_id: request_id || null
    })

    if (error) throw error
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[audit][logAudit] no se pudo registrar auditoría:', err?.message || err)
    }
  }
}

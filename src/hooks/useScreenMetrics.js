import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { safeLogMetric } from '../services/supabase'
import { useAuthContext } from '../contexts/authContextValue'

export const useScreenMetrics = () => {
  const location = useLocation()
  const { user, session, loading, isAdmin } = useAuthContext()

  useEffect(() => {
    if (loading || !session?.user || !user) return

    const path = location.pathname || '/'
    void safeLogMetric(
      {
        p_op: 'screen.view',
        p_ok: true,
        p_duration_ms: null,
        p_screen: path,
        p_error_code: null,
        p_meta: { admin: isAdmin }
      },
      {
        authReady: true,
        session,
        user,
        dedupeKey: `screen.view:${session.user.id}:${path}:${isAdmin ? 'admin' : 'user'}`
      }
    )
  }, [location.pathname, loading, session, user, isAdmin])
}

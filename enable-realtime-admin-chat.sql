-- ============================================
-- HABILITAR REALTIME PARA ADMIN_CHAT
-- ============================================
-- Este script agrega la tabla admin_chat a la publicación
-- de Realtime de Supabase

-- ============================================
-- 1. AGREGAR TABLA A PUBLICACIÓN REALTIME
-- ============================================

-- Verificar que la publicación existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    RAISE NOTICE 'La publicación supabase_realtime no existe. Creándola...';
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- Agregar tabla admin_chat a la publicación
ALTER PUBLICATION supabase_realtime ADD TABLE admin_chat;

-- ============================================
-- 2. VERIFICAR QUE SE AGREGÓ CORRECTAMENTE
-- ============================================

-- Ver todas las tablas en la publicación supabase_realtime
SELECT 
  schemaname,
  tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- ============================================
-- 3. VERIFICAR PERMISOS
-- ============================================

-- Asegurarse de que la tabla tiene REPLICA IDENTITY
ALTER TABLE admin_chat REPLICA IDENTITY FULL;

-- Ver el REPLICA IDENTITY actual
SELECT 
  schemaname,
  tablename,
  CASE 
    WHEN relreplident = 'd' THEN 'DEFAULT'
    WHEN relreplident = 'n' THEN 'NOTHING'
    WHEN relreplident = 'f' THEN 'FULL'
    WHEN relreplident = 'i' THEN 'INDEX'
  END as replica_identity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' 
  AND c.relname = 'admin_chat';

-- ============================================
-- RESUMEN
-- ============================================

/*
✅ DESPUÉS DE EJECUTAR ESTE SCRIPT:

1. La tabla admin_chat está en la publicación supabase_realtime
2. Tiene REPLICA IDENTITY FULL (necesario para DELETE events)
3. Los cambios se transmiten en tiempo real a los clientes

🧪 PARA PROBAR:
1. Abre la consola del navegador (F12)
2. Ve al chat de admins
3. Deberías ver:
   📡 Subscription status: SUBSCRIBED
   ✅ Successfully subscribed to admin_chat realtime

4. Envía un mensaje desde otro navegador/dispositivo
5. Debería aparecer INMEDIATAMENTE con el log:
   🔔 Realtime event: { eventType: 'INSERT', ... }

❌ SI NO FUNCIONA:
- Verifica que ejecutaste este script completo
- Recarga la aplicación completamente (Ctrl+Shift+R)
- Revisa la consola para ver errores de subscription
*/

-- ============================================
-- ¡LISTO!
-- ============================================

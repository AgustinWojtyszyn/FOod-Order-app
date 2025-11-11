-- ============================================
-- VALIDACIÓN DE HORARIO LÍMITE PARA PEDIDOS
-- ============================================
-- Este script implementa la restricción de horario en el BACKEND
-- Los pedidos solo pueden crearse antes de las 22:00 horas
-- Ejecuta este script en Supabase SQL Editor

-- ============================================
-- OPCIÓN 1: TRIGGER (Recomendado)
-- ============================================
-- El trigger valida la hora antes de insertar un pedido

-- Función que valida el horario
CREATE OR REPLACE FUNCTION check_order_time_limit()
RETURNS TRIGGER AS $$
DECLARE
  current_hour INTEGER;
BEGIN
  -- Obtener la hora actual (en la zona horaria de Argentina)
  -- Ajusta 'America/Argentina/Buenos_Aires' según tu zona horaria
  current_hour := EXTRACT(HOUR FROM NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires');
  
  -- Si son las 22:00 o después, rechazar el pedido
  IF current_hour >= 22 THEN
    RAISE EXCEPTION 'No se pueden crear pedidos después de las 22:00 horas. El horario de pedidos es hasta las 22:00 del día anterior a la entrega.';
  END IF;
  
  -- Si pasa la validación, permitir el INSERT
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Eliminar trigger si existe
DROP TRIGGER IF EXISTS enforce_order_time_limit ON public.orders;

-- Crear trigger que se ejecuta ANTES de insertar
CREATE TRIGGER enforce_order_time_limit
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION check_order_time_limit();

-- ============================================
-- OPCIÓN 2: POLÍTICA RLS (Alternativa)
-- ============================================
-- Esta política también bloquea inserts después de las 22:00
-- Puedes usar ambas o solo el trigger

-- Eliminar política si existe
DROP POLICY IF EXISTS "Block orders after 22:00" ON public.orders;

-- Crear política que bloquea inserts después de las 22:00
CREATE POLICY "Block orders after 22:00" ON public.orders
  FOR INSERT
  WITH CHECK (
    EXTRACT(HOUR FROM NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires') < 22
  );

-- ============================================
-- VERIFICACIÓN
-- ============================================

-- Ver el trigger creado
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'enforce_order_time_limit';

-- Ver las políticas de orders
SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'orders' AND policyname LIKE '%22:00%'
ORDER BY policyname;

-- ============================================
-- PRUEBAS
-- ============================================

/*
PARA PROBAR LA VALIDACIÓN:

1. Si ejecutas esto ANTES de las 22:00, funcionará:
   INSERT INTO public.orders (user_id, location, customer_name, customer_email, items, total_items, status)
   VALUES (auth.uid(), 'Los Berros', 'Test User', 'test@example.com', '[]'::jsonb, 0, 'pending');

2. Si ejecutas esto DESPUÉS de las 22:00, dará ERROR:
   ERROR: No se pueden crear pedidos después de las 22:00 horas...

3. Para simular horario diferente (solo prueba):
   -- Temporalmente cambiar hora del sistema (NO RECOMENDADO EN PRODUCCIÓN)
   -- Usa la hora real del servidor
*/

-- ============================================
-- NOTAS IMPORTANTES
-- ============================================

/*
⚙️ ZONA HORARIA:
- El script usa 'America/Argentina/Buenos_Aires'
- Ajusta según tu ubicación:
  * América/México: 'America/Mexico_City'
  * América/Santiago: 'America/Santiago'
  * Europa/Madrid: 'Europe/Madrid'
  * Para ver zonas disponibles: SELECT * FROM pg_timezone_names;

🔐 SEGURIDAD:
- El TRIGGER se ejecuta en el servidor (backend)
- NO puede ser bypaseado desde el frontend
- Se ejecuta ANTES del INSERT (BEFORE INSERT)
- Incluso si alguien usa la API directamente, fallará

🎯 COMPORTAMIENTO:
- Antes de las 22:00: Pedidos se crean normalmente ✅
- A las 22:00 o después: Pedidos son RECHAZADOS ❌
- Error claro y descriptivo para el usuario
- El frontend también valida (doble protección)

📝 ORDEN DE VALIDACIÓN:
1. Frontend valida (OrderForm.jsx) - Primera barrera
2. Política RLS valida - Segunda barrera
3. Trigger valida - Tercera barrera (más robusta)

⚡ RENDIMIENTO:
- El trigger es muy rápido (solo compara hora)
- No afecta pedidos antes de las 22:00
- Solo se ejecuta en INSERT, no en SELECT/UPDATE

🔄 MANTENIMIENTO:
- Para cambiar el horario límite, edita el número 22
- Para deshabilitar temporalmente: DROP TRIGGER
- Para ver si está activo: consulta information_schema.triggers
*/

-- ============================================
-- ¡COMPLETADO!
-- Ahora es IMPOSIBLE crear pedidos después de las 22:00
-- desde cualquier parte (frontend, API, SQL directo)
-- ============================================


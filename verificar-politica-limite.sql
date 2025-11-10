-- ============================================
-- VERIFICAR POLÍTICA DE LÍMITE DE PEDIDOS
-- ============================================

-- 1. Ver TODAS las políticas de la tabla orders
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'orders'
ORDER BY policyname;

-- 2. Verificar si RLS está habilitado en orders
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'orders';

-- 3. Ver cuántos pedidos PENDIENTES tiene cada usuario
SELECT 
  user_id,
  COUNT(*) as pedidos_pendientes,
  array_agg(id) as order_ids,
  array_agg(status) as estados
FROM public.orders
WHERE status IN ('pending', 'preparing', 'ready')
GROUP BY user_id
ORDER BY pedidos_pendientes DESC;

-- 4. Ver todos los pedidos pendientes con detalles
SELECT 
  id,
  user_id,
  customer_name,
  status,
  created_at,
  CASE 
    WHEN status IN ('pending', 'preparing', 'ready') THEN 'BLOQUEADO'
    ELSE 'PUEDE CREAR NUEVO'
  END as puede_crear_pedido
FROM public.orders
WHERE status IN ('pending', 'preparing', 'ready')
ORDER BY created_at DESC;

-- 5. Probar la condición de la política manualmente
-- Reemplaza 'USUARIO_ID_AQUI' con el ID del usuario que quieres probar
DO $$
DECLARE
  test_user_id uuid := 'USUARIO_ID_AQUI'; -- REEMPLAZAR CON ID REAL
  tiene_pedido_pendiente boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.orders
    WHERE user_id = test_user_id
    AND status IN ('pending', 'preparing', 'ready')
  ) INTO tiene_pedido_pendiente;
  
  RAISE NOTICE 'Usuario % tiene pedido pendiente: %', test_user_id, tiene_pedido_pendiente;
  
  IF tiene_pedido_pendiente THEN
    RAISE NOTICE 'El usuario NO puede crear un nuevo pedido';
  ELSE
    RAISE NOTICE 'El usuario SÍ puede crear un nuevo pedido';
  END IF;
END $$;

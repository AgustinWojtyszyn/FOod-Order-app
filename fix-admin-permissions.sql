-- ============================================
-- CORREGIR PERMISOS DE ADMINISTRADORES
-- ============================================
-- Este script asegura que todos los administradores tengan
-- los mismos permisos completos para gestionar la aplicación
-- Ejecuta este script en Supabase SQL Editor

-- ============================================
-- 1. ELIMINAR POLÍTICAS EXISTENTES
-- ============================================

-- Políticas de orders
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can update all orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can delete all orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can insert orders" ON public.orders;

-- Políticas de menu_items
DROP POLICY IF EXISTS "Only admins can modify menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Admins can insert menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Admins can update menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Admins can delete menu items" ON public.menu_items;

-- Políticas de custom_options
DROP POLICY IF EXISTS "Only admins can modify custom options" ON public.custom_options;
DROP POLICY IF EXISTS "Admins can insert custom options" ON public.custom_options;
DROP POLICY IF EXISTS "Admins can update custom options" ON public.custom_options;
DROP POLICY IF EXISTS "Admins can delete custom options" ON public.custom_options;

-- ============================================
-- 2. CREAR POLÍTICAS COMPLETAS PARA ADMINS
-- ============================================

-- ========== ORDERS ==========
-- Admins pueden ver todos los pedidos
CREATE POLICY "Admins can view all orders" ON public.orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins pueden actualizar cualquier pedido (cambiar estados, etc.)
CREATE POLICY "Admins can update all orders" ON public.orders
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins pueden eliminar cualquier pedido
CREATE POLICY "Admins can delete all orders" ON public.orders
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins pueden crear pedidos
CREATE POLICY "Admins can insert orders" ON public.orders
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ========== MENU_ITEMS ==========
-- Admins pueden insertar items del menú
CREATE POLICY "Admins can insert menu items" ON public.menu_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins pueden actualizar items del menú
CREATE POLICY "Admins can update menu items" ON public.menu_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins pueden eliminar items del menú
CREATE POLICY "Admins can delete menu items" ON public.menu_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ========== CUSTOM_OPTIONS ==========
-- Admins pueden insertar opciones personalizadas
CREATE POLICY "Admins can insert custom options" ON public.custom_options
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins pueden actualizar opciones personalizadas
CREATE POLICY "Admins can update custom options" ON public.custom_options
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins pueden eliminar opciones personalizadas
CREATE POLICY "Admins can delete custom options" ON public.custom_options
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- 3. VERIFICACIÓN
-- ============================================

-- Verificar políticas de orders
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'orders' AND policyname LIKE '%Admin%'
ORDER BY policyname;

-- Verificar políticas de menu_items
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'menu_items' AND policyname LIKE '%Admin%'
ORDER BY policyname;

-- Verificar políticas de custom_options
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'custom_options' AND policyname LIKE '%Admin%'
ORDER BY policyname;

-- ============================================
-- RESUMEN DE PERMISOS
-- ============================================

/*
DESPUÉS DE EJECUTAR ESTE SCRIPT, TODOS LOS ADMINISTRADORES PODRÁN:

✅ ORDERS (Pedidos):
   - Ver todos los pedidos
   - Actualizar estados de pedidos
   - Eliminar pedidos
   - Crear pedidos

✅ MENU_ITEMS (Menú):
   - Agregar nuevos platillos
   - Editar platillos existentes
   - Eliminar platillos del menú

✅ CUSTOM_OPTIONS (Opciones Personalizadas):
   - Crear nuevas opciones/preguntas
   - Editar opciones existentes
   - Eliminar opciones
   - Activar/desactivar opciones

Los administradores se identifican por:
- role = 'admin' EN LA TABLA users

IMPORTANTE: 
- Las políticas verifican el rol desde la tabla public.users
- NO desde auth.raw_user_meta_data
- Esto asegura que los cambios de rol se reflejen inmediatamente
*/

-- ============================================
-- ¡COMPLETADO!
-- Todos los administradores ahora tienen permisos completos
-- ============================================


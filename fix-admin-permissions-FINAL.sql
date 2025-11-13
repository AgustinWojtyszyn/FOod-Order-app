-- ========================================
-- Script COMPLETO para dar permisos a TODOS los administradores
-- Ejecutar TODO en Supabase SQL Editor
-- ========================================

-- 1. Crear función para verificar si un usuario es admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- 2. POLÍTICAS PARA MENU_ITEMS
-- ========================================

-- Eliminar políticas antiguas
DROP POLICY IF EXISTS "Anyone can view menu_items" ON menu_items;
DROP POLICY IF EXISTS "Admins can insert menu_items" ON menu_items;
DROP POLICY IF EXISTS "Admins can update menu_items" ON menu_items;
DROP POLICY IF EXISTS "Admins can delete menu_items" ON menu_items;
DROP POLICY IF EXISTS "All admins can insert menu_items" ON menu_items;
DROP POLICY IF EXISTS "All admins can update menu_items" ON menu_items;
DROP POLICY IF EXISTS "All admins can delete menu_items" ON menu_items;
DROP POLICY IF EXISTS "Enable read access for all users" ON menu_items;

-- Crear nuevas políticas (todos los admin tienen permisos completos)
CREATE POLICY "Anyone can view menu_items"
  ON menu_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "All admins can insert menu_items"
  ON menu_items FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "All admins can update menu_items"
  ON menu_items FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "All admins can delete menu_items"
  ON menu_items FOR DELETE
  TO authenticated
  USING (is_admin());

-- ========================================
-- 3. POLÍTICAS PARA USERS
-- ========================================

-- Eliminar políticas antiguas
DROP POLICY IF EXISTS "Users can view all profiles" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Admins can update all users" ON users;
DROP POLICY IF EXISTS "Enable read access for all users" ON users;
DROP POLICY IF EXISTS "Everyone can view all users" ON users;
DROP POLICY IF EXISTS "All admins can update any user" ON users;

-- Crear nuevas políticas
CREATE POLICY "Everyone can view all users"
  ON users FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "All admins can update any user"
  ON users FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ========================================
-- 4. POLÍTICAS PARA ORDERS
-- ========================================

-- Eliminar políticas antiguas
DROP POLICY IF EXISTS "Users can view own orders" ON orders;
DROP POLICY IF EXISTS "Users can create own orders" ON orders;
DROP POLICY IF EXISTS "Users can update own orders" ON orders;
DROP POLICY IF EXISTS "Admins can view all orders" ON orders;
DROP POLICY IF EXISTS "Admins can update all orders" ON orders;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON orders;
DROP POLICY IF EXISTS "All admins can view all orders" ON orders;
DROP POLICY IF EXISTS "Users can update own pending orders" ON orders;
DROP POLICY IF EXISTS "All admins can update any order" ON orders;

-- Crear nuevas políticas
CREATE POLICY "Users can view own orders"
  ON orders FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "All admins can view all orders"
  ON orders FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "Users can create own orders"
  ON orders FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own pending orders"
  ON orders FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "All admins can update any order"
  ON orders FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ========================================
-- 5. VERIFICAR QUE RLS ESTÁ HABILITADO
-- ========================================

ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- ========================================
-- 6. MENSAJE DE CONFIRMACIÓN
-- ========================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✓ POLÍTICAS ACTUALIZADAS CORRECTAMENTE';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✓ Tabla: menu_items - Admins tienen permisos completos';
  RAISE NOTICE '✓ Tabla: users - Admins pueden editar roles';
  RAISE NOTICE '✓ Tabla: orders - Admins pueden ver y editar todos los pedidos';
  RAISE NOTICE '✓ TODOS los administradores tienen exactamente los mismos permisos';
  RAISE NOTICE '========================================';
END $$;

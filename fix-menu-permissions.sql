-- ========================================
-- FIX: Permitir a TODOS los administradores editar el menú
-- Ejecutar en Supabase SQL Editor
-- ========================================

-- 1. Verificar que la función is_admin() existe y funciona
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

-- 2. ELIMINAR TODAS las políticas antiguas de menu_items
DROP POLICY IF EXISTS "Anyone can view menu_items" ON menu_items;
DROP POLICY IF EXISTS "Admins can insert menu_items" ON menu_items;
DROP POLICY IF EXISTS "Admins can update menu_items" ON menu_items;
DROP POLICY IF EXISTS "Admins can delete menu_items" ON menu_items;
DROP POLICY IF EXISTS "All admins can insert menu_items" ON menu_items;
DROP POLICY IF EXISTS "All admins can update menu_items" ON menu_items;
DROP POLICY IF EXISTS "All admins can delete menu_items" ON menu_items;
DROP POLICY IF EXISTS "Enable read access for all users" ON menu_items;
DROP POLICY IF EXISTS "Superadmins can insert menu_items" ON menu_items;
DROP POLICY IF EXISTS "Superadmins can update menu_items" ON menu_items;
DROP POLICY IF EXISTS "Superadmins can delete menu_items" ON menu_items;
DROP POLICY IF EXISTS "Public can view menu" ON menu_items;
DROP POLICY IF EXISTS "Admin can manage menu" ON menu_items;

-- 3. Habilitar RLS en menu_items (si no está habilitado)
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

-- 4. Crear políticas NUEVAS y SIMPLES para menu_items
-- Política de LECTURA: Todos los usuarios autenticados pueden ver el menú
CREATE POLICY "menu_items_select_policy"
  ON menu_items
  FOR SELECT
  TO authenticated
  USING (true);

-- Política de INSERCIÓN: Solo administradores
CREATE POLICY "menu_items_insert_policy"
  ON menu_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Política de ACTUALIZACIÓN: Solo administradores
CREATE POLICY "menu_items_update_policy"
  ON menu_items
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Política de ELIMINACIÓN: Solo administradores
CREATE POLICY "menu_items_delete_policy"
  ON menu_items
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );

-- 5. Verificar que las políticas se crearon correctamente
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'menu_items'
ORDER BY policyname;

-- 6. Verificar usuarios admin
SELECT id, email, role, full_name
FROM users
WHERE role = 'admin'
ORDER BY email;

-- ========================================
-- INSTRUCCIONES POST-EJECUCIÓN:
-- ========================================
-- 1. Ejecuta este script completo en Supabase SQL Editor
-- 2. Verifica que las políticas se crearon (consulta al final)
-- 3. Verifica que hay usuarios con role = 'admin'
-- 4. Prueba editar el menú desde el panel de admin
-- 5. Si sigue fallando, revisa los logs de Supabase en:
--    Dashboard > Logs > API Logs
-- ========================================

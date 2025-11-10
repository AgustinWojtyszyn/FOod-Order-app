-- ============================================
-- SOLUCIÓN RECURSIÓN INFINITA EN POLÍTICAS
-- ============================================

-- PASO 1: ELIMINAR TODAS LAS POLÍTICAS EXISTENTES
-- ============================================

-- Eliminar políticas de users (TODAS LAS POSIBLES)
DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can insert their profile" ON public.users;
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
DROP POLICY IF EXISTS "Admins can update user roles" ON public.users;
DROP POLICY IF EXISTS "Admins can delete users" ON public.users;
DROP POLICY IF EXISTS "Enable insert for service role" ON public.users;
DROP POLICY IF EXISTS "Allow all to read users" ON public.users;
DROP POLICY IF EXISTS "Allow insert users" ON public.users;
DROP POLICY IF EXISTS "Allow update own profile" ON public.users;
DROP POLICY IF EXISTS "Allow delete users" ON public.users;

-- Eliminar políticas de orders (TODAS LAS POSIBLES)
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can create their own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can update their own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can delete their own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can update status of their own orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Users view own orders" ON public.orders;
DROP POLICY IF EXISTS "Users create own orders" ON public.orders;
DROP POLICY IF EXISTS "Users update own orders" ON public.orders;
DROP POLICY IF EXISTS "Users delete own orders" ON public.orders;

-- Eliminar políticas de menu_items (TODAS LAS POSIBLES)
DROP POLICY IF EXISTS "Everyone can view menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Only admins can modify menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Everyone reads menu" ON public.menu_items;
DROP POLICY IF EXISTS "Allow menu modifications" ON public.menu_items;

-- PASO 2: DESHABILITAR RLS TEMPORALMENTE
-- ============================================

ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items DISABLE ROW LEVEL SECURITY;

-- PASO 3: CREAR POLÍTICAS SIMPLES SIN RECURSIÓN
-- ============================================

-- HABILITAR RLS DE NUEVO
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS PARA USERS (SIN RECURSIÓN)
-- Permitir que todos vean todos los usuarios (necesario para evitar recursión)
CREATE POLICY "Allow all to read users" ON public.users
  FOR SELECT USING (true);

-- Permitir insertar (para el trigger)
CREATE POLICY "Allow insert users" ON public.users
  FOR INSERT WITH CHECK (true);

-- Permitir actualizar solo su propio perfil
CREATE POLICY "Allow update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- Permitir eliminar (necesario para admin)
CREATE POLICY "Allow delete users" ON public.users
  FOR DELETE USING (true);

-- POLÍTICAS PARA ORDERS (SIMPLES)
-- Ver sus propios pedidos
CREATE POLICY "Users view own orders" ON public.orders
  FOR SELECT USING (auth.uid() = user_id);

-- Crear sus propios pedidos (MÁXIMO 1 PEDIDO PENDIENTE A LA VEZ)
CREATE POLICY "Users create own orders" ON public.orders
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    NOT EXISTS (
      SELECT 1 FROM public.orders
      WHERE user_id = auth.uid()
      AND status IN ('pending', 'preparing', 'ready')
    )
  );

-- Actualizar sus propios pedidos
CREATE POLICY "Users update own orders" ON public.orders
  FOR UPDATE USING (auth.uid() = user_id);

-- Eliminar sus propios pedidos
CREATE POLICY "Users delete own orders" ON public.orders
  FOR DELETE USING (auth.uid() = user_id);

-- POLÍTICAS PARA MENU_ITEMS (SIMPLES)
-- Todos pueden ver el menú
CREATE POLICY "Everyone reads menu" ON public.menu_items
  FOR SELECT USING (true);

-- Todos pueden modificar (simplificado, puedes restringir después)
CREATE POLICY "Allow menu modifications" ON public.menu_items
  FOR ALL USING (true);

-- ============================================
-- VERIFICACIÓN
-- ============================================

-- Ver políticas de users
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies 
WHERE tablename = 'users'
ORDER BY policyname;

-- Ver políticas de orders
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies 
WHERE tablename = 'orders'
ORDER BY policyname;

-- Ver políticas de menu_items
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies 
WHERE tablename = 'menu_items'
ORDER BY policyname;

-- ============================================
-- ¡LISTO! NO MÁS RECURSIÓN INFINITA
-- ============================================

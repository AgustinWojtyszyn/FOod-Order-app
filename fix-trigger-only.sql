-- ============================================
-- SCRIPT SIMPLIFICADO - SOLO TRIGGER
-- Ejecuta esto si el script completo falló
-- ============================================

-- 1. Agregar columna full_name si no existe
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'users' 
    AND column_name = 'full_name'
  ) THEN
    ALTER TABLE public.users ADD COLUMN full_name TEXT;
  END IF;
END $$;

-- 2. Agregar columna email si no existe
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'users' 
    AND column_name = 'email'
  ) THEN
    ALTER TABLE public.users ADD COLUMN email TEXT;
  END IF;
END $$;

-- 3. Eliminar trigger anterior si existe
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users CASCADE;

-- 3. Eliminar función anterior si existe
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- 4. Crear la función del trigger
CREATE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'user'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error en handle_new_user: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Crear el trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 6. Habilitar RLS en users (si no está habilitado)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 7. Crear política básica para que el trigger funcione
DROP POLICY IF EXISTS "Enable insert for service role" ON public.users;
CREATE POLICY "Enable insert for service role" ON public.users
  FOR INSERT
  WITH CHECK (true);

-- 8. Permitir que usuarios vean su propio perfil
DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;
CREATE POLICY "Users can view their own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);

-- ============================================
-- VERIFICACIÓN
-- ============================================

-- Debe devolver 1 fila con el trigger
SELECT tgname, tgenabled 
FROM pg_trigger 
WHERE tgname = 'on_auth_user_created';

-- Debe devolver la función
SELECT proname 
FROM pg_proc 
WHERE proname = 'handle_new_user';

-- Ver si hay usuarios en auth.users
SELECT COUNT(*) as usuarios_auth FROM auth.users;

-- Ver si hay usuarios en public.users
SELECT COUNT(*) as usuarios_public FROM public.users;

-- ============================================
-- MIGRAR USUARIOS EXISTENTES (si los hay)
-- ============================================

-- Insertar usuarios que están en auth.users pero NO en public.users
INSERT INTO public.users (id, email, full_name, role)
SELECT 
  au.id, 
  au.email, 
  COALESCE(au.raw_user_meta_data->>'full_name', ''),
  'user'
FROM auth.users au
LEFT JOIN public.users pu ON au.id = pu.id
WHERE pu.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- ¡LISTO!
-- ============================================

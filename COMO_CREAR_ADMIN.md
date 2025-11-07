# Cómo Crear una Cuenta de Administrador

## ⚠️ IMPORTANTE: Configurar el Trigger de Usuario Primero

**Antes de crear cualquier cuenta**, necesitas configurar un trigger en Supabase para que los usuarios se guarden automáticamente en la tabla `users` cuando se registren.

### Paso 1: Crear el Trigger en Supabase

1. Ve a https://supabase.com → Tu proyecto
2. Haz clic en **"SQL Editor"** en el menú lateral
3. Copia y pega este código SQL:

```sql
-- Función que se ejecuta cuando se crea un nuevo usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role, created_at)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', new.email),
    COALESCE(new.raw_user_meta_data->>'role', 'user'),
    now()
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger que ejecuta la función cuando se registra un usuario
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

4. Haz clic en **"Run"** para ejecutar el código
5. Si ves "Success. No rows returned", significa que funcionó ✅

### Paso 2: Verificar la tabla `users`

Asegúrate de que tu tabla `users` tenga esta estructura:

```sql
CREATE TABLE IF NOT EXISTS public.users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Política para que los usuarios puedan ver todos los usuarios (necesario para admin)
CREATE POLICY "Users can view all users" ON public.users
  FOR SELECT USING (true);

-- Política para que solo admins puedan actualizar
CREATE POLICY "Only admins can update users" ON public.users
  FOR UPDATE USING (
    auth.uid() IN (
      SELECT id FROM public.users WHERE role = 'admin'
    )
  );
```

---

## Opción 1: Desde la Base de Datos de Supabase (RECOMENDADO)

**Después de configurar el trigger**, puedes hacer admin a cualquier usuario:

1. **Accede a tu proyecto de Supabase:**
   - Ve a https://supabase.com
   - Ingresa a tu proyecto: `pmzlzwxjpuauzrjqdwol`

2. **Ve a la tabla de usuarios:**
   - En el menú lateral, haz clic en "Table Editor"
   - Selecciona la tabla `users` (NO `auth.users`)

3. **Encuentra el usuario que quieres hacer administrador:**
   - Busca el usuario por su email
   - Haz clic en la fila del usuario

4. **Edita el campo `role`:**
   - Cambia el valor de `role` de `user` a `admin`
   - Guarda los cambios

5. **Actualiza también `auth.users` (importante):**
   - Ve a la tabla `auth.users`
   - Encuentra el mismo usuario por email
   - Edita el campo `raw_user_meta_data` y cambia/agrega:
   ```json
   {
     "role": "admin",
     "full_name": "Nombre del Admin"
   }
   ```
   - Guarda los cambios

6. **El usuario debe cerrar sesión y volver a iniciar:**
   - Cierra sesión en la aplicación
   - Vuelve a iniciar sesión
   - Ahora verás la opción "Panel Admin" en el menú lateral

---

## Opción 2: Durante el Registro (Modificar el Código Temporalmente)

### Paso 1: Editar Register.jsx

Abre el archivo `src/components/Register.jsx` y busca la función `handleSubmit`.

**Cambia esto:**
```javascript
const { data, error } = await auth.signUp(
  formData.email,
  formData.password,
  {
    name: formData.name
  }
)
```

**Por esto:**
```javascript
const { data, error } = await auth.signUp(
  formData.email,
  formData.password,
  {
    name: formData.name,
    role: 'admin'  // 👈 AGREGAR ESTA LÍNEA
  }
)
```

### Paso 2: Crear la cuenta

1. Guarda el archivo
2. Ve a la página de registro: https://food-order-app-3avy.onrender.com/register
3. Crea una cuenta nueva (esta será la cuenta de administrador)

### Paso 3: Revertir el cambio (IMPORTANTE)

**Vuelve a cambiar el código a su versión original para evitar que todos los nuevos usuarios sean administradores:**

```javascript
const { data, error } = await auth.signUp(
  formData.email,
  formData.password,
  {
    name: formData.name
  }
)
```

---

## Opción 3: Usando SQL en Supabase (MÁS RÁPIDO)

1. Ve a tu proyecto de Supabase
2. Haz clic en "SQL Editor"
3. Ejecuta esta consulta (reemplaza `tu-email@ejemplo.com` con el email del usuario):

```sql
-- Actualizar en la tabla users
UPDATE public.users
SET role = 'admin'
WHERE email = 'tu-email@ejemplo.com';

-- Actualizar en auth.users
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{role}',
  '"admin"'
)
WHERE email = 'tu-email@ejemplo.com';
```

4. El usuario debe cerrar sesión y volver a iniciar

---

## Si NO tienes usuarios en la tabla `users`

Si ya tienes usuarios registrados ANTES de crear el trigger, necesitas migrarlos manualmente:

```sql
-- Migrar usuarios existentes de auth.users a public.users
INSERT INTO public.users (id, email, full_name, role, created_at)
SELECT 
  id,
  email,
  COALESCE(raw_user_meta_data->>'full_name', email) as full_name,
  COALESCE(raw_user_meta_data->>'role', 'user') as role,
  created_at
FROM auth.users
WHERE NOT EXISTS (
  SELECT 1 FROM public.users WHERE public.users.id = auth.users.id
);
```

---

## Verificar que funciona

Una vez que hayas configurado el usuario como administrador:

1. Inicia sesión con esa cuenta
2. En el menú lateral, deberías ver la opción **"Panel Admin"**
3. Haz clic en "Panel Admin"
4. Deberías ver dos pestañas:
   - **Usuarios**: Para gestionar todos los usuarios
   - **Menú**: Para editar los platos del menú

---

## Acceso Rápido desde la Landing Page

Ahora hay un botón **"Admin"** en la barra de navegación superior de la landing page que te lleva directamente al login. Puedes usar:

- **URL directa**: https://food-order-app-3avy.onrender.com/admin-login (redirige a /login)
- O simplemente hacer clic en "Admin" en la página principal

---

## Email de Ejemplo para Admin

Si quieres crear una cuenta específica para administración, usa un email como:
- `admin@servifood.com`
- `administrador@servifood.com`
- O cualquier email que desees

**¡IMPORTANTE!** Recuerda guardar las credenciales de la cuenta de administrador en un lugar seguro.

# Cómo Crear una Cuenta de Administrador

## Opción 1: Desde la Base de Datos de Supabase (RECOMENDADO)

1. **Accede a tu proyecto de Supabase:**
   - Ve a https://supabase.com
   - Ingresa a tu proyecto: `pmzlzwxjpuauzrjqdwol`

2. **Ve a la tabla de usuarios:**
   - En el menú lateral, haz clic en "Table Editor"
   - Selecciona la tabla `auth.users`

3. **Encuentra el usuario que quieres hacer administrador:**
   - Busca el usuario por su email
   - Haz clic en la fila del usuario

4. **Edita el campo `raw_user_meta_data`:**
   - Encuentra la columna `raw_user_meta_data`
   - Cambia el valor a:
   ```json
   {
     "role": "admin"
   }
   ```
   - Guarda los cambios

5. **El usuario debe cerrar sesión y volver a iniciar:**
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

## Opción 3: Usando SQL en Supabase

1. Ve a tu proyecto de Supabase
2. Haz clic en "SQL Editor"
3. Ejecuta esta consulta (reemplaza `tu-email@ejemplo.com` con el email del usuario):

```sql
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

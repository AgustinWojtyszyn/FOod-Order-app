# 🔧 Corrección de Permisos de Administradores

## ⚠️ Problema Identificado

Los administradores no tienen todos los permisos necesarios para gestionar la aplicación. Específicamente, están limitados para:

- ❌ Editar el menú (agregar/modificar/eliminar platillos)
- ❌ Crear/editar opciones personalizadas
- ❌ Marcar pedidos como completados
- ❌ Gestionar todos los aspectos de la aplicación

## ✅ Solución

El script `fix-admin-permissions.sql` corrige todas las políticas RLS (Row Level Security) de Supabase para que **todos los administradores** tengan permisos completos.

## 📋 Cómo Aplicar la Corrección

### Paso 1: Acceder a Supabase

1. Ve a [supabase.com](https://supabase.com)
2. Inicia sesión en tu proyecto
3. Navega a **SQL Editor** (en el menú lateral)

### Paso 2: Ejecutar el Script

1. Abre el archivo `fix-admin-permissions.sql` de este proyecto
2. Copia **todo el contenido** del archivo
3. Pega el contenido en el SQL Editor de Supabase
4. Haz clic en **Run** (o presiona Ctrl/Cmd + Enter)

### Paso 3: Verificar

Al final del script verás 3 tablas con las políticas creadas:

- **orders** - Políticas para pedidos
- **menu_items** - Políticas para el menú
- **custom_options** - Políticas para opciones personalizadas

Deberías ver 4 políticas para cada tabla (SELECT, INSERT, UPDATE, DELETE).

## 🎯 Permisos Otorgados

Después de ejecutar el script, **todos los usuarios con rol `admin`** podrán:

### 📦 Gestión de Pedidos (ORDERS)
- ✅ Ver todos los pedidos de todos los usuarios
- ✅ Cambiar estados (pendiente → completado → cancelado)
- ✅ Editar detalles de pedidos
- ✅ Eliminar pedidos
- ✅ Crear pedidos

### 🍽️ Gestión del Menú (MENU_ITEMS)
- ✅ Agregar nuevos platillos al menú
- ✅ Editar platillos existentes (nombre, descripción)
- ✅ Eliminar platillos del menú
- ✅ Modificar toda la información del menú diario

### ⚙️ Opciones Personalizadas (CUSTOM_OPTIONS)
- ✅ Crear nuevas preguntas/encuestas
- ✅ Editar opciones existentes
- ✅ Eliminar opciones
- ✅ Activar/desactivar opciones
- ✅ Reordenar opciones

## 🔐 Cómo Funciona la Seguridad

Las políticas verifican el rol del usuario de esta manera:

```sql
EXISTS (
  SELECT 1 FROM public.users
  WHERE id = auth.uid() AND (role = 'admin' OR is_superadmin = true)
)
```

Esto significa:
1. ✅ Usuarios con `role = 'admin'` en la tabla `users`
2. ✅ Usuarios con `is_superadmin = true`
3. ❌ Usuarios normales (`role = 'user'`)

## ⚡ Cambios Inmediatos

Los permisos se aplican **inmediatamente** después de ejecutar el script:

- No necesitas recargar la aplicación
- No necesitas cerrar sesión
- Los administradores pueden empezar a usar todas las funciones de inmediato

## 🧪 Probar los Permisos

Para verificar que funciona:

1. **Gestión del Menú:**
   - Ve a Panel Admin → Gestión del Menú
   - Intenta agregar un nuevo platillo
   - Intenta editar uno existente
   - ✅ Debería funcionar sin errores

2. **Opciones Personalizadas:**
   - Ve a Panel Admin → Opciones Personalizadas
   - Intenta crear una nueva pregunta
   - Intenta editar o eliminar una existente
   - ✅ Debería funcionar sin errores

3. **Cambiar Estados de Pedidos:**
   - Ve al Dashboard
   - Busca un pedido pendiente
   - Cambia su estado a "Completado"
   - ✅ Debería actualizarse correctamente

## 🚨 Solución de Problemas

### "Error: permission denied for table..."
**Causa:** El script no se ejecutó completamente
**Solución:** Vuelve a ejecutar todo el script desde el inicio

### "Cannot read properties of undefined"
**Causa:** El usuario no tiene el rol admin en la base de datos
**Solución:** 
1. Ve a Panel Admin → Gestión de Usuarios
2. Busca el usuario
3. Cambia su rol a "Administrador"

### "Row Level Security Policy violation"
**Causa:** Las políticas antiguas siguen activas
**Solución:** 
1. Ejecuta primero la parte que elimina políticas (DROP POLICY)
2. Luego ejecuta la parte que crea las nuevas políticas

## 📊 Comparación Antes/Después

### ANTES ❌
- Admins podían **solo ver** pedidos
- No podían editar el menú
- No podían crear opciones personalizadas
- Dependían del superadmin para todo

### DESPUÉS ✅
- Admins tienen **control total**
- Pueden gestionar menú diariamente
- Pueden crear/editar opciones
- Autonomía completa en la gestión

## 💡 Notas Importantes

1. **SuperAdmin vs Admin:**
   - Ambos tienen los mismos permisos de gestión
   - SuperAdmin puede además eliminar usuarios y hacer limpieza del sistema
   - Ambos pueden editar menú, opciones y pedidos

2. **Seguridad:**
   - Los usuarios normales siguen sin poder ver datos de otros
   - Solo pueden gestionar sus propios pedidos
   - Las políticas RLS protegen la privacidad

3. **Sincronización:**
   - Los roles se verifican desde `public.users`
   - Los cambios de rol se reflejan inmediatamente
   - No hay caché de permisos

## 📞 Soporte

Si después de aplicar el script los administradores siguen sin tener permisos:

1. Verifica que el usuario tenga `role = 'admin'` en la tabla `users`
2. Revisa las políticas ejecutando las consultas de verificación del script
3. Contacta al desarrollador con los mensajes de error específicos

---

**Última actualización:** 2025-11-11  
**Versión:** 1.0  
**Estado:** Listo para aplicar

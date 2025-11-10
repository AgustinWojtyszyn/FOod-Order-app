# 🍽️ LÍMITE DE UN PEDIDO PENDIENTE POR USUARIO

## ✅ Funcionalidad Implementada

Se ha implementado una restricción para que cada usuario pueda tener **máximo 1 pedido pendiente a la vez**.

Si el usuario tiene un pedido con estado `pending`, `preparing` o `ready`, **no podrá crear un nuevo pedido** hasta que el actual sea completado/entregado.

---

## 🔧 Cambios Realizados

### 1. **Base de Datos (Supabase)**

En el archivo `fix-policies.sql`, se modificó la política de INSERT para la tabla `orders`:

```sql
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
```

**Cómo funciona:**
- Verifica que el `user_id` del pedido coincida con el usuario autenticado
- Busca si ya existe un pedido con estado `pending`, `preparing` o `ready`
- Si ya existe un pedido activo, **rechaza** la inserción
- Una vez que el pedido se marca como `delivered` o `cancelled`, el usuario puede crear uno nuevo

---

### 2. **Frontend (React)**

En el archivo `OrderForm.jsx`:

#### a) **Verificación previa**
```javascript
const checkTodayOrder = async () => {
  try {
    const { data, error } = await db.getOrders(user.id)
    if (!error && data) {
      // Verificar si tiene algún pedido pendiente (no entregado)
      const hasPendingOrder = data.some(order => 
        order.status === 'pending' || 
        order.status === 'preparing' || 
        order.status === 'ready'
      )
      setHasOrderToday(hasPendingOrder)
    }
  } catch (err) {
    console.error('Error checking order:', err)
  }
}
```

#### b) **Advertencia visual**
Si el usuario ya tiene un pedido pendiente, se muestra un banner amarillo:

```jsx
{hasOrderToday && (
  <div className="bg-yellow-50 border-2 border-yellow-400...">
    <h3>Ya tienes un pedido pendiente</h3>
    <p>Solo puedes tener un pedido activo a la vez...</p>
  </div>
)}
```

#### c) **Botón deshabilitado**
El botón de "Crear Pedido" se deshabilita automáticamente:

```jsx
disabled={loading || getSelectedItemsList().length === 0 || hasOrderToday}
```

#### d) **Manejo de errores mejorado**
Si por alguna razón el backend rechaza el pedido, se muestra un mensaje claro:

```javascript
if (error.message.includes('violates row-level security policy')) {
  setError('Ya tienes un pedido pendiente. Espera a que se complete para crear uno nuevo.')
}
```

---

## 📋 Cómo Ejecutar los Cambios

### **Paso 1: Actualizar la Base de Datos**

1. Abre tu proyecto en **Supabase Dashboard**
2. Ve a **SQL Editor**
3. Copia y pega **TODO** el contenido del archivo `fix-policies.sql`
4. Ejecuta el script (Run)

### **Paso 2: Verificar las Políticas**

Ejecuta esta consulta para verificar que las políticas se crearon correctamente:

```sql
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies 
WHERE tablename = 'orders'
ORDER BY policyname;
```

Deberías ver la política **"Users create own orders"** en la lista.

---

## 🧪 Cómo Probar

1. **Crea un pedido** como usuario normal
2. El pedido quedará en estado `pending`
3. Intenta **crear otro pedido**
4. Deberías ver:
   - ⚠️ Banner amarillo: "Ya tienes un pedido pendiente"
   - 🚫 Botón deshabilitado: "Ya tienes un pedido pendiente"
5. **Marca el pedido como entregado** desde el admin panel
6. Ahora **sí podrás crear un nuevo pedido**

---

## 💡 Ventajas

✅ **Control de pedidos activos:**
   - Un usuario no puede saturar el sistema con múltiples pedidos pendientes
   - Mejor organización del flujo de trabajo

✅ **Seguridad en dos capas:**
   - Frontend: Advertencia temprana y UX clara
   - Backend: Validación estricta con RLS

✅ **Evita confusiones:**
   - El usuario solo gestiona un pedido a la vez
   - Más fácil de rastrear y administrar

✅ **Mensajes claros** para el usuario

---

## 🔄 Si Necesitas Modificar un Pedido

Si un usuario ya creó un pedido pero necesita cambiarlo:

1. **Opción 1:** Ir al Dashboard y **eliminar** el pedido pendiente, luego crear uno nuevo
2. **Opción 2:** Esperar a que el admin marque el pedido como entregado (`delivered`)
3. **Opción 3:** El admin puede cancelar el pedido (`cancelled`) y el usuario podrá crear uno nuevo

---

## ⚙️ Configuración Avanzada

Si en el futuro quieres cambiar qué estados bloquean la creación de nuevos pedidos:

```sql
-- En fix-policies.sql, modificar la lista de estados:
NOT EXISTS (
  SELECT 1 FROM public.orders
  WHERE user_id = auth.uid()
  AND status IN ('pending', 'preparing', 'ready')  -- Agregar o quitar estados aquí
)
```

Estados disponibles:
- `pending`: Pedido creado, esperando preparación
- `preparing`: En preparación
- `ready`: Listo para entrega
- `delivered`: Entregado (permite crear nuevo pedido)
- `cancelled`: Cancelado (permite crear nuevo pedido)

---

## 🐛 Resolución de Problemas

### Problema: "El usuario puede crear múltiples pedidos pendientes"

**Solución:**
- Verifica que ejecutaste el script `fix-policies.sql` completo
- Asegúrate de que RLS esté habilitado: `ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;`
- Ejecuta `verificar-politica-limite.sql` para ver los pedidos pendientes

### Problema: "El mensaje de error no es claro"

**Solución:**
- Verifica que el frontend tenga la versión actualizada de `OrderForm.jsx`
- Limpia la caché del navegador (Ctrl+Shift+R)
- Revisa la consola del navegador (F12) para ver logs de debug

---

## 📝 Resumen

Esta funcionalidad garantiza que cada usuario solo pueda tener **1 pedido pendiente/activo a la vez**. Una vez que el pedido se marca como `delivered` o `cancelled`, el usuario puede crear un nuevo pedido, permitiendo un flujo de trabajo ordenado y controlado.

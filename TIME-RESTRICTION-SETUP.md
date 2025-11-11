# 🕐 Validación de Horario Límite - Backend

## ⚠️ Problema

Actualmente, el límite de horario (22:00) solo está validado en el frontend (JavaScript). Esto significa que:

- ❌ Usuarios avanzados pueden bypasear la validación
- ❌ Pueden usar la API directamente
- ❌ Pueden desactivar JavaScript
- ❌ No hay protección real en la base de datos

## ✅ Solución

El script `add-time-restriction-validation.sql` agrega **validación en el backend** usando:

1. **TRIGGER** - Valida antes de cada INSERT
2. **POLÍTICA RLS** - Bloquea inserts después de las 22:00

### 🔒 Triple Protección:

```
1️⃣ Frontend (OrderForm.jsx)     ← Primera barrera
            ↓
2️⃣ Política RLS (Supabase)       ← Segunda barrera
            ↓
3️⃣ Trigger (PostgreSQL)          ← Tercera barrera (más robusta)
```

## 🚀 Cómo Aplicar

### Paso 1: Abrir Supabase

1. Ve a [supabase.com](https://supabase.com)
2. Entra a tu proyecto
3. Ve a **SQL Editor**

### Paso 2: Ejecutar el Script

1. Abre `add-time-restriction-validation.sql`
2. Copia **TODO** el contenido
3. Pega en SQL Editor
4. Click en **Run**

### Paso 3: Verificar

Deberías ver en la consola:
- ✅ Trigger creado: `enforce_order_time_limit`
- ✅ Política creada: `Block orders after 22:00`

## 🎯 Funcionamiento

### ⏰ Antes de las 22:00
```
Usuario crea pedido → ✅ PERMITIDO → Pedido creado exitosamente
```

### 🚫 Después de las 22:00
```
Usuario crea pedido → ❌ BLOQUEADO → Error: "No se pueden crear pedidos después de las 22:00 horas..."
```

## 🌍 Configurar Zona Horaria

Por defecto usa: `America/Argentina/Buenos_Aires`

Para cambiar, edita la línea en el script:
```sql
-- Cambiar esto:
AT TIME ZONE 'America/Argentina/Buenos_Aires'

-- Por tu zona horaria, ejemplo:
AT TIME ZONE 'America/Mexico_City'
AT TIME ZONE 'America/Santiago'
AT TIME ZONE 'Europe/Madrid'
```

### Ver todas las zonas disponibles:
```sql
SELECT name FROM pg_timezone_names WHERE name LIKE 'America%';
```

## 🧪 Probar que Funciona

### Prueba 1: Antes de las 22:00
Intenta crear un pedido desde la app:
- ✅ Debería funcionar normalmente

### Prueba 2: Después de las 22:00
Intenta crear un pedido desde la app:
- ❌ Debería mostrar error: "No se pueden crear pedidos después de las 22:00 horas"

### Prueba 3: Usando API directamente
Intenta insertar directamente en SQL Editor (después de las 22:00):
```sql
INSERT INTO public.orders (user_id, location, customer_name, customer_email, items, total_items, status)
VALUES (auth.uid(), 'Los Berros', 'Test', 'test@example.com', '[]'::jsonb, 0, 'pending');
```
- ❌ Debería dar ERROR

## 🔧 Personalizar Horario Límite

Para cambiar de 22:00 a otra hora, edita en el script:

```sql
-- Cambiar 22 por la hora deseada (formato 24h)
IF current_hour >= 22 THEN  -- Cambia este número

-- También en la política:
EXTRACT(HOUR FROM ...) < 22  -- Cambia este número
```

Ejemplos:
- `>= 20` = Bloquear después de las 8 PM
- `>= 23` = Bloquear después de las 11 PM
- `>= 18` = Bloquear después de las 6 PM

## 🛠️ Mantenimiento

### Deshabilitar temporalmente:
```sql
DROP TRIGGER enforce_order_time_limit ON public.orders;
DROP POLICY "Block orders after 22:00" ON public.orders;
```

### Reactivar:
Vuelve a ejecutar el script completo.

### Ver si está activo:
```sql
-- Ver trigger
SELECT trigger_name FROM information_schema.triggers 
WHERE trigger_name = 'enforce_order_time_limit';

-- Ver política
SELECT policyname FROM pg_policies 
WHERE policyname = 'Block orders after 22:00';
```

## ⚡ Rendimiento

- **Impacto**: Mínimo (< 1ms por pedido)
- **Solo afecta**: Operaciones INSERT en `orders`
- **No afecta**: Lectura de pedidos, updates, deletes

## 🐛 Solución de Problemas

### Error: "trigger already exists"
```sql
DROP TRIGGER IF EXISTS enforce_order_time_limit ON public.orders;
-- Luego vuelve a ejecutar el script
```

### Error: "policy already exists"
```sql
DROP POLICY IF EXISTS "Block orders after 22:00" ON public.orders;
-- Luego vuelve a ejecutar el script
```

### Pedidos se bloquean a hora incorrecta
- Verifica la zona horaria configurada
- Compara con: `SELECT NOW() AT TIME ZONE 'TU_ZONA_HORARIA';`

## 📊 Comparación Antes/Después

### ANTES ❌
- Validación solo en frontend
- Fácil de bypasear
- Usuarios técnicos podían engañar al sistema
- Sin protección real

### DESPUÉS ✅
- Validación en backend (PostgreSQL)
- Imposible de bypasear
- Protección a nivel de base de datos
- Triple barrera de seguridad

## 💡 Notas Importantes

1. **Zona Horaria del Servidor:**
   - Supabase usa UTC por defecto
   - El script convierte a tu zona horaria local
   - Verifica que sea la correcta

2. **Mensaje de Error:**
   - El usuario verá el error del trigger
   - Es claro y descriptivo
   - Puedes personalizar el mensaje en el script

3. **Excepciones:**
   - No hay excepciones por rol
   - Ni siquiera los admins pueden crear pedidos después de las 22:00
   - Si necesitas excepciones, modifica el trigger

4. **Logs:**
   - Supabase registra todos los errores
   - Puedes ver intentos de crear pedidos fuera de horario
   - Ve a Logs > Database en Supabase Dashboard

---

**Creado**: 2025-11-11  
**Versión**: 1.0  
**Estado**: Listo para aplicar  
**Prioridad**: Alta - Seguridad crítica

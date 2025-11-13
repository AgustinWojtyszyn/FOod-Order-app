# 📋 Instrucciones de Configuración

## 🔐 Paso 1: Arreglar Permisos de Administradores

Para que **TODOS los administradores** tengan los mismos permisos completos (sin distinción de superadmin):

1. Ve a **Supabase Dashboard** → SQL Editor
2. Copia y pega el contenido del archivo: `fix-admin-permissions-FINAL.sql`
3. Haz clic en **Run** para ejecutar el script
4. Deberías ver mensajes de confirmación indicando que las políticas se actualizaron correctamente

### ¿Qué hace este script?

- ✅ **Elimina la columna `is_superadmin`** - Ya no existe distinción entre administradores
- ✅ Crea una función `is_admin()` que verifica si un usuario tiene rol de admin
- ✅ Da permisos completos a **TODOS** los administradores por igual
- ✅ Los admin pueden:
  - Editar el menú (agregar/modificar/eliminar platos)
  - Cambiar roles de usuarios
  - Ver y editar todos los pedidos
  - Acceder a todas las funciones administrativas

### ⚠️ Importante:
- **NO HAY** más categoría "superadmin"
- **TODOS** los usuarios con rol `admin` tienen exactamente los mismos permisos
- El panel de administración se ve igual para todos los admin

---

## 📊 Paso 2: Exportar Pedidos Diarios

### ✨ Nuevas Funcionalidades

#### 1. **Exportar a Excel (.xlsx)**

- Formato **XLSX** compatible con Excel 2016 y versiones anteriores
- Incluye **2 hojas**:
  - **Pedidos Detallados**: Todos los datos de cada pedido
  - **Estadísticas**: Resumen por ubicación, platillos, estados, etc.
- Columnas ajustadas automáticamente para fácil lectura
- Información completa:
  - Fecha y hora del pedido
  - Datos del cliente (nombre, email, teléfono)
  - Ubicación de entrega
  - Platillos ordenados
  - Estado del pedido
  - Comentarios y opciones adicionales

**Cómo usar:**
1. Ve a **Pedidos Diarios** en el menú
2. Aplica filtros si deseas (ubicación, estado, platillo)
3. Haz clic en **Exportar a Excel**
4. El archivo se descarga automáticamente

**Compartir el archivo:**
- **Por email**: Adjunta el archivo `.xlsx` descargado
- **Por WhatsApp Web**: Adjunta el archivo como documento
- **Por WhatsApp móvil**: Usa "Compartir archivo" y selecciona WhatsApp

#### 2. **Compartir Resumen por WhatsApp**

- Genera un resumen de texto optimizado para WhatsApp
- Incluye:
  - Total de pedidos
  - Pedidos completados/pendientes
  - Pedidos por ubicación
  - Top 5 platillos más pedidos
- Perfecto para enviar actualizaciones rápidas al equipo

**Cómo usar:**
1. Haz clic en **Compartir Resumen**
2. Se abre WhatsApp Web con el mensaje pre-formateado
3. Selecciona el contacto o grupo y envía

---

## 📦 Dependencias Instaladas

- `xlsx` (v0.18.5): Librería para generar archivos Excel compatibles

---

## 🎯 Resumen de Cambios

### Archivos Modificados:
- `src/components/DailyOrders.jsx`: Exportación XLSX + compartir WhatsApp
- `package.json`: Dependencia xlsx agregada

### Archivos Nuevos:
- `fix-admin-permissions-FINAL.sql`: Script SQL para arreglar permisos
- `INSTRUCCIONES.md`: Este archivo

---

## 🐛 Solución de Problemas

### "Los administradores no pueden editar el menú"
→ Ejecuta el script `fix-admin-permissions-FINAL.sql` en Supabase

### "El archivo Excel no se abre correctamente"
→ El formato XLSX es compatible con Excel 2016+. Si usas una versión más antigua, actualiza Excel o usa LibreOffice/Google Sheets

### "No aparece el botón de exportar"
→ Asegúrate de tener rol de administrador en la aplicación

---

## ✅ Verificación

Para verificar que todo funciona:

1. **Permisos de Admin:**
   - Entra con una cuenta admin (que no sea la primera)
   - Ve a Panel Admin → Gestionar Menú
   - Intenta agregar/editar un platillo
   - Debería funcionar sin errores

2. **Exportación Excel:**
   - Ve a Pedidos Diarios
   - Haz clic en "Exportar a Excel"
   - Abre el archivo descargado en Excel
   - Verifica que tiene 2 hojas y los datos son legibles

3. **Compartir WhatsApp:**
   - Haz clic en "Compartir Resumen"
   - Verifica que se abre WhatsApp Web
   - El mensaje debe tener formato con emojis y estadísticas

---

## 🚀 ¡Listo!

Todos los administradores ahora tienen permisos completos y pueden exportar pedidos en formato Excel profesional.

# 🔧 Cómo Configurar Opciones de Guarnición

## Paso 1: Acceder al Panel de Admin

1. Inicia sesión como administrador
2. Ve a **Panel Admin** en el menú

## Paso 2: Crear la Opción de Guarnición

1. En el Panel Admin, busca la sección **"Custom Options"** o **"Opciones Personalizadas"**
2. Haz clic en **"+ Agregar Nueva Opción"**

## Paso 3: Configurar la Opción

### Campos a completar:

**Título:**
```
¿Desea cambiar la guarnición?
```
o
```
Guarnición personalizada
```

**Tipo de campo:**
- Selecciona: **Radio Buttons** o **Select** (desplegable)
- NO uses checkbox (permite múltiples selecciones)

**Opciones disponibles:**
```
Puré de papas
Arroz blanco
Arroz integral
Verduras grilladas
Ensalada verde
Papas fritas
Batatas al horno
Sin guarnición adicional
```

**Requerido:**
- ❌ NO (debe ser opcional)
- Si es requerido, todos deberán elegir una guarnición diferente

**Descripción (opcional):**
```
Si prefieres una guarnición diferente a la del menú, selecciónala aquí
```

## Paso 4: Guardar

1. Haz clic en **"Guardar"** o **"Crear Opción"**
2. La opción ahora aparecerá en el formulario de pedidos

## 📋 Ejemplo Completo

```json
{
  "title": "¿Desea cambiar la guarnición?",
  "type": "radio",
  "options": [
    "Puré de papas",
    "Arroz blanco",
    "Arroz integral",
    "Verduras grilladas",
    "Papas fritas",
    "Sin cambio (usar guarnición del menú)"
  ],
  "required": false,
  "description": "Selecciona una guarnición diferente si lo deseas"
}
```

## ✅ Verificación

Después de crear la opción:

1. **Cierra sesión** y vuelve a iniciar como usuario regular
2. **Crea un pedido de prueba**
3. Verifica que aparezca la opción de guarnición
4. Selecciona una guarnición personalizada
5. **Inicia sesión como admin**
6. Ve a **Pedidos Diarios**
7. Deberías ver la guarnición personalizada destacada en naranja con 🔸

## 🎯 Consejos

### ✅ Mejores Prácticas

- **Usa nombres claros**: "Puré de papas" en vez de solo "Puré"
- **Incluye opción por defecto**: "Sin cambio (usar guarnición del menú)"
- **Limita opciones**: No más de 6-8 opciones para facilitar selección
- **Agrupa similares**: Arroz blanco / Arroz integral juntos

### ❌ Evita

- No uses el título "Extras" o "Adicionales" (debe contener "guarnición")
- No hagas la opción requerida (debe ser opcional)
- No uses checkboxes si solo permites una guarnición
- No uses nombres ambiguos

## 🔄 Actualizar Opciones

Para cambiar las opciones de guarnición:

1. Panel Admin → Custom Options
2. Busca la opción de guarnición
3. Click en **"Editar"** ✏️
4. Modifica las opciones
5. Guarda los cambios

## 🗑️ Eliminar Opción

Si deseas quitar la opción de guarnición:

1. Panel Admin → Custom Options
2. Busca la opción
3. Click en **"Eliminar"** 🗑️
4. Confirma la acción

**Nota**: Los pedidos anteriores conservarán sus guarniciones seleccionadas.

## 📊 Monitoreo

Para ver qué guarniciones son más populares:

1. **Pedidos Diarios** → Click en **"Compartir WhatsApp"**
2. Verás la sección "GUARNICIONES PERSONALIZADAS" con el conteo
3. O exporta a Excel y revisa la columna "Platillos"

---

💡 **Tip**: Revisa semanalmente qué guarniciones se piden más y ajusta el menú base según preferencias.

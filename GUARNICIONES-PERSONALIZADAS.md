# 🍽️ Guarniciones Personalizadas - ServiFood

## 📋 Descripción

El sistema ahora detecta automáticamente cuando un usuario elige una guarnición diferente a la del menú base y la muestra de forma destacada en todos los reportes y exportaciones.

## ✨ Características Implementadas

### 1. Detección Automática
- El sistema busca en las opciones adicionales (`custom_responses`) cualquier campo que contenga "guarnición" o "guarnicion" en su título
- Si existe, extrae el valor seleccionado por el usuario
- Funciona con respuestas únicas o múltiples (arrays)

### 2. Visualización en Panel de Administrador
Las guarniciones personalizadas aparecen:
- **En la sección de Platillos** (no en Opciones Adicionales)
- Con un diseño destacado en color naranja
- Con el icono 🔸 y el badge "CUSTOM"
- Separadas visualmente de los items del menú base

### 3. Exportación a Excel
En el archivo `.xlsx` exportado:
- **Columna "Platillos"**: Incluye los items del menú + guarnición personalizada
- Formato: `Milanesa (x1); Ensalada (x1); 🔸 Guarnición: Puré de papas`
- **Columna "Opciones Adicionales"**: Solo muestra otras opciones (sin duplicar guarniciones)

### 4. Compartir por WhatsApp
El resumen de WhatsApp incluye:
- Sección especial **"GUARNICIONES PERSONALIZADAS"**
- Lista de guarniciones únicas con cantidad de pedidos
- Ejemplo:
  ```
  🔸 *GUARNICIONES PERSONALIZADAS*
  • Puré de papas: 5 pedidos
  • Arroz integral: 3 pedidos
  • Verduras grilladas: 2 pedidos
  ```

## 🔧 Cómo Funciona

### Detección
```javascript
// Busca opciones con "guarnición" o "guarnicion" en el título
const getCustomSideFromResponses = (customResponses) => {
  const sideOption = customResponses.find(r => 
    r.title?.toLowerCase().includes('guarnición') || 
    r.title?.toLowerCase().includes('guarnicion')
  )
  
  if (sideOption && sideOption.response) {
    return Array.isArray(sideOption.response) 
      ? sideOption.response.join(', ') 
      : sideOption.response
  }
  
  return null
}
```

### Filtrado de Otras Opciones
```javascript
// Retorna opciones excluyendo guarniciones (para no duplicar)
const getOtherCustomResponses = (customResponses) => {
  return customResponses.filter(r => 
    r.response && 
    !r.title?.toLowerCase().includes('guarnición') && 
    !r.title?.toLowerCase().includes('guarnicion')
  )
}
```

## 💡 Ejemplos de Uso

### Caso 1: Usuario elige guarnición personalizada
**Pedido creado:**
- Menú: Milanesa + Ensalada mixta
- Opción adicional: "¿Cambiar guarnición?" → "Puré de papas"

**Resultado en DailyOrders:**
- ✅ Milanesa (x1)
- ✅ Ensalada mixta (x1)
- ✅ 🔸 Guarnición Personalizada: Puré de papas

**En Excel:**
- Platillos: `Milanesa (x1); Ensalada mixta (x1); 🔸 Guarnición: Puré de papas`

### Caso 2: Usuario NO elige guarnición personalizada
**Pedido creado:**
- Menú: Pollo + Ensalada
- Sin opciones adicionales de guarnición

**Resultado en DailyOrders:**
- ✅ Pollo (x1)
- ✅ Ensalada (x1)
- (No aparece guarnición personalizada, se usa la del menú)

**En Excel:**
- Platillos: `Pollo (x1); Ensalada (x1)`

### Caso 3: Usuario elige múltiples guarniciones
**Pedido creado:**
- Menú: Carne
- Opción adicional: "Guarniciones adicionales" → ["Puré", "Verduras"]

**Resultado:**
- ✅ 🔸 Guarnición Personalizada: Puré, Verduras

## 📊 Impacto en Reportes

### Panel de Pedidos Diarios
- Las guarniciones personalizadas se destacan visualmente
- Color naranja (#FFF7ED fondo, #C2410C borde)
- Badge "CUSTOM" para identificación rápida

### Excel
- **Hoja "Pedidos Detallados"**: Guarniciones en columna "Platillos" con prefijo 🔸
- **Hoja "Estadísticas"**: Las guarniciones NO alteran los conteos de platillos del menú

### WhatsApp
- Sección dedicada si hay al menos una guarnición personalizada
- Cuenta única de cada tipo de guarnición
- Fácil de leer en móvil

## 🎯 Ventajas

1. **Claridad**: Los administradores ven inmediatamente qué guarniciones personalizadas preparar
2. **No duplicación**: Las guarniciones no aparecen dos veces (en platillos Y en opciones)
3. **Flexibilidad**: Funciona con cualquier opción que incluya "guarnición" en el título
4. **Retrocompatibilidad**: Si no hay guarniciones personalizadas, todo funciona igual
5. **Exportable**: Toda la información está en Excel para revisión offline

## 🔍 Casos Especiales

### ¿Qué pasa si hay varias opciones con "guarnición"?
- El sistema toma la primera que encuentre
- **Recomendación**: Usar solo una opción de guarnición por claridad

### ¿Funciona con acentos?
- ✅ Sí, busca tanto "guarnición" (con acento) como "guarnicion" (sin acento)

### ¿Qué pasa si el usuario no responde la opción de guarnición?
- No se muestra nada (usa la guarnición por defecto del menú)
- La opción solo aparece si tiene `response` válido

### ¿Se pueden usar emojis en las guarniciones?
- ✅ Sí, los emojis se respetan en todos los reportes

## 📋 Checklist de Implementación

- [x] Función `getCustomSideFromResponses()`
- [x] Función `getOtherCustomResponses()`
- [x] Integración en exportación Excel
- [x] Integración en compartir WhatsApp
- [x] Visualización en interfaz de pedidos
- [x] Diseño destacado (naranja + badge CUSTOM)
- [x] Pruebas sin errores
- [x] Documentación completa

## 🚀 Próximos Pasos Recomendados

1. **Crear opción de guarnición** en Panel Admin → Custom Options
   - Título: "¿Cambiar guarnición?" o "Guarnición personalizada"
   - Tipo: Radio buttons o Select
   - Opciones: Lista de guarniciones disponibles
   
2. **Informar a usuarios** sobre la nueva opción

3. **Revisar primer día** de pedidos con guarniciones personalizadas

---

✅ **Implementación completada y lista para usar**

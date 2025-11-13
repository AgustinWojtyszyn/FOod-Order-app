# 🚀 Inicio Rápido: Configurar Pruebas de Carga

## ❌ Error Actual
```
❌ Error: Faltan variables de entorno VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
```

## ✅ Solución en 3 Pasos

### Opción A: Script Automático (Recomendado)

```bash
./setup-env.sh
```

El script te pedirá las credenciales y creará el archivo `.env` automáticamente.

### Opción B: Manual

#### Paso 1: Crear archivo .env

```bash
nano .env
```

#### Paso 2: Pegar este contenido (reemplaza los valores)

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Paso 3: Guardar y cerrar

- En nano: `Ctrl+O` → Enter → `Ctrl+X`
- En vim: `Esc` → `:wq` → Enter

### 🔑 ¿Dónde Encuentro mis Credenciales?

#### Método 1: Supabase Dashboard (Recomendado)

1. Ve a https://supabase.com/dashboard
2. Selecciona tu proyecto "food-order-app" o similar
3. Click en **Settings** (⚙️) en el menú lateral izquierdo
4. Click en **API**
5. Copia:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** (en la sección "Project API keys") → `VITE_SUPABASE_ANON_KEY`

#### Método 2: Variables de Render (si ya desplegaste)

1. Ve a https://dashboard.render.com
2. Selecciona tu servicio "food-order-app"
3. Click en **Environment**
4. Busca las variables que comienzan con `VITE_SUPABASE_`

#### Método 3: Inspeccionar la app en producción

1. Abre https://food-order-app-3avy.onrender.com
2. Presiona `F12` para abrir DevTools
3. Ve a la pestaña **Console**
4. Pega este código:

```javascript
// Esto NO revelará credenciales privadas, solo las públicas
console.log('URL:', window.__SUPABASE_URL__ || 'No disponible')
console.log('KEY (primeros 20 chars):', window.__SUPABASE_KEY__?.substring(0,20) || 'No disponible')
```

## ✅ Verificar que Funcionó

Después de crear el `.env`, verifica:

```bash
# Verificar que existe
ls -la .env

# Ver contenido (¡NO compartas este output públicamente!)
cat .env

# Probar carga de variables
npm run test:light
```

Deberías ver:
```
🚀 INICIANDO PRUEBA DE CARGA - SERVIFOOD
============================================================

📋 Configuración:
   - Usuarios a simular: 10
   - Pedidos por usuario: 5
   ...
```

## 🔒 Seguridad

**IMPORTANTE:**

- ✅ El archivo `.env` está en `.gitignore` (no se sube a GitHub)
- ✅ Las credenciales son solo para uso local
- ❌ **NUNCA** compartas tu `.env` públicamente
- ❌ **NUNCA** subas `.env` a GitHub

## 🆘 Troubleshooting

### Problema: "No such file .env"
```bash
# Asegúrate de estar en la raíz del proyecto
cd /home/aggustin/.vscode/food-order-app
pwd  # Debe mostrar: /home/aggustin/.vscode/food-order-app
```

### Problema: "Variables no se cargan"
```bash
# Verifica el formato del archivo
cat .env | head -5

# Debe verse así:
# VITE_SUPABASE_URL=https://...
# VITE_SUPABASE_ANON_KEY=eyJ...
# (sin espacios extra antes o después del =)
```

### Problema: "Permission denied: setup-env.sh"
```bash
chmod +x setup-env.sh
./setup-env.sh
```

## 📚 Más Ayuda

- Documentación completa: `TEST-LOAD-README.md`
- Ejemplo de .env: `.env.example`
- Soporte Supabase: https://supabase.com/docs/guides/api

---

**Siguiente paso:** Una vez configurado el `.env`, ejecuta:
```bash
npm run test:light
```

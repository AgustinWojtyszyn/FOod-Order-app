# Configuración de Verificación de Email en Supabase

## 📧 Sistema de Verificación de Email Implementado

Este documento explica cómo funciona el sistema de verificación de email y cómo configurarlo en Supabase.

## ✅ ¿Qué se implementó?

### 1. **Flujo de Registro Mejorado**
- Al registrarse, el usuario recibe un email de verificación automáticamente
- La cuenta se crea pero **NO puede iniciar sesión** hasta verificar el email
- Pantalla de confirmación con instrucciones claras

### 2. **Verificación de Email**
- Email automático enviado por Supabase con enlace de verificación
- Componente `EmailVerification.jsx` que procesa el enlace
- Confirmación visual del estado de verificación
- Redirección automática al login después de verificar

### 3. **Validación en Login**
- El login verifica si el email fue confirmado
- Mensajes de error específicos si el email no está verificado
- Previene acceso sin verificación

## 🔧 Configuración en Supabase Dashboard

### Paso 1: Habilitar Email Confirmation

1. Ve a tu proyecto en [Supabase Dashboard](https://app.supabase.com)
2. Navega a **Authentication** → **Settings** → **Email Templates**
3. Asegúrate de que "Enable email confirmations" esté **activado** ✅

### Paso 2: Configurar URL de Redirección

1. En **Authentication** → **Settings** → **URL Configuration**
2. Añade las siguientes URLs en **Redirect URLs**:

```
http://localhost:5173/verify-email
https://tu-dominio.com/verify-email
https://food-order-app-3avy.onrender.com/verify-email
```

⚠️ **Importante**: Añade tanto la URL local (desarrollo) como la de producción.

### Paso 3: Personalizar Template de Email (Opcional)

1. Ve a **Authentication** → **Email Templates** → **Confirm signup**
2. Puedes personalizar el mensaje del email:

```html
<h2>Confirma tu email</h2>
<p>Hola,</p>
<p>¡Gracias por registrarte en ServiFood!</p>
<p>Haz clic en el siguiente enlace para verificar tu correo electrónico:</p>
<p><a href="{{ .ConfirmationURL }}">Verificar mi email</a></p>
<p>Este enlace expira en 24 horas.</p>
<p>Si no creaste esta cuenta, puedes ignorar este email.</p>
```

### Paso 4: Configurar Email Provider (SMTP)

Por defecto, Supabase usa su propio servicio de email, pero tiene **límites**:
- ⚠️ Solo 3 emails por hora en el plan gratuito
- ⚠️ Los emails pueden llegar a spam

**Recomendación: Configurar SMTP personalizado**

#### Opción A: Gmail SMTP (Gratis)

1. Ve a **Settings** → **Authentication** → **SMTP Settings**
2. Activa "Enable Custom SMTP"
3. Configura:
   ```
   Host: smtp.gmail.com
   Port: 587
   Username: tu-email@gmail.com
   Password: [App Password - ver instrucciones abajo]
   Sender email: tu-email@gmail.com
   Sender name: ServiFood Catering
   ```

**Cómo obtener App Password de Gmail:**
1. Ve a [myaccount.google.com](https://myaccount.google.com)
2. Security → 2-Step Verification (actívalo si no lo tienes)
3. App passwords → Selecciona "Mail" y "Other (Custom name)"
4. Copia la contraseña de 16 caracteres

#### Opción B: SendGrid (Recomendado para Producción)

1. Crea cuenta gratuita en [SendGrid](https://sendgrid.com) (100 emails/día gratis)
2. Verifica tu dominio
3. Crea API Key
4. En Supabase SMTP Settings:
   ```
   Host: smtp.sendgrid.net
   Port: 587
   Username: apikey
   Password: [Tu SendGrid API Key]
   Sender email: noreply@tu-dominio.com
   Sender name: ServiFood Catering
   ```

#### Opción C: Resend (Moderno y Simple)

1. Crea cuenta en [Resend.com](https://resend.com) (3,000 emails/mes gratis)
2. Verifica tu dominio
3. Crea API Key
4. En Supabase SMTP Settings:
   ```
   Host: smtp.resend.com
   Port: 587
   Username: resend
   Password: [Tu Resend API Key]
   Sender email: noreply@tu-dominio.com
   Sender name: ServiFood Catering
   ```

### Paso 5: Probar el Sistema

1. Registra una cuenta de prueba con tu email real
2. Verifica que llegue el email de confirmación
3. Haz clic en el enlace de verificación
4. Confirma que te redirija a `/verify-email` correctamente
5. Intenta iniciar sesión y verifica que funcione

## 🧪 Probar en Desarrollo

```bash
# 1. Asegúrate de tener las variables de entorno correctas
cat .env

# 2. Inicia el servidor de desarrollo
npm run dev

# 3. Ve a http://localhost:5173/register
# 4. Registra una cuenta con tu email real
# 5. Revisa tu bandeja de entrada
# 6. Haz clic en el enlace de verificación
# 7. Deberías ver la pantalla de "¡Verificación exitosa!"
# 8. Inicia sesión normalmente
```

## 📋 Flujo Completo del Usuario

```
1. Usuario va a /register
   ↓
2. Completa el formulario (nombre, email, contraseña)
   ↓
3. Hace clic en "Crear Cuenta Gratis"
   ↓
4. Sistema crea la cuenta en Supabase
   ↓
5. Supabase envía email con enlace de verificación
   ↓
6. Pantalla muestra: "¡Verifica tu email!"
   - Instrucciones claras
   - Email del usuario visible
   - Pasos a seguir numerados
   ↓
7. Usuario abre su correo
   ↓
8. Hace clic en "Verify Email" del email
   ↓
9. Redirección a: /verify-email
   ↓
10. Componente EmailVerification procesa el token
    ↓
11. Pantalla muestra: "¡Verificación exitosa!" ✅
    ↓
12. Redirección automática a /login (3 segundos)
    ↓
13. Usuario puede iniciar sesión normalmente
```

## 🔒 Seguridad Implementada

### ✅ Validaciones en Login
- Verifica `email_confirmed_at` antes de permitir acceso
- Mensaje específico si el email no está verificado
- Cierra sesión automáticamente si no está verificado

### ✅ Mensajes de Error Mejorados
- "Email not confirmed" → Mensaje claro en español
- "Invalid credentials" → "Correo o contraseña incorrectos"
- "Already registered" → "Este correo ya está registrado"

### ✅ Protección de Rutas
- Las rutas protegidas verifican autenticación
- Solo usuarios con email verificado pueden acceder

## 🎨 Componentes Creados/Modificados

### 1. `Register.jsx` (Modificado)
- Icono `Mail` en lugar de `CheckCircle`
- Mensaje detallado de verificación
- Email del usuario visible
- Instrucciones paso a paso
- Warning sobre revisar spam
- Botón para registrar otra cuenta

### 2. `Login.jsx` (Modificado)
- Validación de `email_confirmed_at`
- Mensajes de error específicos
- Cierre de sesión si no verificado

### 3. `EmailVerification.jsx` (Nuevo)
- Procesa el token de verificación
- 3 estados: loading, success, error
- Feedback visual con iconos animados
- Redirección automática
- Mensajes claros en cada estado

### 4. `App.jsx` (Modificado)
- Nueva ruta: `/verify-email`
- Import de `EmailVerification`

### 5. `supabaseClient.js` (Modificado)
- `emailRedirectTo` apunta a `/verify-email`

## 🐛 Troubleshooting

### Problema: "Email not sent"
**Solución:**
- Verifica que SMTP esté configurado correctamente
- Revisa los límites del plan gratuito de Supabase
- Considera usar un proveedor SMTP externo

### Problema: "El enlace no funciona"
**Solución:**
- Verifica que `/verify-email` esté en Redirect URLs de Supabase
- Confirma que el dominio coincida exactamente
- Limpia cache y cookies del navegador

### Problema: "Email va a spam"
**Solución:**
- Configura SMTP personalizado (Gmail, SendGrid, Resend)
- Verifica SPF y DKIM en tu dominio
- Usa un dominio personalizado en lugar de @gmail.com

### Problema: "Invalid token"
**Solución:**
- El token expira en 24 horas
- El usuario debe solicitar un nuevo enlace
- Implementa función para reenviar email de verificación (opcional)

## 📊 Monitoreo

### Ver usuarios no verificados (SQL en Supabase)

```sql
-- Usuarios registrados pero no verificados
SELECT 
  id,
  email,
  created_at,
  email_confirmed_at
FROM auth.users
WHERE email_confirmed_at IS NULL
ORDER BY created_at DESC;

-- Usuarios verificados en las últimas 24h
SELECT 
  id,
  email,
  created_at,
  email_confirmed_at,
  EXTRACT(EPOCH FROM (email_confirmed_at - created_at))/60 as minutos_hasta_verificacion
FROM auth.users
WHERE email_confirmed_at IS NOT NULL
  AND email_confirmed_at > NOW() - INTERVAL '24 hours'
ORDER BY email_confirmed_at DESC;
```

## 🚀 Mejoras Futuras (Opcional)

### 1. Reenviar Email de Verificación
Crear botón en login para reenviar email si no llegó:

```javascript
// En Login.jsx
const resendVerificationEmail = async (email) => {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: email,
  })
  
  if (!error) {
    alert('Email de verificación reenviado. Revisa tu bandeja de entrada.')
  }
}
```

### 2. Recordatorio Automático
Enviar email recordatorio después de 24h si no verificó:

```javascript
// Supabase Function (Edge Function)
// Ejecutar diariamente con cron job
```

### 3. Expiración de Cuentas No Verificadas
Eliminar cuentas no verificadas después de 7 días:

```sql
-- Ejecutar semanalmente
DELETE FROM auth.users
WHERE email_confirmed_at IS NULL
  AND created_at < NOW() - INTERVAL '7 days';
```

## 📝 Checklist de Verificación

Antes de ir a producción, verifica:

- [ ] SMTP personalizado configurado (Gmail/SendGrid/Resend)
- [ ] Redirect URLs añadidas en Supabase (local + producción)
- [ ] Email templates personalizados con branding de ServiFood
- [ ] Probado flujo completo de registro → verificación → login
- [ ] Emails NO van a spam
- [ ] Mensajes de error claros en español
- [ ] Mobile responsive (pantallas de verificación)
- [ ] Analytics configurado para trackear conversión de verificación

## 🔗 URLs Importantes

- **Supabase Dashboard**: https://app.supabase.com
- **Email Templates**: Authentication → Email Templates
- **SMTP Settings**: Settings → Authentication → SMTP
- **Redirect URLs**: Authentication → URL Configuration

## 📞 Soporte

Si tienes problemas con la verificación de email:
1. Revisa los logs en Supabase Dashboard → Logs
2. Verifica la configuración SMTP
3. Prueba con diferentes proveedores de email
4. Contacta soporte de Supabase: support@supabase.com

---

✅ **Sistema de verificación de email completamente implementado y funcional**

Última actualización: 13 de noviembre de 2025

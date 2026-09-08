# ServiFood — Sistema de Gestión de Pedidos de Comida

ServiFood es una aplicación web diseñada para gestionar pedidos de comida de forma simple y organizada dentro de empresas o equipos de trabajo.

Permite a los usuarios solicitar su comida diaria mediante un sistema de menú dinámico, mientras que los administradores pueden gestionar usuarios, pedidos y opciones del menú desde un panel de control.

El proyecto está orientado a demostrar el desarrollo de una aplicación web full stack con autenticación, gestión de datos y panel administrativo.

---

## Características principales

- Registro e inicio de sesión de usuarios
- Sistema de pedidos de comida
- Selección dinámica de menú
- Historial de pedidos
- Panel administrativo para gestión de usuarios y pedidos
- Interfaz responsive para distintos dispositivos
- Gestión centralizada de pedidos

---

## Tecnologías utilizadas

### Frontend

- React
- Vite
- Tailwind CSS

### Servicios y backend

- Supabase (base de datos y autenticación)

### Otras herramientas

- React Router
- Lucide Icons

---

## Objetivo del proyecto

Este proyecto simula una plataforma utilizada por empresas para organizar y gestionar pedidos de comida diarios de sus empleados.

Sirve como ejemplo de:

- Desarrollo de aplicaciones web full stack
- Autenticación y gestión de usuarios
- Interacción con bases de datos
- Paneles administrativos
- Interfaces modernas y responsive

---

## Estructura general del proyecto


public/
src/
supabase/


---

## Nota

Algunos detalles técnicos y configuraciones internas fueron omitidos del repositorio público para simplificar la documentación y proteger información sensible del sistema.

---

## Autor

Agustin Wojtyszyn  
Desarrollador Web Full Stack

---

## Arquitectura general

La aplicación sigue una arquitectura web moderna:

- Frontend SPA construido con React
- Backend y base de datos gestionados mediante Supabase
- Autenticación integrada para control de acceso
- Panel administrativo para gestión del sistema

### Order normalization (read-only)

`normalizeOrderForReadOnly(order)` se usa únicamente en analytics, daily y monthly.

- No modifica `order.items` ni `order.custom_responses`
- Agrega: `normalizedItems`, `normalizedCustomResponses`
- Uso exclusivo para lectura
- Prohibido usar en submit, edición o idempotencia

Motivo:  
Unificar lectura sin afectar el contrato persistido ni romper pedidos existentes

---

## Estado del proyecto

Proyecto en desarrollo activo.

Incluye mejoras continuas en:

- experiencia de usuario
- optimización del sistema
- nuevas funcionalidades administrativas

## Auditorías técnicas

- [Auditoría completa de la app - 2026-06-19](./AUDITORIA_COMPLETA_APP_2026-06-19.txt)
- [Auditoría general de riesgos](./AUDITORIA_GENERAL_RIESGOS.txt)
- [Auditoría de protección de rutas admin](./AUDITORIA_PROTECCION_RUTAS_ADMIN.txt)
- [Auditoría quirúrgica de pedidos ServiFood](./AUDITORIA_QUIRURGICA_SERVIFOOD_ORDERS.txt)

## Reporte diario por email

La función Supabase Edge `daily-orders-report` envía el Excel `.xlsx` y el resumen diario de pedidos pendientes. Es server-side, usa `SUPABASE_SERVICE_ROLE_KEY` solo dentro de la función, exige el header `x-cron-secret` y registra idempotencia en `daily_report_runs`.

Variables requeridas en Supabase Edge:

```bash
DAILY_REPORT_RECIPIENTS=sarmientoclaudia985@gmail.com,agustinwojtyszyn99@gmail.com
MAIL_FROM="ServiFood Pedidos <reportes@tu-dominio.com>"
EMAIL_PROVIDER_API_KEY=...
SERVIFOOD_LOGO_URL=https://url-publica/logo-servifood.png
TEST_REPORT_RECIPIENT=agustinwojtyszyn99@gmail.com
CRON_SECRET=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

El proveedor implementado es Resend vía `EMAIL_PROVIDER_API_KEY`. No configurar secretos ni service role en el frontend. `SERVIFOOD_LOGO_URL` es opcional y debe apuntar a una URL pública HTTPS del logo, por ejemplo Supabase Storage público o un asset público del frontend deployado; si no está configurado, el email muestra el texto `ServiFood Catering`.

La ejecución real debe programarse todos los días a las `01:10 UTC`, que equivale a `22:10 ART` en Argentina. A esa hora la fecha objetivo default es `delivery_date = día siguiente` en `America/Argentina/Buenos_Aires`.

Cron recomendado:

```text
10 1 * * *
```

Cron de archivado condicional posterior al envío:

```text
15 1 * * *
```

Este segundo cron llama la misma Edge Function con `mode=archiveAfterSuccessfulReport`. No envía email ni genera Excel; solo archiva pedidos `pending` de `delivery_date = reportDate` si existe un `daily_report_runs` reciente con `report_type = daily_orders`, `status = sent` y `sent_at` informado.

Payload soportado:

```json
{
  "mode": "send",
  "reportDate": "2026-06-23",
  "force": false,
  "allowEmpty": true,
  "sendTo": "email-opcional-solo-pruebas@example.com"
}
```

Ejemplos de prueba:

```bash
curl -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: $CRON_SECRET" \
  -d '{"mode":"dryRun","reportDate":"2026-06-23"}'
```

```bash
curl -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: $CRON_SECRET" \
  -d '{"mode":"testEmail","sendTo":"agustinwojtyszyn99@gmail.com"}'
```

```bash
curl -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: $CRON_SECRET" \
  -d '{"mode":"testEmailReal","reportDate":"2026-06-25"}'
```

```bash
curl -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: $CRON_SECRET" \
  -d '{"mode":"send","reportDate":"2026-06-23","force":true,"allowEmpty":true}'
```

`mode=dryRun` no envía email ni registra envío exitoso. `mode=testEmail` usa pedidos mock internos, marca el asunto/cuerpo/Excel como prueba y por defecto solo envía a `TEST_REPORT_RECIPIENT` o `agustinwojtyszyn99@gmail.com`. `mode=testEmailReal` consulta pedidos reales pendientes para `delivery_date = reportDate`, envía solo al destinatario de prueba y no escribe `daily_report_runs` ni archiva pedidos. `mode=send` consulta `orders_with_person_key` con `status = 'pending'` y `delivery_date = reportDate`, genera el Excel y respeta idempotencia; solo reenvía si `force=true`.

---

## Vista del sistema

Interfaz principal del sistema de pedidos utilizada por los usuarios para seleccionar su menú diario.

<img width="1919" height="4512" alt="screencapture-servifoodapp-site-order-administracion-servifood-2026-09-08-10_10_26" src="https://github.com/user-attachments/assets/ccd822b0-3311-498f-8109-abb1c3185352" />"/>

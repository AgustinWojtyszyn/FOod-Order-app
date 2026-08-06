# Codebase Map - ServiFood Pedidos

## Stack principal

- React 19 + Vite 7.
- React Router DOM 7.
- Supabase JS 2 para Auth, Postgres, RPC y Edge Functions.
- Supabase Edge Functions en Deno/TypeScript.
- Render Static Site sirve `dist` como SPA estatica.
- ExcelJS para reportes Excel en la Edge Function de reporte diario.
- ESLint 9 y Vitest.

## Carpetas principales

- `src/components`: pantallas y componentes React.
- `src/hooks`: controladores de datos y flujos de UI.
- `src/services`: servicios de acceso a Supabase por dominio.
- `src/utils`: reglas puras, formateadores, exportadores y helpers.
- `src/constants`: reglas de negocio y configuracion de empresas.
- `src/contexts`: Auth, ayuda y bloqueo de overlays.
- `supabase/functions`: Edge Functions.
- `supabase/functions/_shared`: logica compartida de Edge Functions.
- `supabase/migrations`: SQL critico de RPCs, guards, crons y archivado.
- `docs`: documentacion operativa y auditorias.
- `reports` y `testing`: pruebas de carga/reportes locales.

## Runtime de produccion

- Render usa `runtime: static` en `render.yaml`.
- El build ejecuta `npm install && npm run build`.
- Render publica `./dist`.
- La regla `/* -> /index.html` conserva el routing SPA de React Router.
- No hay runtime Node ni endpoints `/api` propios en produccion.
- `/health` y `/__cache-debug` fueron retirados junto con `server.js`.
- La UI de auditoria verifica salud consultando Supabase directamente desde `src/services/supabase.js`.
- El backend real vive en Supabase: Auth, Postgres, RPCs y Edge Functions.
- `daily-orders-report` y los crons dependen de Supabase Edge/SQL, no del deploy frontend de Render.
- Los secretos server-side de Edge Functions no deben configurarse como `VITE_*` ni incorporarse al bundle frontend.

## Rutas y pantallas importantes

Definidas en `src/App.jsx`:

- `/`: landing o redirect al dashboard.
- `/login`, `/register`, `/forgot-password`, `/reset-password`, `/auth/callback`: autenticacion.
- `/dashboard`: panel del usuario.
- `/order`: selector de empresa.
- `/order/:companySlug`: formulario de pedido.
- `/edit-order`: edicion de pedido.
- `/orders/:orderId`: detalle.
- `/profile`: perfil.
- `/admin`: panel admin.
- `/daily-orders`: vista diaria operativa.
- `/monthly-panel`: panel mensual.
- `/auditoria`: auditoria.
- `/tendencias`: tendencias.
- `/cafeteria`, `/cafeteria/new`, `/cafeteria/order`, `/cafeteria/confirm`: flujo cafeteria admin.

## Flujo de creacion de pedidos

Archivos a mirar primero:

- `src/components/OrderForm.jsx`
- `src/hooks/orderForm/useOrderFlowController.js`
- `src/hooks/useOrderBootstrap.js`
- `src/hooks/useOrderSubmit.js`
- `src/utils/order/orderSubmit.js`
- `src/utils/order/orderPayload.js`
- `src/utils/order/orderValidation.js`
- `src/utils/order/orderBusinessRules.js`
- `src/services/orders/ordersService.js`
- `supabase/migrations/20260619093000_admin_order_cleanup_and_order_guards.sql`

Resumen:

1. `OrderForm` delega el estado y acciones al `useOrderFlowController`.
2. El controlador carga usuario, empresa, menus, opciones personalizadas, reglas de almuerzo/cena y sugerencias.
3. La validacion de seleccion y reglas del formulario vive en `src/utils/order`.
4. `submitOrders` arma payloads por servicio (`lunch`/`dinner`), evita duplicados activos por fecha/servicio y usa idempotencia en `sessionStorage`.
5. `ordersService.createOrder` llama al RPC `create_order_idempotent`.
6. El RPC valida usuario autenticado, ventana horaria, servicio, items, cena habilitada y duplicados activos antes de insertar en `orders`.

## Flujo de daily-orders

Archivos a mirar primero:

- `src/components/DailyOrders.jsx`
- `src/hooks/useDailyOrdersData.js`
- `src/hooks/useDailyOrdersFilters.js`
- `src/components/daily/*`
- `src/utils/daily/dailyOrderCalculations.js`
- `src/utils/daily/dailyOrdersExportModel.js`
- `src/utils/daily/exportDailyOrdersExcel.js`
- `src/utils/daily/exportDailyOrdersPdf.js`
- `src/utils/daily/shareDailyOrdersWhatsApp.js`

Resumen:

1. La pantalla `/daily-orders` es admin-only.
2. `useDailyOrdersData` valida rol admin via `usersService.getUserById`.
3. Lee `orders_with_person_key` y `getAdminPeopleUnified`.
4. Filtra por la fecha operativa calculada con `getTomorrowISOInTimeZone`.
5. Enriquece nombre/email por `person_key` y calcula estadisticas con `calculateStats`.
6. Refresca periodicamente cada 30 segundos cuando el usuario es admin.
7. Permite archivar pedidos individuales o pendientes de la fecha operativa.

## Flujo de reporte automatico

Archivos a mirar primero:

- `supabase/functions/daily-orders-report/index.ts`
- `supabase/functions/_shared/daily_report.ts`
- `supabase/functions/_shared/daily_report.test.ts`
- `supabase/migrations/20260625090000_archive_orders_by_delivery_date_and_report_locks.sql`
- `supabase/migrations/20260626091500_daily_orders_report_archive_cron.sql`

Resumen:

1. La Edge Function `daily-orders-report` acepta solo `POST`.
2. Autoriza con `x-cron-secret`/secret compatible usando `CRON_SECRET`.
3. Calcula `reportDate`; por defecto es la fecha de entrega siguiente en Argentina.
4. Modos soportados: `send`, `dryRun`, `testEmail`, `testEmailReal`, `archiveAfterSuccessfulReport`.
5. En `send`, lee pedidos `pending` de `orders_with_person_key` por `delivery_date`.
6. Construye resumen HTML/texto y Excel con ExcelJS.
7. Envia email via Resend usando `EMAIL_PROVIDER_API_KEY` o `RESEND_API_KEY`.
8. Registra locks/resultados en `daily_report_runs` para evitar duplicados.
9. El cron SQL `daily-orders-report-archive-2215-art` invoca el modo `archiveAfterSuccessfulReport` despues del reporte.

## Flujo de archivado

Archivos a mirar primero:

- `src/hooks/useDailyOrdersData.js`
- `src/hooks/dashboard/useDashboardOrderActions.js`
- `src/hooks/admin/useAdminCleanupActions.js`
- `src/services/orders/ordersService.js`
- `supabase/functions/daily-orders-report/index.ts`
- `supabase/migrations/20260625090000_archive_orders_by_delivery_date_and_report_locks.sql`

Resumen:

- Archivado individual: `db.updateOrderStatus(order.id, 'archived')`.
- Archivado masivo operativo: `archivePendingOrdersByDeliveryDate` llama RPC `archive_orders_bulk_by_delivery_date`.
- Archivado post-reporte: la Edge Function verifica que exista un reporte exitoso reciente en `daily_report_runs` y luego llama al mismo RPC.
- Limpieza admin de archivados: `admin_delete_archived_orders` elimina pedidos archivados y registra auditoria.
- No confundir archivar con eliminar; varios flujos preservan historico mensual.

## Servicios principales

- `src/services/supabase.js`: cliente Supabase compartido, cache, health check y metricas.
- `src/supabaseClient.js`: fachada `db`, auth y composicion de servicios.
- `src/services/orders/ordersService.js`: pedidos, RPCs de creacion/archivado/limpieza.
- `src/services/users/usersService.js`: usuarios/admin/personas.
- `src/services/menu/menuService.js`: menu almuerzo/cena.
- `src/services/customOptions/customOptionsService.js`: opciones personalizadas y overrides.
- `src/services/analytics/analyticsService.js`: metricas/tendencias.
- `src/services/audit.js`: utilidades de auditoria.

## Edge Functions importantes

- `daily-orders-report`: reporte diario, Excel, email, locks y modo de archivado post-reporte.
- `toggle-dinner`: habilita feature `dinner` via RPC `enable_feature`.
- `admin-change-email`: cambio de email administrado con validacion de rol.
- `_shared/daily_report.ts`: normalizacion, resumen, render HTML/texto, reglas de modos y helpers de archivado.

## Tablas, vistas y RPCs Supabase criticas

Tablas/vistas:

- `orders`
- `orders_with_person_key`
- `orders_count_by_person`
- `users`
- `user_features`
- `menu_items`
- `dinner_menu_by_date`
- `custom_options`
- `custom_option_overrides`
- `daily_report_runs`
- `audit_logs`
- `cafeteria_orders`

RPCs/funciones:

- `create_order_idempotent`
- `archive_orders_bulk_by_delivery_date`
- `admin_delete_archived_orders`
- `admin_delete_all_orders`
- `cancel_own_pending_order`
- `enable_feature`
- `log_metric`
  - Diagnostico de permisos/callers: `supabase/diagnostics/log_metric_permissions.sql`
- `invoke_daily_orders_report_archive_after_successful_report`

## Zonas delicadas

- Ventana horaria y duplicados en `create_order_idempotent`.
- Reglas de cena y `user_features`.
- Fecha operativa: varios flujos usan manana en zona horaria Argentina, no simplemente `new Date()` local.
- `daily_report_runs`: evita reportes duplicados y controla el archivado post-reporte.
- RPCs `security definer`: revisar permisos, `search_path` y grants antes de cambiar.
- Si falla el RPC `log_metric`, correr `supabase/diagnostics/log_metric_permissions.sql` en el SQL Editor del proyecto afectado.
- `orders.status`: `pending`, `archived`, `cancelled` impactan dashboard, daily, monthly y reportes.
- `orders_with_person_key`: usada para agrupar personas y enriquecer reportes.
- Variables de entorno de Supabase/Resend/Cron: no escribir valores reales en docs ni codigo.
- `render.yaml`, `supabase/config.toml`, migrations y Edge Functions: revisar dos veces antes de editar.

## Archivos que Codex debe mirar primero

Para rutas y navegacion:

- `src/App.jsx`
- `src/components/Layout.jsx`
- `src/contexts/AuthContext.jsx`
- `src/components/RequireAdmin.jsx`

Para pedidos:

- `src/components/OrderForm.jsx`
- `src/hooks/orderForm/useOrderFlowController.js`
- `src/utils/order/orderSubmit.js`
- `src/services/orders/ordersService.js`
- `supabase/migrations/20260619093000_admin_order_cleanup_and_order_guards.sql`

Para daily-orders:

- `src/components/DailyOrders.jsx`
- `src/hooks/useDailyOrdersData.js`
- `src/utils/daily/dailyOrderCalculations.js`
- `src/utils/daily/dailyOrdersExportModel.js`

Para reportes automaticos:

- `supabase/functions/daily-orders-report/index.ts`
- `supabase/functions/_shared/daily_report.ts`
- `supabase/migrations/20260626091500_daily_orders_report_archive_cron.sql`

Para archivado/limpieza:

- `src/hooks/useDailyOrdersData.js`
- `src/hooks/admin/useAdminCleanupActions.js`
- `src/services/orders/ordersService.js`
- `supabase/migrations/20260625090000_archive_orders_by_delivery_date_and_report_locks.sql`

Para Supabase:

- `src/services/supabase.js`
- `src/supabaseClient.js`
- `supabase/config.toml`
- `supabase/migrations/*`

## Nota para reindexado

El proyecto esta indexado en codebase-memory-mcp como:

```text
home-aggustin-.vscode-food-order-app
```

Comandos utiles:

```bash
/home/aggustin/.local/bin/codebase-memory-mcp cli list_projects '{}'
/home/aggustin/.local/bin/codebase-memory-mcp cli index_status '{"project":"home-aggustin-.vscode-food-order-app"}'
/home/aggustin/.local/bin/codebase-memory-mcp cli index_repository '{"repo_path":"/home/aggustin/.vscode/food-order-app"}'
```

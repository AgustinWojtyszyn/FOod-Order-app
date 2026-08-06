# Render static runtime note

## Estado actual

Render sirve la aplicacion como una SPA estatica. El backend vigente vive en
Supabase: Auth, Postgres, RPCs y Edge Functions.

### Evidencia

- `render.yaml` define `runtime: static`.
- `render.yaml` construye con `npm install && npm run build`.
- `render.yaml` publica `./dist`.
- El rewrite `/* -> /index.html` mantiene React Router en rutas directas.

## Backend

No hay runtime Node en produccion. `server.js` fue retirado porque ya no contenia
endpoints de negocio. Con ese retiro tambien desaparecen `/health` y
`/__cache-debug`.

Los procesos server-side reales son:

- Supabase Auth y Postgres desde el frontend con `@supabase/supabase-js`.
- RPCs de dominio para pedidos, usuarios, archivado y metricas.
- Edge Functions, en particular `daily-orders-report`.
- Crons SQL/Supabase que invocan Edge Functions o RPCs.

`daily-orders-report` y los crons no dependen del deploy frontend. Sus secretos
(`SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `EMAIL_PROVIDER_API_KEY`,
destinatarios y remitente) deben configurarse como secretos de Supabase Edge
Functions, no como variables `VITE_*` ni en Render Static.

La UI de auditoria verifica salud consultando Supabase directamente desde
`src/services/supabase.js`; no llama a `/health`.

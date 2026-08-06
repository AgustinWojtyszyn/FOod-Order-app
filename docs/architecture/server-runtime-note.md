# server.js runtime note

## Estado actual

El archivo `server.js` existe en el repositorio, pero no forma parte del flujo de deploy actual.
Render sirve la aplicacion como frontend estatico.

### Evidencia
- `render.yaml` construye con `npm run build`
- `render.yaml` sirve la app con `npx serve -s dist -l ${PORT:-3000} --single`
- `package.json` no tiene scripts que ejecuten `server.js`

No agregar dependencias para `server.js` ni cambiar el deploy para ejecutarlo sin una decision explicita. Si se reactiva en el futuro, las claves privadas deben leerse solo desde variables backend como `SUPABASE_SERVICE_ROLE_KEY`; nunca desde variables con prefijo `VITE_`.

## Observacion importante

`server.js` conserva endpoints y middleware que no se usan en el deploy vigente. Tambien referencia dependencias que no estan declaradas en `package.json`; eso es aceptable mientras el archivo siga fuera del runtime real.

## Bloqueo contra reactivacion accidental

`server.js` NO debe formar parte del runtime actual. No cambiar `render.yaml` para ejecutar `node server.js` sin completar antes esta lista:

1. Declarar `express` y `body-parser` como dependencias directas si siguen siendo necesarias.
2. Eliminar cualquier fallback a variables con prefijo `VITE_*` para claves de backend.
3. Validar rol admin server-side en endpoints sensibles.
4. Limitar MIME, extension real y tamano de archivos subidos si se vuelve a incorporar carga de archivos.
5. Revisar memoria y estrategia de `cluster` en Render antes de lanzar `os.cpus().length` workers.

Hasta que esa lista este resuelta, cualquier funcionalidad que dependa de `/api/*` de `server.js` debe permanecer deshabilitada o migrarse a Supabase Edge Functions/backend real.

-- Diagnostic report for the log_metric RPC.
-- Run in Supabase SQL editor or with psql against the target database.
-- This script is read-only: it only inspects PostgreSQL catalog metadata.

WITH metric_functions AS (
  SELECT
    p.oid,
    n.nspname AS schema_name,
    p.proname AS function_name,
    pg_get_function_identity_arguments(p.oid) AS arguments,
    pg_get_function_result(p.oid) AS return_type,
    pg_get_userbyid(p.proowner) AS owner,
    p.prosecdef AS security_definer,
    p.proacl,
    p.proconfig,
    l.lanname AS language,
    pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language l ON l.oid = p.prolang
  WHERE p.proname = 'log_metric'
    AND p.prokind IN ('f', 'p')
),
function_report AS (
  SELECT
    '1_FUNCION_LOG_METRIC'::text AS section,
    jsonb_build_object(
      'firma',
        format(
          '%I.%I(%s)',
          mf.schema_name,
          mf.function_name,
          mf.arguments
        ),
      'retorna', mf.return_type,
      'propietario', mf.owner,
      'lenguaje', mf.language,
      'security_definer', mf.security_definer,
      'search_path_configurado', mf.proconfig,
      'acl_crudo', mf.proacl,
      'anon_puede_ejecutar',
        CASE
          WHEN to_regrole('anon') IS NULL THEN NULL
          ELSE has_function_privilege(
            to_regrole('anon'),
            mf.oid,
            'EXECUTE'
          )
        END,
      'authenticated_puede_ejecutar',
        CASE
          WHEN to_regrole('authenticated') IS NULL THEN NULL
          ELSE has_function_privilege(
            to_regrole('authenticated'),
            mf.oid,
            'EXECUTE'
          )
        END,
      'service_role_puede_ejecutar',
        CASE
          WHEN to_regrole('service_role') IS NULL THEN NULL
          ELSE has_function_privilege(
            to_regrole('service_role'),
            mf.oid,
            'EXECUTE'
          )
        END,
      'postgres_puede_ejecutar',
        CASE
          WHEN to_regrole('postgres') IS NULL THEN NULL
          ELSE has_function_privilege(
            to_regrole('postgres'),
            mf.oid,
            'EXECUTE'
          )
        END,
      'definicion', mf.definition
    ) AS detail
  FROM metric_functions mf
),
schema_report AS (
  SELECT
    '2_PERMISOS_SCHEMA'::text AS section,
    jsonb_build_object(
      'schema', n.nspname,
      'anon_tiene_usage',
        CASE
          WHEN to_regrole('anon') IS NULL THEN NULL
          ELSE has_schema_privilege(
            to_regrole('anon'),
            n.oid,
            'USAGE'
          )
        END,
      'authenticated_tiene_usage',
        CASE
          WHEN to_regrole('authenticated') IS NULL THEN NULL
          ELSE has_schema_privilege(
            to_regrole('authenticated'),
            n.oid,
            'USAGE'
          )
        END,
      'service_role_tiene_usage',
        CASE
          WHEN to_regrole('service_role') IS NULL THEN NULL
          ELSE has_schema_privilege(
            to_regrole('service_role'),
            n.oid,
            'USAGE'
          )
        END
    ) AS detail
  FROM pg_namespace n
  WHERE n.oid IN (
    SELECT p.pronamespace
    FROM pg_proc p
    WHERE p.proname = 'log_metric'
      AND p.prokind IN ('f', 'p')
  )
),
callable_functions AS (
  SELECT
    p.oid,
    n.nspname AS schema_name,
    p.proname AS function_name,
    pg_get_function_identity_arguments(p.oid) AS arguments,
    pg_get_userbyid(p.proowner) AS owner,
    p.prosecdef AS security_definer,
    pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prokind IN ('f', 'p')
    AND p.proname <> 'log_metric'
    AND n.nspname NOT IN (
      'pg_catalog',
      'information_schema',
      'pg_toast'
    )
),
caller_report AS (
  SELECT
    '3_FUNCIONES_QUE_LA_LLAMAN'::text AS section,
    jsonb_build_object(
      'firma',
        format(
          '%I.%I(%s)',
          cf.schema_name,
          cf.function_name,
          cf.arguments
        ),
      'propietario', cf.owner,
      'security_definer', cf.security_definer,
      'definicion', cf.definition
    ) AS detail
  FROM callable_functions cf
  WHERE cf.definition ILIKE '%log_metric%'
),
summary_report AS (
  SELECT
    '0_RESUMEN'::text AS section,
    jsonb_build_object(
      'funciones_log_metric_encontradas',
        (SELECT count(*) FROM metric_functions),
      'sin_permiso_authenticated',
        (
          SELECT count(*)
          FROM metric_functions mf
          WHERE to_regrole('authenticated') IS NOT NULL
            AND NOT has_function_privilege(
              to_regrole('authenticated'),
              mf.oid,
              'EXECUTE'
            )
        ),
      'sin_permiso_anon',
        (
          SELECT count(*)
          FROM metric_functions mf
          WHERE to_regrole('anon') IS NOT NULL
            AND NOT has_function_privilege(
              to_regrole('anon'),
              mf.oid,
              'EXECUTE'
            )
        ),
      'funciones_que_la_llaman',
        (SELECT count(*) FROM caller_report),
      'diagnostico_probable',
        CASE
          WHEN NOT EXISTS (
            SELECT 1 FROM metric_functions
          )
            THEN 'No existe ninguna función llamada log_metric'
          WHEN EXISTS (
            SELECT 1
            FROM metric_functions mf
            WHERE to_regrole('authenticated') IS NOT NULL
              AND NOT has_function_privilege(
                to_regrole('authenticated'),
                mf.oid,
                'EXECUTE'
              )
          )
            THEN 'authenticated no posee EXECUTE sobre una o más firmas'
          ELSE
            'EXECUTE parece habilitado; revisar el rol efectivo, la firma invocada o el esquema'
        END
    ) AS detail
)
SELECT section, detail
FROM (
  SELECT * FROM summary_report
  UNION ALL
  SELECT * FROM function_report
  UNION ALL
  SELECT * FROM schema_report
  UNION ALL
  SELECT * FROM caller_report
) report
ORDER BY section;

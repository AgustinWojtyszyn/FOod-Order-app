-- ============================================
-- VISTA LEGIBLE DE PEDIDOS CON RESPUESTAS PERSONALIZADAS
-- ============================================
-- Este script crea una vista que muestra los pedidos con sus respuestas personalizadas en formato legible

-- Eliminar vistas existentes si existen
DROP VIEW IF EXISTS orders_today CASCADE;
DROP VIEW IF EXISTS responses_by_question CASCADE;
DROP VIEW IF EXISTS custom_responses_detail CASCADE;
DROP VIEW IF EXISTS orders_summary CASCADE;
DROP VIEW IF EXISTS orders_with_responses CASCADE;

-- Vista principal de pedidos con respuestas
CREATE OR REPLACE VIEW orders_with_responses AS
SELECT 
    o.id as pedido_id,
    o.created_at as fecha_pedido,
    u.full_name as nombre_usuario,
    u.email as email_usuario,
    o.location as ubicacion,
    o.customer_name as nombre_cliente,
    o.customer_email as email_cliente,
    o.customer_phone as telefono_cliente,
    o.status as estado,
    o.delivery_date as fecha_entrega,
    o.items as platillos,
    o.comments as comentarios,
    o.total_items as total_items,
    o.custom_responses as respuestas_json,
    -- Extraer respuestas personalizadas en formato legible
    (
        SELECT string_agg(
            response->>'title' || ': ' || 
            CASE 
                WHEN jsonb_typeof(response->'response') = 'array' 
                THEN (SELECT string_agg(elem::text, ', ') FROM jsonb_array_elements_text(response->'response') elem)
                ELSE COALESCE(response->>'response', 'Sin respuesta')
            END,
            ' | '
        )
        FROM jsonb_array_elements(o.custom_responses) response
        WHERE response->>'response' IS NOT NULL
    ) as respuestas_personalizadas_texto
FROM public.orders o
LEFT JOIN public.users u ON o.user_id = u.id
ORDER BY o.created_at DESC;

-- Vista detallada de respuestas por pedido
CREATE OR REPLACE VIEW custom_responses_detail AS
SELECT 
    o.id as pedido_id,
    o.created_at as fecha_pedido,
    u.full_name as nombre_usuario,
    u.email as email_usuario,
    o.location as ubicacion,
    response->>'option_id' as opcion_id,
    response->>'title' as pregunta,
    CASE 
        WHEN jsonb_typeof(response->'response') = 'array' THEN
            (SELECT string_agg(elem::text, ', ') FROM jsonb_array_elements_text(response->'response') elem)
        ELSE 
            response->>'response'
    END as respuesta,
    jsonb_typeof(response->'response') as tipo_respuesta
FROM public.orders o
LEFT JOIN public.users u ON o.user_id = u.id,
jsonb_array_elements(o.custom_responses) response
WHERE response->>'response' IS NOT NULL
ORDER BY o.created_at DESC, response->>'title';

-- Vista resumen de pedidos con platillos
CREATE OR REPLACE VIEW orders_summary AS
SELECT 
    o.id as pedido_id,
    TO_CHAR(o.created_at, 'DD/MM/YYYY HH24:MI') as fecha_hora,
    u.full_name as usuario,
    u.email,
    o.location as ubicacion,
    o.status as estado,
    o.total_items as cantidad_items,
    -- Extraer platillos en formato legible
    (
        SELECT string_agg(
            item->>'name' || ' (x' || (item->>'quantity')::text || ')',
            ', '
        )
        FROM jsonb_array_elements(o.items) item
    ) as platillos,
    o.comments as comentarios,
    -- Respuestas personalizadas
    (
        SELECT string_agg(
            response->>'title' || ': ' || 
            CASE 
                WHEN jsonb_typeof(response->'response') = 'array' 
                THEN (SELECT string_agg(elem::text, ', ') FROM jsonb_array_elements_text(response->'response') elem)
                ELSE COALESCE(response->>'response', 'N/A')
            END,
            ' | '
        )
        FROM jsonb_array_elements(o.custom_responses) response
        WHERE response->>'response' IS NOT NULL
    ) as opciones_adicionales
FROM public.orders o
LEFT JOIN public.users u ON o.user_id = u.id
ORDER BY o.created_at DESC;

-- Vista solo de pedidos de hoy
CREATE OR REPLACE VIEW orders_today AS
SELECT * FROM orders_summary
WHERE DATE(SUBSTRING(fecha_hora, 7, 4) || '-' || 
           SUBSTRING(fecha_hora, 4, 2) || '-' || 
           SUBSTRING(fecha_hora, 1, 2)) = CURRENT_DATE;

-- Vista de respuestas agrupadas por pregunta
CREATE OR REPLACE VIEW responses_by_question AS
SELECT 
    response->>'title' as pregunta,
    COUNT(*) as total_respuestas,
    CASE 
        WHEN jsonb_typeof(response->'response') = 'array' THEN
            string_agg(DISTINCT (SELECT string_agg(elem::text, ', ') FROM jsonb_array_elements_text(response->'response') elem), ' | ')
        ELSE 
            string_agg(DISTINCT response->>'response', ', ')
    END as respuestas_unicas,
    COUNT(DISTINCT o.id) as pedidos_con_respuesta
FROM public.orders o,
jsonb_array_elements(o.custom_responses) response
WHERE response->>'response' IS NOT NULL
GROUP BY response->>'title'
ORDER BY total_respuestas DESC;

-- Verificar que las vistas se crearon correctamente
SELECT 
    'orders_with_responses' as vista,
    COUNT(*) as registros
FROM orders_with_responses
UNION ALL
SELECT 
    'custom_responses_detail' as vista,
    COUNT(*) as registros
FROM custom_responses_detail
UNION ALL
SELECT 
    'orders_summary' as vista,
    COUNT(*) as registros
FROM orders_summary
UNION ALL
SELECT 
    'orders_today' as vista,
    COUNT(*) as registros
FROM orders_today
UNION ALL
SELECT 
    'responses_by_question' as vista,
    COUNT(*) as registros
FROM responses_by_question;

-- Ejemplo de consulta: Ver todos los pedidos con respuestas
-- SELECT * FROM orders_with_responses LIMIT 10;

-- Ejemplo de consulta: Ver respuestas detalladas
-- SELECT * FROM custom_responses_detail LIMIT 20;

-- Ejemplo de consulta: Ver resumen de pedidos de hoy
-- SELECT * FROM orders_today;

-- Ejemplo de consulta: Ver estadísticas de respuestas
-- SELECT * FROM responses_by_question;

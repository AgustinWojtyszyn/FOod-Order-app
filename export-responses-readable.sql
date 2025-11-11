-- ============================================
-- EXPORTAR PEDIDOS CON RESPUESTAS A CSV
-- ============================================
-- Este script genera una consulta lista para exportar a CSV

-- Consulta completa para exportar todos los pedidos con respuestas legibles
SELECT 
    -- Información del pedido
    o.id as "ID Pedido",
    TO_CHAR(o.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI') as "Fecha y Hora",
    o.status as "Estado",
    
    -- Información del usuario
    COALESCE(u.full_name, u.email) as "Usuario",
    u.email as "Email Usuario",
    o.location as "Ubicación",
    
    -- Información del cliente (del formulario)
    o.customer_name as "Nombre Cliente",
    o.customer_email as "Email Cliente",
    o.customer_phone as "Teléfono",
    
    -- Platillos pedidos
    (
        SELECT string_agg(
            item->>'name' || ' (Cantidad: ' || (item->>'quantity')::text || ')',
            ', '
        )
        FROM jsonb_array_elements(o.items) item
    ) as "Platillos",
    
    o.total_items as "Total Items",
    
    -- Respuestas a opciones personalizadas
    (
        SELECT string_agg(
            '【' || response->>'title' || '】 ' || 
            CASE 
                WHEN jsonb_typeof(response->'response') = 'array' THEN
                    (SELECT string_agg(elem::text, ', ') FROM jsonb_array_elements_text(response->'response') elem)
                ELSE 
                    COALESCE(response->>'response', 'Sin respuesta')
            END,
            ' ║ '
        )
        FROM jsonb_array_elements(o.custom_responses) response
        WHERE response->>'response' IS NOT NULL
    ) as "Opciones Personalizadas",
    
    -- Comentarios adicionales
    COALESCE(o.comments, 'Sin comentarios') as "Comentarios",
    
    -- Fecha de entrega
    TO_CHAR(o.delivery_date, 'DD/MM/YYYY') as "Fecha Entrega Programada"
    
FROM public.orders o
LEFT JOIN public.users u ON o.user_id = u.id
ORDER BY o.created_at DESC;

-- ============================================
-- CONSULTA SIMPLIFICADA PARA VISUALIZACIÓN RÁPIDA
-- ============================================

SELECT 
    SUBSTRING(o.id::text, 1, 8) as "ID",
    TO_CHAR(o.created_at, 'DD/MM HH24:MI') as "Fecha",
    COALESCE(u.full_name, SPLIT_PART(u.email, '@', 1)) as "Usuario",
    o.location as "Ubicación",
    o.status as "Estado",
    
    -- Platillos resumidos
    (
        SELECT string_agg(item->>'name', ', ')
        FROM jsonb_array_elements(o.items) item
    ) as "Menú",
    
    -- Respuestas personalizadas resumidas
    (
        SELECT string_agg(
            response->>'title' || ': ' || 
            CASE 
                WHEN jsonb_typeof(response->'response') = 'array' THEN
                    (SELECT string_agg(elem::text, ', ') FROM jsonb_array_elements_text(response->'response') elem)
                ELSE 
                    response->>'response'
            END,
            ' | '
        )
        FROM jsonb_array_elements(o.custom_responses) response
        WHERE response->>'response' IS NOT NULL
    ) as "Preferencias"
    
FROM public.orders o
LEFT JOIN public.users u ON o.user_id = u.id
WHERE DATE(o.created_at) = CURRENT_DATE
ORDER BY o.created_at DESC;

-- ============================================
-- REPORTE DETALLADO POR RESPUESTA
-- ============================================

SELECT 
    response->>'title' as "Pregunta",
    CASE 
        WHEN jsonb_typeof(response->'response') = 'array' THEN
            (SELECT string_agg(elem::text, ', ') FROM jsonb_array_elements_text(response->'response') elem)
        ELSE 
            response->>'response'
    END as "Respuesta",
    COALESCE(u.full_name, u.email) as "Usuario",
    o.location as "Ubicación",
    TO_CHAR(o.created_at, 'DD/MM/YYYY HH24:MI') as "Fecha Pedido",
    SUBSTRING(o.id::text, 1, 8) as "ID Pedido"
FROM public.orders o
LEFT JOIN public.users u ON o.user_id = u.id,
jsonb_array_elements(o.custom_responses) response
WHERE response->>'response' IS NOT NULL
ORDER BY response->>'title', o.created_at DESC;

-- ============================================
-- ESTADÍSTICAS DE RESPUESTAS
-- ============================================

SELECT 
    response->>'title' as "Pregunta",
    CASE 
        WHEN jsonb_typeof(response->'response') = 'array' THEN
            elem.value::text
        ELSE 
            response->>'response'
    END as "Opción Elegida",
    COUNT(*) as "Veces Seleccionada",
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (PARTITION BY response->>'title'), 2) as "Porcentaje"
FROM public.orders o,
jsonb_array_elements(o.custom_responses) response
LEFT JOIN LATERAL jsonb_array_elements_text(response->'response') elem ON jsonb_typeof(response->'response') = 'array'
WHERE response->>'response' IS NOT NULL
GROUP BY response->>'title', 
    CASE 
        WHEN jsonb_typeof(response->'response') = 'array' THEN elem.value::text
        ELSE response->>'response'
    END
ORDER BY response->>'title', "Veces Seleccionada" DESC;

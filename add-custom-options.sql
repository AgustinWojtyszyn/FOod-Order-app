-- ============================================
-- AGREGAR TABLA DE OPCIONES PERSONALIZABLES
-- ============================================
-- Ejecuta este script en Supabase SQL Editor

-- Tabla para opciones personalizables (preguntas de opción múltiple, encuestas, etc.)
CREATE TABLE IF NOT EXISTS public.custom_options (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('multiple_choice', 'text', 'checkbox')),
  options JSONB, -- Para multiple_choice y checkbox: array de opciones
  required BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  order_position INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.custom_options ENABLE ROW LEVEL SECURITY;

-- Políticas: todos pueden ver, solo admins pueden modificar
CREATE POLICY "Everyone can view custom options"
  ON public.custom_options FOR SELECT
  USING (true);

CREATE POLICY "Only admins can modify custom options"
  ON public.custom_options FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Agregar columna para respuestas personalizadas en orders
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS custom_responses JSONB DEFAULT '[]'::jsonb;

-- Crear índices para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_custom_options_active ON public.custom_options(active);
CREATE INDEX IF NOT EXISTS idx_custom_options_order ON public.custom_options(order_position);

-- Insertar opciones de ejemplo
INSERT INTO public.custom_options (title, type, options, required, active, order_position) VALUES
('¿Prefieres alguna bebida?', 'multiple_choice', '["Agua", "Jugo de Naranja", "Coca Cola", "Ninguna"]'::jsonb, false, true, 1),
('¿Tienes alguna alergia alimentaria?', 'text', null, false, true, 2),
('Preferencias adicionales', 'checkbox', '["Sin cebolla", "Sin ajo", "Extra picante", "Vegetariano"]'::jsonb, false, true, 3);

-- Verificar
SELECT * FROM public.custom_options ORDER BY order_position;

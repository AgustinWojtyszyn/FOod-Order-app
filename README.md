# ServiFood - Sistema de Pedidos de Comida

Una aplicación web moderna para gestionar pedidos de comida con autenticación de usuarios, panel de administración y sistema de menús dinámicos.

## 🚀 Características

- **Autenticación completa** con Supabase (registro, login, confirmación de email)
- **Sistema de roles** (usuarios normales y administradores)
- **Panel de administración** para gestionar usuarios y menú
- **Formulario de pedidos** con selección múltiple de platos
- **Interfaz responsive** y diseño profesional
- **Base de datos** en Supabase para almacenar pedidos y usuarios
- **Despliegue fácil** en Render

## 🛠️ Tecnologías Utilizadas

- **Frontend:** React 18 + Vite
- **Estilos:** Tailwind CSS
- **Backend:** Supabase
- **Íconos:** Lucide React
- **Enrutamiento:** React Router DOM

## 📋 Prerrequisitos

- Node.js 16+
- Cuenta en Supabase
- Cuenta en Render (para despliegue)

## 🚀 Instalación y Configuración

### 1. Clonar el repositorio
```bash
git clone <url-del-repositorio>
cd food-order-app
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar Supabase

1. Crear un nuevo proyecto en [Supabase](https://supabase.com)
2. Ir a Settings > API y copiar la URL del proyecto y la anon key
3. Crear las tablas necesarias ejecutando los siguientes SQL en el SQL Editor de Supabase:

```sql
-- Tabla de usuarios (extiende auth.users)
CREATE TABLE public.users (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  full_name TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Tabla de pedidos
CREATE TABLE public.orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  location TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  items JSONB NOT NULL,
  comments TEXT,
  delivery_date DATE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
  total_items INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Tabla de items del menú
CREATE TABLE public.menu_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Políticas de seguridad (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

-- Políticas para users
CREATE POLICY "Users can view their own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can view all users" ON public.users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update user roles" ON public.users
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Políticas para orders
CREATE POLICY "Users can view their own orders" ON public.orders
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own orders" ON public.orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all orders" ON public.orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Políticas para menu_items
CREATE POLICY "Everyone can view menu items" ON public.menu_items
  FOR SELECT USING (true);

CREATE POLICY "Only admins can modify menu items" ON public.menu_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Insertar items de menú por defecto
INSERT INTO public.menu_items (name, description) VALUES
  ('Plato Principal 1', 'Delicioso plato principal'),
  ('Plato Principal 2', 'Otro plato delicioso'),
  ('Plato Principal 3', 'Plato especial del día'),
  ('Plato Principal 4', 'Plato vegetariano'),
  ('Plato Principal 5', 'Plato de la casa'),
  ('Plato Principal 6', 'Plato recomendado');
```

### 4. Configurar variables de entorno

Copiar `.env.example` a `.env` y completar con tus credenciales de Supabase:

```bash
cp .env.example .env
```

Editar `.env`:
```
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

### 5. Configurar autenticación en Supabase

1. Ir a Authentication > Settings
2. En "Site URL" poner la URL de tu aplicación (para desarrollo: `http://localhost:5173`)
3. En "Redirect URLs" agregar:
   - `http://localhost:5173/auth/callback` (desarrollo)
   - `https://tu-app-en-render.com/auth/callback` (producción)

## 🏃‍♂️ Ejecutar en Desarrollo

```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:5173`

## 🚀 Despliegue en Render

### 1. Preparar la aplicación

1. Asegurarse de que todas las dependencias estén en `package.json`
2. Configurar las variables de entorno en Render
3. Actualizar la URL de Supabase en las configuraciones de autenticación

### 2. Desplegar

1. Crear una cuenta en [Render](https://render.com)
2. Conectar tu repositorio de GitHub
3. Crear un nuevo "Static Site"
4. Configurar:
   - **Build Command:** `npm run build`
   - **Publish Directory:** `dist`
   - **Environment Variables:**
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_ANON_KEY`

### 3. Configurar dominio personalizado (opcional)

En Render, ir a Settings > Custom Domain y configurar tu dominio.

## 📱 Uso de la Aplicación

### Para Usuarios Normales:
1. **Registro:** Crear cuenta con email y contraseña
2. **Verificación:** Confirmar email mediante el enlace enviado
3. **Login:** Iniciar sesión con credenciales
4. **Dashboard:** Ver pedidos anteriores y estadísticas
5. **Nuevo Pedido:** Seleccionar lugar de trabajo, platos y crear pedido

### Para Administradores:
1. **Panel Admin:** Acceder al panel de administración
2. **Gestionar Usuarios:** Cambiar roles de usuarios
3. **Editar Menú:** Modificar los platos disponibles diariamente

## 🗂️ Estructura del Proyecto

```
food-order-app/
├── public/
│   └── assets/          # Logo de la empresa
├── src/
│   ├── components/
│   │   ├── Layout.jsx       # Layout principal con navegación
│   │   ├── Login.jsx        # Página de inicio de sesión
│   │   ├── Register.jsx     # Página de registro
│   │   ├── Dashboard.jsx    # Dashboard de usuario
│   │   ├── AdminPanel.jsx   # Panel de administración
│   │   └── OrderForm.jsx    # Formulario de pedidos
│   ├── supabaseClient.js    # Configuración de Supabase
│   ├── App.jsx             # Componente principal
│   ├── main.jsx            # Punto de entrada
│   └── index.css           # Estilos globales
├── .env.example            # Variables de entorno de ejemplo
├── tailwind.config.js      # Configuración de Tailwind
├── postcss.config.js       # Configuración de PostCSS
└── README.md              # Este archivo
```

## 🤝 Contribuir

1. Fork el proyecto
2. Crear una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abrir un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para más detalles.

## 📞 Soporte

Para soporte, enviar email a support@servifood.com o crear un issue en el repositorio.

---

¡Gracias por usar ServiFood! 🍽️

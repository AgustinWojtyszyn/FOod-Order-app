#!/bin/bash

# Script para configurar el archivo .env para pruebas de carga
# Uso: ./setup-env.sh

echo "🔧 Configuración de Variables de Entorno para Pruebas de Carga"
echo "========================================================="
echo ""

# Verificar si ya existe .env
if [ -f ".env" ]; then
    echo "⚠️  Ya existe un archivo .env"
    read -p "¿Deseas sobrescribirlo? (s/N): " overwrite
    if [[ ! $overwrite =~ ^[Ss]$ ]]; then
        echo "❌ Cancelado. No se modificó el archivo .env"
        exit 0
    fi
    echo ""
fi

# Solicitar credenciales
echo "📝 Ingresa tus credenciales de Supabase:"
echo ""
echo "Las puedes encontrar en:"
echo "  Supabase Dashboard > Settings > API"
echo ""

read -p "VITE_SUPABASE_URL (Project URL): " supabase_url
read -p "VITE_SUPABASE_ANON_KEY (anon public key): " supabase_key

# Validar que no estén vacías
if [ -z "$supabase_url" ] || [ -z "$supabase_key" ]; then
    echo ""
    echo "❌ Error: Las credenciales no pueden estar vacías"
    exit 1
fi

# Crear archivo .env
cat > .env << EOF
# Variables de Supabase (REQUERIDAS)
VITE_SUPABASE_URL=$supabase_url
VITE_SUPABASE_ANON_KEY=$supabase_key

# Configuración de pruebas de carga (OPCIONAL)
TEST_USERS_COUNT=100
CONCURRENT_USERS=50
ORDERS_PER_USER=3
DELAY_MS=500
USER_DELAY_MS=100
EOF

echo ""
echo "✅ Archivo .env creado exitosamente!"
echo ""
echo "📋 Contenido:"
echo "----------------------------------------"
cat .env
echo "----------------------------------------"
echo ""
echo "🚀 Ahora puedes ejecutar las pruebas:"
echo "  npm run test:light"
echo "  npm run test:medium"
echo "  npm run test:heavy"
echo ""

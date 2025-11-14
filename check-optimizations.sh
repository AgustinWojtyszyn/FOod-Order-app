#!/bin/bash

# Script para verificar optimizaciones de ServiFood App
echo "🔍 Verificando optimizaciones de ServiFood App..."
echo ""

# Colores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. Verificar si existe el build
echo "📦 Verificando build..."
if [ -d "dist" ]; then
    echo -e "${GREEN}✓${NC} Carpeta dist existe"
    
    # Tamaño total del dist
    DIST_SIZE=$(du -sh dist | cut -f1)
    echo "  Tamaño total: $DIST_SIZE"
    
    # Contar archivos JS
    JS_COUNT=$(find dist -name "*.js" | wc -l)
    echo "  Archivos JS: $JS_COUNT"
    
    # Verificar code splitting (debe haber múltiples chunks)
    if [ $JS_COUNT -gt 5 ]; then
        echo -e "${GREEN}✓${NC} Code splitting activo ($JS_COUNT chunks)"
    else
        echo -e "${YELLOW}⚠${NC} Pocos chunks JS, code splitting podría mejorar"
    fi
else
    echo -e "${RED}✗${NC} Carpeta dist no existe. Ejecuta 'npm run build'"
    exit 1
fi

echo ""

# 2. Verificar configuración de Vite
echo "⚙️  Verificando vite.config.js..."
if grep -q "minify: 'terser'" vite.config.js; then
    echo -e "${GREEN}✓${NC} Minificación con terser configurada"
else
    echo -e "${YELLOW}⚠${NC} Minificación no optimizada"
fi

if grep -q "manualChunks" vite.config.js; then
    echo -e "${GREEN}✓${NC} Code splitting manual configurado"
else
    echo -e "${YELLOW}⚠${NC} Code splitting no configurado"
fi

echo ""

# 3. Verificar lazy loading en App.jsx
echo "🔄 Verificando lazy loading..."
if grep -q "lazy(" src/App.jsx; then
    LAZY_COUNT=$(grep -c "lazy(" src/App.jsx)
    echo -e "${GREEN}✓${NC} Lazy loading implementado ($LAZY_COUNT componentes)"
else
    echo -e "${YELLOW}⚠${NC} Lazy loading no implementado"
fi

if grep -q "Suspense" src/App.jsx; then
    echo -e "${GREEN}✓${NC} Suspense configurado"
else
    echo -e "${RED}✗${NC} Suspense no encontrado"
fi

echo ""

# 4. Verificar cache en supabaseClient
echo "💾 Verificando sistema de cache..."
if grep -q "cache" src/supabaseClient.js; then
    echo -e "${GREEN}✓${NC} Sistema de cache implementado"
    
    # Contar funciones con cache
    CACHE_COUNT=$(grep -c "cache.get" src/supabaseClient.js)
    echo "  Funciones con cache: $CACHE_COUNT"
else
    echo -e "${YELLOW}⚠${NC} Cache no implementado"
fi

echo ""

# 5. Verificar selects específicos
echo "📊 Verificando optimización de consultas..."
if grep -q "select('\*')" src/supabaseClient.js; then
    WILDCARD_COUNT=$(grep -c "select('\*')" src/supabaseClient.js)
    echo -e "${YELLOW}⚠${NC} Queries con select('*'): $WILDCARD_COUNT (deberían ser específicos)"
else
    echo -e "${GREEN}✓${NC} Queries optimizados (sin select('*'))"
fi

echo ""

# 6. Verificar dependencias de optimización
echo "📚 Verificando dependencias..."
if grep -q "terser" package.json; then
    echo -e "${GREEN}✓${NC} Terser instalado"
else
    echo -e "${YELLOW}⚠${NC} Terser no instalado (npm install -D terser)"
fi

echo ""

# 7. Analizar archivos más grandes
echo "📈 Archivos más grandes en dist:"
if [ -d "dist" ]; then
    find dist -type f -exec du -h {} + | sort -rh | head -5 | while read size file; do
        echo "  $size - $(basename $file)"
    done
fi

echo ""

# 8. Resumen final
echo "═══════════════════════════════════════"
echo "📋 RESUMEN DE OPTIMIZACIONES"
echo "═══════════════════════════════════════"

TOTAL_CHECKS=6
PASSED_CHECKS=0

[ -d "dist" ] && ((PASSED_CHECKS++))
grep -q "minify: 'terser'" vite.config.js && ((PASSED_CHECKS++))
grep -q "lazy(" src/App.jsx && ((PASSED_CHECKS++))
grep -q "cache" src/supabaseClient.js && ((PASSED_CHECKS++))
! grep -q "select('\*')" src/supabaseClient.js && ((PASSED_CHECKS++))
grep -q "terser" package.json && ((PASSED_CHECKS++))

PERCENTAGE=$((PASSED_CHECKS * 100 / TOTAL_CHECKS))

if [ $PERCENTAGE -ge 80 ]; then
    echo -e "${GREEN}✓ Estado: EXCELENTE${NC}"
elif [ $PERCENTAGE -ge 60 ]; then
    echo -e "${YELLOW}⚠ Estado: BUENO (puede mejorar)${NC}"
else
    echo -e "${RED}✗ Estado: NECESITA OPTIMIZACIÓN${NC}"
fi

echo "Optimizaciones implementadas: $PASSED_CHECKS/$TOTAL_CHECKS ($PERCENTAGE%)"
echo ""

# 9. Recomendaciones
if [ $PERCENTAGE -lt 100 ]; then
    echo "💡 Recomendaciones:"
    [ ! -d "dist" ] && echo "  • Ejecuta 'npm run build'"
    ! grep -q "minify: 'terser'" vite.config.js && echo "  • Configura minificación en vite.config.js"
    ! grep -q "lazy(" src/App.jsx && echo "  • Implementa lazy loading en App.jsx"
    ! grep -q "cache" src/supabaseClient.js && echo "  • Implementa cache en supabaseClient.js"
    grep -q "select('\*')" src/supabaseClient.js && echo "  • Optimiza queries con selects específicos"
    ! grep -q "terser" package.json && echo "  • Instala terser: npm install -D terser"
fi

echo ""
echo "✅ Verificación completada"

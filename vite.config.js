import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  
  // Optimizaciones de rendimiento
  build: {
    // Habilitar minificación avanzada
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Eliminar console.log en producción
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug']
      }
    },
    
    // Optimizar chunks
    rollupOptions: {
      output: {
        manualChunks: {
          // Separar vendor chunks para mejor caching
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'supabase-vendor': ['@supabase/supabase-js'],
          'ui-vendor': ['lucide-react']
        }
      }
    },
    
    // Optimizar tamaño de chunks
    chunkSizeWarningLimit: 1000,
    
    // Comprimir assets
    cssCodeSplit: true,
    sourcemap: false, // Desactivar sourcemaps en producción
    
    // Optimizar assets
    assetsInlineLimit: 4096, // Inline assets < 4kb
  },
  
  // Optimizaciones de desarrollo
  server: {
    // Mejorar HMR
    hmr: {
      overlay: true
    }
  },
  
  // Optimizaciones de dependencias
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', '@supabase/supabase-js'],
    exclude: []
  }
})

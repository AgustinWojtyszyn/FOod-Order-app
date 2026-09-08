# 🍽️ ServiFood Order System

<p align="center">
  <strong>Plataforma web full-stack para la gestión integral de pedidos corporativos de alimentación.</strong>
</p>

<p align="center">
  Pedidos · Multiempresa · Administración · Reportes · Auditoría · Automatizaciones
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/Supabase-PostgreSQL-3FCF8E?logo=supabase&logoColor=white" />
  <img src="https://img.shields.io/badge/Tailwind-CSS-06B6D4?logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/badge/Vitest-Testing-6E9F18?logo=vitest&logoColor=white" />
  <img src="https://img.shields.io/badge/Render-Deploy-46E3B7?logo=render&logoColor=white" />
</p>

---

## 🚀 Vista general

**ServiFood Order System** es una plataforma web desarrollada para centralizar y automatizar la operación diaria de pedidos corporativos de alimentación.

Permite administrar desde un único sistema:

- pedidos diarios;
- menús dinámicos;
- múltiples empresas y sedes;
- usuarios, roles y permisos;
- cafetería;
- etiquetas;
- reportes operativos;
- reportes de consumo;
- estadísticas y tendencias;
- totalización;
- auditoría;
- monitoreo de salud;
- exportaciones;
- automatizaciones server-side.

La aplicación está desarrollada con **React + Vite** y utiliza **Supabase** como plataforma backend para autenticación, PostgreSQL, políticas de seguridad, RPCs y Edge Functions.

El deploy productivo se realiza mediante **Render**.

---

# 🖥️ Interfaz

## Vista general del sistema

<p align="center">
  <img
    src="https://github.com/user-attachments/assets/ccd822b0-3311-498f-8109-abb1c3185352"
    alt="ServiFood Order System"
    width="100%"
  />
</p>

---

## 🏠 Panel principal

El dashboard concentra el estado del usuario y proporciona acceso directo a los principales módulos del sistema.

Desde esta vista es posible consultar:

- estado del pedido;
- horario operativo;
- pedidos del día;
- pedidos pendientes;
- pedidos archivados;
- empresa activa;
- accesos administrativos;
- reportes y análisis.

### 📸 Captura

<!--
ARRASTRÁ ACÁ LA CAPTURA DEL PANEL PRINCIPAL DESDE TU PC.

GitHub va a generar algo parecido a:

![Panel principal](https://github.com/user-attachments/assets/XXXXXXXX)

Borrá este comentario cuando esté subida.
-->

---

## 🩺 Salud del sistema

El sistema incorpora herramientas administrativas de monitoreo para comprobar el estado de la aplicación y de los servicios asociados.

Incluye controles sobre:

- disponibilidad de Supabase;
- conectividad;
- última ejecución;
- pedidos creados durante el día;
- eventos de health check;
- errores HTTP;
- latencia;
- request ID;
- historial de verificaciones.

### 📸 Captura

<!--
ARRASTRÁ ACÁ LA CAPTURA "SALUD DEL SISTEMA".

GitHub generará automáticamente la URL pública.
-->

---

## ⚙️ Panel de administración

El panel administrativo centraliza las herramientas necesarias para gestionar la operación de ServiFood.

Incluye módulos para:

- usuarios;
- menú;
- cena;
- opciones;
- empresas;
- cafetería;
- roles;
- permisos;
- configuración operativa.

### 📸 Captura

<!--
ARRASTRÁ ACÁ LA CAPTURA "PANEL DE ADMINISTRACIÓN".
-->

---

# ✨ Funcionalidades

## 🛒 Gestión de pedidos

- Creación de pedidos diarios.
- Selección dinámica de menú.
- Modificación controlada.
- Historial de pedidos.
- Estados operativos.
- Validación de horarios.
- Restricciones según empresa.
- Control de cantidades.
- Manejo de opciones especiales.
- Pedidos administrativos.
- Gestión de pedidos posteriores al reporte.

---

## 🏢 Arquitectura multiempresa

ServiFood permite operar múltiples organizaciones desde una única plataforma.

Cada empresa puede disponer de:

- menú propio;
- reglas operativas;
- horarios;
- sedes;
- configuración;
- permisos;
- reportes;
- lógica específica.

El sistema también permite combinar menús globales con configuraciones particulares por empresa.

---

## 👥 Usuarios, roles y permisos

La aplicación incorpora distintos niveles de acceso.

Entre ellos:

- usuarios estándar;
- administradores;
- administradores por empresa;
- acceso restringido a reportes;
- permisos específicos para acciones sensibles.

La autorización no depende únicamente del frontend.

Las operaciones críticas también son verificadas mediante:

- PostgreSQL;
- RPCs;
- Row Level Security;
- funciones server-side.

---

# 📊 Reportes y análisis

ServiFood incorpora distintas herramientas para analizar la operación.

## Pedidos diarios

Permite consultar y administrar los pedidos correspondientes a una jornada.

## Totalizadora

Agrupa cantidades de platos y opciones para facilitar la preparación.

## Panel mensual

Permite analizar actividad y consumo durante períodos mensuales.

## Reportes de consumo

Generación de información consolidada por:

- usuario;
- empresa;
- período;
- día;
- tipo de pedido.

## Tendencias

Visualización y análisis de la evolución de pedidos.

---

# 🏷️ Sistema de etiquetas

La aplicación dispone de un módulo específico para preparar e imprimir etiquetas operativas.

Permite:

- filtrar pedidos;
- seleccionar etiquetas;
- identificar empresa;
- identificar sede solicitante;
- controlar impresión;
- procesar pedidos individualmente.

---

# ☕ Cafetería

ServiFood incluye un módulo independiente para gestionar operaciones relacionadas con cafetería.

Esto permite mantener los flujos de cafetería integrados dentro de la misma plataforma operativa.

---

# 📄 Generación de documentos

El sistema puede generar distintos documentos operativos.

Entre ellos:

- archivos Excel;
- reportes;
- documentos PDF;
- etiquetas;
- remitos.

Tecnologías utilizadas:

- **ExcelJS**
- **jsPDF**

---

# 🤖 Automatizaciones

ServiFood incorpora procesos automáticos ejecutados fuera del frontend.

Entre ellos:

- generación de reportes;
- envío de emails;
- procesamiento diario;
- archivado automático;
- tareas programadas;
- verificaciones de ejecución.

Los procesos importantes utilizan mecanismos de **idempotencia** para evitar ejecuciones duplicadas.

---

# 🏗️ Arquitectura

```text
┌──────────────────────────────────────┐
│               Usuario                │
│        Desktop / Tablet / Mobile     │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│           React 19 + Vite 7          │
│                                      │
│ UI · Routing · State · Validation    │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│               Supabase               │
│                                      │
│ Auth · PostgreSQL · RLS · RPC        │
│ Edge Functions · Realtime            │
└──────────────┬─────────────┬─────────┘
               │             │
               ▼             ▼
      ┌────────────────┐  ┌───────────────┐
      │ Automatización │  │   Reportes    │
      │   Cron / Jobs  │  │  Excel / PDF  │
      └────────┬───────┘  └───────────────┘
               │
               ▼
      ┌────────────────┐
      │ Email / Operación │
      └────────────────┘

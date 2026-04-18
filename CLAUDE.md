# Macario Lite — CLAUDE.md

## Qué es este proyecto

**Macario Lite** es la nueva app de gestión interna de Justo Makario, construida desde cero como una base limpia que reemplazará progresivamente a Macario v2. No es un MVP descartable — es la **app madre del futuro**.

Ubicación: `SaaS de gestion Interna/Macario-Lite/`

---

## Filosofía

- Misma arquitectura y stack que app madre (Macario v2) — sin reinventar la rueda
- Módulos mínimos primero, fácil de extender después
- Cada decisión técnica debe poder escalar cuando lleguen los módulos futuros
- Comentarios `// FUTURO:` marcan puntos de integración planificados

---

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Frontend | HTML + CSS + Vanilla JS (sin frameworks, sin build step) |
| Backend/DB | Supabase (PostgreSQL 17, Auth, Realtime) |
| Auth | Supabase Auth (email + password) |
| Realtime | Supabase Realtime (canal único 'macario-lite') |
| Deploy | Docker (nginx:alpine) + nginx.conf para SPA routing |
| PWA | manifest.json + sw.js (cache-first para assets, siempre network para Supabase) |

---

## Módulos activos (v1)

### 1. Dashboard
- Métricas: pedidos por estado, unidades producidas hoy, alertas de stock
- Solo accesible para owner / admin / encargado
- Realtime: se actualiza automáticamente cuando cambian orders o prod_logs

### 2. Ventas
- Tabla de pedidos con filtros (canal, estado, búsqueda libre)
- Crear pedido manual con textarea de productos (formato: `Nombre x Cantidad`)
- Cambio de estado modal con flujo unidireccional
- Cancelación con motivo obligatorio
- Edición de pedido (owner/admin/encargado)

### 3. Stock — dos sub-tabs

**Sub-tab: Materias Primas** (`stock` table)
- Semáforo visual (verde/amarillo/rojo) según min_warn y min_crit
- Actualización de cantidad con historial de cambios
- Agregar / editar insumos

**Sub-tab: Productos Terminados** (`finished_products` table)
- Tabla de productos con stock actual vs. mínimo
- Indicador "Bajo stock" / "OK"
- Agregar / actualizar stock de productos terminados

### 4. Producción
- Registro de producción por sector y modelo
- Registro de fallas/desperdicio con descripción
- Vinculación opcional a un pedido existente
- Tabla de registros recientes con métricas del día

---

## Módulos futuros (no construir aún)

Ver comentarios `// FUTURO:` en app.js. Los siguientes módulos están mapeados para fases siguientes:

- **Panel de Control** — kanban de pedidos, asignación a sectores
- **Administración** — mayoristas, solicitudes de materiales, lista de compras
- **Historial de Actividad** — timeline completo (solo owner)
- **Tareas** — diarias por área, recurrentes, checklist
- **Reclamos** — gestión de devoluciones y reclamos post-venta
- **RR.HH.** — asistencia, disciplina, rendimiento por persona
- **Marketing** — dashboard de contenido, métricas
- **AI Agent** — cruce stock vs. pedidos, asistente conversacional
- **Rendimiento** — KPIs por sector y por persona
- **Mi Área** — panel personal del operario

---

## Estructura de archivos

```
Macario-Lite/
├── CLAUDE.md           ← este archivo
├── index.html          ← shell HTML: login + setup + 4 módulos + modals
├── style.css           ← design system completo (idéntico a app madre)
├── app.js              ← toda la lógica: helpers, auth, nav, módulos
├── manifest.json       ← PWA manifest
├── sw.js               ← service worker (cache-first para assets)
├── icon-192.svg        ← logo SVG (JUSTO MAKARIO Home)
├── Dockerfile          ← nginx:alpine, copia los 6 archivos estáticos
└── nginx.conf          ← SPA routing, security headers, gzip
```

---

## Base de datos (proyecto Supabase independiente)

### Tablas activas en v1

| Tabla | Propósito |
|-------|-----------|
| `profiles` | Usuarios (FK a auth.users, role, area, active) |
| `orders` | Pedidos (canal, subcanal, cliente, productos JSON, estado, prioridad, fuente) |
| `stock` | Materias primas con semáforo (cantidad, min_warn, min_crit) |
| `stock_history` | Historial de cambios de stock de materias primas |
| `finished_products` | Productos terminados (stock_actual, stock_minimo, sku, categoria) |
| `prod_logs` | Registros de producción (modelo, unidades, sector, fallas, orden_id) |
| `activity_log` | Log inmutable de todas las acciones por usuario |
| `notifications` | Notificaciones persistentes filtradas por para_roles (array) |

### Funciones RPC requeridas

- `is_setup_needed()` — devuelve true si no hay perfiles (accesible por anon)
- `confirm_user_email(user_id uuid)` — confirma email automáticamente al crear usuarios desde config
- `mark_notification_read(notif_id uuid, user_id uuid)` — agrega user_id a leida_por array
- `mark_all_notifications_read(user_id uuid, user_role text)` — marca todas como leídas para el rol

### RLS

- RLS habilitado en TODAS las tablas
- `profiles`: SELECT propio + owner ve todos + admin ve todos activos
- `orders`: owner/admin/encargado/ventas/logistica según rol
- `stock`: todos los autenticados leen, solo owner/admin/encargado modifican
- `finished_products`: todos los autenticados leen, solo owner/admin/encargado modifican
- `prod_logs`: todos los autenticados insertan, owner/admin ven todos, otros ven los suyos
- `activity_log`: INSERT para todos, SELECT solo owner, DELETE solo owner
- `notifications`: SELECT filtrado por para_roles, INSERT para autenticados

### Triggers / funciones DB

- `handle_new_user()` — trigger on auth.users INSERT → crea profile automáticamente con data del user_metadata

---

## Roles y acceso por módulo

| Rol | Dashboard | Ventas | Stock | Producción |
|-----|-----------|--------|-------|------------|
| owner | ✓ full | ✓ full | ✓ full | ✓ full |
| admin | ✓ full | ✓ full | ✓ full | ✓ full |
| encargado | ✓ full | — | ✓ full | ✓ full |
| ventas | — | ✓ ver+crear | — | — |
| cnc/melamina/pino/embalaje/carpinteria | — | — | — | ✓ solo registrar |
| logistica | — | ✓ ver | — | — |
| marketing / marketing_agencia | — | — | — | — |

---

## Convenciones de código

- Sin frameworks — HTML/CSS/JS vanilla puro
- Sin pasos de build — los 6 archivos se sirven directamente
- `esc()` en TODOS los valores interpolados en innerHTML (XSS prevention)
- `showToast()` para feedback al usuario (success / error / info)
- `sbQuery()` para Supabase calls con manejo de error centralizado
- `cached(key, fn)` para datos que no cambian seguido (TTL: 30 segundos)
- `invalidateCache()` después de cada mutación
- `logActivity()` después de toda acción de usuario relevante
- `lockBtn / unlockBtn` para prevenir doble-click en botones de acción
- `showUndoToast()` para acciones destructivas (5 segundos para cancelar)
- Constantes `SL`, `RL`, `AREA_MAP`, `NOTIF_ICONS`, `NOTIF_COLORS` centralizadas arriba del archivo
- Comentarios `// FUTURO:` para marcar integraciones planificadas

---

## Credenciales

Las credenciales del proyecto Supabase se cargan en el `SUPABASE_URL` y `SUPABASE_KEY` al inicio de app.js. Se reemplazan en Fase 2 cuando se crea el proyecto.

**NUNCA commitear el anon key hardcodeado a repositorios públicos.**

---

## Decisiones y asunciones

1. **Un solo archivo JS** — igual que app madre. Prioriza simplicidad sobre separación de módulos. Cuando supere ~5000 líneas evaluar split.
2. **`finished_products` tabla separada de `stock`** — permite semántica diferente (stock actual vs. semáforo de insumos), y es la base para cruzar producción vs. stock terminado en el Dashboard futuro.
3. **NAV con todos los roles predefinidos** — incluso roles sin módulos activos (marketing, marketing_agencia) tienen su entrada de nav para cuando lleguen sus módulos.
4. **`confirmed_user_email` RPC** — en Supabase los usuarios creados por otro usuario necesitan confirmación de email. La función RPC bypasea esto internamente usando service_role.
5. **Realtime en un solo canal** — más eficiente que múltiples canales por tabla. Si hay problemas de performance, separar por tabla.
6. **`show/hideApp` con `display` vs `.on` class** — mismo patrón que app madre para consistencia.

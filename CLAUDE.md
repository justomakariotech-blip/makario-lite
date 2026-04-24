# Macario Lite — CLAUDE.md

## Qué es este proyecto

**Macario Lite** es la app de gestión interna de Justo Makario, fábrica de muebles de melamina y pino ubicada en Libertad, Buenos Aires, Argentina. Reemplaza progresivamente a Macario v2 con una base más limpia y adaptada a la realidad operativa del negocio.

No es un MVP descartable — es la **app madre del futuro**.

Ubicación: `SaaS de gestion Interna/Macario-Lite/`

---

## El negocio real — Justo Makario

Fábrica de muebles que vende por MercadoLibre, Tienda Nube, WhatsApp/Instagram y mayoristas. Tiene dos tipos de productos con lógicas completamente distintas:

### Tipos de productos

| Tipo | Descripción | Flujo |
|------|-------------|-------|
| **FABRICADOS** | Mesas, escritorios, racks — los produce el taller propio | Excel → Reporte Diario → Producción → Stock Embalado |
| **REVENDIDOS** | Home decor, accesorios — los compran a terceros y revenden | Excel → Reporte Diario solamente, sin producción |

El campo `es_fabricado` en `product_catalog` determina a cuál tipo pertenece cada producto. **Solo los FABRICADOS aparecen en el módulo Producción y en las KPIs de fabricación.**

### Equipo real

| Persona | Rol empresa | Rol app |
|---------|-------------|---------|
| Sebastián | Co-dueño, estrategia/ventas | owner |
| Noe | Co-dueño, finanzas/admin | owner |
| Miqueas | Encargado de producción | encargado |
| Federico | Sector Embalaje | embalaje |
| Max | Sector CNC | cnc |
| Gabriel | Sector Melamina | melamina |
| Matías | Sector Pino/Armado | pino |
| Flor | Post-venta y logística | logistica |
| Romy | Facturación, atención cliente | admin |

### Flujo de producción real (FABRICADOS)

```
1. Excel de ventas sube al Reporte Diario (canal='reporte')
2. Miqueas (encargado) ve qué hay que producir hoy
3. CNC corta piezas
4. Melamina o Pino trabaja las piezas
5. Embalaje arma + registra en Producción
6. Stock Embalado sube
7. Flor (logística) coordina despacho
```

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
| Excel parsing | SheetJS (xlsx.js via CDN) — cliente-side, sin servidor |

Proyecto Supabase: `hqnibqvjwficlwxgtoki` — "macario-lite", us-east-2

---

## Módulos activos

### 1. Dashboard
- Métricas: pedidos por estado, unidades producidas hoy, alertas de stock
- Solo owner / admin / encargado
- Realtime: se actualiza cuando cambian orders o prod_logs
- KPIs de fabricación filtran solo `es_fabricado=true`

### 2. Ventas
- Tabla de pedidos con filtros (canal, estado, búsqueda libre)
- Excluye `canal='reporte'` — esos son del Reporte Diario
- Crear pedido manual con textarea de productos
- Cambio de estado modal con flujo unidireccional
- Cancelación con motivo obligatorio
- Edición de pedido (owner/admin/encargado)

### 3. Reporte Diario
- Módulo central para el día de trabajo
- El admin sube un Excel exportado de ML/TN/etc.
- SheetJS lo parsea en el cliente — auto-detecta columnas (modelo, color, cantidad)
- Preview de 5 filas antes de confirmar
- Los datos se guardan como `orders` con `canal='reporte'`, `fuente='excel'`
- Acumula desde todas las fuentes: `SUM(orders.cantidad) - SUM(prod_logs.cantidad)` = pendiente
- Miqueas (encargado) marca unidades producidas por fila (modelo+color)
- Solo muestra: SKU, modelo, variante, cantidad — NUNCA cliente, precio, DNI

### 4. Stock — dos sub-tabs

**Sub-tab: Stock Embalado** (`finished_products`)
- Productos terminados listos para despachar
- Campos: modelo, variante, stock_actual, stock_minimo, min_crit
- Indicador "Bajo stock" / "OK"
- Semáforo opcional si tiene min_crit
- Solo FABRICADOS relevantes (filtrar por es_fabricado via product_catalog)

**Sub-tab: Materias Primas** (`stock`)
- Insumos del taller (melamina, tornillos, bisagras, etc.)
- Semáforo visual (verde/amarillo/rojo) según min_warn y min_crit
- Actualización de cantidad con historial de cambios

### 5. Producción
- Solo muestra productos con `es_fabricado=true`
- Pendiente acumulado = `SUM(orders.cantidad) - SUM(prod_logs.cantidad)` — nunca se resetea por día
- Selector dropdown de modelo/SKU (no texto libre)
- Registro por sector y etapa ('cnc', 'melamina', 'pino', 'embalaje', 'general')
- Encargado NO ve datos del cliente: sin nombre, DNI, precio, canal
- Registros recientes del día con métricas

---

## Base de datos — tablas

| Tabla | Propósito |
|-------|-----------|
| `profiles` | Usuarios (FK a auth.users, role, area, active) |
| `orders` | Pedidos de todos los canales + reportes diarios |
| `product_catalog` | Catálogo de SKUs: modelo, variante, es_fabricado, activo |
| `stock` | Materias primas con semáforo (cantidad, min_warn, min_crit) |
| `stock_history` | Historial de cambios de stock de materias primas |
| `finished_products` | Stock embalado (producto terminado listo para despachar) |
| `prod_logs` | Registros de producción (modelo, unidades, sector, etapa, fallas) |
| `activity_log` | Log inmutable de todas las acciones por usuario |
| `notifications` | Notificaciones persistentes filtradas por para_roles |

### Columnas de `orders` (v2 — post Checkpoint A)

| Columna | Tipo | Notas |
|---------|------|-------|
| id | uuid PK | gen_random_uuid() |
| numero | text | número visible |
| canal | text | 'mercadolibre', 'whatsapp', 'reporte', etc. |
| subcanal | text | 'flex', 'full', etc. |
| cliente | text | nombre del cliente |
| productos | jsonb | array de {nombre, color, cantidad, producido} |
| estado | text | 'pendiente', 'en_produccion', 'producido', 'entregado', 'cancelado' |
| prioridad | int | 1-3 |
| fuente | text | 'manual', 'excel', 'webhook' |
| notas | text | |
| cancelacion_motivo | text | obligatorio si cancelado |
| sector_asignado | text | |
| creado_por | uuid FK profiles | |
| fecha_pedido | date | **NEW** fecha del pedido en la fuente original |
| sku | text | **NEW** SKU del producto (de product_catalog) |
| cantidad | int | **NEW** unidades del pedido |
| ml_order_id | text | **NEW** ID externo (ML/TN), índice único parcial (WHERE NOT NULL) |
| dni_cuit | text | **NEW** DNI o CUIT del cliente (solo owner/admin ven esto) |
| created_at, updated_at | timestamptz | |

### Columnas de `prod_logs` (v2)

Agrega: `sku text`, `variante text`, `etapa text DEFAULT 'general'`

### Columnas de `finished_products` (v2)

Agrega: `modelo text`, `variante text`, `min_crit numeric`, `updated_at timestamptz`

### `product_catalog` (nueva en Checkpoint A)

| Columna | Tipo | Notas |
|---------|------|-------|
| id | uuid PK | |
| sku | text UNIQUE NOT NULL | fuente de verdad del producto |
| modelo | text NOT NULL | ej: "Mesa Ratona", "Escritorio" |
| variante | text | ej: "Blanco", "Negro 120cm" |
| categoria | text | ej: "Mesas", "Escritorios", "Home Decor" |
| nombre_display | text | nombre completo para mostrar en UI |
| es_fabricado | boolean | true = pasa por taller, false = revendido |
| activo | boolean DEFAULT true | |
| created_at, updated_at | timestamptz | |
| created_by | uuid FK profiles | |

RLS: todos los autenticados leen; solo owner/admin insertan y actualizan; solo owner elimina.

### Funciones RPC requeridas

- `is_setup_needed()` — devuelve true si no hay perfiles (accesible por anon)
- `confirm_user_email(user_id uuid)` — confirma email automáticamente al crear usuarios desde config
- `mark_notification_read(notif_id uuid, user_id uuid)` — agrega user_id a leida_por
- `mark_all_notifications_read(user_id uuid, user_role text)` — marca todas como leídas para el rol

---

## Reglas de negocio críticas

| Regla | Descripción |
|-------|-------------|
| R1 | `es_fabricado=true` es el único criterio para aparecer en Producción y KPIs de fabricación |
| R2 | Pendiente de producción = acumulado histórico `SUM(orders.cantidad) - SUM(prod_logs.cantidad)`, nunca por día |
| R3 | Encargado ve SOLO: sku, modelo, variante, cantidad — NUNCA cliente, precio, canal, DNI |
| R4 | `ml_order_id` previene duplicados en re-importación de Excel; los pedidos viejos NO se borran |
| R5 | `canal='reporte'` excluye esos orders de los módulos Ventas, Panel de Control y Dashboard de pedidos |
| R6 | Cancelación requiere motivo obligatorio + log en activity_log |
| R7 | Semáforo stock: verde ≥ min_warn, amarillo < min_warn, rojo < min_crit |
| R8 | SKU es la fuente de verdad del producto — nunca parsing heurístico de títulos |

---

## Roles y acceso por módulo

| Rol | Dashboard | Ventas | Reporte Diario | Stock | Producción |
|-----|-----------|--------|----------------|-------|------------|
| owner | ✓ full | ✓ full | ✓ full | ✓ full | ✓ full |
| admin | ✓ full | ✓ full | ✓ full | ✓ full | ✓ full |
| encargado | ✓ full | — | ✓ (solo marcar) | ✓ full | ✓ full |
| ventas | — | ✓ ver+crear | — | — | — |
| cnc/melamina/pino/embalaje | — | — | — | — | ✓ solo registrar |
| logistica | — | ✓ ver | — | — | — |
| marketing / marketing_agencia | — | — | — | — | — |

---

## Estructura de archivos

```
Macario-Lite/
├── CLAUDE.md           ← este archivo
├── index.html          ← shell HTML: login + setup + módulos + modals
├── style.css           ← design system completo (idéntico a app madre)
├── app.js              ← toda la lógica: helpers, auth, nav, módulos
├── manifest.json       ← PWA manifest
├── sw.js               ← service worker (cache-first para assets)
├── icon-192.svg        ← logo SVG
├── Dockerfile          ← nginx:alpine
└── nginx.conf          ← SPA routing, security headers, gzip
```

---

## Convenciones de código

- Sin frameworks — HTML/CSS/JS vanilla puro
- Sin pasos de build — archivos servidos directamente
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

### Clases CSS del design system

| Clase | Uso |
|-------|-----|
| `.sg` | stats grid (contenedor de tarjetas métricas) |
| `.sc` | stat card (tarjeta individual) |
| `.sc-l` | label de stat card |
| `.sc-v` | valor de stat card |
| `.sc.g/.r/.b/.a` | modificador de color en la card (verde/rojo/azul/amarillo) |
| `.dt` | tabla de datos (data table) |
| `.stock-g` | grid de stock |
| `.stk-c` | stock card |
| `.stk-nm/.stk-q/.stk-u/.stk-th` | internos de stock card |
| `.notif-i/.notif-ico/.notif-tm` | internos de notificación |
| `.tab.on` | tab activo (NO `.tab.active`) |
| `.card` | contenedor sin padding (usar `.card-bd` o `style="padding:20px"`) |

---

## Decisiones y asunciones

1. **Un solo archivo JS** — igual que app madre. Cuando supere ~5000 líneas evaluar split.
2. **`canal='reporte'` como namespace** — los orders de Reporte Diario usan este canal para aislarse de Ventas y Producción sin crear tablas nuevas.
3. **Catálogo de productos separado** — `product_catalog` es la fuente de verdad de SKUs. Evita parsing heurístico de títulos que rompe cuando ML cambia el nombre.
4. **Pendiente acumulado, no diario** — la producción pendiente es histórica. Si ayer quedaron 3 mesas sin hacer, hoy aparecen sumadas a las de hoy. El encargado decide qué priorizar.
5. **Dedup por ml_order_id** — índice único parcial (WHERE NOT NULL) permite re-importar el mismo Excel sin duplicar pedidos.
6. **es_fabricado como switch** — la separación fabricados/revendidos vive en `product_catalog`, no en lógica de UI. Cuando se agrega un producto nuevo, solo hay que marcarlo correctamente.
7. **SheetJS client-side** — el parsing del Excel ocurre en el navegador. No hay upload al servidor. Más privacidad, menos infraestructura.
8. **Encargado ciego al cliente** — privacidad operativa. El encargado de producción no necesita saber quién compró, cuánto pagó ni por qué canal. Solo qué hacer.
9. **NAV con todos los roles predefinidos** — incluso roles sin módulos activos tienen su entrada para cuando lleguen sus módulos.
10. **Realtime en canal único** — más eficiente que múltiples canales. Si hay problemas de performance, separar por tabla.

---

## Roadmap

### Fase 2 — Próximos módulos (no construir aún)

- **Panel de Control** — kanban de pedidos, asignación a sectores
- **Administración** — mayoristas, solicitudes de materiales, lista de compras automática
- **Historial de Actividad** — timeline completo (solo owner)
- **Tareas** — diarias por área, recurrentes, checklist
- **Reclamos** — gestión de devoluciones y reclamos post-venta

### Fase 3 — Integraciones

- **Webhook ML/TN** — receive-order edge function (mismo patrón que Macario v2)
- **n8n** — automatización de reportes diarios, alertas de stock
- **AI Agent** — cruce stock vs. pedidos, asistente conversacional

### Fase 4 — Módulos avanzados

- **RR.HH.** — asistencia, disciplina, rendimiento por persona
- **Marketing** — dashboard de contenido, métricas
- **Rendimiento** — KPIs por sector y por persona
- **Mi Área** — panel personal del operario
- **Escáner de código de barras** — en Embalaje
- **PWA push notifications** nativas

---

## Módulos futuros (no construir aún)

Ver comentarios `// FUTURO:` en app.js. Los módulos listados en Fase 2/3/4 están mapeados pero no se deben construir hasta confirmar con el usuario.

---

## Credenciales

Las credenciales del proyecto Supabase se cargan en `SUPABASE_URL` y `SUPABASE_KEY` al inicio de app.js.

**NUNCA commitear el anon key hardcodeado a repositorios públicos.**

Proyecto Supabase: `hqnibqvjwficlwxgtoki` — "macario-lite", us-east-2

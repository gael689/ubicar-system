# Ubicar Rent — Estado Actual del Sistema (Post Fase 2)

> Resumen completo de todo lo implementado hasta el momento. Fase 1 (Flota) + Fase 2 (Clientes) cerradas.

---

## Resumen Ejecutivo

El sistema cuenta con dos módulos completamente operativos: **Flota** y **Clientes**. Ambos tienen backend y frontend funcionales, con CRUD completo, búsqueda optimizada, filtros, baja lógica y todas las sub-entidades asociadas. La base estructural está lista para la Fase 3 (Reservas y Alquileres), que cruzará vehículos con clientes.

---

## Fase 0 — Fundación ✅

- Migración inicial Alembic con 15 tablas del modelo completo.
- Bypass de auth en desarrollo (`DEV_BYPASS_AUTH=true`).
- Seed idempotente del usuario admin local.
- Endpoint `/health` con check de conexión a DB.
- Docker Compose: backend + Postgres levanta con un solo comando.
- CORS configurado para desarrollo local.

---

## Fase 1 — Módulo de Flota ✅

### Backend

| Funcionalidad | Detalle |
|---|---|
| Vehículos CRUD | Alta, edición, baja lógica, reactivar. Nunca borrado físico. |
| Foto de vehículo | Upload vía `LocalStorage` adapter, servido por `/static/`. |
| Tarifas | CRUD anidado. Regla "una activa por tipo" (diaria/semanal/mensual). La anterior queda como histórico. |
| Documentos | Upload PDF/imagen con vigencias (`vigencia_desde`, `vigencia_hasta`). |
| Gastos | CRUD completo. Si es tipo "service", recalcula `km_proximo_service` automáticamente. |
| Historial | Endpoint `/vehiculos/{id}/historial` unifica gastos + documentos + tarifas. |

### Frontend

| Vista | Funcionalidades |
|---|---|
| `/flota` (listado) | Tabla con búsqueda (debounce), filtros por estado y tipo, toggle inactivos, alta/edición/baja/reactivar. |
| `/flota/:id` (detalle) | Header con foto (hover para subir), métricas rápidas, 5 tabs completos. |
| Tab Datos | Info completa del vehículo. |
| Tab Tarifas | CRUD con historial, regla "una activa por tipo". |
| Tab Documentos | Upload con vigencias, badges vencido/por vencer, descarga directa. |
| Tab Gastos | Listado paginado, formulario inline completo. |
| Tab Historial | Timeline unificada de todos los eventos del vehículo. |

### Componentes y utilidades creados en Fase 1

- Design system aplicado: paleta Ubicar, logo en sidebar, tipografía Inter.
- shadcn/ui: input, label, select, dialog, alert-dialog, dropdown-menu, switch, table, tabs, textarea.
- Dashboard de bienvenida con hero + grilla de módulos.
- Layout con sidebar de navegación.

---

## Fase 2 — Módulo de Clientes ✅

### Backend

| Funcionalidad | Detalle |
|---|---|
| ClienteRepository | Filtros ILIKE, oculta inactivos por defecto salvo toggle explícito. |
| ClienteService | Validación de unicidad DNI/CUIT, manejo de cliente + conductores adicionales. |
| Router refactorizado | Depende de `ClienteService`, sin acceso directo a `db.query()`. |
| Conductores adicionales | `GET/POST/DELETE` anidados bajo `/clientes/{id}/conductores`. |
| Índice GIN pg_trgm | Búsquedas textuales optimizadas sobre nombre y DNI. |
| Baja lógica | `activo = False`. Sin borrado físico en ningún caso. |

### Frontend

| Vista | Funcionalidades |
|---|---|
| `/clientes` (listado) | Búsqueda en tiempo real (debounce 300ms), filtros por tipo y frecuente, toggle inactivos, paginación. |
| `/clientes/:id` (detalle) | Header con avatar, métricas, 3 tabs. |
| Tab Datos | Info completa del cliente y notas. |
| Tab Conductores | CRUD de conductores adicionales con validación de licencia individual. |
| Tab Historial | Placeholder — se activa en Fase 3 cuando existan alquileres. |

### Archivos nuevos/actualizados en Fase 2

| Archivo | Rol |
|---|---|
| `useClientes.ts` | Hook React Query con conductores adicionales, reactivar, tipos tipados. |
| `useDebounce.ts` | Hook reutilizable para búsqueda con delay. |
| `ClientesList.tsx` | Listado con búsqueda, filtros, paginación. |
| `ClienteDetail.tsx` | Detalle con tabs (Datos / Conductores / Historial). |
| `ClienteFormDialog.tsx` | Formulario de alta/edición con validación Zod. |
| `ConductoresTab.tsx` | CRUD de conductores adicionales. |
| `LicenciaBadge.tsx` | Badge con 4 estados de licencia. |
| `App.tsx` | Rutas `/clientes` y `/clientes/:id` conectadas. |
| `index.css` | Clase `.input-base` reutilizable para formularios. |

### Funcionalidades operativas en `/clientes`

1. **Crear clientes** con validación completa (DNI único, licencia, categoría).
2. **Buscar en tiempo real** por nombre/DNI/teléfono con debounce.
3. **Filtrar** por tipo (particular/empresa) y frecuentes.
4. **Toggle de inactivos** para ver/ocultar dados de baja.
5. **Badge de licencia** con 4 estados visuales (vigente verde, por vencer amarillo, vencida rojo, sin datos gris).
6. **Editar** datos del cliente.
7. **Dar de baja** lógica y **reactivar**.
8. **Conductores adicionales**: agregar/eliminar con sus propias licencias y validaciones.

---

## Arquitectura Actual

### Stack operativo

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind + shadcn/ui |
| Formularios | React Hook Form + Zod |
| Estado/fetching | TanStack Query (React Query) |
| Routing | React Router v6 |
| Backend | FastAPI + SQLAlchemy 2.0 + Alembic |
| Base de datos | PostgreSQL 15 con pg_trgm |
| Infraestructura | Docker Compose (backend + postgres) |
| Storage | Local adapter (bind mount `./storage_local/`) |

### Patrones establecidos

- **Repository pattern** en backend (queries encapsuladas).
- **Service layer** para lógica de negocio.
- **Baja lógica** en todas las entidades (nunca DELETE físico).
- **Hooks de React Query** por módulo con invalidación optimista.
- **Validación Zod** en todos los formularios.
- **Debounce** en todas las búsquedas (300ms).
- **Respuestas API** con estructura `{ data, message, success }`.

---

## Qué se puede hacer hoy (resumen completo)

### Desde el navegador (http://localhost:5173)

**Dashboard:**
- Ver pantalla de bienvenida con accesos rápidos a módulos.

**Flota (`/flota`):**
- Crear, editar, dar de baja y reactivar vehículos.
- Subir/cambiar foto.
- Buscar por patente/marca/modelo, filtrar por estado y tipo.
- Gestionar tarifas (una activa por tipo, historial).
- Subir documentos con vigencias y ver badges de vencimiento.
- Registrar gastos (recálculo automático de km próximo service).
- Ver timeline/historial unificado del vehículo.

**Clientes (`/clientes`):**
- Crear, editar, dar de baja y reactivar clientes.
- Buscar en tiempo real por nombre/DNI/teléfono.
- Filtrar por tipo y frecuentes, toggle inactivos.
- Ver estado de licencia con badge visual.
- Gestionar conductores adicionales con sus licencias.

### Desde la API (http://localhost:8000/docs)

Todos los endpoints de Flota y Clientes disponibles con documentación Swagger interactiva.

---

## Próximo: Fase 3 — Reservas y Alquileres

La Fase 3 cruza las dos entidades base (Vehículo + Cliente) mediante Reserva/Alquiler. Esto desbloquea:

- Calendario de ocupación visual.
- Flujo completo checkout → checkin con control de 24hs.
- Historial de alquileres en ficha de cliente y vehículo.
- Estados automáticos de vehículo (disponible → reservado → alquilado → en transición).
- Generación de contratos digitales.

Con Flota y Clientes cerrados, la base estructural está sólida para avanzar.

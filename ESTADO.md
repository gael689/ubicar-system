# Ubicar Rent — Estado al cierre de hoy

Última actualización: 2026-05-21.

## Lo construido hasta ahora

### Fase 0 — Fundación ✅

Setup base con migración inicial Alembic (15 tablas), bypass de auth en dev (`DEV_BYPASS_AUTH=true`), seed idempotente del admin local, `/health` con check de DB, todo dockerizado.

### Fase 1 — Flota: backend completo ✅

Los 6 slices del módulo cerrados:

- Vehículos CRUD con baja lógica + reactivar (nunca borrado físico).
- Storage local con `LocalStorage` adapter y subida de foto.
- Tarifas con regla "una activa por tipo" (la anterior queda como histórico).
- Documentos con upload, validación de vigencias y servido por `/static/`.
- Gastos con recálculo automático de `km_proximo_service` cuando es service.
- Endpoint `/historial` que devuelve gastos + documentos + tarifas (alquileres queda para F3).

### Fase 1 — Frontend: completo ✅

- Auth0 desactivado, acceso directo.
- Tipos TS alineados al backend, paleta Ubicar aplicada, logo en sidebar.
- shadcn components agregados (input, label, select, dialog, alert-dialog, dropdown-menu, switch, table, tabs, textarea).
- **Dashboard** de bienvenida (hero con saludo + grilla de módulos con "Próximamente").
- **`/flota`**: listado con tabla, filtros (búsqueda con debounce, estado, tipo, toggle inactivos), alta, edición, baja, reactivar.
- **`/flota/:id`**: header con foto grande (hover para subir), métricas, tabs:
  - **Datos** — info completa del vehículo
  - **Tarifas** — CRUD con historial, regla "una activa por tipo"
  - **Documentos** — upload con vigencias, badges vencido/por vencer, descarga
  - **Gastos** — listado paginado, form inline completo
  - **Historial** — timeline unificada de todos los eventos

### Fase 2 — Clientes: completo ✅

**Backend:**
- `ClienteRepository` con filtros ILIKE y reglas por defecto (oculta inactivos salvo toggle).
- `ClienteService` con validaciones de unicidad DNI/CUIT y manejo de conductores adicionales.
- Router refactorizado: depende de `ClienteService`, sin acceso directo a `db.query()`.
- Endpoints de conductores adicionales: GET, POST, DELETE anidados bajo `/clientes/{id}/conductores`.
- Índice GIN con `pg_trgm` para búsquedas textuales optimizadas.
- Baja estrictamente lógica (`activo = False`), sin borrado físico.

**Frontend:**
- **`/clientes`**: listado con búsqueda (debounce 300ms), filtros por tipo y frecuente, toggle inactivos, paginación.
- **`/clientes/:id`**: header con avatar, métricas, tabs:
  - **Datos** — info completa del cliente y notas
  - **Conductores adicionales** — CRUD completo con validación de licencia por conductor
  - **Historial** — placeholder (llega en F3)
- Alta y edición con formulario completo (react-hook-form + validación Zod).
- Baja lógica + reactivar.
- `LicenciaBadge` con 4 estados: vigente (verde), por vencer (amarillo), vencida (rojo), sin datos (gris).
- `useDebounce` hook reutilizable.
- `useClientes` hook con React Query (conductores adicionales, reactivar, tipos tipados).

---

## Qué se puede hacer hoy

| Módulo | Estado |
|---|---|
| Dashboard | Bienvenida con grilla de módulos (calendario real llega en F4) |
| **Flota** | **Completo — CRUD vehículos, foto, tarifas, documentos, gastos, historial** |
| **Clientes** | **Completo — CRUD clientes, conductores adicionales, búsqueda, filtros** |
| Reservas / Alquileres / Ocupación | Pendiente (F3) |
| Contratos, Caja, Cuentas ctes., Echeqs, Cotizador, Reportes | Pendientes |

**Flujos operables desde el navegador:**

**Flota (`/flota`):**
1. Crear vehículo (alta manual).
2. Subir / cambiar foto del vehículo.
3. Editar datos (no patente).
4. Dar de baja lógica → desaparece por default, sigue visible con toggle.
5. Reactivar vehículo dado de baja.
6. Buscar por patente / marca / modelo, filtrar por estado y tipo.
7. Gestionar tarifas (CRUD con historial, regla "una activa por tipo").
8. Subir documentos (PDF/imagen) con vigencias y badges de vencimiento.
9. Registrar gastos con recálculo automático de km próximo service.
10. Ver historial/timeline unificada del vehículo.

**Clientes (`/clientes`):**
1. Crear cliente con validación completa (DNI único, licencia, categoría).
2. Buscar en tiempo real por nombre/DNI/teléfono (debounce 300ms).
3. Filtrar por tipo (particular/empresa) y frecuentes.
4. Toggle de inactivos.
5. Ver badge de licencia (verde/amarillo/rojo/gris).
6. Editar datos del cliente.
7. Dar de baja lógica y reactivar.
8. Agregar/eliminar conductores adicionales con sus propias licencias.

**Vía API** (curl, Postman, Swagger en `http://localhost:8000/docs`):
- Todo lo anterior + endpoints completos de ambos módulos.

---

## Cómo ejecutar

### Requisitos

- Docker Desktop corriendo.
- Node.js 18+.

### Levantar todo

**Backend + Postgres** (desde `C:\Users\gaelr\Desktop\ubicar-system`):

```powershell
docker compose up -d
```

Esto levanta:
- Postgres en `localhost:5432`
- Backend FastAPI en `http://localhost:8000`

Verificar: `curl http://localhost:8000/health` debe responder OK.

**Frontend** (desde `C:\Users\gaelr\Desktop\ubicar-system\frontend`):

```powershell
npm run dev
```

Abre en `http://localhost:5173`.

### Tirar todo abajo

```powershell
# Backend + Postgres (preserva datos)
docker compose down

# Reset total (BORRA la DB y archivos subidos)
docker compose down -v
Remove-Item -Recurse -Force storage_local
```

### Si reseteás la DB

Las migraciones corren automáticamente al levantar el backend (`alembic upgrade head` está en el `command:` del compose). Después correr el seed:

```powershell
docker compose exec backend python -m scripts.seed
```

### Ver logs en vivo

```powershell
docker compose logs -f backend       # backend
docker logs -f ubicar_postgres       # postgres
```

### Comandos útiles

```powershell
# Generar una migración nueva
docker compose run --rm --no-deps backend alembic revision --autogenerate -m "descripcion"

# Aplicar migraciones manualmente
docker compose run --rm --no-deps backend alembic upgrade head

# Consultar la DB
docker exec -it ubicar_postgres psql -U ubicar -d ubicar_rent
```

### URLs clave

- App: http://localhost:5173
- API: http://localhost:8000/api/v1
- Swagger (docs interactivos): http://localhost:8000/docs
- Health: http://localhost:8000/health
- Archivos subidos (storage local): http://localhost:8000/static/...

### Persistencia

- **DB Postgres**: volumen `ubicar-system_postgres_data` (sobrevive a `docker compose down`).
- **Fotos y documentos**: carpeta `./storage_local/` en tu disco, bind-montada al container.

---

## Próximo paso natural

**Fase 3 — Reservas y Alquileres**: cruzar un Vehículo con un Cliente mediante Reserva/Alquiler. Esto desbloquea los historiales de cliente y vehículo, el calendario de ocupación, y el flujo checkout/checkin con control de 24hs.

# Módulo Flota — Fase 1

> CRUD completo de vehículos, tarifas, documentos y gastos. Storage local de archivos.

## Reglas duras del producto

- **Nunca se elimina un vehículo.** Solo baja lógica (`activo = false`). Idem para clientes, alquileres y resto de entidades de dominio en fases posteriores.
- **Un vehículo inactivo sigue siendo visible y consultable.** No desaparece del sistema — desaparece del listado por defecto, pero se puede mostrar con un toggle.
- **Reactivable.** Un vehículo dado de baja por error o reincorporado puede volver a `activo = true`.
- **Historial preservado.** La ficha de un vehículo inactivo muestra todos sus alquileres, gastos y documentos pasados (auditoría + revisión histórica).

## Objetivo

Que el operador pueda:

- Listar la flota con filtros (estado, tipo, búsqueda por patente). Por defecto solo activos; toggle "Mostrar inactivos".
- Dar de alta, editar y dar de **baja lógica** vehículos. Nunca borrado físico.
- **Reactivar** un vehículo dado de baja.
- Ver el **historial completo** de un vehículo (inclusive si está inactivo): alquileres, gastos, documentos.
- Subir foto del vehículo (Slice 2).
- Definir tarifas (diaria, semanal, mensual) por vehículo (Slice 3).
- Cargar documentos del vehículo (póliza, VTV, cláusulas) (Slice 4).
- Registrar gastos asociados al vehículo (servicios, combustible, etc.) (Slice 5).

Sin esta fase no hay "objeto a alquilar". Es prerequisito de Reservas, Cotizador, Reportes.

## Slicing

La fase se entrega en slices verticales (backend primero por slice, frontend después). Cada slice queda usable independiente.

1. **Slice 1 — Vehículos CRUD básico**: alta, edición, baja lógica, reactivar, listado con filtros + búsqueda, toggle inactivos. Sin foto, sin tarifas, sin documentos, sin gastos.
2. **Slice 2 — Storage local + foto del vehículo**: adapter `LocalStorage` (sin R2), migración `foto_key`, endpoint `POST /vehiculos/{id}/foto`.
3. **Slice 3 — Tarifas**: CRUD + regla "una activa por tipo".
4. **Slice 4 — Documentos**: CRUD + presigned URL.
5. **Slice 5 — Gastos**: CRUD + actualización automática de `km_proximo_service` cuando es service.
6. **Slice 6 — Historial de vehículo**: endpoint `GET /vehiculos/{id}/historial` (requiere F3 para alquileres; en F1 solo gastos/documentos disponibles).

## Alcance

### Backend

#### B1.1 — Storage adapter (Slice 2, solo local)

Crear:

```
app/adapters/storage/
├── __init__.py
├── interface.py     # IStorage Protocol
└── local.py         # LocalStorage (filesystem)
```

`core/deps.py::get_storage()` retorna `LocalStorage`. **R2 se difiere** hasta que sea necesario (sistema de pyme con 1 server: local en prod es válido). Cuando llegue R2, se agrega `r2.py` y se hace switch por `STORAGE_PROVIDER`.

Variables de entorno actuales (ya están en `.env`):

```
STORAGE_PROVIDER=local
STORAGE_PATH=./storage_local
```

En Docker el `STORAGE_PATH` se bind-montea al host para que los archivos persistan entre reinicios del container.

#### B1.2 — Repositorio + Service para Vehiculo

```
app/repositories/vehiculo_repo.py
app/services/vehiculo_service.py
```

`VehiculoService.create(data)`:

- Valida unicidad de patente.
- Calcula `km_proximo_service = km_actual + km_entre_services` si no se provee.
- Persiste.

`VehiculoService.update(id, data)`:

- 404 si no existe.
- Valida que la patente nueva no esté tomada por otro.
- Aplica cambios parciales.

`VehiculoService.deactivate(id)`:

- Marca `activo = false`. **Nunca borra fila.**
- Falla si tiene alquileres activos asociados (cuando exista F3; en Slice 1 sin alquileres, no aplica).

`VehiculoService.reactivate(id)`:

- Marca `activo = true`. Idempotente — si ya está activo, no falla.

`VehiculoService.upload_foto(id, file)` (Slice 2):

- Sube a storage con key `vehiculos/{id}/foto.{ext}`.
- Persiste solo la `key` en `Vehiculo.foto_key`. Migración necesaria.

#### B1.3 — Endpoints `/vehiculos`

Refactorear `routers/vehiculos.py` para delegar al service. Endpoints:

```
GET    /api/v1/vehiculos              ?estado=&tipo=&q=&incluir_inactivos=&page=&page_size=
GET    /api/v1/vehiculos/{id}
POST   /api/v1/vehiculos
PATCH  /api/v1/vehiculos/{id}
DELETE /api/v1/vehiculos/{id}        ← baja lógica (NUNCA borrado físico)
POST   /api/v1/vehiculos/{id}/reactivar
POST   /api/v1/vehiculos/{id}/foto    ← multipart/form-data (Slice 2)
GET    /api/v1/vehiculos/{id}/historial   ← Slice 6 (depende de F3 para alquileres)
```

Filtros del listado:

- `estado`: enum.
- `tipo`: enum.
- `q`: búsqueda en patente, marca, modelo (case-insensitive, simple `ILIKE`).
- `incluir_inactivos`: bool, default `false`. Si `true`, devuelve también vehículos con `activo=false`.

#### B1.4 — Tarifas

Modelo `Tarifa` ya existe. Endpoints:

```
GET   /api/v1/vehiculos/{id}/tarifas
POST  /api/v1/vehiculos/{id}/tarifas
PATCH /api/v1/tarifas/{id}
DELETE /api/v1/tarifas/{id}        ← desactivación lógica
```

Reglas:

- Solo una tarifa `activa` por (vehiculo, tipo) a la vez.
- Al crear una nueva con el mismo tipo, la anterior se marca `activa=false` automáticamente y queda como historial.

#### B1.5 — Documentos del vehículo

Modelo `Documento` ya existe. Endpoints:

```
GET    /api/v1/vehiculos/{id}/documentos
POST   /api/v1/vehiculos/{id}/documentos    ← multipart con metadata
DELETE /api/v1/documentos/{id}
GET    /api/v1/documentos/{id}/url           ← presigned URL temporal
```

Tipos: `poliza`, `vtv`, `clausulas`, `otro`.

Validar fechas de vigencia coherentes (`vigencia_desde <= vigencia_hasta`).

#### B1.6 — Gastos del vehículo

Modelo `Gasto` ya existe. Endpoints:

```
GET    /api/v1/vehiculos/{id}/gastos
POST   /api/v1/vehiculos/{id}/gastos
PATCH  /api/v1/gastos/{id}
DELETE /api/v1/gastos/{id}                  ← borrado físico (no es operación auditada en Fase 1)
```

Tipos: `service`, `combustible`, `cubiertas`, `reparacion`, `seguro`, `patente`, `vtv`, `lavado`, `otro`.

Cuando el tipo es `service`:

- Actualizar `Vehiculo.km_actual` con `gasto.km_al_momento` si es mayor.
- Actualizar `Vehiculo.km_proximo_service = gasto.km_al_momento + km_entre_services`.

#### B1.7 — Domain

`domain/enums.py` con:

```python
class TipoVehiculo(str, Enum):
    AUTO = "auto"
    CAMIONETA = "camioneta"

class EstadoVehiculo(str, Enum):
    DISPONIBLE = "disponible"
    ALQUILADO = "alquilado"
    RESERVADO = "reservado"
    EN_TRANSICION = "en_transicion"
    FUERA_DE_SERVICIO = "fuera_de_servicio"

class TipoTarifa(str, Enum):
    DIARIA = "diaria"
    SEMANAL = "semanal"
    MENSUAL = "mensual"

class TipoDocumento(str, Enum):
    POLIZA = "poliza"
    VTV = "vtv"
    CLAUSULAS = "clausulas"
    OTRO = "otro"

class TipoGasto(str, Enum):
    SERVICE = "service"
    COMBUSTIBLE = "combustible"
    CUBIERTAS = "cubiertas"
    REPARACION = "reparacion"
    SEGURO = "seguro"
    PATENTE = "patente"
    VTV = "vtv"
    LAVADO = "lavado"
    OTRO = "otro"
```

#### B1.8 — Migraciones

- `003_add_foto_key_to_vehiculo` — agrega columna `foto_key VARCHAR(512) NULL`.
- `004_indices_vehiculos` — índice parcial sobre `vehiculos(estado) WHERE activo = true`.

#### B1.9 — Tests

- Unitarios `domain/enums` (trivial).
- Integración `services/vehiculo_service.py`: crear, actualizar, deactivate con alquiler activo (debe fallar).
- Integración endpoints: 200/201/422/404.
- Adapter local storage: subir y leer un archivo dummy.

### Frontend

#### F1.1 — Hooks

`hooks/useVehiculos.ts`:

- `useVehiculos(filters)` → listado paginado.
- `useVehiculo(id)` → detalle.
- `useCreateVehiculo()`.
- `useUpdateVehiculo()`.
- `useDeactivateVehiculo()`.
- `useUploadFoto(vehiculoId)`.

`hooks/useTarifas.ts`, `hooks/useDocumentosVehiculo.ts`, `hooks/useGastosVehiculo.ts` siguiendo el mismo patrón.

#### F1.2 — Página `/flota`

`pages/flota/List.tsx`:

- Tabla con columnas: foto (thumbnail), patente, marca/modelo, año, estado, km, acciones.
- **Vehículos inactivos** se muestran con un badge gris "Inactivo" y la fila atenuada (opacity reducida). Las acciones quedan deshabilitadas excepto **"Ver historial"** y **"Reactivar"**.
- Filtros: estado (select), tipo (select), búsqueda (input con debounce), **toggle "Mostrar inactivos"** (off por default).
- Botón "Nuevo vehículo" que abre `<VehiculoFormDialog>`.
- Empty state cuando no hay vehículos.

#### F1.3 — Detalle `/flota/:id`

`pages/flota/Detail.tsx`:

- Header con datos principales (patente, marca, modelo, estado). Si está inactivo, badge "Inactivo" visible y botón "Reactivar" en lugar de "Dar de baja".
- Tabs:
  - **Datos** → form de edición.
  - **Tarifas** → tabla de tarifas activas + histórico, alta de tarifa nueva.
  - **Documentos** → grid de documentos con vista previa, alta vía dropzone.
  - **Gastos** → tabla de gastos con filtros por tipo y rango de fechas.
  - **Historial** → línea de tiempo con todos los alquileres pasados (cuando F3 esté implementada), gastos y documentos. Visible tanto en activos como en inactivos.
- Botón "Subir foto" arriba a la derecha (Slice 2).
- Botón "Dar de baja" abre `<ConfirmDialog>` con texto claro: "Esto marca el vehículo como inactivo. No se borra y podés reactivarlo después."

#### F1.4 — Componentes

```
components/flota/
├── VehiculoFormDialog.tsx
├── VehiculoTable.tsx
├── VehiculoFilters.tsx
├── VehiculoFotoUploader.tsx
├── TarifasTab.tsx
├── TarifaForm.tsx
├── DocumentosTab.tsx
├── DocumentoUploader.tsx
└── GastosTab.tsx
```

#### F1.5 — Schemas Zod

`pages/flota/schemas.ts` con `vehiculoSchema`, `tarifaSchema`, `documentoSchema`, `gastoSchema` espejando los Pydantic del backend.

#### F1.6 — Reemplazar PlaceholderPage

En `App.tsx`:

```tsx
<Route path="/flota" element={<AppLayout title="Flota"><FlotaList /></AppLayout>} />
<Route path="/flota/:id" element={<AppLayout title="Flota"><FlotaDetail /></AppLayout>} />
```

## Dependencias

- **Fase 0:** completa.
- **Storage adapter:** se implementa en esta fase porque es el primer consumidor.

## Criterio de salida

- [ ] CRUD de vehículos end-to-end (listar, crear, editar, dar de baja, **reactivar**).
- [ ] **Listado oculta inactivos por defecto**; toggle `incluir_inactivos` los muestra.
- [ ] **Ningún endpoint borra físicamente** un vehículo.
- [ ] Foto se sube y se ve en el listado y en el detalle.
- [ ] Filtros por estado y tipo funcionan.
- [ ] Búsqueda por patente/marca/modelo funciona.
- [ ] CRUD de tarifas con regla de "una activa por tipo".
- [ ] CRUD de documentos con presigned URL para descarga.
- [ ] CRUD de gastos con actualización automática de `km_proximo_service` cuando es service.
- [ ] Storage adapter funciona con `local` (R2 diferido hasta que sea necesario).
- [ ] Tests de service e integración de endpoints pasan.
- [ ] Frontend renderiza con datos reales (no mocks). Sin errores de TS ni de consola.
- [ ] No se pueden dar de baja vehículos con alquileres activos (cuando F3 exista).
- [ ] Vehículos inactivos muestran badge "Inactivo" y tab "Historial" sigue accesible.

## Smoke test

1. Crear un vehículo con todos los campos.
2. Subirle foto, verificar que se ve.
3. Crear una tarifa diaria.
4. Crear otra tarifa diaria → la primera queda inactiva.
5. Subir documento de póliza con vigencia.
6. Cargar gasto de service con km > km_actual → verificar km_proximo_service actualizado.
7. Buscar el vehículo por patente.
8. Filtrar por estado "disponible".
9. Editar el vehículo, cambiar el estado a "fuera_de_servicio".
10. Dar de baja el vehículo.

## Notas de despliegue

- Migraciones: `003_add_foto_key_to_vehiculo`, `004_indices_vehiculos`.
- Env vars nuevas: `STORAGE_PROVIDER`, `STORAGE_PATH` o `STORAGE_BUCKET` + credenciales.
- Si se usa storage local: crear carpeta `STORAGE_PATH` con permisos de escritura.
- Rollback: revertir migraciones; el storage no se borra (las fotos quedan, pero sin referencia desde DB).

## Tiempo estimado

4-5 días.

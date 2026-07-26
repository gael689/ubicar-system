# Planning Backend — Ubicar Rent

> Documento de diseño y arquitectura del backend. Leer antes de implementar cualquier módulo o tocar la estructura del proyecto.

## Índice

1. [Principios de diseño](#1-principios-de-diseño)
2. [Arquitectura de capas](#2-arquitectura-de-capas)
3. [Stack y versiones](#3-stack-y-versiones)
4. [Modelo de datos — visión general](#4-modelo-de-datos--visión-general)
5. [Estados y transiciones críticas](#5-estados-y-transiciones-críticas)
6. [Autenticación y autorización (Clerk)](#6-autenticación-y-autorización-clerk)
7. [Almacenamiento de archivos](#7-almacenamiento-de-archivos)
8. [Notificaciones (WhatsApp / Email)](#8-notificaciones-whatsapp--email)
9. [Scheduler de alertas](#9-scheduler-de-alertas)
10. [Endpoints públicos para landing](#10-endpoints-públicos-para-landing)
11. [Estrategia de migraciones](#11-estrategia-de-migraciones)
12. [Estrategia de testing](#12-estrategia-de-testing)
13. [Convenciones de código](#13-convenciones-de-código)
14. [Auditoría y trazabilidad](#14-auditoría-y-trazabilidad)
15. [Componentes que se modelan día 1 e implementan por fases](#15-componentes-que-se-modelan-día-1-e-implementan-por-fases)
16. [Decisiones pendientes](#16-decisiones-pendientes)

---

## 1. Principios de diseño

| Principio | Aplicación concreta en Ubicar Rent |
|-----------|-------------------------------------|
| **Single Responsibility** | Cada router maneja HTTP, cada service maneja una operación de dominio, cada repository maneja un agregado. |
| **Open/Closed** | Agregar un nuevo método de pago no toca `PagoService`: solo se registra en el enum y se maneja en un strategy. Agregar un proveedor de storage no toca consumidores: solo se implementa la interfaz. |
| **Dependency Inversion** | Services dependen de interfaces (`IVehiculoRepository`, `IStorage`, `INotifier`), no de SQLAlchemy ni de boto3. Permite mockear en tests y cambiar implementación sin tocar la lógica. |
| **DRY** | Una sola función de cálculo de Control 24hs reutilizada por checkin, dashboard y reportes. Un único helper `_response()` para envolver respuestas `{data, message, success}`. |
| **YAGNI** | No usamos event sourcing, CQRS, microservicios ni cache distribuida. Postgres + FastAPI sync alcanzan para 2-3 usuarios concurrentes. |
| **Dominio en español** | Tablas, modelos, schemas y rutas en español: `vehiculos`, `reservas`, `alquileres`. Identifiers técnicos en inglés: `id`, `created_at`, `is_active`. |
| **Inmutabilidad de eventos críticos** | Movimientos de cuenta corriente, pagos y bonificaciones de excedente son append-only. Nunca update destructivo sobre historial financiero. |
| **Transacciones explícitas** | Cualquier operación que toca más de una tabla (registrar pago + crear movimiento de cuenta corriente) corre en una sola transacción del service. |
| **Validación en la frontera** | Pydantic valida todo input HTTP. SQLAlchemy nunca recibe datos sin validar. Las invariantes de dominio (solapamientos, transiciones de estado) se chequean en el service. |

---

## 2. Arquitectura de capas

### Esquema general

```
┌──────────────────────────────────────────────────────────────────┐
│  HTTP                                                            │
├──────────────────────────────────────────────────────────────────┤
│  app/routers/            ← Routers (FastAPI)                     │
│    - Validación de input vía Pydantic                            │
│    - Manejo de status codes y headers                            │
│    - Inyección de dependencias (auth, db, services)              │
│    - SIN lógica de negocio                                       │
├──────────────────────────────────────────────────────────────────┤
│  app/services/           ← Lógica de negocio                     │
│    - Operaciones multi-paso (checkout, checkin, registrar pago)  │
│    - Coordinación entre repositorios                             │
│    - Side effects: notificaciones, audit log, jobs               │
│    - Maneja transacciones (commit/rollback)                      │
├──────────────────────────────────────────────────────────────────┤
│  app/repositories/       ← Acceso a datos                        │
│    - Queries SQLAlchemy 2.0 (sintaxis nueva: select(...))        │
│    - Un repo por agregado raíz                                   │
│    - Devuelve modelos SQLAlchemy o tipos primitivos              │
│    - SIN lógica de negocio                                       │
├──────────────────────────────────────────────────────────────────┤
│  app/models/             ← Entidades SQLAlchemy                  │
│    - Solo mapeo a tablas                                         │
│  app/schemas/            ← DTOs Pydantic                         │
│    - Request schemas (input)                                     │
│    - Response schemas (output)                                   │
│  app/domain/             ← Reglas puras (enums, value objects)   │
│    - Sin dependencia a SQLAlchemy                                │
│    - Funciones puras: cálculo de Control 24hs, selección de tarifa│
├──────────────────────────────────────────────────────────────────┤
│  app/adapters/           ← Integraciones externas                │
│    - storage/            ← R2 / local filesystem                 │
│    - notificaciones/     ← WhatsApp link, Resend email           │
│    - pdf/                ← reportlab / weasyprint                │
│  app/core/               ← Infra transversal                     │
│    - config, security, logging, deps inyectables                 │
└──────────────────────────────────────────────────────────────────┘
```

### Reglas de dependencia

- **Routers → Services → Repositories → Models.** Nunca al revés.
- **Routers nunca importan de `models/`** ni hacen queries directos. Reciben dependencies del service y schemas del request/response.
- **Services nunca llaman SQLAlchemy directo.** Solo a través de repos.
- **Adapters nunca conocen el modelo interno.** Devuelven DTOs propios; un mapper traduce si hace falta.
- **`core/` no depende de nada de negocio.** Puede ser importado por todos.
- **`domain/` no depende de nada externo.** Funciones puras testeables sin DB.

### Estructura de carpetas objetivo

```
backend/app/
├── main.py
├── config.py
├── database.py
├── auth.py                 # JWT verification (Clerk JWKS)
├── core/
│   ├── deps.py             # get_db, get_current_user, require_role
│   ├── responses.py        # _response, _paginated
│   └── exceptions.py       # ConflictError, NotFoundError, etc.
├── models/                 # 15 modelos SQLAlchemy (ya existen)
├── schemas/                # Pydantic DTOs por módulo
├── domain/
│   ├── enums.py            # EstadoVehiculo, EstadoReserva, etc.
│   ├── tarifas.py          # seleccionar_tarifa(duracion, tarifas)
│   ├── control_24hs.py     # calcular_excedente(checkout, checkin, gracia)
│   └── solapamientos.py    # detectar_conflicto(reservas, ventana)
├── repositories/
│   ├── base.py             # BaseRepository genérico
│   ├── vehiculo_repo.py
│   ├── cliente_repo.py
│   ├── reserva_repo.py
│   └── ...
├── services/
│   ├── vehiculo_service.py
│   ├── cliente_service.py
│   ├── reserva_service.py
│   ├── alquiler_service.py # checkout, checkin, bonificación
│   ├── pago_service.py
│   └── ...
├── routers/                # Ya existen, refactorear hacia services
├── adapters/
│   ├── storage/
│   │   ├── interface.py
│   │   ├── r2.py
│   │   └── local.py
│   ├── notificaciones/
│   │   ├── interface.py
│   │   ├── whatsapp.py     # link wa.me
│   │   └── email.py        # Resend
│   └── pdf/
│       ├── contrato.py
│       └── presupuesto.py
└── jobs/
    └── alertas.py          # APScheduler diario
```

### Por qué este nivel de separación

El estado actual del backend tiene routers que llaman SQLAlchemy directo (ver `routers/vehiculos.py` y `routers/reservas.py`). Funciona para el setup, pero a medida que entren reglas de negocio (Control 24hs, solapamientos, transiciones de estado, transacciones multi-tabla) los routers se vuelven inmantenibles.

Separar **service** y **repository** no es overkill acá porque:

- **Tests:** podemos mockear `IVehiculoRepository` para testear `AlquilerService.checkout()` sin tocar la DB.
- **Reuso:** la función "registrar pago + actualizar cuenta corriente" la usan al menos 3 endpoints. Vive en `PagoService`, se llama desde donde se necesite.
- **Refactor de queries:** cambiar de SQLAlchemy sync a async toca solo `repositories/`, no servicios.
- **Auditoría:** el audit log se inserta en la capa de service, único punto donde sabemos qué operación de dominio se ejecutó.

### Refactor incremental, no big bang

El código actual no se reescribe entero. **Cada Fase introduce la separación solo en los módulos que toca**. Los routers viejos siguen funcionando hasta que su Fase los tome. Concretamente:

- Fase 1 (Flota) introduce `core/`, `domain/enums.py`, `repositories/base.py`, `repositories/vehiculo_repo.py`, `services/vehiculo_service.py`.
- Fase 2 (Clientes) sigue el patrón con su propio repo y service.
- Fase 3 (Reservas/Alquileres) extiende a `domain/control_24hs.py`, `domain/solapamientos.py`.

---

## 3. Stack y versiones

| Componente | Versión | Notas |
|-----------|---------|-------|
| Python | 3.11+ | Type hints completos, sin `Optional[X]` (usar `X \| None`). |
| FastAPI | 0.111.x | Sync-style por ahora; async para integraciones externas (Auth/JWKS, Resend). |
| SQLAlchemy | 2.0.x | Sintaxis nueva (`Mapped`, `select()`). |
| Alembic | 1.13.x | Migraciones autogeneradas, revisadas a mano antes de aplicar. |
| PostgreSQL | 15+ | JSONB para datos opcionales, índices parciales para `activo = true`. |
| Pydantic | 2.x | `model_config = ConfigDict(from_attributes=True)` para mapear desde ORM. |
| pydantic-settings | 2.x | Config tipada desde `.env`. |
| python-jose | 3.x | Verificación JWT. |
| httpx | 0.27 | Cliente HTTP async (JWKS, Resend, futuras integraciones). |
| APScheduler | 3.10 | Jobs diarios en zona `America/Argentina/Buenos_Aires`. |
| reportlab | 4.x | PDFs server-side (contratos, presupuestos). |
| boto3 | 1.34 | Cliente S3-compatible para Cloudflare R2. |
| pytest | 8.x | Tests unitarios e integración. |
| pytest-asyncio | 0.23 | Tests de endpoints async. |
| httpx | (mismo) | TestClient de FastAPI usa httpx. |

---

## 4. Modelo de datos — visión general

15 entidades ya modeladas en `app/models/`. Los agregados raíz son:

- **Vehiculo** (con sus tarifas, gastos, documentos)
- **Cliente** (con sus conductores adicionales y cuenta corriente)
- **Reserva** → **Alquiler** (1-1) → **Contrato** (1-1)
- **Pago** (puede colgar de Alquiler o de Reserva)
- **Echeq** (independiente, vinculable a Alquiler o Gasto)
- **Presupuesto** (independiente, convertible a Reserva)

Ver `00_CONTEXT_GENERAL.md` para el diccionario de campos completo.

### Reglas de integridad clave

- `Vehiculo.patente` única.
- `Cliente.dni_cuit` único cuando no es null.
- `Alquiler.reserva_id` único (un alquiler por reserva).
- `Contrato.alquiler_id` único.
- `CuentaCorriente.cliente_id` único (un cliente, una cuenta).
- Foreign keys con `ON DELETE RESTRICT` por defecto. `ON DELETE CASCADE` solo en `MovimientoCuentaCorriente → CuentaCorriente`.

### Borrado lógico

- Vehículos y Clientes usan `activo: bool` para baja lógica.
- Reservas, Alquileres, Pagos, Echeqs **nunca se borran**, solo cambian de estado.
- Para "deshacer" una reserva → estado `cancelada`.

---

## 5. Estados y transiciones críticas

### Vehiculo

```
disponible ──reserva──→ reservado
disponible ──checkout──→ alquilado
reservado ──checkout──→ alquilado
alquilado ──checkin──→ disponible
alquilado ──checkin──→ en_transicion (si nuevo checkout < 4h)
en_transicion ──checkout──→ alquilado
* ──admin──→ fuera_de_servicio
fuera_de_servicio ──admin──→ disponible
```

### Reserva

```
pendiente ──confirmar──→ confirmada
pendiente ──cancelar──→ cancelada
confirmada ──checkout──→ activa
confirmada ──cancelar──→ cancelada
activa ──checkin──→ finalizada
```

### Echeq

```
en_cartera ──depositar──→ depositado
en_cartera ──endosar──→ endosado
depositado ──rechazar──→ rechazado
```

Estas transiciones se implementan en `domain/` como funciones puras `puede_transicionar(estado_actual, accion) -> bool`.

### Reglas de negocio asociadas

- **Control 24hs:** `gracia = 40 min`. Si `(checkin - checkout_estimado) > gracia`, calcular cargo proporcional al precio diario vigente.
- **Tarifa automática:** `< 7 días → diaria`, `7..29 días → semanal`, `≥ 30 días → mensual`. Si existe `Tarifa` con `cliente_id` la sobreescribe.
- **Contrato obligatorio:** `Alquiler.checkout` falla si `Contrato.firmado != true`.
- **Solapamientos:** una reserva confirmada o un alquiler activo bloquean el rango `[fecha_inicio, fecha_fin]` del vehículo. Las reservas pendientes no bloquean (solo advierten).

---

## 6. Autenticación y autorización (Clerk)

### Decisión: migrar de Auth0 a Clerk

Ver `AUTH_CLERK.md` para el detalle de la migración. Resumen:

- Clerk emite JWT firmado con RS256 igual que Auth0.
- El backend verifica el JWT contra el JWKS de Clerk (`https://<frontend-api>/.well-known/jwks.json`).
- El claim `sub` del JWT es el `userId` de Clerk → se persiste como `Usuario.auth_sub`.
- En el frontend, `<ClerkProvider>` reemplaza `<Auth0Provider>` y `<UserButton />` reemplaza la lógica manual de logout.

### Flujo de autorización

1. Frontend obtiene JWT de Clerk (`getToken()`).
2. Frontend lo manda en `Authorization: Bearer <token>`.
3. `auth.py::verify_token` valida firma, audience, issuer.
4. `core/deps.py::get_current_user(claims)` ejecuta upsert: busca `Usuario` por `auth_sub`, lo crea si no existe (tomando email y nombre del JWT).
5. Si el `auth_sub` no está en la lista blanca de admins iniciales (env var `CLERK_ADMIN_SUBS`) y la auto-provisión está deshabilitada → 403.
6. Roles: `admin` (Franco, Martín), `operador` (placeholder futuro), `solo_lectura` (usuario de carga de documentación).

### Por qué upsert y no creación manual

- Evita el paso "crear usuario en Postgres antes de que entre por primera vez".
- El primer login es transparente para el dueño.
- La fuente de verdad de identidad (email, nombre) sigue siendo Clerk.

---

## 7. Almacenamiento de archivos

### Interfaz unificada

```python
# app/adapters/storage/interface.py
class IStorage(Protocol):
    def upload(self, file: BinaryIO, key: str, content_type: str) -> str: ...
    def get_url(self, key: str, expires_in: int = 3600) -> str: ...
    def delete(self, key: str) -> None: ...
```

### Implementaciones

- `R2Storage` — Cloudflare R2 vía boto3. Usa presigned URLs.
- `LocalStorage` — Filesystem bajo `STORAGE_PATH`. Sirve los archivos por un endpoint `/files/{key}` autenticado.

### Selector

`config.storage_provider` decide qué implementación inyecta `core/deps.py::get_storage()`. Switch en una env var.

### Convención de keys

```
vehiculos/{id}/foto.jpg
vehiculos/{id}/documentos/{tipo}/{nombre}
contratos/{alquiler_id}/{timestamp}.pdf
presupuestos/{id}.pdf
pagos/{id}/comprobante.{ext}
```

Las URLs presigned no se persisten en DB. Solo se persiste la `key`.

---

## 8. Notificaciones (WhatsApp / Email)

### WhatsApp

No hay API directa (sin business account). El servicio devuelve un link `https://wa.me/{phone}?text={url_encoded_message}` que el frontend abre en una nueva pestaña.

### Email

Resend con plantillas en HTML embebidas. Si `RESEND_API_KEY` está vacía → modo `dry_run` que loguea el intento sin enviar. Crítico para tests y dev local.

### Casos de uso por módulo

| Módulo | Notificación | Canal |
|--------|--------------|-------|
| Reservas | Confirmación al cliente | WhatsApp link manual |
| Reservas | Recordatorio devolución | Job + WhatsApp link generado |
| Cotizador | Envío de presupuesto | Email con PDF adjunto |
| Caja | Comprobante de pago | Email opcional |
| Alertas | VTV / póliza por vencer | Email a admins |
| Alertas | Devolución hoy | Email a admins |

---

## 9. Scheduler de alertas

APScheduler corre embebido en el proceso FastAPI (no requiere infraestructura adicional para 2-3 usuarios). Job diario a las 08:00 zona `America/Argentina/Buenos_Aires`.

### Condiciones evaluadas

- VTV / póliza por vencer en 30, 15, 7 días.
- Licencia de cliente por vencer en 30 días.
- Próximo service de vehículo: `km_actual >= km_proximo_service - 500`.
- Echeqs por vencer en 7 días.
- Devoluciones programadas para hoy (alquileres con `fecha_fin_estimada == hoy`).

### Persistencia

Cada alerta generada se persiste en una tabla `alertas` (a crear en la fase del scheduler) con:
- `tipo`, `entidad_id`, `entidad_tipo`, `mensaje`, `fecha_evento`, `notificada_en`, `vista_en`.

Esto permite mostrar las alertas en el Dashboard sin re-evaluar cada vez.

---

## 10. Endpoints públicos para landing

Ya existe `routers/public.py` registrado bajo `/api/v1/public/`. Endpoints planificados:

```
GET  /api/v1/public/disponibilidad?fecha_inicio&fecha_fin&categoria
POST /api/v1/public/reservas
```

Reglas:

- Sin autenticación.
- Rate limiting (slowapi) por IP: 10 req/min.
- CORS extra: aceptar `LANDING_URL` además del frontend interno.
- Respuesta de `disponibilidad` reusa la misma lógica que el módulo de Ocupación (no duplicar).
- `POST /reservas` crea Cliente nuevo si DNI no existe, o lo asocia si existe. Reserva queda en estado `pendiente` para que un operador la confirme manualmente.

---

## 11. Estrategia de migraciones

- **Fase 0** genera la migración inicial con todos los modelos existentes (15).
- Cada Fase posterior que altere schema genera una migración nueva con nombre descriptivo: `add_excedente_columns_to_alquileres`, no `revision_abc123`.
- **Nunca** se modifica una migración ya aplicada en producción. Si se necesita corregir → nueva migración compensatoria.
- Migraciones que requieren backfill de datos: el script de datos va en la misma migración (`op.execute(...)`).
- Antes de cada Fase con cambio de schema → checklist de rollback documentado en el archivo de la fase.

### Comando estándar

```bash
# Generar
alembic revision --autogenerate -m "descripcion clara"

# Aplicar
alembic upgrade head

# Rollback a la anterior
alembic downgrade -1
```

---

## 12. Estrategia de testing

### Pirámide

```
e2e (smoke tests)        ← pocos, flujos críticos completos
   │
integración (services)    ← muchos, con DB de prueba
   │
unitarios (domain)         ← muchísimos, funciones puras
```

### Por capa

| Capa | Tipo | Herramienta | Cobertura objetivo |
|------|------|-------------|---------------------|
| `domain/` | Unitario | pytest | 100% |
| `services/` | Integración con DB de prueba | pytest + fixture DB | flujos principales + casos borde |
| `routers/` | Integración con TestClient | pytest + httpx | happy path + auth + validación |
| `adapters/` | Mock + integración real opcional | pytest | comportamiento de la interfaz |

### Reglas de negocio críticas con cobertura obligatoria

- Cálculo de Control 24hs (gracia, excedente, redondeo).
- Selección automática de tarifa.
- Detección de solapamientos.
- Transiciones de estado (vehículo, reserva, echeq).
- Invariante: `CuentaCorriente.saldo == sum(movimientos)`.
- Validación de contrato firmado en checkout.

### DB de prueba

- Postgres en Docker Compose para CI.
- Fixture `db_session` que crea esquema, ejecuta el test, hace rollback al final.
- Sin SQLite (las features de Postgres como JSONB no son portables).

### Property-based testing

Para las invariantes financieras (saldo de cuenta corriente, totales de pagos) usar `hypothesis`. Generar secuencias arbitrarias de movimientos y verificar invariantes.

---

## 13. Convenciones de código

### Naming

- Tablas y modelos: español, plural (`vehiculos`, `clientes`).
- Routers y rutas: español, plural (`/api/v1/vehiculos`).
- Funciones y variables Python: inglés (`create_vehiculo`, `get_db`).
- Servicios: español como sustantivo (`VehiculoService`, no `VehicleService`).
- Schemas Pydantic: `<Entidad>Create`, `<Entidad>Update`, `<Entidad>Response`.
- Enums: `EstadoVehiculo`, `MetodoPago` en `domain/enums.py`.

### Respuestas HTTP

Toda respuesta success usa el envelope:

```json
{ "data": ..., "message": "OK", "success": true }
```

Las paginadas:

```json
{ "data": [...], "total": 123, "page": 1, "page_size": 20, "success": true, "message": "OK" }
```

Los errores usan `HTTPException` estándar de FastAPI (4xx) con detail en español.

### Type hints

- TypeScript style: `str | None` no `Optional[str]`.
- Sin `Any`. Si una integración externa devuelve algo no tipable, envolver en un DTO.

### Imports

```python
# 1. Stdlib
# 2. Third-party
# 3. App (relativos absolutos: from app.x import y)
```

### Logging

- `logging` stdlib, configurado en `core/logging.py`.
- Nunca `print()` en código de producción.
- Niveles: `INFO` para operaciones de dominio, `WARNING` para casos borde recuperables, `ERROR` para fallos.

### Manejo de transacciones

```python
# en services
def checkout(self, alquiler_id: int) -> Alquiler:
    with self.db.begin():  # commit/rollback automático
        alquiler = self.alquiler_repo.get(alquiler_id)
        ...
```

### Excepciones de dominio

`core/exceptions.py` define:

- `NotFoundError(entity, id)`
- `ConflictError(message)` — solapamientos, duplicados
- `BusinessRuleError(rule, message)` — contrato faltante, transición inválida
- `UnauthorizedError(reason)`

Un middleware traduce estas excepciones a `HTTPException` apropiados.

---

## 14. Auditoría y trazabilidad

### Append-only log

Tabla `audit_log` (a crear en la fase de Caja o antes si hace falta):

```
id, usuario_id, accion, entidad_tipo, entidad_id, datos_antes (jsonb), datos_despues (jsonb), created_at
```

### Qué se audita

- Bonificaciones de excedente (quién, cuándo, monto).
- Cambios de estado de alquileres.
- Movimientos de cuenta corriente.
- Cambios de echeq.
- Modificaciones de tarifas.

### Qué NO se audita (para evitar ruido)

- Lecturas.
- Búsquedas y filtros.
- Cambios de campos no críticos en clientes/vehículos (notas, observaciones).

### Inmutabilidad

`audit_log` no tiene UPDATE ni DELETE permitidos por aplicación. A nivel DB se puede agregar trigger que lo prevenga.

---

## 15. Componentes que se modelan día 1 e implementan por fases

| Componente | Modelado en | Implementado en |
|-----------|-------------|------------------|
| 15 modelos SQLAlchemy | Setup (ya hecho) | — |
| Migración inicial | Fase 0 | Fase 0 |
| Capas service / repository | Fase 1 (Flota) | Incremental por módulo |
| Storage abstracto | Fase 1 (Flota) | Fase 1 |
| Notificaciones abstractas | Fase 3 (Reservas) | Fase 3 |
| Scheduler de alertas | Fase 8 (post Caja) | Fase 8 |
| Audit log | Fase 6 (Caja) | Fase 6 |
| Endpoints públicos | Fase 4 (post Reservas) | Fase 4 |
| PDF generation | Fase 5 (Contratos) | Fase 5 + Cotizador |
| Cuenta corriente y movimientos | Fase 6 (Caja) | Fase 7 |

---

## 16. Decisiones pendientes

- **Provider de hosting:** Railway vs Render. Railway es más simple para deploy de Postgres + FastAPI juntos; Render tiene plan free para web services. A definir antes de Fase 4.
- **PDF server-side:** reportlab (puro Python, sin deps de sistema) vs WeasyPrint (mejor calidad pero requiere GTK+ en Windows). Recomendación: reportlab para empezar, migrar si la calidad no alcanza.
- **Storage en producción:** R2 vs S3 vs Backblaze. R2 sale gratis los primeros 10GB y no cobra egress, conveniente para empezar.
- **Rate limiting:** slowapi (in-memory) suficiente para 1 instancia. Si se escala a múltiples instancias → Redis.
- **Audit log:** ¿tabla única o una por entidad? Tabla única más simple y suficiente al volumen esperado.

---

## Cómo usar este documento

1. Antes de implementar cualquier módulo: leer este archivo + `00_CONTEXT_GENERAL.md` + el archivo de contexto del módulo (`docs/modules/XX_modulo_*.md`).
2. Mantener este documento vivo. Si una decisión cambia → editar acá y dejar nota en el archivo del módulo afectado.
3. Las decisiones marcadas como "pendientes" no se implementan hasta resolverlas.

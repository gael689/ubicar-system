# Ubicar Rent — Flujos Funcionales del Sistema

**Versión:** 2026-06-26 (rev. 8 — Finanzas unificada, terminología Check-out/Check-in auto-céntrica, badge Flota simplificado, cobro inline en Check-in)
**Stack:** Vite + React 18 + TypeScript + Tailwind CSS + shadcn/ui / FastAPI 0.111 + SQLAlchemy 2.0 + PostgreSQL 18
**Auth actual:** `DEV_BYPASS_AUTH=true` (Clerk diferido)
**Storage:** Filesystem local bajo `uploads/` (Cloudflare R2 diferido)

---

## Índice

1. [Flota (Vehículos)](#1-flota-vehículos)
2. [Clientes](#2-clientes)
3. [Reservas y Alquileres](#3-reservas-y-alquileres)
4. [Calendario de Ocupación](#4-calendario-de-ocupación)
5. [Dashboard Operativo](#5-dashboard-operativo)
6. [Multas](#6-multas)
7. [Extensión de Alquiler](#7-extensión-de-alquiler)
8. [Combustible, Limpieza y Garantía en Check-in/Check-out](#8-combustible-limpieza-y-garantía-en-check-incheck-out)
9. [Garantía con Tarjeta Integrada](#9-garantía-con-tarjeta-integrada)
10. [Tarjeta Bancaria del Cliente](#10-tarjeta-bancaria-del-cliente)
11. [Registro de Servicios y Mantenimiento](#11-registro-de-servicios-y-mantenimiento)
12. [Sistema de Notificaciones In-System](#12-sistema-de-notificaciones-in-system)
13. [Caja y Pagos (tab Finanzas)](#13-caja-y-pagos)
14. [Echeqs (tab Finanzas)](#14-echeqs)
15. [Cuentas Corrientes (tab Finanzas)](#15-cuentas-corrientes)
16. [Reportes y Estadísticas](#16-reportes-y-estadísticas)
17. [Cotizador](#17-cotizador)
18. [Arquitectura General](#18-arquitectura-general)
19. [Convenciones y Reglas de Negocio Globales](#19-convenciones-y-reglas-de-negocio-globales)
20. [Migraciones de Base de Datos](#20-migraciones-de-base-de-datos)
21. [Pendiente / Lo que falta](#21-pendiente--lo-que-falta)

---

## 1. Flota (Vehículos)

Ruta: `/flota` | Detalle: `/flota/:id`

### 1.1 Listar flota

`GET /api/v1/vehiculos` — tabla de todos los vehículos activos.

**Columnas:** Foto miniatura · Patente · Marca/Modelo · Año · Tipo · Estado (badge simplificado) · KM actual · Acciones

**Filtros disponibles:**
- Estado: `disponible` / `alquilado` / `reservado` / `en_transicion` / `fuera_de_servicio`
- Búsqueda libre: marca, modelo, patente (case-insensitive)

**Badges automáticos en la columna KM:**
- 🟡 `Service próximo` — `km_proximo_service - km_actual < 1000`
- 🔴 `Mant. vencido` — `km_actual >= km_proximo_service`

**Badge de Estado en la tabla (vista simplificada para operador):**
La columna "Estado" muestra únicamente **dos valores** derivados del `estado` interno del vehículo:
- **"En uso"** (azul, primary) — cuando `estado === 'alquilado'`
- **"Disponible"** (verde, success) — para cualquier otro estado (incluye `disponible`, `reservado`, `en_transicion`, `fuera_de_servicio`)

Este mapeo se hace en `VehiculoTable.tsx` y reemplaza el badge anterior que mostraba el `ESTADO_VEHICULO_LABEL` completo. El badge de "Inactivo" (cuando `activo=False`) sigue apareciendo aparte.

**Estados internos del vehículo:**
| Estado | Descripción | Cambia cuando | Badge en tabla |
|--------|-------------|---------------|----------------|
| `disponible` | Libre para reservar | Estado inicial; tras checkin | Disponible |
| `alquilado` | Con alquiler activo | Al hacer checkout | **En uso** |
| `reservado` | Tiene reserva confirmada futura | Al confirmar reserva (automático) | Disponible |
| `en_transicion` | Checkin + nuevo checkout el mismo día con <4h diferencia | Caso especial | Disponible |
| `fuera_de_servicio` | En taller o baja temporal | Manual | Disponible |

### 1.2 Crear vehículo

1. Botón "Nuevo vehículo" → modal `VehiculoModal`
2. **Campos:**
   - Patente (única, mayúsculas)
   - Marca / Modelo / Año / Color
   - Tipo: `auto` | `camioneta`
   - KM actual
   - KM entre services (define el intervalo)
   - Foto (opcional — upload separado)
3. `POST /api/v1/vehiculos` → estado inicial `disponible`, `activo=True`
4. `km_proximo_service` se inicializa = `km_actual + km_entre_services`

### 1.3 Detalle del vehículo (`/flota/:id`)

**Tabs disponibles:**

| Tab | Contenido |
|-----|-----------|
| **Datos** | Info completa, editar campos, dar de baja / reactivar, subir foto |
| **Documentos** | Póliza, VTV, cláusulas y otros — con badges de vencimiento |
| **Gastos** | Registro de egresos del vehículo (combustible, service, seguro, etc.) |
| **Tarifas** | Precios diario/semanal/mensual vigentes |
| **Historial** | Log de cambios de estado y otros eventos |
| **Reservas** | Historial de todas las reservas del vehículo con KMs por alquiler |
| **Mantenimiento** | Estado de service + historial completo (ver sección 11) |

### 1.4 Documentos de vehículo

1. Tab "Documentos" → `DocumentosTab`
2. Tipos: `poliza` / `vtv` / `clausulas` / `otro`
3. Subir: tipo, archivo (PDF/imagen), nombre, fecha vigencia_desde, fecha vigencia_hasta
4. `POST /api/v1/vehiculos/{id}/documentos` (multipart)
5. Archivo guardado: `uploads/vehiculos/{id}/documentos/{doc_id}-{uuid}.{ext}`
6. Servido vía `GET /static/vehiculos/{id}/documentos/...`
7. **Badges automáticos:**
   - 🔴 `VENCIDO` — `vigencia_hasta < hoy`
   - 🟡 `POR VENCER` — `vigencia_hasta <= hoy + 30 días`
8. Eliminar: baja lógica (`activo=False`)

### 1.5 Gastos del vehículo

1. Tab "Gastos" → `GastosTab`
2. **Tipos de gasto:** `service` / `combustible` / `cubiertas` / `reparacion` / `seguro` / `patente` / `vtv` / `lavado` / `otro`
3. Campos: tipo, descripción, monto, medio de pago, fecha, proveedor (opc.), KM al momento (opc.), notas
4. Medios de pago disponibles: efectivo / transferencia / tarjeta / cheque / echeq
5. `GET /api/v1/vehiculos/{id}/gastos` — paginado, filtros por tipo y fecha
6. `POST /api/v1/vehiculos/{id}/gastos`
7. `PATCH /api/v1/gastos/{id}` / `DELETE /api/v1/gastos/{id}` (hard delete, ver sección 19)
8. **Integración con Caja:** los gastos del día aparecen en la vista diaria de `/caja`

### 1.6 Tarifas

1. Tab "Tarifas" en `FlotaDetail`
2. Tipos: `diaria` / `semanal` / `mensual`
3. Cada tarifa tiene: tipo, monto, fecha vigencia desde
4. Una tarifa por tipo puede estar activa (`activo=True`) por vehículo
5. También existen tarifas globales (sin `vehiculo_id`) como fallback

**Lógica de aplicación de tarifa:**
- `<7 días` → tarifa diaria
- `7–29 días` → tarifa semanal
- `≥30 días` → tarifa mensual
- Busca primero tarifa del vehículo específico, si no existe usa la global

### 1.7 Dar de baja / reactivar vehículo

- **Baja:** `PATCH /api/v1/vehiculos/{id}` con `activo=False` → vehículo desaparece de listas activas
- **Reactivar:** botón "Reactivar" visible solo cuando `activo=False` → `activo=True`, estado → `disponible`
- **Regla:** nunca se elimina físicamente (ver sección 19)

### 1.8 Endpoints de Flota

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/vehiculos` | Lista con filtros |
| `POST` | `/vehiculos` | Crear vehículo |
| `GET` | `/vehiculos/{id}` | Detalle |
| `PATCH` | `/vehiculos/{id}` | Actualizar datos / baja lógica |
| `POST` | `/vehiculos/{id}/foto` | Subir/reemplazar foto |
| `GET` | `/vehiculos/{id}/documentos` | Listar documentos |
| `POST` | `/vehiculos/{id}/documentos` | Subir documento |
| `DELETE` | `/documentos/{doc_id}` | Baja lógica de documento |
| `GET` | `/vehiculos/{id}/gastos` | Listar gastos (paginado) |
| `POST` | `/vehiculos/{id}/gastos` | Registrar gasto |
| `PATCH` | `/gastos/{id}` | Actualizar gasto |
| `DELETE` | `/gastos/{id}` | Eliminar gasto (hard) |
| `GET` | `/vehiculos/{id}/tarifas` | Listar tarifas del vehículo |
| `POST` | `/vehiculos/{id}/tarifas` | Crear tarifa |
| `GET` | `/vehiculos/{id}/historial` | Log de cambios |
| `GET` | `/vehiculos/{id}/servicios` | Historial de mantenimiento |
| `POST` | `/vehiculos/{id}/servicios` | Registrar servicio |

---

## 2. Clientes

Ruta: `/clientes` | Detalle: `/clientes/:id`

### 2.1 Listar clientes

`GET /api/v1/clientes` — tabla con filtros.

**Columnas:** Nombre · DNI/CUIT · Teléfono · Tipo · Frecuente (estrella) · Estado · Licencia (badge vencimiento) · Acciones

**Filtros:** tipo (particular/empresa), activo/inactivo, búsqueda libre (nombre, DNI, email, teléfono)

### 2.2 Crear cliente

1. Botón "Nuevo cliente" → modal `ClienteFormDialog`
2. **Campos comunes:** nombre_completo, tipo (particular/empresa), dni_cuit, teléfono, email (opc.), es_frecuente, notas
3. **Solo si tipo=particular:** licencia_numero, licencia_categoria, licencia_vencimiento
4. `POST /api/v1/clientes` → `activo=True`

### 2.3 Detalle del cliente (`/clientes/:id`)

**Tabs disponibles:**

| Tab | Contenido | Condición |
|-----|-----------|-----------|
| **Datos** | Info completa + editar; empresa muestra "CUIT" en lugar de "DNI/CUIT" | Siempre |
| **Documentos** | DNI, licencia, contratos y otros con badges de vencimiento | Siempre |
| **Conductores** | Conductores adicionales autorizados | Solo tipo=`particular` |
| **Historial** | Reservas y alquileres asociados | Siempre |
| **Tarjeta** | Datos de tarjeta bancaria protegida por PIN (ver sección 10) | Siempre |
| **Multas** | Multas imputadas al cliente (ver sección 6) | Siempre |
| **Cta. Corriente** | Saldo y movimientos de cuenta corriente (ver sección 15) | Siempre |

### 2.4 Documentos de cliente

1. Tab "Documentos" → `ClienteDocumentosTab`
2. Tipos: `dni` / `licencia` / `contrato` / `otro`
3. `POST /api/v1/clientes/{id}/documentos` (multipart)
4. Archivo guardado: `uploads/clientes/{id}/documentos/{doc_id}-{uuid}.{ext}`
5. Mismos badges de vencimiento que vehículos (VENCIDO / POR VENCER)
6. Eliminar: baja lógica

### 2.5 Conductores adicionales

1. Tab "Conductores" — solo si `tipo=particular`
2. **Campos:** nombre_completo, DNI, licencia_numero, licencia_vencimiento
3. `POST /api/v1/clientes/{id}/conductores`
4. Listar, editar, dar de baja conductores
5. `DELETE /api/v1/conductores/{id}` (baja lógica)

### 2.6 Dar de baja / reactivar cliente

- **Baja:** confirmación → `PATCH /api/v1/clientes/{id}` (`activo=False`)
- **Reactivar:** botón visible cuando inactivo

### 2.7 Endpoints de Clientes

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/clientes` | Lista con filtros |
| `POST` | `/clientes` | Crear cliente |
| `GET` | `/clientes/{id}` | Detalle con conductores anidados |
| `PATCH` | `/clientes/{id}` | Actualizar / baja lógica |
| `GET` | `/clientes/{id}/documentos` | Listar documentos |
| `POST` | `/clientes/{id}/documentos` | Subir documento |
| `DELETE` | `/documentos/clientes/{doc_id}` | Baja lógica de documento |
| `GET` | `/clientes/{id}/conductores` | Listar conductores |
| `POST` | `/clientes/{id}/conductores` | Agregar conductor |
| `PATCH` | `/conductores/{id}` | Actualizar conductor |
| `DELETE` | `/conductores/{id}` | Baja lógica conductor |
| `GET` | `/clientes/{id}/tarjeta` | Ver tarjeta (requiere PIN header) |
| `PUT` | `/clientes/{id}/tarjeta` | Crear/actualizar tarjeta (requiere PIN header) |
| `DELETE` | `/clientes/{id}/tarjeta` | Eliminar tarjeta (baja física) |

---

## 3. Reservas y Alquileres

Ruta: `/reservas`

### 3.1 Listar reservas

`GET /api/v1/reservas` — tabla paginada con filtros.

**Columnas:** ID · Vehículo (marca+patente) · Cliente · Fechas inicio/fin · Precio total · Estado · Acciones

**Filtros:**
- Estado: Todos / Confirmada / Activa / Finalizada / Cancelada
- Búsqueda libre: nombre cliente o DNI/CUIT (`?q=texto`)
- Fecha específica: reservas que incluyen ese día (`?fecha=YYYY-MM-DD`)
- Botón "Limpiar filtros" cuando hay filtros activos

**Banner de check-outs pendientes (alerta no bloqueante):**
- Al cargar la página, se consultan reservas con `estado='activa'` y se filtran las que tienen `fecha_fin < hoy`
- Si existen → banner amarillo ⚠️ en la parte superior: "Hay X check-out(s) pendiente(s). Los vehículos no fueron devueltos en tiempo."
- No impide usar el sistema; es solo informativo

### 3.2 Terminología Check-out / Check-in (auto-céntrica)

> **Perspectiva del auto** (alineada con backend y lo natural del operario de cochera):
> - **Check-out** = el auto **sale** de la cochera → cliente se lo lleva (entrega)
> - **Check-in** = el auto **vuelve** a la cochera → cliente lo devuelve (devolución)
>
> Esta convención se alinea con los endpoints del backend (`/reservas/{id}/checkout`, `/alquileres/{id}/checkin`) y los nombres de los archivos del frontend (`CheckoutModal.tsx`, `CheckinModal.tsx`). En la UI todos los labels visibles usan esta misma convención.

### 3.3b Estados de reserva y transiciones

```
[creación]
    ↓
confirmada ──── [Check-out] ──→ activa ──── [Check-in] ──→ finalizada
    ↓
cancelada
```

| Estado | Acciones disponibles |
|--------|---------------------|
| `confirmada` | Editar · Cancelar · **Check-out** (entrega) |
| `activa` | Extender · **Check-in** (devolución) |
| `finalizada` | — (solo lectura) |
| `cancelada` | — (solo lectura) |

### 3.3 Crear reserva

1. Botón "Nueva Reserva" → `ReservaModal`
2. **Campos:**
   - Vehículo (selector con estado; muestra ⚠️ si estado=`alquilado`)
   - Cliente (buscador)
   - Fecha y hora inicio / fin
   - Lugar de entrega / devolución
   - **Cotización (obligatoria):** precio por día o precio total ÷ días (ver 3.3a)
   - Late checkout (bool)
   - Cargo por late checkout (monto adicional)
   - **Forma de Pago Prevista, Estado y Anticipo:** Selección del estado del pago y carga del monto del anticipo si aplica
   - **Garantía / Depósito** (ver 3.3b)
   - Notas
3. **Validación de cotización:** si `precio_total` está vacío o es 0 al intentar guardar → error "La cotización es obligatoria"
4. **Alerta de check-out pendiente:** si el vehículo seleccionado tiene `estado='alquilado'` → banner amarillo de advertencia en el modal (no bloquea)
5. **Detección de solapamiento:** al seleccionar vehículo y fechas, el backend verifica conflictos con otras reservas activas y devuelve `warnings[]`
6. Si hay solapamiento: muestra advertencia con datos del conflicto — no bloquea la creación
7. `POST /api/v1/reservas` → estado `confirmada`

### 3.3a Cotización obligatoria

La reserva debe tener un precio total antes de guardarse. Hay dos caminos:

**Desde tarifas (auto-población):**
- Al seleccionar vehículo, el sistema consulta `GET /vehiculos/{id}/tarifas` y muestra todos los tipos activos como botones seleccionables
- La tarifa recomendada según la duración queda resaltada en azul con ✓:
  - Menos de 7 días → tarifa `diaria`
  - 7 a 29 días → tarifa `semanal`
  - 30 días o más → tarifa `mensual`
- El `monto` de cada tarifa es siempre precio **por día** (el total = días × monto)
- Clicar cualquier botón aplica ese precio/día y calcula el total inmediatamente
- Si el vehículo no tiene tarifas, aparece un aviso; los botones de tarifa desaparecen

**Precio especial (manual):**
- Operador ingresa precio por día → total se calcula automáticamente (días × precio/día)
- O ingresa precio total directamente → precio/día se calcula por división
- Ambas entradas son editables y se sincronizan entre sí

### 3.3b Garantía / Depósito en reserva

Al crear (o editar) la reserva, el operador define el tipo de garantía:

| Opción | Descripción |
|--------|-------------|
| `no_aplica` | Sin garantía (default) |
| `efectivo` | Se retiene efectivo; ingresar monto |
| `transferencia` | Se recibe transferencia como garantía; ingresar monto |
| `tarjeta` | Cargo preventivo en tarjeta; campos adicionales: titular, número, vencimiento |

Si se elige `tarjeta`:
- Aparecen campos inline: Titular de la tarjeta · Número de tarjeta · Vencimiento (MM/AA)
- Los datos quedan guardados en la reserva (`garantia_tarjeta_*`)

**Campos en DB (tabla `reservas`):**
- `garantia_tipo`, `garantia_monto`, `garantia_tarjeta_numero`, `garantia_tarjeta_vencimiento`, `garantia_tarjeta_titular`

**En el Check-in (entrega):** la garantía se muestra como panel informativo de solo lectura.
**En el Check-out (devolución):** el operador define la resolución de la garantía (devolver / retención parcial / retener).

### 3.4 Check-out — Entrega del vehículo al cliente

> Etiqueta en UI: **"Check-out"** · Endpoint backend: `POST /api/v1/reservas/{id}/checkout`

**Dispara:** botón **"Check-out"** en reserva con estado `confirmada`.

**Modal `CheckoutModal` — puramente operativo (sin financieros):**
- Fecha y hora de entrega (default: `fecha_inicio` / `hora_inicio` de la reserva)
- KM al entregar — **auto-completado con `vehiculo.km_actual`** del sistema, editable
- Nivel de combustible (selector visual 5 niveles: vacío/¼/½/¾/lleno)
- Estado de limpieza del vehículo al salir
- Descripción/notas de entrega
- Registrado en tiempo real (bool)
- Garantía (si la reserva la tiene) → panel informativo de solo lectura

> **Cambio (2026-06-26):** anteriormente el CheckoutModal incluía bloques de "Resumen Financiero" y "Cobrar saldo pendiente ahora". Esos bloques fueron **removidos**: la entrega es un evento puramente operativo. La parte financiera se centraliza en el Check-in (devolución). El anticipo previo de la reserva sigue creándose como `Pago` automáticamente al hacer el checkout (lógica en `alquiler_service.checkout()`).

**Al confirmar:** `POST /api/v1/reservas/{reserva_id}/checkout`
- Crea registro en tabla `alquileres`
- Estado reserva → `activa`
- Estado vehículo → `alquilado`
- `vehiculo.km_actual` se actualiza con el KM ingresado
- Si la reserva tenía `anticipo_monto`, se genera `Pago` automático
- Invalida caches: `vehiculos`, `reservas`, `pagos`, `notificaciones`, `reportes`

### 3.5 Check-in — Devolución del vehículo por el cliente

> Etiqueta en UI: **"Check-in"** · Endpoint backend: `POST /api/v1/alquileres/{id}/checkin`

**Dispara:** botón **"Check-in"** (ámbar) en reserva con estado `activa`.

**Modal `CheckinModal` — campos operativos:**
- Fecha de devolución (default: hoy)
- Hora de devolución — **default: `reserva.hora_fin` (hora pactada de devolución)**. Si el cliente llega antes o después, el operador edita y el preview de excedente se recalcula.
- KM devolución (≥ KM de salida)
- Nivel de combustible de llegada
- Estado de limpieza de llegada
- Descripción/notas
- Registrado en tiempo real (bool)

**Modal `CheckinModal` — sección financiera (nueva, 2026-06-26):**

Muestra el resumen financiero completo:
- Precio del alquiler
- Cargo late checkout (si aplica)
- Anticipo pagado
- Saldo base pendiente (`precio_total + cargo_late - anticipo - pagos_previos`)
- Excedente estimado según la decisión actual

**Bloque "Cobrar al cliente ahora" (nuevo):**
- Checkbox opcional
- Si se activa, formulario inline: monto (precompletado con `saldo_base + excedente`), medio de pago, fecha (default hoy), notas
- Al confirmar el check-in, se envía `pago_inmediato` al backend y se crea un `Pago` en la misma transacción
- Decisión registrada: el `cargo_excedente` se incluye automáticamente en el monto sugerido del cobro inline.

**Cálculo de excedente automático:**
- Si hora llegada > hora acordada → calcula horas excedidas
- Si `horas_excedidas ≤ 40 minutos` → dentro de la gracia, `cargo_excedente = 0`
- Si `horas_excedidas > 40 minutos` → se descuentan los 40 minutos y el admin decide:
  - **Cobrar completo** — cargo por horas netas excedidas
  - **Cobrar parcial** — el admin ingresa cuántas horas cobrar
  - **No cobrar / bonificar** — con motivo de bonificación
- `tarifa_hora_excedente = tarifa_diaria / 24`

**Si la reserva tenía garantía definida:** bloque de resolución de garantía:
- Devolver completa → `garantia_estado = 'devuelta'`
- Retención parcial → `garantia_estado = 'ejecutada_parcial'` + `garantia_monto_devuelto`
- Retener por siniestro → queda `retenida` (queda como notificación pendiente)

**Al confirmar:** `POST /api/v1/alquileres/{id}/checkin`
- Estado reserva → `finalizada`
- Estado vehículo → `disponible` (o `en_transicion` si hay nuevo checkout en <4h)
- `vehiculo.km_actual` se actualiza con el KM de devolución
- Si se incluyó `pago_inmediato` → crea `Pago` asociado al alquiler
- Si saldo > 0 sin cobrar → queda visible en `PendientesSection` de la Caja
- Invalida caches: `vehiculos`, `reservas`, `pagos`, `notificaciones`, `reportes`, `cuentas-corrientes`

### 3.5b Schema `CheckinCreate` extendido (backend)

A partir de rev. 8, el schema acepta los siguientes campos opcionales:
```python
class CheckinCreate(BaseModel):
    # ... campos existentes ...
    checkin_estado_limpieza: str | None = None
    garantia_estado: str | None = None
    garantia_monto_devuelto: Decimal | None = None
    pago_inmediato: PagoInmediato | None = None  # NUEVO
```

`alquiler_service.checkin()` procesa `pago_inmediato` y crea un `Pago` dentro de la misma transacción (`with self.db.begin_nested()`).

### 3.6 Historial de KM por vehículo

Acceso: `/flota/:id` → Tab **"Reservas"** → `HistorialReservasTab`

Por cada reserva del vehículo que tiene alquiler asociado, se muestra:
- **KM de salida** (registrado en el Check-in / entrega)
- **KM de llegada** (registrado en el Check-out / devolución)
- **KMs recorridos** = llegada − salida (badge "+X km")
- Si el alquiler está activo (sin devolución): muestra "en curso" en ámbar

La información viene del cruce entre `/reservas?vehiculo_id=` y `/alquileres?vehiculo_id=`.

### 3.7 Previsualización de excedente

`GET /api/v1/alquileres/{id}/preview-excedente`

Retorna:
```json
{
  "horas_excedidas": 2.5,
  "minutos_excedidos_brutos": 150,
  "dentro_de_gracia": false,
  "tarifa_diaria": "15000.00",
  "tarifa_hora_excedente": "625.00",
  "cargo_sugerido": "1250.00",
  "aplica_dia_completo": false,
  "dias_completos_cobrados": 0
}
```

### 3.7 Cancelar reserva

1. Botón "Cancelar" (solo en estado `confirmada` — sin alquiler)
2. Confirmación → `POST /api/v1/reservas/{id}/cancelar`
3. Estado → `cancelada`; vehículo vuelve a `disponible`

### 3.8 Editar reserva

1. Botón "Editar" → `ReservaModal` con datos pre-cargados
2. Campos editables: fechas, horas, lugares, precio, notas, late checkout
3. `PATCH /api/v1/reservas/{id}`

### 3.9 Endpoints de Reservas y Alquileres

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/reservas` | Lista paginada con filtros (`q`, `estado`, `fecha`, `vehiculo_id`, `cliente_id`) |
| `POST` | `/reservas` | Crear reserva (retorna warnings de solapamiento) |
| `GET` | `/reservas/{id}` | Detalle con vehículo y cliente expandidos |
| `PATCH` | `/reservas/{id}` | Actualizar reserva |
| `POST` | `/reservas/{id}/cancelar` | Cancelar reserva |
| `POST` | `/alquileres` | Crear alquiler (checkout) |
| `GET` | `/alquileres/{id}` | Detalle del alquiler |
| `PATCH` | `/alquileres/{id}/checkin` | Registrar checkin |
| `PATCH` | `/alquileres/{id}/extender` | Extender fecha fin |
| `GET` | `/alquileres/{id}/preview-excedente` | Calcular cargo antes de confirmar checkin |
| `GET` | `/ocupacion` | Datos para el calendario (vehículos + eventos) |

---

## 4. Calendario de Ocupación

Ruta: `/ocupacion`

### 4.1 Vistas disponibles

| Vista | Disponible en | Descripción |
|-------|---------------|-------------|
| **Timeline** | Escritorio | Grid horizontal: vehículos en filas, días en columnas (120 días) |
| **Agenda** | Mobile y escritorio | Grilla mensual + panel del día seleccionado |

Auto-detección: si ancho < 768px → Agenda por defecto. Botón de toggle en header.

### 4.2 Vista Timeline

- **Filas:** vehículos activos (disponible, alquilado, reservado)
- **Columnas:** 120 días centrados en hoy
- **Celdas de reserva:** coloreadas por estado, muestran nombre del cliente
- **Alerta Amarilla (Checkout Demorado):** Si la reserva pasó a estado "activa" de forma automática (por cumplirse la hora) pero no tiene contrato de alquiler emitido (`tiene_alquiler: false`), se muestra una alerta (⚠️).
- **Hoy:** columna con fondo diferenciado
- **Drag & drop de filas:** reordenar vehículos, orden persiste en `localStorage`
- **Click en celda vacía:** abre `ReservaModal` con fecha y vehículo pre-seleccionados
- **Input "Ir a fecha":** al seleccionar fecha salta al mes y hace scroll horizontal a esa columna

### 4.3 Vista Agenda

- **Grid superior:** mes completo (L-D), puntos de color bajo días con reservas, hoy en círculo
- **Panel inferior:** al seleccionar un día muestra sus reservas:
  - Tarjeta con borde de color según estado
  - Nombre cliente, vehículo, patente, badge estado, hora inicio/fin
  - Badge "Late Checkout" si aplica
- **Botón "Nueva reserva"** en panel inferior pre-selecciona la fecha

### 4.4 Datos del endpoint de ocupación

`GET /api/v1/ocupacion?fecha_inicio=&fecha_fin=`

Retorna:
```json
{
  "vehiculos": [{ "id", "patente", "marca", "modelo", "estado", "activo" }],
  "eventos": [{ "id", "vehiculo_id", "tipo", "estado", "fecha_inicio", "hora_inicio",
                "fecha_fin", "hora_fin", "cliente_nombre", "lugar_entrega", "precio_total" }]
}
```

---

## 5. Dashboard Operativo (Ocupación)

Ruta: `/ocupacion` (raíz del sistema, `/dashboard` redirige aquí)

### 5.1 Estructura visual

El dashboard ahora está unificado bajo la vista de **Ocupación** y tiene **dos secciones:**

**Principal (flex-1):** Calendario de Ocupación completo (ver sección 4).

**Flujo del Día / Movimientos del Día (Inferior):**
Un panel expansible que centraliza y lista secuencialmente toda la actividad del día actual.
- **Doble tiempo (Real vs Prog):** Compara "Lo que se hizo" (Hora Real de la acción en el sistema, ej. creación de alquiler, pago) contra "Lo que hay que hacer" (Hora programada de la reserva).
- Muestra:
  - **Nuevas reservas:** Creadas en el día actual (con su hora de creación).
  - **Check-ins:** Entregas de vehículos programadas para hoy, y su hora real de entrega al cliente.
  - **Devoluciones:** Retornos vehiculares programados para hoy, y su hora real de retorno a base.
  - **Cobros y Pagos** ingresados en el día.
  - **Gastos** cargados en el día.

### 5.2 Endpoint

`GET /api/v1/reportes/dashboard`

```json
{
  "vehiculos_disponibles": 5,
  "vehiculos_alquilados": 3,
  "vehiculos_reservados": 1,
  "vehiculos_fuera_servicio": 0,
  "total_vehiculos_activos": 9,
  "ocupacion_porcentaje": 33.3,
  "flujo_del_dia": [
    {
      "tipo": "check_in",
      "hora": "14:15",
      "hora_real": "14:15",
      "hora_programada": "10:00",
      "descripcion": "Vehículo entregado #12 (Juan Perez)...",
      "monto": 25000.0,
      "reserva_id": 12
    }
  ]
}
```

Auto-refresh: `refetchInterval: 15_000` (cada 15 segundos) para que el panel de Flujo del día se mantenga vivo sin recargar la página.

---

## 6. Multas

Ruta: `/multas` | Tab en `/clientes/:id` → "Multas"

### 6.1 Flujo principal — buscador de responsable

Cuando llega una fotomulta y hay que identificar quién era el conductor:

1. Admin ingresa **Patente + Fecha de infracción + Hora (opcional)**
2. `GET /api/v1/multas/buscar?patente=X&fecha=Y&hora=Z`
3. El backend cruza la fecha/hora con el historial de alquileres del vehículo
4. Si encuentra alquiler activo en ese momento:
   - Muestra **cliente responsable:** nombre, DNI, período del alquiler, número de alquiler
5. Admin completa: monto, descripción, notas → confirma → `POST /api/v1/multas`
6. Multa queda en estado `pendiente`
7. Si no encuentra: mensaje claro, puede cargarla manualmente desde el perfil del cliente

### 6.2 Cargar multa desde el cliente

1. Tab "Multas" en `/clientes/:id` → `MultasTab`
2. Botón "Cargar multa"
3. `POST /api/v1/multas` con `cliente_id` pre-cargado

### 6.3 Estados de multa

```
pendiente → imputada → cobrada
              ↓
           apelando
```

| Estado | Descripción |
|--------|-------------|
| `pendiente` | Registrada, pendiente de gestión |
| `imputada` | Cargada formalmente al cliente |
| `cobrada` | Pagada y cerrada |
| `apelando` | En proceso de apelación |

### 6.4 Notificaciones automáticas

Las multas en estado `pendiente` generan alertas en el panel de notificaciones (sección 12, tipo `multa_pendiente`, urgencia media).

### 6.5 Endpoints de Multas

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/multas/buscar` | Buscar responsable por patente+fecha+hora |
| `GET` | `/multas` | Lista con filtros (estado, patente, cliente_id) |
| `POST` | `/multas` | Crear multa |
| `GET` | `/multas/{id}` | Detalle |
| `PATCH` | `/multas/{id}` | Cambiar estado, actualizar notas |
| `DELETE` | `/multas/{id}` | Baja lógica |

---

## 7. Extensión de Alquiler

### 7.1 Flujo

Cuando un cliente quiere extender su alquiler (más días):

1. En `/reservas` → fila con estado `activa` → botón **"Extender"**
2. `ExtenderModal` muestra fecha fin actual
3. Operador ingresa nueva fecha fin + hora fin
4. `PATCH /api/v1/alquileres/{id}/extender`

### 7.2 Lógica del backend

1. Verifica disponibilidad del vehículo en el período adicional
2. Si hay solapamiento con otra reserva → error `409` con info del conflicto
3. Si libre → actualiza `fecha_fin` y `hora_fin` en la reserva
4. Recalcula `precio_total` según nueva duración y tarifa aplicable (diaria/semanal/mensual)
5. Retorna `ExtenderResponse`:

```json
{
  "alquiler_id": 5,
  "fecha_fin_anterior": "2026-06-28",
  "fecha_fin_nueva": "2026-07-05",
  "duracion_dias_anterior": 7,
  "duracion_dias_nueva": 14,
  "precio_anterior": "105000.00",
  "precio_nuevo": "196000.00",
  "diferencia": "91000.00"
}
```

### 7.3 Pantalla de resultado

- Comparativo fecha anterior vs nueva
- Días adicionales + diferencia de precio
- Botón "Listo" → cierra y recarga lista

---

## 8. Combustible, Limpieza y Garantía en Check-in/Check-out

### 8.1 Nivel de combustible

Selector visual de 5 botones (no texto, sino colores visuales):

| Símbolo | Valor DB | Color |
|---------|----------|-------|
| Vacío | `0` | Rojo |
| ¼ | `25` | Naranja |
| ½ | `50` | Amarillo |
| ¾ | `75` | Lima |
| Lleno | `100` | Verde |

**Alerta en checkin:** si `combustible_llegada < combustible_salida` → aviso ⚠️ de posible recargo.

### 8.2 Estado de limpieza

Registrado tanto al salir (checkout) como al entrar (checkin):

| Valor | Descripción |
|-------|-------------|
| `limpio` | Condición normal |
| `sucio` | Suciedad ordinaria |
| `requiere_lavado_profundo` | Requiere lavado extra (puede generar cargo) |

### 8.3 Garantía / Depósito de seguridad

**Dónde se define:** en la **reserva** (al momento de crear o editar la reserva — ver sección 3.3b).

Opciones:
- `no_aplica` — sin garantía (default)
- `efectivo` — monto retenido en efectivo
- `transferencia` — dinero recibido por transferencia
- `tarjeta` — datos de la tarjeta registrados inline en la reserva

**Al hacer Check-in (entrega):**
La garantía definida en la reserva se muestra como panel informativo de solo lectura en el modal. No se puede modificar en este paso.

**Al hacer Check-out (devolución):**

| Decisión | Campo DB |
|----------|----------|
| Devuelta completa | `garantia_estado = 'devuelta'` |
| Retención parcial | `garantia_estado = 'ejecutada_parcial'` + `garantia_monto_devuelto` |
| Retener (siniestro) | `garantia_estado = 'retenida'` — queda como alerta pendiente |

Las garantías retenidas en alquileres finalizados aparecen en el panel de notificaciones (tipo `garantia_sin_resolver`, urgencia media).

---

## 9. Garantía con Tarjeta Integrada

Cuando se selecciona `garantia_tipo = 'tarjeta'` en el Checkout, el componente `GarantiaTarjetaSection` consulta automáticamente si el cliente tiene tarjeta registrada.

### 9.1 Cliente con tarjeta existente

`GET /api/v1/clientes/{id}/tarjeta` con `x-tarjeta-pin: Ubicar123`

1. Muestra preview visual de la tarjeta (gradiente azul, número enmascarado)
2. El operador elige:
   - **"Usar esta tarjeta"** → confirma sin modificar el perfil
   - **"Usar datos distintos"** → ingresa datos de referencia (no modifica perfil)

### 9.2 Cliente sin tarjeta

Alerta: "Este cliente no tiene tarjeta registrada". Opciones de registro:

**Modo Datos:**
- Nombre titular (forzado uppercase)
- DNI titular, número tarjeta (formato `1234 5678 9012 3456`), vencimiento MM/YY, CVV 3 dígitos
- `PUT /api/v1/clientes/{id}/tarjeta` con PIN header → se guarda en el perfil
- Luego muestra preview de la tarjeta recién guardada

**Modo Foto:**
- Dropzone de imagen (JPG/PNG/PDF)
- `POST /api/v1/clientes/{id}/documentos` con `tipo=otro`, `nombre='Foto tarjeta garantía'`
- Se guarda como documento del cliente

### 9.3 Conexión entre módulos

La sección de tarjeta en Checkout conecta con:
- **Perfil del cliente** (`/clientes/:id` → Tab Tarjeta)
- **Documentos del cliente** (si se subió foto)
- La tarjeta registrada queda disponible para futuros checkouts del mismo cliente

---

## 10. Tarjeta Bancaria del Cliente

Acceso: Tab "Tarjeta" en `/clientes/:id`

### 10.1 Seguridad por PIN

1. Al abrir el tab → pantalla de bloqueo con candado
2. Ingresar PIN: **`Ubicar123`**
3. Correcto → acceso; Incorrecto → error
4. Botón "Bloquear" para re-cerrar en cualquier momento
5. **Doble capa:**
   - Frontend verifica PIN antes de mostrar datos
   - Backend exige header `x-tarjeta-pin: Ubicar123` en todos los endpoints de tarjeta

### 10.2 Ver tarjeta

- Formato visual de tarjeta bancaria con gradiente azul
- Número enmascarado por defecto: `**** **** **** 1234`
- CVV oculto: `***`
- Toggle ojo para revelar número completo y CVV
- Datos mostrados: nombre titular, número, vencimiento (MM/AA), DNI titular

### 10.3 Crear / Editar

**Campos:**
- Nombre del titular (uppercase automático)
- Número de tarjeta (16 dígitos, formateado con espacios)
- Vencimiento (MM/AA — validación de formato)
- Código de seguridad (3 dígitos exactos)
- DNI del titular

`PUT /api/v1/clientes/{id}/tarjeta` → upsert (crea si no existe, actualiza si existe)

### 10.4 Eliminar

Confirmación → `DELETE /api/v1/clientes/{id}/tarjeta` → baja **física** (único caso en el sistema — dato sensible, one-per-client)

---

## 11. Registro de Servicios y Mantenimiento

Ruta: `/flota/:id` → Tab "Mantenimiento"

### 11.1 Panel de estado del vehículo

Muestra en tiempo real el estado del service:

| Color | Condición | Descripción |
|-------|-----------|-------------|
| 🟢 Verde | `restantes ≥ 1000 km` | Al día |
| 🟡 Amarillo | `0 < restantes < 1000` | Service próximo |
| 🔴 Rojo | `restantes ≤ 0` | Service vencido |

Datos mostrados: KM actual, KM próximo service, KM restantes.

### 11.2 Registrar nuevo servicio

**Tipos de servicio (con icono):**
- 🔧 Service general
- 🛢️ Cambio de aceite
- ⭕ Neumáticos
- 🔴 Frenos
- 🌀 Filtros
- ⚙️ Correa
- 🚗 Suspensión
- 📋 Otro

**Campos del formulario:**
- Tipo de servicio
- Fecha del service
- KM al realizar (pre-cargado con `km_actual` del vehículo)
- Próximo service en KM (auto-calculado: `km_realizado + km_entre_services`)
- Costo del service (opcional)
- Próxima fecha por calendario (opcional)
- Descripción/notas (taller, repuestos usados, etc.)

**Al guardar** (`POST /api/v1/vehiculos/{id}/servicios`):
1. Se crea el registro en tabla `servicios`
2. Si `proximo_km` especificado → `vehiculo.km_proximo_service = proximo_km`
3. Si no → `vehiculo.km_proximo_service = km_realizado + km_entre_services`
4. Badges en la tabla de flota se actualizan en tiempo real

### 11.3 Historial de servicios

Lista cronológica inversa de todos los servicios:
- Tipo con emoji, fecha, KM al momento, costo (si aplica)
- Descripción/notas
- Info del próximo service pactado
- Botón eliminar (baja lógica)

### 11.4 Conexión con notificaciones

Los vehículos con `km_actual >= km_proximo_service` o a menos de 1000 km generan alertas en el panel de notificaciones (tipos `service_vencido` y `service_proximo`).

### 11.5 Endpoints de Servicios

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/vehiculos/{id}/servicios` | Lista servicios activos |
| `POST` | `/vehiculos/{id}/servicios` | Crear servicio + sincronizar km |
| `PATCH` | `/servicios/{id}` | Actualizar servicio |
| `DELETE` | `/servicios/{id}` | Baja lógica |

---

## 12. Sistema de Notificaciones In-System

Acceso: Ícono de campana 🔔 en el footer del sidebar (visible en estado expandido y colapsado)

### 12.1 Tipos de alertas

| Tipo | Urgencia | Trigger | Navega a |
|------|----------|---------|----------|
| `checkout_pendiente` | 🔴 Alta | Reservas `confirmadas` con `fecha_inicio ≤ hoy` sin checkout | `/reservas` |
| `checkin_pendiente` | 🔴 Alta | Alquileres activos con `fecha_fin < hoy` | `/reservas` |
| `garantia_sin_resolver` | 🟡 Media | Alquileres finalizados con `garantia_estado = 'retenida'` | `/reservas` |
| `doc_vehiculo_vencido` | 🔴 Alta | Documento de vehículo con `vigencia_hasta < hoy` | `/flota/{id}` |
| `doc_vehiculo_por_vencer` | 🟡 Media | Documento de vehículo con vencimiento ≤ 30 días | `/flota/{id}` |
| `doc_cliente_vencido` | 🔴 Alta | Documento de cliente expirado | `/clientes/{id}` |
| `doc_cliente_por_vencer` | ⚪ Baja | Documento de cliente próximo a vencer (30 días) | `/clientes/{id}` |
| `service_vencido` | 🔴 Alta | `km_actual >= km_proximo_service` | `/flota/{id}` |
| `service_proximo` | 🟡 Media | `km_proximo_service - km_actual < 1000` | `/flota/{id}` |
| `multa_pendiente` | 🟡 Media | Multas en estado `pendiente` | `/multas` |
| `pago_pendiente` | 🔴 Alta | Reservas finalizadas con saldo deudor (pago pendiente) | `/caja` |

### 12.2 Badge visual

- **Sin alertas:** sin badge
- **Solo urgencia media/baja:** badge ámbar con número
- **Hay urgentes (alta):** badge rojo con número
- Si hay >99 alertas: muestra `99+`

### 12.3 Panel de alertas

1. Click en campana → panel flotante en card oscuro
2. Alertas agrupadas por categoría: 🚗 Checkouts · 🏁 Checkins · 🔒 Garantías · 📄 Docs vehículos · 👤 Docs clientes · 🔧 Mantenimiento · ⚠️ Multas
3. Cada alerta: dot de color (urgencia) + título + descripción
4. Click en alerta → navega a la sección y cierra el panel
5. Botón refresh manual (ícono circular)
6. Footer: "Actualización automática cada 60 segundos"

### 12.4 Implementación técnica

- **Sin tabla propia** — `GET /api/v1/notificaciones` computa todo on-demand:
  - Joins con `reservas`, `alquileres`, `documentos` (vehículos y clientes), `vehiculos`, `multas`
  - `vigencia_hasta` es `String(10)` ISO → comparaciones con strings `hoy_str` / `en_30_dias_str`
  - Estado de alquiler activo: `Reserva.estado == 'activa'` (no hay campo separado)
- **No hay "marcar como leído"** — las alertas desaparecen cuando la condición se resuelve
- `staleTime: 30_000` / `refetchInterval: 60_000`

---

## 13. Caja y Pagos

Ruta: `/finanzas` (tab "Caja") · Rutas legacy `/caja`, `/cuentas-corrientes`, `/echeqs` redirigen a `/finanzas`.

> **Unificación (rev. 8):** los tres módulos financieros (Caja, Echeqs, Cuentas Corrientes) viven bajo una única ruta `/finanzas` con un tab switcher en `FinanzasPage.tsx`. El item del sidebar dice "Finanzas". Los componentes `CajaPage`, `EcheqsPage` y `CuentasCorrientesPage` se renderizan dentro del tab activo.

### 13.1 Concepto

La Caja es el módulo central de cobros. **Cada cobro está asociado a un alquiler específico** (`alquiler_id`). No se registran cobros libres sin alquiler.

### 13.2 Vista diaria de caja

> **Implementación:** el hook `useCajaDia` desenvuelve el envelope `ok()` con `res.data.data`. Si se modifica este hook, recordar que el backend retorna `{ data: CajaData, message, success }` → acceder siempre con `.data.data`.

`GET /api/v1/pagos/caja/dia?fecha=YYYY-MM-DD`

Retorna:
```json
{
  "fecha": "2026-06-26",
  "total_ingresos": 85000.0,
  "total_egresos": 12000.0,
  "balance": 73000.0,
  "por_medio_pago": { "efectivo": 40000.0, "transferencia": 45000.0 },
  "cobros": [ PagoDetalladoResponse[] ],
  "gastos": [ GastoResponse[] ]
}
```

### 13.3 CajaPage (`/caja`)

- **Selector de fecha** (default: hoy) + botón refresh
- **Cards resumen:** Ingresos | Egresos | Balance del día
- **Desglose por medio de pago** con badges de colores:
  - Verde: efectivo · Azul: transferencia · Púrpura: tarjeta · Ámbar: cheque · Naranja: echeq · Gris: cuenta corriente
- **Lista de cobros** del día: cliente, patente, monto, medio, facturas, notas; botón eliminar
- **Lista de gastos de flota** del día: tipo, descripción, monto; link al vehículo
- **Formulario inline "Registrar cobro"** (botón en header)
- **Saldos Pendientes:** Panel de deudas por reservas y alquileres finalizados que no se han cobrado completamente, con botón rápido de cobro (disponible independiente de la fecha filtrada).

### 13.4 Registrar cobro

**Campos:**
- ID del alquiler
- Monto
- Medio de pago: efectivo / transferencia / tarjeta / cheque / echeq / **cuenta_corriente**
- Fecha (default: hoy)
- Con factura (checkbox)
- Notas (opcional)

`POST /api/v1/pagos`

**Comportamiento automático según medio de pago:**
- Si `medio_pago = cuenta_corriente`:
  - El backend busca (o crea) la `CuentaCorriente` del cliente del alquiler
  - Agrega un `MovimientoCuentaCorriente` tipo `debito` automáticamente
  - El saldo de la CC se descuenta

### 13.5 Eliminar cobro

`DELETE /api/v1/pagos/{id}` — hard delete (los pagos son log contable; la eliminación es intencional y reversible solo registrando nuevamente).

> **Nota:** Si el cobro fue por cuenta corriente, el movimiento de CC no se revierte automáticamente. El operador debe hacerlo manualmente desde el módulo de CC.

### 13.6 PagosTab (componente reutilizable)

Disponible en cualquier vista que tenga acceso a un `alquiler_id`. Muestra:
- **Resumen financiero:** cobrado / esperado / pendiente
- **Lista de cobros** del alquiler con badges de medio de pago
- **Formulario inline** para registrar nuevo cobro

### 13.7 Endpoints de Pagos

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/pagos` | Lista con filtros (alquiler_id, fecha_desde, fecha_hasta) |
| `GET` | `/pagos/caja/dia` | Vista diaria integrada (cobros + gastos) |
| `POST` | `/pagos` | Registrar cobro (con lógica de CC automática) |
| `DELETE` | `/pagos/{id}` | Eliminar cobro (hard delete) |

---

## 14. Echeqs

Ruta: `/finanzas` (tab "Echeqs") · Ruta legacy `/echeqs` redirige.

> **Bugfix (rev. 8):** `useEcheqs` desenvuelve correctamente el envelope `ok()` con `res.data.data`. Antes devolvía el envelope completo, lo que rompía el listado.

### 14.1 Concepto

Los echeqs son cheques electrónicos. Se registran en el sistema en dos situaciones:
- **Recibido** (`tipo=recibido`): un cliente nos paga con echeq
- **Emitido** (`tipo=emitido`): nosotros pagamos a un proveedor con echeq

### 14.2 Estados y transiciones

```
en_cartera ──→ depositado ──→ cobrado
     │              └──────→ rechazado
     └──────→ endosado ──→ cobrado
     └──────────────────→ rechazado
     └──────────────────→ [vence sin cobrar] → vencido
```

| Estado | Descripción |
|--------|-------------|
| `en_cartera` | Recibido, en poder de la empresa |
| `depositado` | Depositado en cuenta bancaria |
| `endosado` | Cedido a tercero (proveedor, etc.) |
| `cobrado` | Efectivamente cobrado |
| `rechazado` | Rechazado por el banco |
| `vencido` | Fecha de cobro pasada sin cobrar |

### 14.3 EcheqsPage (`/echeqs`)

- **Tabs:** "← Recibidos" | "→ Emitidos"
- **Filtro por estado** (dropdown)
- **Botón refresh**
- **Banner de alerta:** si hay echeqs próximos a cobrar (dentro de 7 días) en estado activo

**Tarjeta por echeq:**
- Monto (principal)
- Contraparte (cliente o proveedor)
- Banco + número de cheque
- Fecha de emisión / fecha de cobro
- Días restantes para cobro (con colores: verde/amarillo/rojo)
- Tipo (← Recibido / → Emitido) con badge de color
- Badge de estado actual
- Menú desplegable de transición de estado (contextual según estado actual)

### 14.4 Crear nuevo echeq

**Campos:**
- Tipo (recibido / emitido)
- Monto
- Contraparte (nombre del cliente o proveedor)
- Banco
- Número de cheque
- Fecha de emisión
- Fecha de cobro
- ID de alquiler (opcional — si es cobro de cliente)
- ID de gasto (opcional — si es pago a proveedor)
- Notas

`POST /api/v1/echeqs` → estado inicial `en_cartera`

### 14.5 Cambiar estado

`PATCH /api/v1/echeqs/{id}` con `{ "estado": "cobrado" }`

Los cambios de estado disponibles se muestran en un menú contextual que varía según el estado actual.

### 14.6 Integración con notificaciones

Los echeqs próximos a cobrar (≤ 7 días) generan alertas visibles en el panel de notificaciones. *(Integración completa pendiente — actualmente se muestra solo en EcheqsPage).*

### 14.7 Endpoints de Echeqs

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/echeqs` | Lista con filtros (tipo, estado) |
| `POST` | `/echeqs` | Crear echeq |
| `PATCH` | `/echeqs/{id}` | Actualizar estado y/o notas y/o fecha_cobro |

---

## 15. Cuentas Corrientes

Ruta: `/finanzas` (tab "Cuentas Corrientes") · Ruta legacy `/cuentas-corrientes` redirige · Tab en `/clientes/:id` → "Cta. Corriente"

> **Bugfix (rev. 8):** los tres hooks (`useCuentasCorrientes`, `useCuentaCorrienteCliente`, `useMovimientosCC`) ahora desenvuelven correctamente el envelope `ok()` con `res.data.data`.

### 15.1 Concepto

La cuenta corriente de un cliente registra su deuda o saldo a favor. Se **crea automáticamente** en dos situaciones:
- Al consultar `GET /api/v1/cuentas-corrientes/cliente/{id}` (lazy creation)
- Al registrar un cobro con `medio_pago = cuenta_corriente` en `/caja`

### 15.2 Lógica de saldo

| Movimiento | Efecto en saldo |
|------------|-----------------|
| `debito` | Resta (cliente debe más / usa crédito) |
| `credito` | Suma (cliente paga o recarga) |
| `saldo < 0` | El cliente tiene deuda |
| `saldo > 0` | El cliente tiene saldo a favor |
| `saldo = 0` | Sin deuda, sin saldo |

### 15.3 CuentasCorrientesPage (`/cuentas-corrientes`)

**Cards de resumen:**
- Con deuda: cantidad de clientes + total adeudado
- Con saldo a favor: cantidad
- En cero: cantidad

**Lista de clientes** con CC:
- Ordenada: deudores primero (saldo más negativo al tope)
- Columnas: nombre cliente, saldo (rojo si negativo, verde si positivo)
- Link al perfil del cliente
- Click en fila → abre modal de detalle

**Modal de detalle (por cliente):**
- Saldo actual con color y leyenda (debe / a favor / en cero)
- Formulario "Agregar movimiento manual" (tipo, concepto, monto, fecha, alquiler_id)
- Historial completo de movimientos (más reciente primero)

### 15.4 Tab en ClienteDetail (`CuentaCorrienteTab`)

- Saldo actual con color y descripción
- Botón "Movimiento manual"
- Formulario inline (tipo débito/crédito, concepto, monto, fecha)
- Historial de movimientos: tipo, concepto, fecha, monto (con signo y color)

### 15.5 Flujo automático desde Caja

Cuando se registra un cobro con `medio_pago = cuenta_corriente`:
1. Backend busca la CC del cliente del alquiler
2. Si no existe → la crea con saldo 0
3. Agrega `MovimientoCuentaCorriente` tipo `debito` con concepto "Cobro alquiler #{id}"
4. Descuenta el monto del saldo de la CC

### 15.6 Endpoints de Cuentas Corrientes

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/cuentas-corrientes` | Lista todas las CC con saldo y nombre cliente |
| `GET` | `/cuentas-corrientes/cliente/{id}` | Obtiene o crea la CC del cliente |
| `GET` | `/cuentas-corrientes/{id}/movimientos` | Historial de movimientos (reciente primero) |
| `POST` | `/cuentas-corrientes/{id}/movimientos` | Agregar movimiento manual |

---

## 16. Reportes y Estadísticas

Ruta: `/reportes`

### 16.1 Estructura

Dos tabs principales: **Ingresos** | **Flota**

Ambos incluyen selector de período y botón de export CSV.

### 16.2 Reporte de Ingresos (por año)

`GET /api/v1/reportes/ingresos?anio=YYYY`

**Cards de resumen anual:**
- Ingresos totales del año (verde)
- Egresos totales del año (rojo)
- Margen del año (azul / rojo si negativo)

**BarChart (recharts):** ingresos vs egresos por mes en barras grupales.

**Tabla de meses con actividad:**

| Mes | Ingresos | Egresos | Margen |
|-----|----------|---------|--------|
| Ene | $X | $X | $X |
| ... | ... | ... | ... |

**Solo muestra meses con al menos un movimiento.** Meses en cero no aparecen en la tabla.

**Export CSV:** descarga con columnas Mes, Ingresos, Egresos, Margen.

**Estructura del response:**
```json
{
  "anio": 2026,
  "meses": [{
    "mes": 1,
    "mes_label": "Ene",
    "ingresos": 120000.0,
    "egresos": 25000.0,
    "margen": 95000.0,
    "por_medio_pago": { "efectivo": 80000.0, "transferencia": 40000.0 }
  }]
}
```

### 16.3 Reporte de Flota (por período)

`GET /api/v1/reportes/flota?fecha_desde=YYYY-MM-DD&fecha_hasta=YYYY-MM-DD`

**Selector de período:** fecha desde / fecha hasta + botón refresh.

**BarChart horizontal:** ocupación % por vehículo (patente en eje Y, % en eje X). Colores distintos por vehículo.

**Tabla detalle:**

| Vehículo | Alquileres | Días | Ocupación % | Ingresos | Gastos | Margen |
|----------|-----------|------|-------------|----------|--------|--------|
| ABC123 | 5 | 18d | 🟢 60% | $X | $X | $X |

**Colores de ocupación:**
- 🟢 Verde: ≥ 70%
- 🟡 Amarillo: 40–69%
- Gris: < 40%

**Lógica de cálculo de ocupación:**
- Se calculan los días del período en que el vehículo estuvo alquilado (solapamiento real)
- `ocupacion_porcentaje = dias_alquilados / dias_periodo * 100` (cap 100%)
- Ingresos: suma de pagos de los alquileres del vehículo en el período
- Gastos: suma de gastos del vehículo en el período
- Ordenado por ocupación desc (más utilizado primero)

**Export CSV:** patente, marca, modelo, alquileres, días, ocupación%, ingresos, gastos, margen.

---

## 17. Cotizador

Ruta: `/cotizador`

**Estado actual: frontend-only, sin persistencia en BD.**

### 17.1 Flujo actual

1. Operador completa formulario:
   - Datos de empresa (nombre, dirección, teléfono)
   - Datos del cliente (nombre, DNI)
   - Vehículo (selector de flota o descripción libre)
   - Fechas inicio/fin
   - Precio por día
   - Descuento (%)
   - Notas
2. Sistema calcula: días × precio_día × (1 - descuento/100)
3. Botón "Generar PDF" → descarga PDF con formato comercial usando jsPDF + html2canvas
4. El PDF incluye logo de la empresa, datos del cotizador y totales

### 17.2 Lo que falta (pendiente)

- Backend: `POST /presupuestos`, `GET /presupuestos`, `PATCH /presupuestos/{id}`
- Estados: `borrador` → `enviado` → `aceptado` → `vencido`
- Conversión cotización → reserva (botón "Confirmar")
- Vinculación a cliente (historial de cotizaciones por cliente)
- Historial de presupuestos en tab del cliente

---

## 18. Arquitectura General

### Backend (`/backend`)

```
FastAPI 0.111
├── app/
│   ├── models/         # SQLAlchemy 2.0 — ORM, una tabla = un archivo
│   ├── schemas/        # Pydantic v2 — validación request/response
│   ├── repositories/   # Capa de acceso a datos (raw queries)
│   ├── services/       # Lógica de negocio (orquesta repos)
│   ├── routers/        # Endpoints HTTP (thin controllers)
│   ├── core/
│   │   ├── deps.py     # get_db, get_current_user (con DEV_BYPASS)
│   │   └── responses.py # helpers ok(), paginated()
│   └── domain/
│       └── enums.py    # Enums de negocio (TipoServicio, etc.)
└── alembic/            # Migraciones secuenciales
    └── versions/       # Un archivo por migración numerada
```

**Respuesta estándar de todos los endpoints:**
```json
{ "data": ..., "message": "...", "success": true }
```
Paginadas:
```json
{ "data": [...], "total": 100, "page": 1, "page_size": 20, "success": true, "message": "..." }
```

### Frontend (`/frontend/src`)

```
├── pages/              # Páginas principales (rutas)
│   ├── Dashboard.tsx
│   ├── flota/          # FlotaList, FlotaDetail
│   ├── clientes/       # ClientesList, ClienteDetail
│   ├── reservas/       # ReservasList, CheckoutModal, CheckinModal, ExtenderModal
│   ├── ocupacion/      # OcupacionPage (timeline + agenda)
│   ├── caja/           # CajaPage
│   ├── echeqs/         # EcheqsPage
│   ├── cuentas-corrientes/ # CuentasCorrientesPage
│   ├── reportes/       # ReportesPage
│   ├── multas/         # MultasPage
│   └── cotizador/      # CotizadorPage
├── components/
│   ├── layout/         # AppLayout, Sidebar, MobileNav, NotificacionesPanel
│   ├── flota/          # MantenimientoTab, DocumentosTab, GastosTab, etc.
│   ├── clientes/       # ClienteFormDialog, ConductoresTab, TarjetaTab,
│   │                   # ClienteHistorial, MultasTab, CuentaCorrienteTab
│   ├── reservas/       # GarantiaTarjetaSection
│   ├── pagos/          # PagosTab
│   └── shared/         # ConfirmDialog, EmptyState, PageHeader
├── hooks/              # TanStack Query (uno por dominio)
│   ├── useVehiculos.ts / useServicios.ts / useGastos.ts
│   ├── useClientes.ts / useDocumentos.ts
│   ├── useReservas.ts / useAlquileres.ts
│   ├── useMultas.ts
│   ├── usePagos.ts / useEcheqs.ts / useCuentasCorrientes.ts
│   ├── useDashboardStats.ts / useReportes.ts
│   └── useNotificaciones.ts
├── lib/
│   ├── api.ts          # Axios con base URL configurable (VITE_API_URL)
│   ├── utils.ts        # cn, formatCurrency, formatDate, extractError, etc.
│   └── constants.ts    # Labels, colores, NAV_ITEMS
└── types/index.ts      # Tipos TypeScript compartidos con el backend
```

---

## 19. Convenciones y Reglas de Negocio Globales

### Regla "Nunca eliminar"

Todas las entidades de dominio usan **baja lógica** (`activo=False`). El registro permanece en BD con su historial completo y puede reactivarse.

**Excepción:** `TarjetaCliente` usa baja física (dato sensible, one-per-client).
**Excepción:** `Pago` usa hard delete (log contable intencional).
**Excepción:** `Gasto` usa hard delete.

### Almacenamiento de archivos

```
uploads/
├── vehiculos/{id}/
│   ├── foto.{ext}
│   └── documentos/{doc_id}-{uuid}.{ext}
└── clientes/{id}/
    └── documentos/{doc_id}-{uuid}.{ext}
```

Servidos vía `GET /static/...` desde FastAPI StaticFiles.
*(Cloudflare R2 diferido — el swap no requiere cambiar lógica de negocio).*

### Autenticación

`DEV_BYPASS_AUTH=true` → todos los endpoints autenticados devuelven un usuario hardcodeado (id=1, rol=admin). Clerk se integra cuando corresponda cambiando únicamente `deps.py`.

### Tarjeta de cliente — PIN de acceso

PIN fijo: `Ubicar123`. Se envía en header `x-tarjeta-pin` en todos los endpoints `/clientes/{id}/tarjeta`. Cambiar requiere modificar `settings.TARJETA_PIN` en backend y la constante del frontend.

### Tarifas: lógica de selección

- `< 7 días` → tarifa `diaria`
- `7–29 días` → tarifa `semanal`
- `≥ 30 días` → tarifa `mensual`
- Orden de búsqueda: tarifa específica del vehículo → tarifa global

### Control 24h: gracia de 40 minutos

Si la devolución supera la hora acordada:
- ≤ 40 minutos de excedente → sin cargo
- > 40 minutos → se cobran las horas netas (excedente - gracia), a razón de `tarifa_diaria / 24` por hora

### Estados de vehículo — transiciones automáticas

| Acción | Transición |
|--------|------------|
| Confirmar reserva | disponible → reservado |
| Checkout | reservado / disponible → alquilado |
| Checkin | alquilado → disponible (o en_transicion si <4h) |
| Baja lógica | cualquiera → fuera_de_servicio |

---

## 20. Migraciones de Base de Datos

### Cadena actual de migraciones

```
e9cb23fe670f (initial_schema)
    → b7136e52843d (add_orden_to_vehiculos)
    → c331c7365da8 (add_foto_key_to_vehiculo)
    → a5a4d5ad50e5 (rename_documento_url_archivo)
    → ee30672ffb67 (indice_busqueda_clientes)
    → 008_pre_fase3_estado_real
    → 009_documentos_cliente_tarjeta
    → 010_multas
    → 011_alquiler_limpieza_garantia
    → 012_servicios
    → 013_caja_echeq_cc
    → 014_cliente_licencia_nullable
    → 015_garantia_reserva  ← última (aplicada 2026-06-26)
```

### Tablas creadas por migración

| Migración | Tablas / Cambios |
|-----------|-----------------|
| `initial_schema` | clientes, usuarios, vehiculos, conductores_adicionales, cuentas_corrientes, documentos, gastos, presupuestos, reservas, tarifas, alquileres, contratos, echeqs, movimientos_cuenta_corriente, pagos |
| `add_orden_to_vehiculos` | columna `orden` en vehiculos |
| `add_foto_key_to_vehiculo` | columna `foto_key` en vehiculos |
| `rename_documento_url_archivo` | renombra `url_archivo` → `archivo_url` en documentos |
| `indice_busqueda_clientes` | índice GIN para búsqueda full-text |
| `008_pre_fase3_estado_real` | columnas de estado real en reservas/alquileres |
| `009_documentos_cliente_tarjeta` | `cliente_id` en documentos, tabla `tarjetas_cliente` |
| `010_multas` | tabla `multas` |
| `011_alquiler_limpieza_garantia` | columnas limpieza/garantía/excedente en alquileres |
| `012_servicios` | tabla `servicios`, enum `tipo_servicio` |
| `013_caja_echeq_cc` | ADD VALUE a enum `estado_echeq` (en_cartera, depositado, endosado) + `cuenta_corriente` a enum `medio_pago` |
| `014_cliente_licencia_nullable` | campos de licencia de cliente pasan a nullable |
| `015_garantia_reserva` | 5 columnas en `reservas`: `garantia_tipo`, `garantia_monto`, `garantia_tarjeta_numero`, `garantia_tarjeta_vencimiento`, `garantia_tarjeta_titular` |
| `016_pago_intent_reserva` | 5 columnas de información de pago en `reservas`: `forma_pago_prevista`, `estado_pago`, `anticipo_monto`, `anticipo_fecha`, `anticipo_medio_pago` |

### Cómo aplicar

```bash
cd backend
.venv\Scripts\python.exe -m alembic upgrade head
```

Requiere PostgreSQL corriendo en `localhost:5432`, base de datos `ubicar_rent`.

---

## 21. Pendiente / Lo que falta

### Crítico (hacer antes de usar en producción)

| # | Tarea | Detalle |
|---|-------|---------|
| 1 | **Deploy en Railway** | Backend (FastAPI) + Frontend (Vite build) + PostgreSQL |

### Módulos pendientes de implementar

| Módulo | Prioridad | Qué falta |
|--------|-----------|-----------|
| **Reservas online (web pública)** | Alta | Frontend público + endpoints `/public/*` + email transaccional + flujo de aprobación. Ver `flujos_leng_natural.md` § B.1 |
| **Precios por fechas especiales** | Alta | Modelo de períodos de precio + lógica de aplicación en cotización + UI de gestión. Ver `flujos_leng_natural.md` § B.2 |
| **PagosTab en ReservasList** | Alta | Botón "Ver cobros" en fila de reserva activa/finalizada que abre el `PagosTab` |
| **F5: Contratos digitales** | Media | Generación PDF firmado, bloqueo de checkout sin contrato, historial de contratos |
| **F8: Cotizador backend** | Media | Persistencia en BD, estados, conversión a reserva, historial por cliente |
| **F9: Alertas automáticas (APScheduler)** | Baja | Email / WhatsApp en vencimientos, devoluciones del día, echeqs próximos |
| **Echeqs → Notificaciones** | Baja | Integrar alertas de echeqs próximos en el panel de notificaciones |

### Decisiones operativas pendientes (a confirmar con dueño)

Detalle completo en `flujos_leng_natural.md` § A:

- **Cuentas corrientes:** límite de crédito, estado de cuenta periódico, qué cuentas aplican (sólo empresas o también particulares).
- **Echeqs:** ¿el cobro impacta Caja al recibirlo o al cobrarlo realmente? Manejo automático de rechazos. Reportes específicos.
- **Cobro de extensión de alquiler:** hoy se recalcula el precio pero no hay flujo de cobro definido. ¿Se cobra al extender o al check-in? ¿Pasa a "Saldos pendientes" automático?
- **Estados visibles del vehículo:** badge simplificado a "En uso" / "Disponible". Decidir si agregar tercer estado para "Fuera de servicio".
- **Anulación vs eliminación de pagos:** hoy es hard delete; evaluar si pasarlo a anulación con motivo registrado.

### Técnico diferido

| Item | Estado | Notas |
|------|--------|-------|
| Auth real (Clerk) | Diferido | `DEV_BYPASS_AUTH=true` funciona en dev |
| Storage R2 | Diferido | Hoy usa filesystem local bajo `uploads/` |
| Email (Resend) | No iniciado | Para alertas automáticas de F9 |
| TypeScript strict errors | Menores | Algunos type mismatches en componentes pre-existentes |

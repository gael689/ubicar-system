# Plan Maestro — Puesta a punto final de Ubicar Rent + Motor de Reservas Web

**Fecha:** 2026-07-25
**Alcance:** revisión integral del sistema actual, corrección de deuda técnica crítica, cierre de módulos financieros (Cuenta Corriente + Echeqs + Recibos + Facturas), motor completo de Alertas y Notificaciones, mejoras de UI/UX, y arquitectura de datos para el sistema de reservas web con pasarela de pagos.
**Regla de oro del proyecto que sigue vigente:** nunca se elimina físicamente una entidad de dominio. Baja lógica + historial + reactivación.

**Documentos hermanos:**
- **`docs/DECISIONES.md`** — decisiones de producto confirmadas y las que siguen abiertas. **Manda sobre el resto**: si algo acá contradice una decisión, gana la decisión.
- **`docs/ANALISIS_CICLO_RESERVA.md`** — análisis fino del ciclo operativo: check-out, check-in tardío, excedentes, precios, clientes empresa/particular y vencimientos. Contiene los bugs P0 confirmados con archivo y línea.
- **`docs/CASOS_DE_USO.md`** — registro trackeable de los ~195 casos de uso con ID, estado y prioridad. Es la lista de trabajo.
- **`docs/PLAN_FRONTEND_UX.md`** — rediseño de la interfaz: formularios por pasos, componente `<Wizard>`, check-in como liquidación, navegación y consistencia visual.

---

## 0. Contexto del rubro — qué exige un rent-a-car y qué de eso todavía no está

Antes de proponer cambios, vale fijar qué es lo que este negocio realmente necesita, porque varias de las piezas faltantes no son "features lindas": son las que evitan perder plata.

| Necesidad del rubro | Estado en Ubicar hoy |
|---|---|
| Saber qué auto está dónde y con quién, hoy | ✅ Calendario de ocupación + Dashboard |
| Cobrar y saber quién debe | ⚠️ Parcial — Caja sí, deuda por cliente frágil |
| Cobrar a empresas a 30/60/90 días | ❌ No hay condición de pago ni vencimientos |
| Poder ejecutar la garantía cuando el auto vuelve dañado | ❌ No hay parte de daños con fotos |
| Imputar multas al conductor correcto | ✅ Buscador por patente+fecha+hora |
| No quedarse sin VTV / póliza / service | ✅ Se detecta, ❌ nadie se entera automáticamente |
| Facturar y tener el comprobante atado al cobro | ❌ Sólo un booleano `con_factura` |
| Darle un recibo al cliente que paga de a poco | ❌ No existe |
| Vender por categoría con precio estacional | ❌ Tarifas por duración, sin estacionalidad ni categorías |
| Vender online sin sobreventa | ❌ El endpoint público devuelve datos incorrectos |
| Contrato firmado antes de entregar la llave | ❌ Modelo existe, generación es un TODO |
| Saber quién hizo cada movimiento de plata | ❌ No hay audit log y el usuario está hardcodeado |

Los conceptos del rubro que el modelo de datos todavía no conoce y que van a hacer falta sí o sí: **categoría de vehículo**, **sucursal**, **adicionales**, **franquicia/deducible del seguro**, **parte de daños**, **peajes**, **cargo por devolución en otra sucursal (one-way)**, **política de cancelación / no-show**, **buffer entre alquileres**, **temporada alta/baja**.

---

## 1. Diagnóstico — qué está construido y qué tan conectado está

### 1.1 Mapa real de módulos

> **⚠️ Esta sección es el diagnóstico ORIGINAL del 2026-07-25.** Se conserva como registro del punto de partida. El estado actualizado está en la columna "Hoy" — revisado el 2026-07-27, al cierre de la Fase 3-bis.

**Backend** (`backend/app/`): al 2026-07-27 son **24 routers, 21 modelos, 32 migraciones** (head: `034_echeq_reserva`). En el diagnóstico original eran 19/17/16.

| Módulo | Veredicto original (25/07) | Hoy (27/07) |
|---|---|---|
| Flota | Sólido | ✅ + vencimientos VTV/póliza como campos propios (F3) |
| Clientes | Sólido | ✅ 9 tabs (sumó CC, Recibos, Comprobantes, **Echeqs**) |
| Reservas / Alquileres | El corazón, sano | ✅ + condición de pago, descuentos auditados, seña, cargos de cierre |
| Ocupación | Muy bueno | ✅ calendario a pantalla completa sin bordes (F3-bis) |
| Dashboard | Bueno | ✅ Flujo del día como módulo fijo + modal (F3-bis) |
| Multas | Sólido | ✅ conectado a CC, sin opción de eliminar |
| Servicios/Mantenimiento | Bueno | ✅ + notificaciones por km y por fecha |
| Caja / Pagos | ⚠️ Ver 2.4 | ✅ `DELETE` es anulación con contra-asiento |
| Echeqs | 🔴 **Isla** | ✅ **Conectado** — cliente, CC, reserva, alquiler + 4 reglas de notificación |
| Cuentas Corrientes | 🔴 Sin ledger | ✅ **Ledger inmutable** con `saldo_posterior`, vencimientos y anulación |
| Notificaciones | Hecho, ver §4 | ✅ 25 reglas + scheduler 08:00 ART + digest email + página propia |
| Reportes | Bueno | ✅ (bug del envelope corregido en F3-bis) |
| Recibos | Hecho, ver 3.6 | ✅ sin cambios |
| Facturas / Comprobantes | 🔴 A construir | ✅ **Construido** (carga manual + PDF + vínculo a CC) |
| Cotizador | Isla deliberada | ✅ sigue siendo isla a propósito (+ categoría Furgón) |
| Contratos | 🔴 Bloqueante | 🔴 **Sigue pendiente** — `routers/contratos.py` es un stub de 19 líneas. Es la Fase 4 |
| Público (web) | 🔴 A construir | 🔴 **Sigue pendiente** — `routers/public.py`, 41 líneas. Es la Fase 6 |

### 1.2 Las tres islas — ✅ las tres cerradas

El diagnóstico original identificó tres desconexiones. **Al 2026-07-27 no queda ninguna abierta:**

1. ~~**Echeq ↔ Cliente ↔ Cuenta Corriente.**~~ ✅ **Cerrada en dos etapas.** El 26/07 (ítem 17, migración 020) el echeq ganó `cliente_id`, ciclo de vida completo y generación de movimiento en CC. El 27/07 (F3-bis, migración 034) se cerró el último tramo: el echeq **nace desde la reserva** cuando el medio de pago elegido es echeq (vía `Echeq.reserva_id`, porque el `Alquiler` todavía no existe), puede quedar como borrador con datos incompletos, y aparece en la ficha del cliente en su propia pestaña. El síntoma original —"si un cliente te paga con 3 echeqs, no hay forma de verlo desde su ficha"— ya no aplica.
2. ~~**Multas ↔ Cuenta Corriente.**~~ ✅ Cerrada el 26/07: imputar una multa genera el débito; resolverla como cobrada/bonificada genera el crédito o el contra-asiento.
3. ~~**Notificaciones ↔ realidad.**~~ ✅ Cerrada en la Fase 2 (26/07): tabla persistida con deduplicación, motor único de 25 reglas, scheduler real a las 08:00 ART, digest por email y página de historial. `services/alertas.py` (el generador huérfano) fue eliminado.

---

## 2. Bugs y deuda técnica confirmada (arreglar antes de agregar nada)

### 2.1 🔴 CRÍTICO — El endpoint de notificaciones crashea

`backend/app/routers/notificaciones.py`, bloque 8 (pagos pendientes):

```python
if saldo_pendiente > 0 and r.fecha_fin < hoy_str:
    dias_vencido = (hoy - datetime.strptime(r.fecha_fin, "%Y-%m-%d").date()).days
```

`Reserva.fecha_fin` es un `Date` de SQLAlchemy → devuelve `datetime.date`. `hoy_str` es un `str`. En Python 3, `date < str` lanza `TypeError`. **En cuanto exista un solo alquiler finalizado, la campana de notificaciones deja de funcionar por completo** — se cae el endpoint entero, no sólo ese bloque. La línea siguiente tiene el mismo problema (`strptime` sobre un `date`).

Causa raíz: **mezcla de tipos de fecha en todo el sistema.** `Reserva` usa `Date`/`Time` reales, pero `Pago.fecha`, `Echeq.fecha_cobro`, `MovimientoCC.fecha`, `Cliente.licencia_vencimiento` y `Documento.vigencia_hasta` son `String(10)`. Funciona por comparación lexicográfica ISO hasta que cruzás los dos mundos, que es exactamente lo que pasó acá.

**✅ Resuelto (Fase 2, 2026-07-26):** el router entero fue reemplazado. El endpoint ya no computa nada on-demand — lee de la tabla `notificaciones`, sin comparaciones de tipos mezclados.

### 2.2 🔴 CRÍTICO — El scheduler de alertas nunca arranca

`services/alertas.py` define `iniciar_scheduler(app)` con un `CronTrigger(hour=8, minute=0)`. **No lo llama nadie.** `main.py` no tiene evento de startup ni lifespan. `apscheduler==3.10.4` está en `requirements.txt` sin usarse. Y aunque arrancara, el job sólo hace `print(f"[Scheduler] {len(alertas)} alertas generadas")` — hay un `# TODO: enviar alertas` en el lugar del envío.

Además, si arrancara: `CronTrigger(hour=8)` usa la timezone del proceso. En un contenedor en UTC eso son las 5 de la mañana en Argentina. Hay que fijar `ZoneInfo("America/Argentina/Buenos_Aires")` explícito.

**✅ Resuelto (Fase 2, 2026-07-26):** `services/alertas.py` eliminado. `main.py` ahora define un `lifespan` que arranca `AsyncIOScheduler(timezone=ZoneInfo("America/Argentina/Buenos_Aires"))` con el `CronTrigger` fijado a esa misma TZ explícitamente — exactamente la trampa que este punto advertía.

### 2.3 🟠 Dos sistemas de alertas paralelos y divergentes

| | `services/alertas.py` (huérfano) | `routers/notificaciones.py` (en uso) |
|---|---|---|
| Docs por vencer | ✅ 7/15/30 días | ✅ 30 días |
| Licencias de clientes | ✅ | ❌ |
| **Echeqs próximos** | ✅ 7 días | ❌ |
| Checkouts / checkins pendientes | ❌ | ✅ |
| Garantías sin resolver | ❌ | ✅ |
| Service | ❌ | ✅ |
| Multas | ❌ | ✅ |
| Pagos pendientes | ❌ | ✅ (roto, ver 2.1) |

Hay que unificar en un solo motor. Es la base del pedido de "módulo completo de alertas".

**✅ Resuelto (Fase 2, 2026-07-26):** un solo catálogo de 25 reglas en `domain/notificaciones_reglas.py`, superset de ambos sistemas anteriores. Detalle en `docs/CATALOGO_NOTIFICACIONES.md`.

### 2.4 🟠 El saldo de cuenta corriente es un número mutable sin auditoría

`routers/cuentas_corrientes.py`:

```python
if payload.tipo == "credito":
    cc.saldo = float(cc.saldo) + payload.monto
else:
    cc.saldo = float(cc.saldo) - payload.monto
```

Problemas:
- El movimiento no guarda `saldo_posterior`. Si algo falla o se corrige, el saldo queda desincronizado y **no hay forma de detectarlo ni de reconstruirlo**.
- Los movimientos no tienen `activo` ni anulación → si se carga mal, la única salida es borrar, lo que viola la regla de "nunca eliminar".
- No hay `fecha_vencimiento` ni `condicion` — que es exactamente lo que se pidió desplegar.
- El único vínculo es `alquiler_id`. No hay FK a pago, echeq, multa ni comprobante.
- `float` para plata. Debería ser `Decimal` de punta a punta (el modelo usa `Numeric(12,2)`, pero el router lo castea a `float` y ahí se pierde precisión).

### 2.5 🟠 Los pagos se borran físicamente y no revierten la cuenta corriente

`DELETE /pagos/{id}` hace hard delete ("los pagos son log contable" dice el comentario — pero un log contable es justamente lo que **no** se borra). Y si ese pago fue `medio_pago=cuenta_corriente`, borrarlo **no revierte** el `MovimientoCuentaCorriente` que generó. Queda deuda fantasma.

Debe ser: anulación con contra-asiento, no borrado.

### 2.6 🟠 `Pago` no puede existir sin alquiler

`Pago.alquiler_id` es `NOT NULL`. Consecuencias: no se puede registrar un pago a cuenta, ni una seña de una reserva web todavía sin alquiler, ni una cancelación de deuda vieja de cuenta corriente, ni un pago de una multa. Necesita `cliente_id` propio y `alquiler_id` nullable.

### 2.7 🟡 Performance de `/notificaciones`

El bloque 8 trae **todos los alquileres finalizados de la historia** y suma sus pagos en Python. Con polling cada 60 segundos desde el frontend, a los 2 años de operación esto es una consulta cara repetida 1.440 veces por día por usuario. Con la tabla de notificaciones real (sección 4) esto pasa a ser un `SELECT` sobre índice.

**✅ Resuelto (Fase 2, 2026-07-26):** `GET /notificaciones` ahora es un `SELECT` sobre `notificaciones` con índice en `estado` — el cálculo pesado (`saldo_pendiente_alquiler` y las demás 24 reglas) sólo corre una vez al día en el motor, no en cada polling de la campana. La regla en sí (`saldo_pendiente_al_finalizar` en `notificaciones_reglas.py`) conserva la misma limitación N+1 de origen (trae todos los alquileres finalizados y suma pagos en Python) — pero ahora paga ese costo una vez por día, no 1.440 veces.

### 2.8 🟡 `/public/disponibilidad` devuelve datos incorrectos

`routers/public.py` filtra por `Vehiculo.estado == 'disponible'` — el estado **actual** del vehículo. Recibe `fecha_inicio` y `fecha_fin` y **los ignora**. Un auto alquilado hoy pero libre el mes que viene aparece como no disponible; un auto libre hoy pero reservado para esas fechas aparece como disponible. La lógica correcta ya existe en `domain/solapamientos.py` y no se usa. Si esto se expone a la web tal cual, hay sobreventa el primer día.

### 2.9 🟠 Auth desactivada + `usuario_id` ficticio

`DEV_BYPASS_AUTH=true`. Todos los `cobrado_por`, `usuario_id`, `cargado_por`, `decidido_por` se están grabando con un usuario fijo. **Decidido: se resuelve con Clerk** (ya hay un `docs/AUTH_CLERK.md` en el repo y skills del stack disponibles).

Subo la prioridad respecto del roadmap original por dos motivos: (1) es prerequisito duro antes de exponer cualquier endpoint público que escriba reservas, y (2) con recibos y ledger de cuenta corriente entrando en la Fase 1, cada documento que se emita mientras tanto queda sin autor real. Va como **Fase 3.5**, antes de contratos.

Detalle del plan de Clerk en la sección 9.

Nota relacionada: el PIN de la tarjeta de crédito del cliente (`Ubicar123`) está hardcodeado en el backend y viaja en un header. Con Clerk hay roles reales y eso pasa a ser un permiso, no una constante compartida.

### 2.10 🟡 Limpieza menor

- `pages/clientes/` tiene `List.tsx`/`Detail.tsx` **y** `ClientesList.tsx`/`ClienteDetail.tsx`. Los dos primeros están muertos (`App.tsx` sólo importa los segundos).
- `components/cotizador/` tiene 6 variantes de preview (`CotizacionPreview1/1b/2/3/4`). Elegir una y borrar el resto.
- `pages/contratos/` está vacío.
- Errores de TypeScript preexistentes listados en `PROGRESO.md` sin resolver.
- **Migraciones 010→016 sin aplicar** según `PROGRESO.md`. Verificar con `alembic current` antes de cualquier cosa.

---

## 3. Bloque A — Cuenta Corriente, Echeqs y Facturas como un solo sistema

Este es el pedido central: *"Echeqs iría de la mano con cuenta corriente pero siempre relacionado con el cliente"*. La forma correcta de resolverlo es que **la cuenta corriente sea el libro mayor del cliente**, y que pagos, echeqs, multas, alquileres y facturas sean todos generadores de asientos en ese libro.

### 3.1 Modelo conceptual

```
                        ┌─────────────┐
                        │   CLIENTE   │
                        └──────┬──────┘
                               │ 1:1
                        ┌──────▼──────────────┐
                        │ CUENTA CORRIENTE    │  saldo = Σ movimientos
                        │ condicion_pago      │  limite_credito
                        └──────┬──────────────┘
                               │ 1:N
              ┌────────────────▼──────────────────┐
              │   MOVIMIENTO (asiento)            │
              │   fecha · concepto · condición    │
              │   fecha_vencimiento · debe/haber  │
              │   saldo_posterior · anulado_por   │
              └───┬─────┬─────┬─────┬─────┬───────┘
                  │     │     │     │     │
         ┌────────┘     │     │     │     └────────┐
         ▼              ▼     ▼     ▼              ▼
    ALQUILER         PAGO  ECHEQ  MULTA      COMPROBANTE
   (genera débito) (crédito)(crédito  (débito)   (factura/NC)
                            diferido)
```

**Regla:** ningún saldo se toca a mano. El saldo es siempre la suma de los asientos. Todo asiento es inmutable — se corrige con un contra-asiento, nunca editando ni borrando.

### 3.2 Convención de signos (decidir y documentar de una vez)

Propuesta, alineada con la práctica contable argentina:

- **DEBE (débito)** = el cliente **nos debe más**. Alquiler facturado, multa imputada, nota de débito.
- **HABER (crédito)** = el cliente **nos debe menos**. Pago recibido, echeq acreditado, nota de crédito.
- **Saldo positivo = deuda del cliente** (saldo deudor).
- **Saldo negativo = saldo a favor del cliente** (anticipo).

⚠️ Hoy el frontend usa la convención **inversa** (`CuentaCorrienteTab.tsx`: negativo = deuda). Hay que elegir una y unificar. Recomiendo la de arriba porque es la que van a leer Franco y Martín en cualquier otro papel contable, pero es una decisión de ellos.

### 3.3 Cambios de modelo — Cuenta Corriente

**`cuentas_corrientes`** — agregar:

| Campo | Tipo | Para qué |
|---|---|---|
| `condicion_pago` | enum: `contado`, `cta_cte_15`, `cta_cte_30`, `cta_cte_60`, `cta_cte_90` | Default del cliente. **Pedido explícito.** |
| `limite_credito` | Numeric(12,2) nullable | Alerta al superarlo |
| `bloqueada` | bool | No permitir nuevas reservas a CC si está bloqueada |
| `observaciones` | Text | |

**`movimientos_cuenta_corriente`** — agregar:

| Campo | Tipo | Para qué |
|---|---|---|
| `fecha` | **`Date`** (migrar de String) | Consistencia de tipos |
| `condicion` | enum igual que arriba | **Pedido explícito** — se despliega por movimiento |
| `fecha_vencimiento` | `Date` | **Pedido explícito** — la "fecha de pago". Se calcula de `fecha + condición` pero es editable |
| `saldo_posterior` | Numeric(12,2) | Auditoría, permite detectar desincronización |
| `pago_id` | FK nullable | Trazabilidad |
| `echeq_id` | FK nullable | **La unión echeq ↔ CC** |
| `multa_id` | FK nullable | Cierra la isla de multas |
| `comprobante_id` | FK nullable | Factura asociada |
| `reserva_id` | FK nullable | Además de alquiler_id |
| `anulado` | bool | En lugar de borrar |
| `anulado_por_movimiento_id` | FK self nullable | El contra-asiento |
| `creado_por` | FK usuario | Auditoría |
| `created_at` | DateTime | |

**✅ Hecho (2026-07-26), migración 019.** Todo lo de arriba implementado excepto `comprobante_id` (espera a que exista la tabla `comprobantes`, sección 3.6). Nuevo módulo puro `domain/cuenta_corriente.py` con `signo_movimiento()`, `aplicar_movimiento()` y `calcular_vencimiento()` — 11 tests unitarios. Nuevo endpoint `POST /cuentas-corrientes/movimientos/{id}/anular` (contra-asiento, nunca edita ni borra el original).

**El signo se invirtió (D-01)** en `add_movimiento` y en la rama `cuenta_corriente` de `create_pago` — antes un movimiento "debito" restaba del saldo (convención vieja: negativo = deuda); ahora suma (positivo = deuda). Se corrigió también en el frontend (`CuentaCorrienteTab.tsx`, `CuentasCorrientesPage.tsx`), que mostraba la polaridad vieja.

**`DELETE /pagos/{id}` para pagos en cuenta corriente** ya no bloquea (como en el commit anterior): ahora encuentra el movimiento vinculado por `pago_id` y lo anula con un contra-asiento automático antes de borrar el `Pago`. Se encontró y arregló un bug real acá: la FK `movimientos_cuenta_corriente.pago_id` impedía el `DELETE FROM pagos` porque el `UPDATE` que desvincula la referencia no se había *flusheado* todavía — sin un `db.flush()` explícito antes del `db.delete(pago)`, Postgres rechazaba el borrado con `ForeignKeyViolation`.

**✅ Automatismo completo agregado (2026-07-26, mismo día).** Confirmado con el usuario: **todo checkout genera un débito automático** por `precio_total + cargo_late_checkout`, y **todo cobro** (anticipo, cobro en checkout, cobro en check-in, excedente del check-in) **genera el crédito o débito correspondiente** — sin importar el medio de pago. `medio_pago='cuenta_corriente'` deja de ser un caso especial: ahora se comporta igual que cualquier otro medio (crédito), porque el débito ya se generó solo en el checkout. Ver el análisis completo y la justificación para este rubro en `docs/VALIDAR_CON_DUENOS.md` — **pendiente el ok final de Franco/Martín** antes de darlo por definitivo, aunque ya está implementado y probado.

Nuevo `services/cuenta_corriente_service.py` — punto único para generar movimientos (`registrar_movimiento`, `anular_movimiento`, `anular_por_pago`), usado por `routers/cuentas_corrientes.py`, `routers/pagos.py` y `services/alquiler_service.py`. Evita reimplementar la lógica de signos en cada call site.

Verificado en vivo el flujo completo: reserva con anticipo $20.000 + precio $50.000 → checkout con cobro de $10.000 → saldo $20.000 (50.000 − 20.000 − 10.000, exacto) → check-in con excedente "1 día más" ($60.000) + cobro de $15.000 → saldo final $65.000 (20.000 + 60.000 − 15.000, exacto). Los 3 movimientos del checkout confirmados individualmente con su `saldo_posterior` encadenado correctamente.

Verificado en vivo vía HTTP real: débito manual con `condicion=cta_cte_30` calculó el vencimiento solo (+30 días); crédito bajó el saldo correctamente; anulación de un crédito revirtió el saldo con contra-asiento y quedó bloqueada la doble anulación (409); pago por cuenta corriente generó el débito enlazado; borrar ese pago anuló el movimiento y el saldo volvió a su valor anterior; un pago normal (efectivo) se sigue borrando sin cambios.
### 3.4 Cambios de modelo — Echeq

Hoy el echeq no sabe de quién es. Agregar:

| Campo | Tipo | Para qué |
|---|---|---|
| `cliente_id` | FK nullable, indexado | **La conexión que falta.** Nullable porque los emitidos pueden ir a un proveedor |
| `proveedor_nombre` | String | Para emitidos sin cliente |
| `cuit_librador` | String(13) | Dato real del echeq |
| `fecha_pago` | `Date` | **Pedido explícito.** Distinto de `fecha_cobro`: cobro = fecha de pago del documento, `fecha_acreditacion` = cuándo entró la plata |
| `fecha_acreditacion` | `Date` nullable | Conciliación real |
| `motivo_rechazo` | String nullable | Si vuelve rechazado |
| `cuenta_corriente_id` | FK nullable | |
| `movimiento_cc_id` | FK nullable | El asiento que generó |
| `activo` | bool | Regla de nunca eliminar |
| `created_at` / `creado_por` | | Auditoría |

**Ciclo de vida del echeq recibido y su impacto en CC:**

```
recibido → EN CARTERA ──► genera movimiento HABER (crédito diferido) en la CC del cliente
              │                marcado como "no disponible hasta fecha_pago"
              ├─► DEPOSITADO ──► COBRADO ──► fecha_acreditacion, movimiento se consolida
              ├─► ENDOSADO   ──► sale de cartera, se registra a quién
              └─► RECHAZADO  ──► contra-asiento DEBE + notificación urgencia ALTA
                                 + la deuda del cliente vuelve a aparecer
```

El rechazo es el caso que más plata cuesta y hoy no está contemplado en ningún lado.

**Vista de Echeqs pedida:** listado con columnas **Importe · Fecha de pago · Cliente · Banco · Estado · Días restantes**, agrupable por vencimiento, con totalizador de "cartera de echeqs por mes" — que es lo que se necesita para saber con qué plata se cuenta.

**✅ Backend hecho (2026-07-26), migración 020.** `cliente_id`, `proveedor_nombre` (para emitidos), `fecha_acreditacion`, `motivo_rechazo`, `cuenta_corriente_id`, `movimiento_cc_id`, `activo`, `creado_por`, `created_at`. No se agregó `cuit_librador` (dato de menor prioridad, se suma cuando haga falta) ni `fecha_pago` como campo separado — `fecha_cobro` (ya existía) cumple ese rol.

Ciclo implementado en `routers/echeqs.py`: `recibido` + `cliente_id` → **crédito automático** al crear (vía `CuentaCorrienteService`). `rechazado` → **contra-asiento automático** que revierte el crédito, exige `motivo_rechazo` a nivel de API (422 si falta). Nuevo `DELETE /echeqs/{id}` (baja lógica — antes **no existía ninguna forma** de dar de baja un echeq) que también revierte el crédito si estaba vigente. `depositado`/`endosado`/`cobrado` no generan movimiento nuevo — el crédito ya se registró al entrar en cartera, sólo cambia el estado y `fecha_acreditacion`.

**Pendiente:** la vista de Echeqs con las columnas pedidas y el totalizador mensual (UI, no backend) — sección 3.9 más abajo. El automatismo para `emitido` (echeqs que la empresa entrega a un proveedor) no se tocó — sólo afecta a un proveedor, no a la cuenta corriente de un cliente propio.

Verificado en vivo vía HTTP real: echeq recibido de un cliente generó el crédito exacto; intentar rechazar sin motivo dio 422; rechazar con motivo revirtió el saldo a su valor anterior exacto; dar de baja un segundo echeq (sin rechazarlo) también revirtió su crédito; el listado por defecto excluye los dados de baja.

### 3.5 Nuevo módulo — Comprobantes / Facturas

Pedido: *"lugar para poner facturas"*. Hoy sólo existe `pago.con_factura: bool`.

**Nueva tabla `comprobantes`:**

| Campo | Notas |
|---|---|
| `tipo` | `factura_a`, `factura_b`, `factura_c`, `nota_credito`, `nota_debito`, `recibo`, `remito` |
| `punto_venta`, `numero` | Únicos juntos por tipo |
| `fecha_emision`, `fecha_vencimiento` | `Date` |
| `cliente_id` | FK |
| `alquiler_id`, `reserva_id` | FK nullable |
| `neto`, `iva`, `total` | Numeric(12,2) |
| `cae`, `cae_vencimiento` | Para cuando se integre con AFIP/ARCA |
| `archivo_key` | El PDF subido (mismo storage que documentos) |
| `estado` | `emitida`, `anulada`, `cobrada` |
| `movimiento_cc_id` | El asiento que generó |
| `activo`, `created_at`, `creado_por` | |

**Alcance recomendado ahora:** carga manual + adjuntar PDF + vincular al alquiler y a la CC. **No** integrar con AFIP en esta etapa — es un proyecto en sí mismo (certificados, homologación, WSFE). Dejar los campos `cae` preparados para no migrar después.

**✅ Hecho (2026-07-26), migración 029.** Implementado tal cual arriba, con dos ajustes deliberados:
- **`tipo` no incluye `recibo`** — el módulo de Recibos ya es una tabla aparte con su propio pipeline completo (numeración + PDF + ledger, sección 3.6); incluirlo acá hubiera duplicado sin necesidad.
- **`numero`/`punto_venta` son `String` de carga libre**, no una secuencia propia — a diferencia de `recibos`, un comprobante fiscal documenta algo emitido *fuera* del sistema (facturación externa, AFIP eventualmente), así que el número es el que ya trae el papel/PDF real, no uno que genere Ubicar Rent.
- **Sólo `nota_credito`/`nota_debito` generan un movimiento nuevo** en la cuenta corriente (crédito/débito respectivamente) — `factura_a/b/c` y `remito` sólo documentan un cargo que el ledger completo ya facturó automáticamente al checkout; generarles un segundo asiento habría duplicado la deuda.

Carga manual con PDF vía `multipart/form-data` (mismo patrón que Documentos), tab "Comprobantes" en la ficha del cliente. Baja lógica: `estado='anulada'` + motivo obligatorio; si había generado un movimiento, se revierte con contra-asiento (mismo patrón que recibo/multa).

### 3.6 Nuevo módulo — Recibos

Caso de uso real: *el cliente cancela un monto, o va pagando de a poco.* Se entra al sistema, se elige el cliente, se pone el monto, se genera el recibo, se descarga y se le manda.

Esto encaja perfecto arriba del ledger de cuenta corriente: **el recibo es el documento que respalda un HABER**. Y como los pagos son parciales, el recibo tiene que resolver el problema clásico de **imputación**: ¿este pago de $150.000 cancela qué?

**Nueva tabla `recibos`:**

| Campo | Notas |
|---|---|
| `numero` | Correlativo automático con `punto_venta`. Formato `0001-00000042` |
| `cliente_id` | FK |
| `fecha` | `Date` |
| `monto_total` | Numeric(12,2) |
| `medios_pago` | JSON: `[{medio, monto, referencia}]` — permite recibo mixto (parte efectivo, parte transferencia, parte echeq) |
| `concepto` | Texto libre editable, con default sugerido |
| `observaciones` | |
| `saldo_anterior`, `saldo_posterior` | Se imprimen en el recibo — es lo que el cliente quiere ver |
| `movimiento_cc_id` | FK — el asiento que generó |
| `archivo_key` | PDF generado, guardado |
| `estado` | `emitido`, `anulado` |
| `anulado_por_recibo_id` | Contra-recibo, nunca borrado |
| `enviado_email`, `enviado_at` | Trazabilidad del envío |
| `activo`, `created_at`, `creado_por` | |

**Nueva tabla `recibo_imputaciones`:** `recibo_id`, `alquiler_id` / `comprobante_id` / `multa_id` nullable, `monto_imputado`.

Con dos modos:
- **A cuenta** — el monto entra al haber general y baja el saldo. Es el caso simple y el que más van a usar.
- **Imputado** — el monto se aplica a deudas puntuales. El sistema propone automáticamente las más viejas primero (FIFO), y se puede ajustar a mano.

Si el monto supera la deuda, el excedente queda como **saldo a favor** — no se pierde ni se rechaza.

**Flujo en el sistema:**

```
Cliente → tab Cta. Corriente → [ Generar recibo ]
   ↓
Modal:  monto  ·  fecha  ·  medio(s) de pago  ·  concepto
        ┌─ deudas pendientes con checkbox e imputación sugerida ─┐
        │ ☑ Alquiler #142 — vence 15/07 — $80.000               │
        │ ☑ Factura B 0001-00231 — vence 30/07 — $70.000        │
        │ ☐ Multa #12 — $23.000                                 │
        └────────────────────────────────────────────────────────┘
   ↓
[ Vista previa en vivo ]  ← igual que el cotizador, split form/preview
   ↓
Genera → PDF  ·  Descargar  ·  Enviar por email  ·  Compartir por WhatsApp
   ↓
Automático: asiento HABER en la CC + registro en Caja del día
```

**El PDF.** Estética a la altura del cotizador, que ya salió bien:

- Membrete con el logo de Ubicar Rent, datos de la empresa, CUIT
- **RECIBO N° 0001-00000042** grande y la fecha
- Recibí de: nombre, DNI/CUIT, domicilio
- **La suma de PESOS CIENTO CINCUENTA MIL** — el monto en letras, que es lo que le da carácter de recibo
- Monto en números destacado
- En concepto de: descripción + detalle de imputación si la hay
- Medio de pago con la referencia (nro de transferencia, banco del echeq)
- **Saldo anterior → Este pago → Saldo actual** en una barra clara
- **Párrafo de agradecimiento** — fijo y pre-escrito, como se decidió para el cotizador. La voz de Ubicar Rent, no texto libre. Algo del estilo: *"Gracias por confiar en Ubicar Rent. Valoramos su puntualidad y quedamos a disposición para su próximo alquiler."*
- Pie con datos de contacto, y QR opcional a la web
- Firma y sello

**Reutilizable:** el mismo generador sirve para **recibo de seña** al confirmar una reserva y para **recibo de devolución de garantía** al cerrar el alquiler. Vale diseñarlo con esa variante desde el inicio (`tipo_recibo`).

**Técnicamente:** conviene generar el PDF **server-side** (WeasyPrint o ReportLab), no con `html2canvas` como el cotizador. Razones: el recibo se guarda, se re-descarga y se envía por email — necesita ser idéntico siempre y existir sin que haya un navegador abierto. La vista previa del frontend puede seguir siendo HTML; sólo el archivo final se genera en el backend.

Esto también resuelve el `contrato_pdf.py` y el `presupuesto_pdf.py` que hoy están vacíos (14 y 7 líneas): un solo pipeline de PDF server-side para recibos, contratos, facturas y presupuestos.

**✅ Hecho (2026-07-26), migración 022 — versión simplificada.** Tabla `recibos` (numeración vía `recibos_numero_seq`, nunca `MAX+1`, con `prefijo='R'` preparado para el día que haya más de un punto de emisión — D-14), `ReciboService` (`crear`, `anular`, `generar_pdf`), router `POST /recibos`, `GET /recibos/{id}/pdf`, `POST /recibos/{id}/anular`. PDF con ReportLab: logo, monto en letras (`domain/monto_letras.py`, nuevo, 7 tests), saldo anterior→pago→saldo actual, párrafo de agradecimiento fijo (D-15, texto exacto). Emitir genera el crédito vía `CuentaCorrienteService` (mismo mecanismo que pago/echeq/multa); anular revierte con contra-asiento y exige motivo (422 si falta), igual que la multa bonificada. Frontend: tab "Recibos" en la ficha de cliente (emitir, listar, descargar PDF, anular).

**Deliberadamente afuera de esta versión** (a validar con los dueños, ver `docs/VALIDAR_CON_DUENOS.md`):
- **`medios_pago` mixto** (parte efectivo + parte transferencia en un mismo recibo) — hoy es un solo `medio_pago` por recibo. Si el cliente paga con dos medios, hoy son dos recibos.
- **`recibo_imputaciones` / imputación FIFO contra deudas puntuales** — el recibo de hoy hace lo mismo que un pago o un echeq: genera un crédito contra el saldo general de la cuenta. No permite elegir "este recibo cancela el Alquiler #142" específicamente. Es coherente con cómo ya funcionan pagos y echeqs (ninguno de los dos imputa tampoco), pero es menos de lo que describía el plan original.
- **Envío por email** — el botón "Descargar PDF" es la acción principal (D-16); no se armó el botón deshabilitado con Resend por ahora.

De paso, aprovechando el mismo patrón D-19 (motivo obligatorio + contra-asiento), se armó el frontend de **resolución de multas** (botones "Cobrada"/"Bonificar" en `MultasTab` y en la página global de Multas — el backend ya existía desde antes pero la UI nunca lo llamaba) y se corrigió el **rechazo de echeq**, que hoy pedía `motivo_rechazo` en el backend pero el frontend nunca lo enviaba (todo intento de rechazar un echeq desde la UI daba 422). Ver `components/shared/MotivoDialog.tsx`, nuevo componente reusado en los tres flujos.

### 3.7 Cambios de modelo — Cliente (datos fiscales)

Necesarios para facturar y para operar cuenta corriente con empresas:

`razon_social`, `condicion_iva` (`responsable_inscripto`/`monotributo`/`consumidor_final`/`exento`), `domicilio`, `localidad`, `provincia`, `codigo_postal`, `fecha_nacimiento` (edad mínima de conductor), `licencia_pais`, `licencia_desde` (antigüedad mínima), `condicion_pago_default`.

**✅ Hecho (2026-07-26), migración 023.** Los 10 campos de arriba, todos nullable — se completan con el tiempo, no bloquean el alta rápida. Además, nueva tabla `cliente_contactos` (`nombre`, `puesto`, `telefono`, `email`, baja lógica) para que una empresa pueda tener varios contactos con roles distintos (CLI-04/05). `ClienteFormDialog.tsx` ahora es condicional: empresa ve razón social + condición IVA; particular ve fecha de nacimiento + país/antigüedad de licencia. Ambos ven domicilio/localidad/provincia/código postal + condición de pago default.

**Validaciones de negocio (edad mínima, antigüedad de licencia) todavía NO implementadas** — sólo se agregaron los campos (CLI-15/16). Falta decidir los mínimos con Franco/Martín y aplicarlos al crear la reserva.

**De paso, bug corregido:** `ConductorAdicional` se borraba en duro (`db.delete()`) pese a que la regla "nunca eliminar" ya estaba establecida — se agregó `activo` y la baja pasó a ser lógica, igual que el resto de las entidades.

### 3.8 Nuevos automatismos (lo que hace que todo esté conectado)

| Evento | Asiento automático en CC | Estado |
|---|---|---|
| Checkout confirmado con precio total | DEBE por el total del alquiler, condición del cliente, vencimiento calculado | ✅ Hecho |
| Pago registrado | HABER por el monto | ✅ Hecho |
| **Recibo emitido** | HABER contra el saldo general (sin imputación a deudas puntuales — ver 3.6) | ✅ Hecho (versión simplificada) |
| **Recibo anulado** | Contra-asiento DEBE, nunca se borra ni edita | ✅ Hecho |
| Echeq recibido en cartera | HABER diferido | ✅ Hecho |
| Echeq rechazado | DEBE (revierte) + alerta alta | ✅ Hecho (la alerta es Fase 2) |
| Multa cambia a `imputada` | DEBE por el monto | ✅ Hecho |
| Multa resuelta (cobrada / bonificada) | HABER (cobrada) o contra-asiento con motivo (bonificada) | ✅ Hecho |
| Cargo por excedente / late checkout | DEBE al cerrar el checkin | ✅ Hecho |
| Garantía ejecutada parcial | DEBE por el monto retenido | ⬜ Necesita el parte de daños (Fase 4) |
| Factura emitida | Vincula al asiento existente (no duplica) | ⬜ Módulo Comprobantes, sección 3.5 |
| Nota de crédito | HABER | ⬜ Módulo Comprobantes |

**✅ Hecho (2026-07-26) — Multa.** Imputar una multa a un cliente (`estado='imputada'`) genera el débito automático. Nuevo `POST /multas/{id}/resolver` con dos salidas, mismo patrón que el rechazo de un echeq y la decisión de excedente del check-in (D-19):
- **`cobrada`** — el cliente la pagó, genera el crédito que cancela el débito.
- **`bonificada`** — se le perdona, anula el débito con contra-asiento. **Exige motivo** a nivel de API (422 si falta), no sólo en el frontend. Nuevo estado `bonificada` en el enum (antes sólo existía `cobrada`, que no distinguía "pagó" de "se lo perdonamos").

Verificado en vivo: imputar sin cliente da 422; imputar con cliente genera el débito exacto; resolver "cobrada" cancela el débito a $0; bonificar sin motivo da 422; bonificar con motivo revierte el débito y guarda el motivo en la multa.

**🔑 El principio general, para cuando se agregue el parte de daños (Fase 4) u otro "cargo extra" atribuible a un cliente:** cualquier cargo de este tipo debe seguir el mismo patrón de 3 pasos —
1. **Se genera un débito automático** en la CC del cliente al confirmarse/imputarse (no antes: mientras es sólo un hallazgo sin confirmar, no se cobra nada).
2. **Una acción de resolución con exactamente dos salidas:** cobrado (→ crédito) o bonificado/perdonado (→ contra-asiento, motivo obligatorio). No hay un tercer estado ambiguo.
3. **El historial queda gratis** — el movimiento de CC ya lleva fecha, concepto, quién lo generó y a qué entidad se enlaza (vía su FK específica en `movimientos_cuenta_corriente`: `multa_id` ya existe, `dano_id` se agrega cuando exista la tabla de partes de daños).

`CuentaCorrienteService.registrar_movimiento()` y `.anular_movimiento()` ya son genéricos — el trabajo para un cargo nuevo es sólo el enum de estados + el endpoint de resolución + la llamada al servicio, como se hizo acá para multas. No hace falta tocar el ledger en sí.

### 3.9 UI — Cuenta Corriente

Tab en ficha de cliente y página global. Columnas del ledger, tal como se pidió:

```
Fecha │ Comprobante │ Concepto │ Condición │ Vence │ Debe │ Haber │ Saldo
```

Arriba: **aging de deuda** — `A vencer · 1-30 · 31-60 · 61-90 · +90 días`, que es como se mira una CC en la vida real. Y filtro "sólo vencido".

---

## 4. Bloque B — Módulo completo de Alertas y Notificaciones

Este es el que hay que construir de cero, unificando los dos sistemas actuales.

### 4.1 Arquitectura

Tres capas separadas:

```
┌──────────────────────────────────────────────────────────────┐
│ 1. REGLAS (declarativas)                                     │
│    Cada regla define: qué detecta · cuándo dispara · urgencia │
│    · canales · plantilla · clave de deduplicación            │
├──────────────────────────────────────────────────────────────┤
│ 2. MOTOR (scheduler + generador)                             │
│    Corre a las 08:00 ART · evalúa todas las reglas           │
│    · deduplica · persiste en tabla `notificaciones`          │
├──────────────────────────────────────────────────────────────┤
│ 3. CANALES (entrega)                                         │
│    in-app (campana) · email digest (Resend) · push web       │
│    · WhatsApp (fase 2)                                       │
└──────────────────────────────────────────────────────────────┘
```

**La clave del diseño: la tabla real.** Hoy las notificaciones se computan al abrir la campana, así que no se puede marcar leído, ni descartar, ni posponer, ni saber si ya se avisó. Con tabla:

**`notificaciones`:**

| Campo | Notas |
|---|---|
| `tipo` | Enum, ver catálogo abajo |
| `titulo`, `descripcion` | |
| `urgencia` | `critica`, `alta`, `media`, `baja` |
| `entidad_tipo`, `entidad_id`, `url_destino` | Navegación |
| `fecha_objetivo` | La fecha del hecho (vencimiento, cobro, devolución) |
| `programada_para` | Cuándo debe dispararse |
| `estado` | `pendiente`, `enviada`, `leida`, `pospuesta`, `descartada`, `resuelta` |
| `destinatario_usuario_id` | nullable = todos |
| `canales_enviados` | JSON: qué canales ya se usaron |
| `clave_dedupe` | **UNIQUE** — `{tipo}:{entidad_tipo}:{entidad_id}:{fecha_objetivo}` |
| `posponer_hasta` | Para "recordarme mañana" |
| `resuelta_at`, `resuelta_por` | |

El índice único sobre `clave_dedupe` es lo que evita que la misma alerta se repita todos los días para siempre. Y `auto-resolución`: si la condición que la generó desaparece (se cobró el echeq, se hizo el checkin), la notificación pasa a `resuelta` sola.

### 4.2 Catálogo completo de reglas

**Operación diaria** (las que definen la mañana)

| Regla | Cuándo | Urgencia |
|---|---|---|
| Entregas de hoy | 08:00 del día | alta |
| Devoluciones de hoy | 08:00 del día | alta |
| Checkout pendiente (hora programada pasada, sin salida registrada) | En el momento | crítica |
| Checkin vencido (fecha_fin pasada, auto no volvió) | +1h de la hora fin | crítica |
| Reserva sin contrato firmado y entrega hoy | 08:00 | alta |
| Reserva pendiente de confirmar > 24hs | 08:00 | media |
| **Reserva nueva desde la web** | Al instante | alta |

**Cobranzas y finanzas** (el núcleo del pedido)

| Regla | Cuándo | Urgencia |
|---|---|---|
| **Echeq próximo a cobrar** | **T-2 días, 08:00** ← pedido explícito | alta |
| Echeq vence hoy | T-0, 08:00 | crítica |
| Echeq sin acreditar pasada la fecha | T+1 | crítica |
| Echeq rechazado | Al registrarlo | crítica |
| Vencimiento de cuenta corriente | T-3 y T-0, 08:00 | alta |
| Cuenta corriente vencida | T+1, +7, +15, +30 | escala a crítica |
| Cliente supera límite de crédito | Al generarse el asiento | alta |
| Saldo pendiente al finalizar alquiler | Al checkin | alta |
| Garantía retenida sin resolver > 3 días | 08:00 | media |
| Factura pendiente de emitir (alquiler cerrado sin comprobante) | 08:00 | media |

**Flota y documentación**

| Regla | Cuándo | Urgencia |
|---|---|---|
| VTV / póliza / cualquier doc | T-30, T-15, T-7, T-1, vencido | escala |
| Service por km | <1.000 km / vencido | media / alta |
| Service por fecha | T-15 / vencido | media / alta |
| Licencia de cliente por vencer | T-30, T-7 | media |
| Licencia vencida con reserva futura | Al detectarlo | alta |
| Vehículo fuera de servicio > 7 días | 08:00 | media |

**Multas**

| Regla | Cuándo | Urgencia |
|---|---|---|
| Multa pendiente de imputar | 08:00 | media |
| Multa imputada sin cobrar > 15 días | 08:00 | media |
| Multa próxima a vencer (descuento por pronto pago) | T-5 | alta |

### 4.3 El resumen matutino

Pedido: *"toda notificación relevante le debe salir a la mañana a esta persona"*.

**Un solo envío a las 08:00 ART**, agrupado. No 15 mails sueltos.

```
Buen día Franco — Lunes 27 de julio

🔴 URGENTE (3)
   · Echeq de Transporte SRL — $450.000 — se cobra el miércoles 29
   · Reserva #142 — el auto AB123CD tenía que volver ayer 18:00
   · Ford Ranger LMN456 — VTV vencida hace 4 días

🟡 HOY (5)
   · 2 entregas: 09:00 Pérez (Corsa) · 14:00 Gómez (Hilux)
   · 3 devoluciones: 10:00 · 16:00 · 18:00

💰 COBRANZAS (4)
   · Vencen hoy en cta. cte.: Constructora del Sur $280.000
   · Vencido +30 días: Logística BB $95.000
   · 2 alquileres cerrados con saldo: $67.000 total

🔧 FLOTA (2)
   · Amarok GHI789 — service en 400 km
   · Póliza de 3 vehículos vence en 15 días

                                    [ Abrir el sistema ]
```

Ese mismo contenido queda en la campana in-app, agrupado igual.

### 4.4 Canales — recomendación

| Canal | Estado | Recomendación |
|---|---|---|
| In-app (campana) | ✅ existe | Reescribir contra la tabla nueva. Agregar leído/posponer/descartar |
| Email (Resend) | Helper existe, sin usar | **Empezar por acá.** El digest matutino |
| Push web | ❌ | Fase 2. Sirve para las críticas en tiempo real |
| WhatsApp | Sólo genera links `wa.me` | **Fase 3.** El envío automático requiere WhatsApp Business API (Meta) o Twilio: número verificado, plantillas pre-aprobadas, costo por mensaje. No es un `wa.me`. Vale la pena, pero no ahora |

### 4.5 Preferencias por usuario

Tabla `preferencias_notificacion`: por usuario, por tipo de regla, qué canales y con qué anticipación. Franco puede querer los echeqs a T-5 y Martín a T-2. Simple, pero evita que apaguen todo por saturación — que es cómo mueren la mayoría de los sistemas de alertas.

---

## 5. Bloque C — UI/UX

### 5.1 Achicar el menú (pedido explícito)

Hoy: 9 items planos, sidebar de `w-60` (240px).

**Propuesta: 6 grupos.**

| Nuevo menú | Absorbe |
|---|---|
| 🏠 **Hoy** | Ocupación + Dashboard (ya están fusionados de hecho) |
| 📋 **Reservas** | Reservas, Alquileres, Contratos |
| 🚗 **Flota** | Flota, Mantenimiento, Multas |
| 👤 **Clientes** | Clientes, Cuentas Corrientes |
| 💰 **Finanzas** | Caja, Echeqs, CC (global), **Recibos**, **Facturas** |
| 📊 **Más** | Reportes, Cotizador, Configuración |

Y tres cambios de densidad concretos:

1. **Sidebar `w-60` → `w-52`** (240px → 208px). El estado colapsado ya existe (`w-16`) y funciona.
2. **Auto-colapsar el sidebar en `/reservas` y `/ocupacion`**, expandible con hover. Recupera 176px de ancho útil en las dos pantallas que más lo necesitan. El `useAppStore` ya maneja `sidebarCollapsed`, es un cambio chico.
3. **Persistir la preferencia** de colapsado en localStorage.

### 5.2 Que entren más cuadros en Reservas (pedido explícito)

Además del sidebar:

- **Barra de filtros colapsable.** Hoy ocupa una fila completa siempre visible (buscador + fecha + estado + limpiar). Pasarla a un botón "Filtros ▾" con badge de cuántos hay activos, expandible.
- **Header sticky** y `space-y-6` → `space-y-4`.
- **Toggle de densidad** cómoda / compacta, persistido.
- **Vista tabla además de cards** para cuando hay muchas — en tabla entran 3× más filas.
- **Virtualización** si la lista pasa de ~100 items.

### 5.3 Consistencia visual (deuda acumulada)

Hay tres sistemas de color conviviendo: la paleta oficial (`primary #407EC9`), tokens semánticos de shadcn (`bg-primary`, `text-danger`), y clases Tailwind crudas (`bg-indigo-600`, `text-slate-800` en `ReservasList.tsx`, `MultasPage.tsx`, `CajaPage.tsx`). Y `PROGRESO.md` menciona una migración parcial de lucide-react a Heroicons.

Antes de sumar pantallas nuevas conviene fijar: **una paleta, un set de íconos (lucide, que es el que domina), un set de componentes base.** Si no, la web pública va a heredar el desorden.

### 5.4 Faltantes de UX que valen la pena

- **Búsqueda global (Cmd+K)** — cliente, patente, reserva, desde cualquier pantalla.
- **Timeline unificado por entidad** — en la ficha del cliente: todo lo que pasó (reservas, pagos, multas, echeqs, docs) en una sola línea de tiempo cronológica. Hoy está fragmentado en 6 tabs.
- **Estados vacíos con acción** en lugar de "Sin movimientos registrados".
- **Confirmaciones destructivas consistentes** — hay `confirm()` nativo en `ReservasList.tsx` conviviendo con `ConfirmDialog`.

---

## 6. Bloque D — Datos faltantes transversales

### 6.1 Categoría de vehículo 🔴 bloqueante para la web

`vehiculo.tipo` es sólo `auto | camioneta`. La web vende por categoría con foto y precio.

**Nueva tabla `categorias`:** `codigo`, `nombre` ("Económico", "Intermedio", "SUV", "Pick-up 4x2", "Pick-up 4x4"), `descripcion`, `foto_key`, `orden`, `capacidad_pasajeros`, `capacidad_valijas`, `transmision`, `aire_acondicionado`, `puertas`, `activo`.
→ `vehiculo.categoria_id` FK.

### 6.2 Sucursales / Lugares 🔴 bloqueante para la web

`reserva.lugar_entrega` y `lugar_devolucion` son texto libre de 255. La pantalla 1 de la web pide seleccionarlos.

**Nueva tabla `sucursales`:** `nombre`, `direccion`, `localidad`, `telefono`, `horario_apertura`, `horario_cierre`, `dias_operativos`, `permite_retiro`, `permite_devolucion`, `cargo_fuera_horario`, `es_punto_web`, `activo`.
**Nueva tabla `cargos_one_way`:** `sucursal_origen_id`, `sucursal_destino_id`, `monto` — el cargo por dejar el auto en otro lado.

### 6.3 Adicionales 🔴 bloqueante para la web

No existe nada. La pantalla 2 de la web los pide.

**Nueva tabla `adicionales`:** `codigo`, `nombre`, `descripcion`, `tipo_precio` (`por_dia` / `por_alquiler` / `porcentaje_del_total`), `precio`, `stock` nullable, `obligatorio`, `excluyente_con` (para que no elijan dos seguros), `orden`, `visible_web`, `activo`.
**Nueva tabla `reserva_adicionales`:** `reserva_id`, `adicional_id`, `cantidad`, `precio_unitario_congelado`, `subtotal`.

Ejemplos mencionados: seguro con franquicia $2.000.000, seguro reducido, cadenas, lona para perros. Sumo los del rubro: silla de bebé, GPS, conductor adicional, entrega/devolución fuera de horario, kilometraje extra, portaequipaje.

**Sobre los seguros:** conviene modelarlos como un adicional *excluyente* (elegís uno de N niveles de cobertura), no como checkbox suelto. Y cada nivel define su **franquicia**, que es el monto que el cliente banca ante un siniestro — dato que hoy no existe en ningún lado y que debería quedar registrado en el alquiler y en el contrato.

### 6.4 Parte de daños 🟠 protege la garantía

Hoy: `checkout_descripcion` y `checkin_descripcion`, dos campos de texto. Con eso no se ejecuta una garantía ni se gana una discusión.

**Nueva tabla `partes_dano`:** `alquiler_id`, `momento` (`checkout`/`checkin`), `zona` (croquis: frente, capó, puerta del., puerta tras., lateral, techo, baúl, parabrisas, llanta ×4...), `tipo` (rayón, abolladura, rotura, faltante), `severidad`, `descripcion`, `foto_key`, `preexistente`, `costo_estimado`.

Con eso el check-in muestra **automáticamente los daños del check-out** y sólo hay que marcar los nuevos.

### 6.5 Contratos 🔴 bloqueante

`routers/contratos.py` es un TODO de 18 líneas. El modelo `Contrato` ya existe con `datos_prellenados`, `link_prellenado`, `link_expiracion` — el diseño está pensado, falta ejecutarlo.

Necesario:
- **El texto legal.** No está escrito en ningún lado y la web lo necesita para mostrarlo antes del pago. Esto lo tiene que aportar Franco/Martín (idealmente revisado por un abogado). Es el ítem con más lead time del proyecto — conviene pedirlo ya.
- Generación de PDF con datos del alquiler (reutilizar el pipeline de `pdfExport.ts` del cotizador o hacerlo server-side, ver 6.6).
- Firma: empezar con firma en pantalla (canvas) + foto del DNI, guardadas en el contrato. Firma digital con validez legal (tipo Docusign) es fase posterior.
- Hard block: sin contrato firmado no hay checkout.

### 6.6 Audit log 🟠

El roadmap lo menciona en F6 y no existe. Con dos dueños operando y plata de por medio:

**Nueva tabla `auditoria`:** `usuario_id`, `accion`, `entidad_tipo`, `entidad_id`, `datos_antes` (JSON), `datos_despues` (JSON), `ip`, `timestamp`. Aplicar al menos a: pagos, movimientos de CC, echeqs, precios, cancelaciones, bonificaciones de excedente, resolución de garantías.

### 6.7 Otros campos faltantes por entidad

**Vehículo:** `nro_chasis`, `nro_motor`, `titular_dominio`, `compania_seguro`, `nro_poliza`, `vencimiento_poliza` (hoy va como documento genérico, debería ser campo), `fecha_compra`, `valor_compra`, `tiene_gnc`, `transmision`, `combustible`, `sucursal_base_id`.

**Reserva:** `categoria_id`, `sucursal_retiro_id`, `sucursal_devolucion_id`, `origen` (`sistema`/`web`/`telefono`/`whatsapp`/`mostrador`), `hold_expira_en`, `pago_externo_id`, `politica_cancelacion`, `motivo_cancelacion`, `cancelada_por`, `es_no_show`.

**Alquiler:** `peajes`, `cargo_combustible_faltante`, `cargo_limpieza`, `cargo_one_way`, `firma_cliente_key`, `km_incluidos`, `cargo_km_excedido`.

**Pago:** `cliente_id`, `alquiler_id` → nullable, `reserva_id`, `referencia_externa` (nro de transferencia / operación de MP), `anulado`, `anulado_por_pago_id`, `comprobante_id`.

---

## 7. Bloque E — Sistema de Reservas Web

### 7.1 Lo que cambia de raíz

El sistema hoy es **interno y confiado**: un humano carga la reserva sabiendo lo que hace. La web es **pública y hostil**: hay concurrencia, bots, abandonos, pagos a medias y gente probando fechas. Tres cosas nuevas obligatorias:

1. **Reservar por categoría, no por vehículo.** Es como funcionan las rentadoras reales. El cliente elige "SUV", y el auto puntual se asigna al momento de la entrega. Si un auto se rompe, se reemplaza sin tocar la reserva.
   → Impacto: `Reserva.vehiculo_id` debe pasar a **nullable**, y sumar `categoria_id`. Es un cambio estructural que afecta reservas, ocupación y solapamientos. **Es la decisión de arquitectura más importante de todo este plan.**
2. **Hold temporal.** Mientras el cliente completa las 3 pantallas, el cupo se reserva 15-20 minutos. Sin esto, dos personas pagan el mismo auto.
3. **Disponibilidad por cupo**, no por estado. "¿Cuántos SUV libres hay del 3 al 10 de septiembre?" = total de SUV activos − reservas solapadas − bloqueos de mantenimiento.

### 7.2 Motor de precios

Hoy: tarifa por vehículo, por categoría, o general, seleccionada por duración (diaria <7d, semanal 7-29d, mensual 30+) — **hecho 2026-07-26** (migración 025, Fase 1 ítem 21, D-08). **Todavía no soporta estacionalidad** (precio distinto por fecha/temporada). El pedido completo es precio por categoría, por día del año, con fechas especiales — eso sigue siendo esta sección 7.2, de la Fase 5.

**Diseño en capas, se resuelve día por día:**

```
Para cada día del rango:
  precio_base = regla de mayor prioridad que cubra ese día para esa categoría
  ↓
Subtotal = Σ precios diarios
  ↓
Descuento por duración (7+ días: −X% · 30+ días: −Y%)
  ↓
+ Adicionales
  ↓
+ Cargo one-way / fuera de horario
  ↓
= TOTAL
```

**Nueva tabla `tarifas_calendario`:**

| Campo | Notas |
|---|---|
| `categoria_id` | FK (o `vehiculo_id` para override puntual) |
| `fecha_desde`, `fecha_fin` | Rango de aplicación |
| `dias_semana` | JSON `[1..7]` nullable — permite "fines de semana más caro" |
| `precio_dia` | Numeric |
| `prioridad` | Entero. **Mayor prioridad gana.** Es lo que resuelve todo |
| `min_dias`, `max_dias` | Restricciones opcionales |
| `nombre` | "Temporada alta verano", "Semana Santa 2027" |
| `visible_web` | Permite precios distintos web vs mostrador |
| `es_promocional` | Marca la regla como promo (ver abajo) |
| `precio_referencia` | Precio "de lista" tachado, sólo si `es_promocional` |
| `etiqueta_promo` | Texto de marketing: "Promo Día del Amigo" |
| `activo` | |

El sistema de prioridades es la clave: cargás una regla base anual con prioridad 0, encima "temporada alta enero-febrero" con prioridad 10, y encima "primera semana de septiembre" con prioridad 20. La más específica gana sin tener que borrar nada. Exactamente el caso que se planteó.

**Confirmado con el usuario (2026-07-27)** que este es el modelo que los dueños quieren y cómo lo van a cargar ellos mismos:

> *"planificar precios base, y precios por fecha. Por ejemplo para el día del amigo van a planificar los precios ya fijos, para navidad el que quiera reservar en esas semanas otros precios, que tengan la posibilidad de poner precios promocionales para incentivar más al marketing"*

Traducido al diseño de arriba, las tres capas que describieron son exactamente las tres prioridades:

| Lo que dijeron | Cómo se carga |
|---|---|
| "precios base" | Regla anual por categoría, `prioridad = 0` |
| "para el día del amigo / navidad, precios fijos" | Regla con `fecha_desde`/`fecha_fin` de esa semana, `prioridad = 10` |
| "precios promocionales para incentivar el marketing" | Igual que la anterior + `es_promocional = true`, `prioridad = 20` |

**Por qué la promo necesita campos propios y no alcanza con bajar el precio:** una promo no es sólo un precio más barato, es un precio que **se comunica como descuento**. La web tiene que poder mostrar "antes $85.000, ahora $68.000" y una etiqueta que enganche — eso necesita saber cuál era el precio de lista (`precio_referencia`) y cómo llamar a la promo (`etiqueta_promo`). Si sólo se bajara `precio_dia`, el cliente ve un precio más barato pero **nunca se entera de que está aprovechando algo**, que es justamente lo contrario de "incentivar el marketing". Además `es_promocional` permite listar todas las promos vigentes en un solo lugar sin adivinar comparando precios.

**"La idea es acoplar todo a esto"** — el punto es que el motor sea la **única** fuente de precios del sistema: `POST /api/v1/precios/calcular` lo consumen el sistema interno (`ReservaModal`), el cotizador y la web, con el mismo desglose día por día. Hoy el precio de una reserva se calcula en `domain/tarifas.py::seleccionar_tarifa` (por duración, sin fechas); cuando entre el calendario, **esa función pasa a ser un caso particular del motor nuevo** (la regla de prioridad 0), no un camino paralelo. Es el mismo criterio que se usó con las tarifas por categoría vs. por vehículo: una sola función decide, con precedencia explícita.

**Tabla `descuentos_duracion`:** `categoria_id` nullable, `dias_desde`, `dias_hasta`, `porcentaje`.

**Endpoint clave: `POST /api/v1/precios/calcular`** → devuelve el **desglose día por día**, no sólo el total. Es lo que permite mostrarle al cliente por qué paga lo que paga, y lo que hace que el módulo sea debuggeable. Se reutiliza en el sistema interno, en el cotizador y en la web.

**Pantalla de administración: "Calendario de precios"** — vista tipo calendario anual, categorías en filas, meses en columnas, precio y color por celda. Pintar un rango y asignar precio. Debe ser tan fácil como marcar en un Excel, porque es lo que van a usar todas las semanas.

**✅ Primer ladrillo construido (2026-07-27, migración `036_fechas_especiales`).** Pedido explícito: *"en el calendario le tienen que aparecer las fechas especiales a los administradores"*. Se adelantó porque tiene valor propio **hoy**, sin esperar al motor de precios: saber que la semana que viene es Navidad cambia cómo se planifica la flota, y esa información no estaba en ningún lado del sistema.

- Tabla `fechas_especiales`: nombre, **rango** (`fecha_desde`/`fecha_hasta` — los dueños piensan en "las semanas de Navidad", no en el 25 aislado; para un día suelto ambas son iguales), `tipo` (feriado / fin de semana largo / comercial / temporada / otro), `color`, notas, baja lógica con reactivación.
- **Sembrados 22 registros**: feriados nacionales argentinos de fecha fija 2026 y 2027, Día del Amigo, "Fiestas" (20/12 al 6/1) y temporada alta de verano. **No se sembraron los feriados móviles** (Carnaval, Semana Santa, y los trasladables por decreto): dependen del calendario litúrgico o de una decisión anual del PEN, así que sembrarlos calculados sería adivinar. Se cargan a mano, que para eso está la pantalla.
- **Se ven en las dos vistas del calendario**: en la vista timeline, un chip de color en el encabezado del día y la columna teñida; en la vista agenda mensual, un punto de color en el día y el detalle listado debajo del día seleccionado. Si un día cae en varias (Navidad dentro de "Fiestas"), **gana la de rango más corto** — es la más específica y la que el admin quiere ver.
- Administración en `/configuracion` (`FechasEspecialesPanel`), donde los dueños las cargan ellos mismos.

**Cómo engancha con el motor de precios:** cuando entre `tarifas_calendario`, una regla de precio va a poder **apuntar a una fecha especial** en vez de repetir el rango a mano. Así "Navidad 2026" se define una sola vez y sirve para el calendario **y** para el precio — que es exactamente el "acoplar todo a esto" que se pidió. Los colores ya elegidos acá se reutilizan para pintar el calendario de precios.

### 7.3 Disponibilidad

**`GET /api/v1/public/disponibilidad`** — reescribir por completo:

```
Input:  sucursal_retiro, sucursal_devolucion, fecha+hora inicio, fecha+hora fin
Proceso:
  1. Validar rango (mínimo 1 día, máximo N, no en el pasado, horario de sucursal)
  2. Por categoría: vehículos activos en esa sucursal
  3. Restar reservas solapadas (usar domain/solapamientos.py, que ya existe y es correcto)
  4. Restar holds vigentes no expirados
  5. Restar bloqueos de mantenimiento
  6. Aplicar buffer de N horas entre alquileres
  7. Calcular precio con el motor de 7.2
Output: [{ categoria, foto, specs, disponibles: N, precio_total, precio_dia, desglose }]
```

**Nueva tabla `bloqueos_vehiculo`:** `vehiculo_id`, `fecha_desde`, `fecha_hasta`, `motivo` (`mantenimiento`/`siniestro`/`uso_interno`/`venta`), `notas`. Hoy el único mecanismo es `estado = fuera_de_servicio`, que no tiene fechas y por lo tanto no sirve para planificar.

### 7.4 Los 3 pasos del flujo web

**Paso 1 — Dónde y cuándo**
Lugar retiro → lugar devolución → fecha+hora inicio → fecha+hora fin → **grilla de categorías disponibles** con foto, specs (pasajeros/valijas/transmisión/AC), precio por día y total, y badge "Últimas 2 unidades" cuando el cupo baja. Las categorías sin cupo se muestran deshabilitadas con la fecha más cercana disponible — no se ocultan, porque eso convierte.
→ **Al elegir: se crea el HOLD de 20 min con contador visible.**

**Paso 2 — Adicionales**
Grupo de coberturas **excluyente** (elegí una): Básica incluida (franquicia $2.000.000) · Intermedia (franquicia reducida, +$X/día) · Full (sin franquicia, +$Y/día). La franquicia tiene que estar explicada en una línea clara — es el motivo #1 de conflictos post-siniestro.
Grupo de extras **múltiple**: cadenas, lona para perros, silla de bebé, GPS, conductor adicional, portaequipaje.
Sidebar con el total recalculando en vivo.

**Paso 3 — Datos, contrato y pago**
Datos del titular (nombre, DNI, nacimiento, email, teléfono, licencia + vencimiento, domicilio) → validación de edad mínima y licencia vigente al momento de la entrega → conductores adicionales → **contrato / T&C con scroll obligatorio y checkbox** → método de pago → pasarela.
Al confirmar: matchear contra cliente existente por DNI/email (no duplicar fichas).

### 7.5 Pasarela de pagos

**Recomendación: Mercado Pago Checkout Pro.** Es el estándar en Argentina, acepta todo (tarjetas, dinero en cuenta, Rapipago/Pago Fácil, cuotas), y el flujo redirigido saca de encima el manejo de datos de tarjeta (PCI).

Decisiones a tomar:
- **¿Seña o total?** Recomiendo **seña del 30%** online y el resto al retirar. Baja la fricción de la compra y limita la exposición ante cancelaciones. El campo `anticipo_monto` ya existe en `Reserva`.
- **Webhook idempotente obligatorio.** MP reintenta notificaciones; sin idempotencia se duplican pagos.
- **Máquina de estados:** `hold` → `pendiente_pago` → `pagada` → `confirmada`. Con expiración automática del hold que libera el cupo.
- Registrar `pago_externo_id` y conciliar contra el pago interno.

⚠️ **Riesgo a manejar:** el hold expira mientras el cliente está pagando y otro toma el cupo. Solución: extender el hold al iniciar el pago y verificar disponibilidad **una vez más** dentro del webhook antes de confirmar. Si falla, reembolso automático + alerta crítica.

### 7.6 Reserva web → sistema interno

Pedido: *"que haya notificaciones desde la web, para que ellos desde el sistema lo puedan aceptar, rechazar"*.

**Recomendación con un matiz importante:** si el cliente ya pagó y ustedes rechazan, hay que devolverle la plata y queda mal. Propongo un modelo híbrido:

| Caso | Comportamiento |
|---|---|
| Disponibilidad verificada + pago aprobado + cliente sin antecedentes | **Auto-confirma.** Notificación informativa |
| Cliente nuevo sin historial | Auto-confirma pero **marcada para revisión**, con alerta alta |
| Cliente con deuda o antecedentes | **Requiere aprobación manual.** Pago se autoriza sin capturar |
| Alquiler largo (+15 días) o categoría premium | **Requiere aprobación manual** |
| Sin disponibilidad al confirmar el webhook | Rechazo automático + reembolso + alerta crítica |

En el sistema, una **bandeja de Reservas Web** con las acciones Aceptar / Rechazar (con motivo) / Contactar (link a WhatsApp), badge en el menú, y sonido/push para las que requieren acción. Cada reserva web genera una notificación de urgencia alta al instante — no espera al digest de las 8.

### 7.7 Landing pública — qué más va a hacer falta

Aunque todavía no esté definida: catálogo de flota por categoría con fotos, página de cada categoría, sucursales con mapa y horarios, requisitos para alquilar (edad, licencia, tarjeta, garantía), preguntas frecuentes, políticas de cancelación, formulario de contacto/cotización B2B (que puede alimentar el cotizador existente), y "Mi reserva" — consultar/cancelar con código + DNI, sin login.

**Técnicamente:** proyecto separado del sistema interno, consumiendo `/api/v1/public/*`. SEO real (SSR/SSG) porque acá el tráfico orgánico es el negocio. Rate limiting y captcha en los endpoints públicos. CORS acotado.

---

## 8. Resumen de cambios al modelo de datos

### Tablas nuevas (15)

| Tabla | Bloque | Prioridad |
|---|---|---|
| `notificaciones` | Alertas | 🔴 |
| `preferencias_notificacion` | Alertas | 🟡 |
| `comprobantes` | Finanzas | 🔴 |
| `recibos` | Finanzas | ✅ Hecho 2026-07-26 (migración 022, versión simplificada) |
| `recibo_imputaciones` | Finanzas | 🔴 No construida — depende de si se valida la imputación FIFO (ver 3.6) |
| `auditoria` | Transversal | 🟠 |
| `categorias` | Web | 🔴 |
| `sucursales` | Web | 🔴 |
| `cargos_one_way` | Web | 🟡 |
| `adicionales` | Web | 🔴 |
| `reserva_adicionales` | Web | 🔴 |
| `tarifas_calendario` | Web | 🔴 |
| `descuentos_duracion` | Web | 🟠 |
| `bloqueos_vehiculo` | Web | 🟠 |
| `partes_dano` | Operación | 🟠 |

### Tablas modificadas (8)

`clientes` (fiscales) · `vehiculos` (categoría, seguro, specs) · `reservas` (categoría, sucursales, origen, hold, pago externo) · `alquileres` (cargos extra, firma) · `pagos` (cliente_id, alquiler nullable, anulación) · `echeqs` (**cliente_id**, fecha_pago, ciclo completo) · `cuentas_corrientes` (**condición**, límite) · `movimientos_cuenta_corriente` (**condición, vencimiento**, saldo_posterior, FKs, anulación)

### Migraciones de tipo

Unificar `String(10)` → `Date` en: `pagos.fecha`, `echeqs.fecha_*`, `movimientos_cc.fecha`, `clientes.licencia_vencimiento`, `documentos.vigencia_*`. Es la causa raíz del bug 2.1 y de futuros. Hacerlo de una vez, con backfill.

**✅ Hecho (2026-07-26), migración 018.** Se migraron también, por ser la misma clase de bug: `conductores_adicionales.licencia_vencimiento`, `gastos.fecha` y `reservas.anticipo_fecha` (no estaban en la lista original pero mezclaban los mismos dos mundos). Todas las tablas tenían 0 filas excepto `clientes` (1) y `reservas` (varias) — riesgo de migración mínimo, verificado antes de escribir el `ALTER COLUMN ... USING col::date`.

`clientes.licencia_vencimiento` quedó **nullable** (no `NOT NULL` como se planteaba): el formulario de alta vigente (`ClienteFormDialog.tsx`) ya trata la licencia como opcional, y forzar el `NOT NULL` habría sido una decisión de producto (CLI-11, todavía abierta) disfrazada de migración técnica — se optó por no cambiar comportamiento sin que sea una decisión explícita.

De paso, dos bugs más encontrados y arreglados por quedar expuestos al mismo tipo de mezcla:
- `/reportes/flota` hacía `max(r.fecha_inicio, fecha_desde)` con `r.fecha_inicio` como `date` y `fecha_desde` como `str` — crasheaba con `TypeError` apenas había una reserva real en el rango consultado. Se tipó el query param como `date` en FastAPI, eliminando también el `try/except ValueError` manual que había alrededor.
- El filtro mensual de `/reportes/ingresos` usaba `Pago.fecha.like(f"{prefijo}%")`, que deja de tener sentido sobre una columna `Date`. Se reemplazó por `extract('year', ...) == anio, extract('month', ...) == mes`.

Verificado en vivo: `/reportes/flota?fecha_desde=2026-06-01&fecha_hasta=2026-06-30` calculó correctamente 3 y 2 días de ocupación para los vehículos con reservas reales en ese rango (antes crasheaba). Checkout con anticipo vía HTTP real generó un `Pago` con `fecha` como `date` propiamente tipado. `Documento`, `Gasto`, `Cliente`, `Echeq` y `MovimientoCuentaCorriente` probados con creación y actualización.

---

## 9. Orden de ejecución propuesto

### 🔥 Fase 0 — Estabilización (1-2 semanas) — ✅ completa, verificada el 2026-07-27
Sin esto no se puede construir arriba. **Los 12 bugs P0 están detallados en `docs/ANALISIS_CICLO_RESERVA.md`.**
Varios ítems se habían corregido sobre la marcha en fases posteriores sin volver a marcarlos acá; el 2026-07-27 se auditó el código uno por uno y se cerró la fase.
1. ✅ Aplicar migraciones 010→016 pendientes y verificar `alembic current` — hoy `alembic current` = `alembic heads` = `034_echeq_reserva`, sin pendientes
2. ✅ Arreglar el crash de `/notificaciones` (bug 2.1) — router reescrito en la Fase 2 contra la tabla `notificaciones`
3. ✅ **`Pago(usuario_id=)` → `cobrado_por=`** — verificado: `routers/pagos.py:161` y las 3 llamadas de `alquiler_service.py` usan `cobrado_por`
4. ✅ **Check-in tardío habilitado** — `checkout()`/`checkin()`/`extender()` aceptan `ACTIVA` **y** `VENCIDA` (`alquiler_service.py:87,331,521`); `extender()` devuelve la reserva a `ACTIVA` si la nueva fecha queda en el futuro
5. ✅ **Cálculo de excedente** — verificado: `datetime.combine(reserva.fecha_fin, hora_devolucion)` (`alquiler_service.py:91,351`), mide contra `fecha_fin` como corresponde. `hora_inicio` sólo se usa como fallback de *hora del día* cuando no hay late checkout acordado, que es el comportamiento correcto por D1
6. ✅ **Corregir el precio semanal/mensual** — hecho 2026-07-26. Resultó ser un bug de UI, no de cálculo: `calcular_precio_total` (días × monto) siempre fue correcto, `monto` ya era precio por día en cualquier banda (test `test_siete_dias_tarifa_semanal` ya lo bloqueaba). Se agregaron labels/hints explícitos en `TarifasTab.tsx` + advertencia no bloqueante si el precio de una banda larga no es menor al de una corta
7. ✅ **Anticipo sin duplicar** — se materializa una sola vez: en el `checkout()` se crea el `Pago` del anticipo guardado en la reserva y **un solo** crédito en CC (`alquiler_service.py:227-249`)
8. ✅ **`extender()` ya no borra el precio** — si `seleccionar_tarifa()` no encuentra banda para la nueva duración, captura el `BusinessRuleError` y **conserva** `precio_anterior`/`tarifa_anterior_id` en vez de anularlos (`alquiler_service.py:556-566`)
9. ✅ **Kilometraje no retrocede** — validado en las dos puntas: check-out contra `vehiculo.km_actual` (`alquiler_service.py:152`) y check-in contra `alquiler.checkout_km` (`:343`)
10. ✅ Migrar todas las fechas `String` → `Date` — hecho 2026-07-26 (migración 018)
11. ✅ **`DELETE /pagos` es una anulación con contra-asiento** — `routers/pagos.py:189`, nunca borra el registro
12. ✅ **Datos del cliente corregibles** — `ClienteUpdate` expone `dni_cuit`, `tipo`, `licencia_numero`, `licencia_categoria`, `licencia_vencimiento` (`schemas/cliente.py:97-118`)
13. ✅ **Baja de cliente validada** — `ClienteService.deactivate()` rechaza con `cliente_con_reservas_activas` si tiene reservas en `pendiente`/`confirmada`/`activa`/`vencida` (el auto puede estar afuera)
14. ✅ **Archivos muertos limpiados** — `pages/clientes/List.tsx`/`Detail.tsx` y 4 de los 5 previews del cotizador ya no existían; el 2026-07-27 se eliminó `components/clientes/ClienteTable.tsx` (0 referencias — el listado real usa un `ClienteRow` propio dentro de `ClientesList.tsx`). `CotizacionPreview3.tsx` **no** es muerto: lo usa `CotizadorPage.tsx`
15. ✅ **Cero errores de TypeScript** — 2026-07-27, de 13 a 0 (`npx tsc --noEmit`, `npm run build` en verde). Entre ellos había **un bug real**: `ESTADO_ECHEQ_LABEL`/`ESTADO_ECHEQ_COLOR` no tenían la clave `pendiente` (estado legacy), así que un echeq en ese estado renderizaba sin estilo; y `MantenimientoTab.tsx` le pasaba a `ConfirmDialog` un prop `onCancel` inexistente en vez de `onOpenChange`, con lo cual cerrar el diálogo por ESC/overlay no limpiaba el estado

### 💰 Fase 1 — Finanzas conectadas + reglas de negocio (3-4 semanas)
16. ✅ Rediseñar cuenta corriente como ledger inmutable (`saldo_posterior`, `condicion`, `fecha_vencimiento`, anulación, FKs) — hecho 2026-07-26 (migración 019). Ver detalle abajo
17. ✅ Echeq: `cliente_id` + ciclo de vida completo + generación de movimiento en CC — hecho 2026-07-26 (migración 020). Frontend: rechazo ahora exige motivo (ver 3.6-bis)
18. ✅ Automatismos de asientos (checkout → débito, pago → crédito, multa → débito, recibo → crédito) — hecho 2026-07-26
19. ✅ Datos fiscales del cliente + **empresa vs particular** (contactos con puesto, formulario condicional) — hecho 2026-07-26 (migración 023). Ver detalle abajo
20. ✅ **Conductor ≠ pagador** en la reserva — hecho 2026-07-26 (migración 024). `Reserva.conductor_id` (nullable, apunta a `conductores_adicionales` del propio cliente); si es NULL, el cliente es quien maneja (comportamiento de siempre). `MultaService.buscar_responsable()` ahora devuelve también el conductor real, no sólo el cliente que paga. Selector en `ReservaModal.tsx`, visible sólo si el cliente tiene conductores adicionales cargados
21. ✅ **Rediseño de tarifas — primera etapa**: categoría como entidad nueva (D-08), `precio_por_dia` explícito por vehículo **y** por categoría — hecho 2026-07-26 (migración 025). Ver detalle abajo. **Sin calendario/estacionalidad todavía** (`tarifas_calendario` con prioridades queda para la Fase 5, cuando la reserva pase a ser por categoría en la web)
22. ✅ **Descuentos auditados** (precio de lista vs cobrado, motivo, autorizado por) + **con/sin factura** en la reserva — hecho 2026-07-26 (migración 026, PRE-10/RES-14)
23. ✅ **`VENCIDA`** (Fase 0) + **política de seña en cancelación y "no-show"** — hecho 2026-07-26 (migración 027). **`NO_SHOW` y `CERRADA` NO se construyeron**: D-17 decidió explícitamente no crear un estado `NO_SHOW` ("distinguir de quién fue la culpa es hilar demasiado fino para el volumen actual"); este ítem del roadmap quedó desactualizado respecto de esa decisión posterior. `CERRADA` nunca se terminó de definir en ninguna decisión — no se implementa sin una decisión real detrás. Ver detalle abajo
24. ✅ **Cargos de cierre**: combustible faltante y limpieza — hecho 2026-07-26 (migración 028, D-20). **Van como gasto del vehículo por defecto, no como cargo al cliente** — corregido en la misma tarea después de implementarlo mal la primera vez (ver `docs/CASOS_DE_USO.md` CIN-13/14 y la memoria del proyecto). La "liquidación de garantía contra los cargos" ya existía de antes (`garantia_estado`/`garantia_monto_devuelto`, decisión manual del operador) — no se tocó
25. ✅ **Pipeline de PDF server-side** (ReportLab) — hecho 2026-07-26, usado por Recibos. Contratos/facturas/presupuestos todavía sin migrar a este pipeline
26. ✅ **Módulo de Recibos** — hecho 2026-07-26, versión simplificada (ver 3.6-bis): numeración vía secuencia + PDF + monto en letras + descarga. **Imputación FIFO y medios de pago mixtos quedaron afuera** — a validar con los dueños si hace falta
27. ✅ Módulo Comprobantes/Facturas (carga manual + PDF + vínculo a CC) — hecho 2026-07-26 (migración 029, FIN-19)
28. ✅ UI: ledger con Debe/Haber/Saldo + aging (`CuentaCorrienteTab.tsx`) · grilla de tarifas (`/flota/categorias`) · liquidación en el check-in (`CheckinModal.tsx`) · panel de estado en la reserva (`ReservaInfoModal.tsx`, mejorado no rediseñado) — hecho 2026-07-26, FIN-09/UI-07/UI-08/UI-10. **Fase 1 completa.**

### 🔔 Fase 2 — Alertas y Notificaciones (2 semanas) — ✅ completa (2026-07-26)
29. ✅ Tabla `notificaciones` + deduplicación (`clave_dedupe` UNIQUE) + auto-resolución — migración 030
30. ✅ Motor de reglas unificado — `domain/notificaciones_reglas.py` (25 reglas) + `services/notificacion_service.py`. `services/alertas.py` eliminado, router `notificaciones.py` reescrito contra la tabla
31. ✅ Scheduler APScheduler con TZ Argentina (`America/Argentina/Buenos_Aires`), arrancado desde el `lifespan` de FastAPI en `main.py` — corre todos los días a las 08:00 ART
32. ✅ Regla de echeq **T-2 días** + el resto del catálogo de 4.2. Se revisó y se agregaron 6 reglas que no estaban en el catálogo original: contrato sin firmar con entrega hoy, reserva pendiente >24hs, cliente supera límite de crédito, factura pendiente de emitir, vehículo fuera de servicio prolongado (requirió `Vehiculo.estado_desde`), licencia vencida con reserva futura, multa imputada sin cobrar >15 días (requirió `Multa.fecha_imputada`), service por fecha (no sólo por km). **2 reglas del catálogo original quedaron sin implementar** por depender de algo que no existe todavía: reserva nueva desde la web (Fase 5) y multa con descuento por pronto pago (no hay fecha límite modelada). Detalle completo: `docs/CATALOGO_NOTIFICACIONES.md`
33. ✅ Digest matutino por email (Resend) — hecho 2026-07-26, último en implementarse a propósito (pedido explícito del usuario). `NotificacionService.construir_digest()` arma un resumen agrupado por urgencia (crítica → baja) de todo lo activo; `enviar_digest_matutino()` lo manda a `settings.notificaciones_digest_destinatarios` (separados por coma) vía Resend. El scheduler lo llama automáticamente después de `generar()` en cada corrida de las 08:00 ART. También hay un trigger manual: `POST /notificaciones/enviar-digest`. Sin destinatarios configurados o sin `RESEND_API_KEY`, es un no-op silencioso (no rompe nada en desarrollo)
34. ✅ Campana in-app reescrita: leído / posponer ("recordarme mañana") / descartar / historial paginado (`NotificacionesPanel.tsx`, `HistorialNotificacionesDialog.tsx`)
35. 🟡 Preferencias por usuario — tabla `preferencias_notificacion` + `GET/PUT /notificaciones/preferencias` hechos, pero **sin UI ni aplicación real en las reglas todavía**: con un solo usuario (`dev_bypass_auth`) y sin canales fuera de in-app, no hay nada que diferenciar. Se retoma con Clerk (Fase 3.5) y el email

### 🎨 Fase 3 — UI/UX y validaciones (1-2 semanas) — ✅ completa, 2026-07-26
36. ✅ Menú reagrupado de 9 items planos a **6 grupos** (Hoy, Reservas, Flota, Clientes, Finanzas, Más) en `constants.ts::NAV_GROUPS` — no mueve rutas, agrupa la navegación (grupos de 1 item = link directo, de más de 1 = sección plegable que auto-expande con la ruta activa; colapsado, un dropdown al click). Sidebar `w-60`→`w-52`. Auto-colapso con hover-para-expandir en `/reservas` y `/ocupacion` (no toca la preferencia persistida del usuario en el resto de las pantallas)
37. ✅ Densidad de Reservas: barra de filtros colapsable con badge de filtros activos (arranca cerrada), header sticky, toggle de densidad cómoda/compacta persistido (`useAppStore::reservasDensidad`). La vista ya era tabla (no cards) desde antes de esta fase, así que ese punto ya estaba resuelto; no se agregó virtualización porque la paginación (20/página) ya acota el volumen — no había necesidad real
38. ✅ **Vencimientos como campos del vehículo** — migración 031, `Vehiculo.vtv_vencimiento`/`poliza_vencimiento`/`compania_seguro`/`nro_poliza`. Antes sólo existían como `Documento` genérico (dependía de que alguien subiera el archivo correcto con la fecha cargada); ahora son campos editables directos, con badge en `VehiculoTable.tsx` y dos reglas de notificación dedicadas (`vtv_vencimiento`/`poliza_vencimiento`) que reemplazan a la genérica para esos dos tipos. El módulo de Documentos sigue existiendo para el archivo adjunto. "Service por fecha" ya se había resuelto en la Fase 2 (`service_fecha_proximo/vencido`, usa `Servicio.proxima_fecha`)
39. ✅ **Matriz de bloqueos** + endpoints `pre-checkout` / `pre-checkin` con semáforo — no estaba detallado más allá del título en el plan original, así que se diseñó desde cero: `domain/bloqueos.py` evalúa una lista de condiciones (VTV/póliza vencida, vehículo fuera de servicio, solape pendiente → **bloqueante**; licencia vencida, deuda previa, sin garantía, contrato sin firmar, devolución atrasada, multas del vehículo sin imputar → **advertencia**) y devuelve semáforo rojo/amarillo/verde. `GET /reservas/{id}/pre-checkout` y `GET /reservas/{id}/pre-checkin`, consumidos por un punto de color (`SemaforoDot.tsx`) al lado de los botones Check-out/Check-in en `ReservasList.tsx` — con tooltip listando los ítems, sin tener que abrir el modal. Consistente con "el sistema informa, la persona decide": casi todo es advertencia, no bloqueo real. No duplica la validación real de `checkout()`/`checkin()`, que sigue siendo la autoridad
40. ✅ **Pantalla de Configuración** — tabla genérica clave/valor `configuracion` (migración 032) en vez de columnas fijas, para poder sumar parámetros después sin migración. Al revisar el sistema, lo único que era genuinamente una constante hardcodeada y tuneable era el control de 24hs (`domain/control_24hs.py`, D6): `excedente.gracia_minutos` (40), `excedente.multiplicador_hora` (3), `excedente.tope_horas_dia_extra` (12) — ahora `AlquilerService` los lee de la tabla en cada cálculo de excedente (`preview_excedente` y `checkin`), con fallback al default original si la fila no existe. El resto de lo mencionado en el título del ítem no aplica hoy como parámetro numérico: la política de seña (D-11) es binaria, no un porcentaje; los umbrales de notificaciones ya tienen su propio mecanismo de tuneo por usuario (`preferencias_notificacion`, Fase 2) y duplicarlos acá sería una segunda fuente de verdad. UI en `/configuracion` (grupo "Más" del menú), sólo rol admin puede editar. De paso: se eliminó `services/control_24hs.py`, un duplicado muerto (nadie lo importaba) del módulo real en `domain/`
41. ✅ Unificar paleta e íconos — se auditó el sistema real: `--primary` en `index.css` ya vale `#407EC9` (la paleta oficial), así que `bg-primary`/`text-primary` de shadcn **ya son** el color de marca. Los tokens semánticos (`danger`/`warning`/`success`) también coinciden en hex exacto con `red-600`/`amber-600`/`emerald-600`, así que esos no eran una inconsistencia real. El único desvío visual genuino era **indigo** (`#4F46E5`, un azul distinto al de marca) usado como color de acción primaria en 7 archivos (`ReservaModal.tsx`, `OcupacionPage.tsx`, `ReservasList.tsx`, `GarantiaTarjetaSection.tsx`, `MantenimientoTab.tsx`, `ExtenderModal.tsx`, `Dashboard.tsx`) — reemplazado por `primary` en sus ~10 variantes de opacidad. Íconos: la migración parcial a Heroicons que mencionaba `PROGRESO.md` eran sólo 2 archivos (`Dashboard.tsx`, `ReservaModal.tsx`) — migrados a sus equivalentes de lucide-react y **se desinstaló `@heroicons/react`** del proyecto; ahora hay un solo set de íconos en todo el frontend
42. ✅ Búsqueda global Cmd+K — `GET /buscar?q=` (nuevo router `busqueda.py`) reutiliza los mismos filtros `q` que ya tenían los listados de Clientes/Flota/Reservas (no duplica lógica), agrega match directo por ID si `q` es numérico, tope de 5 resultados por tipo. Frontend: `GlobalSearch.tsx` — Dialog con atajo Cmd/Ctrl+K global, debounce de 200ms, navegación con flechas + Enter, agrupado por tipo. Botón visible "Buscar…" en el `Header` (con el atajo mostrado) para que no dependa sólo de que alguien lo descubra por teclado — en mobile es un ícono

### 🩹 Fase 3-bis — Pulido de uso real (2026-07-27)
No estaba en el plan original — surgió de usar el sistema en vivo después de cerrar la Fase 3. Se agrupa acá, fuera de la numeración 1-64, para no correrla.

- ✅ **Reservas/Check-in/Extender, tanda de fricciones de uso real**: colores sólidos (no `bg-x/10` transparente) en Late Checkout y el cartel de check-out pendiente; chips de lugar de entrega/devolución predefinidos (Paraguay 241, Alsina 350, Aeropuerto Comandante Espora, Juan Francisco Seguí 3607) + "Otro"; **bug real corregido**: `PATCH /reservas/{id}` tiraba 409 al editar una reserva `activa`/`vencida` (p.ej. para agregar una nota post-checkout) — `reserva_service.py::update()` sólo aceptaba `pendiente`/`confirmada`, ahora también esas dos, igual que ya hacía `extender()`; botón "Editar" restaurado en `ReservasList.tsx` para alquileres activos (se perdía apenas había checkout); `ExtenderModal.tsx` rediseñado de tema oscuro a la paleta clara, con precio de la extensión como **extra** por día/total (sugerido según la tarifa vigente, editable) y el total nuevo aparte, informativo; `CheckinModal.tsx`: "Cobrar al cliente ahora" reubicado justo debajo de "Resumen financiero" con estilo sólido, y cartel de confirmación obligatorio si se registra el check-in sin marcarlo habiendo saldo pendiente.
- ✅ **Cartel "Check-out pendiente" consciente de fechas**: antes se disparaba siempre que el vehículo estaba `alquilado`, sin mirar si la reserva nueva realmente chocaba. Ahora compara la fecha de devolución esperada del vehículo contra el inicio de la reserva nueva — sólo alarma si hay riesgo real; si hay margen, es un texto chico informativo.
- ✅ **Bug real corregido — reporte "Flota" crasheaba**: `useReportes.ts` no desenvolvía el envelope `{data, success, message}` del backend (`useReporteFlota`/`useReporteIngresos` tipaban la respuesta como si viniera directa). `ReporteFlota` hacía `data.map` sobre el envelope entero → `TypeError`. `ReporteIngresos` tenía el mismo bug pero no crasheaba (usaba `?? []`) — quedaba en silencio mostrando "sin datos".
- ✅ **Menú: disuelto el grupo "Más"** (3 puntitos + desplegable) — Reportes/Notificaciones/Cotizador/Configuración pasan a ser ítems directos, como el resto. `NavGroup.principal` nuevo en `constants.ts` para destacar con texto en negrita los 5 grupos núcleo (Ocupación/Reservas/Flota/Clientes/Finanzas) en vez de esconder los secundarios.
- ✅ **Módulo de Notificaciones dedicado** (`/notificaciones`, `NotificacionesPage.tsx`) — antes sólo existía la campana (activas) y un diálogo chico de historial (sólo leída/descartada/resuelta). Ahora hay una página con filtros por día exacto o año/mes, cards grandes, paginación. `NotificacionService.list_historial()` ganó params `solo_resueltas`/`fecha`/`anio`/`mes` (default mantiene el comportamiento viejo de la campana). Se eliminó `HistorialNotificacionesDialog.tsx`, reemplazado por la página.
- ✅ **Onboarding Empresa/Particular al alta de cliente** — `ClienteFormDialog.tsx` ya tenía toda la lógica condicional por tipo; sólo faltaba que la elección fuera el primer paso (dos tarjetas grandes) en vez de un `<select>` perdido al final del formulario. Sólo aplica al crear — editar sigue directo al formulario.
- ✅ **Multas — mismo criterio de colores sólidos + acciones directas**: `ESTADO_MULTA_COLOR` pasó de `bg-x/15` a sólido; se agregó `ESTADO_MULTA_COLOR_OUTLINE` para que los botones de estado no activo mantengan su color característico (no gris genérico). Los botones Pendiente/Imputada/Apelando/Cobrada/Bonificada quedan siempre visibles y son un click directo (antes había que entrar a "Editar" y elegir de un `<select>`). **Se sacó la opción de Eliminar** de `MultasPage.tsx`/`MultasTab.tsx` (y `eliminarMulta` del hook) — consistente con [[regla_nunca_eliminar]]; el endpoint de baja lógica en el backend queda, sólo no hay botón que lo dispare.
- ✅ **Recibo — texto en letras**: `monto_a_letras()` (`domain/monto_letras.py`) decía "...con 00/100" (notación de cheque) hasta con importes exactos, lo cual confundía. Ahora omite la parte decimal si no hay centavos, y dice "con N centavos" en vez de "N/100" cuando sí hay.
- ✅ **Condición de pago por reserva + tipo de factura + seguimiento de vencimientos** (migración `033_condicion_pago_reserva`) — el más grande de la tanda. Antes no había forma de decidir, al cargar una reserva, si el saldo se paga al contado o a 15/30/60/90 días, ni desde cuándo se cuentan esos días. Se descubrió que la infraestructura de vencimientos **ya existía y ya estaba conectada a notificaciones** (`MovimientoCuentaCorriente.condicion`/`fecha_vencimiento`, `CuentaCorrienteService.registrar_movimiento()`, y las reglas `cc_vencimiento_proximo`/`cc_vencida` en `domain/notificaciones_reglas.py` ya disparan T-3/T-0 y escalado post-vencimiento para cualquier débito con vencimiento) — sólo que nada la alimentaba desde el checkout. Ahora:
  - `Reserva` suma `condicion_pago` (contado/cta_cte_15/30/60/90), `condicion_pago_ancla` (**sin default oculto** — lo elige la persona que carga la reserva: Check-out / Check-in / Otra fecha específica), `condicion_pago_fecha_ancla`, `tipo_factura` (A/B/C, sólo descriptivo — sin AFIP real, ver decisión #5), `factura_a_nombre_de`.
  - `AlquilerService.checkout()` pasa la condición de la reserva al débito; si el ancla es check-in, el vencimiento queda sin calcular a propósito (no se puede saber antes de tiempo) — `CuentaCorrienteService.registrar_movimiento()` ganó el parámetro `sin_vencimiento_automatico` para eso.
  - `AlquilerService.checkin()` completa el vencimiento pendiente cuando corresponde.
  - **Editar vencimiento a mano, siempre con motivo obligatorio** (`CuentaCorrienteService.editar_vencimiento()`, `PATCH /cuentas-corrientes/movimientos/{id}/vencimiento`, nuevo botón en `CuentaCorrienteTab.tsx`) — para extensiones, renegociaciones, o cuando el check-in tarda; sin roles todavía que restrinjan quién puede hacerlo (todos son admin por ahora), el motivo es lo que queda de rastro.
  - `CuentaCorrienteTab.tsx` suma un bloque "Próximo vencimiento" (lo que todavía no venció, no sólo el aging de lo vencido). `ClientesList.tsx` suma un badge "Pago pendiente" (débito vencido o a ≤3 días) — nuevo endpoint `GET /cuentas-corrientes/pendientes`.
- ✅ **Echeqs conectado a la reserva, "Flujo del día" en un botón, Ocupación sin bordes, menú por colores** (migración `034_echeq_reserva`) — segunda tanda del mismo día, cuatro pedidos que llegaron juntos:
  - **Echeqs dejó de ser una isla**: `Reserva` suma `echeq_banco`/`echeq_numero_cheque`/`echeq_fecha_cobro` (los tres opcionales — "podés completarlo ahora o dejarlo pendiente"). Si al cargar la reserva el medio de pago (previsto o del anticipo) es "echeq", `ReservaService.create()` genera un `Echeq` en el momento (`tipo="recibido"`, vinculado por el nuevo `Echeq.reserva_id` porque el `Alquiler` todavía no existe), con crédito en cuenta corriente sólo si hubo cobro real ya. `Echeq.banco`/`numero_cheque`/`fecha_cobro` pasaron a nullable para permitir el borrador; el response calcula `datos_completos` (sin columna nueva) para el badge "Pendiente de completar". `AlquilerService.checkout()` completa el `alquiler_id` del echeq heredado de la reserva. La lógica de "crear echeq + generar crédito" se extrajo a `EcheqService.crear_recibido()`, compartida entre `ReservaService` y el router de alta manual (que también ganó selector de cliente, antes inexistente). Nueva pestaña **Echeqs** en la ficha del cliente (`EcheqsTab.tsx`) con acción "Completar datos" inline y cambio de estado (incluye rechazo con motivo, revierte el crédito). `EcheqUpdate` ganó `banco`/`numero_cheque` para poder completar el borrador desde ahí.
  - **"Flujo del día"**: se sacó el resizer manual (arrastrar para agrandar/achicar, quedaba "bugueado"). Ahora hay un módulo fijo y permanente debajo del calendario (con scroll propio) y un botón centrado "Ver flujo del día" que abre un modal con la lista completa — nunca vuelve a tapar el calendario.
  - **Calendario de Ocupación sin bordes**: `/ocupacion` pasó a `fullBleed` en `AppLayout`, y la grilla perdió el borde/sombra — ocupa todo el ancho/alto disponible.
  - **Menú lateral con un color por sección** (`NAV_GROUP_COLOR` en `constants.ts`): Hoy sigue en el azul de marca; Reservas en índigo, Flota en verde azulado, Clientes en rosa, Finanzas en verde esmeralda. Reportes/Notificaciones/Cotizador/Configuración quedan neutros (utilidad, no sección núcleo).

### 🔐 Fase 3.5 — Auth con Clerk (3-5 días)
Adelantada respecto del plan original: hoy todo se graba con un usuario ficticio, y **cada recibo, pago y asiento de cuenta corriente que se emita mientras tanto queda sin autor real**. Cuanto antes se cierre, menos historial contable queda sin firmar.
43. Clerk en el frontend (React SPA + React Router — ya hay skills del stack disponibles)
44. Verificación de JWT de Clerk en FastAPI, reemplazando `DEV_BYPASS_AUTH`
45. Sincronizar usuarios de Clerk con la tabla `usuarios` vía webhook (`user.created` / `user.updated`)
46. Roles: `dueño` (todo) · `operador` (sin finanzas ni precios) · `documentacion` (solo lectura de docs — el tercer usuario que ya existe)
47. Backfill: mapear los registros históricos al usuario real que corresponda
48. Proteger el PIN de tarjeta (`Ubicar123` hardcodeado) detrás de rol, no de constante
49. Audit log de operaciones sensibles + override de bloqueos con motivo registrado

### 📄 Fase 4 — Contratos y parte de daños (2 semanas)
50. ⏸️ **Definir el texto legal del contrato** ← **bloqueado, depende de Franco/Martín.** Tiene el lead time más largo: pedirlo ya
51. ⏸️ Generación de PDF (reutiliza el pipeline de la Fase 1) + firma en canvas + hard block en checkout — bloqueado por el 50. `routers/contratos.py` sigue siendo un stub de 19 líneas
52. ✅ **Parte de daños con fotos en check-out/check-in, con daños preexistentes precargados** — hecho 2026-07-27 (migración `035_danios_vehiculo`). Ver detalle abajo
53. ✅ **Valorización de daños** — hecho 2026-07-27, junto con el 52

**Detalle de los ítems 52-53 (parte de daños):**

El estado del vehículo sólo se registraba como texto libre en
`alquileres.checkout_descripcion`/`checkin_descripcion`. No había forma de
saber qué daño ya estaba antes, cuál apareció durante el alquiler, ni de
cobrarlo. Ahora:

- **El daño le pertenece al vehículo, no al alquiler** (`danios.vehiculo_id`
  obligatorio, `alquiler_id` nullable). Por eso los daños no reparados
  sobreviven al cierre del alquiler y se precargan en el próximo check-out —
  que es exactamente lo que evita imputarle a un cliente un rayón que ya
  estaba. Un daño puede nacer en un check-out, en un check-in, o cargarse a
  mano sobre la ficha del vehículo (`momento`).
- **Detectar ≠ cobrar.** Registrar un daño no mueve plata. `responsable`
  arranca en `sin_definir` y lo decide una persona — el sistema no deduce
  culpas. Recién `POST /danios/{id}/imputar` genera el débito en la cuenta
  corriente, con monto editable (puede ser menor al costo estimado: el costo
  es un dato del taller, la imputación es una decisión comercial).
  `POST /danios/{id}/bonificar` lo revierte con un contra-asiento y motivo
  obligatorio — mismo patrón que multas. `movimientos_cuenta_corriente` sumó
  `danio_id`, como cualquier otro origen de asiento.
- **Fotos**: reutilizan el `IStorage` que ya usan Documentos y Comprobantes,
  así que funcionan igual con almacenamiento local hoy y con R2 cuando se
  migre. Las fotos sí se borran de verdad (son un adjunto, no una entidad de
  dominio); el daño nunca — `activo=False`, y un daño ya imputado ni siquiera
  se puede dar de baja sin bonificarlo antes.
- **Frontend**: pestaña "Daños" en la ficha del vehículo, bloque sólido de
  daños preexistentes en el check-out ("no son responsabilidad de este
  cliente") y alta de daños nuevos dentro del check-in.
- **Lo que quedó afuera a propósito**: el **croquis** interactivo del ítem
  original. Se reemplazó por un campo `zona` con sugerencias (`datalist` de 20
  zonas, pero se puede escribir cualquier otra) — cubre el mismo caso de uso
  sin el costo de un SVG con hotspots, y no obliga a migrar nada si después se
  quiere agregar el croquis encima.

### 🌐 Fase 5 — Cimientos para la web (3 semanas)
54. 🟡 **Categorías de vehículo + migrar la flota existente** — la entidad, las 6 categorías y la tarifa por categoría están hechas desde la F1 (ítem 21), y el selector existe en `VehiculoFormDialog`. Lo que faltaba era **cargar el dato**: al 2026-07-27 los 16 vehículos tenían `categoria_id = NULL`, con lo cual la tarifa por categoría nunca podía dispararse (sólo aplicaban las tarifas por vehículo puntual). **Asignadas las 7 pick-ups** (3 Hilux, Amarok, 2 Tunland, Titano), que no admiten discusión. **Quedan 9 autos sin categoría a propósito**, esperando la decisión #8: la segmentación compacto / sedán / sedán superior fija el tier de precio de la web, así que la definen Franco y Martín, no el sistema:
    - `PMH625` Chevrolet Corsa Classic · `AH762UL` Fiat Argo Drive MT
    - `AG591WA` / `AH021RK` / `AH067LW` / `AH462EG` Fiat Cronos Drive 1.3
    - `LGW669` Fiat Siena Essence · `AF865DD` Toyota Etios 1.5 XLS AT
    - `AG902AQ` VW Virtus 1.6 (candidato a "sedán superior", es el más equipado)
    Las categorías `SUV` y `Furgón` existen pero hoy no las usa ningún vehículo.
55. ❌ **Sucursales + cargos one-way — descartado por ahora (decisión del usuario, 2026-07-27).**
    *"Eso de sucursales de momento solo es en Bahía Blanca, de manera más local."*
    Con toda la operación en una sola ciudad no hay one-way que cobrar ni
    horarios de sucursal que validar: la tabla `sucursales` y el cargo por
    devolver en otro lado no resuelven ningún problema real hoy. **Los puntos
    de retiro ya están resueltos** desde la Fase 3-bis como chips predefinidos
    en la reserva (`LUGARES_PREDEFINIDOS` en `ReservaModal.tsx`: Paraguay 241,
    Alsina 350, Aeropuerto Comandante Espora, Juan Francisco Seguí 3607) más
    "Otro" como texto libre — que es exactamente el nivel de formalidad que el
    negocio necesita. Se retoma si abren en otra ciudad; hasta entonces,
    modelar sucursales sería estructura sin uso.
    **Impacto en el resto del plan:** el paso 1 del flujo web (§7.4) pierde el
    selector de sucursal de retiro/devolución y queda sólo con fechas; el
    pipeline de precios (§7.2) pierde la línea "+ cargo one-way".
56. ✅ **Adicionales + adicionales por reserva** — hecho 2026-07-27 (migración `040_adicionales`). Ver detalle abajo
57. ✅ **Motor de precios por calendario** + pantalla de administración — hecho 2026-07-27 (migración `039_motor_precios`). Ver detalle abajo
58. **Reserva por categoría** (`vehiculo_id` nullable) — el cambio estructural
59. Bloqueos de vehículo por fecha

**Detalle del ítem 57 (motor de precios por calendario):**

Construido sobre `fechas_especiales` (migración 036), que se había hecho
explícitamente como su ancla. Migración `039_motor_precios`, dos tablas:
`tarifas_calendario` y `descuentos_duracion`.

- **Las tres capas que describieron los dueños son la misma tabla con
  distinta `prioridad`** (base anual 0 · fecha especial 10 · promo 20). La
  de mayor prioridad que cubre el día gana **sin borrar lo de abajo**: dar de
  baja la promo hace que el precio anterior vuelva a aplicar solo, que es la
  propiedad que hace que esto sea usable todas las semanas sin miedo.
- **El desempate es explícito y determinista** (`domain/precios.py::resolver_regla_dia`):
  prioridad → especificidad (vehículo > categoría > general) → rango más
  corto → id más alto. **La prioridad le gana a la especificidad a
  propósito**: es el eje que el dueño carga a mano y el único que se ve en la
  pantalla, así que una promo de categoría en 20 le gana a un precio de
  vehículo puntual en 0. Para sacar un vehículo de una promo se le carga su
  regla con prioridad ≥ 20 — una acción explícita, no un efecto lateral.
- **`domain/tarifas.py` no quedó como camino paralelo**: es el caso de menor
  prioridad del motor. Cada día que ninguna regla cubre usa la tarifa por
  banda de siempre, así que **un sistema sin ninguna regla cargada cotiza
  exactamente igual que antes**. Por eso esto entró sin migrar datos ni tocar
  las reservas existentes. Si no hay ni regla ni tarifa, levanta
  `BusinessRuleError` en vez de cotizar $0: cobrar de menos en silencio es
  peor que fallar.
- **`fecha_especial_id`** es el "acoplar todo a esto": una regla hereda el
  rango de la fecha especial en vez de repetirlo. "Navidad 2026" se define
  una sola vez y sirve para el calendario de ocupación **y** para el precio;
  si se corrige el rango, los precios que cuelgan se corrigen solos.
- **`canal`** (`ambos`/`web`/`mostrador`) en vez del `visible_web` booleano
  del diseño original: es estrictamente más expresivo — cubre ocultar de la
  web, y además la promo que existe **sólo** online.
- **`POST /precios/calcular`** devuelve el **desglose día por día** con la
  regla que originó cada precio. Es lo que hace el módulo debuggeable cuando
  alguien discute un importe, y lo que va a consumir la web para el
  "antes $X, ahora $Y" (`total_referencia` vs `total`).
- **Pantalla `/precios`**: grilla categorías × días del mes con el precio ya
  resuelto por celda (4 estados visuales, incluido "sin precio configurado"
  en rojo para ver dónde falta cargar), ABM de reglas con las tres capas como
  preset, descuentos por duración, y un **probador de precio** que cotiza
  contra el mismo endpoint que las reservas — sin eso, entender qué paga el
  cliente con tres reglas superpuestas es adivinar.
- **41 tests** de dominio puro (`tests/domain/test_precios.py`), sin base.
- **No se sembró ninguna regla**: los precios los cargan Franco y Martín.
  Sembrar precios inventados sería peor que no tener ninguno.

**Detalle del ítem 56 (adicionales):**

Confirmado por el usuario el 2026-07-27: *"Los adicionales los cargan ellos,
con precio y demás"*. Eso define el diseño — **es un ABM, no un enum en el
código**: la lista no está cerrada y cambia con la temporada.

- **Dos grupos con reglas de selección distintas** (plan §7.4, paso 2):
  `cobertura` se elige **una sola** (son niveles del mismo seguro, no
  complementos) y `extra` se eligen todas las que quiera. La exclusividad
  vive en el grupo y no en una columna por fila, para que no se pueda cargar
  un estado imposible de interpretar al cobrar. **Se valida en el backend**,
  no sólo en la UI: la web es pública y un request armado a mano con dos
  coberturas dejaría una reserva cobrando dos seguros del mismo auto.
- **`reserva_adicionales` congela el precio al contratarse.** Si mañana suben
  el precio de la cobertura full, las reservas ya cargadas siguen valiendo lo
  pactado — mismo criterio que `Reserva.precio_lista`. Sin esto, cambiar un
  precio reescribiría el pasado.
- **`unidad_cobro`** (`por_dia` / `unico`): un seguro se paga todos los días
  que el auto está afuera, un portaequipaje se cobra una vez.
- **`franquicia` es un campo propio de las coberturas**, no una frase dentro
  de `descripcion`: es el motivo #1 de conflictos post-siniestro y el plan
  pide que esté explicada en una línea clara. Se rechaza cargarla en un extra.
- **Los adicionales quedan fuera del descuento por duración**, a propósito:
  ese descuento bonifica el alquiler del vehículo, y aplicarlo también al
  seguro regalaría cobertura sin que nadie lo decida. Es el orden del
  pipeline de §7.2. Por eso la cotización ahora expone `subtotal_vehiculo`
  aparte de `total`, y `precio_dia_promedio` mide sólo el auto.
- **`max_cantidad`** por adicional (2 sillas de bebé, 1 GPS), validado en el
  service — es una regla del catálogo, no del cálculo.
- **Pantalla `/adicionales`** con las coberturas y los extras separados, cada
  grupo con su regla explicada. El probador de `/precios` ya cotiza con
  adicionales, así que se puede verificar el total real antes de venderlo.
- **No se sembró ninguno**: la lista y los precios los cargan Franco y Martín.

**Lo que falta para cerrar el acople completo:** `ReservaService.create()`
sigue calculando el precio con `seleccionar_tarifa` directo en vez de llamar
al motor. Es seguro hacerlo (sin reglas cargadas da el mismo número), pero
cambia cómo se cotiza toda reserva real, así que conviene hacerlo junto con
el ítem 58 (reserva por categoría) y no suelto. Lo mismo el cotizador.

**Los adicionales sí quedaron acoplados a la reserva** (2026-07-27, misma
tanda). Resultó menos riesgoso de lo estimado: es un cambio **aditivo** —
con la lista vacía, que es el caso de todas las reservas existentes, no
cambia absolutamente nada. Detalle:

- `ReservaCreate` y `ReservaUpdate` aceptan `adicionales`. En el PATCH,
  **omitirlo = no tocar nada** y **`[]` = sacarlos todos**: si no se
  distinguieran, cualquier edición parcial (cambiar una nota) borraría los
  adicionales en silencio.
- **Van fuera de `precio_total`, igual que `cargo_late_checkout`.** Meterlos
  adentro habría roto la auditoría de descuentos: `precio_lista` vs
  `precio_total` mide el descuento **sobre el vehículo**, y un seguro caro
  se habría leído como un recargo no autorizado. Se suman al facturar, en
  `Reserva.total_adicionales`.
- Se sumaron a los **4 lugares** que calculan el monto a cobrar:
  `AlquilerService.checkout()` (el débito en cuenta corriente),
  `routers/pagos.py` ×2 (saldo pendiente) y `notificaciones_reglas.py`
  (regla de deuda vencida). Verificado contra la base: un alquiler de
  $300.000 con seguro de $60.000 genera un débito de $360.000.
- **Al extender el alquiler, los adicionales `por_dia` se recalculan** con la
  duración nueva — si el auto se queda 3 días más, el seguro los cubre. El
  precio unitario congelado no se toca: cambia la cantidad de días, no lo
  pactado por día.
- **Después del check-out no se pueden modificar** (`reserva_ya_facturada`):
  el débito ya está en el ledger y cambiarlos dejaría la reserva diciendo
  una cosa y la cuenta corriente otra.
- UI: bloque de adicionales en `ReservaModal` (coberturas como opción única,
  extras múltiples) con el total a facturar en vivo, y el detalle en
  `ReservaInfoModal`. Tras el check-out se muestran como texto, sin editar.

**Lo que sigue faltando es sólo el ítem 58** (reserva por categoría), que sí
es el cambio estructural pesado, más el acople del cálculo de precio de la
reserva al motor.

**🟠 Hueco preexistente encontrado (no introducido por este cambio):**
`AlquilerService.extender()` actualiza `precio_total` **pero no genera
ningún asiento en la cuenta corriente** por la diferencia. Si un alquiler se
extiende después del check-out, el débito original queda corto y el ledger
subfactura. `routers/pagos.py` sí calcula el saldo pendiente contra el
precio nuevo, así que el saldo se ve bien en pantalla pero **no coincide con
la suma de los movimientos** — que es exactamente lo que el ledger inmutable
de la Fase 1 vino a evitar. Vale arreglarlo antes de la web.

### 🚀 Fase 6 — Reservas web (4 semanas)
60. Endpoint de disponibilidad real por cupo
61. Sistema de holds con expiración
62. Integración Mercado Pago + webhook idempotente
63. Landing + flujo de 3 pasos ← **ya no se arranca de cero**, ver 9.1
64. Bandeja de Reservas Web en el sistema con aceptar/rechazar

**Total estimado: 18-21 semanas.** Las fases 0-3.5 (9-10 semanas) ya dejan el sistema interno completo, sólido y con auth real — es el corte natural si se quiere poner en producción antes de encarar la web.

---

## 9.1 La landing ya existe — migración a Next.js ✅ **hecha (2026-07-27)**

> **Estado: los pasos 1-6 de este plan están ejecutados.** La web vive ahora en
> `web/` dentro de este repo (junto a `backend/` y `frontend/`), en Next.js 16
> con App Router. Documentación operativa en `web/README.md`. Lo que sigue
> pendiente es el flujo de reserva (Fase 6), que depende de la Fase 5.
>
> **Lo que se ganó, medido:** `/` y `/maquinaria` se prerenderizan **estáticas**
> — antes el HTML servido era un `<div id="root">` vacío. El `title`, la
> `description` y los tres bloques JSON-LD (LocalBusiness, FAQPage y los
> `Product` de maquinaria) ahora viajan en el HTML, que era el objetivo del
> punto 1 de "por qué Next.js sí conviene".
>
> **🔴 Acción pendiente de seguridad:** el access token de la Meta Conversions
> API estaba **hardcodeado en el bundle público** (`src/lib/meta-pixel.ts` de
> la versión Vite; el propio código lo admitía en un comentario). Se movió a
> `app/api/track/route.ts` con el token en variable de entorno del servidor,
> pero **el token viejo estuvo expuesto en producción y hay que rotarlo en
> Meta Business**.
>
> **Desvíos respecto del plan original, con su motivo:**
> - Se mantuvo **Tailwind 3** en vez de adoptar la v4 que trae el scaffold:
>   migrar los tokens HSL a la sintaxis CSS-first arriesgaba deriva visual
>   sobre un diseño ya aprobado, sin beneficio a cambio.
> - Se copiaron sólo los **7 componentes de shadcn** que la landing usa de
>   verdad, no los 47 del proyecto original.
> - `next/image` **todavía no se aplicó** a los `<img>` de los componentes: la
>   migración priorizó que el diseño quedara idéntico. Es una optimización
>   incremental que se puede hacer archivo por archivo sin romper nada.

<details>
<summary>Plan original (previo a la ejecución)</summary>


**Descubierto el 2026-07-27.** Ya hay una landing de Ubicar hecha y aprobada
("gustó mucho") en `Desktop/1. Clientes/ubicar-rent-pro`. El ítem 63 no
arranca de cero: se migra esto y se le suma el flujo de reserva.

### Qué es hoy

Una **landing de marketing, no una app de reservas**: 3.705 líneas, 3 rutas
(`/`, `/maquinaria`, 404) y 15 componentes — Hero, VehiclesSection,
AccessoriesSection, EmpresasSection, LocationSection (692 líneas, el más
grande), ContactSection, MaquinariaCTA, InstagramStrip, FloatingWhatsApp,
Footer, Header.

| | Landing actual | Sistema (`frontend/`) |
|---|---|---|
| Build | Vite 5 | Vite 5 |
| React | 18.3 | 18 |
| Router | react-router-dom 6 | react-router-dom 6 |
| UI | shadcn/ui + Radix | shadcn/ui + Radix |
| Estilos | Tailwind 3 | Tailwind 3 |
| Datos | TanStack Query (instalado, sin backend) | TanStack Query |
| Animación | framer-motion 12 | — |

**El stack es prácticamente idéntico al del sistema.** Eso es lo que hace la
migración barata: los componentes de UI (Radix + Tailwind) son isomórficos,
no hay nada atado a Vite salvo el entrypoint, el router y los imports de
assets.

### Por qué Next.js sí conviene acá

No es sólo preferencia: la landing ya tiene dos cosas que hoy están a medias
por ser SPA pura.

1. **SEO.** Una landing de alquiler de autos vive de Google. Hoy es un SPA
   que sirve un `<div id="root">` vacío. Con SSG/SSR el contenido llega
   renderizado.
2. **Meta Pixel + API de Conversiones.** `src/lib/meta-pixel.ts` ya intenta
   hacer el tracking del lado del servidor desde el navegador — eso necesita
   un endpoint propio para no exponer el token. Es literalmente una API route.

Además, el flujo de reserva que viene (holds, Mercado Pago, webhook) necesita
server-side sí o sí: el **webhook de Mercado Pago no puede vivir en un SPA**.

### Cómo migrar (orden propuesto)

1. **`create-next-app` con App Router + TypeScript + Tailwind**, y copiar
   `tailwind.config.ts` + los tokens de `index.css` tal cual — la identidad
   visual no se toca en ningún momento.
2. **Copiar `src/components/ui/` completo.** shadcn no cambia entre Vite y
   Next; sólo hay que agregar `"use client"` arriba de los que usan hooks o
   Radix con estado.
3. **Rutas:** `/` → `app/page.tsx`, `/maquinaria` → `app/maquinaria/page.tsx`,
   404 → `app/not-found.tsx`. `react-router-dom` desaparece;
   `<Link>`/`<NavLink>` pasan a `next/link` (`NavLink.tsx`, 28 líneas, se
   reescribe).
4. **Assets: el punto más pesado.** Hay **12 MB** en `src/assets/` importados
   como módulos de Vite. Pasan a `/public` y los `<img>` a `next/image` — que
   de paso resuelve el peso con WebP/AVIF y lazy loading automático. Esto
   solo justifica buena parte de la migración.
5. **Componentes:** mayormente copy-paste. `ScrollReveal.tsx` y todo lo que
   toque `window`/`IntersectionObserver` va con `"use client"`.
   `framer-motion` funciona igual, también como client component.
6. **`meta-pixel.ts` → `app/api/track/route.ts`**, con el token en variable
   de entorno del servidor en vez de en el bundle.
7. **Datos hoy hardcodeados** que pasan a venir del backend cuando se conecte:
   los 3 bloques de vehículos por categoría de `VehiclesSection.tsx` (hoy
   compacto / sedán intermedio / sedán superior, con CTA a WhatsApp), que son
   justamente las **categorías** que ya existen en el sistema (ítem 54).
   Teléfonos, WhatsApp, mail e Instagram de `lib/constants.ts` se quedan como
   constantes — no justifican una tabla.

### Lo NUEVO que se suma encima

La landing hoy termina siempre en un **link de WhatsApp**: no hay reserva, no
hay precio real, no hay disponibilidad. Lo que se agrega:

- Buscador de disponibilidad por **categoría** + fechas (necesita el ítem 60).
- Flujo de reserva de 3 pasos con hold temporal (ítem 61).
- Checkout con seña por Mercado Pago (ítem 62) — el webhook como API route.
- Las reservas caen en la bandeja del sistema para aceptar/rechazar (ítem 64).

**El WhatsApp no se saca**: sigue siendo el canal que funciona hoy. Convive
con la reserva online.

### Dependencias

Esto **no se puede empezar antes que la Fase 5**: sin `reserva por categoría`
(ítem 58, `vehiculo_id` nullable) y sin el motor de precios por calendario
(ítem 57), la web no tiene qué vender ni a qué precio. La migración a Next.js
en sí (pasos 1-6) **sí se puede hacer en paralelo**, porque es puramente de
presentación y no toca el backend.

### Hueco a cerrar antes

Al 2026-07-27 quedan **9 de 16 vehículos sin categoría** (las 7 pick-ups ya se
asignaron). Es la segunda mitad del ítem 54 y es requisito de todo lo anterior:
la web vende categorías. La segmentación de los 9 autos la definen Franco y
Martín — ver `docs/VALIDAR_CON_DUENOS.md` punto 7.

</details>

### 📐 Después de la Fase 1 — Diagramas
Cuando el modelo esté estabilizado, generar en Mermaid (versionados junto al código): diagrama de estados de reserva y vehículo, ER actualizado (`docs/er-diagram.html` quedó viejo), flujo operativo de punta a punta, mapa de conexiones entre módulos, y flujo de la web. **No antes**: hoy el modelo va a cambiar bastante y un diagrama hecho ahora nace desactualizado. Detalle en `docs/CASOS_DE_USO.md`.

---

## 10. Decisiones que hay que tomar (bloquean el diseño)

| # | Decisión | Recomendación |
|---|---|---|
| 1 | **Signo del saldo de CC:** ¿positivo = deuda o positivo = a favor? | Positivo = deuda (convención contable). Requiere invertir el frontend actual |
| 2 | **¿La web reserva categoría o vehículo específico?** | **Categoría.** Es la decisión más importante — cambia el modelo de Reserva |
| 3 | **¿Seña o pago total online?** | Seña 30% |
| 4 | **¿Reserva web auto-confirma o requiere aprobación?** | Híbrido (ver 7.6) |
| 5 | **¿Facturación electrónica AFIP ahora o después?** | Después. Dejar los campos preparados |
| 6 | **¿WhatsApp automático?** | Fase 3. Requiere WhatsApp Business API con costo por mensaje |
| 7 | **Texto del contrato** | ⚠️ Bloqueante. Pedirlo ya |
| 8 | **Categorías concretas y su composición** | Definir con Franco/Martín sobre la flota real |
| 9 | **Lista de adicionales y precios** | Definir. Los seguros con su franquicia son lo urgente |
| 10 | **Sucursales / puntos de retiro** | Definir cuáles y con qué horarios |
| 11 | **Política de cancelación** | Definir. Va en el contrato y en la web |
| 12 | **Buffer entre alquileres** | Sugerido: 2-3 horas para limpieza y revisión |
| 13 | ~~**Proveedor de auth**~~ | ✅ **Decidido: Clerk.** Fase 3.5 |
| 14 | ~~**Numeración de recibos**~~ | ✅ **Decidido e implementado:** arranca en `00001`, secuencia de Postgres. Ver 3.6 |
| 15 | ~~**Texto de agradecimiento del recibo**~~ | ✅ **Decidido e implementado:** texto fijo, ver PDF en 3.6 |
| 16 | ~~**¿El recibo se manda por email o se descarga y se manda a mano?**~~ | ✅ **Decidido:** se descarga (implementado). Email queda pendiente, sin botón todavía |

---

## 11. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Cambiar `Reserva.vehiculo_id` a nullable rompe ocupación, solapamientos y reportes | Alto | Hacerlo en Fase 5, aislado, con tests de regresión sobre `domain/solapamientos.py` |
| Migración de fechas String→Date con datos existentes | Medio | Backfill validado en copia de la base primero |
| Sobreventa en la web por concurrencia | Alto | Holds + re-verificación en el webhook + constraint de exclusión en base |
| Saturación de alertas → las apagan todas | Medio | Urgencias bien calibradas + digest agrupado + preferencias por usuario |
| El contrato legal demora y bloquea la web | Alto | Pedirlo en la semana 1 |
| Auth sigue en bypass al exponer la web | Crítico | Clerk adelantado a Fase 3.5, antes de contratos y de la web |
| Migrar a Clerk rompe los `usuario_id` históricos | Medio | Mapeo explícito Clerk→`usuarios` + backfill; no borrar la tabla local |
| Recalcular el saldo de CC con datos históricos ya cargados | Medio | Asiento de "saldo inicial" por cliente, no recalcular hacia atrás |
| ~~Recibos con numeración duplicada por concurrencia~~ | Medio | ✅ Resuelto — secuencia `recibos_numero_seq` + constraint único, migración 022 |

---

## 12. Resumen ejecutivo

**Lo que está bien:** el núcleo operativo (flota, clientes, reservas, ocupación, check-in/out) está sólido y bien pensado. El calendario de ocupación y el flujo de check-out con garantía y tarjeta son mejores que los de muchos sistemas comerciales del rubro.

**Lo que está flojo:**
1. Un bug que tira abajo las notificaciones apenas haya un alquiler finalizado con deuda
2. El scheduler de alertas nunca arrancó — no se envía nada, nunca
3. Los echeqs son una isla sin cliente, sin cuenta corriente y sin ciclo de vida
4. La cuenta corriente es un número mutable, no un libro auditable
5. No existe el contrato, que es lo que bloquea la entrega legal del auto
6. ~~No hay forma de darle un comprobante al cliente cuando paga~~ — ✅ Recibo resuelto 2026-07-26 (versión simplificada, ver 3.6). Factura sigue sin existir
7. El endpoint público de disponibilidad devuelve datos incorrectos
8. Faltan las cuatro entidades que la web necesita: categorías, sucursales, adicionales y precios por calendario
9. Todo se sigue grabando con un usuario ficticio

**El orden importa:** arreglar lo roto → conectar las finanzas y poder emitir recibos → construir las alertas → pulir la UI → cerrar auth con Clerk → contratos → recién ahí, los cimientos de la web. Saltear la Fase 0 significa construir sobre un sistema que ya tiene un endpoint caído.

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

**Backend** (`backend/app/`): 19 routers, 17 modelos, 16 migraciones (008→016).

| Módulo | Backend | Frontend | Conectado con | Veredicto |
|---|---|---|---|---|
| Flota | ✅ completo | ✅ | Reservas, Gastos, Docs, Servicios, Tarifas | Sólido |
| Clientes | ✅ | ✅ 6 tabs | Reservas, Multas, CC, Docs, Tarjeta | Sólido |
| Reservas / Alquileres | ✅ 1.000+ líneas | ✅ | Todo | El corazón, sano |
| Ocupación | ✅ | ✅ timeline + agenda | Reservas | Muy bueno |
| Dashboard | ✅ | ✅ | Reportes | Bueno |
| Multas | ✅ | ✅ global + por cliente | Cliente, Alquiler | ⚠️ No llega a CC |
| Servicios/Mantenimiento | ✅ | ✅ | Vehículo (km) | Bueno |
| Caja / Pagos | ✅ | ✅ | Alquiler, CC | ⚠️ Ver 2.4 |
| Echeqs | ⚠️ mínimo | ✅ | **nada** | 🔴 Isla |
| Cuentas Corrientes | ⚠️ básico | ✅ | Cliente, Pagos | 🔴 Sin ledger |
| Notificaciones | ⚠️ computed | ✅ campana | — | 🔴 Ver 2.1 |
| Reportes | ✅ | ✅ | Pagos, Gastos | Bueno |
| Recibos | ❌ no existe | ❌ | — | 🔴 A construir |
| Facturas / Comprobantes | ❌ no existe | ❌ | — | 🔴 A construir |
| Cotizador | ❌ sin BD | ✅ frontend puro | **nada** | Isla deliberada |
| Contratos | ❌ TODO | ❌ placeholder | Alquiler | 🔴 Bloqueante |
| Público (web) | ❌ stub roto | — | — | 🔴 A construir |

### 1.2 Las tres islas

El sistema está bien conectado **salvo en tres lugares**, y justamente son los tres que el pedido apunta:

1. **Echeq ↔ Cliente ↔ Cuenta Corriente.** Hoy un echeq no sabe de qué cliente es. `models/echeq.py` guarda `contraparte` como texto libre de 255 caracteres. No hay `cliente_id`, no hay `cuenta_corriente_id`, no hay movimiento de CC generado. Si un cliente te paga con 3 echeqs, no hay forma de verlo desde su ficha.
2. **Multas ↔ Cuenta Corriente.** Una multa imputada a un cliente no genera deuda. Queda en un estado `imputada` que no impacta en ningún saldo.
3. **Notificaciones ↔ realidad.** Se computan en el momento en que abrís la campana. No hay envío, no hay historial, no hay "leído", y el generador de alertas que **sí** contempla echeqs y licencias (`services/alertas.py`) no lo consume nadie.

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

### 2.2 🔴 CRÍTICO — El scheduler de alertas nunca arranca

`services/alertas.py` define `iniciar_scheduler(app)` con un `CronTrigger(hour=8, minute=0)`. **No lo llama nadie.** `main.py` no tiene evento de startup ni lifespan. `apscheduler==3.10.4` está en `requirements.txt` sin usarse. Y aunque arrancara, el job sólo hace `print(f"[Scheduler] {len(alertas)} alertas generadas")` — hay un `# TODO: enviar alertas` en el lugar del envío.

Además, si arrancara: `CronTrigger(hour=8)` usa la timezone del proceso. En un contenedor en UTC eso son las 5 de la mañana en Argentina. Hay que fijar `ZoneInfo("America/Argentina/Buenos_Aires")` explícito.

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

### 3.7 Cambios de modelo — Cliente (datos fiscales)

Necesarios para facturar y para operar cuenta corriente con empresas:

`razon_social`, `condicion_iva` (`responsable_inscripto`/`monotributo`/`consumidor_final`/`exento`), `domicilio`, `localidad`, `provincia`, `codigo_postal`, `fecha_nacimiento` (edad mínima de conductor), `licencia_pais`, `licencia_desde` (antigüedad mínima), `condicion_pago_default`.

### 3.8 Nuevos automatismos (lo que hace que todo esté conectado)

| Evento | Asiento automático en CC |
|---|---|
| Checkout confirmado con precio total | DEBE por el total del alquiler, condición del cliente, vencimiento calculado |
| Pago registrado | HABER por el monto |
| **Recibo emitido** | **HABER + imputación a las deudas seleccionadas + entrada en Caja del día** |
| **Recibo anulado** | **Contra-asiento DEBE + contra-recibo, nunca borrado** |
| Echeq recibido en cartera | HABER diferido |
| Echeq rechazado | DEBE (revierte) + alerta alta |
| Multa cambia a `imputada` | DEBE por el monto |
| Cargo por excedente / late checkout | DEBE al cerrar el checkin |
| Garantía ejecutada parcial | DEBE por el monto retenido |
| Factura emitida | Vincula al asiento existente (no duplica) |
| Nota de crédito | HABER |

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

Hoy: tarifa por vehículo o general, seleccionada por duración (diaria <7d, semanal 7-29d, mensual 30+). **No soporta estacionalidad ni categorías.** El pedido es precio por categoría, por día del año, con fechas especiales.

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
| `activo` | |

El sistema de prioridades es la clave: cargás una regla base anual con prioridad 0, encima "temporada alta enero-febrero" con prioridad 10, y encima "primera semana de septiembre" con prioridad 20. La más específica gana sin tener que borrar nada. Exactamente el caso que se planteó.

**Tabla `descuentos_duracion`:** `categoria_id` nullable, `dias_desde`, `dias_hasta`, `porcentaje`.

**Endpoint clave: `POST /api/v1/precios/calcular`** → devuelve el **desglose día por día**, no sólo el total. Es lo que permite mostrarle al cliente por qué paga lo que paga, y lo que hace que el módulo sea debuggeable. Se reutiliza en el sistema interno, en el cotizador y en la web.

**Pantalla de administración: "Calendario de precios"** — vista tipo calendario anual, categorías en filas, meses en columnas, precio y color por celda. Pintar un rango y asignar precio. Debe ser tan fácil como marcar en un Excel, porque es lo que van a usar todas las semanas.

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
| `recibos` | Finanzas | 🔴 |
| `recibo_imputaciones` | Finanzas | 🔴 |
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

---

## 9. Orden de ejecución propuesto

### 🔥 Fase 0 — Estabilización (1-2 semanas)
Sin esto no se puede construir arriba. **Los 12 bugs P0 están detallados en `docs/ANALISIS_CICLO_RESERVA.md`.**
1. Aplicar migraciones 010→016 pendientes y verificar `alembic current`
2. Arreglar el crash de `/notificaciones` (bug 2.1)
3. **Arreglar `Pago(usuario_id=)` → `cobrado_por=`** — hoy todo cobro en check-out/check-in devuelve error 500
4. **Habilitar el check-in tardío** — separar la sincronización horaria de la finalización real (estado `VENCIDA`)
5. **Corregir el cálculo de excedente** — mide contra `hora_inicio` en vez de `hora_fin`
6. **Corregir el precio semanal/mensual** — hoy multiplica el precio de la banda por día
7. **Dejar de duplicar el anticipo** — se cuenta dos veces y subestima la deuda
8. **`extender()` deja de borrar el precio** cuando no encuentra tarifa
9. Validar que el kilometraje no retroceda en el check-out
10. Migrar todas las fechas `String` → `Date`
11. Convertir `DELETE /pagos` en anulación con contra-asiento
12. Exponer `licencia_numero`/`licencia_categoria` y permitir corregir DNI/CUIT y tipo de cliente
13. Implementar la validación de baja de cliente con alquiler activo
14. Limpiar archivos muertos (`pages/clientes/List.tsx`, `Detail.tsx`, 5 previews del cotizador)
15. Resolver errores de TypeScript pendientes

### 💰 Fase 1 — Finanzas conectadas + reglas de negocio (3-4 semanas)
16. Rediseñar cuenta corriente como ledger inmutable (`saldo_posterior`, `condicion`, `fecha_vencimiento`, anulación, FKs)
17. Echeq: `cliente_id` + `fecha_pago` + ciclo de vida completo + generación de movimiento en CC
18. Automatismos de asientos (checkout → débito, pago → crédito, multa → débito, etc.)
19. Datos fiscales del cliente + **empresa vs particular** (contactos con puesto, formulario condicional)
20. **Conductor ≠ pagador** en la reserva — prerequisito para imputar multas en empresas
21. **Rediseño de tarifas**: `precio_por_dia` explícito, por vehículo **y** por categoría, bandas configurables
22. **Descuentos auditados** (precio de lista vs cobrado, motivo, autorizado por) + **con/sin factura** en la reserva
23. **Estados nuevos**: `VENCIDA`, `NO_SHOW`, `CERRADA` + política de seña en cancelación y no-show
24. **Cargos de cierre**: combustible faltante, limpieza, liquidación de garantía contra los cargos
25. **Pipeline de PDF server-side** (WeasyPrint/ReportLab) — base para recibos, facturas, contratos y presupuestos
26. **Módulo de Recibos** — numeración, imputación FIFO, PDF con agradecimiento, descarga + envío por email
27. Módulo Comprobantes/Facturas (carga manual + PDF + vínculo a CC)
28. UI: ledger con Debe/Haber/Saldo + aging · grilla de tarifas · liquidación en el check-in · panel de estado en la reserva

### 🔔 Fase 2 — Alertas y Notificaciones (2 semanas)
29. Tabla `notificaciones` + deduplicación + auto-resolución
30. Motor de reglas unificado (jubilar `services/alertas.py` y el router computed)
31. Scheduler APScheduler con TZ Argentina, arrancado desde el lifespan de FastAPI
32. Regla de echeq **T-2 días a las 08:00** + el resto del catálogo de 4.2
33. Digest matutino por email (Resend)
34. Campana in-app reescrita: leído / posponer / descartar / historial
35. Preferencias por usuario

### 🎨 Fase 3 — UI/UX y validaciones (1-2 semanas)
36. Menú reagrupado a 6 items, sidebar `w-52`, auto-colapso en Reservas/Ocupación
37. Densidad de Reservas: filtros colapsables, toggle compacto, vista tabla
38. **Vencimientos como campos del vehículo** (VTV, póliza) + service por fecha
39. **Matriz de bloqueos** + endpoints `pre-checkout` / `pre-checkin` con semáforo
40. **Pantalla de Configuración** — gracia, multiplicadores, umbrales, cargos fijos, políticas
41. Unificar paleta e íconos
42. Búsqueda global Cmd+K

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
50. **Definir el texto legal del contrato** ← pedir ya, tiene el lead time más largo
51. Generación de PDF (reutiliza el pipeline de la Fase 1) + firma en canvas + hard block en checkout
52. Parte de daños con croquis y fotos en check-out/check-in, con daños preexistentes precargados
53. Valorización de daños y ejecución contra la garantía

### 🌐 Fase 5 — Cimientos para la web (3 semanas)
54. Categorías de vehículo + migrar la flota existente (la tarifa por categoría de la F1 ya la espera)
55. Sucursales + cargos one-way
56. Adicionales + adicionales por reserva
57. **Motor de precios por calendario** + pantalla de administración
58. **Reserva por categoría** (`vehiculo_id` nullable) — el cambio estructural
59. Bloqueos de vehículo por fecha

### 🚀 Fase 6 — Reservas web (4 semanas)
60. Endpoint de disponibilidad real por cupo
61. Sistema de holds con expiración
62. Integración Mercado Pago + webhook idempotente
63. Landing + flujo de 3 pasos
64. Bandeja de Reservas Web en el sistema con aceptar/rechazar

**Total estimado: 18-21 semanas.** Las fases 0-3.5 (9-10 semanas) ya dejan el sistema interno completo, sólido y con auth real — es el corte natural si se quiere poner en producción antes de encarar la web.

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
| 14 | **Numeración de recibos** | ¿Arrancan en 1 o continúan una numeración de papel existente? ¿Un punto de venta o varios? |
| 15 | **Texto de agradecimiento del recibo** | Fijo y pre-escrito, como el cotizador. Definir la redacción con ellos |
| 16 | **¿El recibo se manda por email desde el sistema o se descarga y se manda a mano?** | Ambos. Descarga siempre; email como opción (Resend ya está) |

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
| Recibos con numeración duplicada por concurrencia | Medio | Secuencia en base (no `MAX(numero)+1`) + constraint único sobre `(punto_venta, numero)` |

---

## 12. Resumen ejecutivo

**Lo que está bien:** el núcleo operativo (flota, clientes, reservas, ocupación, check-in/out) está sólido y bien pensado. El calendario de ocupación y el flujo de check-out con garantía y tarjeta son mejores que los de muchos sistemas comerciales del rubro.

**Lo que está flojo:**
1. Un bug que tira abajo las notificaciones apenas haya un alquiler finalizado con deuda
2. El scheduler de alertas nunca arrancó — no se envía nada, nunca
3. Los echeqs son una isla sin cliente, sin cuenta corriente y sin ciclo de vida
4. La cuenta corriente es un número mutable, no un libro auditable
5. No existe el contrato, que es lo que bloquea la entrega legal del auto
6. No hay forma de darle un comprobante al cliente cuando paga — ni recibo, ni factura
7. El endpoint público de disponibilidad devuelve datos incorrectos
8. Faltan las cuatro entidades que la web necesita: categorías, sucursales, adicionales y precios por calendario
9. Todo se sigue grabando con un usuario ficticio

**El orden importa:** arreglar lo roto → conectar las finanzas y poder emitir recibos → construir las alertas → pulir la UI → cerrar auth con Clerk → contratos → recién ahí, los cimientos de la web. Saltear la Fase 0 significa construir sobre un sistema que ya tiene un endpoint caído.

# Plan — Flujo de Pagos y Caja

**Estado:** Plan técnico. Sin código implementado aún.
**Fecha:** 2026-06-26

---

## Situación actual

### Qué impacta la Caja hoy

| Acción | ¿Impacta caja? | Cuándo |
|--------|---------------|--------|
| Crear reserva | ❌ No | — |
| Editar reserva | ❌ No | — |
| Check-in (entrega del auto) | ❌ No | — |
| Check-out (devolución del auto) | ❌ No | — |
| Registro manual en Caja (`POST /pagos`) | ✅ Sí | Día ingresado en el cobro |
| Gasto de flota (`POST /vehiculos/{id}/gastos`) | ✅ Sí | Día del gasto |
| Cobro por cuenta corriente | ✅ Sí | Día del movimiento (además crea movimiento en CC) |

### Problemas del flujo actual

1. **No hay intención de pago en la reserva.** No se sabe si el cliente va a pagar en efectivo, transferencia, tarjeta, etc.
2. **No hay estado de pago.** Una reserva no dice si ya fue cobrada, parcialmente cobrada o está pendiente.
3. **El cobro está completamente desacoplado.** No hay nada que relacione "esta reserva fue pagada" — el operador debe recordar ir a Caja a registrar el pago manualmente.
4. **Caja no muestra deudas.** Si un alquiler finaliza sin que se registre el cobro, nadie lo ve.
5. **`Pago` requiere `alquiler_id`.** No se puede registrar un anticipo antes de que exista el alquiler (es decir, antes del check-in).

---

## Diseño del nuevo flujo

### Visión general

```
RESERVA
  → se elige forma de pago + se registra anticipo (si ya pagó algo)
      ↓
CHECK-IN (entrega del auto)
  → se muestra resumen de pago: qué debe, cómo va a pagar
  → opción de cobrar ahora (crea pago en Caja)
  → o marcar como pendiente (queda en Caja como deuda)
      ↓
CAJA — "Saldos pendientes"
  → lista de quién debe, cuánto, de qué reserva
  → botón "Cobrar" → registra pago → sale de pendientes → entra en cobros del día
      ↓
CHECK-OUT (devolución)
  → muestra si hay saldo pendiente todavía (ej: excedente)
  → opción de cobrar excedente ahí mismo
```

---

## Cambios de base de datos

### Tabla `reservas` — nuevas columnas

```sql
ALTER TABLE reservas ADD COLUMN forma_pago_prevista  VARCHAR(30)    NULL;
ALTER TABLE reservas ADD COLUMN estado_pago          VARCHAR(20)    NOT NULL DEFAULT 'pendiente';
ALTER TABLE reservas ADD COLUMN anticipo_monto       NUMERIC(12,2)  NULL;
ALTER TABLE reservas ADD COLUMN anticipo_fecha       VARCHAR(10)    NULL;
ALTER TABLE reservas ADD COLUMN anticipo_medio_pago  VARCHAR(30)    NULL;
```

| Campo | Valores posibles | Descripción |
|-------|-----------------|-------------|
| `forma_pago_prevista` | efectivo / transferencia / tarjeta / cheque / echeq / cuenta_corriente | Cómo va a pagar el cliente |
| `estado_pago` | `pendiente` / `anticipo` / `pagado` | Estado actual del cobro |
| `anticipo_monto` | Decimal | Monto ya cobrado al momento de la reserva |
| `anticipo_fecha` | ISO date string | Cuándo se recibió el anticipo |
| `anticipo_medio_pago` | mismo enum que forma_pago | Cómo se cobró el anticipo |

**Reglas de `estado_pago`:**
- `pendiente` → no se cobró nada aún
- `anticipo` → se cobró algo pero no el total (anticipo_monto < precio_total)
- `pagado` → cobrado en su totalidad (puede ser en anticipos, en caja, o combinado)

### Tabla `pagos` — sin cambios estructurales

El modelo `Pago` sigue igual: requiere `alquiler_id`. Los anticipos registrados en la reserva **no** crean un registro en `pagos` todavía — se guardan directamente en los campos de `reserva`. Cuando se crea el alquiler (en el check-in), se puede optar por crear automáticamente el pago correspondiente.

> **¿Por qué no crear un `Pago` antes del alquiler?**
> Porque `alquiler_id` es NOT NULL en `pagos`. Cambiar eso requeriría una migración mayor y rompería la integridad de los cobros existentes. En cambio, los anticipos se modelan como metadatos de la reserva. Cuando el check-in ocurre y se crea el alquiler, el anticipo puede convertirse en un `Pago` real automáticamente.

### Migración necesaria

Un archivo nuevo: `016_pago_intent_reserva.py`
- Agrega 5 columnas a `reservas` (ver arriba)
- `estado_pago` tiene DEFAULT `'pendiente'` → no rompe reservas existentes

---

## Flujo 1: Crear / Editar Reserva

### Sección nueva: "Pago"

Se agrega una sección "Pago" en `ReservaModal`, después de la cotización y antes de la garantía.

**Campos:**

```
Forma de pago esperada:
  [Efectivo] [Transferencia] [Tarjeta] [Cheque] [Echeq] [Cuenta Cte.]

¿El cliente ya abonó algo?
  ○ No, está pendiente
  ○ Abonó el total        → estado_pago = 'pagado'
  ○ Abonó un anticipo     → muestra: monto anticipo ($) + fecha + medio de pago del anticipo

```

**Validaciones:**
- Si `estado_pago = 'anticipo'`: `anticipo_monto` requerido y debe ser < `precio_total`
- Si `estado_pago = 'pagado'`: `anticipo_monto` = `precio_total` (se guarda como anticipo total)
- `forma_pago_prevista` es opcional (puede quedar null si no se sabe aún)

**Payload adicional al `POST /reservas`:**
```json
{
  "forma_pago_prevista": "transferencia",
  "estado_pago": "anticipo",
  "anticipo_monto": 30000,
  "anticipo_fecha": "2026-06-26",
  "anticipo_medio_pago": "transferencia"
}
```

---

## Flujo 2: Check-in (Entrega del vehículo)

### Panel de pago en CheckoutModal

Se agrega un bloque de información de pago encima del formulario de entrega.

**Si `estado_pago = 'pendiente'`:**
```
⚠️ COBRO PENDIENTE
Cliente: Juan Pérez
Total reserva: $140.000
Forma de pago esperada: Transferencia
→ [Cobrar ahora $140.000] [Dejar como pendiente]
```

**Si `estado_pago = 'anticipo'`:**
```
💰 ANTICIPO REGISTRADO
Anticipo recibido: $30.000 el 20/06/2026 (Transferencia)
Saldo restante: $110.000
→ [Cobrar saldo $110.000 ahora] [Dejar saldo como pendiente]
```

**Si `estado_pago = 'pagado'`:**
```
✅ PAGADO COMPLETO
Anticipo: $140.000 el 20/06/2026 (Transferencia)
```

### Si se elige "Cobrar ahora"

1. Se crea el alquiler (`POST /alquileres`)
2. Se crea inmediatamente el pago (`POST /pagos`) con el `alquiler_id` recién creado
3. La reserva pasa a `estado_pago = 'pagado'` (o ajusta según monto)
4. El pago aparece en Caja del día

### Si se elige "Dejar como pendiente"

1. Se crea el alquiler normalmente
2. La reserva mantiene `estado_pago = 'pendiente'` o `'anticipo'`
3. Aparece en la sección "Saldos pendientes" de Caja

### Auto-creación de pago por anticipo en check-in

Si `estado_pago = 'anticipo'` o `'pagado'` y aún no existe el pago en la tabla `pagos`:
- Al crear el alquiler, el sistema crea automáticamente un `Pago` por el `anticipo_monto` con la `anticipo_fecha` y `anticipo_medio_pago`
- Esto retroactivamente registra el anticipo en Caja (en la fecha que se cobró, no en la de hoy)

---

## Flujo 3: Caja — Saldos Pendientes

### Nueva sección en `/caja`

Debajo de los cobros del día, agregar una sección **"Saldos pendientes"** que no depende de la fecha seleccionada — siempre muestra todas las deudas activas.

**Endpoint nuevo: `GET /pagos/pendientes`**

Calcula reservas con deuda pendiente:
```
monto_pendiente = precio_total
                - anticipo_monto (si existe)
                - SUM(pagos.monto WHERE alquiler.reserva_id = reserva.id)
```

Se incluye una reserva si `monto_pendiente > 0` y `estado IN ('confirmada', 'activa', 'finalizada')`.

**Response por entrada:**
```json
{
  "reserva_id": 42,
  "alquiler_id": 15,
  "cliente_nombre": "Juan Pérez",
  "vehiculo_patente": "ABC123",
  "vehiculo_descripcion": "Toyota Hilux",
  "fecha_inicio": "2026-06-20",
  "fecha_fin": "2026-06-27",
  "estado_reserva": "finalizada",
  "precio_total": 140000.00,
  "anticipo_monto": 30000.00,
  "ya_cobrado": 30000.00,
  "monto_pendiente": 110000.00,
  "forma_pago_prevista": "transferencia",
  "dias_vencido": 0
}
```

`dias_vencido` = días desde `fecha_fin` si el estado es `finalizada` y sigue pendiente → se muestra en rojo si > 0.

### UI de la sección "Saldos pendientes"

```
┌────────────────────────────────────────────────────────────────┐
│  ⚠️ Saldos pendientes (3)                                      │
├────────────────┬──────────┬──────────┬───────────┬────────────┤
│ Cliente        │ Vehículo │ Reserva  │ Pendiente │ Acción     │
├────────────────┼──────────┼──────────┼───────────┼────────────┤
│ Juan Pérez     │ ABC123   │ #42      │ $110.000  │ [Cobrar]   │
│                │          │ activa   │ Transf.   │            │
├────────────────┼──────────┼──────────┼───────────┼────────────┤
│ María López    │ DEF456   │ #38      │ $140.000  │ [Cobrar]   │
│                │          │ finaliz. │ Efectivo  │ ⚠️ 3 días  │
└────────────────┴──────────┴──────────┴───────────┴────────────┘
```

### Acción "Cobrar"

Abre un formulario inline:
```
Cobrar a: Juan Pérez · Reserva #42
Monto sugerido: $110.000 (pendiente)
Monto a cobrar: [_____] (editable — puede cobrar parcial)
Medio de pago: [Efectivo] [Transferencia] [Tarjeta] [Cheque] [Echeq] [Cta. Cte.]
Fecha: [hoy]  Con factura: [ ]
→ [Confirmar cobro]
```

Al confirmar:
- `POST /pagos` con alquiler_id (o el primero del alquiler asociado)
- El nuevo pago aparece en los cobros del día de la fecha elegida
- Se recalcula `monto_pendiente`; si llega a 0 → desaparece de pendientes
- La reserva se actualiza: `estado_pago = 'pagado'` (si cobrado total) o `'anticipo'` (si parcial)
- Se muestra toast: "Pago de $X registrado · Cliente: Juan Pérez · Reserva #42"

---

## Flujo 4: Check-out (Devolución) — Cobro de excedente

Si al hacer el check-out hay cargo de excedente (`cargo_excedente > 0`) Y aún hay saldo pendiente:

```
💰 COBROS AL CIERRE
Saldo pendiente de la reserva:  $110.000
Cargo excedente (2 hs):          $5.200
─────────────────────────────────────────
Total a cobrar:                 $115.200

¿Cómo se cobra?
[Efectivo] [Transferencia] [Tarjeta] ...
→ [Cobrar $115.200 y cerrar]  [Cobrar después]
```

Si se elige cobrar → crea dos pagos (uno por el saldo de reserva, otro por el excedente) o uno solo por el total, con nota.
Si "cobrar después" → excedente queda también como pendiente en Caja.

---

## Flujo 5: Impacto en Caja — Resumen completo

| Acción | Impacto Caja | Sección |
|--------|-------------|---------|
| Crear reserva (sin anticipo) | ❌ No | — |
| Crear reserva con anticipo | Aparece en **Pendientes** hasta el check-in, luego en **Cobros** con fecha del anticipo | Cobros del día (retroactivo) |
| Check-in: cobrar ahora | ✅ Sí | Cobros del día actual |
| Check-in: dejar pendiente | Aparece en **Pendientes** | Saldos pendientes |
| Cobro desde sección Pendientes | ✅ Sí | Cobros del día elegido |
| Check-out: cobrar excedente ahí | ✅ Sí | Cobros del día actual |
| Check-out: dejar excedente pendiente | Aparece en **Pendientes** | Saldos pendientes |
| Registro manual de cobro | ✅ Sí | Cobros del día |
| Gasto de flota | ✅ Sí | Egresos del día |
| Cuenta corriente (débito) | ✅ Sí | Cobros del día + movimiento en CC |
| Cancelar reserva | ❌ No (anticipo queda, hay que gestionar devolución manualmente) | — |

---

## Alertas y notificaciones

### Panel de notificaciones (campana)

Agregar tipo de alerta: `pago_pendiente`
- Trigger: reservas finalizadas con `monto_pendiente > 0` y `fecha_fin < hoy`
- Urgencia: 🔴 alta si `dias_vencido > 3`, 🟡 media si 0-3 días
- Navega a: `/caja` (scrollea a sección Pendientes)

### Caja

- Badge en la pestaña/header de Caja si hay pendientes: "3 pendientes"
- La sección Pendientes siempre visible independientemente de la fecha seleccionada
- Ordenada: más antigua primero (mayor urgencia)

---

## Cambios por capa

### Backend

| Archivo | Cambio |
|---------|--------|
| `alembic/016_pago_intent_reserva.py` | Nueva migración — 5 columnas en `reservas` |
| `app/models/reserva.py` | Agregar 5 campos mapeados |
| `app/schemas/reserva.py` | Agregar campos en `ReservaCreate`, `ReservaUpdate`, `ReservaResponse` |
| `app/routers/reservas.py` | Aceptar y persistir los nuevos campos en create/update |
| `app/routers/pagos.py` | Nuevo endpoint `GET /pagos/pendientes` |
| `app/services/alquiler_service.py` | Al crear alquiler: si reserva tiene anticipo → crear `Pago` automático |
| `app/routers/notificaciones.py` | Agregar tipo `pago_pendiente` al endpoint de notificaciones |

### Frontend

| Archivo | Cambio |
|---------|--------|
| `types/index.ts` | Nuevos campos en `Reserva`, `ReservaCreate` |
| `hooks/usePagos.ts` | Nueva función `usePendientes()` → `GET /pagos/pendientes` |
| `pages/reservas/ReservaModal.tsx` | Sección nueva "Pago": forma_pago_prevista, estado_pago, anticipo |
| `pages/reservas/CheckoutModal.tsx` | Panel de estado de pago + opción cobrar ahora |
| `pages/reservas/CheckinModal.tsx` | Mostrar saldo pendiente + cobro de excedente |
| `pages/caja/CajaPage.tsx` | Sección "Saldos pendientes" con tabla + acción Cobrar |
| `components/caja/PendientesSection.tsx` | Componente nuevo para la sección de deudas |

---

## Casos borde y decisiones pendientes

| Caso | Decisión propuesta |
|------|-------------------|
| Reserva cancelada con anticipo cobrado | El anticipo sigue en Caja. Hay que gestionar la devolución manualmente desde Caja (no hay devolución automática) |
| Anticipo > precio_total (error del operador) | Validar en frontend y backend: `anticipo_monto <= precio_total` |
| Pago parcial desde Caja: ¿actualiza `estado_pago` en reserva? | Sí — el backend recalcula y actualiza `estado_pago` al registrar cada pago |
| Múltiples pagos parciales | Todos van a la tabla `pagos`. El pendiente se calcula como `precio_total - SUM(pagos)` en tiempo real |
| Reserva `finalizada` sin alquiler asociado (si se canceló el alquiler) | No debería pasar, pero si pasa: excluir de pendientes |
| Excedente cobrado: ¿sube el precio_total? | El `cargo_excedente` es un campo aparte en `alquiler`, no modifica `precio_total`. El pendiente de excedente se calcula separado |
| Cliente paga con dos medios (mitad efectivo, mitad transferencia) | Dos registros en `pagos`, lo cual ya soporta el sistema |

---

## Orden de implementación

1. **Migración 016** + actualizar modelo, schema, router de reservas
2. **ReservaModal** — sección de pago
3. **`GET /pagos/pendientes`** — endpoint de deudas
4. **PendientesSection en Caja** — tabla + formulario de cobro
5. **CheckoutModal** — panel de pago + cobrar ahora
6. **Auto-pago al hacer checkout** cuando hay anticipo registrado
7. **CheckinModal** — saldo pendiente al devolver
8. **Notificación `pago_pendiente`**

---

## Lo que NO cambia

- El modelo `Pago` y su endpoint `POST /pagos` siguen igual
- Los cobros del día en Caja siguen funcionando igual
- Los gastos de flota siguen igual
- Cuentas corrientes siguen igual (siguen siendo un medio de pago más)
- Garantías: son un depósito de seguridad, **no son ingresos** y **no impactan Caja**

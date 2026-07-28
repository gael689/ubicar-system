# Fase 3 — Planning Arquitectónico

> Plan de ejecución completo para Reservas + Alquileres + Calendario de Ocupación.
> Documento maestro: leer antes de tocar una sola línea de código.

**Audiencia:** desarrollador humano y agente IA que va a implementar.
**Pre-requisitos:** Fase 1 (Flota) y Fase 2 (Clientes) cerradas. ✅
**Tiempo estimado:** 10-12 días de implementación efectiva (subió desde 8-10 por D8 funcional, D4 inactivación con reservas y D9 migración real).

---

## 1. Por qué Fase 3 es distinta a las anteriores

Las Fases 1 y 2 fueron CRUDs sofisticados sobre agregados independientes (Vehículo, Cliente). Fase 3 es **el primer módulo transaccional del sistema**: cruza dos agregados, cambia estado en cascada, tiene reglas de tiempo (gracia 24hs, transición 4hs) y debe garantizar **invariantes financieras** (no doble booking, cargo correcto por excedente).

Esto cambia tres cosas respecto al patrón anterior:

| Patrón Fase 1-2 | Patrón Fase 3 |
|---|---|
| Repository + Service por agregado | Domain layer con funciones puras + Service que orquesta |
| Validación con Pydantic + unicidad | Invariantes de negocio chequeadas en service dentro de transacción |
| Tests CRUD básicos | Tests de máquina de estados + property-based para invariantes |
| Mutaciones triviales | Mutaciones multi-tabla en transacción explícita |

**Consecuencia práctica:** la primera mitad del trabajo es **diseño y reglas de dominio**, no endpoints. Si saltamos a endpoints sin tener `domain/` cerrado, vamos a reescribir.

---

## 2. Diagnóstico del estado actual

Lo que ya existe en `backend/app/`:

```
domain/
├── control_24hs.py        ← stub vacío o esqueleto
├── solapamientos.py       ← stub vacío o esqueleto
├── tarifas.py             ← stub vacío o esqueleto
└── enums.py               ← debe tener EstadoVehiculo, EstadoReserva (verificar)
models/
├── reserva.py             ← modelo SQLAlchemy ya creado
├── alquiler.py            ← modelo SQLAlchemy ya creado
└── ...
routers/
├── reservas.py            ← stub o vacío
└── alquileres.py          ← stub o vacío
```

**Acción 0 (antes de cualquier slice):** auditar el estado real de estos archivos. Si los modelos no tienen los campos del spec (`horas_excedente`, `cargo_excedente`, `excedente_bonificado`, `bonificado_por`), generar migración correctiva.

---

## 3. Arquitectura — la pirámide invertida

Construimos de adentro hacia afuera:

```
                    ┌────────────────┐
                    │  UI (React)    │   ← Slice 7
                    └────────┬───────┘
                             │
                    ┌────────▼───────┐
                    │  HTTP routers  │   ← Slice 6
                    └────────┬───────┘
                             │
                    ┌────────▼───────┐
                    │   Services     │   ← Slice 4-5
                    └────────┬───────┘
                             │
                    ┌────────▼───────┐
                    │ Repositories   │   ← Slice 3
                    └────────┬───────┘
                             │
                    ┌────────▼───────┐
                    │     Domain     │   ← Slice 1-2 (PRIMERO)
                    │  (puro Python) │
                    └────────────────┘
```

**Regla de oro:** ningún slice puede empezar antes que su capa inferior pase tests. Esto evita bug-hunting cruzado entre capas.

---

## 4. Decisiones de diseño a tomar AHORA

Estas decisiones están sin resolver en los specs y van a aparecer durante implementación. Las resolvemos antes para que el agente IA no tenga que improvisar.

### D1. Duración de la reserva y concepto de "Late Checkout" — CERRADO

**Decisión:** la reserva se hace **por días completos**. Las horas se ignoran para el cálculo de tarifa base. Si reservás 3 días, pagás 3 × tarifa_diaria (o la tarifa semanal/mensual según banda).

**Horario de devolución:**
- **Default:** el checkin esperado es al **mismo horario** del checkout. Si checkout fue a las 10:00, la devolución esperada es a las 10:00 del último día.
- **Late checkout (acordado previamente):** al momento de reservar, el operador puede definir un horario de devolución posterior al default. Ejemplo: "checkout 10:00, devolución acordada 14:00". Esto tiene un **cargo fijo adicional** que se acuerda al momento de la reserva (no es gratis, pero es más barato que un día extra).
- Si el cliente se pasa del horario acordado (ya sea el default o el late checkout), ahí empieza a correr el **excedente por hora** con la fórmula de D6.

**Modelo de datos:**
```
Reserva:
  hora_devolucion_acordada: TIME    # default = hora_inicio (mismo horario del checkout)
  late_checkout: BOOL               # true si se acordó un horario extendido
  cargo_late_checkout: NUMERIC(12,2) # monto fijo acordado por el late checkout ($0 si no aplica)
```

**Fórmula de excedente — punto de referencia:**
```
excedente_empieza_desde = fecha_fin + hora_devolucion_acordada + GRACIA_MINUTOS
```
Ya no se calcula contra `hora_inicio` sino contra `hora_devolucion_acordada`. Si no hay late checkout, `hora_devolucion_acordada == hora_inicio` y el comportamiento es idéntico al anterior.

**Cálculo de tarifa base:**
```python
def calcular_duracion_dias(fecha_inicio: date, fecha_fin: date) -> int:
    """Ignora horas. Solo cuenta días."""
    return (fecha_fin - fecha_inicio).days
```
Ejemplo: 21/05 → 23/05 = 2 días. Simple, sin ambigüedad.

**¿Se puede cambiar fácilmente?** Sí. La fórmula vive en `domain/tarifas.py::calcular_duracion_dias()`. Si Franco decide que quiere contar de otra forma, se cambia ahí sin tocar service ni UI.

**Frontend — form de reserva:**
- Campo "Hora de devolución" con default = hora de checkout. Si el operador lo cambia → se marca `late_checkout = true` y aparece un input "Cargo por late checkout ($)".
- El cargo de late checkout se suma al precio total de la reserva como concepto separado (visible en el desglose).

**Slicing:** los campos nuevos se agregan en la migración del Slice 0. La lógica de late checkout se implementa en Slice 4 (ReservaService) y Slice 7 (form de reserva).

### D2. Reservas pendientes y solapamiento — CERRADO

**Decisión:** **no bloquea, pero advierte.**
- Crear reserva con solape contra otra **pendiente** → `200 OK` con campo `warnings: [{ tipo: "solape_con_pendiente", reserva_id: X, cliente: "...", fecha_inicio: "...", fecha_fin: "..." }]`.
- Crear reserva con solape contra **confirmada o activa** → `409 Conflict` con detalle.
- Al **confirmar** una reserva que solapaba con otra pendiente, la otra pendiente queda con flag `bloqueada_por_solape = true` para que el operador la reasigne o cancele explícitamente.

**Justificación:** las pendientes son tentativas. El operador necesita poder agendar contra una reserva no confirmada. El warning es suficiente para que tome acción si es necesario.

### D3. Reglas de transición de estado de vehículo

**Decisión final** (cierra la ambigüedad del spec):

| Evento | Estado origen permitido | Estado destino |
|---|---|---|
| Reserva confirmada | `disponible` | `reservado` |
| Reserva confirmada | `alquilado`, `reservado`, `en_transicion` | (sin cambio) |
| Cancelar reserva confirmada | `reservado` (si la reserva era la única reserva activa del vehículo) | `disponible` |
| Cancelar reserva confirmada | `reservado` (si hay otras reservas confirmadas activas) | (sin cambio) |
| Checkout | `disponible`, `reservado`, `en_transicion` | `alquilado` |
| Checkin | `alquilado` (sin reserva próxima) | `disponible` |
| Checkin | `alquilado` (con reserva confirmada en próximas 4hs) | `en_transicion` |
| Admin marca fuera de servicio | cualquiera | `fuera_de_servicio` |
| Admin reactiva | `fuera_de_servicio` | `disponible` |

Estas reglas viven en `domain/transiciones.py` como funciones puras.

### D4. Inactivación del vehículo con reservas existentes

**Decisión:** **el vehículo nunca se borra**, solo se inactiva (`activo = False`). La inactivación **siempre se permite**, incluso si tiene reservas. El sistema **debe avisar sin falta** al admin antes de confirmar la inactivación.

**Flujo:**
1. Admin pulsa "Dar de baja" en la ficha del vehículo.
2. Backend detecta reservas activas (`pendiente`, `confirmada` o `activa`).
3. Si hay reservas → **no es un 409 que bloquea**. Es un endpoint de "dry run" o un response con warnings que la UI muestra como confirmación obligatoria:
   ```
   El vehículo tiene 3 reservas que se verán afectadas:
   • Reserva #42 — Juan Pérez — 25/05 al 27/05 (confirmada)
   • Reserva #51 — María Gómez — 30/05 al 02/06 (pendiente)
   • Alquiler #18 — Carlos Ruiz — checkout 23/05 (ACTIVO ahora)
   
   ¿Confirmás la inactivación? Vas a tener que reasignar manualmente.
   ```
4. El admin confirma → el vehículo queda inactivo, las reservas conservan su estado pero quedan visibles en una vista "Reservas a reasignar" (filtro por `vehiculo.activo = false AND reserva.estado IN (pendiente, confirmada, activa)`).
5. El admin las reasigna manualmente a otro vehículo (puede usar el endpoint PATCH de la reserva en estado pendiente, o un nuevo endpoint `POST /api/v1/reservas/{id}/reasignar` que solo cambia el `vehiculo_id` y re-verifica solapamientos en el destino).

**Caso especial: alquiler activo (post-checkout, pre-checkin).** Inactivar un vehículo con un alquiler activo es raro pero posible (ej: el auto se rompió en uso y va al taller). En ese caso:
- Se permite inactivar.
- Se sugiere al admin **completar el checkin** primero. Si insiste, queda inactivo con el alquiler abierto.
- El alquiler activo aparece destacado en rojo en la vista del admin para resolver pronto.

**Endpoints involucrados:**

```
GET    /api/v1/vehiculos/{id}/reservas-afectadas    # dry run: lista lo que se verá afectado
PATCH  /api/v1/vehiculos/{id}/inactivar             # body: { confirmacion: true }
POST   /api/v1/reservas/{id}/reasignar              # body: { vehiculo_id_nuevo: X }
```

**Vista nueva en la UI:** sección "Reservas a reasignar" en `/reservas` (tab adicional o filtro), accesible cuando hay vehículos inactivos con reservas pendientes.

**Justificación:** la realidad operativa es que un auto se puede romper, vender o sacar de operación con reservas en pie. El sistema no tiene que bloquear sino guiar al admin para resolver. Y nunca borra datos.

**Slicing:** la lógica de `reservas-afectadas` y `reasignar` se agrega en Slice 4 (ReservaService). La UI de inactivación con confirmación se agrega en Slice 7. La vista "Reservas a reasignar" en Slice 7 también.

### D5. Hora de checkout/checkin: NOW() con override manual

**Decisión:** **default = `now()` siempre**. Pero el form tiene un botón "Editar manualmente" que abre los inputs de fecha y hora para corregir.

**Caso de uso:** cliente devuelve el auto a las 14:00, Franco está atendiendo a otro y recién carga el checkin a las 17:00. Sin override, el sistema registraría 17:00 → cobraría 3h de excedente que no existieron.

**Comportamiento del form:**
1. Al abrir el form de checkout o checkin, los campos `fecha` y `hora` se prellenan con `now()` y están **deshabilitados** (read-only).
2. Aparece un botón pequeño "Editar fecha y hora" que, al pulsarse, habilita los campos.
3. Si el operador edita, se guarda lo que ingresó. Si no edita, se guarda lo que tomó del `now()`.
4. Se persiste en el alquiler un flag o metadata: `checkout_registrado_en_tiempo_real: bool` (true si no se editó, false si se editó). Útil para auditoría.

**Validaciones:**
- `checkout_fecha + checkout_hora` no puede ser anterior a `reserva.fecha_inicio`.
- `checkout_fecha + checkout_hora` no puede ser posterior a `now() + 1h` (margen para reloj desincronizado).
- `checkin_fecha + checkin_hora` debe ser posterior al checkout.
- Si el operador edita y la fecha resultante es muy lejana en el pasado (ej: > 7 días) → warning en el form.

**Justificación:** balancea la velocidad de carga (NOW por default cubre el 90% de los casos) con la flexibilidad para corregir cuando se carga a posteriori. El flag de "registro en tiempo real" da trazabilidad sin bloquear.

### D6. Cobro del excedente: granular en el momento del checkin

**Decisión:** **granular, decidida en el checkin**. La "bonificación post-checkin" como acción separada se elimina.

**Modelo de cobro:**

- Período de gracia: **40 minutos** (constante `GRACIA_MINUTOS = 40`).
- Pasada la gracia, el sistema calcula el **excedente sugerido** en horas y en pesos:
  ```
  tarifa_diaria        = X       (la tarifa vigente del vehículo para el alquiler)
  tarifa_hora          = X / 24
  tarifa_hora_excedente = 3 × (X / 24)        ← Lectura A confirmada
  horas_excedidas      = floor(minutos_excedidos / 60)   ← REDONDEO PARA ABAJO (no se cobran minutos sueltos)
  ```
- **Regla de tope a 12 horas (CERRADO):**
  - De 0 a 40 min de excedente → **gracia**, sin cargo.
  - De 41 min a 12 horas → se cobra **por hora completa redondeando para abajo**. Fórmula: `floor(minutos_excedidos / 60) × tarifa_hora_excedente`. Ejemplo: 5h 03min → cobrás 5 horas.
  - A partir de 12 horas → se cobra **1 día completo** a tarifa diaria (no horas sueltas). Si excede 36h → 2 días. Si excede 60h → 3 días. Fórmula: `ceil(horas_excedidas / 24) × tarifa_diaria`.
  - Constante fija: `TOPE_HORAS_ANTES_DIA_EXTRA = 12`.
  ```python
  def calcular_cargo(minutos_excedidos: int, tarifa_diaria: Decimal, gracia: int = 40, multiplicador: int = 3, tope_horas: int = 12) -> Decimal:
      if minutos_excedidos <= gracia:
          return Decimal("0")
      minutos_netos = minutos_excedidos - gracia
      horas = minutos_netos // 60  # floor — no se cobran minutos sueltos
      if horas < tope_horas:
          tarifa_hora_excedente = multiplicador * (tarifa_diaria / 24)
          return horas * tarifa_hora_excedente
      else:
          dias = math.ceil(horas / 24)
          return dias * tarifa_diaria
  ```
- **Punto de referencia para el excedente (D1 — late checkout):**
  ```
  excedente_empieza_desde = fecha_fin + hora_devolucion_acordada + GRACIA_MINUTOS
  ```
  Si no hay late checkout, `hora_devolucion_acordada == hora_inicio` del checkout.

- En el form de checkin, el admin ve:
  - "Excedente: 5h 03min → se cobran 5 horas" (visible y desglosado)
  - "Cargo por hora extra: $3.750"
  - "Cargo sugerido: $18.750"
  - **Tres opciones**:
    1. **Cobrar completo** — `cargo_excedente = cargo_sugerido`
    2. **Cobrar parcial** — `cargo_excedente = horas_a_cobrar × tarifa_hora_excedente` (input numérico de horas, default = `horas_excedidas`)
    3. **No cobrar (bonificar)** — `cargo_excedente = 0`, `excedente_bonificado = True`
- En todos los casos se persiste:
  - `horas_excedidas` (las reales calculadas, redondeadas para abajo)
  - `horas_cobradas` (las que el admin decidió cobrar; 0 si bonificó, completas si cobró todo)
  - `cargo_excedente` (el monto final aplicado)
  - `excedente_bonificado` (true si se cobraron 0 horas)
  - `bonificado_por` / `decidido_por` (usuario que confirmó el checkin)
  - `motivo_bonificacion` (texto opcional, recomendado si bonificó parcial o total)

**Justificación:** Franco no siempre cobra el excedente. La decisión es contextual y se conoce en el momento del checkin (cliente conocido, demora justificada, etc.). Granular permite cobro parcial sin romper auditoría.

### D6.1. Configurabilidad de las constantes de cobro

**Decisión:** **constantes fijas en código** (no env vars). Si en el futuro se necesita cambiar, se modifica `domain/control_24hs.py` y se redeploya.

```python
GRACIA_MINUTOS = 40
MULTIPLICADOR_HORA_EXCEDENTE = 3
TOPE_HORAS_ANTES_DIA_EXTRA = 12
```

Viven en `app/domain/control_24hs.py` como constantes del módulo. Se inyectan como argumentos con default a las funciones puras para que los tests puedan overridear.

Si en el futuro Franco quiere cambiar las constantes desde la UI, se migra a una tabla `configuracion` sin cambiar la fórmula ni los tests del domain.

### D7. Generación del wa.me link: deferido a fase futura

**Decisión:** **se elimina del alcance de F3**. La idea de mensaje automatizado por WhatsApp (con o sin link wa.me) se difiere a una fase de "Notificaciones" posterior, posiblemente en la misma F9 que ya tiene el scheduler de alertas.

**En F3:** no se implementa el endpoint `GET /api/v1/reservas/{id}/wa-link` ni el botón "Generar wa.me" en la UI. Tampoco el adapter `whatsapp.py`.

**Justificación:** Franco priorizó otras cosas (calendario funcional, extensión, cobro granular). Una linkbox manual o copy-paste cubre el caso hoy. Cuando se haga la integración, va a ser más sofisticada (mensaje completo prearmado, posiblemente WhatsApp Business API).

**Slicing afectado:** Slice 6 pierde el endpoint `wa-link`. Slice 7 pierde el bloque "Generar wa.me link" del detalle. El componente `INotifier` se difiere, no se agrega en F3.

### D8. Calendario de ocupación: completamente funcional con drag-and-drop

**Decisión:** **calendario completamente funcional desde F3**. Drag-and-drop, mover, estirar, reasignar entre vehículos.

**Capacidades del calendario:**

| Acción | Sobre qué reservas | Comportamiento |
|---|---|---|
| **Mover** (cambiar fechas conservando duración) | Pendientes y confirmadas | Drag horizontal sobre la misma fila del vehículo. PATCH a `fecha_inicio` y `fecha_fin` proporcional. |
| **Estirar** (cambiar duración por un extremo) | Pendientes y confirmadas | Drag del borde izquierdo o derecho del bloque. Recalcula tarifa al cambiar de banda (diaria → semanal). |
| **Reasignar entre vehículos** | Pendientes y confirmadas | Drag vertical a otra fila de vehículo. PATCH a `vehiculo_id` y se re-verifican solapamientos en el destino. |
| **Activas, finalizadas, canceladas** | — | **No se pueden arrastrar.** Bloque marcado con cursor `not-allowed`. Para extender un alquiler activo se usa el botón "Extender" del detalle (D11). |

**Manejo de conflictos durante el drag:**

- Mientras el usuario arrastra, el calendario calcula en vivo si la posición de soltado va a generar solapamiento.
- Si solapa con otra reserva confirmada/activa o un alquiler activo → el bloque se pinta **rojo**, el cursor cambia a `not-allowed`, y al soltar **vuelve a su posición original** sin hacer la mutación. Toast informativo: "No se puede mover ahí. Conflicto con reserva #X de Cliente Y".
- Si solapa con otra reserva **pendiente** → el bloque se pinta amarillo, el drop se permite pero al soltar aparece un confirm dialog con el detalle del solape y opción "Continuar igual".
- Si no hay conflicto → el bloque queda verde mientras se arrastra y al soltar dispara la mutación.

**Undo con toast:**

- Cualquier movimiento exitoso muestra un toast (Sonner) con el mensaje "Reserva #42 movida al 28/05" y un botón "Deshacer" durante **5 segundos**.
- Pulsar "Deshacer" dispara una mutación inversa que restaura el estado anterior (las fechas y vehículo previos se guardan en memoria del componente, no en backend).
- Si el usuario no pulsa "Deshacer" en 5s, el cambio queda firme.

**Optimistic UI:**

- Al soltar el bloque, el calendario se actualiza visualmente de inmediato (optimistic).
- En paralelo se dispara la mutación al backend.
- Si el backend devuelve error (un 409 que el frontend no detectó por race condition), el bloque vuelve a su posición original y se muestra toast de error.

**Endpoints involucrados:**

```
PATCH /api/v1/reservas/{id}                  # body: { fecha_inicio?, hora_inicio?, fecha_fin?, hora_fin?, vehiculo_id? }
                                             # solo permitido en estado pendiente o confirmada
```

Reglas del PATCH (extendidas respecto al spec original que decía "solo pendiente"):
- Estado `pendiente`: se puede cambiar todo (vehiculo_id, cliente_id, fechas, lugares).
- Estado `confirmada`: se puede cambiar fechas y vehiculo_id (con re-verificación de solapamiento). No se pueden cambiar cliente, lugares.
- Cualquier otro estado: 409.

**Snap del drag:**

- El drag horizontal hace **snap a 1 hora** por default (ajustable por env var `CALENDARIO_SNAP_MINUTOS`, default 60).
- El drag vertical hace snap a la fila de cada vehículo (no hay valores intermedios).

**Tecnología:** **@dnd-kit** ya planeado en `PLANNING_FRONTEND.md`. Se usa `DndContext` con sensores `PointerSensor` y `KeyboardSensor` (accesibilidad).

**Justificación:** el calendario es la herramienta de trabajo principal de Franco. Read-only sería una herramienta a medias. El costo de hacerlo funcional desde F3 es alto pero el valor también — sin esto, F3 no reemplaza al Excel.

**Impacto en slicing:** Slice 9 deja de ser "1 día" y pasa a ser **2 días** (Slice 9a: timeline read-only base, Slice 9b: drag-and-drop sobre eso). Tiempo total de Fase 3 sube de 8-10 días a **9-11 días**.

### D9. Migración correctiva — sí, hace falta

**Decisión:** **sí se genera migración correctiva** (`008_pre_fase3_estado_real`). El estado actual de los modelos tiene problemas que F3 no puede ignorar.

**Análisis del estado actual** (verificado en `backend/app/models/`):

#### Bloque 1 — Tipos de fecha y hora como `String`

Los campos `fecha_inicio`, `hora_inicio`, `fecha_fin`, `hora_fin` en `Reserva` y `checkout_fecha`, `checkout_hora`, `checkin_fecha`, `checkin_hora` en `Alquiler` están como `String(10)` y `String(5)`.

Problema: las queries de solapamiento de F3 necesitan comparar `datetime`. Con strings:
- No se puede usar `WHERE inicio < ventana.fin` con índices eficientes.
- `"9:00"` y `"09:00"` ordenan distinto (uno con dígito menor que otro).
- Riesgo de bugs por formatos inconsistentes.

**Migración:**
- `reservas.fecha_inicio`, `fecha_fin`: `VARCHAR(10) → DATE`
- `reservas.hora_inicio`, `hora_fin`: `VARCHAR(5) → TIME`
- `alquileres.checkout_fecha`: `VARCHAR(10) → DATE`
- `alquileres.checkout_hora`: `VARCHAR(5) → TIME`
- `alquileres.checkin_fecha`: `VARCHAR(10) → DATE NULL`
- `alquileres.checkin_hora`: `VARCHAR(5) → TIME NULL`

En dev: la base se regenera con `docker compose down -v` + `seed`, no hay datos productivos. Si en el futuro hubiera datos reales, el migrador usaría `USING fecha_inicio::date` y conversión explícita.

#### Bloque 2 — Campos faltantes en Alquiler (para D6 cobro granular)

- `horas_excedente` se renombra a `horas_excedidas` (ya existe).
- `+ horas_cobradas NUMERIC(6,2) NULL` (nuevo, para cobro parcial).
- `+ motivo_bonificacion TEXT NULL` (nuevo).
- `bonificado_por` se renombra a `decidido_por` (mantiene FK a `usuarios.id`). Más correcto semánticamente porque ahora también se llena cuando se cobra completo (no solo al bonificar).
- `+ checkout_registrado_en_tiempo_real BOOL DEFAULT TRUE` (nuevo, para D5 trazabilidad).
- `+ checkin_registrado_en_tiempo_real BOOL DEFAULT TRUE` (nuevo).

#### Bloque 3 — Campos faltantes en Reserva (para D11 extensión)

- `+ tarifa_aplicada_id INT NULL FK→tarifas.id` (la tarifa que se usó al confirmar; necesaria para recalcular si se extiende).
- `+ precio_total NUMERIC(12,2) NULL` (precio total de la reserva confirmada; se actualiza al extender).
- `+ bloqueada_por_solape BOOL DEFAULT FALSE` (D2 default — para reservas pendientes que quedaron solapadas con una recién confirmada).

#### Bloque 4 — Índices nuevos

- `reservas (vehiculo_id, fecha_inicio)` — query de solapamiento.
- `reservas (estado) WHERE estado IN ('pendiente', 'confirmada', 'activa')` — query de "reservas a reasignar" cuando se inactiva un vehículo.
- `alquileres (checkout_fecha)` — query de "alquileres del día".

#### Resumen del archivo de migración

```python
# 008_pre_fase3_estado_real.py
def upgrade():
    # tipos
    op.alter_column('reservas', 'fecha_inicio', type_=sa.Date(), postgresql_using='fecha_inicio::date')
    op.alter_column('reservas', 'fecha_fin',    type_=sa.Date(), postgresql_using='fecha_fin::date')
    op.alter_column('reservas', 'hora_inicio',  type_=sa.Time(), postgresql_using='hora_inicio::time')
    op.alter_column('reservas', 'hora_fin',     type_=sa.Time(), postgresql_using='hora_fin::time')
    op.alter_column('alquileres', 'checkout_fecha', type_=sa.Date(), postgresql_using='checkout_fecha::date')
    op.alter_column('alquileres', 'checkout_hora',  type_=sa.Time(), postgresql_using='checkout_hora::time')
    op.alter_column('alquileres', 'checkin_fecha',  type_=sa.Date(), postgresql_using='checkin_fecha::date', existing_nullable=True)
    op.alter_column('alquileres', 'checkin_hora',   type_=sa.Time(), postgresql_using='checkin_hora::time',  existing_nullable=True)

    # alquiler — campos nuevos
    op.alter_column('alquileres', 'horas_excedente', new_column_name='horas_excedidas')
    op.alter_column('alquileres', 'bonificado_por',  new_column_name='decidido_por')
    op.add_column('alquileres', sa.Column('horas_cobradas', sa.Numeric(6, 2), nullable=True))
    op.add_column('alquileres', sa.Column('motivo_bonificacion', sa.Text(), nullable=True))
    op.add_column('alquileres', sa.Column('checkout_registrado_en_tiempo_real', sa.Boolean(), server_default='true', nullable=False))
    op.add_column('alquileres', sa.Column('checkin_registrado_en_tiempo_real',  sa.Boolean(), server_default='true', nullable=False))

    # reserva — campos nuevos
    op.add_column('reservas', sa.Column('tarifa_aplicada_id', sa.Integer(), sa.ForeignKey('tarifas.id'), nullable=True))
    op.add_column('reservas', sa.Column('precio_total', sa.Numeric(12, 2), nullable=True))
    op.add_column('reservas', sa.Column('bloqueada_por_solape', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('reservas', sa.Column('hora_devolucion_acordada', sa.Time(), nullable=True))  # D1 late checkout
    op.add_column('reservas', sa.Column('late_checkout', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('reservas', sa.Column('cargo_late_checkout', sa.Numeric(12, 2), server_default='0', nullable=False))

    # índices
    op.create_index('ix_reservas_vehiculo_fecha_inicio', 'reservas', ['vehiculo_id', 'fecha_inicio'])
    op.create_index('ix_reservas_estado_activos', 'reservas', ['estado'], postgresql_where=sa.text("estado IN ('pendiente', 'confirmada', 'activa')"))
    op.create_index('ix_alquileres_checkout_fecha', 'alquileres', ['checkout_fecha'])
```

**Justificación:** la inversión de medio día en la migración previene varios días de bugs y refactorizaciones más adelante. Los tipos correctos en DB son la base sobre la que toda la lógica de F3 se apoya.

### D10. Auth en F3

**Decisión:** **mantener `DEV_BYPASS_AUTH=true`**. Los endpoints `bonificar-excedente` (admin only) ya consultan rol del usuario inyectado. Cuando se migre a Clerk en una fase posterior, el bypass se reemplaza sin tocar la lógica de F3.

### D11. Extensión de alquiler en curso

**Pregunta:** Un cliente con alquiler activo quiere agregar 1 o N días más. ¿Cómo se maneja?

**Decisión:** **PATCH del alquiler activo con recálculo automático**, sin crear una reserva nueva.

**Endpoint:**
```
PATCH /api/v1/alquileres/{id}/extender
body: { "nueva_fecha_fin": "2026-05-30", "nueva_hora_fin": "15:00" }
```

**Reglas:**
- Solo permitido cuando `reserva.estado == 'activa'` (es decir, el alquiler está corriendo, ya hubo checkout, no hubo checkin).
- La nueva fecha/hora fin debe ser posterior a la actual.
- Antes de aceptar la extensión, **verificar solapamiento contra reservas confirmadas o alquileres del mismo vehículo en el rango ampliado**. Si solapa → `409 Conflict` con detalle (típico: ya había una reserva confirmada para ese vehículo después). El operador deberá negociar manualmente (ej: ofrecer otro vehículo, contactar al otro cliente).
- Si no hay conflicto:
  - Recalcular `duracion_dias` y volver a aplicar `seleccionar_tarifa()` con la nueva duración. Esto puede cambiar de diaria a semanal o de semanal a mensual.
  - Persistir el nuevo precio total y el nuevo `fecha_fin` / `hora_fin` en la reserva.
  - Registrar el evento en log estructurado: `{evento: "alquiler_extendido", alquiler_id, fecha_anterior, fecha_nueva, tarifa_anterior, tarifa_nueva, diferencia_monto, usuario_id}`.

**Frontend:**
- En la vista de detalle de alquiler activo, botón "Extender alquiler".
- Dialog con date picker (nueva fecha fin) + preview en vivo del nuevo total.
- Manejo de 409: mostrar la reserva conflictiva.

**Justificación:** caso de negocio frecuente (cliente "me lo quedo un día más"). No tiene sentido cancelar+recrear. Importante: el recálculo de tarifa puede ser favorable al cliente (pasa de 6 días a 7 → tarifa semanal más barata) y eso debe reflejarse.

**Slicing:** este endpoint vive en Slice 5 (AlquilerService) como método extra. El frontend del botón está en Slice 8.

---

## 5. Slicing — cómo descomponemos los 8-10 días

8 slices, ordenados por dependencia. Cada slice es **mergeable, testeable y reversible**.

### Slice 0 — Migración correctiva pre-F3 (1 día)

**Objetivo:** dejar la DB y los modelos en el estado exacto que necesita F3, según D9.

**Pasos concretos:**

1. **Actualizar modelos SQLAlchemy** (`app/models/reserva.py` y `app/models/alquiler.py`):
   - Cambiar tipos `String(10)` → `Mapped[date]` con `Date()`.
   - Cambiar tipos `String(5)` → `Mapped[time]` con `Time()`.
   - Renombrar `horas_excedente` → `horas_excedidas` en `Alquiler`.
   - Renombrar `bonificado_por` → `decidido_por` en `Alquiler`.
   - Agregar a `Alquiler`: `horas_cobradas`, `motivo_bonificacion`, `checkout_registrado_en_tiempo_real`, `checkin_registrado_en_tiempo_real`.
   - Agregar a `Reserva`: `tarifa_aplicada_id` (FK a `tarifas`), `precio_total`, `bloqueada_por_solape`.

2. **Generar migración Alembic** `008_pre_fase3_estado_real` con autogenerate:
   ```bash
   docker compose run --rm --no-deps backend alembic revision --autogenerate -m "pre_fase3_estado_real"
   ```
   Revisar el archivo generado para que tenga las cláusulas `postgresql_using` para los conversiones de `String → Date/Time`. Si autogenerate las omite, agregarlas a mano según el bloque de código de D9.

3. **Agregar índices a la migración**:
   - `ix_reservas_vehiculo_fecha_inicio`
   - `ix_reservas_estado_activos` (parcial)
   - `ix_alquileres_checkout_fecha`

4. **Resetear la DB en dev y aplicar la migración:**
   ```powershell
   docker compose down -v
   docker compose up -d
   docker compose exec backend python -m scripts.seed
   ```

5. **Verificar `app/domain/enums.py`** — ya están todos los valores necesarios (`EstadoReserva`, `EstadoVehiculo`). Si Slice 1 detecta que falta algo, se agrega entonces.

6. **Auditar routers existentes** (`routers/reservas.py`, `routers/alquileres.py`):
   - Si tienen código stub de Fase 0 que vaya a entorpecer, vaciarlos (dejar solo el router con prefix y un endpoint dummy `GET /` que devuelve 200).
   - El código real se escribe en Slice 6.

**Tests:**
- Test simple de `INSERT` en cada tabla con los nuevos tipos para verificar que la migración aplicó correctamente.
- Verificar que las FK funcionan (intento de insertar con `vehiculo_id` inexistente → IntegrityError).

**Salida:**
- Modelos actualizados.
- Migración aplicada y reversible (downgrade probado).
- DB con los tipos correctos y los índices creados.
- Tabla `alquileres` y `reservas` con todos los campos que F3 necesita.

**Tiempo:** subió de 0.5 día a 1 día porque la migración no es trivial (conversión de tipos con datos existentes en dev requiere reset).

---

### Slice 1 — Domain layer puro (1 día)

**Objetivo:** funciones puras testeadas al 100%. Sin DB, sin SQLAlchemy.

**Archivos a producir:**

```
app/domain/
├── ventana.py             # @dataclass Ventana(inicio, fin)
├── solapamientos.py       # hay_solapamiento(a, b) -> bool
├── tarifas.py             # seleccionar_tarifa(duracion_dias, tarifas) -> Tarifa
├── control_24hs.py        # calcular_excedente(...) -> Decimal
└── transiciones.py        # puede_transicionar_*() funciones puras
```

**Tests obligatorios** (`tests/domain/`):

- `test_solapamientos.py`: total, parcial, exacto en bordes, sin solapamiento, ventanas adyacentes (10:00-12:00 vs 12:00-14:00 → no solapa).
- `test_tarifas.py`: 1 día → diaria, 6 días → diaria, 7 días → semanal, 29 días → semanal, 30 días → mensual, sin tarifa activa → `BusinessRuleError`, varias tarifas activas del mismo tipo → la más reciente.
- `test_control_24hs.py` (nueva firma — devuelve `ResultadoExcedente`):
  - **Firma esperada:**
    ```python
    @dataclass(frozen=True)
    class ResultadoExcedente:
        minutos_excedidos_brutos: int   # minutos reales de excedente (sin gracia)
        horas_excedidas: int            # floor(minutos / 60) — redondeado para abajo
        tarifa_diaria: Decimal          # X
        tarifa_hora_excedente: Decimal  # 3 × (X / 24)
        cargo_sugerido: Decimal         # según regla de tope a 12h
        aplica_dia_completo: bool       # True si horas >= TOPE_HORAS_ANTES_DIA_EXTRA
        dias_completos_cobrados: int    # ceil(horas / 24) si aplica_dia_completo, else 0

    def calcular_excedente(
        hora_devolucion_acordada: datetime,  # fecha_fin + hora_devolucion_acordada (D1)
        fecha_fin_real: datetime,
        tarifa_diaria: Decimal,
        gracia_minutos: int = 40,
        multiplicador_hora: int = 3,
        tope_horas: int = 12,
    ) -> ResultadoExcedente: ...
    ```
  - sin excedente (`checkin == hora_devolucion_acordada`) → `horas_excedidas=0, cargo_sugerido=0`
  - dentro de gracia (39 min) → 0
  - exacto en gracia (40 min) → 0
  - 41 min → `minutos_excedidos_brutos=1, horas_excedidas=0 (floor(1/60)=0), cargo=0` ← ¡0 horas completas! No se cobra nada hasta que haya 1h completa de excedente post-gracia.
  - 1h 40min de excedente bruto (100 min post-gracia) → `horas_excedidas=1, cargo = 1 × tarifa_hora_excedente`
  - 5h 03min de excedente → `horas_excedidas=5, cargo = 5 × tarifa_hora_excedente`
  - 5h 59min → `horas_excedidas=5` (floor), no 6
  - 11h 59min → `horas_excedidas=11, cargo = 11 × tarifa_hora_excedente, aplica_dia_completo=False`
  - 12h 00min → `aplica_dia_completo=True, dias_completos_cobrados=1, cargo = 1 × tarifa_diaria`
  - 25h → `aplica_dia_completo=True, dias_completos_cobrados=ceil(25/24)=2, cargo = 2 × tarifa_diaria`
  - 48h 01min → `dias_completos_cobrados=ceil(48.01/24)=3, cargo = 3 × tarifa_diaria`
  - tarifa_diaria=$24000 → tarifa_hora_excedente debe ser exactamente $3000 (`3 × 24000/24`).
  - **Late checkout:** si `hora_devolucion_acordada` es 14:00 y checkin es 15:30 → excedente bruto = 90min, post-gracia = 50min, `horas_excedidas=0`. Si checkin es 16:00 → excedente bruto = 120min, post-gracia = 80min, `horas_excedidas=1`.
- `test_tarifas_duracion.py` (nuevo, para D1):
  - `calcular_duracion_dias(2026-05-21, 2026-05-23)` → 2 días
  - `calcular_duracion_dias(2026-05-21, 2026-05-21)` → 0 días (mismo día, no tiene sentido pero no debe romper)
  - `calcular_duracion_dias(2026-05-21, 2026-05-28)` → 7 días → tarifa semanal
- `test_transiciones.py`: matriz completa de la tabla D3.

**Criterio de salida:** `pytest tests/domain/ -v` con cobertura 100% en `app/domain/`. Todos los valores de cargo verificados con cálculo manual (no con `pytest.approx`).

---

### Slice 2 — Property-based tests del invariante crítico (0.5 día)

**Objetivo:** garantizar matemáticamente que **un vehículo nunca puede estar reservado/alquilado a dos clientes solapadamente** (excepto reservas pendientes según D2).

**Setup:** instalar `hypothesis`. Crear `tests/domain/test_invariantes.py`.

**Property a verificar:**

```
Para cualquier secuencia de operaciones {crear_reserva, confirmar, cancelar, checkout, checkin}
sobre un vehículo, después de aplicar la secuencia:

  no_existen_dos_intervalos_solapados(
    [r for r in reservas si r.estado in {confirmada, activa}]
  )
```

**Justificación:** este es el invariante de negocio más importante de F3. Si falla, hay sobre-booking → cliente sin auto. Property-based explora secuencias que un humano no se imaginaría.

**Implementación:** modelar el sistema como una máquina de estado en memoria (sin DB), aplicar `hypothesis.stateful.RuleBasedStateMachine`, dejar correr 1000 ejemplos.

**Criterio de salida:** test pasa con `--hypothesis-seed=0` y con seeds aleatorios (3 corridas).

---

### Slice 3 — Repositorios (0.5 día)

**Archivos:**

```
app/repositories/
├── reserva_repo.py
└── alquiler_repo.py
```

**Métodos por repositorio:**

`ReservaRepo`:
- `get(id)`, `list(filters)`, `create(reserva)`, `update(id, **kwargs)`
- `find_solapadas(vehiculo_id, ventana, estados=[confirmada, activa])` — query con condición `inicio < ventana.fin AND fin > ventana.inicio`
- `find_proxima_confirmada(vehiculo_id, desde, dentro_de_horas=4)` — usado por checkin para detectar `en_transicion`

`AlquilerRepo`:
- `get(id)`, `list(filters)`, `create`, `update`
- `get_by_reserva(reserva_id)`

**Tests:** integración con DB de prueba. Insertar fixtures, ejecutar query, verificar resultado. **No** tests de "el repo persiste lo que le paso" (eso es testear SQLAlchemy).

**Criterio de salida:** queries de solapamiento devuelven el resultado correcto en al menos 5 escenarios.

---

### Slice 4 — ReservaService (1.5 días)

**Archivo:** `app/services/reserva_service.py`.

**Dependencias inyectadas:** `ReservaRepo`, `AlquilerRepo`, `VehiculoRepo` (de Fase 1), `ClienteRepo` (de Fase 2).

**Métodos:**

```
class ReservaService:
    def create(data: ReservaCreate, usuario_id: int) -> Reserva
    def update(id: int, data: ReservaUpdate, usuario_id: int) -> Reserva  # solo si estado=pendiente
    def confirmar(id: int, usuario_id: int) -> Reserva
    def cancelar(id: int, usuario_id: int) -> Reserva
    def list(filters) -> list[Reserva]
    def get(id) -> Reserva
    def wa_link(id) -> str
```

**Reglas a implementar:**

- En `create`: validar que vehículo y cliente existen y están activos. Buscar solapamientos contra reservas confirmadas y alquileres activos del vehículo. Si hay → `ConflictError`. Si solapa con pendiente → seguir adelante pero cargar `warnings`. Estado inicial = `pendiente`.
- En `confirmar`: solo desde `pendiente`. Re-verificar solapamientos (otra reserva pudo haberse confirmado entre medio). Cambiar estado a `confirmada`. Si vehículo está `disponible` → pasar a `reservado`.
- En `cancelar`: desde `pendiente` o `confirmada`. Si era confirmada y dejaba al vehículo en `reservado` y no hay otras reservas confirmadas activas → vehículo vuelve a `disponible`.

**Transacciones:** cada método que toca más de una tabla (cambio de reserva + cambio de estado de vehículo) corre en `with self.db.begin():`.

**Tests:** integración con DB. Casos:
- crear reserva válida → estado pendiente
- crear con solape contra confirmada → 409
- crear con solape contra pendiente → ok + warning
- crear con vehículo inactivo → 404
- confirmar con solape generado entre medio → 409
- cancelar reserva confirmada única → vehículo a disponible
- cancelar reserva confirmada con otra activa → vehículo sigue reservado

**Criterio de salida:** todos los casos arriba pasan.

---

### Slice 5 — AlquilerService (2 días)

**Archivo:** `app/services/alquiler_service.py`.

**Métodos:**

```
class AlquilerService:
    def preview_excedente(alquiler_id, checkin_fecha, checkin_hora) -> ResultadoExcedente
    def checkout(reserva_id, data: CheckoutData, usuario_id) -> Alquiler
    def checkin(alquiler_id, data: CheckinData, usuario_id) -> Alquiler
    def extender(alquiler_id, data: ExtenderData, usuario_id) -> Alquiler   # D11
    def list(filters)
    def get(id)
```

**Reglas a implementar:**

`preview_excedente`:
- Endpoint helper para que el frontend muestre el cálculo en vivo durante el checkin sin tener que duplicar la fórmula en TS.
- Toma `alquiler_id` + fecha/hora propuesta de checkin → devuelve `ResultadoExcedente` (horas_excedidas, tarifa_hora_excedente, cargo_sugerido).
- No persiste nada.

`checkout`:
- Reserva debe estar `confirmada`.
- En F3: verificar contrato firmado pero **emitir warning, no bloquear** (D8 confirmación).
- Crear `Alquiler` con `checkout_fecha`, `checkout_hora`, `checkout_km`, `checkout_combustible`, `checkout_descripcion`.
- Cambiar estado de la reserva a `activa`.
- Cambiar estado del vehículo a `alquilado`.
- Actualizar `vehiculo.km_actual = checkout_km`.

`checkin` (con cobro granular según D6):
- Alquiler debe pertenecer a una reserva en estado `activa`.
- Validar `checkin_fecha+hora > checkout_fecha+hora`.
- Validar `checkin_km >= checkout_km`.
- Calcular `ResultadoExcedente` con `domain/control_24hs.calcular_excedente()`.
- Aplicar la decisión del admin recibida en el payload:
  ```python
  class DecisionExcedente(str, Enum):
      COBRAR_COMPLETO = "cobrar_completo"
      COBRAR_PARCIAL  = "cobrar_parcial"
      NO_COBRAR       = "no_cobrar"

  class CheckinData(BaseModel):
      checkin_fecha: date
      checkin_hora: time
      checkin_km: int
      checkin_combustible: int
      checkin_descripcion: str | None
      decision_excedente: DecisionExcedente
      horas_a_cobrar: Decimal | None = None    # requerido si decision == COBRAR_PARCIAL
      motivo_bonificacion: str | None = None   # opcional pero recomendado si NO_COBRAR o PARCIAL
  ```
- Calcular `cargo_excedente` final:
  - `COBRAR_COMPLETO` → `cargo = horas_excedidas × tarifa_hora_excedente` (lo sugerido)
  - `COBRAR_PARCIAL` → validar `0 < horas_a_cobrar <= horas_excedidas` → `cargo = horas_a_cobrar × tarifa_hora_excedente`
  - `NO_COBRAR` → `cargo = 0`
- Persistir en el alquiler:
  - `horas_excedidas` (las reales)
  - `horas_cobradas` (las que el admin cobró; 0 o parciales)
  - `cargo_excedente`
  - `excedente_bonificado` = `(decision == NO_COBRAR)`
  - `decidido_por` (siempre el usuario que confirma checkin)
  - `motivo_bonificacion` (si vino)
- Cambiar estado de la reserva a `finalizada`.
- Determinar nuevo estado del vehículo:
  - Si hay reserva confirmada del mismo vehículo con `fecha_inicio` dentro de las próximas 4hs → `en_transicion`.
  - Sino → `disponible`.
- Actualizar `vehiculo.km_actual = checkin_km`.
- Log estructurado del evento con `decision_excedente`, `horas_excedidas`, `horas_cobradas`, `cargo_excedente`, `motivo`, `usuario_id`.

`extender` (D11):
- Reserva debe estar en estado `activa` (post-checkout, pre-checkin).
- Validar `nueva_fecha_fin + nueva_hora_fin > fecha_fin + hora_fin` actual.
- Verificar solapamiento contra reservas confirmadas y alquileres activos del mismo vehículo en el rango ampliado (desde la fecha_fin actual hasta la nueva). Si solapa → `ConflictError` con detalle.
- Recalcular `duracion_dias` con la nueva fecha fin.
- Recalcular tarifa con `seleccionar_tarifa(duracion_dias, tarifas_activas)` — puede cambiar de banda (diaria → semanal, etc.).
- Recalcular `precio_total = duracion_dias × tarifa.monto`.
- Persistir nueva fecha_fin, hora_fin, tarifa_aplicada_id, precio_total en la reserva.
- Log estructurado con `{evento: "alquiler_extendido", fecha_anterior, fecha_nueva, tarifa_anterior, tarifa_nueva, precio_anterior, precio_nuevo, usuario_id}`.
- Devuelve el alquiler con la reserva actualizada.

**Eliminado:** método `bonificar_excedente` separado. Esa decisión se toma en `checkin`. Si por alguna razón se necesita bonificar a posteriori (ej: el operador se equivocó), eso será un endpoint correctivo en una fase futura, no parte del flujo normal.

**Tests:** integración. Cubrir como mínimo:
- checkout sin reserva confirmada → error
- checkout válido → vehículo a alquilado, reserva a activa, km_actual actualizado
- checkin sin excedente, decision=COBRAR_COMPLETO → cargo 0
- checkin con excedente, decision=COBRAR_COMPLETO → cargo = horas × tarifa_hora_excedente
- checkin con excedente, decision=COBRAR_PARCIAL, horas_a_cobrar=2 con horas_excedidas=5 → cargo = 2 × tarifa_hora_excedente, `excedente_bonificado=False`
- checkin con excedente, decision=COBRAR_PARCIAL, horas_a_cobrar=10 con horas_excedidas=5 → 422 (parcial > total)
- checkin con excedente, decision=NO_COBRAR → cargo=0, `excedente_bonificado=True`, `decidido_por` registrado
- checkin con reserva próxima → vehículo a en_transicion
- checkin sin reserva próxima → vehículo a disponible
- preview_excedente no persiste nada y devuelve cálculo correcto
- extender sin conflicto → tarifa recalculada y precio nuevo correcto
- extender con conflicto → 409 con detalle de la reserva bloqueante
- extender que cruza de diaria a semanal (5 días → 8 días) → tarifa cambia y precio se ajusta a la banda nueva
- extender un alquiler no activo (pendiente, finalizado, cancelado) → error

**Criterio de salida:** todos los casos pasan.

---

### Slice 6 — Endpoints HTTP (1 día)

**Archivos:**

```
app/routers/reservas.py
app/routers/alquileres.py
```

**Endpoints según spec del módulo:**

```
GET    /api/v1/reservas
GET    /api/v1/reservas/{id}
POST   /api/v1/reservas
PATCH  /api/v1/reservas/{id}                ← solo pendiente
POST   /api/v1/reservas/{id}/confirmar
POST   /api/v1/reservas/{id}/cancelar
GET    /api/v1/reservas/{id}/wa-link

GET    /api/v1/alquileres
GET    /api/v1/alquileres/{id}
POST   /api/v1/reservas/{reserva_id}/checkout
GET    /api/v1/alquileres/{id}/preview-excedente?checkin_fecha&checkin_hora    ← preview en vivo
POST   /api/v1/alquileres/{id}/checkin                                          ← incluye decisión de excedente
PATCH  /api/v1/alquileres/{id}/extender                                         ← D11

GET    /api/v1/ocupacion?fecha_inicio&fecha_fin&vehiculo_ids
```

**Eliminado del listado anterior:** `POST /api/v1/alquileres/{id}/bonificar-excedente`. La decisión se toma ahora dentro del checkin.

**Schemas Pydantic** en `app/schemas/reserva.py`, `app/schemas/alquiler.py`, `app/schemas/ocupacion.py`.

**Endpoint `/ocupacion`:** retorna estructura optimizada para el calendario:
```json
{
  "data": {
    "vehiculos": [
      { "id": 1, "patente": "AB123CD", "marca": "Toyota", "modelo": "Hilux" },
      ...
    ],
    "eventos": [
      {
        "vehiculo_id": 1,
        "tipo": "reserva" | "alquiler",
        "estado": "confirmada" | "activa" | ...,
        "fecha_inicio": "...",
        "fecha_fin": "...",
        "cliente_nombre": "...",
        "id": 42
      },
      ...
    ]
  }
}
```

**Tests:** TestClient con happy path y casos de error. No re-testear lo de service.

**Criterio de salida:** Swagger en `/docs` muestra todos los endpoints. `curl` con DEV_BYPASS_AUTH funciona end-to-end.

---

### Slice 7 — Frontend: hooks + listados (1.5 días)

**Archivos:**

```
src/hooks/
├── useReservas.ts
├── useAlquileres.ts
└── useOcupacion.ts

src/pages/reservas/
├── List.tsx                  # tabla con tabs por estado
└── Detail.tsx                # ficha con info + acciones

src/components/reservas/
├── ReservaFormDialog.tsx     # alta/edición con Zod
├── ReservaTable.tsx
├── ReservaFilters.tsx
├── ReservaStatusBadge.tsx
├── VehiculoCombobox.tsx      # autocompletar — reusable
├── ClienteCombobox.tsx       # autocompletar — reusable
└── ConfirmCancelarDialog.tsx
```

**Funcionalidades:**

- `/reservas`: tabs Pendientes / Confirmadas / Activas / Finalizadas / Canceladas. Cada tab con tabla y filtros (rango fechas, vehículo, cliente).
- Botón "Nueva reserva" → dialog con form (vehículo, cliente, fechas, horas, lugares).
- Manejo de 409 de solapamiento: mostrar el detalle del conflicto en el form ("Solapa con reserva #X de Cliente Y").
- Manejo de warnings (solape con pendiente): banner amarillo arriba del form, no bloquea submit.
- Acciones por fila según estado: Confirmar / Cancelar / Ir a Checkout / Ver detalle.
- Detalle: bloque "Generar wa.me link" → copia al clipboard o abre.

**Componentes reutilizables clave:**

- `VehiculoCombobox` y `ClienteCombobox`: autocompletar con debounce, basado en endpoints existentes de F1 y F2. Se van a reusar en Cotizador (F8).

**Criterio de salida:**
- Crear, editar, confirmar, cancelar reserva desde la UI funciona end-to-end.
- 409 se muestra prolijo, no como toast de error genérico.

---

### Slice 8 — Frontend: Checkout, Checkin, Extender (1.5 días)

**Archivos:**

```
src/pages/reservas/
├── Checkout.tsx              # /alquileres/:reserva_id/checkout
└── Checkin.tsx               # /alquileres/:id/checkin

src/components/reservas/
├── CheckoutForm.tsx
├── CheckinForm.tsx
├── ExcedenteBadge.tsx
├── ExcedenteDecisionPanel.tsx   # nuevo: panel de decisión granular en checkin
└── ExtenderAlquilerDialog.tsx   # nuevo: D11
```

**Eliminado:** `BonificarDialog.tsx`. La decisión vive en el `ExcedenteDecisionPanel` dentro del form de checkin.

**Funcionalidades:**

- `Checkout`: muestra resumen reserva (vehículo, cliente, fechas), form con km salida, % combustible, descripción, fecha/hora con default `now()`. Submit → redirect a detalle alquiler.

- `Checkin` con **panel de decisión de excedente**:
  - Form base: km llegada, % combustible, descripción, fecha/hora.
  - **Preview en vivo:** cuando el operador ingresa fecha/hora de checkin, el frontend llama a `GET /alquileres/{id}/preview-excedente` con debounce. La fórmula del cargo no se duplica en TS — se confía en el backend para evitar drift.
  - Mientras carga el preview: skeleton del panel.
  - Resultado del preview se muestra en un panel destacado:
    ```
    ┌─────────────────────────────────────────────┐
    │ ⏱  Excedente: 5h 15min                       │
    │ 💵 Tarifa por hora extra: $3.750             │
    │ 💰 Cargo sugerido: $19.687,50                │
    │                                              │
    │ ¿Cómo cobrar?                                │
    │ ( ) Cobrar completo (5h 15min = $19.687,50)  │
    │ ( ) Cobrar parcial: [   ] horas → $___       │
    │ ( ) No cobrar (bonificar)                    │
    │                                              │
    │ Motivo (opcional para parcial / bonificación)│
    │ [_______________________________________]    │
    └─────────────────────────────────────────────┘
    ```
  - Validación TS: si "parcial" → `0 < horas_a_cobrar <= horas_excedidas`.
  - Si no hay excedente (cliente puntual) → el panel no aparece.
  - Submit envía `decision_excedente`, `horas_a_cobrar`, `motivo_bonificacion` al backend.

- En detalle de alquiler finalizado con excedente, **mostrar la decisión histórica**:
  - "Cobrado completo: 5h × $3.750 = $19.687,50"
  - "Cobrado parcial: 2h de 5h excedidas — Bonificado por Franco — Motivo: cliente frecuente"
  - "Bonificado por Franco — Motivo: demora en aeropuerto"

- En detalle de alquiler **activo** (post-checkout, pre-checkin):
  - Botón **"Extender alquiler"** → abre `ExtenderAlquilerDialog`:
    - Date picker para nueva fecha fin (con default = fecha fin actual + 1 día).
    - Preview en vivo del nuevo precio:
      ```
      Duración actual: 5 días × $30.000 (tarifa diaria) = $150.000
      Nueva duración:  8 días × $25.000 (tarifa semanal) = $200.000
      Diferencia:      +$50.000
      ```
    - Manejo de 409: muestra "El vehículo tiene una reserva confirmada el {fecha} para {cliente}. No se puede extender."
    - Submit → invalidar queries y refrescar detalle.

**Criterio de salida:**
- Ciclo completo Reserva → Confirmar → Checkout → Checkin con cualquiera de las 3 decisiones de excedente funciona desde la UI.
- Extender alquiler activo funciona, recalcula tarifa al cambiar de banda, y muestra conflicto cuando corresponde.

---

### Slice 9 — Frontend: Calendario de ocupación funcional (2 días)

Este slice se divide en dos sub-slices secuenciales por su tamaño.

#### Slice 9a — Timeline base (1 día)

**Archivos:**

```
src/components/ocupacion/
├── OcupacionTimeline.tsx     # componente principal
├── OcupacionLegend.tsx       # leyenda de colores
├── OcupacionFilters.tsx      # rango de fechas, categoría
└── OcupacionEvento.tsx       # bloque individual de reserva/alquiler
```

**Integración:**

- Embebido en `/reservas` como tab "Calendario".
- Reutilizable: en F4 se va a meter en el Dashboard.

**Funcionalidad base (sin drag):**
- Filas: vehículos (ordenados alfabéticamente por patente). Columnas: días (default: próximos 14 días, ajustable a 7 / 14 / 30).
- Cada reserva/alquiler como bloque coloreado según estado (colores del design system).
- Click en bloque → navega a detalle de la reserva.
- Tooltip con cliente, fechas, lugares.
- Filtros: rango de fechas (selector con presets "Esta semana / Próximas 2 semanas / Este mes"), categoría de vehículo, vehículo específico.
- Indicador visual de "hoy" (línea vertical).
- Empty state cuando no hay reservas en el rango.
- Loading state con skeletons.

**Datos:** consume `useOcupacion(filters)` que llama a `GET /api/v1/ocupacion`.

**Criterio de salida 9a:**
- Un mes completo de reservas se ve correcto.
- Estados se distinguen visualmente.
- Click navega bien.
- Filtros funcionan.

#### Slice 9b — Drag-and-drop (1 día)

**Archivos adicionales:**

```
src/components/ocupacion/
├── DraggableEvento.tsx       # OcupacionEvento envuelto en useDraggable
├── DroppableSlot.tsx         # celda del grid que acepta drop
├── DragGhost.tsx             # vista previa que sigue al cursor
└── ConflictoOverlay.tsx      # overlay rojo cuando hay solape
```

**Setup técnico:**
- Instalar `@dnd-kit/core` y `@dnd-kit/modifiers`.
- Envolver el calendario en `<DndContext sensors={[PointerSensor, KeyboardSensor]}>`.
- Snap configurable vía env var `VITE_CALENDARIO_SNAP_MINUTOS` (default 60).

**Reglas implementadas (D8):**

1. **Qué se puede arrastrar:**
   - Bloques en estado `pendiente` o `confirmada` → draggable.
   - Bloques en estado `activa`, `finalizada`, `cancelada` → no draggable, cursor `not-allowed`.

2. **Tipos de drag:**
   - **Mover** — agarrar el centro del bloque y arrastrar (horizontal o vertical).
   - **Estirar inicio** — agarrar el borde izquierdo, drag horizontal.
   - **Estirar fin** — agarrar el borde derecho, drag horizontal.
   - El cursor cambia según la zona del bloque (`grab` en centro, `ew-resize` en bordes).

3. **Detección de conflictos en vivo:**
   - Hook `useConflictoDetection(eventoActivo, posicionPropuesta, todosLosEventos)` que devuelve `{tipo: 'sin_conflicto' | 'pendiente' | 'firme', conflicto?}`.
   - Mientras se arrastra, el bloque se pinta:
     - **Verde** si no hay conflicto.
     - **Amarillo** si solapa con una pendiente (D2).
     - **Rojo** si solapa con confirmada/activa/alquiler.
   - Si rojo → al soltar, vuelve a la posición original con un toast: "No se puede mover: conflicto con reserva #X de Cliente Y".
   - Si amarillo → al soltar, abre confirm dialog con detalle del solape y botón "Continuar igual" / "Cancelar".

4. **Reasignación entre vehículos:**
   - Drag vertical a otra fila de vehículo → cambia `vehiculo_id`.
   - Backend re-verifica solapamiento en el destino.

5. **Optimistic UI con rollback:**
   - Al soltar (sin conflicto rojo), el calendario actualiza visualmente de inmediato.
   - Mutación se dispara en paralelo (`PATCH /api/v1/reservas/{id}`).
   - Si falla → toast de error + rollback visual al estado previo.
   - Si éxito → nada visual extra (ya está actualizado).

6. **Undo con toast:**
   - Toda mutación exitosa muestra Sonner toast "Reserva movida al 28/05" con botón "Deshacer" durante 5s.
   - Pulsar "Deshacer" → mutación inversa con los valores previos guardados en estado del componente padre.
   - El toast desaparece automáticamente a los 5s o al pulsar Deshacer.

7. **Snap horizontal a 1 hora** (configurable). Drag más fino de los bordes.

**Tests:**
- Probar drag simple de mover sin conflicto.
- Drag de estirar borde derecho que cruza umbral de 7 días → tarifa cambia (verificar preview).
- Drag a celda con conflicto firme → bloque vuelve.
- Drag a celda con pendiente → confirm dialog aparece.
- Reasignación entre vehículos sin conflicto → vehiculo_id cambia.
- Toast de undo restaura el estado previo correctamente.

**Criterio de salida 9b:**
- Las 7 reglas anteriores funcionan en navegador.
- El calendario es la herramienta principal del operador para gestionar reservas a futuro.

---

### Slice 10 — Smoke test E2E + cierre (0.5 día)

**Objetivo:** validar el flujo completo según el spec del módulo, manualmente.

**Pasos exactos del smoke test:**

**Bloque A — Flujo principal:**
1. Crear vehículo (Fase 1) y cliente (Fase 2) si no existen.
2. Crear reserva del vehículo para mañana 10am-15hs → estado pendiente.
3. Intentar crear otra reserva del mismo vehículo solapada con confirmada → debe fallar con 409 mostrando detalle del conflicto.
4. Confirmar la primera reserva → vehículo pasa a `reservado`.
5. Hacer checkout dejando default NOW → vehículo pasa a `alquilado`, reserva a `activa`, alquiler creado, `checkout_registrado_en_tiempo_real = true`.
6. Extender el alquiler un día más → preview muestra nuevo precio con desglose de tarifa, fecha fin se actualiza.
7. Hacer checkin con km > km checkout y dentro de gracia (40 min) → sin excedente, vehículo a `disponible`.

**Bloque B — Cobro de excedente con las tres opciones:**
8. Crear otra reserva, hacer checkout, hacer checkin con 5h de retraso. Para cada una de las opciones, repetir el flujo desde una reserva nueva:
   - **Cobrar completo** → cargo = 5 × tarifa_hora_excedente.
   - **Cobrar parcial 2h** → cargo = 2 × tarifa_hora_excedente, registro de horas_excedidas=5 vs horas_cobradas=2.
   - **No cobrar (bonificar)** → cargo=0, `excedente_bonificado=True`, `decidido_por` registrado.
9. Verificar que el detalle del alquiler finalizado muestra correctamente la decisión histórica para cada caso.

**Bloque C — Override manual de fecha/hora (D5):**
10. Hacer un checkin pulsando "Editar fecha y hora" para registrar un horario anterior al actual (ej: cliente devolvió 3h atrás) → cálculo de excedente correcto basado en la fecha editada, `checkin_registrado_en_tiempo_real = false`.

**Bloque D — Inactivación de vehículo con reservas (D4):**
11. Tener un vehículo con al menos 2 reservas pendientes/confirmadas + 1 alquiler activo.
12. Pulsar "Dar de baja" → backend devuelve la lista de reservas afectadas con cliente y fechas.
13. Confirmar la baja → vehículo queda inactivo, las reservas conservan estado.
14. Ir a "Reservas a reasignar" → aparecen las 3 reservas. Reasignar una a otro vehículo → cambia `vehiculo_id` y reserva queda activa en el otro.

**Bloque E — Extensión con conflicto:**
15. Crear reserva confirmada para el día siguiente del alquiler activo. Intentar extender el alquiler activo a esa fecha → 409 con detalle.

**Bloque F — Calendario funcional (D8):**
16. Abrir tab Calendario en `/reservas`. Verificar que todas las reservas/alquileres aparecen.
17. **Mover** una reserva pendiente arrastrándola a otro día sin conflicto → toast con "Deshacer", la reserva queda en la nueva fecha. Pulsar "Deshacer" dentro de los 5s → vuelve.
18. **Estirar** una reserva confirmada de 5 a 8 días arrastrando el borde derecho → recálculo de tarifa visible (de diaria a semanal).
19. **Reasignar** una reserva pendiente arrastrándola a la fila de otro vehículo libre → vehiculo_id cambia.
20. Intentar arrastrar una reserva a un slot ocupado por una confirmada → bloque rojo, no se puede soltar, vuelve a su posición.
21. Intentar arrastrar una reserva a un slot ocupado por una pendiente → bloque amarillo, confirm dialog aparece, se puede confirmar el solape.
22. Intentar arrastrar una reserva activa o finalizada → cursor `not-allowed`, no se puede arrastrar.

**Si todos los bloques pasan → Fase 3 cerrada.**

**Update de docs:**
- `ESTADO.md`: agregar sección "Fase 3 — Reservas/Alquileres ✅".
- `fase2_y_actualidad.md`: agregar bloque de F3 a la lista de funcionalidades operables.

---

## 6. Riesgos identificados y mitigación

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| **Race condition en confirmación de reservas** (dos confirmaciones simultáneas que solapan) | Baja (uso 2-3 personas) | Alto (sobre-booking) | Lock pesimista o `SELECT ... FOR UPDATE` al re-verificar solapamiento dentro de la transacción. Si lock no disponible → re-leer + verificar antes del commit. |
| **Excedente mal calculado por timezone** | Media | Alto (cobro incorrecto) | Forzar `America/Argentina/Buenos_Aires` en `Settings`. Tests deben usar timezone explícito, no `datetime.now()` directo. |
| **Estado de vehículo desincronizado por errores de transacción** | Baja | Alto | Toda mutación de estado de vehículo va dentro del mismo `with db.begin():` que el cambio de reserva/alquiler. Nunca en transacciones separadas. |
| **Modelos sin los campos del spec** | Alta (no se verificó) | Bloquea Slice 5 | Slice 0 dedicado a auditoría antes de empezar. |
| **Spec ambiguo en estado en transición** | Media | Medio | Decisión D3 + test específico que cubra el límite de 4hs (3h59min → en_transicion, 4h01min → disponible). |
| **`/ocupacion` lento con muchos vehículos** | Baja (flota chica) | Medio | Una sola query con JOIN + agrupación en Python. Índice `reservas(vehiculo_id, fecha_inicio)` ya planeado en B3.6. Medir antes de optimizar. |
| **El frontend recalcula excedente distinto al backend** | Resuelto | — | Mitigación aplicada: el frontend NO replica la fórmula. Llama a `GET /alquileres/{id}/preview-excedente` con debounce y muestra lo que devuelve el backend. Una sola fuente de verdad. |
| **Complejidad del drag-and-drop subestima el slice** | Alta | Medio | D8 ya entra en F3 con scope acotado. Slice 9b está separado de 9a — si 9b se complica, 9a queda mergeable como base read-only y 9b se posterga sin bloquear el módulo. |
| **Drag-and-drop optimistic UI desincronizado del backend** | Media | Medio | Toda mutación de drag pasa por React Query con `onError → rollback`. Estado del componente padre guarda los valores previos para undo. Tests de scenario donde backend devuelve 409 verifican que el bloque vuelve. |
| **Conversión de tipos String→Date/Time en migración con datos** | Baja (en dev) | Medio (en prod futuro) | Slice 0 resetea la DB en dev. Cuando haya datos productivos, el migrador usará `USING fecha_inicio::date` con tests previos en backup. |

---

## 7. Estrategia de testing — qué se testea dónde

| Capa | Tipo de test | Cobertura objetivo | Herramienta |
|---|---|---|---|
| `domain/` | Unitarios puros | 100% de líneas y ramas | pytest |
| `domain/` invariantes | Property-based | 1000 ejemplos por property | hypothesis |
| `repositories/` | Integración con DB | Queries no triviales (solapamiento, próxima reserva) | pytest + db_session fixture |
| `services/` | Integración con DB | Flujos principales + casos de error | pytest |
| `routers/` | Smoke con TestClient | Happy path + 1 caso 4xx por endpoint | pytest + httpx |
| `frontend/hooks` | (opcional, F3) | Diferido a F5 si aparece complejidad | Vitest |
| E2E manual | Smoke del módulo | El flujo del Slice 10 | navegador + curl |

**Regla:** un caso de borde testeado en `domain/` no se re-testea en `service/` ni en `router/`.

---

## 8. Contratos de API — formato esperado

Para que el frontend pueda construirse en paralelo cuando el backend esté en Slice 6:

### POST /api/v1/reservas

**Request:**
```json
{
  "vehiculo_id": 1,
  "cliente_id": 5,
  "fecha_inicio": "2026-05-25",
  "hora_inicio": "10:00",
  "fecha_fin": "2026-05-27",
  "hora_fin": "15:00",
  "lugar_entrega": "Bahía Blanca - oficina",
  "lugar_devolucion": "Bahía Blanca - oficina",
  "notas": "..."
}
```

**Response 201:**
```json
{
  "data": {
    "id": 42,
    "estado": "pendiente",
    "vehiculo": { "id": 1, "patente": "AB123CD", "marca": "...", "modelo": "..." },
    "cliente": { "id": 5, "nombre_completo": "..." },
    "fecha_inicio": "2026-05-25",
    "hora_inicio": "10:00",
    ...
    "warnings": []
  },
  "message": "Reserva creada",
  "success": true
}
```

**Response 201 con warning de pendiente:**
```json
{
  "data": { ... "warnings": [{ "tipo": "solape_con_pendiente", "reserva_id": 38 }] }
}
```

**Response 409:**
```json
{
  "detail": {
    "code": "solapamiento",
    "message": "El vehículo tiene una reserva confirmada en ese rango",
    "conflicto": { "reserva_id": 33, "estado": "confirmada", "fecha_inicio": "...", "fecha_fin": "..." }
  }
}
```

### GET /api/v1/alquileres/{id}/preview-excedente

Endpoint helper para que el frontend muestre el cálculo en vivo durante el checkin.

**Query params:**
```
?checkin_fecha=2026-05-27&checkin_hora=16:30
```

**Response 200:**
```json
{
  "data": {
    "horas_excedidas": "5.25",
    "tarifa_diaria": "30000.00",
    "tarifa_hora_excedente": "3750.00",
    "cargo_sugerido": "19687.50",
    "dentro_de_gracia": false
  },
  "success": true
}
```

Si `checkin_fecha+hora <= fecha_fin_estimada + GRACIA_MINUTOS`:
```json
{
  "data": {
    "horas_excedidas": "0",
    "tarifa_diaria": "30000.00",
    "tarifa_hora_excedente": "3750.00",
    "cargo_sugerido": "0",
    "dentro_de_gracia": true
  }
}
```

### POST /api/v1/alquileres/{id}/checkin

**Request:**
```json
{
  "checkin_fecha": "2026-05-27",
  "checkin_hora": "16:30",
  "checkin_km": 12450,
  "checkin_combustible": 75,
  "checkin_descripcion": "...",
  "decision_excedente": "cobrar_completo" | "cobrar_parcial" | "no_cobrar",
  "horas_a_cobrar": "2.0",
  "motivo_bonificacion": "Cliente frecuente, demora justificada"
}
```

Reglas de validación:
- Si `decision_excedente == "cobrar_parcial"` → `horas_a_cobrar` requerido y `0 < horas_a_cobrar <= horas_excedidas`.
- Si `decision_excedente == "cobrar_completo"` → `horas_a_cobrar` se ignora (puede venir null).
- Si `decision_excedente == "no_cobrar"` → `horas_a_cobrar` se ignora.
- `motivo_bonificacion` opcional pero recomendado si parcial o no_cobrar.

**Response 200:**
```json
{
  "data": {
    "id": 18,
    "checkin_fecha": "2026-05-27",
    "checkin_hora": "16:30",
    "checkin_km": 12450,
    "horas_excedidas": "5.25",
    "horas_cobradas": "2.0",
    "tarifa_hora_excedente": "3750.00",
    "cargo_excedente": "7500.00",
    "excedente_bonificado": false,
    "decidido_por": { "id": 1, "nombre": "Franco" },
    "motivo_bonificacion": "Cliente frecuente",
    "vehiculo_estado_post_checkin": "disponible"
  }
}
```

### PATCH /api/v1/alquileres/{id}/extender

**Request:**
```json
{
  "nueva_fecha_fin": "2026-05-30",
  "nueva_hora_fin": "15:00"
}
```

**Response 200:**
```json
{
  "data": {
    "alquiler_id": 18,
    "reserva": {
      "fecha_fin_anterior": "2026-05-27",
      "fecha_fin_nueva": "2026-05-30",
      "duracion_dias_anterior": 5,
      "duracion_dias_nueva": 8,
      "tarifa_anterior": { "tipo": "diaria", "monto": "30000.00" },
      "tarifa_nueva": { "tipo": "semanal", "monto": "25000.00" },
      "precio_anterior": "150000.00",
      "precio_nuevo": "200000.00",
      "diferencia": "50000.00"
    }
  },
  "success": true
}
```

**Response 409:**
```json
{
  "detail": {
    "code": "solapamiento_extension",
    "message": "El vehículo ya tiene una reserva confirmada después de la fecha actual",
    "conflicto": {
      "reserva_id": 51,
      "cliente_nombre": "...",
      "fecha_inicio": "2026-05-28",
      "fecha_fin": "2026-05-31"
    }
  }
}
```

---

## 9. Stack de prompts para IA (orden de delegación)

Si la implementación se delega a agentes IA, este es el orden recomendado de prompts. Cada uno asume que el anterior cerró.

```
PROMPT 1 (Slice 0): "Auditá los archivos app/models/reserva.py, app/models/alquiler.py
y app/domain/enums.py. Compará campos contra el dictionary del spec del módulo.
Si falta algo, generá una migración Alembic con nombre 008_pre_fase3_estado_real."

PROMPT 2 (Slices 1-2): "Implementá app/domain/{ventana,solapamientos,tarifas,
control_24hs,transiciones}.py como funciones puras según las decisiones D1, D3
y los specs. Tests con cobertura 100% en tests/domain/. Property-based test del
invariante 'no doble booking' usando hypothesis."

PROMPT 3 (Slice 3): "Implementá ReservaRepo y AlquilerRepo en app/repositories/
con los métodos especificados en el plan. Tests de integración con DB que cubran
queries de solapamiento y find_proxima_confirmada."

PROMPT 4 (Slice 4): "Implementá ReservaService en app/services/reserva_service.py
con los métodos create, update, confirmar, cancelar, list, get, wa_link según
las reglas D2, D3, D7. Tests de integración con todos los casos del slice."

PROMPT 5 (Slice 5): "Implementá AlquilerService en app/services/alquiler_service.py
con checkout, checkin, bonificar_excedente. Reglas D5, D6, D8. Tests con todos
los casos del slice."

PROMPT 6 (Slice 6): "Implementá los routers reservas.py y alquileres.py con
todos los endpoints listados, schemas Pydantic, y el endpoint /ocupacion.
Smoke tests con TestClient."

PROMPT 7 (Slice 7): "Frontend de listado de reservas: hooks/useReservas.ts,
hooks/useAlquileres.ts, hooks/useOcupacion.ts, pages/reservas/{List,Detail}.tsx,
y componentes asociados. Manejo de 409 con detalle visible."

PROMPT 8 (Slice 8): "Frontend de checkout, checkin y bonificación según el plan."

PROMPT 9 (Slice 9): "Componente OcupacionTimeline read-only embebido en /reservas
como tab Calendario."

PROMPT 10 (Slice 10): "Ejecutar smoke test del Slice 10 paso a paso. Reportar
cualquier desviación. Actualizar ESTADO.md y fase2_y_actualidad.md."
```

Cada prompt es **autosuficiente**: el agente recibe este planning + el spec del módulo + la decisión correspondiente. No tiene que adivinar.

---

## 10. Definition of Done de toda la Fase 3

- [ ] Slice 0: migración `008_pre_fase3_estado_real` aplicada con tipos `Date/Time`, campos nuevos en Alquiler (`horas_excedidas`, `horas_cobradas`, `cargo_excedente`, `excedente_bonificado`, `decidido_por`, `motivo_bonificacion`, `checkout_registrado_en_tiempo_real`, `checkin_registrado_en_tiempo_real`) y en Reserva (`tarifa_aplicada_id`, `precio_total`, `bloqueada_por_solape`, `hora_devolucion_acordada`, `late_checkout`, `cargo_late_checkout`), e índices creados.
- [ ] Slice 1: `tests/domain/` con cobertura 100%. `calcular_excedente` devuelve `ResultadoExcedente` con la fórmula `3 × (X/24)`.
- [ ] Slice 2: property-based test del invariante de no doble booking pasa con 1000 ejemplos.
- [ ] Slice 3: queries de solapamiento y próxima reserva verificadas.
- [ ] Slice 4: ReservaService cubre los casos del slice incluyendo `inactivar_vehiculo_con_reservas` y `reasignar`.
- [ ] Slice 5: AlquilerService cubre los casos del slice incluyendo las 3 decisiones de excedente y el método `extender`.
- [ ] Slice 6: Swagger expone todos los endpoints (incluyendo `preview-excedente`, `extender`, `reservas-afectadas`, `inactivar`, `reasignar`), 200/4xx prolijo.
- [ ] Slice 7: alta, edición, confirmación, cancelación, listados, vista "Reservas a reasignar" e inactivación con confirmación funcionan desde UI.
- [ ] Slice 8: checkout, checkin con panel de decisión granular, override manual de fecha/hora, y extender alquiler funcionan desde UI.
- [ ] Slice 9a: calendario base con filtros y tooltips embebido en `/reservas`.
- [ ] Slice 9b: drag-and-drop con detección de conflictos, optimistic UI, undo de 5s, mover/estirar/reasignar.
- [ ] Slice 10: smoke test E2E pasa los 6 bloques completos (A-F).
- [ ] `ESTADO.md` y `fase2_y_actualidad.md` actualizados.

---

## 11. Pendientes para confirmar con Franco (solo 1 queda abierta)

La mayoría de las decisiones se cerraron en esta iteración. Solo queda una pregunta menor.

### ~~P1. Cálculo de duración~~ → CERRADO en D1

Reserva por días completos, ignorando horas. Late checkout como concepto separado.

### ~~P2. Reservas pendientes~~ → CERRADO en D2

No bloquea, advierte. Flag `bloqueada_por_solape` cuando una se confirma.

### ~~P3. Tope de horas antes de cobrar día extra~~ → CERRADO en D6

A partir de 12 horas de excedente se cobra 1 día completo. Constante fija `TOPE_HORAS_ANTES_DIA_EXTRA = 12`.

### ~~P4. Redondeo del excedente~~ → CERRADO en D6

Redondeo para abajo a la hora completa. 5h 03min → se cobran 5 horas. No se cobran minutos sueltos.

### ~~P5. Preview sin excedente~~ → CERRADO

Si no hay excedente, el panel de decisión no aparece. El admin confirma el checkin directamente.

### P6. Cargo del late checkout — PENDIENTE (menor, no bloquea Slice 1)

**Pregunta:** ¿El cargo por late checkout es un monto fijo que el operador ingresa al crear la reserva, o se calcula automáticamente (ej: X% de la tarifa diaria)?

**Default asumido:** **monto fijo ingresado por el operador** en el form de reserva. El sistema no lo calcula, solo lo registra y lo suma al precio total.

**Justificación del default:** cada late checkout se negocia caso a caso. No hay una regla universal. El operador sabe cuánto cobrar.

**Acción si Franco quiere fórmula automática:** agregar un campo `porcentaje_late_checkout` en configuración y calcular `cargo = tarifa_diaria × porcentaje / 100`. Cambio local en `domain/tarifas.py`.

---

## 12. Lo que **NO** se hace en Fase 3 (anti-scope-creep)

Para evitar que el agente se desvíe:

- ❌ Generación de PDF de contrato (es F5).
- ❌ Hard block del checkout sin contrato firmado (es F5; en F3 es warning).
- ❌ Endpoints públicos `/public/disponibilidad` y `/public/reservas` (son F9).
- ❌ APScheduler con alertas automáticas (son F9).
- ❌ Pagos vinculados al alquiler (son F6).
- ❌ Cuenta corriente automática al checkin (es F7).
- ❌ Tabla `audit_log` formal (es F6; en F3 es log estructurado).
- ❌ Reportes de ocupación (son F10).
- ❌ Migración real a Clerk (queda diferido).
- ❌ Endpoint `wa-link` y adapter de WhatsApp (D7 — diferido a fase de notificaciones futura).
- ❌ Mensajes automatizados a clientes (D7 — futuro).

Si durante la implementación aparece la tentación de incluir alguno → leer este plan, entender que rompe el slicing, diferir.

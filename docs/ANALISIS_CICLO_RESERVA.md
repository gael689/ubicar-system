# Análisis punta a punta — Ciclo de vida de la reserva, precios, clientes y vencimientos

**Fecha:** 2026-07-25
**Complementa:** `docs/PLAN_MAESTRO.md` (visión global). Este documento entra al detalle fino del flujo operativo.
**Método:** lectura completa de `reserva_service.py`, `alquiler_service.py`, `domain/*`, schemas y modales del frontend, contrastada con prácticas estándar de la industria (Hertz, Avis, Enterprise, National) y guías de rate management.

---

## 0. Resumen: los 8 problemas que hacen perder plata o bloquean la operación

| # | Problema | Efecto | Archivo |
|---|---|---|---|
| 1 | **No se puede registrar un check-in tardío** | El auto vuelve tarde y el sistema rechaza la devolución | `reserva_service.py` + `alquiler_service.py:233` |
| 2 | **El excedente se calcula contra la hora equivocada** | Cobra horas de más a clientes que devolvieron en horario | `alquiler_service.py:68,252` |
| 3 | **Todo cobro en checkout/checkin lanza error 500** | `Pago(usuario_id=...)` — el campo se llama `cobrado_por` | `alquiler_service.py:162,175,301` |
| 4 | **El anticipo se cuenta dos veces** | El sistema cree que el cliente pagó el doble; subestima la deuda | `alquiler_service.py:161` + `notificaciones.py` |
| 5 | **El precio semanal/mensual se multiplica por día** | Un alquiler de 10 días con tarifa semanal cobra 10× la semana | `domain/tarifas.py` |
| 6 | **Extender un alquiler sin tarifa borra el precio** | `precio_total` queda en NULL, la deuda desaparece | `alquiler_service.py:389-392` |
| 7 | **El estado "pendiente" es inalcanzable** | `confirmar()` es código muerto; el flujo de aprobación no existe | `reserva_service.py` |
| 8 | **Nada valida licencia, VTV ni póliza al entregar** | Se entrega un auto sin VTV o a un cliente con licencia vencida | `alquiler_service.py:77` |

Los detalles y el arreglo de cada uno están abajo, en el punto del ciclo donde aparecen.

---

## 1. Terminología (fijada según el rubro)

Para que no haya ambigüedad en el código ni en la UI:

- **Check-out** = el vehículo **sale** de la empresa. El cliente lo retira.
- **Check-in** = el cliente **devuelve** el vehículo. Vuelve a la empresa.
- **Late check-out** = se entrega el auto más tarde de lo previsto, o se le concede al cliente devolverlo a una hora distinta de la pactada originalmente.
- **Late check-in** = el cliente **devuelve tarde**. Es el caso que dispara el cargo por excedente (o su bonificación).
- **Early check-in** = devuelve antes. Hoy no está contemplado en absoluto (ver 4.6).

⚠️ El código actual usa `hora_devolucion_acordada` y `late_checkout` con una semántica confusa: el campo se llama "late checkout" pero lo que modela es la hora de devolución, o sea el check-in. **Renombrar a `hora_devolucion_pactada` y `devolucion_reprogramada`** para que el nombre diga lo que hace.

---

## 2. El ciclo completo, estado por estado

```
   [ crear ]
       │
       ▼
  ┌──────────┐   confirmar   ┌────────────┐  check-out  ┌─────────┐  check-in  ┌────────────┐
  │ PENDIENTE│──────────────►│ CONFIRMADA │────────────►│ ACTIVA  │───────────►│ FINALIZADA │
  └────┬─────┘               └─────┬──────┘             └────┬────┘            └─────┬──────┘
       │                           │                         │                       │
       │ cancelar                  │ cancelar                │ extender              │ cobrar
       ▼                           ▼                         │                       ▼
  ┌───────────┐              ┌───────────┐                   └──► (vuelve a ACTIVA)  [ cerrada ]
  │ CANCELADA │              │ CANCELADA │
  └───────────┘              └───────────┘
```

**Lo que realmente pasa hoy:** las reservas nacen en `CONFIRMADA` (`reserva_service.py`, en `create()`: `estado=EstadoReserva.CONFIRMADA.value`), pero `confirmar()` exige que estén en `PENDIENTE`. Por lo tanto:

- El estado `PENDIENTE` es inalcanzable.
- `confirmar()` es **código muerto**.
- `bloqueada_por_solape` nunca se activa.
- Los warnings de "solape con una reserva pendiente" **nunca se pueden disparar**, porque no existen reservas pendientes.

Toda esa maquinaria está escrita, probada en el diseño y desconectada.

### 2.1 Qué hacer con `PENDIENTE`

Recomiendo **recuperarlo**, no borrarlo, porque a partir de la web pública es imprescindible: una reserva online entra como pendiente hasta que se aprueba o se acredita el pago. Propongo tres estados de entrada:

| Origen | Estado inicial |
|---|---|
| Mostrador / teléfono (carga interna) | `CONFIRMADA` directo — el operador ya verificó todo |
| Web con pago acreditado | `CONFIRMADA` automática |
| Web sin pago, o cliente con deuda | `PENDIENTE` → requiere aprobación |
| Cotización aceptada | `PENDIENTE` |

Y agregar un estado que hoy falta: **`NO_SHOW`** (ver 4.7).

---

## 3. Check-out (salida del vehículo)

### 3.1 🔴 Bug — todo cobro en el check-out revienta

`alquiler_service.py` líneas 162, 175 y 301:

```python
pago_anticipo = Pago(
    alquiler_id=alquiler.id,
    monto=reserva.anticipo_monto,
    ...
    usuario_id=usuario_id,      # ← este campo NO existe en el modelo Pago
)
```

`models/pago.py` define **`cobrado_por`**, no `usuario_id`. SQLAlchemy lanza `TypeError: 'usuario_id' is an invalid keyword argument for Pago`.

Consecuencia: **cualquier check-out de una reserva con anticipo, cualquier check-out con "cobrar ahora", y cualquier cobro en el check-in devuelven error 500.** Toda la integración de pagos de la Fase Q (`PLAN_CAJA_PAGOS.md`) está caída en runtime.

Bonus del mismo bloque: se pasa un objeto `date` al campo `Pago.fecha`, que es `String(10)`. Otra manifestación de la mezcla de tipos.

### 3.2 🔴 Bug — el anticipo se cuenta dos veces

El anticipo se guarda en `reserva.anticipo_monto` cuando se crea la reserva. Después, en el check-out, se **crea además un `Pago`** por ese mismo monto (línea 161).

Pero el cálculo de deuda en `routers/notificaciones.py` y en `/pagos/pendientes` hace:

```python
monto_abonado = float(r.anticipo_monto or 0) + sum(float(p.monto) for p in a.pagos)
```

Es decir: **suma el anticipo y además el pago que representa al anticipo**. El sistema cree que el cliente pagó el doble de la seña y por lo tanto **subestima la deuda**.

**Arreglo:** una sola fuente de verdad. El anticipo debe ser un `Pago` desde el momento en que se cobra (al crear la reserva, no en el check-out), y `anticipo_monto` pasa a ser un campo derivado o desaparece. Con el ledger de cuenta corriente del Plan Maestro esto se resuelve solo: el anticipo es un asiento HABER y punto.

### 3.3 Validaciones que faltan antes de entregar la llave

Hoy el check-out valida: que la reserva esté confirmada, que la fecha no sea anterior al inicio, y avisa (warning, no bloqueo) si no hay contrato firmado. **Nada más.**

Lo que un sistema del rubro tiene que verificar antes de que el auto salga:

| Verificación | Hoy | Propuesto |
|---|---|---|
| Contrato firmado | ⚠️ warning | 🔴 **Bloqueo duro** (decisión ya tomada para F5) |
| Licencia del conductor vigente **a la fecha de devolución** | ❌ nada | 🔴 Bloqueo |
| Licencia de conductores adicionales | ❌ nada | 🔴 Bloqueo |
| Edad mínima del conductor | ❌ no existe el dato | 🟠 Bloqueo con override |
| Antigüedad mínima de licencia | ❌ no existe el dato | 🟠 Warning |
| VTV del vehículo vigente | ❌ nada | 🔴 Bloqueo con override + motivo |
| Póliza de seguro vigente | ❌ nada | 🔴 Bloqueo con override + motivo |
| Service vencido | ❌ nada | 🟠 Warning |
| Cliente con deuda vencida | ❌ nada | 🟠 Warning, o bloqueo si supera el límite de crédito |
| Cliente inactivo / en lista negra | ❌ no existe | 🟠 Bloqueo |
| Garantía definida | ❌ opcional silencioso | 🟠 Warning si no hay |
| Fotos del estado del vehículo | ❌ nada | 🟠 Warning (ver parte de daños) |

**Patrón recomendado:** un endpoint `GET /reservas/{id}/pre-checkout` que devuelva la lista de validaciones con su severidad, para que el frontend muestre un **semáforo antes de abrir el modal**. Los bloqueos duros con override requieren rol de dueño + motivo escrito, que queda en el audit log.

### 3.4 🟠 El kilometraje puede retroceder

`alquiler_service.py:197`: `vehiculo.km_actual = checkout_km` sin ninguna validación.

Si el operador tipea 45.000 en vez de 145.000, el odómetro del sistema retrocede 100.000 km y **el próximo service pasa a estar "a 100.000 km de distancia"** — la alerta de mantenimiento se apaga silenciosamente.

**Arreglo:** validar `checkout_km >= vehiculo.km_actual`. Si es menor, error. Si el salto hacia arriba es sospechoso (> 5.000 km desde el último registro), pedir confirmación explícita.

### 3.5 🟡 Código muerto

`alquiler_service.py:128`:

```python
if checkout_dt > ahora.replace(minute=ahora.minute + 60 if ahora.minute < 0 else ahora.minute):
    pass
```

`ahora.minute < 0` nunca es verdadero, así que la expresión se reduce a `ahora.replace(minute=ahora.minute)` = `ahora`, y el cuerpo es `pass`. No hace nada. Borrar o implementar la validación real de "check-out en el futuro".

### 3.6 Check-out fuera de término (el auto sale tarde o antes)

Casos que hoy no se distinguen:

| Caso | Hoy | Debería |
|---|---|---|
| El cliente retira **más tarde** que lo pactado | Se registra la hora real, sin más | Preguntar: ¿se corre la devolución la misma cantidad de horas, o se mantiene la fecha fin? Es la diferencia entre cobrar 3 días o 2 |
| El cliente retira **antes** | Permitido si es después de `fecha_inicio`; si es antes, error | Debería permitirse con recálculo, verificando que el auto esté libre |
| El cliente **no aparece** | Nada. La reserva pasa sola a activa y después a finalizada | Marcar `NO_SHOW` (ver 4.7) |
| Check-out cargado **al día siguiente** (se olvidaron) | Existe el flag `checkout_registrado_en_tiempo_real` ✓ | Bien resuelto. Mantener y mostrarlo en la UI |

**El punto clave:** cuando el retiro se corre, hay que decidir explícitamente si la ventana de alquiler se desplaza o no. Hoy esa decisión no se toma en ningún lado y el excedente se calcula solo contra `fecha_fin`, así que el cliente que retiró 5 horas tarde tiene 5 horas menos de uso pagando lo mismo. La UI debe preguntarlo con dos botones claros: **"Mantener fecha de devolución"** / **"Correr la devolución N horas"**.

---

## 4. Check-in (devolución) — el núcleo del problema

### 4.1 🔴 CRÍTICO — El check-in tardío es imposible de registrar

Esta es la cadena completa:

**Paso 1.** `reserva_service.py`, `sincronizar_estados_por_horario()` — se ejecuta en **cada listado de reservas**, o sea todo el tiempo:

```python
# Activa a Finalizada
self.db.query(Reserva).filter(
    Reserva.estado == EstadoReserva.ACTIVA.value,
    (Reserva.fecha_fin < current_date) |
    ((Reserva.fecha_fin == current_date) & (Reserva.hora_fin <= current_time))
).update({"estado": EstadoReserva.FINALIZADA.value})
```

Pasada la hora de fin, la reserva se marca **FINALIZADA automáticamente** — sin importar si el auto volvió o no.

**Paso 2.** `alquiler_service.py:233`, en `checkin()`:

```python
if reserva.estado != EstadoReserva.ACTIVA.value:
    raise ConflictError("estado_invalido|La reserva no está activa")
```

**Resultado:** el cliente devuelve el auto 3 horas tarde. Cuando el operador abre el modal para registrar el check-in, el sistema ya marcó la reserva como finalizada y **rechaza la operación con un error**. No hay forma de registrar la devolución. Justamente el caso que más necesitan cubrir.

**Efectos colaterales de la misma cadena:**

- La alerta `checkin_pendiente` filtra `Reserva.estado == "activa" AND fecha_fin < hoy` → esa combinación **nunca puede existir**, porque la sincronización ya las pasó a finalizadas. **La alerta de "auto no devuelto" está muerta.**
- Peor: el auto que nunca volvió aparece en la lista de "finalizadas con deuda" en vez de "no devuelto".
- El vehículo queda en estado `alquilado` para siempre, porque el estado sólo cambia dentro de `checkin()`, que no se puede ejecutar.

**Arreglo — el estado del papel no es el estado del auto.** Hay que separar dos cosas que hoy están fusionadas:

| Concepto | Significado |
|---|---|
| **Ventana contratada** | `fecha_inicio/fin` — lo que se pactó. No cambia sola |
| **Estado operativo** | Dónde está el auto realmente |

Estados propuestos para la reserva:

```
CONFIRMADA → ACTIVA → [ VENCIDA ] → FINALIZADA → [ CERRADA ]
                          ▲                          ▲
              pasó la hora  │            deuda        │ todo cobrado
              y no volvió   │            saldada      │
```

- **`ACTIVA`**: el auto está afuera, dentro del plazo.
- **`VENCIDA`** (nuevo): pasó la hora de devolución y **no hay check-in registrado**. El auto sigue afuera. Es la que dispara la alerta crítica y la que permite el check-in tardío.
- **`FINALIZADA`**: hay check-in registrado. El auto volvió.
- **`CERRADA`** (nuevo): finalizada **y** sin saldo pendiente. Es el estado que permite saber qué queda por cobrar sin recalcular deudas cada vez.

Y la regla dura: **`sincronizar_estados_por_horario()` nunca debe pasar una reserva a FINALIZADA.** Sólo un check-in real finaliza un alquiler. La sincronización automática puede pasar `CONFIRMADA → ACTIVA` (con reparo, ver 4.8) y `ACTIVA → VENCIDA`, nada más.

### 4.2 🔴 CRÍTICO — El excedente se calcula contra la hora equivocada

`alquiler_service.py`, líneas 68 y 252 (y `reserva_service.py:168`):

```python
hora_devolucion = reserva.hora_devolucion_acordada or reserva.hora_inicio
hora_devolucion_dt = datetime.combine(reserva.fecha_fin, hora_devolucion)
```

Se combina **`fecha_fin`** con **`hora_inicio`**. La `hora_fin` de la reserva — el campo que el operador carga, que se muestra en el calendario, que define los solapamientos y las transiciones de estado — **se ignora por completo** en el cálculo del cargo.

Y `hora_devolucion_acordada` sólo se llena cuando se tilda "late checkout" en el modal (`ReservaModal.tsx:236`), o sea casi nunca. En el caso normal el fallback es `hora_inicio`.

**Ejemplo concreto:**

> Reserva del lunes 10:00 al jueves 18:00. Tarifa diaria $80.000.
> El cliente devuelve el jueves a las 18:00, **exactamente en hora**.
> El sistema calcula el excedente desde el jueves a las **10:00**.
> → 8 horas de atraso − 40 min de gracia = **7 horas excedidas**.
> → 7 × 3 × ($80.000 / 24) = **$70.000 cobrados de más** a un cliente puntual.

Si el atraso calculado llega a 12 horas, salta a día completo: cobra **un día entero extra** sin motivo.

**La raíz:** el sistema tiene **dos horas de devolución esperada** que no coinciden y nadie declaró cuál manda. `hora_fin` gobierna el calendario y los estados; `hora_inicio sobre fecha_fin` gobierna el dinero.

**✅ RESUELTO — decisión D-18: modelo 24hs estricto.**

El auto se devuelve **a la misma hora en que se entrega**. Retira lunes 10:00 por 3 días → devuelve jueves 10:00. Eso significa que **el cálculo del excedente que ya está en el código es correcto**; el problema es la UI.

**Arreglo:**
1. **`hora_fin` deja de ser un campo libre** y pasa a derivarse de `hora_inicio`. Queda bloqueado en el formulario de reserva.
2. El campo editable es **`hora_devolucion_pactada`**, que sólo se toca en el caso de late check-in acordado, con su contracargo (1 día / medio día / monto manual / bonificado). Ver D-18.
3. El modal de check-in debe **mostrar la hora contra la que se está midiendo**, en grande, antes de calcular nada.

Lo que no puede seguir pasando es que `hora_fin` gobierne el calendario y otra hora distinta gobierne el dinero.

### 4.3 El cálculo de excedente en sí — está bien pensado, falta calibrarlo

`domain/control_24hs.py` es código limpio y bien documentado. Las reglas actuales:

- Gracia: **40 minutos**
- Después: **hora completa hacia abajo** (floor), a **3× la tarifa horaria** (tarifa diaria / 24)
- A partir de **12 horas** de excedente: se cobra **día completo** (`ceil(horas/24) × tarifa diaria`)

**Contraste con la industria:**

| | Ubicar | Industria |
|---|---|---|
| Gracia | 40 min | 29-30 min es el estándar casi universal; Fox llega a 1 hora |
| Cargo por hora | 3× tarifa/24 | Rango típico equivalente a 2-3× |
| Umbral de día completo | **12 horas** | **Hertz y varios: 2 horas.** Muchos usan 90 min a 2 hs |

La gracia de 40 minutos es razonable y hasta generosa. **El umbral de 12 horas, en cambio, está muy por encima del estándar.** Con la regla actual, un cliente que devuelve 11 horas tarde paga 11 × 3 × (diaria/24) = **1,375 días** — más que un día completo, pero sin bloquear la siguiente reserva, que es el verdadero costo. Un cliente que devuelve 6 horas tarde paga 0,75 días pero **le arruinó la entrega de las 14:00 al cliente siguiente**.

**Recomendación:** bajar el umbral de día completo a **6 horas**, y sumar una regla nueva que hoy no existe: **si el atraso pisa una reserva siguiente del mismo vehículo, se cobra día completo desde el minuto uno**, porque el daño no es el tiempo de uso sino la reserva que hay que reubicar. Ese dato ya lo tiene el sistema: `find_proxima_confirmada()` se usa para decidir el estado `en_transicion`.

Todos estos números (`GRACIA_MINUTOS`, `MULTIPLICADOR_HORA_EXCEDENTE`, `TOPE_HORAS_ANTES_DIA_EXTRA`) están hardcodeados como constantes de módulo. **Deben ser configurables desde una pantalla de Configuración**, no requerir un deploy para cambiarlos.

### 4.4 La decisión de cobrar o bonificar — bien resuelta, mal expuesta

`DecisionExcedente` (cobrar completo / parcial / no cobrar) con `motivo_bonificacion` y `decidido_por` es un diseño correcto y auditable. Bien.

Lo que falta:

- **`motivo_bonificacion` no es obligatorio** cuando se bonifica. Debería serlo — es plata que se resigna y tiene que quedar justificada. Y con lista de motivos frecuentes (demora nuestra en la entrega, cliente frecuente, problema mecánico, gesto comercial) además del texto libre.
- No existe la operación inversa: **cobrar más de lo calculado** (por ejemplo, un recargo pactado). Sólo se puede cobrar igual o menos.
- La bonificación no aparece en ningún reporte. **Debería haber un reporte de "excedentes bonificados por período y por usuario"** — es un agujero de ingresos que hoy nadie mira.

### 4.5 Cargos de cierre que se registran pero nunca se cobran

En el check-in el sistema captura tres datos y **no hace nada con ellos**:

| Dato capturado | Se usa para |
|---|---|
| `checkin_combustible` vs `checkout_combustible` | Sólo una alerta visual en el modal. **No genera cargo** |
| `checkin_estado_limpieza` | Nada. **No genera cargo** |
| `checkin_descripcion` (daños) | Texto libre. **No genera cargo ni queda vinculado a la garantía** |

**✅ RESUELTO parcialmente — decisiones D-20 y D-21.**

| Concepto | Decisión |
|---|---|
| **Combustible faltante** | **Gasto del vehículo**, no cargo al cliente. Desde el check-in se genera con un click, precargado |
| **Limpieza** | **Gasto del vehículo**, ídem |
| **Km excedido** | **No aplica** — no hay límite de km. Pero los km recorridos se registran y se muestran en el historial del cliente **y** del vehículo |
| **Daños** | Sigue pendiente: del parte de daños, sumando los ítems nuevos |
| **Peajes / infracciones** | Carga manual, pendiente |
| **Devolución en otra sucursal** | Cargo one-way, cuando existan sucursales |

Esto simplifica bastante el check-in: **la liquidación de la garantía queda sólo contra el excedente y los daños.**

```
  Garantía retenida            $ 300.000
  ─────────────────────────────────────
  − Excedente (1 día)            $ 80.000
  − Daños (rayón puerta del.)    $ 35.000
  ─────────────────────────────────────
  A devolver                    $ 185.000     [ Confirmar devolución ]

  ⓘ Combustible ½ y limpieza "sucio" registrados
     [ Generar gasto del vehículo — $30.000 ]
```

Hoy `garantia_estado='ejecutada_parcial'` existe como enum pero no hay nada que calcule cuánto ejecutar ni contra qué.

### 4.6 Devolución anticipada — no está contemplada

Si el cliente devuelve 2 días antes, hoy no pasa nada: paga el total pactado y el vehículo queda libre pero el calendario lo sigue mostrando ocupado hasta la fecha original.

**Debería:**
- Preguntar si se reintegra la diferencia, se deja como saldo a favor, o no se reintegra (política del contrato).
- **Liberar el vehículo en el calendario**, que es lo importante: son días que se pueden volver a vender.
- Ojo con la trampa: si la tarifa aplicada era semanal y el cliente devuelve al 5º día, la duración real cae en la banda diaria y el precio por día **sube**. Hay que decidir si se recalcula o se respeta lo pactado. **Recomendación: respetar lo pactado** (es lo que hace la industria) y dejarlo escrito en el contrato.

### 4.7 El cliente no aparece o retira tarde

**✅ RESUELTO — decisión D-17: no se crea el estado `NO_SHOW`.** Distinguir de quién fue la culpa es hilar demasiado fino para el volumen actual.

Se resuelve como **late check-out** (el auto sale más tarde de lo previsto), con:
- **Monto editable** — se ajusta el importe a mano
- **Nota obligatoria del motivo** — por qué se demoró y de parte de quién
- Todo registrado en la auditoría y en el historial de la reserva

Lo que sí sigue haciendo falta, independientemente del estado: que el vehículo **no quede trabado** y que la reserva no ensucie los reportes de ocupación mientras nadie retira el auto. Eso se cubre con la transición a `ENTREGA_PENDIENTE` de la sección 4.8.

**Y la cancelación sí tiene política (D-11):** si el cliente pagó seña y cancela, **no se le devuelve nada**. El sistema genera el asiento automáticamente y pide motivo de cancelación.

### 4.8 La auto-transición CONFIRMADA → ACTIVA es peligrosa

`sincronizar_estados_por_horario()` marca la reserva como activa apenas pasa `hora_inicio`, **aunque nadie haya hecho el check-out**. El auto "salió" en los papeles sin que se registre km, combustible ni garantía.

El código de `checkout()` tiene un parche para esto (líneas 106-117: permite hacer check-out sobre una reserva ya activa si no existe alquiler), lo cual está bien como red de contención. Pero mientras tanto:
- El vehículo sigue en estado `reservado`, no `alquilado`.
- El dashboard cuenta un alquiler activo que no existe.

**Recomendación:** que la transición automática no sea a `ACTIVA` sino a un estado de aviso — `ENTREGA_PENDIENTE` — que alimente la alerta y no ensucie las métricas. La reserva pasa a `ACTIVA` sólo con un check-out real.

### 4.9 Extender el alquiler — dos bugs

`alquiler_service.py`, método `extender()`:

**Bug A — borra el precio.** Líneas 385-392:

```python
try:
    nueva_tarifa = seleccionar_tarifa(nueva_duracion, tarifas_info)
    nuevo_precio = calcular_precio_total(nueva_duracion, nueva_tarifa)
except BusinessRuleError:
    nueva_tarifa = None
    nuevo_precio = None          # ← y después se persiste
```

Si no hay tarifa configurada para la nueva banda de duración, `precio_total` se sobrescribe con `NULL`. **La deuda del cliente desaparece del sistema.** El `except` debe conservar el precio anterior y devolver un warning, nunca anularlo.

**Bug B — pisa el precio manual.** Si el operador había puesto un precio negociado a mano, extender lo recalcula con la tarifa de lista y lo reemplaza sin avisar. Debe preguntar, o al menos avisar en la respuesta.

**Falta además:** extender no valida la licencia contra la nueva fecha de fin, no reajusta la garantía, y no deja rastro de la extensión en ningún historial (sólo un log).

---

## 5. Precios — el rediseño

### 5.1 🔴 El bug: la tarifa semanal se multiplica por día

`domain/tarifas.py`:

```python
def calcular_precio_total(duracion_dias: int, tarifa: TarifaInfo) -> Decimal:
    return Decimal(str(duracion_dias)) * tarifa.monto
```

Y `seleccionar_tarifa()` elige la tarifa **semanal** para 7-29 días y la **mensual** para 30+.

**Entonces:** si cargan "tarifa semanal = $500.000" pensando en lo que sale una semana, un alquiler de 10 días se cobra:

> 10 días × $500.000 = **$5.000.000**

Cuando debería ser del orden de $700.000-800.000. Es un error de **6×**.

Para que el número dé bien, `Tarifa.monto` de tipo semanal tiene que contener el **precio por día dentro de la banda semanal** — pero ni el nombre del campo, ni la UI (`TarifasTab.tsx`), ni la etiqueta "Semanal" lo dicen. Es una bomba esperando que alguien cargue el número intuitivo.

### 5.2 Cómo se hace en la industria

Un **rate matrix** es una grilla de dos ejes: **clase de vehículo** (filas) × **banda de duración** (columnas: 1 día, 3 días, 7 días, 30 días). Cada celda tiene su propio precio estratégico, y la regla central es que *"un alquiler de 5 días no es simplemente 5 × la tarifa diaria"*: el precio por día **baja** a medida que sube la duración (*step-down logic*). Avis publicita hasta 25% de descuento sobre la tarifa semanal base, y Hertz más del 50% en alquileres de varios meses.

Además, el matrix opera a **nivel de clase, no de vehículo individual** — los vehículos similares se agrupan en un mismo escalón de precio según la utilidad para el cliente, no según lo que costó comprarlos.

### 5.3 El diseño propuesto

Lo que pediste — *"precios por categorías o POR VEHÍCULOS, ej una camioneta sale semanal $X, y ellos lo puedan poner, entonces al momento de reservar tienen un precio pre-definido"* — se resuelve con **una tabla y una regla de prioridad**.

**Tabla `tarifas` rediseñada:**

| Campo | Notas |
|---|---|
| `categoria_id` | nullable — tarifa a nivel de categoría |
| `vehiculo_id` | nullable — override para un vehículo puntual |
| `banda` | `diaria` · `semanal` · `mensual` (o bandas por días configurables) |
| `dias_min`, `dias_max` | Define la banda de forma explícita en vez de hardcodearla |
| **`precio_por_dia`** | **Canónico. Reemplaza a `monto`, cuyo nombre no decía nada** |
| `precio_banda_referencia` | Lo que sale la semana / el mes completo. Derivado, sólo para mostrar |
| `prioridad` | Resuelve empates |
| `vigencia_desde`, `vigencia_hasta` | Historial de precios sin borrar nada |
| `visible_web` | Permite precio web ≠ mostrador |
| `requiere_factura` | Precio con y sin factura (ver 6) |
| `activo` | |

**Regla de resolución** (de más específica a más general, primera que matchea gana):

```
1. Tarifa del VEHÍCULO para la banda de la duración
2. Tarifa de la CATEGORÍA para esa banda
3. Tarifa GENERAL para esa banda
4. Sin tarifa → error explícito, nunca precio NULL
```

**UX de carga — el punto que hace o rompe el módulo.** Ellos piensan en "la camioneta sale $X por semana". El sistema necesita el precio por día. La pantalla tiene que aceptar **cualquiera de los dos y mostrar el otro en vivo**:

```
  Categoría: Pick-up 4x4                    ┌─ Precio por día ─┬─ Total banda ─┐
  ├─ Diaria      (1-6 días)                 │      $ 95.000    │      —        │
  ├─ Semanal     (7-29 días)                │      $ 78.000    │   $ 546.000   │
  └─ Mensual     (30+ días)                 │      $ 62.000    │ $ 1.860.000   │
                                            └──────────────────┴───────────────┘
     Al editar cualquiera de las dos columnas, la otra se recalcula.
     ▸ Descuento implícito: semanal −18% · mensual −35% respecto de la diaria
```

Ese "descuento implícito" calculado y mostrado es lo que les permite ver de un vistazo si la escalera de precios tiene sentido, sin sacar la calculadora.

**Y el desglose obligatorio en la reserva.** El operador nunca debe ver sólo un total:

```
  10 días × $78.000 (tarifa semanal, categoría Pick-up 4x4)   $ 780.000
  + Adicionales                                                $  45.000
  − Descuento comercial (5%)                                   $ −41.250
  ─────────────────────────────────────────────────────────────────────
  TOTAL                                                        $ 783.750
  Seña recibida                                                $ 235.000
  SALDO                                                        $ 548.750
```

### 5.4 Precio manual, descuentos y trazabilidad

Hoy se puede pisar `precio_total` a mano y **no queda ningún registro** de que se hizo, ni de cuál era el precio de lista, ni quién lo autorizó.

**Falta:**
- `precio_lista` (lo que decía la tarifa) junto a `precio_total` (lo que se cobra).
- `descuento_monto` / `descuento_porcentaje` / `motivo_descuento` / `autorizado_por`.
- Reporte de descuentos otorgados por usuario y por período.
- Regla: descuentos por encima de X% requieren rol de dueño.

Sin esto no hay forma de saber cuánto se está resignando en negociación, que en este rubro es la fuga de margen más grande.

### 5.5 Congelar el precio

Cuando se confirma una reserva, el precio tiene que **quedar congelado**. Si mañana cambia la tarifa de lista, la reserva ya tomada no se toca.

Hoy: `precio_total` se guarda ✓ pero `extender()` lo recalcula con las tarifas de hoy, y `confirmar()` también. Hay que guardar además `tarifa_snapshot` (JSON con la tarifa exacta aplicada) para poder explicar el precio dentro de dos años.

### 5.6 La conexión con la web (a futuro)

Esta estructura es la base directa del motor estacional del Plan Maestro. La capa de calendario (`tarifas_calendario`) se apila **encima** de esta:

```
precio del día = regla de calendario de mayor prioridad que cubra ese día
                 ↓ si no hay ninguna
                 tarifa de banda por vehículo → categoría → general
```

Por eso conviene rediseñar `tarifas` ahora con `categoria_id` y `precio_por_dia`, aunque las categorías todavía no se usen: cuando llegue la web, se agrega la capa de arriba sin migrar nada.

---

## 6. Con factura / sin factura

Pedido: *"poder marcar en una reserva si es con factura o si es sin"*.

Hoy sólo existe `Pago.con_factura: bool` — a nivel de cada cobro, no de la operación, y sin ningún efecto en el precio.

**Propuesta:**

**En la reserva:** `requiere_factura: bool` + `condicion_iva_operacion`. Se define al cotizar, no al cobrar, porque **cambia el precio**.

**En la tarifa:** dos precios, o un recargo porcentual configurable. Un `Responsable Inscripto` que necesita factura A paga distinto que un consumidor final. Esto es normal y el sistema tiene que reflejarlo en lugar de que se resuelva con una cuenta mental.

**Impacto en el resto:**
- **Reportes:** separar facturado / no facturado. Hoy es imposible saber cuánto de la facturación del mes está documentada.
- **Caja:** el desglose diario debería mostrar ambas columnas.
- **Alerta:** "alquiler cerrado, marcado con factura, sin comprobante emitido" (ya está en el catálogo de alertas del Plan Maestro).
- **Cuenta corriente:** el asiento tiene que saber si le corresponde comprobante.
- **Cotizador:** debe mostrar el precio según la condición del cliente.

**En la UI de la reserva:** un selector visible arriba, no escondido. Y que el precio se actualice en vivo al cambiarlo.

---

## 7. Clientes — Empresa vs Particular

### 7.1 Lo que hay hoy

`Cliente.tipo` es `particular | empresa`, y **eso es todo lo que cambia**. Los mismos campos, las mismas validaciones, el mismo formulario. La distinción es puramente cosmética (el frontend muestra "CUIT" en vez de "DNI").

### 7.2 🟠 Bugs y huecos en el modelo de cliente

1. **`licencia_numero` y `licencia_categoria` son inalcanzables.** Existen en `models/cliente.py` pero **no están en `ClienteBase`** (`schemas/cliente.py`). No hay forma de cargarlos ni leerlos por la API. Dos columnas muertas.
2. **No se puede corregir un DNI/CUIT.** `ClienteUpdate` no incluye `dni_cuit`. Un error de tipeo es permanente.
3. **No se puede cambiar `tipo`.** Un particular que arma su empresa obliga a crear una ficha nueva y perder el historial.
4. **`licencia_vencimiento` acepta `""`.** Se puede crear un cliente sin licencia y alquilarle.
5. **`deactivate()` tiene un TODO sin implementar** (`cliente_service.py`): se puede dar de baja a un cliente **que tiene un auto afuera ahora mismo**.
6. **Unicidad de DNI global**: correcto, pero el mensaje de error no dice cuál es el cliente existente ni ofrece ir a su ficha.

### 7.3 Empresa — lo que falta

Pedido: *"que se ponga el responsable de la empresa, no sólo la empresa, sino con quién tenemos el contacto y su puesto"*.

**Nueva tabla `contactos_cliente`:**

| Campo | Notas |
|---|---|
| `cliente_id` | FK |
| `nombre_completo`, `puesto` | "Juan Pérez — Jefe de Logística" |
| `telefono`, `email` | Directos, distintos de los de la empresa |
| `es_principal` | El contacto por defecto |
| `recibe_facturas`, `recibe_notificaciones` | A quién se le manda qué. En una empresa el que firma no es el que paga |
| `activo` | |

**Campos de empresa en `Cliente`:** `razon_social` (distinta del nombre de fantasía), `condicion_iva`, `domicilio_fiscal`, `localidad`, `provincia`, `rubro`, `web`.

**Formulario condicional por tipo:**

| | Particular | Empresa |
|---|---|---|
| Identificación | DNI (obligatorio) | CUIT (obligatorio, con validación de dígito verificador) |
| Nombre | Nombre y apellido | Razón social + nombre de fantasía |
| Licencia | **Obligatoria y vigente** | No aplica a la empresa — aplica a los conductores |
| Fecha de nacimiento | Obligatoria (edad mínima) | No aplica |
| Contactos | Opcional | **Al menos uno obligatorio, con puesto** |
| Condición IVA | Consumidor final por defecto | **Obligatoria** |
| Condición de pago | Contado por defecto | Cta. cte. habilitada, con límite de crédito |
| Domicilio | Opcional | **Obligatorio** (para facturar) |

### 7.4 🔴 Quién maneja el auto no es quién paga

Este es el hueco conceptual más importante del módulo de clientes.

`Reserva.cliente_id` es simultáneamente **el que paga** y **el que maneja**. Para un particular está bien. Para una empresa es directamente falso: la empresa paga, pero el que retira el auto y firma es un empleado.

**Arreglo:**

```
Reserva
 ├── cliente_id            → quién paga / a quién se le factura
 └── conductor_principal   → quién efectivamente maneja
      ├── puede ser el mismo cliente (particular)
      └── o un conductor_adicional / empleado (empresa)
```

Sin esto, cuando llega una multa el sistema imputa a la empresa y **no se puede saber quién manejaba**, que es exactamente el dato que el buscador de multas promete resolver. Y el contrato se firma con datos de la empresa en vez de los del conductor real.

Los `conductores_adicionales` ya existen y están bien modelados. Falta vincularlos a la reserva: qué conductores estaban autorizados **en ese alquiler puntual**, no sólo en la ficha del cliente.

### 7.5 Datos de cliente que faltan

`fecha_nacimiento` (edad mínima), `licencia_pais` (extranjeros), `licencia_desde` (antigüedad mínima), `nacionalidad`, `pasaporte` (turistas sin DNI argentino), `lista_negra` + `motivo_lista_negra` (el cliente que rompió un auto y no pagó no puede volver a alquilar — hoy no hay forma de impedirlo), `origen` (cómo llegó: web, referido, mostrador).

---

## 8. Vencimientos — qué se controla y qué no

### 8.1 Estado actual

| Vencimiento | Dónde vive | Se detecta | Bloquea algo |
|---|---|---|---|
| Licencia del cliente | `Cliente.licencia_vencimiento` (String) | Sólo en `services/alertas.py`, que **es código huérfano** | ❌ Nada |
| Licencia de conductor adicional | `ConductorAdicional.licencia_vencimiento` | ❌ Nadie la mira | ❌ Nada |
| VTV | `Documento` tipo `vtv` con `vigencia_hasta` | ✓ En `/notificaciones` | ❌ Nada |
| Póliza | `Documento` tipo `poliza` | ✓ En `/notificaciones` | ❌ Nada |
| Service por km | `Vehiculo.km_proximo_service` | ✓ | ❌ Nada |
| Service por fecha | `Servicio.proxima_fecha` | ❌ **No se controla** | ❌ Nada |
| Patente / impuestos | ❌ No existe | ❌ | ❌ |
| Matafuego, botiquín, balizas | ❌ No existe | ❌ | ❌ |
| Cédula verde / azul | ❌ No existe | ❌ | ❌ |

**Ninguno bloquea nada.** El sistema detecta que la VTV está vencida y aun así te deja entregar el auto.

### 8.2 Problemas de fondo

**A. Los vencimientos del vehículo viven como documentos genéricos.** La VTV es un documento subido con `tipo='vtv'` y `vigencia_hasta`. Eso significa: si nadie sube el PDF, **no hay vencimiento que controlar**. Un vehículo sin documentos cargados aparece como perfectamente en regla.

**Arreglo:** los vencimientos críticos deben ser **campos del vehículo** (`vtv_vencimiento`, `poliza_vencimiento`, `poliza_numero`, `poliza_compania`, `patente_pago_hasta`), obligatorios al dar de alta el vehículo. El documento PDF es el **respaldo** del campo, no su reemplazo.

**B. Service sólo por km.** Un auto que hace 3.000 km en un año igual necesita cambio de aceite. `Servicio.proxima_fecha` existe en el modelo y **nadie la consulta**. Hay que controlar por km **o** por fecha, lo que ocurra primero.

**C. No hay control de la licencia contra la fecha de devolución.** Una licencia que vence durante el alquiler es un problema: hay que validar contra `fecha_fin`, no contra hoy.

### 8.3 Matriz de bloqueos propuesta

| Situación | Nueva reserva | Check-out | Extender |
|---|---|---|---|
| VTV vencida | ⚠️ Warning | 🔴 **Bloqueo** (override dueño + motivo) | 🔴 Bloqueo |
| VTV vence durante el alquiler | ⚠️ Warning | ⚠️ Warning | ⚠️ Warning |
| Póliza vencida | 🔴 Bloqueo | 🔴 **Bloqueo duro, sin override** | 🔴 Bloqueo |
| Licencia vencida hoy | 🔴 Bloqueo | 🔴 Bloqueo | 🔴 Bloqueo |
| Licencia vence durante el alquiler | ⚠️ Warning | ⚠️ Warning + registrar aceptación | 🔴 Bloqueo |
| Service vencido | ⚠️ Warning | ⚠️ Warning | — |
| Cliente en lista negra | 🔴 Bloqueo | 🔴 Bloqueo | 🔴 Bloqueo |
| Deuda vencida > límite | ⚠️ Warning | ⚠️ Warning (override) | ⚠️ Warning |
| Vehículo fuera de servicio | 🔴 Bloqueo | 🔴 Bloqueo | — |

La póliza sin override es a propósito: entregar un auto sin seguro vigente no es una decisión comercial que se pueda tomar apurado en el mostrador.

---

## 9. Qué se puede modificar y qué no

Hoy las reglas de mutabilidad están dispersas y son incompletas. Propuesta explícita:

| Campo | Pendiente | Confirmada | Activa | Finalizada | Cancelada |
|---|---|---|---|---|---|
| Cliente | ✅ | ❌ | ❌ | ❌ | ❌ |
| Vehículo | ✅ | ✅ (reasignar, revalida solape) | ⚠️ Sólo con motivo (cambio por rotura) | ❌ | ❌ |
| Fechas / horas | ✅ | ✅ (revalida + **recalcula precio**) | ⚠️ Sólo vía `extender()` | ❌ | ❌ |
| Lugares | ✅ | ✅ | ✅ | ❌ | ❌ |
| Precio | ✅ | ✅ (con motivo) | ⚠️ Sólo dueño + motivo | ❌ | ❌ |
| Garantía | ✅ | ✅ | ⚠️ Sólo resolución en check-in | ❌ | ❌ |
| Con/sin factura | ✅ | ✅ | ⚠️ Con motivo | ❌ | ❌ |
| Notas | ✅ | ✅ | ✅ | ✅ | ✅ |
| Datos de check-out | — | — | ⚠️ Corrección con motivo (24 hs) | ❌ | — |
| Datos de check-in | — | — | — | ⚠️ Corrección con motivo (24 hs) | — |
| Estado | ✅ | ✅ | ✅ | ⚠️ Reapertura sólo dueño | ⚠️ Reactivar |

**Huecos actuales concretos:**
- `ReservaUpdate` **no permite editar la garantía** ni `hora_devolucion_acordada` ni `late_checkout`. Si se cargaron mal, no hay forma de corregirlos.
- `update()` **cambia las fechas de una reserva confirmada sin recalcular el precio**. Extender por edición sale gratis; extender por `extender()` recalcula. Dos caminos, dos resultados.
- **Un check-out mal cargado no se puede corregir.** No hay endpoint. Si se tipeó mal el km, queda así para siempre y arrastra el error al service y al check-in.
- **Cancelar no pide motivo ni registra quién ni cuándo**, y no hace nada con la seña ya cobrada.
- No existe **"reabrir"** una reserva finalizada por error.

Todas las correcciones deben quedar en el audit log con el valor anterior, el nuevo, el usuario y el motivo.

---

## 10. Backend — cambios concretos

### 10.1 Correcciones inmediatas (sin cambio de modelo)

| # | Archivo | Cambio |
|---|---|---|
| 1 | `alquiler_service.py:162,175,301` | `usuario_id=` → `cobrado_por=` |
| 2 | `alquiler_service.py:68,252` · `reserva_service.py:168` | Fallback `hora_inicio` → `hora_fin` |
| 3 | `alquiler_service.py:389-392` | El `except` conserva el precio anterior, no lo anula |
| 4 | `reserva_service.py` | `sincronizar_estados_por_horario()` deja de pasar a FINALIZADA |
| 5 | `alquiler_service.py:233` | `checkin()` acepta ACTIVA **y** VENCIDA |
| 6 | `alquiler_service.py:197` | Validar `checkout_km >= vehiculo.km_actual` |
| 7 | `alquiler_service.py:128` | Borrar el `if` muerto |
| 8 | `alquiler_service.py:161` | Dejar de duplicar el anticipo como Pago |
| 9 | `domain/tarifas.py` | `calcular_precio_total` explícito sobre precio/día |
| 10 | `schemas/cliente.py` | Exponer `licencia_numero`, `licencia_categoria`, permitir editar `dni_cuit` y `tipo` |
| 11 | `cliente_service.py` | Implementar la validación de baja con alquileres activos |

### 10.2 Nuevos estados y campos

- Enum `EstadoReserva`: agregar `VENCIDA`, `NO_SHOW`, `CERRADA`.
- `Reserva`: `conductor_principal_id`, `requiere_factura`, `precio_lista`, `descuento_monto`, `motivo_descuento`, `autorizado_por`, `tarifa_snapshot` (JSON), `motivo_cancelacion`, `cancelada_por`, `cancelada_at`.
- `Alquiler`: `cargo_combustible`, `cargo_limpieza`, `cargo_danos`, `cargo_km_excedido`, `peajes`, `total_cargos_cierre`.
- `Vehiculo`: `vtv_vencimiento`, `poliza_numero`, `poliza_compania`, `poliza_vencimiento`, `categoria_id`. (`capacidad_tanque` descartado — D-20: el nivel de combustible es sólo visual por fracciones, no se calculan litros)
- `Cliente`: los de 7.3 y 7.5.
- `Tarifa`: rediseño de 5.3.
- Nuevas tablas: `contactos_cliente`, `reserva_conductores`, `configuracion` (constantes de negocio).

### 10.3 Nuevos endpoints

| Endpoint | Para qué |
|---|---|
| `GET /reservas/{id}/pre-checkout` | Semáforo de validaciones antes de entregar |
| `GET /reservas/{id}/pre-checkin` | Preview de cargos de cierre y liquidación de garantía |
| `POST /reservas/{id}/no-show` | Marcar no-show con política de seña |
| `POST /reservas/{id}/reabrir` | Revertir una finalización errónea (rol dueño) |
| `PATCH /alquileres/{id}/corregir-checkout` | Corrección auditada |
| `POST /precios/calcular` | Desglose día por día. Reutilizable en reserva, cotizador y web |
| `GET /configuracion` / `PATCH /configuracion` | Gracia, multiplicador, umbrales, cargos fijos |
| `GET /reportes/bonificaciones` | Excedentes bonificados y descuentos por usuario |

### 10.4 Performance

`_cargar_ventanas()` trae **todas** las reservas del vehículo con `page_size=9999` y filtra en Python, en cada create, update, confirmar, cancelar, reasignar y extender. Debe ser una query con filtro de rango de fechas en SQL. Con dos años de historia, cada creación de reserva va a escanear cientos de filas al pedo.

---

## 11. Frontend — qué tiene que ver el operador

El principio: **el operador nunca debería tener que calcular ni recordar nada.** La pantalla le dice qué pasa y qué hacer.

### 11.1 Ficha de reserva — el panel que falta

Al abrir una reserva, arriba de todo, un bloque de **estado y acción**:

```
┌──────────────────────────────────────────────────────────────────┐
│  Reserva #142   ●  VENCIDA — el auto no volvió                   │
│  Toyota Hilux AB123CD · Constructora del Sur SRL                 │
│  Conductor: Juan Pérez (Jefe de Logística)                       │
│                                                                   │
│  Tenía que volver:  jueves 24/07 18:00                           │
│  Atraso:            1 día 4 horas                                │
│  Excedente estimado: $ 128.000  (3 días bonificables)            │
│                                                                   │
│  ⚠️ Pisa la reserva #151 del sábado 10:00                        │
│                                                                   │
│  [ Registrar devolución ]  [ Contactar al cliente ]  [ Extender ]│
└──────────────────────────────────────────────────────────────────┘
```

Hoy nada de esto existe: hay que deducirlo cruzando pantallas.

### 11.2 Modal de check-out

- **Semáforo de validaciones arriba**, antes del formulario: licencia ✓, VTV ✓, póliza ⚠️ vence en 5 días, contrato ✗.
- Los bloqueos deshabilitan el botón de confirmar y explican por qué, con link a resolver.
- **La hora de devolución esperada en grande**, para que quede claro contra qué se va a medir.
- Si el retiro es más tarde de lo pactado: los dos botones de 3.6 (mantener fecha / correr N horas).
- Desglose de precio visible, no un total suelto.
- Estado del vehículo con fotos obligatorias (parte de daños).

### 11.3 Modal de check-in

Lo más importante. Debe mostrar **la liquidación completa** antes de confirmar:

```
  DEVOLUCIÓN                        Programada: jue 24/07 18:00
                                    Real:       vie 25/07 22:00
  ─────────────────────────────────────────────────────────────
  Atraso                            1 día 4 hs  (28 hs)
  Gracia aplicada                   40 min
  Horas cobrables                   27 hs → supera 6 hs
                                    → se cobra por día completo

  ⚠️ Este atraso afectó la reserva #151

  ┌─ ¿Qué se cobra? ──────────────────────────────────────────┐
  │  ○ Cobrar completo        $ 160.000  (2 días)             │
  │  ● Cobrar parcial         [ 1 ] día  → $ 80.000           │
  │  ○ No cobrar (bonificar)  Motivo: [ ▾ requerido ]         │
  └────────────────────────────────────────────────────────────┘

  Combustible   salió ¾ · vuelve ½    → cargo  $ 18.000  [editar]
  Limpieza      sucio                 → cargo  $ 12.000  [editar]
  Daños nuevos  1 rayón puerta del.   → cargo  $ 35.000  [editar]
  ─────────────────────────────────────────────────────────────
  Garantía retenida                            $ 300.000
  Total de cargos                              $ 145.000
  A DEVOLVER AL CLIENTE                        $ 155.000

  Saldo del alquiler pendiente                 $  48.750
                                    [ Cobrar ahora ] [ Dejar en cta. cte. ]
```

### 11.4 Lista de reservas

- Fila con color según urgencia real: vencida (rojo), devolución hoy (ámbar), entrega hoy (azul).
- Contador de atraso en vivo en las vencidas.
- Ícono de deuda y de contrato faltante en la fila, sin abrir.
- Acciones contextuales por estado: una reserva vencida muestra "Registrar devolución", no "Check-out".
- Filtro rápido: **"Requieren acción"**, que es la vista que van a usar el 80% del tiempo.

### 11.5 Pantalla de Tarifas

La grilla de 5.3, con carga por precio/día o por total de banda, descuento implícito calculado, historial de precios y comparación entre categorías.

### 11.6 Pantalla de Configuración (nueva)

Todas las constantes de negocio hoy hardcodeadas: minutos de gracia, multiplicador de hora excedente, umbral de día completo, buffer entre alquileres, cargos fijos de limpieza, precio del litro de combustible, umbrales de aviso de service y documentos, política de no-show, límites de descuento por rol.

### 11.7 Ficha de cliente

- Formulario condicional particular / empresa (7.3).
- Tab de contactos con puesto para empresas.
- **Semáforo de habilitación** arriba: licencia ✓ · deuda ⚠️ $95.000 vencidos · no-shows: 1 · lista negra ✗.
- Timeline unificado en vez de seis tabs sueltos.

---

## 12. Casos de prueba que el sistema tiene que pasar

Checklist para validar que todo lo anterior quedó bien:

**Devoluciones**
1. Devuelve exactamente en hora → cargo $0 *(hoy falla: cobra de más)*
2. Devuelve 20 min tarde → $0 (dentro de gracia)
3. Devuelve 50 min tarde → $0 (10 min post-gracia, floor a 0 horas)
4. Devuelve 3 hs tarde → 2 hs cobrables
5. Devuelve 8 hs tarde → día completo (con umbral en 6)
6. Devuelve 2 días tarde → 2 días
7. Devuelve tarde **y pisa la reserva siguiente** → día completo + alerta
8. Devuelve 2 días antes → libera el vehículo, decide el reintegro
9. Se registra la devolución **al día siguiente** → flag de no-tiempo-real, cargo desde la hora real

**Estados**
10. Pasa la hora de fin y el auto no volvió → VENCIDA + alerta crítica *(hoy: finalizada silenciosa)*
11. Check-in sobre reserva vencida → funciona *(hoy: error)*
12. El cliente no aparece → NO_SHOW, libera el auto, aplica política de seña
13. Reserva finalizada por error → reabrir con rol dueño

**Precios**
14. 3 días con tarifa diaria → 3 × diaria
15. 10 días con tarifa semanal → 10 × precio/día semanal *(hoy: 10 × semana completa)*
16. Extender de 5 a 8 días → cambia de banda y recalcula
17. Extender sin tarifa configurada → conserva el precio, avisa *(hoy: lo borra)*
18. Precio manual + extender → pregunta antes de pisar
19. Tarifa de vehículo específico gana sobre la de categoría
20. Cambia la tarifa de lista → las reservas ya confirmadas no se mueven

**Validaciones**
21. Check-out con VTV vencida → bloqueo con override
22. Check-out con póliza vencida → bloqueo duro
23. Check-out con licencia vencida → bloqueo
24. Licencia que vence durante el alquiler → warning
25. Check-out con km menor al actual → error
26. Baja de cliente con auto afuera → error

**Plata**
27. Reserva con seña + check-out → la seña se cuenta **una sola vez** *(hoy: doble)*
28. Cobro en el check-out → se registra *(hoy: error 500)*
29. Cobro en el check-in → se registra *(hoy: error 500)*
30. Excedente bonificado → aparece en el reporte de bonificaciones
31. Cargos de cierre → se ejecutan contra la garantía y el remanente se devuelve

---

## 13. Prioridad sugerida

| Bloque | Qué incluye | Cuándo |
|---|---|---|
| **P0 — Sangra plata** | Bugs 1 a 8 del resumen. Son ~11 correcciones puntuales | Inmediato, antes de producción |
| **P1 — Estados y late check-in** | VENCIDA, NO_SHOW, CERRADA + separar sincronización de finalización | Fase 0-1 del Plan Maestro |
| **P2 — Precios** | Rediseño de tarifas, precio/día explícito, descuentos auditados, factura sí/no | Fase 1 |
| **P3 — Validaciones** | Pre-checkout, matriz de bloqueos, vencimientos como campos | Fase 1-2 |
| **P4 — Cargos de cierre** | Combustible, limpieza, daños, liquidación de garantía | Fase 4 (con parte de daños) |
| **P5 — Clientes** | Empresa vs particular, contactos, conductor ≠ pagador | Fase 1-2 |
| **P6 — Configuración** | Pantalla de constantes de negocio | Fase 3 |

---

## Fuentes consultadas

- [Car Rental Rate Matrix Guide — RateHighway](https://www.ratehighway.com/blog/car-rental-rate-matrix-guide)
- [Mastering Car Rental Pricing Rules — RateHighway](https://www.ratehighway.com/blog/car-rental-pricing-rules-guide)
- [Car Rental Revenue Management Strategies — Worco](https://www.worco.io/blog/car-rental-revenue-management-strategies/)
- [Vehicle Rental Pricing Strategies — Nomora](https://www.nomora.io/blog/vehicle-rental-pricing-strategies-maximize-profitability)
- [The Typical Rental Car Grace Period is Half an Hour — AutoSlash](https://blog.autoslash.com/the-fee-detective-and-the-grace-of-rental-car-companies/)
- [Late Returns Policy — Enterprise Rent-A-Car](https://www.enterprise.com/en/help/faqs/late-returns-policy.html)
- [Grace Period for Car Rental Return — Alamo](https://www.alamo.com/en/customer-support/car-rental-faqs/grace-period-rental-return.html)
- [Late Returning Your Rental Car? Grace Periods & Fees Explained — AVR](https://www.airportvanrental.com/blog/late-return-rental-car-policy)
- [Car Rental Security Deposits Explained — Nomora](https://www.nomora.io/blog/car-rental-security-deposits-explained)

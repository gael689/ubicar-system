# Manual de Ubicar Rent — qué hace el sistema, módulo por módulo

**Actualizado:** 2026-07-28
**Alcance:** todo lo que el sistema hace **hoy**, relevado del código y no de
la memoria. Lo que todavía no hace está en §17, con el motivo.

> **Cómo leer esto.** Cada módulo explica primero *para qué sirve* y después
> *qué se puede hacer*. Donde una decisión de negocio explica por qué algo
> funciona de una manera y no de otra, está citada como **D-xx** — el detalle
> completo vive en `docs/DECISIONES.md`.

---

## Índice

| # | Módulo | Dónde |
|---|---|---|
| 1 | [Las reglas que atraviesan todo](#1-las-reglas-que-atraviesan-todo) | — |
| 2 | [Inicio y ocupación](#2-inicio-y-ocupación) | `/` |
| 3 | [Flota](#3-flota) | `/flota` |
| 4 | [Categorías](#4-categorías) | `/flota/categorias` |
| 5 | [Clientes](#5-clientes) | `/clientes` |
| 6 | [Reservas](#6-reservas) | `/reservas` |
| 7 | [El ciclo del alquiler](#7-el-ciclo-del-alquiler-check-out--check-in) | dentro de la reserva |
| 8 | [Contratos](#8-contratos) | dentro del alquiler |
| 9 | [Precios](#9-precios) | `/precios` |
| 10 | [Adicionales y recargos](#10-adicionales-y-recargos) | `/adicionales`, `/recargos-edad` |
| 11 | [Caja y pagos](#11-caja-y-pagos) | `/finanzas` → Caja |
| 12 | [Cuentas corrientes](#12-cuentas-corrientes) | `/finanzas` → Cuentas Corrientes |
| 13 | [Echeqs, recibos y comprobantes](#13-echeqs-recibos-y-comprobantes) | `/finanzas` → Echeqs, ficha del cliente |
| 14 | [Multas y daños](#14-multas-y-daños) | `/multas`, ficha del vehículo |
| 15 | [Notificaciones](#15-notificaciones) | `/notificaciones` |
| 16 | [Cotizador, reportes y configuración](#16-cotizador-reportes-y-configuración) | varios |
| 17 | [La web pública](#17-la-web-pública) | `web/` |
| 18 | [Lo que el sistema NO hace](#18-lo-que-el-sistema-no-hace-todavía) | — |

---

## 1. Las reglas que atraviesan todo

Cinco principios que explican el 80% de las decisiones de diseño. Si algo del
sistema parece raro, casi siempre es por uno de estos.

### 1.1 Nunca se elimina nada

**Ninguna entidad de dominio se borra físicamente.** Vehículos, clientes,
reservas, echeqs, multas, daños, adicionales, contratos: todos tienen baja
lógica (`activo = false`), conservan su historial y se pueden reactivar.

Por qué importa: un vehículo vendido hace dos años sigue explicando los
alquileres que hizo, y un cliente dado de baja sigue teniendo su cuenta
corriente. Borrar rompería el pasado.

Las **únicas excepciones** son los adjuntos (fotos de daños, PDFs): son
archivos, no entidades. Y los pagos, que se anulan con contra-asiento.

### 1.2 El sistema informa, la persona decide

El sistema **avisa** de los problemas pero casi nunca bloquea. Ejemplos reales:

- Un vehículo con VTV vencida se puede alquilar igual: aparece la advertencia.
- Se puede entregar un auto sin contrato firmado, pero hay que escribir por qué
  y queda constancia visible (**D-34**).
- Se puede bloquear un vehículo que ya tiene reservas: el sistema muestra
  cuáles se pisan para que alguien las reasigne.
- El buffer de 2 horas entre alquileres es un aviso, nunca un bloqueo (**D-12**).

Lo que **sí** bloquea es lo que dejaría datos imposibles: no se puede entregar
un auto que ya está entregado, ni cobrar más de lo que se debe, ni reservar un
vehículo ocupado.

### 1.3 El precio se congela cuando se pacta

Todo lo que define lo que el cliente paga se guarda **al momento de acordarlo**,
no se recalcula después: el precio del alquiler, el de cada adicional, el
recargo por edad, y el contrato entero.

Cambiar un precio en el catálogo **nunca reescribe el pasado**.

### 1.4 La cuenta corriente es el libro mayor (D-25)

**Todo alquiler genera un débito** al hacer check-out, sin importar cómo se
cobre. **Todo cobro genera el crédito** que lo cancela. El saldo nunca se toca
a mano: es siempre la suma de los movimientos, y cada movimiento guarda el
saldo que dejó.

Consecuencia visible: un cliente que siempre paga al contado igual tiene
movimientos (un débito y un crédito el mismo día). Eso es correcto — su cuenta
corriente es su **historial de facturación**, no sólo lo que quedó debiendo.

### 1.5 Corregir es compensar, no editar

Un movimiento de cuenta corriente **nunca se edita ni se borra**: se anula con
un contra-asiento, y siempre con motivo obligatorio. Lo mismo con recibos,
comprobantes, multas bonificadas, daños bonificados y contratos.

---

## 2. Inicio y ocupación

**Ruta:** `/` y `/ocupacion`

La pantalla de inicio es el **calendario de ocupación** a pantalla completa —
es lo primero que se ve al entrar, a propósito (**D-24**).

### Qué se ve

- Una fila por vehículo, una columna por día.
- Cada reserva es una barra con el color de su estado.
- Los **bloqueos** (taller, siniestro, uso interno) van con rayado diagonal
  para no confundirse con una reserva. No son clickeables: no tienen ficha.
- Las reservas pegadas (menos de 2 horas entre una devolución y la siguiente
  entrega) se marcan visualmente.

### Qué se puede hacer

- Clickear una reserva abre su ficha completa, desde donde se hace todo:
  check-out, check-in, extender, editar, cancelar, y el contrato.
- **Flujo del día**: un botón abre el resumen de las entregas y devoluciones
  de hoy, que es la pregunta de la mañana.
- Debajo del calendario, las métricas: vehículos disponibles, alquilados,
  reservados y fuera de servicio.

---

## 3. Flota

**Ruta:** `/flota` · ficha en `/flota/:id`

### El listado

Tabla de vehículos con patente, marca, modelo, categoría, estado y kilometraje.
Se filtra por estado, categoría y texto libre. **El orden se puede cambiar
arrastrando** y queda guardado.

**Estados del vehículo:** `disponible`, `reservado`, `alquilado`,
`en_transicion`, `fuera_de_servicio`.

### La ficha del vehículo — 8 pestañas

| Pestaña | Qué se hace |
|---|---|
| **Datos** | Marca, modelo, versión, año, patente, categoría, km actual, foto, y los vencimientos de **VTV y póliza** como campos propios |
| **Tarifas** | Precios por banda del vehículo puntual (ver §9) |
| **Documentos** | Cédula, seguro, VTV… con archivo adjunto y fecha de vencimiento. El motor de notificaciones los vigila |
| **Mantenimiento** | Services con fecha y kilometraje. Avisa por km recorridos y por fecha |
| **Gastos** | Service, combustible, cubiertas, reparación, seguro, patente, VTV, lavado y otros. Es donde impactan los cargos de cierre (**D-20**) |
| **Bloqueos** | Rangos de fecha en que el auto no está disponible (ver abajo) |
| **Daños** | El parte de daños del vehículo (ver §14) |
| **Historial** | Todas las reservas del vehículo, con sus km recorridos |

### Bloqueos de vehículo

Un bloqueo es un **rango de fechas** en que el auto no se puede alquilar:
`mantenimiento`, `siniestro`, `uso_interno`, `venta` u `otro`.

Lo importante: **un bloqueo entra al mismo motor de solapamientos que las
reservas**. Un auto en el taller rechaza una reserva por el mismo camino que un
auto ya alquilado, con un mensaje propio ("está en mantenimiento") para que
quien carga sepa que tiene que ofrecer otro.

El rango es **inclusivo en los dos extremos**: del 3 al 5 son tres días
completos.

Crear un bloqueo sobre reservas existentes **no se impide, se advierte**: hay
un botón "verificar" que muestra qué reservas se pisarían **antes** de crearlo.

### Dar de baja un vehículo

Baja lógica. Antes de confirmar, el sistema muestra **qué reservas futuras
quedarían afectadas** para poder reasignarlas.

---

## 4. Categorías

**Ruta:** `/flota/categorias`

Las seis categorías: **Compacto, Sedán, Sedán superior, SUV, Pick-up, Furgón**.

Una categoría no es sólo una etiqueta: es **la unidad de venta de la web**. El
cliente online reserva una categoría y el auto puntual se le asigna al
entregar, que es como funcionan las rentadoras reales — si un auto se rompe, se
reemplaza sin tocar la reserva.

### Qué se carga en cada categoría

- Nombre, descripción y orden de aparición.
- **Foto** — es lo que se muestra en la grilla de la web.
- **Specs**: pasajeros, valijas, transmisión, aire acondicionado.
- **Modelos de ejemplo** ("Fiat Cronos, VW Virtus o similar"). Nunca se promete
  un modelo puntual.
- **`visible_web`** — permite sacar una categoría de la web sin darla de baja
  del sistema.
- **Tarifas por categoría** (ver §9).

**Estado de la flota hoy (D-29):** 1 compacto · 7 sedán · 1 sedán superior ·
7 pick-up. SUV y Furgón existen sin vehículos asignados.

---

## 5. Clientes

**Ruta:** `/clientes` · ficha en `/clientes/:id`

### Alta

El formulario es **condicional según el tipo**:

- **Empresa** → razón social y condición de IVA.
- **Particular** → fecha de nacimiento, país y antigüedad de la licencia.

Ambos: nombre, DNI/CUIT, teléfono, email, domicilio, localidad, provincia,
código postal, datos de licencia y **condición de pago por defecto**.

### La ficha del cliente — 9 pestañas

| Pestaña | Qué se hace |
|---|---|
| **Datos** | Todo lo de arriba, editable. Badge de licencia vencida |
| **Cuenta corriente** | El libro mayor del cliente (ver §12) |
| **Reservas** | Historial completo de alquileres |
| **Documentos** | DNI, licencia, etc., con vencimiento vigilado |
| **Conductores** | Conductores adicionales: quien maneja puede no ser quien paga |
| **Contactos** | Para empresas: varias personas con su puesto |
| **Tarjeta** | Datos de la tarjeta de garantía, protegidos por PIN |
| **Echeqs** | Los echeqs recibidos de este cliente (ver §13) |
| **Recibos** | Emisión y descarga de recibos (ver §13) |
| **Comprobantes** | Facturas y notas cargadas (ver §13) |
| **Multas** | Multas imputadas a este cliente (ver §14) |

### Conductor ≠ pagador

Una reserva puede designar un **conductor adicional** del propio cliente. Es el
caso típico de las empresas, donde quien firma no es quien retira el auto.

Importa en tres lugares: el contrato (la cláusula 2.h exige nombre, documento y
domicilio del conductor), el buscador de multas (para saber quién manejaba), y
el **recargo por edad**, que mira la edad de quien maneja y no la del titular.

---

## 6. Reservas

**Ruta:** `/reservas`

### Estados

| Estado | Qué significa |
|---|---|
| `pendiente` | Cargada, sin confirmar |
| `confirmada` | Lista para entregar |
| `activa` | El auto está afuera (hubo check-out) |
| `vencida` | Pasó la fecha de fin y el auto no volvió |
| `finalizada` | Cerrada (hubo check-in) |
| `cancelada` | Cancelada, con motivo |
| `pendiente_pago` | Reserva web esperando el pago |
| `sin_disponibilidad` | Solicitud web sin cupo, sin cobrar |
| `revision_sin_cupo` | Pagó online y el cupo se fue |

### Crear una reserva

Un formulario largo, que cubre:

**Lo básico** — cliente, vehículo **o categoría**, fechas y horas de retiro y
devolución, lugares (chips predefinidos de Bahía Blanca + "Otro" libre,
**D-10**), conductor designado y notas.

**El precio** — se calcula solo con el motor de precios. Se puede pisar a mano,
pero entonces **exige motivo** y queda registrado quién lo autorizó: eso es lo
que permite auditar descuentos (`precio_lista` vs `precio_total`).

**Adicionales** — coberturas (una sola) y extras (los que se quieran). El
precio de cada uno se congela.

**Garantía** — efectivo, tarjeta o transferencia, con monto. Si es tarjeta, se
guardan los datos.

**Pago** — forma de pago prevista, anticipo (monto, fecha y medio), y
**condición de pago** con su ancla: contado, o cuenta corriente a 15/30/60/90
días contados desde el check-out, el check-in o una fecha específica.

**Facturación** — si lleva factura, tipo y a nombre de quién.

**Echeq** — si el medio de pago es echeq, se crea el echeq vinculado a la
reserva, que puede quedar como borrador con datos incompletos.

Al crear la reserva se **genera un PDF de confirmación** que se archiva en la
ficha del cliente y se descarga para mandárselo.

### Validaciones al crear

- **Solapamiento**: no se puede reservar un vehículo ocupado. Los bloqueos
  cuentan como ocupación.
- **Buffer de 2 horas** entre alquileres: advertencia, nunca bloqueo (**D-12**).
- Reservas **pendientes** que se pisan: advertencia con el detalle.
- Al menos uno de vehículo o categoría tiene que estar cargado.

### Otras acciones

- **Confirmar** una reserva pendiente.
- **Reasignar** el vehículo (revalida disponibilidad).
- **Cancelar** con motivo obligatorio. La seña la retiene el negocio (**D-11**).
- **Reservas a reasignar**: listado de las que quedaron sin vehículo válido.

---

## 7. El ciclo del alquiler: check-out → check-in

### Check-out (entrega)

Se registra: fecha y hora reales, **kilometraje**, nivel de combustible, estado
de limpieza y una descripción del estado del vehículo.

También en este paso:
- **Daños preexistentes** — se muestran los daños no reparados del vehículo,
  marcados como "no son responsabilidad de este cliente". Es lo que evita
  cobrarle a alguien un rayón que ya estaba.
- **Garantía** — tipo y monto.
- **Cobro inmediato** — se puede cobrar en el momento.
- **Late check-out** — si el auto sale más tarde de lo previsto, se puede
  cargar un monto con motivo obligatorio (**D-17**).
- **Contrato** — si el auto sale sin contrato firmado, hay que escribir el
  motivo y queda constancia (**D-34**).

**Lo que pasa automáticamente al hacer check-out:**
1. La reserva pasa a `activa` y el vehículo a `alquilado`.
2. Se genera el **débito en la cuenta corriente** por el total (alquiler +
   adicionales + cargos), con su fecha de vencimiento según la condición de pago.
3. Si había anticipo, se crea su `Pago` y el crédito correspondiente.

### Check-in (devolución)

Se registra: fecha y hora reales, kilometraje, combustible, limpieza y estado.

**El excedente por atraso** se calcula solo:

| Parámetro | Valor por defecto | Editable en |
|---|---|---|
| Período de gracia | 40 minutos | Configuración |
| Multiplicador por hora | 3× la hora proporcional | Configuración |
| Tope antes de cobrar día completo | 12 horas | Configuración |

El sistema **propone** el cargo y muestra el cálculo. La persona decide entre
tres salidas (**D-19**): **cobrar todo**, **cobrar parcial** (indicando cuántas
horas) o **bonificar** (con motivo obligatorio).

**Cargos de cierre** — combustible y limpieza. Por **D-20** estos **no se le
facturan al cliente**: se registran como **gasto del vehículo**, que es donde
impactan en la rentabilidad real de la unidad. Hay un botón que abre el
formulario de gasto con el contexto ya cargado.

**Daños nuevos** — se cargan acá, con fotos.

**Cobro** — se puede cobrar el saldo en el momento.

**Lo que pasa automáticamente:** la reserva pasa a `finalizada`, el vehículo a
`disponible`, se actualiza su kilometraje, y se generan los asientos del
excedente y de los cobros.

### Extender un alquiler

Cambia la fecha de fin. Recalcula el precio y los adicionales que se cobran por
día.

> ⚠️ **Limitación conocida:** extender **no genera el asiento** por la
> diferencia en la cuenta corriente. El saldo que se ve en pantalla es
> correcto, pero no coincide con la suma de los movimientos. Está documentado
> en `PLAN_MAESTRO.md` §2.11 y **espera tres decisiones** antes de arreglarse.

---

## 8. Contratos

**Dónde:** dentro de la ficha del alquiler.

### Cómo funciona

El contrato tiene **dos caras con dos naturalezas distintas**:

- **Anverso** — la liquidación de este alquiler puntual. Se arma con los datos
  del sistema y **es editable** antes de emitir.
- **Reverso** — el clausulado legal, igual para todos. Vive **versionado** en
  el sistema.

### El flujo

1. **Preparar** — el sistema arma el anverso con todo precargado: cliente,
   conductor, vehículo, fechas, km, combustible de salida, desglose de cargos,
   coberturas contratadas, franquicia y totales.
2. **Corregir** lo que haga falta.
3. **Generar** — se emite con número correlativo (`C-00000042`) y **se congela**:
   el anverso completo queda guardado tal como se emitió.
4. **Firmar** — el cliente firma en pantalla (canvas). Se registra quién firmó
   y su documento, que pueden no ser los del titular.
5. **Descargar** el PDF de dos páginas.

### Detalles que importan

- **Reimprimir un contrato viejo da el mismo papel**, aunque el cliente se haya
  mudado, el auto se haya vendido y los precios hayan cambiado. Eso es lo que
  hacen el snapshot congelado y la versión del clausulado.
- El PDF dice **"Valor Estimado"**, no "Total": al firmar, el auto todavía no
  volvió, y el excedente y los daños se liquidan en el check-in.
- Imprime el **rechazo explícito** de las coberturas que el cliente no
  contrató. No es decoración: es la prueba de que se le ofrecieron.
- **Anular** un contrato no lo borra: queda registrado con su motivo, y se
  puede emitir uno nuevo para el mismo alquiler.
- El clausulado se puede publicar en **versiones nuevas**, que nunca pisan la
  anterior.

> ⚠️ **Pendiente:** mientras no estén cargados los datos fiscales del locador
> (razón social, CUIT), el PDF sale marcado **"DOCUMENTO PROVISORIO"**. Es
> deliberado: un CUIT inventado en un contrato es peor que un espacio en blanco.
> Se cargan en Configuración → Empresa.

---

## 9. Precios

**Ruta:** `/precios`

Hay **dos mecanismos que conviven**, y el segundo le gana al primero.

### 9.1 Tarifas por banda (el piso)

Precios según cuánto dura el alquiler, cargados en la ficha del vehículo o de
la categoría:

| Banda | Cubre |
|---|---|
| **Diaria** | Un día |
| **Semanal** | Siete días |
| **Mensual** | Treinta días |

**El monto es el precio del bloque completo, no el precio por día** (**D-35**).
Una tarifa semanal de $150.000 es el precio de la semana.

**Un alquiler se descompone en bloques**, consumiendo los más grandes primero:

```
10 días  →  1 semana + 3 días sueltos
40 días  →  1 mes + 1 semana + 3 días
```

Prioridad cuando hay varias: **vehículo puntual > categoría > general**.

### 9.2 Motor de precios por calendario (lo que manda)

Reglas de precio **por fecha**, que sirven para temporada alta, feriados y
promociones. Se cargan en `/precios`.

Cada regla tiene: nombre, precio por día, rango de fechas (propio o heredado de
una **fecha especial**), **prioridad**, alcance (general, categoría o vehículo),
días de la semana, duración mínima y máxima, y **canal** (ambos / sólo web /
sólo mostrador).

**Las tres capas son la misma tabla con distinta prioridad:**

| Capa | Prioridad sugerida |
|---|---|
| Precio base anual | 0 |
| Fecha especial (feriados, temporada) | 10 |
| Promoción | 20 |

**La de mayor prioridad gana sin borrar lo de abajo.** Dar de baja una promo
hace que el precio anterior vuelva a aplicar solo — esa es la propiedad que
hace que esto se pueda usar todas las semanas sin miedo.

**Desempate** (determinista, nunca al azar): prioridad → especificidad
(vehículo > categoría > general) → rango más corto → id más alto.

**La prioridad le gana a la especificidad a propósito**: es el eje que se
carga a mano y el único que se ve en pantalla. Para sacar un vehículo de una
promo, se le carga su propia regla con prioridad mayor.

### 9.3 Descuentos por duración

Porcentaje de descuento a partir de N días, general o por categoría. Si hay
varios aplicables, gana el de mayor porcentaje.

**Los adicionales quedan fuera del descuento** a propósito: ese descuento
bonifica el alquiler del vehículo, y aplicarlo al seguro regalaría cobertura.

### 9.4 La pantalla

- **Grilla** categorías × días del mes, con el precio ya resuelto en cada celda
  y cuatro estados visuales — incluido "sin precio configurado" en rojo, para
  ver dónde falta cargar.
- **ABM de reglas** con las tres capas como preset.
- **Probador de precio** que cotiza contra el mismo endpoint que las reservas.
  Sin eso, entender qué paga el cliente con tres reglas superpuestas es adivinar.

### 9.5 El pipeline completo

```
precio de cada día (regla de calendario, o bloques de tarifa)
  = subtotal
  − descuento por duración
  = subtotal del vehículo
  + recargo por edad del conductor
  + adicionales
  = TOTAL
```

---

## 10. Adicionales y recargos

**Ruta:** `/adicionales`

### Adicionales

**Los cargan los dueños**, no están en el código: la lista cambia con la
temporada.

Dos grupos con reglas distintas:

- **Coberturas** — se elige **una sola** (son niveles del mismo seguro). Tienen
  **franquicia**: el monto que queda a cargo del cliente ante un siniestro. Es
  un campo propio y no una frase en la descripción, porque es el motivo número
  uno de conflictos post-siniestro.
- **Extras** — se eligen todos los que se quiera: sillas de bebé, GPS, cadenas,
  portaequipaje. Con tope de cantidad por ítem.

Cada uno tiene **unidad de cobro**: por día (un seguro se paga todos los días) o
único (un portaequipaje se cobra una vez).

La exclusividad de las coberturas **se valida en el servidor**, no sólo en la
pantalla: la web es pública y un pedido armado a mano con dos coberturas
dejaría una reserva cobrando dos seguros del mismo auto.

### Recargo por edad (D-38)

**No hay edad mínima para alquilar.** La edad **modifica el precio**, no rechaza
al cliente — es como opera el rubro, y rechazar pierde la venta entera.

Se cargan desde **`/recargos-edad`**: franja desde/hasta (o "de esta edad en
adelante"), con **monto fijo o porcentaje**, por día o único, general o por
categoría.

Tres detalles:
- **La edad se mide al retirar el auto**, no hoy. Quien cumple 25 antes de
  viajar ya no es un conductor joven.
- **Mira la edad de quien maneja.** Si hay conductor adicional designado, el
  riesgo es suyo.
- El recargo se **congela en la reserva** junto con la edad usada, sin la cual
  el importe no se puede explicar meses después.

---

## 11. Caja y pagos

**Ruta:** `/finanzas`, pestaña **Caja**

> Las tres pantallas de plata —Caja, Echeqs y Cuentas Corrientes— viven en
> `/finanzas` como pestañas. Las rutas viejas (`/caja`, `/echeqs`,
> `/cuentas-corrientes`) siguen andando: redirigen a la pestaña que corresponde.

### Caja del día

Ingresos y egresos de una fecha, con:
- Total de ingresos, total de egresos y balance.
- Desglose **por medio de pago**.
- Detalle de cada cobro, con cliente y vehículo.
- Detalle de cada gasto.

### Registrar un cobro

Monto, medio de pago (efectivo, transferencia, tarjeta, cheque, echeq, cuenta
corriente), fecha, si lleva factura y notas.

Un pago puede estar atado a un alquiler **o no**: desde la migración 043 se
puede registrar un **pago a cuenta**, la seña de una reserva sin alquiler
todavía, o la cancelación de una deuda vieja.

**Todo cobro genera automáticamente el crédito** en la cuenta corriente del
cliente.

### Emitir el recibo de un cobro

Cualquier pago registrado puede recibir su recibo. **No mueve plata**: el
crédito ya lo generó el pago.

### Anular un cobro

Se elimina el pago y **se anula su movimiento con un contra-asiento**. Si el
pago ya tenía un recibo entregado al cliente, el sistema no deja borrarlo:
primero hay que anular el recibo, que es un acto explícito con motivo.

### Pendientes de cobro

Listado de lo que falta cobrar, tanto de alquileres cerrados como de reservas
sin alquiler todavía.

---

## 12. Cuentas corrientes

**Ruta:** `/finanzas` → **Cuentas Corrientes** · y pestaña en cada cliente

### Qué es

El **libro mayor de cada cliente**. Una fila por movimiento:

```
Fecha │ Concepto │ Condición │ Vence │ Debe │ Haber │ Saldo
```

**Convención de signos (D-01):** saldo **positivo = el cliente debe**; negativo
= saldo a favor.

### Qué genera movimientos automáticamente

| Evento | Movimiento |
|---|---|
| Check-out confirmado | **DEBE** por el total del alquiler |
| Cobro registrado | **HABER** por el monto |
| Recibo emitido | El del pago que documenta (no genera uno propio) |
| Echeq recibido en cartera | **HABER** diferido |
| Echeq rechazado | **DEBE** que revierte el crédito |
| Multa imputada | **DEBE** |
| Multa cobrada / bonificada | **HABER** / contra-asiento |
| Daño imputado | **DEBE** |
| Daño bonificado | Contra-asiento |
| Cargo por excedente | **DEBE** al cerrar el check-in |
| Nota de crédito / débito | **HABER** / **DEBE** |

### Qué se puede hacer a mano

- **Cargar un movimiento** manual (débito o crédito) con concepto, monto,
  fecha y condición de pago. El vencimiento se calcula solo.
- **Anular un movimiento** con contra-asiento y motivo. No se puede anular dos
  veces.
- **Editar la fecha de vencimiento** de un movimiento.

### La vista

Arriba, el **aging de deuda**: `A vencer · 1-30 · 31-60 · 61-90 · +90 días`,
que es como se mira una cuenta corriente en la vida real. Más un filtro de
"sólo vencido".

Cada cuenta tiene además **condición de pago por defecto**, **límite de
crédito** (que dispara un aviso al superarse) y se puede **bloquear**.

---

## 13. Echeqs, recibos y comprobantes

### Echeqs

**Ruta:** `/finanzas` → **Echeqs** · y pestaña en el cliente

Un echeq recibido de un cliente **genera el crédito automático** en su cuenta
corriente al entrar en cartera.

**Ciclo de vida:**

```
recibido → EN CARTERA ──► crédito en la cuenta corriente
              ├─► DEPOSITADO ──► COBRADO (se registra la acreditación)
              ├─► ENDOSADO (sale de cartera)
              └─► RECHAZADO ──► contra-asiento + notificación urgente
                                la deuda del cliente vuelve a aparecer
```

Rechazar **exige motivo** a nivel de API, no sólo en la pantalla.

Un echeq puede **nacer desde la reserva** cuando el medio de pago elegido es
echeq, y quedar como borrador con datos incompletos.

Dar de baja un echeq también revierte su crédito.

### Recibos

**Dónde:** pestaña en la ficha del cliente, y desde cualquier pago.

El recibo es **el papel que documenta un cobro**. Numeración correlativa
propia (`R-00000042`), nunca `MAX+1`.

Dos caminos:
- **Desde la cuenta corriente** — cobrar y documentar en una acción: se crea el
  pago (que genera el crédito) y su recibo.
- **Desde un pago existente** — sólo el papel; el saldo no se mueve.

El **PDF** incluye: logo y datos de la empresa, número, fecha, a quién se le
recibió, **el monto en letras**, el concepto, el medio de pago, la barra de
*saldo anterior → este pago → saldo actual*, y un párrafo de agradecimiento
fijo (**D-15**).

**Anular** un recibo exige motivo. Anula el papel, no el cobro.

### Comprobantes (facturas)

**Dónde:** pestaña en la ficha del cliente.

Carga manual de comprobantes emitidos **fuera** del sistema: factura A/B/C,
nota de crédito, nota de débito, remito. Con punto de venta, número, fechas,
neto/IVA/total, campos de CAE preparados, y **el PDF adjunto**.

**Sólo las notas de crédito y débito generan movimiento** en la cuenta
corriente. Las facturas sólo documentan un cargo que el ledger ya facturó al
check-out; generarles un segundo asiento duplicaría la deuda.

Anular exige motivo y revierte el movimiento si lo había generado.

---

## 14. Multas y daños

### Multas

**Ruta:** `/multas`

**Cargar una multa:** patente, fecha y hora de la infracción, monto,
**fecha de vencimiento**, descripción y el PDF adjunto.

**El buscador por patente + fecha + hora** encuentra automáticamente qué
alquiler estaba vigente en ese momento y **quién manejaba** — incluido el
conductor designado, que puede no ser el titular.

**Ciclo:**
1. `pendiente` → cargada, sin responsable asignado.
2. `imputada` → asignada a un cliente. **Genera el débito automático.**
3. Se resuelve con exactamente dos salidas:
   - **Cobrada** → genera el crédito que cancela el débito.
   - **Bonificada** → contra-asiento, **con motivo obligatorio**.

También existe `apelando`.

**Avisos (D-28):** el sistema avisa cuando una multa está por vencer (ventana
configurable, 7 días por defecto) y cuando ya venció sin resolverse. **El
descuento por pronto pago no se modela**, por decisión explícita.

Las multas **no se pueden eliminar**.

### Daños

**Dónde:** pestaña en la ficha del vehículo, y dentro del check-out y check-in.

**El daño le pertenece al vehículo, no al alquiler.** Por eso los daños no
reparados sobreviven al cierre del alquiler y se precargan en el próximo
check-out — que es exactamente lo que evita imputarle a un cliente un rayón que
ya estaba.

Un daño puede nacer en un check-out, en un check-in, o cargarse a mano sobre el
vehículo.

**Se carga:** zona (con sugerencias, pero se puede escribir cualquiera), **tipo**
(rayón, abolladura, rotura, faltante), **gravedad** (leve, moderado, grave),
descripción, costo estimado y **fotos**.

**Estados:** `detectado` → `valorizado` → `imputado` / `bonificado` /
`reparado`. **Responsable:** `sin_definir`, `cliente`, `desgaste`, `terceros`.

**Detectar ≠ cobrar.** Registrar un daño no mueve plata. El responsable arranca
en `sin_definir` y lo decide una persona. Recién ahí:

- **Imputar** → genera el débito, con **monto editable** (puede ser menor al
  costo estimado: el costo es un dato del taller, la imputación es una decisión
  comercial).
- **Bonificar** → contra-asiento con motivo obligatorio.

Un daño ya imputado no se puede dar de baja sin bonificarlo antes.

---

## 15. Notificaciones

**Ruta:** `/notificaciones` · y la campana en el menú

### Cómo funciona

Un **scheduler corre todos los días a las 08:00 (hora de Argentina)** y evalúa
**29 reglas** contra la base. Lo que encuentra se guarda en una tabla real, con
deduplicación: la misma alerta no se repite todos los días para siempre.

Las notificaciones se pueden **marcar como leídas, posponer o descartar**. Y se
**auto-resuelven**: si la condición desaparece (se cobró el echeq, se hizo el
check-in), la notificación se cierra sola.

Además del panel, hay un **digest por email** a la mañana.

### Las 29 reglas

**Operación diaria** — entregas de hoy · devoluciones de hoy · check-out
pendiente · check-in vencido · contrato sin firmar con entrega hoy · reserva
pendiente hace más de 24 h.

**Cobranzas** — echeq próximo a cobrarse · echeq que vence hoy · echeq sin
acreditar · echeq rechazado · vencimiento de cuenta corriente próximo · cuenta
corriente vencida · cliente que supera su límite de crédito · saldo pendiente
al finalizar · garantía sin resolver · factura pendiente de emitir.

**Flota y documentación** — documento de vehículo por vencer · **VTV** ·
**póliza** · documento de cliente por vencer · service por kilometraje ·
service por fecha · licencia de cliente por vencer · licencia vencida con
reserva futura · vehículo fuera de servicio hace mucho.

**Multas** — pendiente de imputar · imputada sin cobrar hace 15 días · **por
vencer** · **vencida**.

**Reservas web** — solicitud sin atender. Además, cuando entra una reserva web
se dispara **un aviso en el acto**, sin esperar al barrido de las 08:00: una
reserva del sábado a la tarde no puede quedar sin respuesta hasta el lunes.

El catálogo completo, con urgencias y umbrales, está en
`docs/CATALOGO_NOTIFICACIONES.md`.

---

## 16. Cotizador, reportes y configuración

### Cotizador

**Ruta:** `/cotizador`

Arma un presupuesto para mandarle a un cliente: vehículo o categoría, fechas,
adicionales. Calcula el total con el mismo motor que las reservas y muestra el
**desglose por bloques** ("1 semana + 3 días").

Genera un **PDF comercial** con los datos de la empresa, el precio y las
fechas, y contenido comercial fijo.

Es una **isla deliberada**: no crea reservas ni toca el calendario.

### Reportes

**Ruta:** `/reportes`

- **Dashboard** — métricas generales del período.
- **Flota** — rendimiento por vehículo: ingresos, gastos, días alquilado,
  kilómetros.
- **Ingresos** — por período, con desglose.

### Búsqueda global

Desde el menú, busca en clientes, vehículos y reservas a la vez.

### Configuración

**Ruta:** `/configuracion`

Parámetros del negocio, editables sin tocar código:

| Parámetro | Para qué |
|---|---|
| `excedente.gracia_minutos` | Minutos de tolerancia antes de cobrar atraso |
| `excedente.multiplicador_hora` | Cuánto se cobra la hora de excedente |
| `excedente.tope_horas_dia_extra` | A partir de cuántas horas se cobra día completo |
| `multas.dias_aviso_vencimiento` | Con cuánta anticipación avisar |
| `web.hold_minutos` | Cuánto se guarda el cupo mientras el cliente paga |
| `empresa.*` | Razón social, CUIT, domicilio, contacto, jurisdicción |
| `contrato.franquicia_default` | Franquicia cuando no hay cobertura contratada |

### Fechas especiales

**Ruta:** `/fechas-especiales`

Feriados, temporada alta, eventos. Es un **módulo autónomo**: se define una vez
("Navidad 2026") y sirve para el calendario **y** para los precios. Si se
corrige el rango, los precios que cuelgan se corrigen solos.

---

## 17. La web pública

**Dónde:** `web/` (Next.js) · el sistema interno la alimenta

### La landing

`/` y `/maquinaria`, prerenderizadas estáticas, con SEO y datos estructurados.

### El flujo de reserva — `/reservar`

Cuatro pasos en una sola ruta:

**Paso 1 · Vehículo** — lugar de retiro y devolución (con el aviso de que están
sujetos a disponibilidad), fechas y horarios, y la **grilla de categorías por
imagen** con specs, cupo real y precio. Las categorías sin cupo se muestran
igual (**D-31**), con un desvío a WhatsApp en vez de un cartel de "no".

Al elegir, **se toma el cupo**: un *hold* de 20 minutos con cuenta regresiva a
la vista, extensible.

**Paso 2 · Adicionales** — coberturas (una sola, con la franquicia explicada) y
extras con contador.

**Paso 3 · Tus datos** — nombre, apellido, DNI, teléfono, email y **fecha de
nacimiento** (necesaria para cotizar el recargo por edad), más la aceptación de
términos.

**Paso 4 · Pago** — cuánto adelantar: 30%, 50% o 100% (**D-30**).

El **total está siempre a la vista** y es siempre el mismo número.

### Bandeja de reservas web

**Ruta:** `/reservas-web` en el sistema interno.

Tres colas, ordenadas por dónde hay plata del cliente en juego: pagó y se quedó
sin cupo · solicitud sin disponibilidad · esperando pago.

**Aceptar** asigna un vehículo concreto y revalida la disponibilidad en ese
momento. **Rechazar** exige motivo.

### Términos y privacidad

`/terminos` y `/privacidad`, versionados.

---

## 18. Lo que el sistema NO hace todavía

Ordenado por qué lo bloquea.

### Bloqueado por servicios externos

| Falta | Depende de |
|---|---|
| **Cobro online** | Mercado Pago. El paso 4 cierra por WhatsApp mientras tanto |
| **Devoluciones de dinero** | Mercado Pago. No existe el concepto de devolución |
| **Login y usuarios reales** | Clerk. Hoy todo corre con un usuario fijo, así que los "cobrado por" y "autorizado por" no distinguen quién hizo cada cosa |
| **Aviso inmediato por email** | Resend está integrado sólo para el digest de las 08:00 |
| **Facturación electrónica AFIP** | Decisión: los comprobantes se cargan a mano (**D-05**) |
| **WhatsApp automático** | API de Meta. Se mantienen los links `wa.me` (**D-06**) |

### Bloqueado por decisiones pendientes

| Falta | Qué hay que decidir |
|---|---|
| Datos fiscales en el contrato | **D-C1**: quién es legalmente el locador |
| Monto de la franquicia | **D-C3**: cómo lo manejan hoy |
| Asiento al extender un alquiler | Tres preguntas en `PLAN_MAESTRO.md` §2.11 |
| Horarios de entrega | **D-36** |
| Venta online en Capital Federal | **D-39b**: si la flota de CABA es la misma |

### Decisiones tomadas de NO hacerlo

| No se hace | Por qué |
|---|---|
| **Sucursales y cargos one-way** | Toda la operación es Bahía Blanca (ítem 55) |
| **Cobrar combustible y limpieza al cliente** | Van como gasto del vehículo (**D-20**) |
| **Límite de kilometraje** | Km libre en todos los alquileres (**D-21**) |
| **Estado de no-show** | Se resuelve como late check-out (**D-17**) |
| **Descuento por pronto pago en multas** | Mucha estructura para poco valor (**D-28**) |
| **Croquis interactivo de daños** | Se reemplazó por zona con sugerencias |
| **Edad mínima para alquilar** | La edad recarga, no rechaza (**D-38**) |
| **Imputación FIFO de recibos a deudas** | El recibo baja el saldo general (**D-14**) |
| **Garantía online (pre-autorización)** | Checkout Pro no la soporta |

### Faltantes de datos, no de software

Estas dos cosas están construidas pero **vacías**, y sin ellas la web no puede
vender:

1. **No hay tarifas por categoría ni generales.** Sólo hay tarifas atadas a
   vehículos puntuales, así que una cotización por categoría no encuentra
   precio y la web muestra todo como "sin disponibilidad".
2. **Las categorías no tienen foto ni specs.** Las tarjetas de la web salen con
   un ícono gris.

También están vacíos: los **adicionales** (coberturas y extras) y los
**recargos por edad**.

---

## Verificado

Lo de este manual no está escrito de memoria. Al 2026-07-28 se verificó contra
el sistema corriendo:

- **233 tests** de dominio en verde.
- **130 endpoints** relevados del esquema OpenAPI real.
- **Migraciones 043-047 aplicadas** a la base, con roundtrip completo de
  bajada y subida sin alterar los saldos de cuenta corriente.
- **Ciclo del contrato probado de punta a punta**: preparar → generar
  (`C-00000001`) → firmar → PDF de 2 páginas con las 13 cláusulas, el locador
  resuelto y sin rastros del contrato original → anular → emitir uno nuevo.
  Emitir dos contratos vigentes del mismo alquiler devuelve 409.
- **Flujo web de 4 pasos probado en navegador** contra datos reales: 6
  categorías con cupo, hold tomado, y la recotización con adicionales exacta.

Los datos de prueba que se cargaron para verificar (una tarifa, cuatro
adicionales, un recargo por edad y dos contratos) **se borraron después**.

---

## Documentos relacionados

| Documento | Para qué |
|---|---|
| `docs/DECISIONES.md` | Todas las decisiones de negocio, con su número |
| `docs/PLAN_MAESTRO.md` | El plan de trabajo y el estado de cada ítem |
| `docs/CATALOGO_NOTIFICACIONES.md` | Las 29 reglas en detalle |
| `docs/PLAN_CONTRATOS.md` | El módulo de contratos, campo por campo |
| `docs/PLAN_RESERVAS_WEB.md` | La arquitectura del flujo web |
| `docs/PLAN_TEXTOS_LEGALES.md` | Los textos legales que faltan |
| `docs/VALIDAR_CON_DUENOS.md` | Lo que espera confirmación |
| `docs/_archivo/` | Documentación anterior al 2026-07-25 |

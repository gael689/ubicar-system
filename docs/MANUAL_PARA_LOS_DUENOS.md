# Ubicar Rent — cómo funciona el sistema

**Para Franco y Martín** · Actualizado el 28 de julio de 2026

Este documento cuenta **qué hace el sistema hoy**, **qué decisiones se tomaron
y por qué**, y **qué falta**. Está escrito para leerse de corrido, sin
tecnicismos.

---

## Índice

1. [Dónde estamos parados](#1-dónde-estamos-parados)
2. [Las cinco reglas que ordenan todo](#2-las-cinco-reglas-que-ordenan-todo)
3. [La cuenta corriente: el cambio más importante](#3-la-cuenta-corriente-el-cambio-más-importante)
4. [El día a día: de la reserva a la devolución](#4-el-día-a-día-de-la-reserva-a-la-devolución)
5. [Cómo se arman los precios](#5-cómo-se-arman-los-precios)
6. [El contrato](#6-el-contrato)
7. [La plata: caja, echeqs, recibos y facturas](#7-la-plata-caja-echeqs-recibos-y-facturas)
8. [Multas y daños](#8-multas-y-daños)
9. [El sistema les avisa solo](#9-el-sistema-les-avisa-solo)
10. [La página web](#10-la-página-web)
11. [Decisiones que tomamos sin ustedes](#11-decisiones-que-tomamos-sin-ustedes-y-por-qué)
12. [Lo que falta, y qué depende de ustedes](#12-lo-que-falta-y-qué-depende-de-ustedes)
13. [Trabajar de a varios](#13-trabajar-de-a-varios) — incluye **Auditoría: quién hizo qué**

---

## 1. Dónde estamos parados

El sistema **está entero y funcionando** para la operación diaria: flota,
clientes, reservas, entregas, devoluciones, cobros, cuentas corrientes,
echeqs, recibos, facturas, multas, daños, contratos y avisos automáticos.

La página web **ya tiene el sistema de reservas online**: el cliente entra,
elige fechas, ve qué hay disponible con precio real, suma el seguro y los
extras, carga sus datos y confirma.

**La parte de programación está terminada.** Lo que queda son dos cosas de
naturaleza distinta:

**1. Datos que tienen que cargar ustedes.** Hasta que estén, la web muestra
todas las categorías como "sin disponibilidad", porque no tiene precio con el
cual venderlas. La lista completa y en orden está en el punto 12 — y el sistema
se los va reclamando solo con los avisos de "📌 Falta completar".

**2. Servicios externos que hay que contratar y conectar**: el cobro con
tarjeta (Mercado Pago), los usuarios con contraseña, el envío de mails y el
guardado de archivos en la nube. Ninguno es difícil; hay que abrir las cuentas.

Mientras tanto el cliente completa toda la reserva por la web y el último paso
coordina el pago a mano. **No se simula un cobro que no existe.**

---

## 2. Las cinco reglas que ordenan todo

Si algo del sistema les parece raro, casi siempre es por una de estas cinco.
Vale leerlas porque explican el 80% de las decisiones.

### 2.1 Nunca se borra nada

Ningún auto, cliente, reserva, echeq, multa ni contrato se elimina de verdad.
Se dan de baja, conservan todo su historial y se pueden reactivar.

**Por qué:** un auto que vendieron hace dos años sigue explicando los
alquileres que hizo, y un cliente dado de baja sigue teniendo su cuenta
corriente. Si se borrara, se rompería el pasado.

### 2.2 El sistema avisa, la persona decide

El sistema **casi nunca bloquea**. Avisa fuerte y deja seguir.

Ejemplos reales:
- Un auto con la VTV vencida se puede alquilar igual. Aparece la advertencia.
- Se puede entregar un auto sin contrato firmado, pero hay que escribir por
  qué, y queda marcado en el listado hasta que se firme.
- Se puede mandar al taller un auto que ya tiene reservas: el sistema muestra
  cuáles se pisan para que alguien las reacomode.
- Si entre una devolución y la siguiente entrega quedan menos de 2 horas, avisa
  — pero deja hacerlo.

**Por qué:** el negocio pasa cosas que el software no puede prever. Un sistema
que bloquea termina con la gente buscando cómo esquivarlo, y ahí sí se pierde
el control.

Lo único que sí bloquea es lo imposible: entregar un auto ya entregado, cobrar
más de lo que se debe, o reservar un auto ocupado.

### 2.3 El precio se congela cuando se pacta

Todo lo que define lo que el cliente paga se guarda **en el momento de
acordarlo**: el precio del alquiler, el de cada seguro, el de cada extra.

Si mañana suben el precio de la cobertura full, **las reservas ya cargadas
siguen valiendo lo pactado**. Cambiar un precio nunca reescribe el pasado.

### 2.4 La cuenta corriente es el libro de todo

Es el cambio más grande y tiene su propia sección: [§3](#3-la-cuenta-corriente-el-cambio-más-importante).

### 2.5 Los errores se corrigen compensando, no borrando

Si se carga algo mal, **no se edita ni se borra**: se hace un movimiento en
contra que lo anula, siempre con un motivo escrito.

**Por qué:** así queda el rastro de qué pasó. Un número que cambió sin dejar
huella es un número en el que nadie puede confiar. Con este método, cualquiera
puede reconstruir en qué momento se corrigió qué y quién lo hizo.

---

## 3. La cuenta corriente: el cambio más importante

Es lo que más cambió respecto de cómo venían trabajando, así que vale
explicarlo bien.

### Cómo era antes

La cuenta corriente **sólo se movía si alguien elegía "Cuenta Corriente" como
forma de pago**. Un cliente que pagaba en efectivo no dejaba ningún rastro ahí.

### Cómo es ahora

**Todo alquiler genera una deuda automática** en la cuenta del cliente cuando
se entrega el auto, sin importar cómo se vaya a cobrar. **Y todo cobro genera
el crédito** que la cancela.

```
Alquiler de $80.000, el cliente paga todo en efectivo al retirar:

  Entrega del auto  →  DEBE    $80.000     (la factura)
  Cobro             →  HABER   $80.000     (lo que pagó)
  ──────────────────────────────────────
  Saldo: $0                                (como corresponde)


Mismo alquiler, pero sólo deja una seña de $30.000:

  Entrega del auto  →  DEBE    $80.000
  Seña              →  HABER   $30.000
  ──────────────────────────────────────
  Saldo: $50.000              (la deuda real, visible en su ficha)
```

### Qué van a ver distinto

**Los clientes que pagan al contado también van a tener movimientos.** Es
normal ver una deuda y un pago del mismo monto el mismo día, cancelándose. No
está mal: así funciona.

### Por qué se hizo así

Con el modelo viejo, un cliente que siempre paga en efectivo **nunca aparecía
en ningún lado con historial**. La cuenta corriente sólo mostraba a los que
quedaban debiendo.

Ahora la cuenta corriente de cada cliente es **su historial completo**: todo lo
que alquiló, todo lo que pagó, y cuándo. Eso permite responder preguntas que
antes no se podían responder sin revisar alquiler por alquiler:

- *"¿Cuánto nos facturó este cliente en el año?"*
- *"¿Cuánto tarda en pagarnos?"*
- *"Mandame el resumen de cuenta"* — que es lo que pide cualquier empresa
  cliente.

### Lo que se puede hacer

- Ver el **libro completo** de cada cliente: fecha, concepto, condición, cuándo
  vence, debe, haber y saldo.
- Ver el **aging de deuda** arriba de todo: *a vencer · 1-30 · 31-60 · 61-90 ·
  más de 90 días*. Es como se mira una cuenta corriente en la vida real.
- Filtrar **sólo lo vencido**.
- Ponerle a cada cliente su **condición de pago** (contado, o 15/30/60/90 días)
  y un **límite de crédito** que dispara un aviso al superarse.
- Cargar movimientos a mano cuando haga falta.

### Qué genera movimientos solo

| Cuando pasa esto | El sistema hace |
|---|---|
| Se entrega el auto | Deuda por el total |
| Se cobra (efectivo, transferencia, tarjeta, lo que sea) | Crédito |
| Entra un echeq | Crédito |
| **Rebota un echeq** | **Vuelve la deuda** + aviso urgente |
| Se imputa una multa a un cliente | Deuda |
| Se cobra o se perdona esa multa | Crédito o anulación |
| Se le imputa un daño | Deuda |
| Hay cargo por devolver tarde | Deuda al cerrar |

---

## 4. El día a día: de la reserva a la devolución

### La pantalla de inicio

Lo primero que ven al entrar es **el calendario de ocupación** a pantalla
completa: una fila por auto, una columna por día. De un vistazo se ve qué está
alquilado, qué está reservado y qué está libre.

Los autos en el taller aparecen con rayado diagonal, para no confundirlos con
una reserva.

Hay un botón de **"Flujo del día"** que muestra las entregas y devoluciones de
hoy — que es la pregunta de la mañana.

### Cargar una reserva

Se elige cliente, auto (o categoría), fechas, horarios y lugares. El sistema:

- **No deja reservar un auto ocupado.**
- **Avisa** si quedan menos de 2 horas entre una devolución y la siguiente
  entrega.
- **Calcula el precio solo.** Si lo pisan a mano, pide el motivo y guarda quién
  lo autorizó — así queda auditado cualquier descuento.
- Permite sumar **seguros y extras**, con su precio congelado.
- Registra **garantía**, **anticipo** y **condición de pago**.
- Si el pago es con echeq, **crea el echeq** vinculado a la reserva, aunque
  falten datos.

Al crear la reserva **se genera un PDF de confirmación** para mandarle al
cliente, que además queda archivado en su ficha.

**La condición de pago pregunta dos cosas, no una.** Primero el plazo —contado,
15, 30, 60 o 90 días— y después **desde cuándo se cuenta**:

| Opción | Cuándo vence |
|---|---|
| **Al entregar el auto** (check-out) | El día que el auto sale |
| **Al devolverlo** (check-in) | El día que el auto vuelve |
| **Otra fecha** | La que se ponga |

La segunda pregunta también aparece cuando eligen **contado**, y no es un
detalle: entre que el auto sale y vuelve pueden pasar semanas, y "en el
momento" no dice cuál de los dos momentos es. Antes el sistema asumía la
entrega sin decirlo.

> Si eligen "al devolverlo", **el saldo queda sin fecha de vencimiento hasta
> que el auto vuelva** — recién en el check-in se sabe qué día es. El sistema
> la completa solo.

Esto define **cuándo vence**, no cuándo entró la plata: el cobro se registra
aparte, cuando efectivamente se cobra.

### Entregar el auto (check-out)

Se registra kilometraje, combustible, limpieza y el estado general.

Tres cosas que hace solo:
1. **Muestra los daños que el auto ya tenía**, marcados como *"no son
   responsabilidad de este cliente"*. Eso es lo que evita cobrarle a alguien un
   rayón que ya estaba.
2. **Genera la deuda** en la cuenta corriente por el total.
3. Si hay anticipo, **lo registra como cobro**.

Si el auto sale sin contrato firmado, pide el motivo y **queda marcado en el
listado** hasta que se firme.

### Recibir el auto (check-in)

Se registra kilometraje, combustible, limpieza y estado.

**El atraso se calcula solo:**

| Regla | Valor |
|---|---|
| Tolerancia | 40 minutos |
| Después de eso | Se cobra la hora al triple |
| A partir de 12 horas | Se cobra el día completo |

Los tres valores se pueden cambiar desde Configuración, sin tocar el sistema.

**El sistema propone el cargo, ustedes deciden**: cobrar todo, cobrar sólo
algunas horas, o perdonarlo (con el motivo escrito).

**Combustible y limpieza** no se le facturan al cliente: se registran como
**gasto del auto**, que es donde impactan de verdad en la rentabilidad de esa
unidad. Hay un botón que abre el gasto ya cargado con el contexto.

Los **daños nuevos** se cargan acá, con fotos.

---

## 5. Cómo se arman los precios

Hay dos formas de cargar precios, y la segunda le gana a la primera.

### 5.1 Precio por duración

Se carga un precio para el **día**, uno para la **semana** y uno para el
**mes** — por categoría o por auto puntual.

**El precio que cargan es el del bloque completo**, no el precio por día. Si
cargan "Semanal: $150.000", eso es lo que sale la semana.

**Un alquiler se arma con los bloques más grandes primero:**

```
10 días  →  1 semana  +  3 días sueltos
40 días  →  1 mes  +  1 semana  +  3 días
```

Así el cliente que alquila más tiempo paga proporcionalmente menos, que es lo
que hace que valga la pena alquilar por semana.

### 5.2 Precios por fecha (el calendario)

Para temporada alta, feriados y promociones. Se carga una regla con su rango de
fechas y su **prioridad**.

**Las tres capas son lo mismo, con distinta prioridad:**

| Capa | Prioridad |
|---|---|
| Precio base del año | 0 |
| Feriado o temporada alta | 10 |
| Promoción | 20 |

**La de mayor prioridad gana, sin borrar la de abajo.** Eso significa que
cuando se termina la promo y la dan de baja, **el precio anterior vuelve solo**.
Es lo que permite tocar precios todas las semanas sin miedo a romper nada.

### 5.3 Descuento por alquilar más días

Un porcentaje a partir de N días. **Los seguros y extras quedan afuera del
descuento** a propósito: ese descuento es sobre el alquiler del auto, y
aplicarlo también al seguro sería regalar cobertura.

### 5.4 La pantalla de precios

Una **grilla de categorías por días del mes** con el precio de cada celda ya
resuelto. Las celdas sin precio cargado se ven en rojo, así se detecta de un
vistazo dónde falta cargar.

Y un **probador**: se ponen fechas y categoría, y muestra exactamente cuánto
paga el cliente y de dónde sale cada peso. Sin eso, entender un precio con tres
reglas superpuestas es adivinar.

### 5.5 Cómo se carga un precio, paso a paso

La grilla **no se edita tocando las celdas**. Se carga una **regla**, y la
grilla muestra el resultado. Es la diferencia entre una planilla y un sistema:
una regla se explica, se da de baja y vuelve atrás sola; 365 celdas cargadas a
mano, no.

Se hace en **Nueva regla**, abajo de la grilla:

| Campo | Qué poner |
|---|---|
| **Nombre** | Para qué es. "Temporada alta enero", "Promo 3x2 de mayo" |
| **Precio por día** | Lo que sale **un día** con esta regla |
| **Desde / Hasta** | El rango de fechas. Los dos extremos entran |
| **Categoría** o **vehículo** | Una de las dos, no las dos. Vacío = todas |
| **Canal** | **Mostrador**, **web**, o **ambos** |
| **Capa** | Tres botones. Ver abajo |
| **Es promoción** | Marca la etiqueta y el precio tachado que ve el cliente en la web |

**Lo primero que elige el formulario son tres botones**, y con eso alcanza:

| Botón | Para qué | Prioridad |
|---|---|---|
| **Precio base** | El precio de todo el año. El piso | 0 |
| **Fecha especial** | Navidad, fin de semana largo, temporada alta | 10 |
| **Promoción** | Le gana a todo y se comunica como descuento en la web | 20 |

**La de prioridad más alta que cubre el día es la que se cobra.** El número se
puede tocar a mano si hace falta, pero con los tres botones no hace falta
aprendérselo.

**Los dos usos que preguntaste, resueltos:**

- **Precios para todo el año.** Una regla del 1 de enero al 31 de diciembre,
  prioridad 0, una por categoría. Con eso la grilla deja de estar en rojo y
  todos los días tienen precio.
- **Fechas especiales.** Una regla por cada período, prioridad 10, con su
  rango. Si el período ya está cargado en **Fechas especiales**, la regla lo
  puede **heredar** en vez de repetir las fechas: se cambia la fecha en un solo
  lugar y el precio la sigue.

**Web y mostrador.** El selector de arriba de la grilla no cambia precios:
**muestra** cuánto vería un cliente por cada canal. Si quieren que la web tenga
otro precio que el mostrador, se cargan **dos reglas iguales con canal
distinto**. Si cargan una sola con canal "ambos", los dos ven lo mismo.

**Lo que hay hoy.** La grilla muestra $85.000 parejo todo el mes porque **no
hay ninguna regla cargada todavía** — ese número sale de la tarifa por duración
de demostración, que es el piso al que cae el sistema cuando ninguna regla
cubre el día. Apenas carguen la primera regla, esos días pasan a mostrar el
precio de la regla.

---

## 6. El contrato

El contrato replica el modelo que nos pasaron, con **el nombre de Ubicar Rent
en lugar del de la otra empresa**.

### Cómo funciona

**Frente:** la liquidación de ese alquiler. Se llena solo con los datos del
sistema —cliente, conductor, auto, fechas, kilómetros, cargos, seguros,
franquicia— y **se puede corregir** antes de emitirlo.

**Dorso:** las 13 cláusulas legales, iguales para todos.

### Cuándo se emite

**Apenas se acuerda el alquiler**, sin esperar a la entrega. Antes había que
esperar al check-out, o sea al momento con menos tiempo de todos: el cliente
esperando en la puerta y el auto listo para salir.

Emitirlo antes tiene tres ventajas concretas: hay tiempo de leerlo, de corregir
un dato mal cargado, y de mandárselo al cliente para que lo lea tranquilo.

Si se emite antes de la entrega, **el kilometraje y el combustible de salida
salen como líneas en blanco** para completar a mano el día del retiro. Es a
propósito: inventar un kilometraje de salida sería peor que dejarlo vacío,
porque es justamente el dato que después hay que poder oponer.

### El flujo

1. **El sistema arma el frente solo**, con los datos de la reserva ya cargados.
2. **Se corrige lo que haga falta** — todo el frente es editable.
3. **Se genera.** Recibe su número (`C-00000042`) y queda congelado.
4. **Se firma.** Hay dos maneras y las dos valen:
   - **En pantalla**: aparece un recuadro en blanco y el cliente firma ahí con
     el dedo o con el mouse. Esa firma queda estampada dentro del PDF, sobre la
     línea de firma. **Funciona igual desde el celular** — está probado en
     iPhone: el recuadro se adapta a la pantalla y el trazo con el dedo cae
     donde tiene que caer.
   - **En papel**, si prefieren seguir como siempre: se descarga el PDF, se
     imprime, el cliente firma con lapicera, y en el sistema se aprieta
     **"Firmó en papel" → "Marcar como firmado"**. Ahí se registra el nombre y
     el documento de quien firmó.
5. **Se descarga el PDF** de dos páginas para archivarlo o mandárselo.

En los dos casos el sistema guarda **quién firmó y con qué documento**, que
puede no ser el titular de la reserva — el caso típico es una empresa que
reserva y manda a un empleado a retirar el auto.

**El sistema distingue las dos formas.** Si se firmó en papel, la reimpresión
lo dice con todas las letras: *"Firmado de puño y letra el 28/07/2026. El
ejemplar firmado se archiva en papel"*. Sin eso, un contrato firmado con
lapicera y uno marcado por error se verían idénticos.

### Siempre se ve cuáles faltan

En el listado de reservas cada una muestra su estado: **SIN CONTRATO**,
**SIN FIRMAR**, o nada si ya está firmado. Y hay una pantalla de **Contratos**
en el menú que los agrupa por lo que hay que hacer: los que falta emitir, los
emitidos sin firmar, y los que ya están.

Las reservas canceladas no muestran nada, porque no necesitan contrato. Una
lista llena de avisos que nadie puede resolver se deja de mirar entera.

Si un auto sale **sin contrato**, el sistema no lo impide —a veces hay que
entregar igual— pero pide un motivo y deja la marca en rojo en el listado hasta
que se resuelva.

### Tres detalles que importan

**Un contrato viejo se reimprime igual.** Aunque el cliente se haya mudado, el
auto se haya vendido y los precios hayan cambiado tres veces, reimprimir un
contrato de hace dos años da exactamente el mismo papel. Eso es lo que lo hace
un documento serio.

**Dice "Valor Estimado", no "Total".** Cuando se firma, el auto todavía no
volvió: el atraso y los daños se liquidan al devolverlo. Poner "Total" sería
prometer un número que el propio contrato se reserva el derecho de aumentar.

**Imprime los seguros que el cliente rechazó.** Ejemplo: *"A pesar de la
explicación, el arrendatario no desea contratar: Cobertura Full"*. Eso no es
decoración: **es la prueba de que se le ofreció**. Sin esa línea, un cliente que
choca puede decir que nunca le ofrecieron nada.

### Lo que falta

Mientras no estén cargados **la razón social y el CUIT**, el PDF sale marcado
como **"DOCUMENTO PROVISORIO"**.

Es a propósito: un CUIT inventado en un contrato es peor que un espacio en
blanco. El blanco se nota y se completa; el relleno se firma sin que nadie lo
vea.

---

## 7. La plata: caja, echeqs, recibos y facturas

### Caja del día

Ingresos y egresos de una fecha, con el total desglosado **por medio de pago** y
el detalle de cada cobro y cada gasto.

### Recibos

**Emitir un recibo registra el cobro.** Suma a la caja del día y baja el saldo
del cliente. No hace falta cargar el pago por separado.

Numeración correlativa propia (`R-00000042`). El PDF incluye el logo, el monto
**en letras**, el concepto, el medio de pago y la barra de *saldo anterior →
este pago → saldo actual*, que es lo que el cliente quiere ver.

**El recibo no se genera solo, y es a propósito**: emitirlo es una decisión de
ustedes, no algo que el sistema haga por su cuenta. Pero no cuesta nada: en el
listado de **Cobros**, los que todavía no tienen recibo muestran un botón
**Emitir**. Un click y listo — el concepto lo arma el sistema con los datos del
cobro (*"Alquiler #16 — Toyota Hilux DX (AF977FD)"*).

Antes había que escribir ese concepto a mano cada vez, y eso era exactamente lo
que hacía que el recibo terminara sin emitirse.

Si un cobro ya está registrado, se le puede emitir el recibo después sin que el
saldo se mueva.

Anular un recibo pide motivo. Anula **el papel**, no el cobro.

### Echeqs

Un echeq que entra **genera el crédito automático** en la cuenta del cliente.

```
Entra el echeq   →  EN CARTERA  →  crédito en su cuenta
                        ├─ Se deposita → se cobra
                        ├─ Se endosa   → sale de cartera
                        └─ REBOTA      → vuelve la deuda + aviso urgente
```

**El rebote es el caso que más plata cuesta** y ahora está contemplado: exige
escribir el motivo, revierte el crédito y dispara un aviso.

### Facturas y notas

Se cargan las facturas que emiten por fuera del sistema, con su PDF adjunto.

**Sólo las notas de crédito y débito mueven la cuenta corriente.** Las facturas
sólo documentan algo que el sistema ya facturó al entregar el auto; generarles
un segundo movimiento duplicaría la deuda.

---

## 8. Multas y daños

### Multas

Se carga la multa con patente, fecha, hora, monto, **fecha de vencimiento** y
el PDF.

**El buscador encuentra solo quién manejaba.** Con la patente, la fecha y la
hora, el sistema dice qué alquiler estaba vigente y quién era el conductor —
incluido el conductor designado, que puede no ser el titular.

**Se resuelve con dos salidas, nunca tres:**
- **Cobrada** → genera el crédito.
- **Bonificada** (se le perdona) → anula la deuda, **con motivo obligatorio**.

El sistema avisa cuando una multa está por vencer y cuando ya venció.

### Daños

**El daño le pertenece al auto, no al alquiler.** Por eso los daños no
reparados sobreviven al cierre del alquiler y aparecen precargados en la
próxima entrega.

Se carga zona, tipo, gravedad, costo estimado y **fotos**.

**Detectar no es cobrar.** Registrar un daño no mueve un peso. El responsable
arranca sin definir y **lo decide una persona**. Recién ahí:

- **Imputar** → genera la deuda, con **monto editable**. Puede ser menor al
  costo del taller: el costo es un dato, la imputación es una decisión
  comercial.
- **Bonificar** → la anula, con motivo.

---

## 9. El sistema les avisa solo

Todos los días **a las 8 de la mañana** el sistema revisa la base entera y
genera los avisos. Aparecen en la campana del menú y llegan por mail.

Se pueden marcar como leídos, posponer o descartar. Y **se cierran solos**
cuando el problema se resuelve.

**Los urgentes van primero.** Antes se ordenaban sólo por fecha, así que un
aviso crítico de ayer quedaba debajo de uno menor de hoy — y la campana muestra
los primeros. Ahora manda la urgencia y después la fecha.

Se pueden filtrar por familia y por urgencia desde la pantalla de
**Notificaciones**.

**35 avisos**, agrupados en seis familias:

**La mañana** — entregas de hoy · devoluciones de hoy · autos que tenían que
salir y no salieron · autos que tenían que volver y no volvieron · entregas de
hoy sin contrato firmado · reservas sin confirmar hace más de un día.

**La plata** — echeqs por cobrarse, que vencen hoy, sin acreditar o rebotados ·
vencimientos de cuenta corriente próximos y vencidos · clientes que pasaron su
límite de crédito · alquileres cerrados con saldo pendiente · garantías sin
resolver · facturas pendientes de emitir.

**La flota** — VTV por vencer · póliza por vencer · otros papeles del auto ·
service por kilómetros · service por fecha · licencias de clientes por vencer ·
licencia vencida con reserva futura · autos hace mucho fuera de servicio.

**Las multas** — sin imputar · imputadas sin cobrar hace 15 días · por vencer ·
vencidas.

**Las reservas web** — solicitudes sin atender. Y cuando entra una reserva por
la web, el aviso llega **en el momento**, no en el resumen de la mañana: una
reserva del sábado a la tarde no puede esperar hasta el lunes.

**📌 Falta completar** — la familia nueva, y la que más plata puede ahorrar.
Las otras cinco miran **hechos**: un echeq rebotó, un auto no volvió. Esta mira
**huecos**: cosas que nadie cargó y que no molestan hasta que ya es tarde.

| Aviso | Qué pasa si no se resuelve |
|---|---|
| **Fecha especial sin precio** | Se cargó "Navidad" en el calendario pero no su tarifa: **se vende al precio de un martes cualquiera**. No aparece en ningún reporte porque no hubo ningún error — se cobró exactamente lo que estaba configurado. Avisa con 30 días |
| **Categoría con autos pero sin precio** | La web la muestra como *sin disponibilidad* aunque haya unidades libres. Desde afuera parece que no hay autos, no que falta un dato |
| **Vehículo sin categoría** | No aparece en la web ni se puede cotizar: existe en la flota pero es invisible para vender |
| **Contrato sin emitir** | El auto está afuera y no hay ningún contrato. Es el peor escenario si aparece un daño o una multa |
| **Faltan los datos de la empresa** | Todo contrato sale marcado "DOCUMENTO PROVISORIO" |

Todos se resuelven solos en cuanto se carga el dato. Nadie tiene que acordarse
de descartarlos.

---

## 10. La página web

### Lo que ya hay

La web tiene el **sistema de reservas online completo**, en cuatro pasos:

1. **Dónde y cuándo** → muestra las categorías disponibles con foto, precio
   total y precio por día.
2. **Seguros y extras** → con la franquicia de cada cobertura explicada.
3. **Datos del cliente**.
4. **Cuánto adelanta** → 30%, 50% o 100%.

Tres cosas que hace bien:

- **Reserva el auto mientras el cliente completa.** Cuando elige el vehículo,
  el sistema le guarda el cupo por 20 minutos, con un reloj a la vista. Sin
  eso, dos personas pueden comprar la última unidad.
- **Las categorías sin disponibilidad se muestran igual**, con un botón para
  dejar los datos. Esa solicitud entra en la bandeja del sistema y **dispara un
  aviso en el momento**. Esconderlas perdería el contacto de alguien que quería
  alquilar.
- **El precio total está siempre a la vista** y es siempre el mismo número. Un
  total que aparece recién al final es lo que más hace abandonar una compra.

### La bandeja de reservas web

En el sistema hay una pantalla donde entran las reservas que llegan por la web,
ordenadas por dónde hay plata del cliente en juego. Se acepta (asignándole un
auto concreto) o se rechaza con motivo.

### El cobro con tarjeta

**Ya está construido.** El cliente elige cuánto adelanta, va a Mercado Pago,
paga, y la reserva queda confirmada sola. Falta sólo pegar las credenciales de
la cuenta de Mercado Pago: hasta que estén, el último paso sigue mostrando el
resumen y cerrando el pago a mano — **no se simula un cobro que no existe**.
La web se da cuenta sola de cuál de los dos casos mostrar.

Cuatro cosas que hace, y que son las que evitan perder plata:

- **Manda la reserva por confirmada recién cuando Mercado Pago confirma el
  pago**, no cuando el cliente vuelve a la página. Si cierra la pestaña
  apenas paga, la reserva se confirma igual.
- **No cobra dos veces.** Mercado Pago avisa el mismo pago varias veces —es
  normal, no es una falla—, y sin esta protección un pago generaría dos
  movimientos en la cuenta corriente. Está probado.
- **Vuelve a chequear que quede auto justo antes de confirmar.** Entre que el
  cliente empieza a pagar y el pago se acredita pueden pasar 40 minutos.
- **Nunca le cree al navegador cuánto se pagó.** El importe se compara contra
  lo que se le pidió a Mercado Pago; si no coincide, la reserva no se confirma
  y salta un aviso.

**Si alguien paga y para ese momento ya no queda auto**, el sistema *no*
devuelve la plata solo ni rechaza el pago: deja la reserva marcada para
resolver y manda un aviso rojo, en la campana y por mail. Casi siempre hay un
auto de otra categoría y el cliente prefiere eso a que le devuelvan la plata —
esa conversación la tiene que tener una persona, no un programa.

### Los avisos por mail

Cuando entra una reserva pagada salen **dos mails en el momento**: uno al
equipo con los datos para atenderla, y uno al cliente confirmándole lo que
pagó y lo que le queda por pagar. A qué casilla llega el aviso del equipo se
configura desde la pantalla de Configuración, sin tocar el sistema.

---

## 11. Decisiones que tomamos sin ustedes (y por qué)

Estas se tomaron para poder avanzar. Son razonables, están implementadas y
**funcionan** — pero cambian cómo se ve la plata del negocio, así que vale que
las revisen.

| Decisión | Qué se hizo | Por qué |
|---|---|---|
| **Cuenta corriente de todo** | Todo alquiler genera deuda, todo cobro la cancela | Es el único modo de tener el historial completo de cada cliente ([§3](#3-la-cuenta-corriente-el-cambio-más-importante)) |
| **Multas en la misma cuenta** | Una multa imputada suma a la deuda del cliente | Es coherente con lo anterior. Si prefieren llevarlas aparte, se cambia |
| **Garantías fuera de la cuenta** | El depósito no genera movimiento | Es un depósito que se devuelve, no una venta |
| **Combustible y limpieza no se le cobran al cliente** | Van como gasto del auto | Es donde impactan de verdad en la rentabilidad de la unidad |
| **Sin edad mínima** | La edad **recarga el precio**, no rechaza al cliente | Rechazar pierde la venta entera; recargar la conserva y cubre el riesgo. Es como operan las grandes |
| **Sin descuento por pronto pago en multas** | Sólo se carga monto y vencimiento | Mantener plazos y porcentajes que cambian por jurisdicción y por año es mucha estructura para un beneficio que el que paga ya conoce |
| **Recibos simples** | Un medio de pago por recibo, sin imputar a deudas puntuales | Es como ya funcionan los pagos y los echeqs. Si en la práctica hace falta más, se extiende |
| **Sin sucursales** | Todo es Bahía Blanca | No hay dos ciudades que coordinar, así que modelarlas sería estructura sin uso |
| **Kilometraje libre** | Sin límite ni cargo por kilómetro | Es una ventaja comercial y simplifica todo |

---

## 12. Lo que falta, y qué depende de ustedes

> ### 📄 Los cuatro datos fiscales que faltan
>
> Verificado en el sistema en producción. **Cada contrato que se emite sale con
> la leyenda "DOCUMENTO PROVISORIO"** hasta que estén los cuatro:
>
> | Falta | |
> |---|---|
> | **Razón social** | El nombre exacto como figura en AFIP |
> | **CUIT** | |
> | **Ingresos Brutos** | Número de inscripción |
> | **Domicilio fiscal** | |
>
> Ya están cargados el nombre del locador, la localidad, la jurisdicción, los
> teléfonos y el mail. Faltan sólo esos cuatro.
>
> Y detrás hay una decisión: **¿el contrato va a nombre de Ubicar Rent como
> empresa, o de una persona física?** De eso depende qué se escribe ahí.

### Lo que necesitamos que ustedes carguen

Sin esto la web no puede vender, aunque el sistema esté entero. Va en este
orden, porque cada cosa depende de la anterior:

1. **La razón social y el CUIT de Ubicar.** Mientras falten, cada contrato que
   se emita sale marcado "DOCUMENTO PROVISORIO".
2. **Las fotos y los datos de cada categoría** (cuántos pasajeros, cuántas
   valijas, si es automático). Las tarjetas de la web salen grises sin eso.
3. **Los precios por categoría.** Hoy sólo hay precios cargados para tres autos
   puntuales, así que la web no encuentra con qué cotizar una categoría.
4. **La categoría de cada auto.** Un auto sin categoría no aparece en la web ni
   se puede cotizar.
5. **Los seguros y extras** con su precio y su franquicia.
6. **Las franjas de recargo por edad**, si quieren usarlas.
7. **El precio de las fechas especiales** ya cargadas en el calendario.

> **No hace falta acordarse de nada de esto.** El sistema lo reclama solo: los
> avisos de la familia **"📌 Falta completar"** detectan cada hueco y
> desaparecen en cuanto se carga el dato. Cuando esa familia quede vacía en la
> campana, está todo listo.

### Lo que necesitamos que ustedes decidan

| Pregunta | Para qué |
|---|---|
| **¿A nombre de quién va el contrato?** Nombre exacto, CUIT, ingresos brutos, domicilio fiscal | Sin esto el contrato sale como "provisorio" |
| **¿Cuánto es la franquicia?** | Va en el contrato y en la web |
| **¿En qué horarios se entrega y se devuelve?** | La web tiene que ofrecer sólo horarios reales |
| **¿Se alquila también en Capital Federal por la web?** Y si sí, ¿la flota es la misma? | Hoy la web vende sólo Bahía Blanca |
| **¿Qué descuento por pagar el 100% adelantado?** | Ya está la casilla para cargarlo, en Configuración. Hoy está en 0: sin descuento |
| **¿A qué mail llegan los avisos de reservas web?** | Ya está la casilla en Configuración. Vacía, llegan al mismo lugar que el resumen de las 08:00 |
| **¿La seña se pierde si el cliente no aparece?** | Es la única contradicción abierta. Ver el recuadro |

> ### ⚠️ La seña: hay que decidir esto antes de publicar la web
>
> Nos dijeron dos cosas que juntas no cierran. Por un lado, que **al cancelar
> se retiene la seña**. Por el otro, que **la seña no se pierde si el cliente
> no aparece**.
>
> Combinadas, la política queda así: **al que avisa que no viene se le retiene
> la seña; al que no avisa nada, se le devuelve.** Eso premia exactamente el
> peor comportamiento. Y cuesta plata de forma concreta: **el auto que se
> libera con 48 horas de aviso se vuelve a vender; el que se libera porque
> nadie apareció, no.**
>
> **Lo que recomendamos:** la seña **no se pierde si avisa con 48 horas de
> anticipación**, y **se retiene si avisa tarde o no avisa**. Alinea lo que
> le conviene al cliente con lo que el negocio necesita, que es enterarse a
> tiempo.
>
> Hay que cerrarlo antes de publicar los términos y condiciones, porque es la
> cláusula que más se lee y la que más reclamos genera.

### El sistema ya está en línea

**Desde el 29 de julio el sistema funciona en internet**, no sólo en la
computadora del desarrollador:

- **El sistema de gestión** entra desde cualquier navegador, con usuario y
  contraseña reales
- **La base de datos** está en un servidor, con respaldo
- **Los avisos por mail** salen de verdad

Eso significa que Franco, Martín y Ramiro pueden usarlo desde donde estén, cada
uno con su cuenta, y **cada acción queda registrada con el nombre de quien la
hizo**.

### Lo que todavía depende de servicios externos

Todo el resto del sistema está terminado y probado. En cada caso el programa ya
está escrito: falta crear la cuenta o cargar un dato.

- **Cobro con tarjeta online** — Mercado Pago. Construido y probado; falta
  sacar las credenciales de la cuenta de la empresa.
- **Avisos por mail** — ✅ **funcionando**.
  > ⚠️ **Falta un paso de ustedes**: hoy los mails salen desde una dirección
  > de prueba que **sólo puede escribirle a la casilla de Ubicar**. Para que la
  > confirmación le llegue a un cliente hay que registrar el dominio propio.
  > **No es crear casillas de correo ni pagar nada**: son tres registros en la
  > configuración del dominio. Si un cliente responde, esa respuesta se
  > redirige al Gmail que ya usan.
- **Guardado de archivos** — falta contratar el espacio. Sin eso, los
  documentos escaneados, las fotos de daños y las firmas **se pierden cada vez
  que se actualiza el sistema**. Es lo más urgente de esta lista después de
  Mercado Pago.
- **La web pública** — funciona completa, pero todavía se muestra desde una
  computadora. Publicarla es un paso de configuración.

---

## 13. Trabajar de a varios

El sistema está pensado para que **tres personas lo usen al mismo tiempo** sobre
los mismos datos, y eso trae problemas que no existen cuando lo usa uno solo.

**Dos personas no pueden reservar el mismo auto.** Si dos confirman la misma
unidad en el mismo instante, el sistema deja pasar una y a la otra le avisa que
el auto ya está ocupado. Suena obvio, pero antes pasaban las dos: cada una
miraba la disponibilidad, veía el auto libre, y grababa. El problema recién
aparecía el día de la entrega. Se reprodujo el caso y se cerró.

**Las pantallas se ponen al día solas.** Lo que cambia seguido —reservas,
disponibilidad, caja, avisos— se actualiza cada 15 segundos y **al volver a la
pestaña**, que es justo cuando alguien va a hacer algo con lo que tiene en
pantalla. Lo que casi no cambia —categorías, precios, configuración— se guarda
más tiempo para no hacer trabajar de más al servidor.

**Los números correlativos no se repiten.** Recibos, contratos y comprobantes
piden su número a la base de datos, no lo calculan sumando uno al último. Con
dos personas emitiendo a la vez, calcularlo daría el mismo número dos veces.

**Un auto que está afuera no se puede dar de baja por accidente.** Si tiene
reservas sin cerrar, el sistema frena y muestra cuáles son. Se puede hacer
igual, pero confirmando a sabiendas.

### Quién hizo qué — la pantalla de Auditoría

En **Configuración → Auditoría** queda registrado, con nombre y hora, todo lo
que alguien hace y **no deja rastro en ninguna otra pantalla**:

| Se registra | Por qué esa y no otras |
|---|---|
| **Anular un movimiento** de cuenta corriente | El movimiento sigue ahí, pero nadie sabría quién lo dio de baja |
| **Eliminar un cobro** | Es el único borrado real que quedó en el sistema: después no queda fila que consultar |
| **Cancelar una reserva** | Con el motivo y la seña que se retuvo |
| **Perdonar un excedente** | Es regalar plata de la empresa, y lo decide una persona en el mostrador |
| **Cargar una reserva por debajo del precio de lista** | Con el motivo y la diferencia exacta |
| **Tocar un precio** — crear, editar o dar de baja una regla o un descuento | Un precio mal cargado no rompe nada: factura mal en silencio |
| **Correr un vencimiento** de cuenta corriente | Con el motivo |
| **Cada débito y cada crédito** del ledger | Es el libro completo de la plata |

Se puede filtrar por persona, por tipo de acción, por fecha o buscando texto,
y cada línea se abre para ver **qué decía antes y qué quedó después**.

**No se puede editar ni borrar desde ahí.** Un libro que se corrige no sirve
para auditar. Si algo está mal, se corrige compensando —regla 2.5— y quedan
las dos cosas registradas.

> Hasta ahora todos entraban con el mismo usuario de prueba, así que este
> registro no distinguía a nadie. Con las cuentas de Franco, Martín y Ramiro
> creadas, cada línea dice quién fue.

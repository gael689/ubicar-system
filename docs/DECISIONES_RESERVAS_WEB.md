# Decisiones — Reservas web y Mercado Pago

> **Actualizado el 2026-07-28** con las respuestas del usuario.
>
> De las 10 preguntas originales, **5 quedaron cerradas**, **4 siguen abiertas
> pero mejor planteadas** (con la postura del usuario ya escrita, para validar
> con Franco y Martín) y **1 se convirtió en un plan aparte**.
>
> Las decisiones cerradas ya viven en `docs/DECISIONES.md` con su número. Acá
> queda el razonamiento completo y lo que falta responder.
>
> Contexto técnico en `docs/PLAN_RESERVAS_WEB.md`.

---

## Estado de las 10

| # | Tema | Estado |
|---|---|---|
| 1 | Cuánto se cobra por adelantado | ✅ **Cerrada** → D-30 |
| 2 | Anticipación mínima y horarios | 🟡 **Abierta** → D-36 |
| 3 | ¿Confirma sola o la acepta una persona? | ✅ **Ya estaba cerrada** → D-04 (reconfirmada) |
| 4 | Pago aprobado pero sin cupo | 🟡 **Abierta**, con postura clara |
| 5 | Devoluciones | 🟡 **Abierta**, con postura clara |
| 6 | Por dónde avisa | ✅ **Cerrada** → D-32 |
| 7 | Garantía online | 🟡 **Abierta** → D-37 |
| 8 | Qué categorías se publican | ✅ **Cerrada** → D-31. Y su bloqueante (las categorías de los 9 autos) también → D-29 |
| 9 | Datos de licencia en el paso 3 | ✅ **Cerrada** — con recomendación pedida y dada |
| 10 | Textos legales | 📄 **Convertida en plan** → `docs/PLAN_TEXTOS_LEGALES.md` |

**Ya no queda ninguna decisión bloqueando la construcción.** Las 4 abiertas
tienen postura definida y default seguro; se pueden validar mientras se
programa.

---

## ✅ 1. Cuánto se cobra por adelantado — CERRADA (D-30)

> *"Se cobra por adelantado, un 30% pero hasta más: si el cliente quiere pagar
> el 50 puede, lo mismo si quiere pagar el 100. Si paga el 100, podríamos
> pensar en ofrecerle descuento automático, que lo puedan configurar los
> dueños."*

**El cliente elige cuánto adelanta, con un piso del 30%.** Tres botones en el
paso 3: **30% · 50% · 100%**, con el monto de cada uno calculado a la vista.

**Si elige el 100%, se le aplica un descuento configurable por los dueños.** El
porcentaje va a `configuracion`, no al código: es una palanca comercial que van
a querer mover según la temporada, y cambiarla no puede requerir un deploy.

Por qué el descuento tiene sentido acá y no es regalar plata: cobrar el 100%
por adelantado elimina la cobranza en el mostrador, elimina el incobrable, y
adelanta el flujo de caja. Es exactamente el tipo de cosa por la que vale la
pena resignar unos puntos de margen.

**Cómo se ve en el sistema:** una reserva pagada al 100% entra con
`estado_pago='pagado'`; una con seña entra como `'anticipo'` y el saldo se
cobra al check-out por el camino que ya existe (débito en CC + cobro). No hace
falta lógica nueva de cobranza.

### ✅ La seña no se reintegra (D-11)

La frase *"la seña no se pierde si el cliente no aparece"* significaba que **no
se pierde para el negocio**: Ubicar la retiene. Aclarado por el usuario en la
misma sesión, así que no había contradicción con D-11 sino un malentendido de
lectura.

La política, entonces, es una sola: **la seña no se reintegra**, ni por
cancelación del cliente ni por no presentarse. Cancelación tardía y no-show
reciben el mismo trato — para el negocio son el mismo hecho: un auto que quedó
sin alquilar y sin tiempo de revenderse.

**La excepción, escrita como tal en los términos:** si el que no puede cumplir
es Ubicar Rent, se ofrece otro vehículo equivalente sin costo o se reintegra el
100%.

Está en los tres lugares que tienen que decir lo mismo: los T&C de la web (§4),
`ReservaService.cancelar()` y el manual de los dueños (§11).

---

## 🟡 2. Anticipación mínima y horarios de entrega — ABIERTA (D-36)

Si alguien reserva a las 23:50 para retirar a las 8:00 del día siguiente, ¿el
auto está preparado? ¿Hay alguien en el mostrador?

> **Recomendación: mínimo 24 horas de anticipación** para reservas web. Menos
> que eso, la web muestra el WhatsApp — que es el canal que hoy funciona y
> permite coordinar a mano. Es la opción que no promete lo que no se puede
> cumplir.

**Lo que hace falta definir, y es tan importante como el número:**

**¿En qué horarios se entrega?** Hoy los cuatro puntos de retiro (Paraguay 241,
Alsina 350, Juan Francisco Seguí 3607 y el Aeropuerto Comandante Espora) están
cargados como **chips de texto en la reserva** (D-10), sin horarios asociados
en ningún lado. Si la web deja elegir "retiro 3:00 AM", alguien tiene que ir.

Tres sub-preguntas concretas:
1. **¿Cuál es la franja horaria de entrega y devolución?** ¿Es la misma todos
   los días? ¿Sábados y domingos?
2. **¿El aeropuerto tiene horario propio?** Es el único punto donde el horario
   lo manda el vuelo, no la oficina.
3. **¿Se entrega fuera de horario con un cargo?** Es una fuente de ingreso real
   y la mayoría de las rentadoras lo cobran.

**Cómo se implementa cuando haya respuesta:** una franja horaria por punto de
retiro en `configuracion`, y el paso 1 de la web sólo ofrece horas dentro de
ella. **No hace falta modelar sucursales** (descartadas, ítem 55): es un
horario por chip, no una entidad nueva.

**Default seguro mientras tanto:** 24 horas de anticipación y franja 08:00-20:00
todos los días. Se puede programar con eso y ajustar los números después sin
tocar código.

---

## ✅ 3. ¿Confirma sola o la acepta una persona? — YA ESTABA CERRADA (D-04)

> *"Yo me imagino que si hay vehículo de esta categoría disponible para la fecha
> seleccionada, se va a poder confirmar; a menos que ocurra un problema, si
> pasa esto se ofrece otro vehículo, o se devuelve el dinero. Esta es mi idea
> principal, casi definida, falta validación."*

**Esa idea ya es la decisión D-04 de `docs/DECISIONES.md`, confirmada hace
tiempo.** Coincide punto por punto.

**Error de este documento, que corresponde corregir:** la versión original de
esta pregunta recomendaba **lo contrario** (confirmación manual al principio,
híbrida después) sin advertir que D-04 ya existía. Esa recomendación **queda
descartada**.

Lo que D-04 dice, y que es lo que se construye:

- **Con cupo en esa categoría y esas fechas** → el cliente paga y la reserva
  **se auto-confirma**. Notificación al equipo, sin acción requerida.
- **Sin cupo** → se le permite dejar la solicitud **sin pagar**, en estado
  `SIN_DISPONIBILIDAD`. Alerta de urgencia alta, y el equipo lo contacta para
  ofrecer otra categoría, otras fechas, o conseguir la unidad.

Lo valioso de la segunda rama: **convierte en contacto una consulta que hoy se
pierde**, y mide la demanda insatisfecha por categoría — que es el dato que
dice qué auto conviene comprar.

**Lo que sigue necesitando validación de Franco y Martín** (esto sí es nuevo):
¿hay algún caso que **no** quieran que se auto-confirme aunque haya cupo?
Los candidatos habituales son: cliente con deuda vencida, alquiler de más de
15 días, o pick-up. Si la respuesta es "ninguno", D-04 queda tal cual.

---

## 🟡 4. Pago aprobado pero ya no hay cupo — ABIERTA, con postura

Es el caso feo y **va a pasar**: el hold expira mientras el cliente carga la
tarjeta, entra otro y se lleva la última unidad.

> *"La idea es ofrecerle otro vehículo."*

**Esa es la postura, y es la correcta.** Casi siempre hay una salida mejor que
la devolución: el cliente quiere un auto, no su plata de vuelta.

**Lo que hay que definir para poder programarlo:**

1. **¿Se ofrece automáticamente o lo hace una persona?** Recomiendo **persona**:
   la reserva queda en un estado propio (`REVISION_SIN_CUPO`), se dispara una
   notificación **crítica**, y alguien resuelve. Ofrecer un upgrade automático
   puede regalar una pick-up al precio de un compacto.
2. **Si la alternativa es de categoría superior, ¿se cobra la diferencia?**
   Recomiendo **no**: el error fue del sistema, no del cliente. Es el costo de
   haber sobrevendido, y es barato comparado con el reclamo.
3. **Si no acepta ninguna alternativa** → devolución (ver #5).

**Cómo se evita que pase seguido:** los **holds con expiración** (ítem 61) son
la defensa real. El cupo queda tomado mientras el cliente completa el pago. Con
un hold de 20 minutos esto pasa sólo si el pago demora más que eso, que es raro.

---

## 🟡 5. Devoluciones — ABIERTA, con postura

Si se rechaza o se cae una reserva ya cobrada, hay que devolver la plata. El
sistema sabe registrar cobros pero **no tiene el concepto de devolución al
cliente**.

> *"La opción de Mercado Pago de devoluciones me gusta."*

**Postura: refund por la API de Mercado Pago.** Es lo correcto: la plata vuelve
por donde vino, sin pedirle un CBU al cliente ni depender de que alguien haga
una transferencia.

**Lo que falta definir:**

1. **¿Se devuelve el 100% siempre?** Recomiendo que sí cuando la culpa es del
   negocio (sin cupo, rechazo nuestro). Cuando cancela el cliente, se rige por
   la política de seña (D-11, pendiente).
2. **¿Quién puede autorizarla?** Hoy no hay roles reales — es Clerk (Fase 3.5).
   Mientras tanto, **motivo obligatorio** y queda registrado quién la hizo.
3. **Cómo entra al ledger:** un **contra-asiento**, nunca un borrado. Mismo
   patrón que la anulación de pagos y la bonificación de multas.

**Lo que hay que construir igual, sea cual sea la respuesta:** el concepto de
devolución como entidad (monto, motivo, quién, cuándo, referencia de MP,
asiento generado). Hoy no existe y es un hueco del modelo, no sólo de la web:
también hace falta para devolver una garantía o corregir un cobro de más.

---

## ✅ 6. Por dónde avisa que entró una reserva web — CERRADA (D-32)

> *"In-app, y Resend está bien."*

**Campana in-app + email inmediato por Resend.** Los dos canales ya existen; lo
único nuevo es mandar **este** mail fuera del digest de las 08:00, porque una
reserva web que espera hasta mañana a la mañana es una venta que se cae.

WhatsApp queda afuera, consistente con D-06.

**Sub-pregunta abierta (D-32b): ¿a qué casilla?** ¿A Franco y Martín por
separado, o a una casilla de la empresa? Recomiendo **una casilla de la empresa
con reenvío a los dos**: si mañana entra alguien más al equipo no hay que tocar
la configuración, y si uno se va de vacaciones el mail no queda sin leer.

---

## 🟡 7. ¿Se pide garantía en la reserva web? — ABIERTA (D-37)

> *"No. Las garantías creo que serían otras, dejalo también como duda planteada.
> Podemos analizar qué hacen otras páginas también."*

**En el mostrador** se toma garantía en efectivo o con tarjeta
(`garantia_tipo`, `garantia_monto`, y los datos de tarjeta en la reserva).
**Online eso no se puede replicar**: retener un monto en una tarjeta requiere
una **pre-autorización**, y **Checkout Pro de Mercado Pago no la hace**.

**Qué hacen las demás, para tener el mapa:**

| Enfoque | Quién lo usa | Cómo funciona |
|---|---|---|
| **Sin garantía online** | La mayoría de las rentadoras locales | Se toma al retirar, como ahora. Fricción cero online |
| **Pre-autorización con tarjeta** | Las internacionales (Hertz, Avis, Sixt) | Congela un monto en la tarjeta. Requiere pasarela con pre-auth — **no Checkout Pro** |
| **Seguro/cobertura en vez de garantía** | Tendencia creciente | El cliente compra una cobertura que reduce la franquicia. **Ubicar ya tiene esto**: son los adicionales tipo `cobertura` |
| **Garantía como cargo reembolsable** | Algunas plataformas | Se cobra de verdad y se devuelve. Malo: el cliente ve un cargo grande y abandona |

**Recomendación: no pedir garantía online.** Por dos motivos concretos:

1. **Técnico** — Checkout Pro no hace pre-autorización. Implementarla obliga a
   otra integración (Mercado Pago tiene pre-auth por API directa, no por
   Checkout Pro) y a manejar la liberación del monto.
2. **De conversión** — el paso 3 es donde el cliente abandona. Sumarle "vamos a
   congelar $2.620.000 de tu tarjeta" justo ahí es el peor lugar posible.

**Lo que sí conviene hacer, y es más útil:** que el paso 2 **venda la
cobertura**. Ubicar ya tiene los adicionales tipo `cobertura` con su
`franquicia` como campo propio. Explicar ahí "sin cobertura tu responsabilidad
es de $X; con la cobertura full es $Y" convierte la garantía de un obstáculo en
una venta. Es la tendencia del rubro y ya está construido.

**Y la garantía se sigue tomando al retirar**, como ahora — el contrato ya la
contempla.

---

## ✅ 8. Qué categorías se publican — CERRADA (D-31 y D-29)

> *"Siempre tienen que aparecer TODAS. Estén o no estén disponibles."*

**Ninguna categoría se oculta.** La que no tiene cupo para las fechas elegidas
se muestra igual —foto, specs, precio de referencia— y en vez del botón de
reservar ofrece dejar los datos, que es el flujo `SIN_DISPONIBILIDAD` de D-04.

Esconder una categoría sin cupo pierde dos cosas a la vez: el contacto de
alguien que quería alquilar, y la información de que esa categoría se agota.

**El bloqueante de esta pregunta también se cayó:** los 9 autos sin categoría
ya están asignados (D-29). La flota queda **1 compacto · 7 sedán · 1 sedán
superior · 7 pick-up**.

**Consecuencia comercial a tener presente:** con **una sola unidad** de compacto
y **una sola** de sedán superior, esas dos categorías van a mostrar "sin
disponibilidad" muy seguido. Conviene que esa ficha no sea un cartel de "no"
sino un desvío: *"Sin disponibilidad para estas fechas — mirá Sedán, que tiene
7 unidades"*.

`Categoria.visible_web` se mantiene como **decisión editorial manual** (sacar
algo de la web a propósito), nunca como consecuencia automática del cupo.

---

## ✅ 9. ¿Se piden los datos de la licencia en el paso 3? — CERRADA

> *"¿Qué opinás, los pedimos? ¿O los pedimos una vez confirmada la reserva?"*

**Recomendación: pedir sólo la fecha de nacimiento en el paso 3. El resto de
la licencia, después de confirmar.**

El razonamiento es que los dos datos no son equivalentes:

**La fecha de nacimiento es un impedimento absoluto.** Si el cliente tiene 19
años y la política exige 21, esa reserva **no se puede cumplir de ninguna
manera**. Cobrarle y avisarle después es garantizar un conflicto en el
mostrador y una devolución. Es **un solo campo**, un selector de fecha, y
evita el peor escenario posible.

**El vencimiento y el número de licencia son un problema resoluble.** Si la
licencia vence dentro de la ventana del alquiler, el cliente todavía tiene
tiempo de renovarla. Pedirlo antes de cobrar no evita nada que no se pueda
arreglar, y **cada campo extra en el paso de pago baja la conversión**.

**Cómo se pide el resto:** en el mail de confirmación va un link a "completá
tus datos", y el paso queda registrado. El que no lo completa igual retira el
auto: los datos se cargan en el mostrador como hoy. No es un bloqueo, es
adelantar trabajo.

**Lo que hace falta para que esto funcione: la edad mínima.** Los campos
`fecha_nacimiento`, `licencia_pais` y `licencia_desde` existen desde la
migración 023, pero **las validaciones de negocio nunca se implementaron** —
falta decidir el mínimo (¿21? ¿23 para pick-up?) y la antigüedad de licencia.
Sin ese número, el campo se pide y no valida nada.

---

## 📄 10. Textos legales — CONVERTIDA EN PLAN

> *"Pensalo y planealo."*

Se convirtió en un documento propio: **`docs/PLAN_TEXTOS_LEGALES.md`**, con los
cinco textos que hacen falta, qué tiene que decir cada uno, cuáles se pueden
redactar sobre lo que el sistema ya hace, cuáles dependen de una decisión, y
cuál es el orden.

El punto que no cambia: **es lo único de todo el proyecto que no se resuelve
programando**, y tiene el lead time más largo. Conviene arrancarlo en paralelo
con el código, no después.

---

## Qué bloquea qué — al 2026-07-28

| Decisión | Bloquea | Estado |
|---|---|---|
| ~~Categorías de los 9 autos~~ | ~~TODO~~ | ✅ Resuelta (D-29) |
| ~~Seña~~ | ~~Preferencia de MP~~ | ✅ Resuelta (D-30) |
| ~~Confirmación~~ | ~~Bandeja de reservas web~~ | ✅ Ya estaba (D-04) |
| ~~Canal de aviso~~ | ~~Notificaciones~~ | ✅ Resuelta (D-32) |
| ~~Categorías publicadas~~ | ~~Grilla de la web~~ | ✅ Resuelta (D-31) |
| ~~Política de la seña (D-11)~~ | ~~T&C, contrato y paso 3~~ | ✅ Resuelta: no se reintegra |
| Devoluciones (#5) | Rechazar una reserva cobrada | 🟡 Postura definida |
| Sin cupo (#4) | Lógica del webhook | 🟡 Postura definida |
| Anticipación (D-36) | Validación del paso 1 | 🟡 Default seguro |
| Garantía online (D-37) | Paso 3 | 🟡 Recomendación: no pedir |
| Textos legales | **Publicar**, no programar | 📄 Plan aparte |

**Se puede construir y publicar todo el flujo.** La política de la seña —que es
lo que el cliente acepta con un checkbox antes de pagar— está resuelta y
escrita en los términos.

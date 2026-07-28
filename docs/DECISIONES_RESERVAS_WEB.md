# Decisiones pendientes — Reservas web y Mercado Pago

> **Escrito el 2026-07-27 para revisar en frío.** Son las dudas que traban la
> Fase 6. Están todas juntas a propósito: la idea es responderlas de una vez y
> no frenar cada vez que se arranca algo.
>
> **Cada una tiene una recomendación.** Si una recomendación te convence, con
> decir "va la recomendada" alcanza. Las marcadas 🔴 bloquean código concreto;
> las 🟡 se pueden asumir y cambiar después sin romper nada.
>
> Contexto técnico completo en `docs/PLAN_RESERVAS_WEB.md`.

---

## 🔴 1. ¿Cuánto se cobra por adelantado?

El plan original decía "seña del 30%". Nunca se confirmó.

| Opción | A favor | En contra |
|---|---|---|
| **Seña 30%** | Compromete al cliente sin exigirle todo; es lo estándar | Hay que cobrar el resto al entregar |
| **100% por adelantado** | Cero cobranza en el mostrador, cero incobrables | Espanta reservas; devolver es más caro |
| **Monto fijo** (ej. $50.000) | Simple de comunicar | Injusto entre un compacto 2 días y una pick-up 15 |

> **Recomendación: seña del 30%.** Es el estándar del rubro y equilibra las dos
> puntas. El resto se cobra al check-out, que es un flujo que el sistema ya
> tiene resuelto (débito en cuenta corriente + cobro).

**Sub-pregunta:** ¿la seña **se pierde** si el cliente no aparece? Hoy la
política de cancelación (D-11) ya dice que la seña no se devuelve. ¿Aplica
igual para la web, o para reservas online conviene ser más flexible?

---

## 🔴 2. ¿Con cuánta anticipación mínima se puede reservar online?

Si alguien reserva a las 23:50 para retirar a las 8:00 del día siguiente, ¿el
auto está preparado? ¿Hay alguien en el mostrador?

> **Recomendación: mínimo 24 horas de anticipación** para reservas web. Menos
> que eso, la web muestra el WhatsApp — que es el canal que hoy funciona y
> permite coordinar a mano. Es la opción que no promete lo que no se puede
> cumplir.

**También hace falta definir:** ¿en qué horarios se entrega? Hoy los lugares
de retiro son 4 direcciones y el aeropuerto, pero no hay horarios cargados en
ningún lado. Si la web permite elegir "retiro 3:00 AM", alguien tiene que ir.

---

## 🔴 3. ¿La reserva web se confirma sola o la acepta una persona?

| Opción | A favor | En contra |
|---|---|---|
| **Siempre manual** | Control total; nadie se sorprende | Si nadie mira el sistema un domingo, el cliente queda esperando |
| **Auto-confirma siempre** | Experiencia inmediata, compite con las grandes | Se confirma a un cliente con deuda o una categoría que no queremos dar |
| **Híbrida** | Auto-confirma lo seguro, manda a revisión lo dudoso | Hay que definir qué es "dudoso" |

> **Recomendación: manual al principio, híbrida después.** Arrancar con
> aceptación manual y **una notificación agresiva** (ver #6) permite ver cómo
> se comporta el canal con volumen real. Cuando haya 20 o 30 reservas de
> historia, se sabe qué reglas automatizar. Automatizar antes de tener datos
> es decidir a ciegas sobre plata cobrada.

**Si se va a híbrida, ¿qué manda a revisión manual?** Propuesta: cliente con
deuda vencida, alquiler de más de 15 días, o categoría pick-up.

---

## 🔴 4. ¿Qué pasa si el pago se aprueba pero ya no hay cupo?

Es el caso feo y **va a pasar**: el hold expira mientras el cliente carga la
tarjeta, entra otro y se lleva la última unidad.

| Opción | Problema |
|---|---|
| Confirmar igual (sobreventa) | Alguien se queda sin auto el día que viaja |
| Devolver automáticamente | Devolución automática = plata que se va sin que nadie mire |
| **Retener y avisar** | Requiere que alguien reaccione rápido |

> **Recomendación: retener y avisar.** La reserva queda en un estado propio
> (`REVISION_SIN_CUPO`), se dispara una notificación **crítica**, y una persona
> resuelve: ofrecer otra categoría, otra fecha, o devolver. Casi siempre hay
> una salida mejor que la devolución, y la decisión no es del software.

---

## 🔴 5. Devoluciones — hoy no están modeladas

Si se rechaza una reserva ya cobrada, **hay que devolver la plata**. El sistema
sabe registrar cobros, pero **no tiene el concepto de devolución al cliente**.

Preguntas:
1. ¿La devolución se hace **desde Mercado Pago** (tiene API de refunds) o a
   mano por transferencia?
2. ¿Se devuelve el 100% siempre, o hay un cargo administrativo?
3. ¿Quién puede autorizarla? (hoy no hay roles reales — Fase 3.5)

> **Recomendación: refund por API de Mercado Pago, 100%, con motivo obligatorio
> y asiento de contra-partida en la cuenta corriente.** Es el mismo patrón que
> ya se usó con las anulaciones de pagos y las bonificaciones de multas: nunca
> se borra, se compensa. Cargar la devolución a mano invita a que el ledger y
> la realidad se separen.

---

## 🔴 6. ¿Por dónde avisa que entró una reserva web?

Una notificación in-app a las 2 de la mañana **no la ve nadie**. Y una reserva
web sin responder es una venta que se cae.

| Canal | Estado |
|---|---|
| In-app (campana) | ✅ existe |
| Email (Resend) | ✅ existe, hoy sólo el digest de las 08:00 |
| **WhatsApp** | ❌ no existe |

> **Recomendación: email inmediato ahora, WhatsApp después.** El email ya está
> integrado y sólo hay que mandarlo fuera del digest. WhatsApp es el canal que
> realmente miran, pero implica la API de WhatsApp Business (aprobación de Meta,
> plantillas pre-aprobadas, costo por mensaje) — es un proyecto en sí mismo, no
> un agregado.

**A definir:** ¿a qué mails se avisa? ¿Franco y Martín, o hay una casilla de
la empresa?

---

## 🟡 7. ¿Se pide tarjeta como garantía en la reserva web?

En el mostrador se toma una garantía (tarjeta o efectivo). Online eso es más
difícil: retener un monto en una tarjeta requiere una integración distinta
(pre-autorización), que Checkout Pro **no** hace.

> **Recomendación: no pedir garantía online.** Se toma al momento de retirar el
> auto, como ahora. Meter una pre-autorización en el flujo web multiplica la
> complejidad y la fricción justo en el paso donde el cliente abandona.

---

## 🟡 8. ¿Qué categorías se publican en la web?

Hoy la landing muestra 3 bloques hardcodeados: compacto, sedán intermedio,
sedán superior. En el sistema hay 6 categorías (esas 3 más SUV, pick-up y
furgón), y **las pick-ups son 7 de los 16 autos**.

> **Recomendación: publicar todo lo que tenga cupo**, con un flag
> `visible_web` por categoría para poder sacar alguna sin borrarla. Las
> pick-ups son casi la mitad de la flota; dejarlas afuera de la web es dejar
> afuera la mitad del negocio.

**Bloqueante real:** los **9 autos siguen sin categoría** (punto 7 de
`VALIDAR_CON_DUENOS.md`). Sin eso la web no tiene qué vender. **Esta es la
decisión más urgente de todas: bloquea todo lo demás.**

---

## 🟡 9. ¿Se piden los datos de la licencia en el paso 3?

Validar edad mínima y licencia vigente **antes** de cobrar evita el conflicto
en el mostrador ("no te puedo entregar el auto"). Pero cada campo extra en el
formulario baja la conversión.

> **Recomendación: pedir fecha de nacimiento y vencimiento de licencia, nada
> más.** Son los dos datos que efectivamente pueden impedir la entrega. El
> número de licencia y el resto se completan al retirar.

---

## 🟡 10. Textos legales

El paso 3 muestra los términos y condiciones con checkbox obligatorio.

**Hoy no existe el texto.** Es el mismo bloqueo que el contrato de alquiler
(ítem 50, esperando a Franco y Martín desde hace tiempo). Como mínimo hace
falta: política de cancelación, qué cubre el seguro y la franquicia, requisitos
del conductor, y política de combustible y kilometraje.

> **Recomendación: pedirlo ya**, aunque sea un borrador. Tiene el lead time más
> largo de todo el proyecto y es lo único que no se puede resolver
> programando.

---

## Resumen — qué bloquea qué

| Decisión | Bloquea |
|---|---|
| **#8 (categorías de los 9 autos)** | **TODO. Es la más urgente.** |
| #1 seña | Crear la preferencia de MP |
| #4 sin cupo | Lógica del webhook |
| #5 devoluciones | Rechazar una reserva cobrada |
| #3 confirmación | Bandeja de reservas web |
| #2 anticipación | Validación del paso 1 |
| #6 canal de aviso | Notificaciones |
| #10 textos legales | Publicar (no programar) |

**Lo que se puede construir sin ninguna respuesta:** reserva por categoría,
foto y specs en categorías, disponibilidad por cupo, y la bandeja. Es
exactamente lo que se está ejecutando mientras tanto.

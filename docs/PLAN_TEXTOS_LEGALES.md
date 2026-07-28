# Plan de Textos Legales — web, contrato y sistema

**Fecha:** 2026-07-28
**Origen:** decisión #10 de `docs/DECISIONES_RESERVAS_WEB.md` — *"pensalo y planealo"*.

**La premisa que ordena todo esto:** es **lo único del proyecto que no se
resuelve programando**. El código de la web se escribe en semanas; conseguir
que alguien defina qué pasa con la seña de un cliente que no aparece puede
llevar más. Por eso arranca **en paralelo** con el desarrollo, no después.

**La segunda premisa, menos obvia:** casi todos estos textos **ya están
decididos** — están implementados en el sistema. La política de combustible es
`cargo_combustible`; la de kilometraje es D-21; la de atraso es D-19. Redactar
no es inventar: es **escribir lo que el sistema ya hace**. Donde el texto y el
código difieran, gana el código o hay un bug.

---

## 1. Los cinco textos

| # | Texto | Dónde vive | Quién lo necesita | Lead time |
|---|---|---|---|---|
| **T1** | **Términos y Condiciones de alquiler** | Web (paso 3, checkbox) + link en el footer | El cliente antes de pagar | 🔴 Largo |
| **T2** | **Política de cancelación y devoluciones** | Sección dentro de T1 + página propia | El cliente y el equipo | 🔴 **Bloqueada** |
| **T3** | **Política de privacidad** | Footer de la web | Obligación legal (Ley 25.326) | 🟠 Medio |
| **T4** | **Clausulado del contrato** (reverso) | PDF del contrato | El cliente al retirar | ✅ **Resuelto** |
| **T5** | **Requisitos del conductor** | Web (paso 1 y FAQ) | Filtra reservas imposibles | 🟠 Medio |

**T4 ya está resuelto** con el contrato modelo adoptado (D-33) — su plan
completo está en `docs/PLAN_CONTRATOS.md`. Los otros cuatro son nuevos.

**La relación entre T1 y T4 es la que hay que cuidar:** el cliente web acepta
T1 **antes de pagar**, y firma T4 **al retirar el auto**. Si dicen cosas
distintas sobre lo mismo, el que vale es el que se firmó después — pero el
cliente ya pagó creyendo lo primero, y ahí está el reclamo. **T1 tiene que ser
un resumen fiel de T4, nunca una versión más generosa.**

---

## 2. T1 — Términos y Condiciones

Diez secciones. Al lado de cada una, de dónde sale el contenido:

| Sección | De dónde sale | Estado |
|---|---|---|
| Quiénes somos (razón social, CUIT, domicilio) | **D-C1**, pendiente | 🔴 Bloqueada |
| Qué incluye el alquiler | Kilometraje libre (D-21), seguro de responsabilidad civil, asistencia | ✅ Se puede escribir |
| Qué **no** incluye | Combustible, peajes, multas, limpieza especial (D-20) | ✅ |
| Requisitos del conductor | T5 — edad mínima **pendiente** | 🟡 |
| Reserva y pago | 30/50/100% (D-30), saldo al retirar | ✅ |
| **Cancelación y no-show** | **D-11 — contradicción abierta** | 🔴 **Bloqueada** |
| Entrega y devolución | Puntos de retiro (D-10), horarios (**D-36 pendiente**), modelo 24hs (D-18), cargo por atraso (D-19) | 🟡 |
| Combustible y limpieza | Tanque lleno, cargos si no (D-20) | ✅ |
| Coberturas y franquicia | Adicionales tipo `cobertura` con su `franquicia`. Monto **pendiente (D-C3)** | 🟡 |
| Responsabilidad del cliente | Resumen de la cláusula 5 de T4 | ✅ |

**Siete de diez se pueden redactar hoy.** Las tres trabadas dependen de D-11,
D-36 y D-C1/D-C3 — que son decisiones de negocio, no de redacción.

### La sección que más importa

**Cancelación y no-show** es la que más se lee, la que más reclamos genera y la
única bloqueada por una contradicción real (ver D-11 en `docs/DECISIONES.md`):

- **D-11 confirmada** dice: si cancela, la seña se retiene íntegra.
- **El usuario dijo el 2026-07-28**: la seña no se pierde si el cliente no
  aparece.

Juntas producen una política que **premia no avisar**. Hay que elegir una sola
y escribirla acá. La recomendación (D-11): **se devuelve si avisa con 48 horas,
se retiene si no avisa**, aplicando lo mismo a la cancelación tardía y al
no-show — porque desde el punto de vista del negocio son el mismo hecho: un
auto que quedó sin alquilar y sin tiempo de revenderse.

---

## 3. T2 — Cancelación y devoluciones

Sale de T1 como página propia porque el cliente la va a buscar suelta, y porque
el equipo la necesita para responder sin improvisar.

Cuatro cosas que tiene que contestar, sin vueltas:

1. **Cómo se cancela** — un mail, un WhatsApp, ¿un link en la confirmación?
   Recomiendo que la confirmación traiga un link: deja constancia de la fecha y
   hora del aviso, que es exactamente el dato del que depende la política.
2. **Qué se devuelve según cuándo avisó** — la tabla de plazos.
3. **En cuánto tiempo llega la plata** — el refund de Mercado Pago tarda
   típicamente entre 5 y 20 días hábiles según el medio. **Decirlo evita la
   mitad de los reclamos**: el cliente que no sabe cuánto tarda escribe todos
   los días.
4. **Qué pasa si Ubicar cancela** — sin cupo, problema mecánico. Acá la
   devolución es del 100% siempre y conviene que esté escrito: es lo que
   distingue una empresa seria.

---

## 4. T3 — Política de privacidad

**Es obligación legal**, no una formalidad: la Ley 25.326 de Protección de
Datos Personales aplica desde el momento en que la web recibe un nombre y un
mail.

Lo que hay que declarar, y todo sale de mirar el propio sistema:

| Qué | En el caso de Ubicar |
|---|---|
| Qué datos se recogen | Nombre, DNI, mail, teléfono, domicilio, datos de licencia, y los de la tarjeta **que procesa Mercado Pago, no Ubicar** |
| Para qué | Gestionar la reserva y el alquiler, facturar, cumplir obligaciones legales |
| Con quién se comparten | Mercado Pago (pago), Resend (mails), Meta (píxel de la web — **ya está activo**) |
| Cuánto se conservan | Los del alquiler, mientras dure la relación comercial más el plazo de prescripción |
| Derechos del titular | Acceso, rectificación y supresión, y cómo ejercerlos |
| Cookies | Las de Meta Pixel y las de sesión |

**Dos cosas del sistema actual que la política tiene que reflejar sí o sí:**

- **El píxel de Meta ya está corriendo** en la web (`app/api/track/route.ts`).
  Enviar eventos de conversión a Meta es tratamiento de datos y tiene que estar
  declarado. Hoy la web no tiene ninguna política publicada — es el hueco más
  concreto.
- **La regla de "nunca eliminar"** del proyecto choca de frente con el derecho
  de supresión. No es un problema (hay obligaciones fiscales y contables que
  justifican conservar), pero **la política tiene que explicarlo**: se puede
  pedir la baja, y los datos con obligación de conservación se mantienen por el
  plazo legal. Prometer un borrado total que el sistema no hace sería peor que
  no decir nada.

---

## 5. T5 — Requisitos del conductor

El texto más corto y el que más plata ahorra: evita la reserva que **no se
puede cumplir**.

| Requisito | Estado |
|---|---|
| **Edad mínima** | 🔴 **Sin definir.** El campo `fecha_nacimiento` existe (migración 023), la validación no |
| **Antigüedad de licencia** | 🔴 Sin definir. `licencia_desde` existe, no se valida |
| Licencia vigente y válida en Argentina | ✅ `licencia_vencimiento`, `licencia_pais` |
| Tarjeta de crédito a nombre del conductor | ✅ Se pide para la garantía |
| Conductores adicionales declarados | ✅ `ConductorAdicional` (cláusula 2.h del contrato) |

**La pregunta para Franco y Martín es una sola:** ¿desde qué edad alquilan, y
piden algún mínimo distinto para las pick-ups? Es habitual exigir más edad para
los vehículos más caros, y **7 de los 16 autos son pick-ups**.

Sin ese número, el paso 3 de la web puede pedir la fecha de nacimiento (como se
decidió en #9) pero no puede rechazar nada.

---

## 6. Cómo se implementan

**No van hardcodeados.** Mismo criterio que el clausulado del contrato
(`contrato_plantillas`, ver `PLAN_CONTRATOS.md` §5): los textos legales
**cambian y hay que saber cuál aceptó cada cliente**.

**Tabla `textos_legales`:** `slug` (`terminos`, `privacidad`, `cancelacion`,
`requisitos`), `version`, `titulo`, `contenido` (markdown), `vigente_desde`,
`activo`.

**Y en la reserva web:** `terminos_version_aceptada` + `terminos_aceptados_at`.
Guardar sólo un booleano "aceptó" no sirve de nada el día que hay un reclamo:
la pregunta va a ser **qué** aceptó, y sin la versión no hay respuesta.

Las páginas de la web (`/terminos`, `/privacidad`) se renderizan desde ahí,
estáticas, revalidadas — no necesitan ser dinámicas.

---

## 7. Orden

| # | Paso | Depende de |
|---|---|---|
| 1 | **Resolver D-11** (la seña) — es una conversación, no un texto | Franco/Martín |
| 2 | Definir edad mínima y antigüedad de licencia | Franco/Martín |
| 3 | Redactar **T3 (privacidad)** — no depende de ninguna decisión | — |
| 4 | Redactar **T5 (requisitos)** | 2 |
| 5 | Redactar **T1 + T2** | 1, 2, D-36 |
| 6 | Tabla `textos_legales` + páginas de la web | 3 |
| 7 | Revisión de un abogado sobre T1, T2 y T4 juntos | 5 |

**El paso 3 se puede hacer ya**, y es el que tiene una obligación legal
incumplida hoy (la web recolecta datos y manda eventos a Meta sin política
publicada). Conviene que sea el primero en salir.

**El paso 7 no es opcional.** T4 es un clausulado adaptado de otra empresa y T1
es el texto que un cliente acepta antes de pagar: media hora de un profesional
sobre los tres documentos juntos es barata comparada con un solo reclamo mal
parado.

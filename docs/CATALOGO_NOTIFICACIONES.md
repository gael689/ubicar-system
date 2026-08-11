# Catálogo de notificaciones y mails — Ubicar Rent

Todo lo que el sistema avisa: **puertas adentro** (las notificaciones de la
campana, primera mitad del documento) y **al cliente** (los mails, segunda
mitad). Al día al 2026-08-11.

Fuente de verdad del código:

| Qué | Dónde |
|---|---|
| Catálogo de reglas | `backend/app/domain/notificaciones_reglas.py` |
| Motor que las corre | `backend/app/services/notificacion_service.py` |
| Los mails: envío, guardas y registro | `backend/app/services/email_service.py` |
| Las plantillas de los mails | `backend/app/services/email_plantillas.py` |
| El canal (Resend) | `backend/app/services/notificaciones.py` |

## Cómo funciona, en una página

- **Motor.** Todos los días a las **08:00, hora Argentina**, un job de
  APScheduler (arrancado desde el `lifespan` de FastAPI en `main.py`) evalúa
  las 35 reglas de abajo contra la base de datos real.
- **Persistencia.** Cada alerta que dispara una regla se guarda en la tabla
  `notificaciones` — no se recalcula cada vez que alguien abre la campana.
- **Deduplicación.** Cada notificación tiene una `clave_dedupe`
  (`tipo:entidad_tipo:entidad_id:fecha_objetivo`) que es única. Si la regla
  vuelve a evaluar lo mismo al día siguiente, no crea una segunda alerta.
- **Auto-resolución.** Si la condición que generó una alerta deja de
  cumplirse (se cobró el echeq, se hizo el check-in, se pagó la deuda), esa
  notificación pasa sola a estado `resuelta` en la corrida siguiente del
  motor — nadie tiene que descartarla a mano.
- **Estados posibles**: `pendiente` → (`leida` | `pospuesta` | `descartada`
  | `resuelta`). Sólo `pendiente`/`enviada`, y las `pospuesta` cuyo plazo ya
  venció, aparecen en la campana. El resto queda en el historial.
- **Eventos instantáneos.** La gran mayoría de las reglas corre una vez por
  día (08:00 ART). Dos excepciones están cableadas para avisar al instante,
  sin esperar al día siguiente: **echeq rechazado** (se dispara desde
  `routers/echeqs.py` al registrar el rechazo) y, en general, cualquier
  regla puede dispararse manualmente con el botón "actualizar" de la
  campana (`POST /notificaciones/generar`), que vuelve a evaluar todo el
  catálogo en el momento.
- **Canales.** In-app (la campana) y **digest matutino por email** (Resend).
  Todos los días, después de correr el motor, el scheduler arma un resumen
  de todo lo activo (agrupado por urgencia) y lo manda a los destinatarios
  configurados en `NOTIFICACIONES_DIGEST_DESTINATARIOS` (`.env`, separados
  por coma). Sin destinatarios configurados no se manda; sin `RESEND_API_KEY`
  el intento queda registrado como fallido (ver la segunda mitad de este
  documento) y se puede reintentar. También se puede disparar a mano con
  `POST /notificaciones/enviar-digest`. El push web y WhatsApp quedan para
  más adelante — WhatsApp requiere WhatsApp Business API/Twilio, no un
  simple link `wa.me`.
- **Preferencias.** Existe la tabla `preferencias_notificacion` y sus
  endpoints (`GET/PUT /notificaciones/preferencias`), pero **todavía no
  hay UI ni se aplican a las reglas** — con un solo usuario de desarrollo y
  un solo canal, no hay nada que diferenciar todavía. Se retoma cuando
  entre Clerk (usuarios reales) y el email (más de un canal para elegir).

## El catálogo completo

Urgencia, de mayor a menor: **crítica** > **alta** > **media** > **baja**.

### Operación diaria

| Tipo (`tipo`) | Qué detecta | Cuándo dispara | Urgencia |
|---|---|---|---|
| `entrega_hoy` | Reserva confirmada cuya entrega es hoy y todavía no se hizo el checkout | 08:00, el día de la entrega | Alta |
| `devolucion_hoy` | Alquiler activo cuya devolución es hoy | 08:00, el día de la devolución | Alta |
| `checkout_pendiente` | Reserva confirmada cuya hora de entrega ya pasó y no se registró el checkout | En el momento en que se cumple la hora | Crítica |
| `checkin_vencido` | Alquiler cuya devolución venció hace más de 1 hora y el auto no volvió | +1h de la hora de devolución | Crítica |
| `contrato_no_firmado` | Alquiler entregado hoy sin contrato firmado | El día de la entrega | Alta |
| `reserva_pendiente_24hs` | Reserva en estado "pendiente" (sin confirmar) desde hace más de 24hs | 08:00 | Media |
| `reserva_web_nueva` | Reserva que entró por la web | **Al instante**, al crearla (no espera al motor) | Alta — **crítica** si quedó sin cupo |
| `reserva_web_sin_atender` | Reserva web que sigue sin atenderse | 08:00 — la red de seguridad de la anterior | Alta |

### Cobranzas y finanzas

| Tipo | Qué detecta | Cuándo dispara | Urgencia |
|---|---|---|---|
| `echeq_proximo` | Echeq en cartera que se cobra en 2 días | T-2, 08:00 (pedido explícito del usuario) | Alta |
| `echeq_vence_hoy` | Echeq en cartera que se cobra hoy | T-0, 08:00 | Crítica |
| `echeq_sin_acreditar` | Echeq que debía cobrarse y sigue "en cartera" | Desde T+1 en adelante, 08:00 | Crítica |
| `echeq_rechazado` | Echeq marcado como rechazado | **Al instante**, al registrar el rechazo (no espera al motor) | Crítica |
| `cc_vencimiento_proximo` | Movimiento de deuda en cuenta corriente por vencer | T-3 y T-0, 08:00 | Alta |
| `cc_vencida` | Deuda de cuenta corriente vencida | T+1/+7 (alta), T+15/+30 (crítica), 08:00 | Alta → Crítica |
| `limite_credito_superado` | El saldo de un cliente supera su `limite_credito` configurado | 08:00 (se recalcula todos los días mientras siga superado) | Alta |
| `saldo_pendiente_alquiler` | Alquiler finalizado con saldo sin cobrar | 08:00, mientras haya deuda | Media (alta si +3 días vencido) |
| `garantia_sin_resolver` | Garantía retenida sin devolver, alquiler finalizado hace más de 3 días | 08:00, desde el día 4 | Media |
| `factura_pendiente_emitir` | Alquiler cerrado (con check-in) sin ninguna factura cargada en Comprobantes | 08:00 | Media |

### Flota y documentación

| Tipo | Qué detecta | Cuándo dispara | Urgencia |
|---|---|---|---|
| `vtv_vencimiento` | VTV del vehículo (campo propio desde Fase 3, `Vehiculo.vtv_vencimiento` — ya no depende de un `Documento` cargado) | T-30/T-15/T-7/T-1 y vencido, 08:00 | Baja → Crítica, escalando |
| `poliza_vencimiento` | Póliza del vehículo (`Vehiculo.poliza_vencimiento`, ídem) | T-30/T-15/T-7/T-1 y vencido, 08:00 | Baja → Crítica, escalando |
| `doc_vehiculo_vencido` / `doc_vehiculo_por_vencer` | Resto de documentos del vehículo (cláusulas, otros) — VTV/póliza ya no pasan por acá | T-30/T-15/T-7/T-1 y vencido, 08:00 | Baja → Crítica, escalando |
| `doc_cliente_vencido` / `doc_cliente_por_vencer` | Documento de un cliente (DNI, licencia cargada como doc), vencido o por vencer | Igual que arriba | Baja → Crítica, escalando |
| `service_km_proximo` / `service_km_vencido` | Kilometraje del vehículo cerca o pasado del próximo service | <1.000 km restantes / vencido, 08:00 | Media / Alta |
| `service_fecha_proximo` / `service_fecha_vencido` | Fecha programada del próximo service (campo `proxima_fecha` del último service cargado) | T-15 días / vencido, 08:00 | Media / Alta |
| `licencia_cliente_por_vencer` | Licencia de conducir del cliente por vencer | T-30 y T-7, 08:00 | Media |
| `licencia_vencida_reserva_futura` | Cliente con la licencia ya vencida que tiene una reserva futura confirmada o pendiente | 08:00, mientras la reserva siga futura | Alta |
| `vehiculo_fuera_servicio_prolongado` | Vehículo en estado "fuera de servicio" hace más de 7 días | Desde el día 8, 08:00 | Media |

### Multas

| Tipo | Qué detecta | Cuándo dispara | Urgencia |
|---|---|---|---|
| `multa_pendiente_imputar` | Multa cargada sin asignar responsable todavía | 08:00 | Media |
| `multa_imputada_sin_cobrar` | Multa imputada a un cliente hace más de 15 días, sin resolver (cobrada/bonificada) | Desde el día 16, 08:00 | Media |
| `multa_por_vencer` | Multa con vencimiento cerca y todavía sin resolver | Ventana configurable, default 7 días | **Alta** |
| `multa_vencida` | Multa que ya venció y sigue sin resolverse | Desde el día siguiente al vencimiento | **Crítica** |

### Falta completar

La única familia que mira **huecos** en vez de hechos: cosas que nadie cargó y
que no molestan hasta que llega el día y ya es tarde. Todas se auto-resuelven
en cuanto se carga el dato.

| Tipo | Qué detecta | Cuándo dispara | Urgencia |
|---|---|---|---|
| `fecha_especial_sin_precio` | Fecha especial próxima sin tarifa propia ni regla que la cubra | 30 días antes | Media → **Alta** a 7 días → **Crítica** una vez empezada |
| `categoria_sin_precio` | Categoría con vehículos activos que no se puede cotizar | 08:00 | **Alta** |
| `categoria_precio_generico` | Categoría que cotiza con el precio genérico que trae el sistema, no con el de la empresa | 08:00 | **Alta** |
| `vehiculo_sin_categoria` | Vehículo activo sin categoría: invisible para la web y el motor de precios | 08:00 | Media |
| `contrato_sin_emitir` | Alquiler abierto (auto afuera) sin ningún contrato emitido | 08:00 | **Alta** → **Crítica** a los 2 días |
| `datos_empresa_sin_cargar` | Falta `empresa.cuit` o `empresa.razon_social` | 08:00 | **Alta** |

**El caso que la justifica.** Se carga "Navidad" en el calendario de fechas
especiales y nadie carga la tarifa para esos días: **se vende al precio de un
martes cualquiera**. La plata perdida no aparece en ningún reporte porque no
hubo ningún error — se cobró exactamente lo que estaba configurado. Sin esta
regla, nadie se entera hasta que pasó.

**Por qué `categoria_sin_precio` sólo mira categorías con flota.** Una
categoría vacía no se vende igual, así que avisar por ella sería ruido
permanente — y una lista con ruido permanente se deja de mirar entera.

**Por qué `contrato_sin_emitir` es distinta de `contrato_no_firmado`.** La otra
mira las entregas del día. Esta mira alquileres abiertos: el auto puede haber
salido la semana pasada y no existir ningún contrato, ni firmado ni emitido. Es
el peor escenario si aparece un daño o una multa.

## Orden de la cola

`list_activas()` ordena por **urgencia y después por fecha**. Antes iba sólo
por `created_at desc`, así que una crítica de ayer quedaba debajo de una baja
de hoy — y la campana muestra las primeras. Lo importante se hundía justamente
por seguir importando el tiempo suficiente como para no ser nuevo.

El peso se resuelve en la base (`PESO_URGENCIA`, un `CASE`) y no en Python,
porque el historial viene paginado: armado después de traer la página, la
página 1 no tendría las críticas sino las últimas cargadas.

## Agregadas en esta revisión (no estaban en el catálogo original del plan)

Al hacer la Fase 2 se revisó el sistema completo para encontrar huecos que
el catálogo original (escrito antes de tener el sistema entero mapeado) no
contemplaba. Se agregaron:

- **`contrato_no_firmado`** — nada avisaba si un auto salía sin contrato firmado.
- **`reserva_pendiente_24hs`** — una reserva podía quedar "pendiente" indefinidamente sin que nadie lo notara.
- **`limite_credito_superado`** — el campo `limite_credito` de la cuenta corriente existía en el modelo pero nada lo usaba.
- **`factura_pendiente_emitir`** — un alquiler podía cerrarse sin factura y nadie se enteraba hasta que el cliente reclamaba.
- **`vehiculo_fuera_servicio_prolongado`** — un vehículo podía quedar "fuera de servicio" indefinidamente sin ninguna alerta (requirió agregar `Vehiculo.estado_desde`, que no existía).
- **`licencia_vencida_reserva_futura`** — más urgente que "la licencia vence en 30 días": un cliente con la licencia **ya vencida** y una reserva futura confirmada.
- **`multa_imputada_sin_cobrar`** — una multa podía quedar "imputada" para siempre sin cobrarse ni bonificarse (requirió agregar `Multa.fecha_imputada`, no se registraba en ningún lado).
- **`service_fecha_proximo` / `service_fecha_vencido`** — el sistema sólo alertaba service por kilometraje; el campo `Servicio.proxima_fecha` ya existía cargado y no se usaba.

## Lo que falta y por qué

Una regla del catálogo original del plan maestro **no se implementó**, a
propósito:

- **Descuento por pronto pago en multas** — ❌ **descartado a propósito**
  (D-28, 2026-07-28). Existe en la realidad, pero mantener plazos y
  porcentajes que cambian por jurisdicción y por año es mucha estructura
  para un beneficio que quien paga la multa ya conoce.
  **Lo que sí se hizo** (migración 045): `Multa.fecha_vencimiento` — que no
  existía, con lo cual no había forma de saber cuándo había que pagarla — y
  las dos reglas `multa_por_vencer` / `multa_vencida` de la tabla de arriba.
  La ventana de aviso es el parámetro `multas.dias_aviso_vencimiento` de la
  pantalla de Configuración, default 7 días.

Y, tal como se pidió, **implementado al final, después de todo lo demás**:

- **Envío por email (digest matutino con Resend)** — ✅ hecho. Ver la
  sección de canales arriba.
- **Preferencias por usuario, aplicadas de verdad** — la tabla y los
  endpoints existen, pero no hay más de un usuario real (todo corre bajo
  el admin de `dev_bypass_auth`) ni más de un canal, así que no hay nada
  que una preferencia pueda diferenciar todavía. Se retoma con Clerk.

---

# Los mails al cliente

Lo que sale hacia afuera. Se maneja distinto de la campana por una razón: una
notificación que no aparece se puede volver a generar mañana, **un mail que no
salió está perdido si nadie se entera**. Por eso acá lo central no es la regla
que lo dispara sino el registro de lo que pasó.

## Cómo funciona

- **Una sola puerta de salida.** Todo pasa por `EmailService`
  (`backend/app/services/email_service.py`). Antes había tres caminos
  paralelos hacia el canal de Resend —el digest, los avisos de reserva web y
  el contrato firmado—, cada uno con su criterio y ninguno con registro.
- **Se registra el intento, no el éxito.** Cada envío deja una fila en
  `emails_enviados` (migración 060): tipo, destinatario, remitente, asunto,
  cuerpo, resultado, error, cantidad de intentos. Es lo que permite contestar
  *"¿le llegó?"* sin entrar al servidor a leer logs.
- **Un mail que falla no puede tumbar la operación.** El check-out se
  completa aunque Resend esté caído: el envío queda `fallido` con el error y
  se reintenta desde el panel. Ningún envío levanta una excepción hacia
  arriba.
- **Dónde se mira.** Sistema → **Notificaciones → pestaña "Mails enviados"**.
  Ahí está el listado con filtros, el cuerpo de cada mail tal como salió, el
  botón de reintentar y el de mandar una oferta.

## Los tres resultados posibles

| Estado | Qué significa |
|---|---|
| `enviado` | Resend lo aceptó. Queda guardado su `proveedor_id`. |
| `fallido` | Se intentó y no salió. El motivo queda escrito (timeout, API key faltante, rechazo de Resend). Se puede reintentar. |
| `omitido` | **No se intentó, a propósito.** Hoy: el remitente es el de prueba y el destinatario es un cliente. |

`omitido` existe para no mentir. Es la diferencia entre "el sistema está roto"
y "todavía falta verificar el dominio" — y sin esa distinción, la primera
explicación es la que gana.

## ⚠️ El estado actual: el remitente es el de prueba

En producción `FROM_EMAIL=onboarding@resend.dev`, el remitente compartido de
prueba de Resend, que **sólo entrega a la casilla dueña de la cuenta**. Un mail
a un cliente real no llega, y tampoco falla de una forma que alguien vaya a
mirar.

Por eso, mientras el remitente termine en `@resend.dev`:

- Los mails **al cliente** (reserva confirmada, retiro, devolución, ofertas,
  contrato firmado) se registran como `omitido` con el motivo escrito. **No se
  mandan.** Reportar "enviado" algo que no va a llegar es el peor resultado
  posible.
- Los mails **internos** (avisos al equipo, digest) se intentan igual: la
  casilla del equipo puede muy bien ser la de la cuenta de Resend, y si no lo
  es, queda `fallido` con el error — que es información, no silencio.
- El panel muestra un cartel arriba de todo explicando esto, y el formulario
  de ofertas lo repite antes de dejar mandar.

**Para activarlos:** verificar el dominio propio en Resend y cambiar
`FROM_EMAIL`. **No hay ninguna otra bandera que tocar** — ni código, ni base.
Después se puede reintentar desde el panel todo lo que quedó omitido.

## El catálogo de mails

| Tipo (`tipo`) | A quién | Cuándo dispara | Adjunto |
|---|---|---|---|
| `reserva_confirmada` | Cliente | Al acreditarse el pago online de una reserva web. Sólo si la reserva quedó `confirmada` | PDF de la reserva |
| `checkout` | Cliente | Al registrar el retiro del vehículo | — |
| `checkin` | Cliente | Al registrar la devolución | — |
| `oferta` | Cliente | **A mano**, desde el panel. Nunca automático | — |
| `contrato_firmado` | Cliente | Cuando firma el contrato desde el link | PDF del contrato firmado |
| `reserva_web_equipo` | Equipo | Al acreditarse el pago de una reserva web | — |
| `contrato_firmado_equipo` | Equipo | Cuando el cliente firma desde el link | PDF del contrato firmado |
| `digest` | Equipo | 08:00 ART, con el resumen de notificaciones activas | — |

Los destinatarios internos salen de la clave de configuración
`web.emails_aviso_reserva`; si está vacía, caen a
`NOTIFICACIONES_DIGEST_DESTINATARIOS` del `.env`.

## Qué dice cada mail, y por qué

Las plantillas viven en `email_plantillas.py` y son **funciones puras**:
reciben las entidades y devuelven `(asunto, html)`. No tocan la base ni saben
que Resend existe, así que se pueden armar con datos de ejemplo y mirarlas sin
mandar un solo mail — que es exactamente lo que hace falta mientras el dominio
no esté verificado.

- **Reserva confirmada** — número de reserva, vehículo (o categoría, si
  todavía no hay unidad asignada), retiro y devolución con lugar, y qué se
  pagó contra qué falta. Sirve igual para una reserva web pagada online y para
  una del mostrador: el bloque de pago se adapta. Antes había dos comprobantes
  distintos para el mismo hecho, y sólo uno se mantenía actualizado.
- **Check-out** — es un **acta, no una cortesía**: kilómetros, combustible,
  estado y garantía retenida al salir. Son los números contra los que se va a
  comparar la devolución; si el cliente los tiene por escrito desde el primer
  día, la discusión del cierre se resuelve sola.
- **Check-in** — el cierre con los cargos **uno por uno con su concepto**
  (demora, combustible, limpieza) y el total. Un monto sin desglose es el
  motivo número uno de un llamado al día siguiente. Si no hubo ningún cargo,
  lo dice explícitamente.
- **Ofertas** — el cuerpo se escribe en **texto plano** y el sistema le da
  formato: quien escribe una promoción no debería tener que saber HTML, y
  aceptar HTML desde un formulario es aceptar que un pegado de Word rompa el
  mail de todo el mundo. Se manda **uno por destinatario**, nunca una lista en
  el `to`: así nadie ve la casilla de los demás y se sabe a quién le llegó.

Detalles de forma que valen para todas: HTML plano con estilos inline y tablas
(Gmail y Outlook descartan el `<style>` del head), **ninguna imagen remota**
(casi todos los clientes de mail las bloquean, y un mail cuyo contenido vive en
un `<img>` llega vacío), y todo lo que sale de la base va escapado.

## La API

| Endpoint | Para qué |
|---|---|
| `GET /emails` | El listado, con filtros por tipo, estado y casilla |
| `GET /emails/estado` | Cómo está parada la integración (remitente, si es de prueba, destinatarios internos) |
| `GET /emails/{id}` | El registro completo, con el cuerpo que se mandó |
| `GET /emails/destinatarios` | Clientes con casilla cargada, para armar una oferta |
| `POST /emails/previsualizar` | El HTML de una oferta sin mandar nada |
| `POST /emails/oferta` | Manda la oferta y registra cada envío |
| `POST /emails/{id}/reintentar` | Vuelve a intentar un envío fallido u omitido |

El reintento **reusa el cuerpo guardado en vez de rearmarlo**: rearmar la
plantilla mandaría los datos de hoy, y el cliente recibiría un mail distinto
del que se le quiso mandar. El adjunto sí se regenera.

## Lo que queda pendiente

- **Verificar el dominio en Resend y cambiar `FROM_EMAIL`.** Es lo único que
  separa al sistema de mandarle mails a clientes reales. Depende de Gael y de
  los dueños (acceso al DNS del dominio).
- **Baja de la lista de ofertas.** Hoy el pie dice "respondé este mensaje y te
  damos de baja", que es honesto pero manual. Un flag por cliente sería lo
  correcto cuando el volumen lo justifique.
- **Recordatorio antes del retiro** (T-1 día). Se conversó, no se implementó:
  con la flota actual el equipo llama por teléfono, y un mail más sin que
  nadie lo pida es ruido.

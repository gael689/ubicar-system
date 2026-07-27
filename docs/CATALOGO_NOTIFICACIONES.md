# Catálogo de notificaciones — Ubicar Rent

Todas las notificaciones que genera el sistema, a fecha 2026-07-26 (Fase 2
del plan maestro completa). Fuente de verdad del código:
`backend/app/domain/notificaciones_reglas.py` (el catálogo de reglas) y
`backend/app/services/notificacion_service.py` (el motor que las corre).

## Cómo funciona, en una página

- **Motor.** Todos los días a las **08:00, hora Argentina**, un job de
  APScheduler (arrancado desde el `lifespan` de FastAPI en `main.py`) evalúa
  las 25 reglas de abajo contra la base de datos real.
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
  por coma). Sin destinatarios configurados o sin `RESEND_API_KEY`, es un
  no-op silencioso — no rompe nada en desarrollo. También se puede disparar
  a mano con `POST /notificaciones/enviar-digest`. El push web y WhatsApp
  quedan para más adelante — WhatsApp requiere WhatsApp Business API/Twilio,
  no un simple link `wa.me`.
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

Dos reglas del catálogo original del plan maestro **no se implementaron**
porque dependen de algo que el sistema todavía no tiene:

- **Reserva nueva desde la web** — no existe el sistema de reservas web
  todavía (Fase 5 del plan). Cuando exista, cada reserva que llegue por ahí
  debe generar una notificación de urgencia alta al instante, sin esperar
  al digest de las 08:00 (así está definido en el plan maestro §7).
- **Multa próxima a vencer (descuento por pronto pago)** — el modelo
  `Multa` no registra ninguna fecha límite de descuento por pronto pago.
  Habría que agregar el campo y, antes, confirmar con Franco/Martín si las
  multas que gestionan tienen ese beneficio en la práctica.

Y, tal como se pidió, **implementado al final, después de todo lo demás**:

- **Envío por email (digest matutino con Resend)** — ✅ hecho. Ver la
  sección de canales arriba.
- **Preferencias por usuario, aplicadas de verdad** — la tabla y los
  endpoints existen, pero no hay más de un usuario real (todo corre bajo
  el admin de `dev_bypass_auth`) ni más de un canal, así que no hay nada
  que una preferencia pueda diferenciar todavía. Se retoma con Clerk.

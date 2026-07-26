# Registro de Casos de Uso — Ubicar Rent

**Última actualización:** 2026-07-25
**Para qué sirve:** lista única y trackeable de todo lo que el sistema tiene que poder hacer. Cada caso tiene un ID estable para referenciarlo en commits, issues y conversaciones.

**Documentos relacionados:**
- `docs/PLAN_MAESTRO.md` — visión global, arquitectura y fases
- `docs/ANALISIS_CICLO_RESERVA.md` — análisis fino del ciclo operativo con los bugs confirmados

**Leyenda de estado:**

| | Significado |
|---|---|
| ✅ | Funciona |
| 🟡 | Funciona parcialmente o con limitaciones |
| 🔴 | **Roto** — existe pero falla |
| ⬜ | No existe todavía |
| 🔵 | Futuro — depende del sistema de reservas web |

**Prioridad:** P0 = sangra plata o bloquea la operación · P1 = necesario para producción · P2 = mejora importante · P3 = deseable

---

## RES — Reservas

| ID | Caso de uso | Estado | Prio | Nota |
|---|---|---|---|---|
| RES-01 | Crear reserva desde el sistema | ✅ | — | |
| RES-02 | Crear reserva desde el calendario (click en celda) | ✅ | — | |
| RES-03 | Editar reserva confirmada (fechas, vehículo, lugares) | 🟡 | P1 | No recalcula el precio |
| RES-04 | Editar garantía de una reserva ya creada | ⬜ | P1 | `ReservaUpdate` no lo permite |
| RES-05 | Editar hora de devolución pactada | ⬜ | P1 | Ídem |
| RES-06 | Cancelar reserva | 🟡 | P1 | Sin motivo, sin autor, sin política de seña |
| RES-07 | Reasignar a otro vehículo | 🟡 | P2 | No recalcula precio ni valida categoría equivalente |
| RES-08 | Estado PENDIENTE con aprobación | 🔴 | P1 | `confirmar()` es código muerto — las reservas nacen confirmadas |
| RES-09 | Detectar solapamiento bloqueante | ✅ | — | `domain/solapamientos.py`, correcto |
| RES-10 | Advertir solapamiento con pendiente | 🔴 | P2 | Inalcanzable: no existen reservas pendientes |
| RES-11 | Extender alquiler activo | ✅ | — | **Arreglado 2026-07-25**: si no hay tarifa para la nueva duración, conserva el precio anterior en vez de anularlo |
| RES-12 | ~~Marcar NO-SHOW~~ → **Late check-out con monto editable y nota** | ⬜ | P1 | D-17: no se crea el estado. Se resuelve como late check-out |
| RES-12b | Cancelar: retener la seña completa | ⬜ | P1 | D-11: no se devuelve nada. Genera el asiento solo |
| RES-13 | Reabrir reserva finalizada por error | ⬜ | P2 | |
| RES-14 | Marcar con factura / sin factura | ⬜ | P1 | Sólo existe a nivel de cada pago |
| RES-15 | Separar quién paga de quién maneja | ⬜ | P1 | Crítico para empresas y para imputar multas |
| RES-16 | Registrar conductores autorizados del alquiler | ⬜ | P2 | Hoy sólo a nivel de ficha del cliente |
| RES-17 | Ver desglose del precio, no sólo el total | ⬜ | P1 | |
| RES-18 | Buscar por nombre / DNI | ✅ | — | |
| RES-19 | Filtrar por fecha y estado | ✅ | — | |
| RES-20 | Vista "Requieren acción" | ⬜ | P2 | La que se va a usar el 80% del tiempo |
| RES-21 | Duplicar reserva (cliente recurrente) | ⬜ | P3 | |

## CHK — Check-out (salida del vehículo)

| ID | Caso de uso | Estado | Prio | Nota |
|---|---|---|---|---|
| CHK-01 | Registrar check-out normal | ✅ | — | |
| CHK-02 | Check-out sobre reserva ya auto-activada | ✅ | — | Parche correcto ya implementado |
| CHK-03 | Registrar km, combustible y limpieza de salida | ✅ | — | Selectores visuales, bien resueltos |
| CHK-04 | Registrar garantía con tarjeta del cliente | ✅ | — | `GarantiaTarjetaSection`, muy bueno |
| CHK-05 | Cobrar en el momento del check-out | ✅ | — | **Arreglado 2026-07-25**: `Pago(usuario_id=)` → `cobrado_por=` |
| CHK-06 | Convertir el anticipo en pago | ✅ | — | **Arreglado 2026-07-25**: se dejó de sumar `anticipo_monto` donde ya existe el `Pago` del checkout |
| CHK-07 | Validar km >= km actual del vehículo | ✅ | — | **Arreglado 2026-07-25**: `BusinessRuleError` si `checkout_km < vehiculo.km_actual` |
| CHK-08 | Bloquear si no hay contrato firmado | 🟡 | P1 | Hoy es warning; decidido pasar a bloqueo |
| CHK-09 | Bloquear si la licencia está vencida | ⬜ | P1 | |
| CHK-10 | Bloquear si la VTV está vencida | ⬜ | P1 | Con override de dueño + motivo |
| CHK-11 | Bloquear si la póliza está vencida | ⬜ | P1 | Sin override |
| CHK-12 | Avisar si el cliente tiene deuda vencida | ⬜ | P2 | |
| CHK-13 | Semáforo de validaciones antes de entregar | ⬜ | P1 | Endpoint `pre-checkout` |
| CHK-14 | Retiro más tarde de lo pactado: correr o no la devolución | ⬜ | P1 | Hoy no se pregunta |
| CHK-15 | Retiro anticipado | 🟡 | P2 | Permitido pero sin recálculo |
| CHK-16 | Check-out cargado fuera de tiempo real | ✅ | — | Flag existente, bien |
| CHK-17 | Fotos del estado del vehículo al salir | ⬜ | P2 | Ver DAN-01 |
| CHK-18 | Corregir un check-out mal cargado | ⬜ | P2 | No hay endpoint |

## CIN — Check-in (devolución del vehículo)

| ID | Caso de uso | Estado | Prio | Nota |
|---|---|---|---|---|
| CIN-01 | Registrar devolución en horario | ✅ | — | |
| CIN-02 | **Registrar devolución tardía** | ✅ | — | **Arreglado 2026-07-26**: nuevo estado `vencida`. Verificado en vivo con service real: confirmada→activa→vencida→check-in exitoso→finalizada |
| CIN-03 | Calcular excedente contra la hora correcta | ✅ | — | **Arreglado 2026-07-26**: `hora_fin` se deriva de `hora_inicio` en `ReservaModal.tsx` (D-18), la fórmula de `control_24hs.py` ya era correcta |
| CIN-04 | Aplicar período de gracia | ✅ | — | 40 min; industria usa 29-30 |
| CIN-05 | Cobrar excedente por hora | ✅ | — | 3× tarifa/24 |
| CIN-06 | Cobrar día completo pasado el umbral | 🟡 | P2 | Umbral 12 hs vs 2 hs de la industria — recalibrar a ~6 |
| CIN-07 | Cobrar día completo si pisa la reserva siguiente | ⬜ | P2 | El dato ya existe, no se usa |
| CIN-08 | Bonificar el excedente | ✅ | — | Con decisión y autor auditados |
| CIN-09 | Exigir motivo al bonificar | ✅ | — | **Arreglado 2026-07-26**: obligatorio en el schema (`CheckinCreate`), no sólo en el frontend |
| CIN-10 | Reporte de excedentes bonificados | ⬜ | P2 | Fuga de ingresos sin visibilidad |
| CIN-11 | Cobrar en el momento del check-in | ✅ | — | **Arreglado 2026-07-25**, mismo fix que CHK-05 |
| CIN-12 | Registrar combustible y limpieza de llegada | ✅ | — | Se registra... |
| CIN-13 | **Generar gasto del vehículo por combustible faltante** | ⬜ | P1 | D-20: gasto del vehículo, no cargo al cliente |
| CIN-14 | **Generar gasto del vehículo por limpieza** | ⬜ | P1 | Ídem |
| CIN-14b | **Km recorridos visibles en historial de cliente y vehículo** | ⬜ | P1 | D-21: el dato ya se captura, falta exponerlo |
| CIN-15 | **Cobrar daños nuevos** | ⬜ | P2 | Depende de DAN-01 |
| CIN-16 | Liquidar la garantía contra los cargos | ⬜ | P1 | El enum existe, el cálculo no |
| CIN-17 | Devolución anticipada: liberar el vehículo | ⬜ | P2 | Son días revendibles |
| CIN-18 | Devolución anticipada: decidir el reintegro | ⬜ | P2 | |
| CIN-19 | Preview de liquidación antes de confirmar | ⬜ | P1 | Endpoint `pre-checkin` |
| CIN-20 | Corregir un check-in mal cargado | ⬜ | P2 | |
| CIN-21 | Validar km de llegada >= km de salida | ✅ | — | |
| CIN-22 | Detectar km imposible (error de tipeo) | ⬜ | P3 | |

## EST — Estados y transiciones

| ID | Caso de uso | Estado | Prio | Nota |
|---|---|---|---|---|
| EST-01 | Confirmada → Activa al llegar la hora | 🟡 | P1 | Se activa sin check-out; ensucia métricas |
| EST-02 | **Activa → Vencida si no volvió** | ✅ | — | **Arreglado 2026-07-26**: migración 017, enum `estado_reserva` con valor `vencida` |
| EST-03 | Sólo un check-in real finaliza el alquiler | ✅ | — | **Arreglado 2026-07-26**: `sincronizar_estados_por_horario()` ya no pasa a `finalizada`, sólo a `vencida` |
| EST-04 | Estado CERRADA (finalizada + sin saldo) | ⬜ | P2 | Evita recalcular deudas todo el tiempo |
| EST-05 | Estados del vehículo automáticos | ✅ | — | `domain/transiciones.py`, correcto |
| EST-06 | Estado "en transición" (<4 hs a la próxima) | ✅ | — | Buen detalle |
| EST-07 | Vehículo trabado en "alquilado" si no hay check-in | ✅ | — | Resuelto junto con EST-02/EST-03: el check-in ahora corre normalmente sobre `vencida` |
| EST-08 | Bloqueo de vehículo por fechas (mantenimiento) | ⬜ | P2 | Hoy sólo `fuera_de_servicio` sin fechas |

## PRE — Precios y tarifas

| ID | Caso de uso | Estado | Prio | Nota |
|---|---|---|---|---|
| PRE-01 | **Tarifa semanal/mensual bien calculada** | 🔴 | **P0** | Multiplica el precio de la banda por día. Error de ~6× |
| PRE-02 | Tarifa por vehículo específico | ✅ | — | |
| PRE-03 | **Tarifa por categoría** | ⬜ | P1 | No existe el concepto de categoría |
| PRE-04 | Tarifa general (fallback) | ✅ | — | |
| PRE-05 | Selección por banda de duración | ✅ | — | <7 / 7-29 / 30+ |
| PRE-06 | Bandas de duración configurables | ⬜ | P2 | Hoy hardcodeadas |
| PRE-07 | Carga por precio/día o por total de la banda | ⬜ | P1 | Es lo que evita PRE-01 |
| PRE-08 | Ver el descuento implícito entre bandas | ⬜ | P2 | |
| PRE-09 | Precio manual negociado | 🟡 | P1 | Se puede, pero sin registro de quién ni por qué |
| PRE-10 | Descuento con motivo y autorización | ⬜ | P1 | |
| PRE-11 | Reporte de descuentos por usuario | ⬜ | P2 | |
| PRE-12 | Congelar el precio al confirmar | 🟡 | P1 | Se guarda, pero `extender()` lo recalcula |
| PRE-13 | Snapshot de la tarifa aplicada | ⬜ | P2 | Para poder explicar un precio dos años después |
| PRE-14 | Precio distinto con y sin factura | ⬜ | P1 | |
| PRE-15 | Historial de precios sin borrar | 🟡 | P2 | Hay `vigencia_desde`, falta `vigencia_hasta` |
| PRE-16 | Precio por temporada / fechas especiales | ⬜ | 🔵 | Motor de calendario con prioridades |
| PRE-17 | Precio por día de la semana | ⬜ | 🔵 | Fin de semana más caro |
| PRE-18 | Precio web ≠ precio mostrador | ⬜ | 🔵 | |
| PRE-19 | Endpoint de cálculo con desglose día por día | ⬜ | P1 | Reutilizable en reserva, cotizador y web |

## CLI — Clientes

| ID | Caso de uso | Estado | Prio | Nota |
|---|---|---|---|---|
| CLI-01 | Alta, edición y baja lógica | ✅ | — | |
| CLI-02 | Distinguir particular / empresa | 🟡 | P1 | Sólo cambia la etiqueta "DNI"/"CUIT" |
| CLI-03 | Formulario condicional por tipo | ⬜ | P1 | |
| CLI-04 | **Contacto de la empresa con su puesto** | ⬜ | P1 | Nueva tabla `contactos_cliente` |
| CLI-05 | Varios contactos por empresa | ⬜ | P2 | Quién firma ≠ quién paga ≠ quién recibe facturas |
| CLI-06 | Datos fiscales (razón social, IVA, domicilio) | ⬜ | P1 | Necesario para facturar |
| CLI-07 | Validar dígito verificador del CUIT | ⬜ | P2 | |
| CLI-08 | **Corregir un DNI/CUIT mal cargado** | ✅ | — | **Arreglado 2026-07-26**: `ClienteUpdate` acepta `dni_cuit`, valida unicidad excluyéndose a sí mismo |
| CLI-09 | Cambiar tipo particular ↔ empresa | ✅ | — | **Arreglado 2026-07-26**: `ClienteUpdate.tipo` ahora editable (de paso, junto con CLI-08) |
| CLI-10 | **Cargar número y categoría de licencia** | ✅ | — | **Arreglado 2026-07-26**: `licencia_numero`/`licencia_categoria` expuestos en `ClienteBase`/`ClienteUpdate` |
| CLI-11 | Impedir cliente sin licencia | ⬜ | P1 | **2026-07-26**: ya no acepta `""` (rota → `None` explícito por la migración de fechas), pero sigue siendo opcional a propósito — decisión de producto pendiente, no técnica |
| CLI-12 | Conductores adicionales | ✅ | — | |
| CLI-13 | Impedir baja con alquiler activo | ✅ | — | **Arreglado 2026-07-26**: bloquea si tiene reservas en `pendiente/confirmada/activa/vencida` |
| CLI-14 | Lista negra | ⬜ | P2 | Hoy nada impide realquilarle a quien no pagó |
| CLI-15 | Fecha de nacimiento / edad mínima | ⬜ | P2 | |
| CLI-16 | Antigüedad de licencia | ⬜ | P3 | |
| CLI-17 | Extranjeros (pasaporte, licencia de otro país) | ⬜ | P3 | |
| CLI-18 | Documentos del cliente | ✅ | — | |
| CLI-19 | Tarjeta protegida con PIN | 🟡 | P2 | PIN hardcodeado; debe pasar a permiso por rol |
| CLI-20 | Semáforo de habilitación en la ficha | ⬜ | P2 | Licencia, deuda, no-shows, lista negra |
| CLI-21 | Timeline unificado del cliente | ⬜ | P2 | Hoy fragmentado en 6 tabs |
| CLI-22 | Historial completo | ✅ | — | |

## VEH — Flota y vencimientos

| ID | Caso de uso | Estado | Prio | Nota |
|---|---|---|---|---|
| VEH-01 | Alta, edición, baja lógica, reactivación | ✅ | — | |
| VEH-02 | Dry-run de reservas afectadas al inactivar | ✅ | — | Muy buen detalle |
| VEH-03 | Documentos con vencimiento | ✅ | — | |
| VEH-04 | **VTV como campo del vehículo** | ⬜ | P1 | Hoy sólo existe si alguien sube el PDF |
| VEH-05 | **Póliza como campo (nº, compañía, vencimiento)** | ⬜ | P1 | Ídem |
| VEH-06 | Patente / impuestos | ⬜ | P2 | No existe |
| VEH-07 | Matafuego, botiquín, balizas | ⬜ | P3 | No existe |
| VEH-08 | Service por kilometraje | ✅ | — | |
| VEH-09 | **Service por fecha** | ⬜ | P1 | `proxima_fecha` existe y nadie la consulta |
| VEH-10 | Historial de servicios | ✅ | — | |
| VEH-11 | Gastos por vehículo | ✅ | — | |
| VEH-12 | Categoría de vehículo | ⬜ | P1 | Prerequisito de PRE-03 y de la web |
| ~~VEH-13~~ | ~~Capacidad de tanque~~ | ❌ | — | **Descartado (D-20).** El nivel visual por fracciones alcanza; el importe del gasto se carga a mano |
| VEH-14 | Datos registrales (chasis, motor, titular) | ⬜ | P2 | |
| VEH-15 | Specs (transmisión, pasajeros, valijas, AC) | ⬜ | 🔵 | Para mostrar en la web |
| VEH-16 | Foto del vehículo | ✅ | — | |
| VEH-17 | Orden manual en el calendario | ✅ | — | |
| VEH-18 | Ningún vencimiento bloquea nada | 🔴 | P1 | Ver matriz de bloqueos en el análisis |

## DAN — Daños y estado del vehículo

| ID | Caso de uso | Estado | Prio | Nota |
|---|---|---|---|---|
| DAN-01 | Parte de daños con croquis y fotos | ⬜ | P2 | Hoy: dos campos de texto libre |
| DAN-02 | Mostrar daños preexistentes en el check-in | ⬜ | P2 | Sólo marcar los nuevos |
| DAN-03 | Valorizar daños y cobrarlos | ⬜ | P2 | |
| DAN-04 | Ejecutar la garantía por daños | ⬜ | P2 | |

## FIN — Finanzas

| ID | Caso de uso | Estado | Prio | Nota |
|---|---|---|---|---|
| FIN-01 | Registrar cobros | ✅ | — | |
| FIN-02 | Caja diaria con ingresos y egresos | ✅ | — | |
| FIN-03 | Cobros pendientes centralizados | ✅ | — | |
| FIN-04 | **Anular un pago sin borrarlo** | ✅ | — | **Completado 2026-07-26**: con el ledger ya construido, borrar un pago en cta. cte. anula el movimiento con contra-asiento en vez de bloquear. Pagos normales se siguen borrando igual |
| FIN-05 | Pago sin alquiler asociado (a cuenta) | ⬜ | P1 | `alquiler_id` es NOT NULL |
| FIN-06 | Cuenta corriente por cliente | ✅ | — | **Arreglado 2026-07-26**: ahora es un ledger — `saldo_posterior` en cada movimiento, nunca se edita a mano |
| FIN-07 | **Condición de pago (contado / 15 / 30 / 60 / 90)** | ✅ | — | **Hecho 2026-07-26**: campo `condicion` por movimiento y `condicion_pago` default por cuenta |
| FIN-08 | **Fecha de vencimiento por movimiento** | ✅ | — | **Hecho 2026-07-26**: se calcula solo desde la condición (`domain/cuenta_corriente.py`), o se puede fijar a mano |
| FIN-09 | Aging de deuda (0-30 / 31-60 / 61-90 / +90) | ⬜ | P1 | El dato (`fecha_vencimiento`) ya existe; falta la vista agrupada en la UI |
| FIN-10 | Límite de crédito por cliente | 🟡 | P2 | Campo `limite_credito` ya existe en el modelo; falta la alerta al superarlo |
| FIN-11 | Asientos automáticos desde alquiler/pago/multa | 🟡 | P1 | **Arreglado 2026-07-26**: checkout, anticipo, cobros en checkout/check-in y excedente ya generan asiento automático (ledger completo, confirmado con el usuario — pendiente ok final de Franco/Martín, ver `VALIDAR_CON_DUENOS.md`). Falta sólo el de **multa** |
| FIN-12 | Anular movimiento con contra-asiento | ✅ | — | **Hecho 2026-07-26**: `POST /cuentas-corrientes/movimientos/{id}/anular`. El borrado de un pago en cta. cte. ahora anula el movimiento automáticamente en vez de bloquear |
| FIN-13 | **Echeq vinculado al cliente** | ⬜ | P1 | Hoy `contraparte` es texto libre |
| FIN-14 | **Echeq con importe y fecha de pago** | 🟡 | P1 | Falta separar fecha de pago de fecha de acreditación |
| FIN-15 | Ciclo completo del echeq | 🟡 | P1 | **2026-07-26**: se arregló que el ciclo funcionara en absoluto (ver hallazgo abajo). Sigue faltando el caso de rechazo con contra-asiento (Fase 1) |
| FIN-16 | Echeq genera movimiento en cuenta corriente | ⬜ | P1 | |
| FIN-17 | Cartera de echeqs por mes | ⬜ | P2 | Saber con qué plata se cuenta |
| FIN-18 | **Recibos con PDF estético** | ⬜ | P1 | Ver RCB-* |
| FIN-19 | Facturas / comprobantes | ⬜ | P1 | Hoy sólo un booleano `con_factura` |
| FIN-20 | Multa imputada genera deuda | ⬜ | P2 | Hoy queda aislada |
| FIN-21 | Reportes de ingresos y flota | ✅ | — | |
| FIN-22 | Separar facturado / no facturado en reportes | ⬜ | P1 | |
| FIN-23 | Facturación electrónica AFIP | ⬜ | P3 | Diferido; dejar los campos preparados |

## RCB — Recibos

| ID | Caso de uso | Estado | Prio | Nota |
|---|---|---|---|---|
| RCB-01 | Generar recibo por monto y cliente | ⬜ | P1 | |
| RCB-02 | Numeración correlativa segura | ⬜ | P1 | Secuencia de base, no `MAX+1` |
| RCB-03 | Recibo "a cuenta" | ⬜ | P1 | El caso más común |
| RCB-04 | Recibo imputado a deudas puntuales | ⬜ | P1 | Propuesta FIFO editable |
| RCB-05 | Excedente queda como saldo a favor | ⬜ | P1 | |
| RCB-06 | Medios de pago múltiples en un recibo | ⬜ | P2 | Parte efectivo + parte transferencia |
| RCB-07 | Monto en letras | ⬜ | P1 | Le da carácter de recibo |
| RCB-08 | Saldo anterior → pago → saldo actual | ⬜ | P1 | Lo que el cliente quiere ver |
| RCB-09 | Párrafo de agradecimiento fijo | ⬜ | P1 | Pre-escrito, como el cotizador |
| RCB-10 | Descargar PDF | ⬜ | P1 | |
| RCB-11 | Enviar por email | ⬜ | P2 | Resend ya está |
| RCB-12 | Anular con contra-recibo | ⬜ | P1 | Nunca borrar |
| RCB-13 | Recibo de seña | ⬜ | P2 | Misma plantilla, otra variante |
| RCB-14 | Recibo de devolución de garantía | ⬜ | P2 | Ídem |
| RCB-15 | Pipeline de PDF server-side | ⬜ | P1 | Base también para contratos y facturas |

## NOT — Alertas y notificaciones

| ID | Caso de uso | Estado | Prio | Nota |
|---|---|---|---|---|
| NOT-01 | Campana con alertas en vivo | ✅ | — | **Arreglado 2026-07-25**: se corrigió el tipo de comparación. Verificado en vivo con datos reales (aparece `pago_pendiente` sin crashear) |
| NOT-02 | **Envío automático de alertas** | 🔴 | **P0** | El scheduler nunca arrancó — sólo hace `print()` |
| NOT-03 | Un solo motor de reglas | 🔴 | P1 | Hay dos sistemas paralelos y divergentes |
| NOT-04 | Persistir notificaciones | ⬜ | P1 | Hoy se computan al abrir la campana |
| NOT-05 | Marcar leído / posponer / descartar | ⬜ | P1 | |
| NOT-06 | Deduplicación | ⬜ | P1 | Para que no se repita todos los días |
| NOT-07 | Auto-resolución | ⬜ | P1 | Si se cobró el echeq, la alerta se apaga sola |
| NOT-08 | **Digest matutino a las 08:00** | ⬜ | P1 | Pedido explícito. Con TZ Argentina |
| NOT-09 | **Echeq a cobrar: aviso T-2 días** | ⬜ | P1 | Pedido explícito |
| NOT-10 | Echeq vence hoy / no acreditado / rechazado | ⬜ | P1 | |
| NOT-11 | Vencimiento de cuenta corriente T-3 y T-0 | ⬜ | P1 | |
| NOT-12 | Deuda vencida con escalamiento | ⬜ | P1 | +1, +7, +15, +30 días |
| NOT-13 | Entregas y devoluciones de hoy | 🟡 | P1 | Existe en el dashboard, no como alerta |
| NOT-14 | **Auto no devuelto** | ✅ | — | **Arreglado 2026-07-26**: ahora filtra `estado == 'vencida'` directo, con horas de atraso calculadas |
| NOT-15 | Documentos por vencer (30/15/7/1) | 🟡 | P1 | Sólo 30 días, y no se envía |
| NOT-16 | Licencia de cliente por vencer | 🔴 | P1 | Sólo en el módulo huérfano |
| NOT-17 | Service próximo / vencido | ✅ | — | Se detecta; no se envía |
| NOT-18 | Multas pendientes | ✅ | — | Ídem |
| NOT-19 | Garantía sin resolver | ✅ | — | Ídem |
| NOT-20 | Preferencias por usuario | ⬜ | P2 | Evita que apaguen todo por saturación |
| NOT-21 | Email como canal | ⬜ | P1 | Resend integrado pero sin usar |
| NOT-22 | Push web | ⬜ | P3 | |
| NOT-23 | WhatsApp automático | ⬜ | P3 | Requiere WhatsApp Business API. **Descartado por ahora** |

## CON — Contratos

| ID | Caso de uso | Estado | Prio | Nota |
|---|---|---|---|---|
| CON-01 | **Texto legal del contrato** | ⬜ | P1 | ⚠️ No existe. Lo tienen que aportar ellos — mayor lead time del proyecto |
| CON-02 | Generar PDF con datos del alquiler | ⬜ | P1 | El router es un TODO de 18 líneas |
| CON-03 | Firma en pantalla | ⬜ | P1 | |
| CON-04 | Bloquear check-out sin contrato firmado | ⬜ | P1 | Ver CHK-08 |
| CON-05 | Link prellenado para firmar antes | ⬜ | P2 | El modelo ya lo contempla |
| CON-06 | Mostrar el contrato en la web antes de pagar | ⬜ | 🔵 | |

## SEG — Seguridad y auditoría

| ID | Caso de uso | Estado | Prio | Nota |
|---|---|---|---|---|
| SEG-01 | **Auth real con Clerk** | ⬜ | P1 | Hoy `DEV_BYPASS_AUTH=true` |
| SEG-02 | Roles (dueño / operador / documentación) | ⬜ | P1 | |
| SEG-03 | Sync de usuarios por webhook | ⬜ | P1 | |
| SEG-04 | Backfill del histórico al usuario real | ⬜ | P2 | |
| SEG-05 | PIN de tarjeta como permiso, no constante | ⬜ | P2 | Hoy `Ubicar123` hardcodeado |
| SEG-06 | Audit log de operaciones sensibles | ⬜ | P2 | Pagos, precios, cancelaciones, bonificaciones |
| SEG-07 | Override de bloqueos con motivo registrado | ⬜ | P2 | |

## CFG — Configuración

| ID | Caso de uso | Estado | Prio | Nota |
|---|---|---|---|---|
| CFG-01 | Pantalla de configuración | ⬜ | P2 | Todo esto está hardcodeado hoy |
| CFG-02 | Minutos de gracia | ⬜ | P2 | |
| CFG-03 | Multiplicador de hora excedente | ⬜ | P2 | |
| CFG-04 | Umbral de día completo | ⬜ | P2 | |
| CFG-05 | Buffer entre alquileres | ⬜ | P2 | |
| CFG-06 | Cargos fijos (limpieza, combustible) | ⬜ | P2 | |
| CFG-07 | Umbrales de aviso | ⬜ | P2 | |
| CFG-08 | Política de no-show y cancelación | ⬜ | P2 | |
| CFG-09 | Límites de descuento por rol | ⬜ | P3 | |
| CFG-10 | Datos de la empresa (para PDFs) | ⬜ | P2 | |

## UI — Interfaz

| ID | Caso de uso | Estado | Prio | Nota |
|---|---|---|---|---|
| UI-01 | Calendario de ocupación | ✅ | — | Muy bueno |
| UI-02 | Vista agenda mobile | ✅ | — | |
| UI-03 | Dashboard operativo | ✅ | — | |
| UI-04 | **Menú más chico** | ⬜ | P2 | 9 items → 6 grupos |
| UI-05 | **Más filas visibles en Reservas** | ⬜ | P2 | Sidebar auto-colapsado + filtros plegables |
| UI-06 | Toggle de densidad | ⬜ | P3 | |
| UI-07 | Panel de estado en la ficha de reserva | ⬜ | P1 | Qué pasa y qué hacer, sin cruzar pantallas |
| UI-08 | Liquidación completa en el check-in | ⬜ | P1 | |
| UI-09 | Semáforo de validaciones en el check-out | ⬜ | P1 | |
| UI-10 | Grilla de tarifas por categoría y banda | ⬜ | P1 | |
| UI-11 | Búsqueda global (Cmd+K) | ⬜ | P3 | |
| UI-12 | Unificar paleta e íconos | ⬜ | P2 | Conviven 3 sistemas de color |
| UI-13 | Confirmaciones consistentes | ⬜ | P3 | Hay `confirm()` nativo mezclado con `ConfirmDialog` |
| UI-14 | Limpiar archivos muertos | ✅ | — | **Hecho 2026-07-26**: 7 archivos borrados (`List.tsx`/`Detail.tsx` + 5 previews del cotizador sin usar), verificado con `tsc` |

## WEB — Sistema de reservas online 🔵

| ID | Caso de uso | Estado | Prio | Nota |
|---|---|---|---|---|
| WEB-01 | **Disponibilidad real por rango de fechas** | 🔴 | 🔵 | El endpoint actual ignora las fechas que recibe |
| WEB-02 | Disponibilidad por cupo de categoría | ⬜ | 🔵 | |
| WEB-03 | **Reservar por categoría, no por vehículo** | ⬜ | 🔵 | Cambio estructural de mayor riesgo |
| WEB-04 | Holds temporales (15-20 min) | ⬜ | 🔵 | Sin esto hay sobreventa |
| WEB-05 | Paso 1: lugares, fechas, categorías con foto | ⬜ | 🔵 | |
| WEB-06 | Paso 2: adicionales | ⬜ | 🔵 | |
| WEB-07 | Seguros excluyentes con franquicia | ⬜ | 🔵 | Franquicia $2.000.000 y variantes |
| WEB-08 | Paso 3: datos, contrato y pago | ⬜ | 🔵 | |
| WEB-09 | Mercado Pago con webhook idempotente | ⬜ | 🔵 | |
| WEB-10 | Seña del 30% | ⬜ | 🔵 | A confirmar |
| WEB-11 | Re-verificar disponibilidad en el webhook | ⬜ | 🔵 | Evita vender dos veces |
| WEB-12 | Bandeja de reservas web: aceptar / rechazar | ⬜ | 🔵 | Con criterio híbrido |
| WEB-13 | Matchear cliente existente por DNI/email | ⬜ | 🔵 | No duplicar fichas |
| WEB-14 | Sucursales / puntos de retiro | ⬜ | 🔵 | |
| WEB-15 | Cargo one-way | ⬜ | 🔵 | |
| WEB-16 | "Mi reserva": consultar y cancelar sin login | ⬜ | 🔵 | |
| WEB-17 | Landing con catálogo y SEO | ⬜ | 🔵 | |
| WEB-18 | Rate limiting y captcha | ⬜ | 🔵 | |

---

## Resumen por prioridad

| Prioridad | Cantidad | Qué son |
|---|---|---|
| **P0** | **12** | Bugs que hacen perder plata o bloquean la operación |
| P1 | 88 | Necesario para producción |
| P2 | 62 | Mejoras importantes |
| P3 | 15 | Deseable |
| 🔵 Web | 18 | Dependen del sistema de reservas online |

**Los 12 P0** (arreglar primero, son todos correcciones acotadas). **11 de 12 ya están resueltos.**

**✅ Resueltos (2026-07-25 / 2026-07-26), probados en vivo contra la base de datos real:**

| ID | Qué | Arreglo |
|---|---|---|
| CHK-05 / CIN-11 | Cobrar en check-out o check-in devuelve error 500 | `Pago(usuario_id=)` → `cobrado_por=` (3 sitios) + se dejó de pasar `date` a un campo `String` |
| CHK-06 | El anticipo se cuenta dos veces | `notificaciones.py` y `pagos.py` dejaron de sumar `anticipo_monto` donde ya existe el `Pago` del checkout |
| CHK-07 | El kilometraje puede retroceder | `BusinessRuleError` si `checkout_km < vehiculo.km_actual` |
| RES-11 | Extender sin tarifa borra el precio | Conserva `precio_total` anterior en vez de anularlo, con log de la situación |
| NOT-01 | El endpoint de notificaciones crashea | `date < str` corregido a `date < date`; verificado con `pago_pendiente` real sin crashear |
| **CIN-02** | **No se puede registrar una devolución tardía** | Nuevo estado `vencida` (migración 017). `sincronizar_estados_por_horario()` ya no finaliza, sólo pasa a vencida; `checkin()` acepta activa **o** vencida |
| **EST-02 / EST-03** | **El reloj finalizaba alquileres que nunca volvieron** | Mismo fix que CIN-02 — la finalización real sólo ocurre con un check-in |
| **EST-07** | **Vehículo trabado en "alquilado"** | Resuelto: el check-in ya puede ejecutarse sobre `vencida` |
| **NOT-14** | **La alerta de auto no devuelto era inalcanzable** | Ahora filtra `estado == 'vencida'` con horas de atraso calculadas en la descripción |

**⬜ Pendiente** — el único que sigue abierto de los 12 originales:

| ID | Qué | Nota |
|---|---|---|
| PRE-01 | La tarifa semanal se multiplica por día | Necesita el rediseño de tarifas de la Fase 1 (`precio_por_dia` explícito) |

**✅ CIN-03 resuelto (2026-07-26):** con la decisión D-18 (modelo 24hs estricto), la fórmula de `control_24hs.py` ya era correcta — lo que faltaba era que `hora_fin` se derive de `hora_inicio` en el formulario de reserva. `ReservaModal.tsx` ahora bloquea ese campo (`horaFin = horaInicio`, disabled) y muestra una nota explicando que el "Late Checkout acordado" (ya existente) es la única excepción.

**✅ D-19 implementado (2026-07-26):** las 4 opciones de contracargo al check-in (completo / parcial / **1 día más** / **medio día más** / **monto manual** / bonificado) descritas en `docs/DECISIONES.md`. Nuevos valores en `DecisionExcedente` (`un_dia_mas`, `medio_dia_mas`, `monto_manual`), nuevo campo `monto_manual` en `CheckinCreate`, y validación a nivel de schema (no sólo frontend) para exigir motivo al bonificar y monto al elegir "monto manual". Probado en vivo con el service real: 1 día = tarifa diaria completa, medio día = exactamente la mitad, monto manual = el importe indicado tal cual.

**Otros bugs P0 pendientes que dependen de piezas más grandes:**

| ID | Qué | Nota |
|---|---|---|
| FIN-04 | Borrar un pago no revierte la cuenta corriente | Requiere el rediseño del ledger de cuenta corriente (Fase 1) |
| NOT-02 | El scheduler de alertas nunca arrancó | Requiere el motor de notificaciones de la Fase 2 |

**🆕 Hallazgo nuevo, no estaba en el catálogo original (2026-07-26):**

El botón de Check-in **nunca aparecía en la lista de reservas**, para ningún alquiler, en ningún caso — un bug independiente y más fundamental que CIN-02. La condición en `ReservasList.tsx:300` (`r.alquiler_id && r.alquiler_estado === 'activo'`) dependía de `Reserva.alquiler_estado`, una property que intentaba leer `self.alquiler.estado` — una columna que **no existe** en el modelo `Alquiler`. Eso lanzaba `AttributeError`, silenciado por el default de Pydantic (`alquiler_estado: str | None = None`), así que el campo **siempre** viajaba como `null` sin que nadie lo notara. Además había una **definición duplicada** de la misma property más abajo en el archivo, que pisaba silenciosamente cualquier arreglo hecho en la primera. Arreglado: se unificó en una sola property que deriva `"activo"`/`"finalizado"` de `alquiler.checkin_fecha`. Verificado en vivo: antes del fix devolvía `null` con un alquiler abierto; después, `"activo"`.

**🆕 Segundo hallazgo nuevo (2026-07-26):** `PATCH /clientes/{id}` y `DELETE /clientes/{id}` (baja lógica) **nunca funcionaron**. `cliente_service.py` llamaba `self.repo.update(cliente)`, pero `ClienteRepository` — que hereda de `BaseRepository` — no tiene (ni heredó) ningún método `update()`. Eso lanza `AttributeError`, no capturado por ningún exception handler registrado en `main.py`, así que cualquier edición o baja de un cliente devolvía un 500 crudo. Se revisó el resto de los repos que heredan de `BaseRepository` (`documento_repo`, `gasto_repo`, `tarifa_repo`, `vehiculo_repo`) y ninguno de sus servicios llama a `self.repo.update()` — usan el patrón de `vehiculo_service.py` (`setattr` + `self.db.commit()` + `refresh()` directo). Arreglado: `cliente_service.py` sigue el mismo patrón que `vehiculo_service.py`, sin necesitar tocar el repositorio. Verificado en vivo con 6 casos (crear, editar licencia, corregir DNI, rechazar DNI duplicado, dar de baja sin reservas, bloquear baja con reserva activa) — los 6 pasaron.

**🆕 Tercer hallazgo nuevo (2026-07-26):** `/reportes/flota` crasheaba con `TypeError` apenas había una reserva real en el rango de fechas consultado. `fecha_desde`/`fecha_hasta` llegaban como `str` (query params), y el código hacía `max(r.fecha_inicio, fecha_desde)` — comparando un `date` (columna real de `Reserva`) contra un `str`, algo que Python no permite. Sólo "funcionaba" en desarrollo porque nunca se había probado con una reserva real superpuesta al rango. Arreglado: los query params pasan a `date` (FastAPI los parsea solo), eliminando también los `try/except ValueError` manuales que rodeaban conversiones redundantes. Verificado en vivo: con datos reales, el reporte calculó correctamente 3 y 2 días de ocupación para los dos vehículos con reservas en el rango consultado.

**Además, corregidos en este mismo batch aunque no estaban en la lista original de 12:**
- Código muerto eliminado en la validación de fecha futura del checkout (`alquiler_service.py`)
- N+1 del calendario: `joinedload(Reserva.alquiler)` agregado a `find_para_ocupacion`
- Dashboard: `refetchInterval` de 15s → 2min (240 ejecuciones/hora por usuario contra un endpoint pesado)
- `extender()` sobre una reserva `vencida` ahora vuelve a `activa` si la nueva fecha queda en el futuro (evita que quede "vencida" para siempre tras extenderla)
- Descubierto: **todas las migraciones de Alembic están en `.gitignore`** (`backend/alembic/versions/*.py`), incluidas las 16 existentes de antes de esta sesión. Sólo las migraciones 017 y 018 de esta sesión se agregaron a git de forma forzada (`git add -f`) para que los cambios de esquema sean reproducibles en otro entorno. Vale revisar esa regla del `.gitignore` — probablemente sea un descuido, no una decisión.
- **Fase 0 ítem #10 completo**: migración `018_fechas_date` — `pagos.fecha`, `gastos.fecha`, `echeqs.fecha_emision/fecha_cobro`, `movimientos_cuenta_corriente.fecha`, `clientes.licencia_vencimiento`, `conductores_adicionales.licencia_vencimiento`, `documentos.vigencia_desde/vigencia_hasta`, `reservas.anticipo_fecha` — todas migradas de `String(10)` a `Date` real. Simplificó de paso varios `.isoformat()`/`_parse_iso()` que ya no hacían falta en `documento_service.py` y `gasto_service.py`.

**🆕 Quinto hallazgo nuevo (2026-07-26), el más serio de este grupo:** al probar el bloqueo de FIN-04, un pago con `medio_pago="cuenta_corriente"` crasheaba con `LookupError: 'cuenta_corriente' is not among the defined enum values`. La migración 013 (`013_caja_echeq_cc.py`) había agregado `'cuenta_corriente'` al enum de Postgres `medio_pago` con `ALTER TYPE`, pero el modelo SQLAlchemy (`models/pago.py`) seguía declarando el `Enum(...)` de Python con sólo los 5 valores originales — la migración tocó la base pero nadie actualizó el modelo. **Cobrar un alquiler con "Cuenta Corriente" nunca funcionó desde que se implementó.**

Se revisó si el mismo patrón se repetía en otro lado y sí: `models/echeq.py`'s `estado` sólo declaraba `pendiente, cobrado, rechazado, vencido` en Python, cuando la migración 013 también había agregado `en_cartera, depositado, endosado` al enum de Postgres — y son justamente los estados intermedios del ciclo de vida real del echeq (`en_cartera → depositado/endosado → cobrado`). **Cualquier transición de estado de un echeq más allá de "pendiente" crasheaba.** De paso se corrigió el valor por defecto de un echeq nuevo: pasa de `"pendiente"` (marcado como legacy en el propio schema, "no usar en registros nuevos") a `"en_cartera"`, alineado con lo que el código ya documentaba como la intención correcta.

Arreglado agregando los valores faltantes a los `Enum(...)` de SQLAlchemy en ambos modelos — sin migración nueva, porque Postgres ya tenía los valores desde 2026-06-26. Verificado en vivo vía HTTP real: pago por cuenta corriente (201), bloqueo de borrado de ese pago (409), echeq creado en `en_cartera` (201), transición completa `en_cartera → depositado → cobrado` (200 cada paso), y un pago normal en efectivo se sigue pudiendo borrar sin cambios (204).

---

## Pendiente a futuro (no ahora)

**Diagramas.** Cuando el modelo esté estabilizado (después de la Fase 1), vale la pena generar:

1. **Diagrama de estados** de la reserva y del vehículo, con las transiciones y quién las dispara.
2. **Diagrama de entidad-relación** actualizado — ya existe `docs/er-diagram.html` pero quedó desactualizado frente a los modelos actuales.
3. **Flujo del ciclo operativo** de punta a punta: reserva → check-out → alquiler → check-in → liquidación → cobro → comprobante.
4. **Mapa de conexiones entre módulos**, mostrando qué genera asientos en la cuenta corriente y qué dispara notificaciones.
5. **Flujo del sistema de reservas web**, desde la búsqueda hasta la bandeja de aprobación.

Conviene hacerlos **después** de la Fase 1, no antes: hoy el modelo va a cambiar bastante (estados nuevos, categorías, ledger) y un diagrama hecho ahora nace desactualizado. Se pueden generar en Mermaid dentro de estos mismos `.md` para que vivan versionados junto al código.

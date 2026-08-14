# Decisiones de producto — Ubicar Rent

**Registro de decisiones tomadas.** Cada una fija cómo se construye el sistema. Si alguna cambia, se actualiza acá y se revisan los documentos afectados.

> ⚠️ **Quién decidió qué.** Todas las decisiones de este documento las tomó
> **Gael**, para poder avanzar con la construcción. **Los dueños no confirmaron
> ninguna todavía** — es justamente lo que hay que llevar a la reunión.
>
> Están tomadas con criterio y ya están implementadas y funcionando, así que
> revisarlas no frena nada: cambiar cualquiera es cambiar un valor o un texto,
> no reescribir el sistema. Pero **no hay que presentarlas como acordadas**.

---

## Bloque 1 — Finanzas

### D-01 · Signo del saldo de cuenta corriente ✅ DECIDIDO
**Saldo positivo = el cliente debe.** No se usa el negativo para representar deuda.

- DEBE (débito) → aumenta la deuda: alquiler facturado, multa imputada, nota de débito
- HABER (crédito) → la baja: pago, recibo, echeq acreditado, nota de crédito
- Saldo negativo = saldo a favor del cliente (anticipo)

⚠️ **Impacto:** `CuentaCorrienteTab.tsx` usa hoy la convención inversa. Hay que invertir el frontend y migrar los saldos existentes.

### D-05 · Facturación electrónica AFIP ✅ DECIDIDO
**No entra en el MVP.** Los comprobantes se cargan manualmente con su PDF adjunto.
Los campos `cae` y `cae_vencimiento` se dejan preparados en la tabla `comprobantes` para no migrar después.

### D-14 · Numeración de recibos ✅ DECIDIDO — ✅ IMPLEMENTADO (2026-07-26)
**Arranca en `00001` y avanza.** No es un comprobante fiscal — es un respaldo para el cliente.

> **Aclaración sobre "punto de venta":** era un concepto de facturación AFIP (el `0001-` de `0001-00000042` identifica desde qué sucursal o caja se emitió). Como el recibo no es fiscal, no hace falta. **Formato: `RECIBO N° 00001`.**
>
> Igual conviene guardar el campo `prefijo` en la tabla con valor fijo `"R"`, por dos razones: si el día de mañana emiten desde dos lugares o incorporan facturación, no hay que migrar nada. Cuesta cero ahora.

**Técnico:** secuencia de base de datos, nunca `MAX(numero)+1`, con constraint único. Si dos personas generan un recibo al mismo tiempo, no se duplica el número.

**Implementado tal cual:** secuencia `recibos_numero_seq` (migración 022) + columna `prefijo` con default `"R"`. Ver `docs/PLAN_MAESTRO.md` sección 3.6.

### D-15 · Texto de agradecimiento del recibo ✅ DECIDIDO — ✅ IMPLEMENTADO (2026-07-26)

> *Gracias por elegir Ubicar Rent. Su confianza es lo que nos impulsa a seguir mejorando el servicio día a día. Quedamos a su disposición para su próximo alquiler.*

El texto es **fijo y pre-escrito**, no editable por el operador — misma decisión que se tomó para el cotizador: siempre la voz de Ubicar Rent.

**Implementado tal cual** en `backend/app/services/recibo_pdf.py` — texto exacto de arriba, sin variación.

### D-16 · Envío del recibo ✅ DECIDIDO — ✅ IMPLEMENTADO (descarga), pendiente (email)
**Se descarga y se manda a mano por WhatsApp.** Botón "Descargar PDF" como acción principal.
Email queda **pendiente pero probable** — se deja el botón preparado y deshabilitado, con Resend ya integrado por detrás.

**Implementado:** descarga vía `GET /recibos/{id}/pdf`, botón en el tab Recibos del cliente. **No implementado:** el botón de email deshabilitado — se agrega cuando se retome esa fase.

---

## Bloque 2 — Reservas y precios

### D-08 · Categorías de vehículo ✅ DECIDIDO
Se toman las del módulo de Cotizaciones, más Furgón:

| Código | Nombre |
|---|---|
| `compacto` | Compacto |
| `sedan` | Sedán |
| `sedan_superior` | Sedán superior |
| `suv` | SUV |
| `pickup` | Pick-up |
| `furgon` | **Furgón** (nuevo) |

Cada categoría lleva: nombre, descripción, **foto representativa**, orden, y specs (pasajeros, valijas, transmisión, aire) para la web.
Cada vehículo se asigna a una categoría. Las tarifas se pueden cargar **por categoría o por vehículo puntual** (el vehículo específico gana).

### D-09 · Adicionales con reglas de aplicación ✅ DECIDIDO
Los cargan ellos manualmente, y **cada adicional tiene reglas que definen cuándo aplica, cuándo es gratis y cuándo no está disponible.**

Ejemplo que dieron: *pet friendly es gratis en alquileres de +30 días, pero se cobra en uno de 2 días.*

**Motor de reglas propuesto.** Cada adicional puede tener una o más reglas, evaluadas de la más específica a la más general:

| Tipo de regla | Para qué sirve | Ejemplo |
|---|---|---|
| **Por duración** | Bonificar o encarecer según los días | Pet friendly gratis desde 30 días |
| **Escalonada por duración** | Precio distinto por tramo | Silla de bebé $3.000/día los primeros 7 días, después gratis |
| **Tope de cobro** | No cobrar más de N días aunque el alquiler sea más largo | GPS: se cobran máximo 10 días |
| **Por categoría** | Sólo disponible para ciertos vehículos | Portaequipaje sólo en SUV y Pick-up. Cadenas no aplican a Furgón |
| **Por temporada / fechas** | Disponible o más caro en ciertas épocas | Cadenas sólo de junio a septiembre |
| **Por sucursal** | Cargo o disponibilidad según el punto de retiro | Retiro en aeropuerto: cargo fijo |
| **Por tipo de cliente** | Bonificar a empresas o frecuentes | Conductor adicional sin cargo para clientes con cuenta corriente |
| **Obligatorio condicional** | Se impone solo en ciertos casos | Seguro básico siempre obligatorio |
| **Excluyente** | Elegir uno de un grupo | Los tres niveles de seguro son mutuamente excluyentes |
| **Con stock** | Cantidad física limitada | 2 sillas de bebé, 4 juegos de cadenas |
| **Recargo por conductor joven** | Sobrecosto por edad | Conductor menor de 25: +$X por día |
| **Incluido en la tarifa** | Ya viene con el alquiler | Km ilimitado incluido en mensuales |

**Modelo de precio de cada adicional:** `por_dia` · `por_alquiler` (una sola vez) · `porcentaje_del_total`.

**Pantalla de administración:** lista de adicionales, y dentro de cada uno una sección "Reglas" donde agregan condiciones con un selector simple:

```
  Pet friendly                                    $ 4.500 / día
  ┌─ Reglas ───────────────────────────────────────────────────┐
  │ ▸ Si el alquiler dura 30 días o más  →  Gratis      [ × ]  │
  │ ▸ No disponible para categoría Furgón               [ × ]  │
  │                                          [ + Agregar regla ]│
  └────────────────────────────────────────────────────────────┘
```

Y una **vista previa en vivo**: "Para un alquiler de 35 días en SUV, este adicional costaría: **$0 (bonificado por duración)**". Así verifican la regla sin tener que hacer una reserva de prueba.

### D-10 · Puntos de retiro y devolución ✅ DECIDIDO
**Tres predefinidos:**

1. **Paraguay 241** — Bahía Blanca
2. **Alsina 350** — Bahía Blanca
3. **Aeropuerto Comandante Espora**

Más una opción **"Otro"** con texto libre para casos puntuales.

**Requisitos:**
- Aparecen como botones rápidos en la reserva del sistema **y** en el flujo web.
- El lugar elegido se ve en: la reserva, el calendario de ocupación, el historial del vehículo, el contrato y el recibo.
- Los predefinidos se pueden editar y agregar desde Configuración — no van hardcodeados.
- Cada punto lleva horario de atención, para poder avisar de retiros fuera de horario.
- **Retiro y devolución pueden ser distintos.** Cuando difieren, se marca visualmente en la reserva (es el caso que después habilita el cargo one-way).

### D-11 · Política de cancelación ✅ DECIDIDO — **ratificado el 2026-07-28**

> **La contradicción del 2026-07-28 quedó cerrada: era un malentendido de lectura, no un cambio de política.**
>
> Cuando el usuario dijo *"la seña no se pierde si el cliente no aparece"*, quería decir que **no se pierde para el negocio** — Ubicar la retiene. Aclarado en la misma sesión: *"para el cliente sí, no le devolvemos la seña, eso quise decir."*
>
> **Esta decisión queda tal cual estaba**, y aplica igual a la cancelación y al no-show: en los dos casos la seña la retiene el negocio.

**Si pagó seña y cancela, no se le devuelve nada.** La seña se retiene íntegra.

Al cancelar, el sistema genera automáticamente el asiento correspondiente (la seña queda como ingreso, no como saldo a favor del cliente) y pide **motivo de cancelación**, que queda en la auditoría.

Aplica igual a las cancelaciones web. Debe estar escrito en el contrato y visible en el paso 3 del flujo online.

### D-17 · No-show ✅ DECIDIDO — no se implementa como estado
**No se crea el estado `NO_SHOW`.** Distinguir si la culpa fue del cliente o nuestra es hilar demasiado fino para el volumen actual.

**En su lugar:** si el auto sale más tarde de lo previsto, se marca como **late check-out**, con dos capacidades:
- **Monto editable** — se puede ajustar el importe a mano
- **Nota obligatoria del motivo** — por qué se demoró y de parte de quién

Queda registrado en la auditoría y en el historial de la reserva. Si más adelante ven que el caso se repite, se puede formalizar con estados y políticas.

### D-18 · Hora de devolución — modelo 24hs ✅ DECIDIDO

**El auto se devuelve a la misma hora en que se entrega. Ese es el default y es automático.**

Retira el lunes a las 10:00 por 3 días → devuelve el jueves a las 10:00. El sistema calcula la hora de devolución sola, sin que nadie la tipee.

**Excepción — late check-in acordado.** Si se pacta que devuelva más tarde, se carga la hora acordada y se elige el contracargo de una lista:

| Opción | Cuándo se usa |
|---|---|
| **1 día más** | La extensión pactada equivale a una jornada |
| **Medio día más** | Media jornada |
| **Importe manual** | Un monto negociado puntual |
| **Sin cargo (bonificado)** | Gesto comercial, con motivo |

**Impacto técnico:** el campo `hora_fin`, que hoy el operador carga libremente, pasa a **derivarse de `hora_inicio`** y queda bloqueado en la UI. El campo editable es `hora_devolucion_pactada`, que sólo se toca en el caso acordado.

<details>
<summary>Por qué esto era un bug</summary>

El sistema tenía **dos horas de devolución que no coincidían**: `hora_fin` gobernaba el calendario, los solapamientos y los estados, mientras que el cargo por atraso se medía desde `hora_inicio` aplicada a `fecha_fin`. Un cliente que devolvía a la `hora_fin` cargada recibía un cargo por horas de atraso inexistentes.

Con esta decisión el cálculo del excedente que ya está en el código queda **correcto**. Lo que hay que arreglar es la UI: `hora_fin` no puede ser un campo libre que contradiga la regla. Ver `ANALISIS_CICLO_RESERVA.md` sección 4.2.
</details>

### D-19 · Cargo por atraso ✅ DECIDIDO

**Reglas escritas:**

| Situación | Cargo |
|---|---|
| Hasta 40 min de atraso | **Sin cargo** (período de gracia) |
| De 40 min a 6 horas | Por hora completa, a 3× la tarifa horaria (tarifa diaria / 24) |
| **Más de 6 horas** | **Día completo** (baja desde las 12 horas actuales) |
| **El atraso pisa la reserva siguiente del mismo auto** | **Día completo desde el minuto uno**, sin importar cuántas horas sean |

La última es la importante: el costo real de un atraso no es el tiempo de uso, es la reserva que hay que reubicar.

**Pero el cargo calculado es una sugerencia, no un automatismo.** Al registrar el check-in se decide explícitamente y **queda registrado qué se hizo**:

| Decisión | Qué registra |
|---|---|
| Se cobró completo | El monto calculado |
| Se cobró parcial | El monto efectivamente cobrado |
| **1 día más** | Cargo de una jornada |
| **Medio día más** | Cargo de media jornada |
| **Monto manual** | El importe que se puso a mano |
| **Se dejó pasar (bonificado)** | Motivo obligatorio |

Todo con autor, fecha y motivo, visible en el historial de la reserva y en la auditoría. Y con un **reporte de bonificaciones** para ver cuánto se está resignando.

Los valores (40 min, 3×, 6 horas) son configurables desde Configuración.

### D-20 · Limpieza y combustible ✅ DECIDIDO
**Van como GASTO DEL VEHÍCULO, no como cargo al cliente.**

Cuando el auto vuelve sucio o con menos combustible, se registra el gasto contra el vehículo — que es donde impacta realmente en la rentabilidad de la unidad. Al cliente no se le factura.

**En el check-in:** se sigue registrando el nivel de combustible y el estado de limpieza como está hoy — **visual, por fracciones** (vacío, ¼, ½, ¾, lleno). Eso es suficiente y no hace falta nada más.

Desde ahí, un botón **"Generar gasto del vehículo"** que abre el formulario de gasto con el contexto ya cargado (vehículo, fecha, tipo `combustible` o `lavado`, y una nota del estilo *"salió ¾, volvió ½ — alquiler #142"*). **El importe lo pone la persona**, no lo calcula el sistema.

> **No hace falta `capacidad_tanque`.** No se calculan litros ni se estima el monto: el nivel por fracciones es sólo informativo y el importe se carga a mano. Un campo menos que mantener.

Esto simplifica bastante el check-in: la liquidación de la garantía queda sólo contra el excedente y los daños.

> Queda abierta la puerta por si algún caso puntual amerita cobrárselo al cliente (un auto devuelto en condiciones muy malas). El campo existe, pero **el default es gasto del vehículo**.

### D-21 · Kilometraje ✅ DECIDIDO
**No hay límite de kilómetros.** Km libre en todos los alquileres.

**Pero se registra y se muestra en todos lados.** Los km recorridos en cada alquiler tienen que verse en:
- El **historial del cliente** — cuántos km hizo en cada alquiler
- El **historial del vehículo** — km por alquiler y acumulado
- La ficha de la reserva/alquiler
- Los reportes (km por período, por vehículo, por cliente, y el costo por km)

El dato ya se captura (`checkout_km` y `checkin_km`); falta exponerlo en los historiales.

### D-22 · Límite de crédito ✅ DECIDIDO
**Campo opcional por cliente.** Si se carga, el sistema avisa al superarlo pero **no bloquea** — mismo criterio que el buffer: el sistema informa, la persona decide.

### D-23 · Descuentos ✅ DECIDIDO
**Todo descuento debe quedar aclarado y auditado.** No se pone un límite por rol (con 3 usuarios no hace falta todavía), pero sí el registro completo:

- **Precio de lista** vs **precio cobrado**, ambos guardados
- **Motivo del descuento**, obligatorio
- **Quién hizo la reserva y a qué precio** — visible en la auditoría y en la ficha
- Reporte de descuentos otorgados por período y por operador

Aplica igual al precio manual: si se pisa el precio calculado, hay que decir por qué.

### D-12 · Buffer entre alquileres ✅ DECIDIDO
**2 horas, como aviso — NUNCA bloqueante.**

El sistema muestra una advertencia clara explicando qué está pasando, pero deja continuar:

> ⚠️ *El Toyota Hilux AB123CD vuelve el 24/07 a las 10:00 y esta entrega es a las 11:00. Quedan sólo 1 hora para limpieza y revisión.*

Aplica en: crear reserva, editar fechas, extender y reasignar. En el calendario, las reservas pegadas se marcan visualmente.

**En la web pública sí condiciona la oferta:** un auto que vuelve a las 10:00 no se ofrece online antes de las 12:00. Ahí no hay un humano que evalúe el caso, así que el buffer se respeta.

Configurable desde Configuración (valor por defecto: 2 horas).

<details>
<summary>Contexto de la decisión</summary>

El buffer es el tiempo mínimo entre que un auto vuelve y vuelve a salir: limpieza, revisión, combustible, detección de daños. Sin él, el sistema deja reservar un auto que vuelve el martes a las 10:00 para entregarlo el martes a las 10:00.

Ya existía a medias: el vehículo se marca `en_transición` con menos de 4 horas hasta la próxima reserva, pero es sólo un color en el calendario. Ahora pasa a ser una advertencia explícita con el detalle del conflicto.
</details>

### D-24 · La pantalla de Inicio no se toca ✅ DECIDIDO

**Lo primero que ven al entrar es el calendario estilo Excel, completo, y nada más.**

- Filas = vehículos · columnas = días. El formato actual se mantiene tal cual.
- **La página no debe tener scroll.** El calendario ocupa la pantalla entera.
- Sin métricas, sin listas, sin paneles auxiliares compitiendo por el espacio.

**El "Flujo del día" queda, pero como acceso, no como panel.** En vez del panel expandible con divisor arrastrable que hoy ocupa espacio abajo, va una **barra chica al pie** del estilo:

```
  ▸ Tocá acá para ver el flujo del día    ·    12 movimientos hoy
```

Un click y **navega** a la pantalla del flujo (dentro de Reportes). No se despliega ahí adentro. Así el calendario conserva la pantalla completa y el acceso sigue estando a un click.

⚠️ **Esto reemplaza la estructura descrita en la memoria `dashboard-operativo`**, que planteaba métricas debajo del calendario. Ya no: el calendario es la pantalla completa.

Las sugerencias de UX de `PLAN_FRONTEND_UX.md` **no aplican al Inicio**. Los wizards, semáforos y paneles van en las pantallas de reserva, check-out, check-in, clientes y flota.

---

## Bloque 3 — Sistema de reservas web

### D-02 · La web reserva CATEGORÍA, no vehículo específico ✅ DECIDIDO
El cliente elige "SUV" y el vehículo puntual se asigna al momento de la entrega. Es como operan las rentadoras reales: si un auto se rompe, se reemplaza sin tocar la reserva.

⚠️ **Es el cambio estructural de mayor riesgo del proyecto.** Implica que `Reserva.vehiculo_id` pase a nullable y sumar `categoria_id`. Toca ocupación, solapamientos y reportes. Va aislado en la Fase 5 con tests de regresión.

### D-03 · Formas de pago online ✅ DECIDIDO
**Las dos opciones disponibles, que elija el cliente:**

- **Seña**, con un mínimo del **30%** del total
- **Pago total**

El saldo restante se cobra al retirar el vehículo. El estado de pago de la reserva refleja cuál eligió.

### D-04 · Confirmación de la reserva web ✅ DECIDIDO — **reconfirmado el 2026-07-28**

> **Nota del 2026-07-28.** La pregunta #3 de `docs/DECISIONES_RESERVAS_WEB.md` volvió a plantear esto como si estuviera abierto, y **recomendaba lo contrario** (confirmación manual al principio). Fue un error de ese documento: **esta decisión ya estaba tomada.**
>
> El usuario, sin tener a la vista esta página, describió exactamente lo mismo: *"si hay vehículo de esta categoría disponible para la fecha seleccionada, se va a poder confirmar; a menos que ocurra un problema, si pasa esto se ofrece otro vehículo, o se devuelve el dinero"*. Coincide punto por punto con lo de abajo, así que **queda reconfirmado**, y la recomendación de confirmación manual se descarta.

**Dos caminos según haya o no disponibilidad:**

**Con vehículos disponibles de esa categoría en esas fechas:**
→ El cliente paga (seña o total) → **auto-confirma**. Notificación al equipo, sin acción requerida.

**Sin disponibilidad:**
→ **Se le permite reservar igual, sin pagar.** Queda como **solicitud pendiente** (`SIN_DISPONIBILIDAD`).
→ Alerta inmediata al equipo, urgencia alta.
→ El equipo se pone en contacto para ofrecerle otra categoría, otras fechas, o conseguir el vehículo.
→ Desde la bandeja pueden: asignar otra categoría · proponer fechas alternativas · confirmar si consiguen la unidad · rechazar con motivo.

**Consecuencias de diseño:**
- La web **no oculta** las categorías sin cupo: las muestra con "Sin disponibilidad — dejanos tus datos y te contactamos". Eso convierte consultas que hoy se pierden.
- Se necesita un estado nuevo de reserva: `SIN_DISPONIBILIDAD` (solicitud sin cupo, sin pago).
- Estas solicitudes **no bloquean** el calendario ni cuentan como ocupación.
- Hay que capturar el motivo del contacto y el resultado, para saber cuánta demanda insatisfecha hay por categoría — dato valiosísimo para decidir qué autos comprar.

### D-06 · WhatsApp automático ✅ DECIDIDO
**No.** Requiere WhatsApp Business API de Meta con número verificado, plantillas pre-aprobadas y costo por mensaje. Fuera de alcance.
Se mantienen los links `wa.me` para escribirle al cliente con un click desde el sistema, que es lo que ya funciona.

---

## Bloque 4 — Legal y seguridad

### D-07 · Texto del contrato ⏳ PENDIENTE — lo suben ellos
Es el ítem con más lead time del proyecto. Bloquea: la generación del PDF, el hard block del check-out, y el paso 3 del flujo web.

### D-13 · Auth y auditoría ✅ DECIDIDO
**Proveedor: Clerk.**

**Tres usuarios iniciales, no más.** Roles:
- **Dueño** (Franco, Martín) — acceso total
- **Documentación** — el tercer usuario, sólo lectura de documentos

**Módulo de auditoría desde el arranque, con seguimiento de absolutamente todo.** No es opcional ni posterior: se construye junto con Clerk.

Se registra quién y cuándo, para cada uno de estos eventos:

| Área | Qué se audita |
|---|---|
| Reservas | crear, editar, cancelar, reasignar, extender, no-show |
| Operación | check-out, check-in, correcciones, bonificación de excedente con su motivo |
| Dinero | pago, anulación, recibo, movimiento de cuenta corriente, echeq y sus cambios de estado |
| Precios | cambio de tarifa, precio manual, descuento otorgado y quién lo autorizó |
| Comercial | cotización creada, enviada, aceptada |
| Clientes y flota | alta, edición, baja, reactivación |
| Documentos | carga, borrado, cambio de vencimiento |
| Overrides | cada vez que alguien saltea un bloqueo, con el motivo escrito |

**Tabla `auditoria`:** `usuario_id`, `accion`, `entidad_tipo`, `entidad_id`, `datos_antes` (JSON), `datos_despues` (JSON), `motivo`, `ip`, `timestamp`.

**En la UI:**
- Pestaña **"Actividad"** en cada ficha (reserva, cliente, vehículo): quién tocó qué y cuándo.
- Pantalla global **`/auditoria`** con filtros por usuario, fecha, tipo de acción y entidad.
- En cada registro sensible, un "creado por / última modificación por" visible sin tener que buscar.

---

## Bloque 5 — Confirmadas el 2026-07-28

> Estas ocho venían de `docs/VALIDAR_CON_DUENOS.md` (decisiones tomadas en ausencia de los dueños, esperando su ok) y de la ronda de respuestas del usuario sobre reservas web y contratos.

### D-25 · La cuenta corriente es el libro de TODO ✅ DECIDIDO
**Todo alquiler genera un débito automático** en la CC del cliente al hacer check-out, sin importar cómo se vaya a cobrar. **Todo cobro genera el crédito** que lo cancela, sea efectivo, transferencia, tarjeta o lo que sea.

Consecuencia visible: la ficha de un cliente que siempre paga al contado va a mostrar movimientos igual (un débito y un crédito el mismo día, cancelándose). Eso es lo correcto: la CC pasa a ser el **historial de facturación** de cada cliente, no sólo el registro de lo que quedó debiendo.

Implementado desde 2026-07-26. Código revisado el 2026-07-28: `CuentaCorrienteService` es el punto único de escritura, encadena `saldo_posterior`, y nunca commitea por su cuenta.

### D-26 · Las multas imputadas generan débito automático ✅ DECIDIDO
Imputar una multa a un cliente genera el débito. Resolverla tiene **exactamente dos salidas**: `cobrada` (crédito) o `bonificada` (contra-asiento con **motivo obligatorio**). No hay tercer estado ambiguo.

### D-27 · Las garantías quedan fuera del ledger ✅ DECIDIDO
El depósito de garantía **no** genera movimiento en la cuenta corriente. Es un depósito que se retiene y se devuelve, con su propio ciclo (`retenida` / `devuelta` / `ejecutada_parcial`) — no es deuda ni pago.

Si algún día una garantía ejecutada tiene que aparecer como cargo real, el camino ya existe: es el patrón de 3 pasos de PLAN_MAESTRO §3.8, el mismo de multas y daños.

### D-28 · Multas: sin descuento por pronto pago, con vencimiento y aviso ✅ DECIDIDO
**El descuento por pronto pago existe en la realidad pero no se modela.** Mantener plazos y porcentajes que cambian por jurisdicción y por año es mucha estructura para un beneficio que quien paga la multa ya conoce.

**Lo que sí:** se carga la multa con su **monto** y su **fecha de vencimiento** (campo nuevo — hoy `Multa` sólo tiene `fecha_infraccion`), y el motor de notificaciones avisa: "multa por vencer" (alta) y "multa vencida sin resolver" (crítica). La ventana de aviso es un parámetro de `configuracion`, default 7 días.

### D-29 · Categoría de cada vehículo de la flota ✅ DECIDIDO
Los 16 vehículos quedan categorizados. **Era el último bloqueante de la web.**

- **Compacto (1):** Fiat Argo `AH762UL`
- **Sedán (7):** Corsa Classic `PMH625` · 4× Cronos `AG591WA` `AH021RK` `AH067LW` `AH462EG` · Siena `LGW669` · Etios `AF865DD`
- **Sedán superior (1):** VW Virtus `AG902AQ`
- **Pick-up (7):** 3× Hilux · Amarok · 2× Tunland · Titano

El **Corsa Classic va a Sedán**, corrigiendo la sugerencia original que lo ponía en Compacto. **SUV** y **Furgón** quedan cargadas sin vehículos.

Se aplica con `backend/scripts/asignar_categorias.py` (idempotente).

### D-30 · Seña escalonada + descuento por pago total ✅ DECIDIDO — amplía D-03
El cliente elige cuánto adelanta, con un **mínimo del 30%**:

- **30%** — el mínimo, lo estándar del rubro
- **50%** — si quiere adelantar más
- **100%** — el total

**Si paga el 100%, se le puede ofrecer un descuento automático**, cuyo porcentaje **lo configuran los dueños** (parámetro en `configuracion`, no una constante). Poner el número en el código obligaría a un deploy para cambiar una promoción comercial.

Queda abierto sólo **cuánto** es ese descuento (ver abiertas, D-30b).

### D-31 · La web publica TODAS las categorías ✅ DECIDIDO
> *"siempre tienen que aparecer TODAS. Estén o no estén disponibles."*

Ninguna categoría se oculta por falta de cupo. La que no tiene disponibilidad para las fechas elegidas se muestra igual, con su foto y sus specs, y en vez del botón de reservar ofrece dejar los datos.

Es coherente con **D-04**, que ya definió el estado `SIN_DISPONIBILIDAD` para esas solicitudes: **convierte en contacto una consulta que hoy se pierde**, y de paso mide la demanda insatisfecha por categoría — el dato que dice qué auto conviene comprar.

`Categoria.visible_web` sigue existiendo, pero como **decisión editorial manual** (sacar una categoría de la web a propósito), no como consecuencia automática de la disponibilidad.

### D-32 · Canal de aviso de una reserva web ✅ DECIDIDO
**In-app (campana) + email inmediato por Resend.** Ambos ya existen: la campana desde la Fase 2, y Resend está integrado para el digest de las 08:00 — sólo hay que mandar este mail fuera del digest, porque una reserva web que espera hasta mañana a la mañana es una venta que se cae.

**WhatsApp queda afuera**, consistente con **D-06**: requiere la API de Meta con número verificado, plantillas pre-aprobadas y costo por mensaje.

Queda abierto **a qué casilla** se avisa (ver abiertas, D-32b).

### D-33 · Contrato: se adopta el clausulado tal cual ✅ DECIDIDO
El clausulado del contrato modelo se adopta **completo y en el mismo orden**, con las 7 correcciones documentadas en `docs/PLAN_CONTRATOS.md` §4 (las que serían falsas o inaplicables si se copiaran literal).

**Jurisdicción: Tribunales Ordinarios de Bahía Blanca**, no Capital Federal.

### D-34 · El contrato no bloquea el check-out, pero deja constancia ✅ DECIDIDO
> *"No se bloquea, pero se advierte y se deja constancia de ello, siempre que figure, por ejemplo en el historial de reservas, reserva sin contrato y demás."*

Entregar un auto sin contrato firmado **es posible** (el día que falle el PDF o se corte internet, el negocio no se para), pero:
- el check-out **advierte** y pide confirmación explícita,
- queda **constancia visible** en el listado de reservas/alquileres — un indicador "sin contrato", no un dato escondido en la auditoría,
- y genera una **notificación** que persiste hasta que el contrato se firme.

Mismo criterio que los bloqueos de vehículo (ítem 59) y que toda la regla del proyecto: *el sistema informa, la persona decide* — pero acá el sistema además **insiste**.

### D-35 · Tarifa semanal y mensual: **sí hay prorrateo, por bloques** ✅ DECIDIDO
> *"Se podría calcular estilo: precio de la reserva semanal + 3 días libres."*

**Esto invierte lo que el sistema hace hoy.** Hasta ahora el `monto` de una tarifa era siempre un **precio por día**, y la banda sólo decidía cuál aplicaba. A partir de esta decisión, un alquiler se **descompone en bloques** y cada bloque se cobra a su tarifa:

```
Alquiler de 10 días
  1 semana  → a precio semanal
  3 días    → a precio diario
  ─────────────────────────────
  Total = precio_semana + (3 × precio_día)
```

```
Alquiler de 40 días
  1 mes     → a precio mensual
  1 semana  → a precio semanal
  3 días    → a precio diario
```

**Regla: se consumen siempre los bloques más grandes primero** (mes → semana → día). Es lo que da el precio más conveniente para el cliente y lo que hace que la escala de descuentos por volumen tenga sentido.

**Consecuencia importante:** el campo `monto` de una tarifa **semanal pasa a ser el precio de la semana completa**, no el precio por día. Es exactamente lo que un operador esperaría al cargar "Semanal: $150.000", y elimina de raíz el riesgo de cobrar 7 veces de más.

**Hoy no hay ninguna tarifa semanal ni mensual cargada en la base**, así que no hay datos que migrar. Pero hay que cambiar la UI de Tarifas, que hoy dice lo contrario ("Precio por día para alquileres de X a Y días").

**Queda planteado y NO se implementa** (pendiente de validación del usuario): la **sugerencia de upsell** — *"por 14 días te sale sólo $X más"* cuando la diferencia entre lo que el cliente pidió y el siguiente bloque completo es chica. Es una buena idea comercial y encaja naturalmente con el cálculo por bloques, pero se construye después de confirmar el umbral de "poca diferencia".

### D-38 · Edad: no hay mínimo, hay **recargo por franja etaria** ✅ DECIDIDO
> *"Desde cualquier edad, pero de X edad a X edad el precio es otro, así se manejan las grandes empresas. Que los administradores, en su talonario, también puedan definir esto."*

**No se rechaza a nadie por edad.** En vez de un mínimo que bloquea la venta, la edad **modifica el precio** — que es como opera el rubro (el *young driver surcharge* de las internacionales).

**Es un ABM, no una constante:** los administradores definen las franjas y el recargo de cada una, igual que hacen con adicionales y con las reglas de precio. La lista no está cerrada y va a cambiar.

| Concepto | Definición |
|---|---|
| Franja | `edad_desde` – `edad_hasta` (ej. 18-24) |
| Recargo | Monto fijo **o** porcentaje |
| Unidad | Por día o único |
| Alcance | General o por categoría — una pick-up para alguien de 19 no es lo mismo que un compacto |

**Dos consecuencias que importan:**

1. **La fecha de nacimiento pasa a ser obligatoria en el paso 3 de la web**, y por un motivo más fuerte que validar: **sin ella no se puede cotizar bien**. Refuerza lo decidido en la pregunta #9 de `DECISIONES_RESERVAS_WEB.md`.
2. **El recargo se congela en la reserva**, como los adicionales y como `precio_lista`. Cambiar la tabla de recargos no puede reescribir lo pactado.

### D-39 · Sólo Bahía Blanca por ahora ✅ DECIDIDO
> *"La idea es que de manera inicial sea sólo Bahía Blanca. Lo de Capital Federal dejalo como duda."*

**La web opera únicamente en Bahía Blanca.** El punto de retiro de Capital Federal (`Juan Francisco Seguí 3607`) **se saca del flujo de reserva online**, y con él se cae el problema de la flota repartida en dos ciudades y el del one-way de 700 km.

Esto **ratifica el ítem 55** (sucursales descartadas): con una sola ciudad no hay one-way que cobrar ni cupo que calcular por sede.

**Qué se toca:** el selector del Hero y el de "devolver en otro lugar" quedan con los tres puntos de Bahía Blanca (Paraguay 241, Alsina 350, Aeropuerto Comandante Espora). **El `<h1>` de la web sigue diciendo "Bahía Blanca y Capital Federal"** — hay que decidir si se corrige o se deja como presencia comercial con contacto por WhatsApp.

**Queda como duda abierta (D-39b):** qué se hace con Capital Federal. Sigue existiendo como operación (hay un WhatsApp propio para CABA y el chip existe en el sistema interno), sólo que **no se vende online**. Cuando se retome hay que contestar las tres preguntas de `PLAN_RESERVAS_WEB.md` §11: si se permite retirar en una ciudad y devolver en la otra, cuánto se cobra, y **si la flota de CABA es la misma** — que es la que puede romper la disponibilidad por cupo.

---

## Decisiones que quedan abiertas

Actualizado el **2026-07-28**. Ordenadas por urgencia.

| # | Decisión | Bloquea | Urgencia |
|---|---|---|---|
| **D-C1b** | **Ingresos Brutos de FINAR** — es el último dato fiscal que falta. Lo emite **ARBA**; no figura en la constancia de ARCA, que es nacional. Se lo pide la contadora | Un dato menos en el pie del contrato. Ya no lo marca como provisorio | 🟠 Pronto |
| D-18 | **¿La devolución es a la hora que se carga, o siempre a la misma hora del retiro?** | El arreglo del cálculo de excedente — es un P0 | 🔴 Ya |
| D-19 | **Umbral de día completo** por atraso: ¿bajar de 12 a 6 horas? | Cargo por excedente | 🔴 Ya |
| **D-C3** | **Monto de la franquicia** — valor único para web, reserva y sistema. Los dueños lo cargan; falta entender cómo lo manejan hoy | Bloque de franquicia del contrato y de la web | 🟠 Fase 4 |
| **D-36** | **Anticipación mínima** para reservar online + **horarios de entrega** | Validación del paso 1 de la web | 🟠 Fase 6 |
| **D-37** | **¿Se pide garantía online?** Probablemente no, pero hay que definir cuál es la garantía en una reserva web | Paso 3 de la web | 🟠 Fase 6 |
| **D-35b** | **Umbral del upsell** — cuánta diferencia es "poca" para sugerir el bloque siguiente ("por 14 días te sale $X más") | Sólo la sugerencia; el cálculo por bloques va igual | 🟡 Fase 6 |
| **D-38b** | **Las franjas de edad y sus recargos** — los cargan los administradores, pero hace falta el primer juego de valores | Que el recargo por edad haga algo | 🟡 Fase 6 |
| **D-39b** | **Qué se hace con Capital Federal** — no se vende online por ahora. Si se retoma: ¿one-way?, ¿cuánto?, ¿la flota es la misma? | La web multi-ciudad | 🟡 Diferida |
| **D-30b** | **Cuánto** es el descuento por pagar el 100% por adelantado | Un valor de configuración, no bloquea código | 🟡 Fase 6 |
| **D-32b** | **A qué casilla** llega el aviso de reserva web (¿Franco y Martín, o una casilla de la empresa?) | Configuración del envío | 🟡 Fase 6 |
| D-20 | **Cargos fijos**: limpieza y precio del litro de combustible | Cargos de cierre en el check-in | 🟠 Fase 1 |
| D-21 | **Km incluidos por día** — ¿hay límite o es libre? | Cargo por km excedido y el contrato | 🟠 Fase 1 |
| D-22 | **Límite de crédito** por cliente con cuenta corriente | Alerta y bloqueo | 🟠 Fase 1 |
| D-23 | **Descuento máximo** sin autorización del dueño | Control de márgenes | 🟠 Fase 1 |

## Cerradas el 2026-07-29

| # | Decisión | Detalle |
|---|---|---|
| **D-11** | **La seña nunca se devuelve** | Ni por cancelación ni por no presentarse. Única excepción: si el que no puede cumplir es Ubicar Rent, se reintegra el 100% o se ofrece otro vehículo. Ya escrito en los términos de la web (§4) e implementado en `ReservaService.cancelar()` |
| **D-40** | **El calendario de precios se parte en dos pantallas**, web y mostrador | El canal define qué precios se están tocando, no sólo lo que se ve. Los descuentos por duración y la tarifa por bandas quedan explícitamente compartidos entre canales. Ver `CIERRE_2026-07-29.md` §1 |
| **D-41** | **"Contado" también pregunta el momento**: al entregar, al devolver, u otra fecha | Entre que el auto sale y vuelve pueden pasar semanas, y de ahí sale la fecha de vencimiento. Con ancla check-in el saldo nace sin vencimiento y el check-in lo completa |
| **D-42** | **La condición de pago es sólo de empresa** | Un particular alquila y paga; si hace falta un plazo se decide en esa reserva puntual |

**Cerradas en esta ronda (2026-07-28):** D-07 (texto del contrato, ver D-33), **D-11** (ratificada: la seña la retiene el negocio, cancele o no aparezca — y con eso **D-17** queda subsumida), D-25 a D-34, **D-35** (prorrateo por bloques), **D-38** (recargo por edad en vez de mínimo), **D-39** (sólo Bahía Blanca), y el punto 7 de `VALIDAR_CON_DUENOS.md` (categorías de la flota, D-29) que era el bloqueante principal de la web.

---

## Cerradas el 2026-08-09

Estaban decididas y aplicadas, pero **nunca se registraron acá** — se
documentaron sólo en `CIERRE_2026-08-09.md`. Se anotan para que este archivo
vuelva a ser la fuente de verdad.

| # | Decisión | Detalle |
|---|---|---|
| **D-C1** ✅ | **El locador es FINAR GRUPO FINANCIERO S.R.L.** | Ubicar Rent es el nombre comercial, no una persona jurídica. CUIT 30-71756601-3, Paraguay 241 Piso 9 Dpto A, Bahía Blanca. Se agregó `empresa.nombre_comercial` para que el papel diga las dos cosas sin mentir ninguna. **Falta sólo Ingresos Brutos** |
| **D-43** ✅ | **El precio es un número y una escalera** | Una tarifa diaria por categoría, y el largo se descuenta con porcentajes: 1-2 días sin descuento, 3-6 −10%, 7-15 −15%, 16 o más −30%. Se corrigieron los dos huecos de lo pedido (el día 15 quedaba sin banda; el día 31 volvía al 100%) |
| **D-C6** ✅ | **El contrato se firma por link** | Tres caminos que terminan en la misma fila: link (el principal), papel con escaneo adjunto, y firma en pantalla. Se guarda **el texto completo de lo aceptado**, no un booleano: `acepto = true` no prueba nada el día que los términos cambien |

## Cerradas el 2026-08-11

| # | Decisión | Detalle |
|---|---|---|
| **D-44** ✅ | **La edad se pregunta en el Hero, y el precio ya la incluye** | Antes el recargo por edad (D-38) aparecía en el paso 3 y el precio **subía después** de que el cliente eligió. Ahora la edad es obligatoria para avanzar desde la portada. Se pide la **edad, no la fecha de nacimiento**: en la portada todavía no hay un cliente, hay alguien mirando precios. La fecha exacta se sigue pidiendo en el paso 3 y **manda sobre la declarada**. El recargo va **dentro de la línea del alquiler**, sin rótulo — pero los términos y las FAQ siguen diciendo que la tarifa varía según la edad, y eso no se toca |
| **D-45** ✅ | **La condición de IVA se pide en la reserva web** | Selector con los cuatro valores, por defecto consumidor final. Al elegir otra, aparece razón social y el campo DNI pasa a ser CUIT. **No habilita a facturar**: el sistema no emite comprobantes fiscales. Guarda el dato para quien factura por afuera y para la facturación electrónica futura |
| **D-46** ✅ | **El bucket público sirve sólo el catálogo** | Habilitar el dominio público de R2 dejó todo el bucket de lectura sin credenciales, y las claves de los contratos son predecibles (`contratos/7/firma.png`). Ahora `categorias/` va por el dominio público y **todo lo demás con URL firmada que vence en 1 hora**. La lista declara lo público, no lo privado: al revés, un prefijo nuevo nacería público por olvido |
| **D-47** ✅ | **El contrato web se emite al asignar el vehículo, no al pagar** | Ni antes de pagar (la reserva no existe hasta el webhook, y trece cláusulas antes del botón matan el checkout) ni al acreditarse el pago (la web vende por categoría: todavía no hay patente, y un contrato sin patente no identifica qué auto se entregó). **Asignar el vehículo pasa a ser el paso que dispara todo.** ⏳ Decidido, **sin implementar** |
| **D-48** ✅ | **Reasignar un vehículo con contrato firmado: anular y re-emitir** | El cliente firma de nuevo. Un contrato que nombra un auto que ya no es, no sirve para lo único que importa cuando hay un reclamo |
| **D-49** ✅ | **En la web, el descuento por duración se gana pagando el 100%** | Con seña del 30% o 50% se cobra el precio de lista. **En el mostrador sigue aplicando siempre**: ahí el precio se conversa. En los pasos 1 a 3 se muestra el precio de lista y el descuento aparece como **mejora** al elegir el pago total — al revés, el precio subiría al elegir pagar menos y se leería como un recargo escondido |
| **D-50** ✅ | **Las reservas online necesitan 72 horas de anticipación** | Eran 24. Una reserva web dispara trabajo de mostrador antes de que el cliente aparezca —asignar el vehículo, emitir el contrato, esperar la firma (D-47)— y con un día no entra. **Se avisa en el Hero**, no sólo al validar |
| **D-39** 🔄 | **Capital Federal sale de todo el sitio, no sólo del flujo de reserva** | Completa lo decidido el 28/07. CABA queda **únicamente en la sección de Contacto**, donde es un dato de contacto verdadero. Sale del `areaServed` del JSON-LD, de la metadata, de `llms.txt` y de la tarjeta de ubicaciones: ahí no era contacto sino **promesa de servicio**, y declarar dos ciudades diluye la señal local de Bahía Blanca. El `<h1>` queda en "Alquiler de vehículos en Bahía Blanca", que resuelve la duda que D-39 había dejado abierta |

**Consecuencia fiscal de D-39:** operando en una sola provincia, el Ingresos
Brutos que falta es el de **ARBA**, no el de Convenio Multilateral.

## Cerradas el 2026-08-13

Del plan de conexión y limpieza (`docs/PLAN_CONEXION_Y_LIMPIEZA.md`), a partir
de los pedidos de Franco por WhatsApp. Numeradas desde D-51, que sigue a D-50.

| # | Decisión | Detalle |
|---|---|---|
| **D-51** ✅ | **Edad mínima 21 para alquilar.** Se saca el recargo por "conductor joven" del contrato y de la web | **Revierte D-38.** Implementado: `alquiler.edad_minima` en `configuracion` (default 21), rechazado en `/public/disponibilidad` y `/public/reservas*`; el selector de edad del Hero arranca en 21 |
| **D-52** ✅ | **La web vende de 10 días a 4 meses.** Anticipación mínima 10 días, horizonte máximo 4 meses, duración máxima sin cambio en 90 días. Menos de 10 días o más de 4 meses → lo atiende un vendedor por WhatsApp, con el pedido precargado | **Reemplaza D-50** (72hs). Implementado de punta a punta: `web.anticipacion_minima_horas` / `web.horizonte_maximo_dias` / `web.duracion_maxima_dias` en `configuracion`, validados en el backend y reflejados en el calendario del buscador antes de que el cliente llegue a pedirlas. **Enmendado por D-60 (14/08):** las fechas por debajo de la anticipación mínima **ya no se deshabilitan** —se pueden elegir y derivan a WhatsApp—; el horizonte máximo sí sigue deshabilitado |
| **D-53** ✅ | **Las franquicias son configuración.** Se carga cuáles hay y qué impacto tiene cada una en el alquiler; la base (sólo seguro obligatorio) es la más alta y cada cobertura la baja a mayor precio | **Cierra D-C3** en la estructura. Implementado: `categorias.franquicia_base` (montos de referencia mientras Franco carga los reales — Compacto/Sedán $1.500.000, Sedán superior $2.000.000, Pick-up $2.500.000) y `adicionales.porcentaje_sobre_alquiler` para coberturas cuyo precio es un % del alquiler, no un monto fijo. El paso 2 de la web muestra "Sin cobertura adicional" con la franquicia base como una tarjeta más — antes esa opción implícita no se veía en ningún lado. El backend rechaza cargar una cobertura que invierta la escalera (franquicia más baja con precio igual o menor) |
| **D-54** ✅ | **Upgrade a categoría superior al mismo precio, siempre propuesto.** Nunca automático. Es herramienta del mostrador, no del flujo web | Implementado de punta a punta (14/08): `reservas.categoria_entregada_id` / `upgrade_motivo` se completan al asignar un vehículo de otra categoría, y el panel de asignación ahora **avisa antes de confirmar** — "Upgrade a X, mismo precio" en verde, o "Esto es un downgrade" en rojo con un botón "Confirmar downgrade" distinto al de asignar normal (checklist 56). **Sigue abierto** (§5, pregunta 2): por qué canal se le propone el upgrade al cliente y quién registra que lo aceptó — eso pasa por WhatsApp, fuera del sistema |
| **D-55** ⏳ | Cuatro temporadas, cargadas como fechas especiales | **Decidido, sin cargar.** Encaja en lo que ya existe (`fechas_especiales` + `tarifas_calendario`), pero la partición de meses quedó ambigua en el pedido original ("marzo a abril media, baja" — §5, pregunta 3). Hay que confirmar con Franco si es may-ago baja · sep-oct media · nov-feb alta · mar-abr **?** antes de cargarla |
| **D-56** ✅ | Los lugares salen de Configuración; "Otro" deriva a un vendedor | **Cierra D-10.** `web.lugares_retiro` en `configuracion` es la única fuente — se sacaron las tres listas hardcodeadas que había (Hero, buscador del flujo, cada una con un texto ligeramente distinto). Elegir "Otro lugar" ya no deja pasar un pedido con "A coordinar: ..." pegado adentro de la reserva (14/08): al tocar "Ver vehículos disponibles" abre el cartel único de D-59 con lo que el cliente tipeó ya cargado en el mensaje de WhatsApp |
| **D-57** ⏳ | Reinicio de datos operativos antes de publicar | **Script escrito y probado en dry-run** (`backend/scripts/reset_datos_operativos.py`), **no ejecutado**. Vacía todo el ciclo de reserva, la plata y los clientes; conserva flota, usuarios, configuración y el log de auditoría; deja afuera por default el historial de `servicios`/km (opt-in con `--incluir-servicios`, según §5 pregunta 4); crea el cliente "Consultas web" y el usuario "Sistema" explícitos y resetea los vehículos que quedan mintiendo en `alquilado`/`reservado`/`en_transicion`. Correrlo con `--confirmar` es una decisión operativa de Franco, no algo para dejar corrido de una sesión de código |
| **D-58** ✅ | **La home muestra lo que está trabado, y suma una vista anual.** Barra al pie sólo cuando hay reservas sin asignar, desplegable en el lugar; y una tercera pestaña con el año completo | **Enmienda D-24.** Implementado: panel "Pendiente de asignación" en `/ocupacion` (sólo ocupa lugar si hay algo pendiente) y una vista anual con densidad de ocupación, sin_asignar y alertas por día, navegable a la vista timeline |
| **D-59** ✅ | **Todo lo que la web no puede vender sale por una sola puerta:** un cartel que avisa qué va a pasar y deriva al WhatsApp principal con el pedido completo. Detrás, dos escapes: seguir en la web con lo disponible, o dejar la consulta | Implementado (`CartelDerivacion` / `CartelDerivacionModal`): unifica los **cinco** casos — sin cupo, anticipación, horizonte, duración y otro lugar (este último cerrado el 14/08, ver D-56). El tercer camino ("dejar consulta") sólo está wireado para sin cupo: los otros cuatro le pegan directo a `/public/solicitudes`, que valida la misma ventana que los hizo aparecer y rechazaría con 422 — generalizarlo pide un endpoint propio, no forzar el mismo. No retira nada — el formulario de D-04 sigue como tercera opción donde corresponde. Cada botón queda registrado en `busquedas_sin_resultado`, que es estadística pura y no dispara ninguna notificación |

| **D-60** ✅ | **La fecha con poca anticipación se puede elegir; lo que cambia es quién la cierra.** El calendario ya no deshabilita los próximos 10 días: los pinta en ámbar y, al elegir uno, el cartel de D-59 **reemplaza al buscador** y deriva a WhatsApp | **Enmienda D-52** (ya no es cierto que las fechas de la ventana chica estén deshabilitadas — el borde de arriba sí sigue deshabilitado) y **extiende D-59** a un sexto punto de disparo. Deshabilitarlas hacía que el caso `anticipacion` del cartel fuera **código inalcanzable desde la portada**: nadie podía llegar a dispararlo. La regla se centralizó en `web/lib/ventanaVenta.ts` — antes vivía sólo dentro de `Paso1Vehiculo` y el Hero habría tenido que copiarla. Mismo desbloqueo en `BuscadorRango` de `/reservar`, si no el que toca "Cambiar" se topa con la puerta cerrada justo después de que le dijimos que se podía. El copy no dice que no se puede: el sujeto de la limitación es la web, nunca el cliente. Se corrigió además el fallback de `FlujoReserva` (`?? 24` → `?? 240`), que sin config dejaba pasar una reserva a 2 días que el backend rechazaba con 422 |

**Consecuencia sobre D-04:** con D-59 el WhatsApp pasa a ser el camino
principal para casi toda la demanda que la web no puede cerrar sola, así que
`busquedas_sin_resultado` es ahora la única forma de medir esa demanda para
el que no completa el formulario — sin esa tabla, D-04 sólo vería la minoría
que sí lo hace.

## Documentos afectados por estas decisiones

- `docs/CIERRE_2026-07-29.md` — lo hecho y lo encontrado el día previo a la reunión
- `docs/PLAN_CONEXION_Y_LIMPIEZA.md` — el análisis completo detrás de D-51 a D-59
- `docs/PENDIENTES_REUNION.md` — qué traerse de la reunión
- `docs/PLAN_MAESTRO.md` — arquitectura y fases
- `docs/ANALISIS_CICLO_RESERVA.md` — ciclo operativo y bugs
- `docs/CASOS_DE_USO.md` — registro trackeable
- `docs/PLAN_FRONTEND_UX.md` — rediseño de la interfaz por pasos

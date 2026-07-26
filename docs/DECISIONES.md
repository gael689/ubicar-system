# Decisiones de producto — Ubicar Rent

**Registro de decisiones tomadas.** Cada una fija cómo se construye el sistema. Si alguna cambia, se actualiza acá y se revisan los documentos afectados.

**Confirmadas por Franco/Martín el 2026-07-25.**

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

### D-11 · Política de cancelación ✅ DECIDIDO
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

### D-04 · Confirmación de la reserva web ✅ DECIDIDO
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

## Decisiones que quedan abiertas

Quedan **9**. Ordenadas por urgencia.

| # | Decisión | Bloquea | Urgencia |
|---|---|---|---|
| D-18 | **¿La devolución es a la hora que se carga, o siempre a la misma hora del retiro?** | El arreglo del cálculo de excedente — es un P0 | 🔴 Ya |
| D-19 | **Umbral de día completo** por atraso: ¿bajar de 12 a 6 horas? | Cargo por excedente | 🔴 Ya |
| D-07 | **Texto legal del contrato** | Fase 4 y el paso 3 de la web. Mayor lead time | 🔴 Ya |
| D-20 | **Cargos fijos**: limpieza y precio del litro de combustible | Cargos de cierre en el check-in (Fase 1) | 🟠 Fase 1 |
| D-21 | **Km incluidos por día** — ¿hay límite o es libre? | Cargo por km excedido y el contrato | 🟠 Fase 1 |
| D-22 | **Límite de crédito** por cliente con cuenta corriente | Alerta y bloqueo de la Fase 1 | 🟠 Fase 1 |
| D-23 | **Descuento máximo** sin autorización del dueño | Control de márgenes (Fase 1) | 🟠 Fase 1 |
| D-11 | **Política de cancelación** | Qué pasa con la seña. Contrato y web | 🟡 Fase 4 |
| D-17 | **Política de no-show** — cuántas horas y qué pasa con la seña | Estado `NO_SHOW` | 🟡 Fase 4 |

---

## Documentos afectados por estas decisiones

- `docs/PLAN_MAESTRO.md` — arquitectura y fases
- `docs/ANALISIS_CICLO_RESERVA.md` — ciclo operativo y bugs
- `docs/CASOS_DE_USO.md` — registro trackeable
- `docs/PLAN_FRONTEND_UX.md` — rediseño de la interfaz por pasos

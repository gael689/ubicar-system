# Decisiones a validar con Franco y Martín

**Para qué sirve este documento:** durante esta sesión de trabajo se tomaron decisiones de **negocio** (no técnicas) para poder seguir avanzando sin frenar cada cinco minutos. Son razonables y están documentadas con su lógica, pero **cambian cómo se ve la plata del negocio** y merecen el ok explícito de los dueños antes de darlas por definitivas. `docs/DECISIONES.md` ya tiene las decisiones confirmadas en conversación directa con ustedes — este archivo es el complemento: lo que se decidió **en su ausencia**, razonablemente, pero sin ese ok todavía.

**Cómo usarlo:** cada ítem tiene lo que se implementó, por qué, y qué pasaría si prefieren la alternativa. Se revisa uno por uno y se pasa a `DECISIONES.md` una vez confirmado (o se revierte si no).

---

## 1. 🔴 La cuenta corriente pasa a ser el libro de TODO, no sólo de lo pendiente

**Qué se decidió:** a partir de ahora, **todo alquiler** —sin importar cómo se vaya a cobrar— genera automáticamente un **débito** en la cuenta corriente del cliente por el total (la "factura"). Y **todo cobro posterior** —efectivo, transferencia, tarjeta, lo que sea— genera un **crédito** que lo cancela.

**Antes era:** la cuenta corriente sólo se movía cuando alguien elegía explícitamente "Cuenta Corriente" como forma de pago. Un cliente que pagaba en efectivo no dejaba ningún rastro en ese libro.

**Ejemplo concreto de cómo se ve ahora:**

```
Alquiler de $80.000, cliente paga todo en efectivo al retirar el auto:
  Checkout  → DÉBITO automático  $80.000   (la factura)
  Cobro     → CRÉDITO automático $80.000   (lo que pagó)
  ────────────────────────────────────────
  Saldo: $0                                 (como corresponde)

Mismo alquiler, el cliente sólo deja una seña de $30.000:
  Checkout  → DÉBITO  $80.000
  Seña      → CRÉDITO $30.000
  ────────────────────────────────────────
  Saldo: $50.000                            (la deuda real queda visible
                                              en la ficha del cliente PARA
                                              SIEMPRE, no sólo mientras
                                              está pendiente de cobro)
```

**Por qué se recomendó así:** con el modelo viejo, un cliente que siempre paga en efectivo **nunca aparece en ningún lado con historial de facturación** — la cuenta corriente sólo mostraba a los que alguna vez quedaron a deber. Con el modelo nuevo, la cuenta corriente de cada cliente es su **historial completo**: todo lo que alquiló, todo lo que pagó, y en qué momento. Es lo que hace falta para, por ejemplo, ver de un vistazo "este cliente en un año nos facturó $2.400.000 y siempre pagó en término" — información que hoy no existe en ningún lado.

**Qué implica en la práctica para el día a día:**
- La ficha de cada cliente va a mostrar movimientos de cuenta corriente **aunque nunca haya quedado debiendo nada** — es normal ver un débito y un crédito por el mismo monto el mismo día, cancelándose entre sí.
- Los reportes de "cuánto factura cada cliente" y "cuánto tarda en pagar" (aunque no estén construidos todavía) van a poder salir directo de este libro, sin tener que cruzar reservas + pagos a mano.
- El campo "Cuenta Corriente" como forma de pago, que hoy existe como una opción más en el desplegable, queda **prácticamente sin uso especial**: elegirlo o no, el resultado en el ledger es el mismo (un crédito). Si prefieren, se puede sacar esa opción del formulario más adelante — no se sacó todavía porque es un cambio de UI, no de lógica.

**Qué pasa si prefieren volver al modelo viejo:** technically reversible — el automatismo de "todo checkout genera débito" se puede desactivar sin perder el resto del ledger (condición de pago, vencimientos, anulación con contra-asiento), que sirve igual.

**Estado:** ✅✅ **CONFIRMADO POR EL USUARIO el 2026-07-28** — *"El punto 1 está bien, pero debe dejarse documentada esta decisión."* Pasa a `docs/DECISIONES.md` como **D-25**. Implementado y probado desde el 2026-07-26.

**Revisión del código pedida junto con la confirmación (2026-07-28) — el ledger está bien construido.** Se verificó `services/cuenta_corriente_service.py`:
- `registrar_movimiento()` es el **punto único** de escritura. Ningún router toca `cc.saldo` a mano.
- Calcula `saldo_posterior` con `domain/cuenta_corriente.py::aplicar_movimiento` (dominio puro, 11 tests) y encadena el saldo movimiento a movimiento — que es lo que permite detectar una desincronización.
- Hace `flush()` y **nunca `commit()`**: compone dentro de la transacción del que lo llama, así un checkout que falla a mitad no deja medio asiento escrito.
- El vencimiento sale de `calcular_vencimiento(fecha, condición)`, con la salida `sin_vencimiento_automatico` para el caso del débito de checkout anclado al check-in.
- Todos los orígenes de asiento tienen su FK propia (`alquiler_id`, `reserva_id`, `pago_id`, `echeq_id`, `multa_id`, `recibo_id`, `comprobante_id`, `danio_id`), así que el historial de cualquier entidad sale gratis.

**La única grieta encontrada no está acá sino en el punto 4** (recibos) y en la deuda ya anotada de `extender()` (PLAN_MAESTRO §2.11).

### ¿Es la práctica correcta para este rubro?

Sí, y por una razón concreta del negocio, no sólo contable: **la base de clientes es mixta** — particulares que pagan al retirar el auto, y empresas que pagan a 15/30/60/90 días (ya está la `condicion_pago` para eso). Esos dos perfiles necesitan la **misma** herramienta para verse bien:

- **Para un particular que paga todo en efectivo al momento:** el débito (factura) y el crédito (cobro) se cancelan el mismo día. En la práctica, **nunca ve un saldo pendiente** — su cuenta corriente vive en $0 siempre. No le agrega fricción ni papeleo a lo que hoy es una operación simple.
- **Para una empresa con cuenta corriente:** su "cuenta corriente" en el sistema pasa a ser literalmente su **estado de cuenta** — todos los alquileres del mes, todos los pagos, el saldo real. Es exactamente lo que una empresa cliente espera poder pedir ("mandame el resumen de lo que le debemos"), y hoy no existe manera de generarlo sin cruzar reservas y pagos a mano.

**La alternativa (sólo trackear lo explícitamente "a cuenta") tiene un punto ciego real:** si mañana quieren saber "¿cuánto nos compró el cliente X este año, sume lo que pagó al contado o no?", con el modelo viejo esa pregunta no se puede responder sin revisar alquiler por alquiler. Con el ledger completo, es una consulta directa sobre `movimientos_cuenta_corriente`.

**Es además el modelo estándar de "cuenta corriente de clientes"** que usa cualquier sistema contable/ERP para manejar una cartera de clientes mixta (ventas al contado + ventas a cuenta) — no es una particularidad de picar del alquiler de autos, es cómo se lleva la cuenta corriente de clientes en general cuando conviven los dos tipos de venta.

**El único costo real:** cada alquiler que se cobra al contado ahora genera **dos movimientos en vez de cero** (débito + crédito que se cancelan). Es más registro en la base, pero irrelevante en volumen para este negocio, y es justamente lo que permite auditar todo después.

---

## 2. Multas imputadas — ¿generan débito automático también?

**Contexto:** con el ledger completo funcionando, la pregunta natural es si una multa imputada a un cliente debería sumarse como deuda en su cuenta corriente automáticamente (como ya está documentado en `docs/PLAN_MAESTRO.md` sección 3.8), o si prefieren manejarlo aparte (cobrando la multa por fuera, sin mezclarla con el alquiler).

**Qué se decidió (sin preguntar, por ser consistente con el punto 1):** sí, imputar una multa a un cliente (`estado='imputada'`) genera un débito automático, igual que el checkout. Resolverla tiene exactamente dos salidas — **cobrada** (genera el crédito que cancela el débito) o **bonificada** (se le perdona, contra-asiento, con motivo obligatorio) — nunca queda en un estado intermedio ambiguo.

**Estado:** ✅✅ **CONFIRMADO POR EL USUARIO el 2026-07-28** — *"el 2 está bien"*. Pasa a `docs/DECISIONES.md` como **D-26**. Implementado y probado desde el 2026-07-26 (migración 021) más el frontend, que hasta esa sesión no tenía ningún botón para llamarlo — cargar una multa como "imputada" sí generaba el débito, pero no había forma de marcarla "cobrada" o "bonificada" desde la pantalla. Ahora hay dos botones ("Cobrada" / "Bonificar") en la ficha del cliente y en la pantalla global de Multas.

---

## 3. Garantías/depósitos — quedan explícitamente FUERA del ledger

**Qué se decidió (sin preguntar, por ser técnicamente la única opción sensata):** el depósito de garantía **no** genera un movimiento en la cuenta corriente. Es un depósito que se retiene y se devuelve (o se ejecuta parcialmente), pero no es "deuda" ni "pago" en el sentido contable — tiene su propio ciclo de vida (`garantia_estado`: retenida / devuelta / ejecutada parcial).

**Por qué se avisa igual:** si en algún momento quieren que una garantía ejecutada (por daños, por ejemplo) sí aparezca como un cargo en la cuenta corriente del cliente, es una extensión simple de lo que ya existe — pero cambiaría la naturaleza de "garantía" de depósito neutro a cargo real. Vale la pena que lo sepan de antemano.

**Estado:** ✅✅ **CONFIRMADO POR EL USUARIO el 2026-07-28** — *"la 3 perfecta"*. Pasa a `docs/DECISIONES.md` como **D-27**. La garantía sigue siendo un depósito con ciclo propio, fuera del ledger. Si algún día una garantía ejecutada tiene que aparecer como cargo, ya existe el camino: es el patrón de 3 pasos de PLAN_MAESTRO §3.8, el mismo que usan multas y daños.

---

## 4. Recibos — versión simplificada, sin imputación a deudas puntuales

**Contexto:** el plan original (`docs/PLAN_MAESTRO.md` sección 3.6) describía un recibo con **medios de pago mixtos** (parte efectivo + parte transferencia en un mismo recibo) y una tabla `recibo_imputaciones` para que el operador elija **a qué deuda puntual** se aplica el pago (ese alquiler, esa multa), con sugerencia automática FIFO (la deuda más vieja primero).

**Qué se construyó en su lugar:** un recibo con **un solo medio de pago**, que genera un crédito contra el **saldo general** de la cuenta corriente del cliente — exactamente el mismo mecanismo que ya usan un pago o un echeq recibido. No permite elegir "este recibo cancela el Alquiler #142 puntualmente"; sólo baja el saldo total.

**Por qué se hizo así:** es consistente con cómo ya funciona el resto del ledger (ningún pago ni echeq imputa tampoco — todos son créditos contra el saldo general), y evita construir una lógica de imputación nueva sin tener claro si hace falta. Es la opción más simple que no rompe nada.

**Qué se pierde con esta simplificación:**
- Si un cliente paga con dos medios distintos en el momento (parte efectivo, parte transferencia), hoy hacen falta **dos recibos**, no uno.
- No queda registrado en el sistema "este pago específico canceló esa deuda específica" — sólo que el saldo bajó. Para la mayoría de los casos (el cliente debe un monto y paga ese monto) da exactamente el mismo resultado. Para casos de pagos parciales contra múltiples deudas simultáneas, el saldo general sigue siendo correcto, pero no hay trazabilidad de "a qué se aplicó cada peso".

**Estado:** 🔴 **BUG P0 CONFIRMADO — 2026-07-28.**

El usuario pidió revisar esto con una sospecha concreta:

> *"Siempre la idea es emitir un recibo, cuando pagan con tarjeta, efectivo o lo que sea. Entonces mi miedo es que no estén 100% sincronizados todo esto y se preste a la confusión."*

**La sospecha era correcta, y el problema es más grande que la simplificación de la imputación.** Revisado el código (`services/recibo_service.py`, `routers/pagos.py`, `models/pago.py`, `models/recibo.py`):

### Tres síntomas de la misma causa

**`Pago` y `Recibo` son dos caminos paralelos y desconectados para el mismo hecho económico.** Los dos generan un crédito en la cuenta corriente, y no se conocen entre sí.

**1. 🔴 Doble crédito — el saldo queda mal.**
`routers/pagos.py:182` registra un crédito por el `Pago`. `services/recibo_service.py:58` registra **otro** crédito por el `Recibo`. **`Recibo` no tiene `pago_id`** — no hay ningún vínculo ni ninguna validación. Entonces:

```
El cliente debe $100.000 y paga $50.000 en efectivo.
  Se registra el Pago      → CRÉDITO $50.000   (saldo: $50.000)
  Se emite el Recibo       → CRÉDITO $50.000   (saldo: $0)  ← MAL
  Plata que entró: $50.000.  Deuda que se borró: $100.000.
```

Y como la intención declarada es **emitir siempre un recibo**, esto no sería un caso raro: pasaría en **todas** las operaciones.

**2. 🟠 Plata invisible en la Caja del día.**
`GET /pagos/caja/dia` (`routers/pagos.py:135`) arma los ingresos consultando **sólo la tabla `pagos`**. Un cobro documentado únicamente con un recibo **no aparece en la caja**: no suma a `total_ingresos`, no entra en `por_medio_pago`, no figura en el detalle. El arqueo del día daría menos de lo que realmente entró.

**3. 🔴 Hoy no hay forma de hacerlo bien.**
No se puede evitar el problema operando con cuidado, porque las dos salidas están cerradas:
- **No se puede emitir un recibo de un pago existente** — `Recibo` no tiene `pago_id`.
- **No se puede crear un pago sin alquiler** — `Pago.alquiler_id` es `NOT NULL` (`models/pago.py:11`). Es el bug **2.6 del PLAN_MAESTRO, que sigue abierto**. Por eso el recibo se construyó como generador de crédito propio: era la única manera de cobrarle a un cliente algo que no fuera un alquiler puntual.

O sea que el módulo de Recibos nació torcido **por culpa de un bug anterior sin arreglar**, no por la simplificación de la imputación.

### El arreglo: un hecho económico, un asiento

El principio ya está escrito en PLAN_MAESTRO §3.1 y acá se violó: **el saldo es la suma de los asientos, y cada asiento representa un hecho real**. Un cobro es **un** hecho. El `Pago` es el hecho; el `Recibo` es el papel que lo documenta. El papel no mueve plata.

| Cambio | Por qué |
|---|---|
| `Pago.alquiler_id` → **nullable** + `Pago.cliente_id` **nuevo** | Cierra el bug 2.6. Habilita pago a cuenta, seña de reserva web, cancelación de deuda vieja y pago de multa |
| `Recibo.pago_id` → **FK obligatoria** | El recibo documenta un pago concreto |
| **Emitir un recibo deja de generar movimiento** | El crédito ya lo generó el `Pago` |
| **"Emitir recibo" desde la CC crea `Pago` + `Recibo`** en una sola acción | El operador no tiene que acordarse de hacer dos cosas — y esa es justamente la confusión que se temía |
| **Botón "Emitir recibo" en cada `Pago`** ya registrado | El caso "cobré y ahora quiero darle el papel" |
| Caja del día: sin cambios | Sigue leyendo `pagos`, y ahora ve **todo** |

**Migración de los datos existentes:** por cada recibo ya emitido hay que crear su `Pago` y **anular uno de los dos créditos** con contra-asiento (nunca borrarlo — regla de nunca eliminar). Conviene revisar cuántos recibos reales hay antes: si son pocos o ninguno, es trivial.

**Lo que sigue pendiente de Franco/Martín** (lo original de este punto, que no cambia):
- **`medios_pago` mixto** — ¿pagan con dos medios en una misma operación? Con el arreglo de arriba esto se vuelve más fácil: sería un recibo con N pagos.
- **Imputación a deudas puntuales (FIFO)** — ¿hace falta saber "este pago canceló ese alquiler", o alcanza con que baje el saldo?

---

## 5. Tarifa semanal/mensual — confirmado que es precio por día, sin prorrateo

**Contexto:** el bug documentado como "PRE-01 · tarifa semanal ×6" resultó, al revisarlo, ser un problema de **interfaz**, no de cálculo. El `calcular_precio_total` (días × monto) ya era correcto desde antes de esta sesión — lo confirma un test que existía previamente (`test_siete_dias_tarifa_semanal`). El campo `monto` de una tarifa **siempre es un precio por día**, sin importar si la banda es diaria, semanal o mensual — la banda sólo decide qué precio por día aplica según cuántos días dura el alquiler. No hay prorrateo: un alquiler de 10 días con tarifa semanal de $25.000/día cuesta $250.000, no "una semana completa + 3 días sueltos a otro precio".

**El riesgo real:** nada en la pantalla de Tarifas aclaraba esto. Un operador cargando una tarifa "Semanal" podía razonablemente pensar que tenía que poner el precio de la semana completa (ej. $150.000), no el precio por día ($21.400). Si eso pasaba, cualquier alquiler de 7+ días cobraría 7 veces ese monto — de ahí el "×6/×7" observado.

**Qué se hizo:** se aclaró la UI (`TarifasTab.tsx`) — cada tipo de tarifa ahora muestra "Precio por día para alquileres de X a Y días", y se agregó una advertencia (no bloqueante, "el sistema informa, la persona decide") si el precio por día de una banda larga no resulta menor al de una corta, que es la señal de que probablemente cargaron el total del período por error. Se blindó el comportamiento actual con dos tests nuevos (`test_no_prorratea_semanal_diez_dias`, `test_no_prorratea_mensual_cuarenta_dias`).

**Por qué se avisa igual:** hoy en la base de datos sólo existen tarifas "diaria" (no hay ninguna semanal/mensual cargada todavía), así que no hay datos reales afectados. Pero es una decisión de negocio real — "el precio por día baja cuanto más larga la banda, sin prorratear" — que conviene que Franco/Martín confirmen que es como quieren cobrar, antes de que carguen la primera tarifa semanal real.

**Estado:** 🟡 **Respondido a medias el 2026-07-28** — *"los precios son por día, por semana, por mes, por fecha"*.

**Lo que esa respuesta confirma:** las cuatro dimensiones de precio que el sistema tiene que soportar, y **las cuatro ya existen**:
- **por día / por semana / por mes** → las bandas de `domain/tarifas.py` (según cuántos días dura el alquiler, cambia el precio),
- **por fecha** → el motor de precios por calendario (migración 039), que es el que resuelve temporada alta, feriados y promociones.

**Lo que NO responde, y es exactamente donde estaba el riesgo:** cuando se carga la tarifa **semanal**, el número que se escribe ¿es el precio **de un día** dentro de esa banda, o el precio **de la semana completa**? Las dos lecturas son razonables en castellano y dan resultados que difieren por 7.

```
Alquiler de 10 días, tarifa semanal cargada con el valor $150.000

  Lectura A — es un precio POR DÍA (lo que el sistema hace hoy):
      10 días × $150.000 = $1.500.000

  Lectura B — es el precio DE LA SEMANA:
      1 semana ($150.000) + 3 días sueltos = ~$214.000
```

**Sigue siendo lo implementado la Lectura A** (`monto` es siempre precio por día; la banda sólo decide *qué* precio por día aplica). La pantalla de Tarifas ya lo aclara desde el 2026-07-26 ("Precio por día para alquileres de X a Y días") y avisa si el precio por día de una banda larga no baja respecto de una corta — que es la señal de que cargaron el total del período por error.

**Pregunta concreta para Franco y Martín, en una línea:** *"Para un alquiler de 10 días, ¿cuánto cobrarían?"* Con ese número se cierra el punto. **Hoy no hay ninguna tarifa semanal ni mensual cargada en la base**, así que no hay datos afectados y no bloquea nada — pero conviene resolverlo antes de que carguen la primera.

---

## 6. Multas — ¿existe descuento por pronto pago?

**Contexto:** el catálogo de notificaciones del plan maestro (§4.2) incluye una regla "multa próxima a vencer (descuento por pronto pago)". Al construir el motor de notificaciones (Fase 2, 2026-07-26) se encontró que el modelo `Multa` no registra ninguna fecha límite de descuento por pronto pago — no hay forma de saber, para ninguna multa cargada, si tiene ese beneficio ni cuándo vence.

**Qué se decidió:** no implementar la regla todavía, en vez de inventar un campo o un umbral sin confirmar cómo funciona en la práctica.

**Estado:** ✅ **RESUELTO POR EL USUARIO el 2026-07-28** — *"lo de multas sí existe, pero no lo tengamos en cuenta, únicamente cargar la multa, con el monto y en todo caso la fecha de vencimiento. Que haya notificación/aviso de esto mismo."*

**Decisión: el descuento por pronto pago NO se modela.** Existe en la realidad, pero calcularlo obligaría a mantener plazos y porcentajes que cambian por jurisdicción y por año — mucha estructura para un beneficio que quien paga la multa ya conoce. Pasa a `docs/DECISIONES.md` como **D-28**.

**Lo que sí se implementa** (chico, sobre lo ya construido):

| Cambio | Detalle |
|---|---|
| `Multa.fecha_vencimiento` | `Date` nullable — hoy `Multa` **no tiene ninguna fecha de vencimiento**, sólo `fecha_infraccion`. Nullable porque muchas multas llegan sin fecha clara |
| Regla de notificación **"multa por vencer"** | Se suma al catálogo (`domain/notificaciones_reglas.py`). Urgencia **alta** — una multa vencida cuesta más plata |
| Regla **"multa vencida sin resolver"** | Urgencia **crítica** |
| El vencimiento en la pantalla de Multas | Columna propia + resaltado de las vencidas |

La ventana de aviso (¿7 días antes? ¿15?) queda como parámetro en `configuracion`, editable, con default 7 — el mismo criterio que el resto de los umbrales.

---

## 7. ¿En qué categoría va cada auto? (composición de la flota)

**Contexto:** las 6 categorías (compacto, sedán, sedán superior, SUV, pick-up, furgón) y la tarifa por categoría existen desde la Fase 1, pero al 2026-07-27 **ningún vehículo tenía categoría asignada** — con lo cual la tarifa por categoría nunca se disparaba y sólo aplicaban las tarifas por vehículo puntual.

**Qué se hizo:** se asignaron las **7 pick-ups** (3 Toyota Hilux, VW Amarok, 2 Foton Tunland, Fiat Titano), que no admiten discusión. **Los 9 autos quedaron sin categoría a propósito.**

**Por qué no se decidió solo:** la segmentación compacto / sedán / sedán superior **fija el tier de precio de la web**. No es una clasificación técnica sino comercial — poner el Virtus en "sedán" o en "sedán superior" cambia lo que cobra el negocio.

**Estado:** ✅ **RESUELTO POR EL USUARIO el 2026-07-28** — *"Las categorías de auto están bien, únicamente el Corsa es Sedán."*

**Era la decisión más urgente de todo el proyecto** (bloqueaba la web entera, punto 8 de `DECISIONES_RESERVAS_WEB.md`). **Ya no bloquea nada.**

| Patente | Vehículo | Categoría final |
|---|---|---|
| `AH762UL` | Fiat Argo Drive MT | **Compacto** |
| `PMH625` | Chevrolet Corsa Classic | **Sedán** ← corregido: la sugerencia decía Compacto |
| `AG591WA` `AH021RK` `AH067LW` `AH462EG` | Fiat Cronos Drive 1.3 (×4) | **Sedán** |
| `LGW669` | Fiat Siena Essence | **Sedán** |
| `AF865DD` | Toyota Etios 1.5 XLS AT | **Sedán** |
| `AG902AQ` | VW Virtus 1.6 | **Sedán superior** |

Queda una flota de **16 vehículos**: 1 compacto · 7 sedán · 1 sedán superior · 7 pick-up.

**Cómo se aplica:** `backend/scripts/asignar_categorias.py`, idempotente:

```
docker compose exec backend python -m scripts.asignar_categorias
```

Es un script y no una migración a propósito — son datos de negocio, no estructura: una migración correría también en una base nueva o de test, donde estas patentes no existen.

**Observación comercial que vale hacer** (no bloquea): con un solo compacto y un solo sedán superior, esas dos categorías se quedan sin cupo apenas se alquila la única unidad. En la web eso se ve como "no disponible" casi siempre. Como se decidió que **todas las categorías se publican estén o no disponibles** (punto 8 de `DECISIONES_RESERVAS_WEB.md`), conviene que esas dos fichas ofrezcan una alternativa clara ("sin disponibilidad para estas fechas — mirá Sedán") en vez de ser un cartel de "no".

**SUV** y **Furgón** existen en el sistema y no las usa ningún vehículo. Quedan cargadas y sin uso: no molestan, y el día que incorporen una unidad ya están. En la web se ocultan solas si se publican sólo las categorías con al menos un vehículo activo.

---

## Estado del documento al 2026-07-28

De los 7 puntos originales, **5 quedaron cerrados**, 1 destapó un bug y 1 quedó a medias.

| # | Tema | Estado |
|---|---|---|
| 1 | CC como libro de todo | ✅ Confirmado → **D-25**. Código revisado y sano |
| 2 | Multas generan débito | ✅ Confirmado → **D-26** |
| 3 | Garantías fuera del ledger | ✅ Confirmado → **D-27** |
| 4 | Recibos simplificados | 🔴 **Bug P0**: `Pago` y `Recibo` acreditan dos veces. Arreglo diseñado |
| 5 | Tarifa semanal/mensual | 🟡 Falta una sola respuesta: *¿cuánto cobrarían 10 días?* |
| 6 | Descuento por pronto pago en multas | ✅ Resuelto → **D-28**: no se modela, sí `fecha_vencimiento` + aviso |
| 7 | Categorías de los 9 autos | ✅ Resuelto — desbloquea la web |

**Lo único que hay que preguntar todavía es el punto 5**, y es una pregunta de una línea.

**Lo único que hay que construir con urgencia es el arreglo del punto 4**, porque hoy —usando el sistema como el usuario dice que quiere usarlo, emitiendo recibo en cada cobro— **todos los saldos quedarían mal**.

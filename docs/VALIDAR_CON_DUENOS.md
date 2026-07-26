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

**Estado:** ✅ Confirmado e **implementado y probado** esta sesión (checkout, anticipo, cobros y excedente ya generan sus asientos automáticos). **Pendiente el ok de Franco/Martín** de todos modos, porque cambia lo que van a ver en la cuenta corriente de cada cliente desde el próximo alquiler que se cierre. Si prefieren el modelo viejo, revertirlo es acotado (ver "Cómo seguir" al final de este documento).

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

**Estado:** ✅ Implementado y probado (2026-07-26): backend (migración 021) más el frontend, que hasta esta sesión no tenía ningún botón para llamarlo — cargar una multa como "imputada" sí generaba el débito, pero no había forma de marcarla "cobrada" o "bonificada" desde la pantalla, sólo un desplegable de estado libre que además no distinguía las dos salidas. Ahora hay dos botones ("Cobrada" / "Bonificar") en la ficha del cliente y en la pantalla global de Multas. **Pendiente el ok de Franco/Martín** sobre si quieren que la multa efectivamente aparezca mezclada en la misma cuenta corriente que el alquiler, o si prefieren llevarla aparte.

---

## 3. Garantías/depósitos — quedan explícitamente FUERA del ledger

**Qué se decidió (sin preguntar, por ser técnicamente la única opción sensata):** el depósito de garantía **no** genera un movimiento en la cuenta corriente. Es un depósito que se retiene y se devuelve (o se ejecuta parcialmente), pero no es "deuda" ni "pago" en el sentido contable — tiene su propio ciclo de vida (`garantia_estado`: retenida / devuelta / ejecutada parcial).

**Por qué se avisa igual:** si en algún momento quieren que una garantía ejecutada (por daños, por ejemplo) sí aparezca como un cargo en la cuenta corriente del cliente, es una extensión simple de lo que ya existe — pero cambiaría la naturaleza de "garantía" de depósito neutro a cargo real. Vale la pena que lo sepan de antemano.

**Estado:** 🟢 Decisión técnica de bajo impacto, no requiere validación urgente — se las avisa por transparencia.

---

## 4. Recibos — versión simplificada, sin imputación a deudas puntuales

**Contexto:** el plan original (`docs/PLAN_MAESTRO.md` sección 3.6) describía un recibo con **medios de pago mixtos** (parte efectivo + parte transferencia en un mismo recibo) y una tabla `recibo_imputaciones` para que el operador elija **a qué deuda puntual** se aplica el pago (ese alquiler, esa multa), con sugerencia automática FIFO (la deuda más vieja primero).

**Qué se construyó en su lugar:** un recibo con **un solo medio de pago**, que genera un crédito contra el **saldo general** de la cuenta corriente del cliente — exactamente el mismo mecanismo que ya usan un pago o un echeq recibido. No permite elegir "este recibo cancela el Alquiler #142 puntualmente"; sólo baja el saldo total.

**Por qué se hizo así:** es consistente con cómo ya funciona el resto del ledger (ningún pago ni echeq imputa tampoco — todos son créditos contra el saldo general), y evita construir una lógica de imputación nueva sin tener claro si hace falta. Es la opción más simple que no rompe nada.

**Qué se pierde con esta simplificación:**
- Si un cliente paga con dos medios distintos en el momento (parte efectivo, parte transferencia), hoy hacen falta **dos recibos**, no uno.
- No queda registrado en el sistema "este pago específico canceló esa deuda específica" — sólo que el saldo bajó. Para la mayoría de los casos (el cliente debe un monto y paga ese monto) da exactamente el mismo resultado. Para casos de pagos parciales contra múltiples deudas simultáneas, el saldo general sigue siendo correcto, pero no hay trazabilidad de "a qué se aplicó cada peso".

**Estado:** ✅ Implementado (versión simplificada) y probado 2026-07-26. **Pendiente el ok de Franco/Martín:** si en la operación real hace falta el recibo con medios mixtos o la imputación a deudas puntuales, es una extensión sobre lo ya construido (no hay que rehacer el módulo), pero conviene confirmar si realmente se usa así en el día a día antes de invertir el tiempo.

---

## Cómo seguir

Cuando Franco/Martín confirmen el punto 1 (el único realmente importante de esta lista):
- Si dicen **que sí** → se pasa este punto a `docs/DECISIONES.md` como una decisión más, con su fecha real de confirmación.
- Si prefieren **el modelo viejo** → se desactiva el automatismo de débito en checkout (queda el resto del ledger igual, sólo se vuelve al comportamiento de "la CC se mueve sólo si elegís cuenta corriente como forma de pago").
- Si quieren **un término medio** (por ejemplo, que el débito automático sólo aplique a alquileres de empresas, o sólo si el cliente tiene cuenta corriente habilitada) — es una variante chica de lo ya construido, no hay que rehacer nada.

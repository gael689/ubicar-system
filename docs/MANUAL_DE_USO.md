# Manual de uso — Ubicar Rent

Qué hace el sistema, qué **no** hace todavía, y cómo se usa. Actualizado el
**11/08/2026**.

> **Estamos en ambiente de prueba.** El dominio `ubicar-rent.com.ar` **no se usa
> todavía** — se conecta la semana que viene. Hasta entonces todo corre en estas
> tres direcciones:
>
> | Pieza | Dirección |
> |---|---|
> | **Sistema interno** | `virtuous-communication-production-7f1e.up.railway.app` |
> | **Web pública** | `ubicar-system.vercel.app` |
> | **API** | `ubicar-system-production.up.railway.app` |
>
> ⚠️ `ubicar-rent.com.ar` hoy sirve **el sitio viejo**. No lo uses para probar
> ni lo compartas: no tiene nada de lo nuevo.

---

## 1 · Las dos puertas: la web y el mostrador

Son **dos sistemas distintos que comparten la misma base**. Lo que cambia es
quién opera y cuánto se le puede pedir.

| | **La web** | **El mostrador** |
|---|---|---|
| Quién usa | El cliente, solo, sin cuenta | El equipo, con login |
| Qué reserva | Una **categoría**, no un auto puntual | Un vehículo con patente |
| Precio | El que resuelve el sistema, sin negociar | Se puede cambiar, con motivo, y queda auditado |
| Pago | Mercado Pago o transferencia | Efectivo, transferencia, tarjeta, cheque, echeq, Wapa |
| Anticipación | **72 horas** mínimo | Ninguna |

**Todo lo que entra por la web cae en el mismo listado de Reservas**, marcado
con origen `web`. No hay una bandeja aparte.

### Lo que la web puede hacer sola
Mostrar disponibilidad real, cotizar con el precio final, tomar el cupo 20
minutos mientras el cliente completa, crear el cliente si no existe, y dejar la
reserva creada.

### Lo que la web **no** hace
- **No confirma nada sin que alguien mire**, salvo el pago por Mercado Pago
  (que se confirma solo por webhook, cuando esté conectado).
- **No asigna el vehículo.** Eso lo hace una persona desde el sistema.
- **No emite el contrato.**

---

## 2 · El ciclo de una reserva, de punta a punta

```
Web:  cotiza → elige categoría → datos → paga (o transfiere) → PENDIENTE DE PAGO
                                                                     ↓
Sistema:  se confirma el pago → CONFIRMADA → se asigna el vehículo
                                                     ↓
                                     se emite el contrato → se manda el link
                                                     ↓
                                        el cliente firma desde el teléfono
                                                     ↓
                          CHECK-OUT (sale el auto) → ACTIVA → CHECK-IN (vuelve)
```

**Los estados y qué significan:**

| Estado | Qué pasó | ¿Ocupa el auto? |
|---|---|---|
| `pendiente_pago` | La web la creó, falta la plata | **No** — la sostiene el cupo, que vence |
| `confirmada` | Se cobró o se aceptó | Sí |
| `activa` | El auto salió (hubo check-out) | Sí |
| `vencida` | Pasó la fecha y no volvió | Sí |
| `finalizada` | Volvió (hubo check-in) | No |
| `cancelada` | Se dio de baja | No |

> **Por qué `pendiente_pago` no ocupa calendario:** un checkout abandonado
> bloquearía el auto hasta que alguien lo note. Lo que reserva el cupo es el
> *hold*, que expira solo a los 20 minutos.

---

## 3 · El contrato

**Tres formas de firmar, las tres terminan igual:**

1. **Por link** (la principal) — se emite, se genera el link, se manda por
   WhatsApp o mail. El cliente lo abre del teléfono, lee las trece cláusulas,
   tilda las tres declaraciones y firma con el dedo.
2. **En papel** — se imprime, se firma con lapicera, y **se adjunta la foto o
   el escaneo**. Sin el ejemplar adjunto, el sistema no puede respaldar que
   exista.
3. **En pantalla** — el cliente firma en el mostrador, en el acto.

**Desde el listado de Reservas**, el cartel de contrato es un botón:

| Dice | Hacés |
|---|---|
| Sin contrato | **Generar contrato** |
| Sin firmar | **Copiar link** · **Regenerar** |
| Firmado | **Ver link** · **Regenerar** |

**El link dura 72 horas.** Generarlo de nuevo devuelve el mismo mientras siga
vigente — regenerar el token mataría el que el cliente ya tiene en su WhatsApp.
Se puede revocar. **El link al PDF sigue andando después de firmado y después de
vencido**, a propósito: quien firmó tiene que poder volver a bajarlo.

**Regenerar anula y emite uno nuevo**, no edita el existente. El texto está
congelado porque es lo que hace oponible lo que el cliente aceptó. Si el que se
anula estaba firmado, **el cliente firma de nuevo** — y el sistema lo avisa
antes.

**Si se cambia el auto de una reserva con contrato firmado**, el contrato se
anula solo: nombraba un vehículo que ya no es, y eso es justo lo único que
importa cuando hay un reclamo por daños.

---

## 4 · La caja

**Todo movimiento de plata pasa por la cuenta corriente del cliente.** No hay
cobros sueltos: cada cobro es un crédito contra un débito que existe.

- **Cobros** — lo que entra, con su medio de pago. Los medios se concilian por
  separado porque tienen comisiones distintas y otro extracto.
- **Pendientes** — lo que se debe, con vencimiento.
- **Gastos** — lo que sale.
- **Echeqs y garantías** — van aparte del libro: una garantía no es un ingreso.

**La seña nunca se devuelve** (D-11): ni por cancelación ni si el cliente no se
presenta. Queda como ingreso retenido, con el motivo. La única excepción es
cuando el que no puede cumplir es Ubicar: ahí se reintegra el 100% o se ofrece
otro vehículo.

---

## 5 · Precios

**Dos capas, y se cargan en lugares distintos:**

| | **La tarifa** | **La regla de calendario** |
|---|---|---|
| Qué es | El precio de siempre | La excepción para unas fechas |
| Dónde | Flota → Categorías | Precios (web / mostrador) |
| Fechas | No tiene: vale todo el año | Sí, desde y hasta |

**El sistema resuelve día por día: si hay regla, manda la regla; si no, manda la
tarifa.**

**Cargar un precio ahora se hace desde el calendario**: se arrastra sobre la
fila de la categoría, se suelta, y aparece un panel que pide dos cosas — precio
por día y qué tipo es. Muestra el efecto antes de guardar. Lo avanzado (días de
la semana, mínimos, prioridad) está plegado.

**El descuento por duración** (−10% de 3 a 6 días, −15% de 7 a 15, −30% de 16 en
adelante) **en la web sólo corre pagando el 100% por adelantado**. Con seña
parcial se cobra el precio de lista. En el mostrador aplica siempre.

**La edad del conductor modifica el precio, no rechaza a nadie.** Se pregunta en
la portada y el precio ya sale con eso adentro — al cliente nunca se le muestra
un recargo etiquetado por su edad.

---

## 6 · Notificaciones y mails

**Dos cosas distintas:**

**La campana** son avisos internos que el sistema genera solo: vencimientos de
VTV y seguro, deudas, reservas web sin atender, y los **"📌 Falta completar"**
que marcan qué datos faltan cargar. **Cuando esa lista queda vacía, el sistema
está listo para vender.** Nadie tiene que acordarse de nada.

**Los mails** salen por Resend y quedan **todos registrados** en
Notificaciones → *Mails enviados*: a quién, cuándo, con qué resultado, y con el
cuerpo que se mandó.

| Mail | Cuándo |
|---|---|
| Reserva confirmada | Automático, con el PDF |
| Check-out | Automático, acta de lo entregado |
| Check-in | Automático, con los cargos si hubo |
| Ofertas | **A mano**, eligiendo los destinatarios |

> ### 🔴 Hoy los mails a clientes NO llegan
> El remitente es `onboarding@resend.dev`, el de prueba de Resend, que sólo
> entrega a la casilla de la cuenta. Esos envíos quedan marcados **"omitido"** —
> ni se intentan, para no mentir que salieron. **Cuando se verifique el dominio
> se reintentan todos desde el panel.** Los avisos internos sí se intentan.

---

## 7 · Lo que el sistema NO hace

Para que nadie lo descubra tarde:

| No hace | Qué se usa mientras tanto |
|---|---|
| **No emite facturas.** No hay ARCA, ni punto de venta, ni CAE | Se guarda la condición de IVA y el CUIT; factura quien factura hoy |
| **No cobra online todavía** | Falta Mercado Pago. La web cierra por transferencia o WhatsApp |
| **No manda mails a clientes** | Falta verificar el dominio en Resend |
| **No confirma sola una transferencia** | No hay webhook: alguien concilia el comprobante y confirma |
| **No opera en Capital Federal** | Sólo Bahía Blanca y la zona. CABA quedó como contacto |
| **No asigna vehículos solo** | Lo hace una persona, y es lo que dispara el contrato |

---

## 8 · Reglas que conviene tener presentes

- **72 horas de anticipación** para reservar por la web.
- **La seña no se devuelve.**
- **No hay edad mínima**, la edad cambia el precio.
- **El precio de la web y el del mostrador se cargan por separado**, salvo la
  tarifa y los descuentos por duración, que son de los dos.
- **Cambiar la tarifa de una categoría cambia el precio en los dos canales.**
- **Todo lo que toca plata queda auditado**, con quién lo hizo. Por eso importa
  que cada uno entre con su usuario y no con el de otro.

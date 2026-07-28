# Plan de Reservas Web — de la landing al sistema, de punta a punta

> **Escrito el 2026-07-27.** Cubre la Fase 6 completa: el flujo de 3 pantallas,
> la disponibilidad real, los holds, Mercado Pago, cómo cae todo en el sistema
> interno y qué notificaciones dispara.
>
> **Las decisiones que dependen de Franco y Martín están en
> `docs/DECISIONES_RESERVAS_WEB.md`**, numeradas y con una recomendación cada
> una, para poder responderlas todas juntas y no trabarse a mitad de camino.

---

## 1. Estado real al 2026-07-27

### Lo que YA está (y sirve)

| Pieza | Estado | Dónde |
|---|---|---|
| Landing en Next.js 16 | ✅ 4.086 líneas, `/` y `/maquinaria` estáticas | `web/` |
| Motor de precios por calendario | ✅ base + fechas + promos, con desglose diario | migración 039 |
| Adicionales (coberturas y extras) | ✅ ABM + contratables en la reserva | migración 040 |
| Bloqueos de vehículo por fecha | ✅ integrados a solapamientos | migración 041 |
| Categorías | ✅ entidad + tarifa por categoría | migración 025 |
| Motor de notificaciones | ✅ 25 reglas + scheduler 08:00 ART | migración 030 |
| Cuenta corriente como ledger | ✅ asientos automáticos | migración 019 |

### Lo que NO está

- **`web/` no habla con el backend.** Hay un `NEXT_PUBLIC_API_URL` declarado en
  `.env.example` y **sin usar**: la única API route que existe es
  `/api/track` (Meta). Todos los CTA terminan en WhatsApp.
- **Los 3 bloques de vehículos de `VehiclesSection.tsx` están hardcodeados**
  (compacto / sedán intermedio / sedán superior) con foto y texto fijo. Son
  justamente las categorías que ya existen en el sistema.
- **`routers/public.py` es un stub roto**: filtra por `estado == 'disponible'`
  e **ignora las fechas que recibe**. Devuelve datos incorrectos hoy.
- **`Reserva.vehiculo_id` es NOT NULL** → no se puede reservar por categoría.
- **No hay holds, ni Mercado Pago, ni bandeja de reservas web.**
- **Auth**: sigue con `DEV_BYPASS_AUTH`. Ver §9.

---

## 2. La arquitectura de punta a punta

```
┌─ web/ (Next.js, público) ──────────────────────────────────────────┐
│                                                                     │
│  Paso 1  fechas → GET /public/disponibilidad → grilla de categorías│
│            ↓ elegir                                                 │
│          POST /public/holds ──────────► HOLD 20 min (cupo tomado)  │
│  Paso 2  adicionales → POST /precios/calcular (canal=web)          │
│  Paso 3  datos + T&C → POST /public/reservas → PENDIENTE_PAGO      │
│            ↓                                                        │
│          Checkout Pro de Mercado Pago (redirect)                    │
└─────────────────────────────────────────────────────────────────────┘
                              ↓ pago
┌─ backend ───────────────────────────────────────────────────────────┐
│  POST /webhooks/mercadopago  (idempotente, re-verifica cupo)        │
│     ├─ aprobado  → Reserva PENDIENTE + Pago + asiento en CC         │
│     ├─ rechazado → libera el hold, reserva queda ABANDONADA         │
│     └─ pendiente → no toca nada, espera el próximo webhook          │
│                              ↓                                      │
│  Notificación "reserva web nueva" (regla que ya existe, sin uso)    │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─ frontend/ (sistema interno) ───────────────────────────────────────┐
│  Bandeja de Reservas Web → Aceptar (asigna vehículo) / Rechazar     │
└─────────────────────────────────────────────────────────────────────┘
```

**El principio que ordena todo esto:** la web **no inventa nada**. Precio,
disponibilidad y adicionales salen de los mismos endpoints que usa el sistema
interno. Si la web calculara su propio precio, tarde o temprano cobraría
distinto que el mostrador.

---

## 3. Reserva por categoría (ítem 58) — el cimiento

Es el cambio estructural del que cuelga todo lo demás.

**Hoy:** `Reserva.vehiculo_id` NOT NULL. Reservar = elegir un auto puntual.
**Con la web:** el cliente elige "Compacto" y el auto se asigna al entregar,
que es como funcionan las rentadoras reales. Si un auto se rompe, se
reemplaza sin tocar la reserva.

### El cambio

- `Reserva.vehiculo_id` pasa a **nullable**, y se suma `categoria_id` (también
  nullable). **Invariante nueva: al menos uno de los dos tiene que estar.**
- **Reserva sin vehículo asignado ≠ reserva sin vehículo.** El cupo se
  descuenta igual; lo que falta es sólo *cuál* de los autos de la categoría.
- **`checkout()` exige `vehiculo_id`.** No se puede entregar una categoría:
  si la reserva no tiene auto asignado, el check-out lo pide.

### Lo que se rompe si no se cuida

1. **Solapamientos.** `detectar_solapamientos` filtra por `vehiculo_id`. Una
   reserva por categoría no aparece en el solapamiento de ningún auto puntual
   → se sobrevende. **Solución: disponibilidad por cupo (§4), que es una
   pregunta distinta y necesita su propia función.** El solapamiento por
   vehículo sigue existiendo tal cual para las reservas con auto asignado.
2. **El calendario de ocupación** dibuja filas por vehículo. Una reserva sin
   vehículo no tiene fila. Necesita una banda "sin asignar" por categoría.
3. **Reportes por vehículo** (`reportes.py`) cuentan ingresos por
   `reserva.vehiculo_id`. Con NULL, esos ingresos desaparecen del reporte.
4. **`bloqueos.py`, `precios`, tarifas** — todos resuelven contra el vehículo.
   Con categoría hay que resolver contra la categoría.

---

## 4. Disponibilidad por cupo

Es una pregunta **distinta** a la del solapamiento, y por eso va en una función
nueva (`domain/disponibilidad.py`), no en un parche de la vieja:

> *"¿Cuántos Compactos quedan libres del 3 al 10 de septiembre?"*

```
cupo(categoría, desde, hasta) =
    vehículos activos de la categoría
  − reservas con vehículo asignado de esa categoría que solapan
  − reservas por categoría (sin vehículo) que solapan
  − bloqueos que solapan
  − holds vigentes no expirados
```

**`GET /public/disponibilidad`** reemplaza al stub roto. Devuelve, por
categoría: foto, specs, `disponibles: N`, precio total y **desglose día por
día** (del motor de precios, `canal="web"`).

- Las categorías **sin cupo se muestran deshabilitadas**, no se ocultan: eso
  convierte, y además evita que el cliente crea que no trabajamos ese segmento.
- Badge **"Última unidad"** cuando el cupo baja a 1 — es el empujón honesto,
  porque es verdad.

**Falta un dato para que esto sirva:** las categorías **no tienen foto ni
specs**. `Categoria` tiene código, nombre, descripción y orden. La web necesita
foto, pasajeros, valijas, transmisión y aire. → migración nueva (§10, paso 2).

---

## 5. Holds — el cupo reservado mientras el cliente completa

Sin esto, dos personas pagan el mismo auto. **Es el punto donde un sistema
interno se convierte en uno público y hostil.**

**Tabla `holds_reserva`:** `categoria_id`, `fecha_inicio`, `fecha_fin`,
`expira_en`, `estado` (`vigente`/`consumido`/`expirado`), `token`,
`reserva_id` (nullable, se completa al confirmar).

- **20 minutos** desde que el cliente elige la categoría (paso 1 → paso 3).
- El contador es **visible** en la web: un hold invisible que expira mientras
  el cliente carga sus datos es una pésima experiencia.
- **La expiración se evalúa al leer, no con un job.** `expira_en < now()` ya
  es la verdad; un cron que “limpia” holds agrega una pieza que puede fallar y
  dejar cupo trabado. El cron sólo marca `expirado` para higiene del histórico.
- Al aprobarse el pago, el hold pasa a `consumido` y nace la reserva.

---

## 6. Mercado Pago — Checkout Pro

**Por qué Checkout Pro y no Checkout API/Bricks:** el flujo redirigido saca de
encima el manejo de datos de tarjeta (PCI DSS). Con Bricks los datos pasan por
nuestro front y el alcance de cumplimiento crece muchísimo, para un negocio
que hoy factura por WhatsApp. Además Checkout Pro acepta todo lo que se usa en
Argentina: tarjetas, dinero en cuenta, Rapipago/Pago Fácil y cuotas.

### El flujo

1. Paso 3 confirma → backend crea la **preferencia** (`POST /public/reservas`)
   y devuelve el `init_point`.
2. El cliente paga en Mercado Pago.
3. MP pega en **`POST /webhooks/mercadopago`**.
4. `back_urls` traen al cliente a `/reserva/resultado`.

### Las cuatro reglas que hacen que esto no pierda plata

1. **El webhook es la única fuente de verdad.** La `back_url` de éxito **no
   confirma nada**: el cliente puede cerrar el navegador antes de volver, o
   manipular la URL. La pantalla de resultado sólo *consulta* el estado.
2. **Idempotencia obligatoria.** MP reintenta el webhook varias veces, y el
   mismo evento puede llegar duplicado. Se guarda `payment_id` con **UNIQUE**;
   si ya se procesó, se responde 200 y se corta. Sin esto se cobra dos veces o
   se generan dos reservas.
3. **Re-verificar el cupo DENTRO del webhook, antes de confirmar.** Entre que
   el cliente empezó a pagar y el pago se aprobó, el hold pudo expirar. Si ya
   no hay cupo → **la reserva queda en revisión manual y se avisa**, no se
   confirma a ciegas. Rechazar algo ya cobrado implica devolución y queda mal.
4. **Nunca confiar en el monto que vuelve del front.** El precio se recalcula
   server-side con el motor (`canal="web"`) al crear la preferencia. Si el
   monto pagado no coincide, va a revisión manual.

### Estados de la reserva web

```
BORRADOR ──► PENDIENTE_PAGO ──► (webhook aprobado) ──► PENDIENTE ──► CONFIRMADA
                  │                                        │  (la acepta una persona)
                  ├──► (rechazado)  ──► ABANDONADA         └──► RECHAZADA
                  └──► (expira)     ──► ABANDONADA
```

`PENDIENTE` es el estado que ya existe: la reserva web cae en la bandeja igual
que cualquier otra, y una persona la acepta. **No se auto-confirma** — ver
decisión #3 en `DECISIONES_RESERVAS_WEB.md`.

---

## 7. Cómo llega al sistema

**Bandeja de Reservas Web** (`/reservas?origen=web`, o pestaña propia):

- La reserva entra como `PENDIENTE` con `origen = "web"` (campo nuevo) y
  **sin vehículo asignado**.
- **Aceptar** = asignar un vehículo concreto de la categoría + confirmar. El
  sistema sugiere los libres en ese rango (usa el cupo de §4).
- **Rechazar** = motivo obligatorio + **devolución de la seña**. Acá aparece
  la parte incómoda: rechazar algo ya cobrado implica devolver plata, y eso
  hoy no está modelado. → decisión #5.
- El **cliente se matchea por DNI o email** antes de crear una ficha nueva.
  Duplicar clientes es la forma más rápida de arruinar la cuenta corriente.

**Lo que ya funciona solo** apenas la reserva existe: el asiento en cuenta
corriente por la seña, el PDF de reserva, y el ciclo de check-out/check-in.

---

## 8. Notificaciones

El motor ya existe (25 reglas). La web suma:

| Regla | Cuándo | Urgencia |
|---|---|---|
| `reserva_web_nueva` | Pago aprobado, espera aceptación | **alta** |
| `reserva_web_sin_responder` | Pendiente > 2 h | **crítica** |
| `reserva_web_sin_cupo` | El webhook no encontró cupo | **crítica** |
| `reserva_web_pago_rechazado` | Para recuperar la venta | media |
| `reserva_web_monto_no_coincide` | Sospecha de manipulación | **crítica** |

La primera **ya está en el catálogo original sin implementar**, esperando
justamente esto (`docs/CATALOGO_NOTIFICACIONES.md`).

**El canal importa:** una reserva web sin responder a las 2 de la mañana no
sirve como notificación in-app — nadie está mirando. Debería ir por WhatsApp o
email inmediato, no en el digest de las 08:00. → decisión #6.

---

## 9. Auth — el prerequisito que no se puede saltear

**`POST /public/reservas` escribe en la base sin autenticación.** Hoy el
sistema corre con `DEV_BYPASS_AUTH=true` y todo se graba con un usuario
ficticio.

No se puede exponer un endpoint público de escritura en ese estado. Mínimo
necesario antes de publicar:

- **Rate limiting** por IP en los endpoints públicos (holds sobre todo: sin
  esto, un script toma todo el cupo de la flota en 10 segundos).
- **Un usuario de sistema real** (`web`) al que se le imputen las reservas
  online, para que el historial tenga autor.
- La **Fase 3.5 (Clerk)** completa para el sistema interno.

Los endpoints públicos **no** necesitan Clerk (el cliente no se loguea para
reservar), pero sí las tres cosas de arriba.

---

## 10. Orden de ejecución

| # | Qué | Depende de |
|---|---|---|
| 1 | **Reserva por categoría** (`vehiculo_id` nullable + `categoria_id`) | — |
| 2 | **Categoría con foto y specs** (para la grilla web) | — |
| 3 | **`domain/disponibilidad.py` + `GET /public/disponibilidad`** | 1, 2 |
| 4 | **Holds** con expiración | 3 |
| 5 | **Mercado Pago** + webhook idempotente | 4, decisiones #1-#5 |
| 6 | **Bandeja de Reservas Web** en el sistema | 1 |
| 7 | **Las 3 pantallas** en `web/` | 3, 4, 5 |
| 8 | **Notificaciones** de la web | 6, decisión #6 |
| 9 | **Rate limiting + usuario `web`** | — (antes de publicar) |

**1, 2, 3 y 6 no dependen de ninguna decisión pendiente** — se pueden ejecutar
ya. Del 4 en adelante conviene tener las respuestas.

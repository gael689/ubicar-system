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

> **Actualización 2026-07-28:** los ítems 1, 2 y 3 están hechos, y **las
> decisiones que trababan del 4 en adelante ya se respondieron** (ver
> `docs/DECISIONES_RESERVAS_WEB.md`). Se puede ejecutar el orden completo.

---

## 11. La experiencia en la web — el Hero como paso 1

> **Agregado el 2026-07-28**, a partir de: *"hice `npm run dev` de la web y no
> vi ningún cambio, ni nada nuevo de lo de reservas. La idea es que estén en el
> Hero todo esto, apenas entrás para reservar, bien marketing, de manera
> estética, todo paso a paso, intuitivo, fluido."*

### Por qué no viste nada

**Porque todavía no se construyó nada en `web/`.** Lo hecho hasta ahora es el
backend que lo hace posible: reserva por categoría (migración 042), categorías
con foto y specs, y `GET /public/disponibilidad` con cupo real. Los ítems 4 a 8
del orden de arriba —holds, Mercado Pago, las pantallas y la bandeja— **están
sin empezar**, y dependían de decisiones que recién se resolvieron el
2026-07-28.

No fue un desvío: construir las pantallas antes de saber cuánto se cobra por
adelantado o qué categorías se publican habría significado rehacerlas.

### La buena noticia: el paso 1 ya existe

`web/components/Hero.tsx` **ya tiene el formulario completo** —lugar de
entrega, fecha y hora de retiro, fecha y hora de devolución, "devolver en otro
lugar"— con calendario, selects de hora cada 30 minutos y un diseño ya
aprobado.

**Lo único que le falta es a dónde va.** Hoy el botón "Cotizar" arma un mensaje
y **abre WhatsApp** (`handleCotizar`, línea 35). Convertirlo en el paso 1 de la
reserva es cambiar el destino de ese submit, no rediseñar el bloque.

Eso importa para el pedido de *"bien marketing, estético"*: **la estética ya
está y no se toca**. Lo que se agrega es lo que pasa después de apretar el
botón.

### El flujo, paso a paso

```
┌─ HERO (/) ─────────────────────────────────────────────────────┐
│  El formulario que ya existe.                                   │
│  "Cotizar" deja de abrir WhatsApp                               │
│  → /reservar?desde=…&hasta=…&lugar=…                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─ PASO 1 · Elegí tu vehículo ───────────────────────────────────┐
│  Grilla de categorías con foto, specs y precio TOTAL del        │
│  período — no "por día": el cliente quiere saber cuánto paga.   │
│  GET /public/disponibilidad                                     │
│  Las sin cupo se muestran igual (D-31) → "Consultar"            │
│  Barra fija arriba con las fechas elegidas + "cambiar"          │
└─────────────────────────────────────────────────────────────────┘
                              ↓  POST /public/holds — cupo tomado 20 min
┌─ PASO 2 · Sumá lo que necesites ───────────────────────────────┐
│  Coberturas (elegís una) — con la franquicia explicada en una   │
│  línea, que es lo que realmente vende                           │
│  Extras (los que quieras) — silla, GPS, portaequipaje           │
│  POST /precios/calcular (canal=web) → total en vivo             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─ PASO 3 · Tus datos y el pago ─────────────────────────────────┐
│  Nombre · DNI · mail · teléfono · fecha de nacimiento           │
│  Cuánto adelantás: [ 30% ] [ 50% ] [ 100% + descuento ]  (D-30) │
│  ☑ Acepto los términos y condiciones                            │
│  POST /public/reservas → Checkout Pro de Mercado Pago           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─ CONFIRMACIÓN (/reservar/listo) ───────────────────────────────┐
│  N° de reserva · qué llevar · cómo cancelar · WhatsApp          │
└─────────────────────────────────────────────────────────────────┘
```

### Las siete reglas de UX que hacen que esto se sienta fluido

**1. El Hero no valida nada, sólo transporta.**
Si el cliente no eligió fechas, el paso 1 se las pide con el mismo calendario.
Frenarlo con un `alert()` en la portada —que es lo que hace hoy— es la peor
manera de recibir a alguien que recién llegó.

**2. Los tres pasos viven en una sola ruta, no en tres páginas.**
`/reservar`, con el paso en el estado. Una navegación real entre páginas pierde
el hold, recarga todo y rompe la sensación de flujo. Con una sola ruta, "volver"
es instantáneo y el hold sobrevive.

**3. El precio total está siempre a la vista, y siempre es el mismo número.**
Una barra fija abajo en mobile, a la derecha en desktop. **El número que se ve
en el paso 1 tiene que ser el que se paga en el paso 3.** Un total que aparece
recién al final es la causa número uno de abandono en un checkout.

**4. El hold se muestra, no se esconde.**
"Te guardamos el auto por 19:43", con cuenta regresiva. Genera urgencia
honesta —no inventada— y explica por qué la cosa se vence. Cuando falten 2
minutos, ofrecer extenderlo en vez de dejarlo caer.

**5. Cada paso pide lo mínimo, y en el orden en que el cliente decide.**
Primero qué auto (es lo que vino a buscar), después los extras (ya está
comprometido), y recién al final los datos personales (el momento de mayor
fricción). Pedir el DNI antes de mostrar un auto es perder gente en la puerta.

**6. "Sin cupo" no es un cartel de "no".**
Con una sola unidad de compacto y una de sedán superior (D-29), la falta de
disponibilidad va a aparecer seguido. Esa tarjeta tiene que **desviar**: *"Sin
disponibilidad para estas fechas — Sedán tiene 7 unidades desde $X"*, más el
botón de dejar los datos (`SIN_DISPONIBILIDAD`, D-04). Es una venta que se
recupera, no un error que se muestra.

**7. Mobile primero, de verdad.**
La mayoría del tráfico de una rentadora local entra desde el teléfono, casi
siempre desde Instagram. Los tres pasos tienen que funcionar con una mano:
calendario a pantalla completa, precios grandes, botón principal fijo abajo.

### Lo que hay que construir en `web/`

| Pieza | Qué es |
|---|---|
| `lib/api.ts` | El cliente del backend. **Hoy no existe** — `NEXT_PUBLIC_API_URL` está declarado en `.env.example` y sin usar |
| `app/reservar/page.tsx` | El contenedor de los 3 pasos |
| `components/reservar/PasoVehiculo.tsx` | Grilla de categorías con disponibilidad |
| `components/reservar/PasoAdicionales.tsx` | Coberturas y extras |
| `components/reservar/PasoDatos.tsx` | Datos, seña y T&C |
| `components/reservar/ResumenPrecio.tsx` | La barra de total, compartida por los 3 pasos |
| `components/reservar/ContadorHold.tsx` | La cuenta regresiva |
| `app/reservar/listo/page.tsx` | Confirmación post-pago |
| `app/terminos` · `app/privacidad` | Los textos legales (`PLAN_TEXTOS_LEGALES.md`) |
| `Hero.tsx` | **Un solo cambio**: `handleCotizar` navega en vez de abrir WhatsApp |

**Lo que NO se toca:** el diseño del Hero, la paleta, la tipografía, ni ninguna
de las secciones existentes. El flujo de reserva hereda el sistema visual ya
aprobado.

**Y `VehiclesSection.tsx` deja de estar hardcodeada:** hoy tiene 3 bloques fijos
(compacto, sedán intermedio, sedán superior) con foto y texto escritos a mano.
Pasa a leer las categorías reales del backend — que desde D-29 ya tienen todas
sus vehículos asignados.

### 🟠 Una contradicción que apareció al mirar la web

**El sistema asume una sola ciudad; la web vende dos.**

El ítem 55 descartó las sucursales con el argumento *"eso de sucursales de
momento sólo es en Bahía Blanca, de manera más local"*. La web dice otra cosa,
y bien fuerte:

- El `<h1>` es **"Alquiler de vehículos en Bahía Blanca y Capital Federal"**.
- El selector de lugar ofrece **"Capital Federal, Juan Francisco Seguí 3607"**.
- Hay un **WhatsApp distinto para CABA** (`whatsappLinkCABA`) — o sea que ya se
  opera diferente según la ciudad.
- Y existe el checkbox **"Devolver en otro lugar"**, que es literalmente
  **one-way**: lo que se descartó cobrar.

En el sistema interno, en cambio, "Juan Francisco Seguí 3607" es **un chip de
texto más** (`LUGARES_PREDEFINIDOS` en `ReservaModal.tsx:26`), indistinguible
de Alsina 350, sin ciudad ni horario asociados.

**Por qué importa:** si alguien reserva retiro en Bahía Blanca y devolución en
Capital Federal, hoy el sistema lo acepta sin decir nada y sin cobrar un peso
de diferencia — y alguien tiene que manejar 700 km.

**Tres preguntas, en orden de importancia:**

1. **¿Se puede retirar en una ciudad y devolver en la otra?** Si la respuesta
   es no, el checkbox "devolver en otro lugar" tiene que limitarse a lugares de
   la misma ciudad. Es un arreglo chico.
2. Si es sí, **¿cuánto se cobra?** Ahí vuelve el cargo one-way del ítem 55.
3. **¿La flota de CABA es la misma?** La disponibilidad por cupo asume que
   cualquier vehículo de la categoría sirve para cualquier punto de retiro. Si
   hay autos que viven en Buenos Aires, el cupo hay que calcularlo **por
   ciudad**, o la web va a prometer un auto que está a 700 km.

**La tercera es la que puede romper algo de verdad**, y conviene resolverla
antes de publicar el flujo, no después.

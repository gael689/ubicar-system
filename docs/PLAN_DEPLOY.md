# Plan de puesta en producción

> ⚠️ **§2 quedó desactualizado — ver `DECISION_HOSTING.md` (2026-08-11).** El
> sistema interno (`frontend/`) va a **Railway**, no a Vercel, y la web pública
> se queda en Vercel pero **en plan pago**. Todo lo demás de este documento
> sigue vigente.

**Fecha:** 2026-07-28
**Objetivo:** sacar Ubicar Rent a producción — la web pública, el sistema
interno y la API — con la base de datos en Railway y el frontend en Vercel.

Este documento tiene tres partes: **dónde va cada cosa** (§1-2), **qué hay que
arreglar antes de poder deployar** (§3, son cinco bloqueantes reales), y **el
orden de trabajo** (§7), que incluye todo lo que quedó pendiente del sistema.

---

## 1. Una aclaración sobre "todo en Vercel"

El pedido fue poner todo el ecosistema en Vercel. **Las dos aplicaciones de
frontend van perfecto ahí. La API no.** Vale explicar por qué antes de entrar
en el plan, porque cambia una decisión de arquitectura.

Vercel corre **funciones serverless**: procesos que arrancan cuando llega un
request y mueren cuando termina. Eso choca con tres cosas que el backend hace
hoy:

| Lo que el backend hace | Qué pasa en serverless |
|---|---|
| **Un scheduler que corre a las 08:00** (`AsyncIOScheduler` en el `lifespan`) | No hay proceso vivo a las 08:00. **Nunca se dispara** |
| **Guardar archivos en disco** (documentos, fotos de daños, PDFs, firmas) | El disco es efímero: lo que se sube **desaparece** |
| **Un pool de 10+20 conexiones** a Postgres | Cada instancia abre el suyo. Con 10 instancias en paralelo son 300 conexiones y Railway las rechaza |

Los tres tienen solución (§3) y **la API puede correr en Vercel** una vez
resueltos. Pero hay un camino más simple: **Railway ya va a estar en la
arquitectura por la base de datos**, y Railway corre contenedores de larga
vida, que es exactamente lo que este backend necesita. Ahí el scheduler
funciona sin tocar nada, el disco persiste y el pool de conexiones tiene
sentido.

### Recomendación

| Pieza | Dónde | Por qué |
|---|---|---|
| **`web/`** (landing + reservas) | **Vercel** | Es Next.js. Es su caso de uso nativo: prerender, CDN global, previews por rama |
| **`frontend/`** (sistema interno) | **Vercel** | Es un SPA de Vite: se sirve como estático, no necesita servidor |
| **`backend/`** (API) | **Railway** | Contenedor de larga vida: el scheduler anda solo y no hay que reescribir el storage |
| **Postgres** | **Railway** | Al lado de la API: latencia mínima y sin salir a internet |

**Igual sirve dejar la API en Vercel** si prefieren un solo proveedor: en §4
está ese camino, con los tres cambios que hay que hacer sí o sí. Es más
trabajo y agrega cold starts, pero es viable.

El resto del plan sirve para las dos opciones; las diferencias están marcadas.

---

## 2. La arquitectura propuesta

```
        ┌── Vercel ──────────────────────────────────┐
        │  ubicar-rent.com.ar        →  web/         │
        │  sistema.ubicar-rent.com.ar → frontend/    │
        └────────────────────┬───────────────────────┘
                             │  HTTPS
        ┌────────────────────▼───────────────────────┐
        │  Railway                                    │
        │    api.ubicar-rent.com.ar  →  backend/     │
        │    Postgres                                 │
        │    Cron diario 08:00 ART                    │
        └────────────────────┬───────────────────────┘
                             │
        ┌────────────────────▼───────────────────────┐
        │  Almacenamiento de archivos                 │
        │  Vercel Blob  o  Cloudflare R2              │
        └─────────────────────────────────────────────┘
```

### Dominios

| Dominio | Apunta a |
|---|---|
| `ubicar-rent.com.ar` | La web pública |
| `sistema.ubicar-rent.com.ar` | El sistema interno |
| `api.ubicar-rent.com.ar` | La API |

Los tres necesitan HTTPS (Vercel y Railway lo dan automático) y que
`api.` esté en los orígenes CORS del backend con los dos dominios de arriba.

---

## 3. Los cinco bloqueantes

**Ninguno de estos es opcional.** Sin resolverlos, el sistema en producción
pierde archivos, no manda avisos o queda abierto a cualquiera.

> **Estado al 2026-07-28: tres de los cinco ya están resueltos.**
>
> | | Bloqueante | Estado |
> |---|---|---|
> | 3.1 | Almacenamiento de archivos | ✅ **Hecho** — falta crear el bucket |
> | 3.2 | Scheduler de las 08:00 | ✅ **Hecho** — funciona solo en Railway |
> | 3.3 | Autenticación real | 🔴 **Pendiente** — necesita Clerk |
> | 3.4 | Pool de conexiones | ✅ **Hecho** — `DB_SIN_POOL` |
> | 3.5 | Rate limiting | ✅ **Hecho** y verificado en vivo |
>
> Lo único que queda del código es Clerk. El resto es configuración de cuentas.

### 3.1 ✅ El almacenamiento de archivos

**Qué pasa hoy.** `LocalStorage` escribe en `./storage_local`. En Railway con
un volumen persistente eso funciona; en Vercel, no. Y en cualquiera de los
dos, tener los archivos dentro del servidor complica los backups y los
redeploys.

**Qué se pierde si no se arregla:** documentos de clientes y vehículos, PDFs
de comprobantes, **fotos de los partes de daños** y **las firmas de los
contratos**. Todo lo que el negocio necesitaría justamente para reclamar.

**La buena noticia:** el sistema ya está preparado. `IStorage` es una interfaz
con cuatro métodos (`upload`, `read`, `delete`, `public_url`) y `LocalStorage`
es sólo una implementación. **Agregar una segunda no toca ningún módulo de
negocio.**

**Estado: resuelto.** Está implementado:

| Qué | Dónde |
|---|---|
| `S3Storage` (sirve para R2, S3 y MinIO) | `app/adapters/storage/s3.py` |
| Elección por variable de entorno | `core/deps.py::get_storage` |
| `/static` se monta **sólo** con `STORAGE_PROVIDER=local` | `app/main.py` |
| Migrar los archivos que ya están en disco | `scripts/migrar_storage_a_blob.py` |
| El `/health` **escribe y lee un archivo de prueba** | `app/main.py` |

Ese último punto importa: una credencial mal cargada no rompe el arranque —la
API responde perfecto— y recién falla cuando alguien sube la foto de un daño.
Por eso el health check lo prueba de verdad en vez de asumirlo.

**Lo que falta es crear el bucket y cargar las credenciales** (`GUIA_DEPLOY.md`
paso 1). No hay más código que escribir.

### 3.2 ✅ El scheduler de las 08:00

**Qué pasa hoy.** `main.py` levanta un `AsyncIOScheduler` en el `lifespan` que
corre todos los días a las 08:00 hora Argentina y genera las **35 alertas** del
catálogo.

- **En Railway:** funciona tal cual. No hay nada que hacer.
- **En Vercel:** nunca se dispara.

**Estado: resuelto para los dos caminos.** En Railway el scheduler corre solo.
Para Vercel existe `POST /notificaciones/cron`, protegido con `CRON_SECRET` y
comparado con `secrets.compare_digest`. **Si la variable no está cargada el
endpoint devuelve 404**, para que no quede abierto por olvido.

```json
{ "crons": [{ "path": "/api/cron", "schedule": "0 11 * * *" }] }
```

> **La hora va en UTC.** Las 08:00 de Argentina son las **11:00 UTC**. Poner
> `0 8 * * *` haría correr el proceso a las 5 de la mañana.

El mismo endpoint limpia los holds vencidos.

### 3.3 🔴 Autenticación real

**Qué pasa hoy.** `DEV_BYPASS_AUTH=true`: todos los pedidos entran como un
usuario ficticio fijo. **En producción eso significa que cualquiera con la URL
entra al sistema entero** — clientes, cuentas corrientes, cobros.

Además, todo lo que el sistema registra como "cobrado por", "autorizado por" o
"atendido por" apunta a ese usuario inventado. **Es el nombre que sale impreso
en el contrato que firma un cliente.**

**Qué hacer:** integrar Clerk (ya hay un `docs/AUTH_CLERK.md` y las skills del
stack disponibles). Alcance mínimo:
- Login en el sistema interno.
- Verificación del token en el backend.
- Un rol de administrador para lo sensible (anular movimientos, editar precios).
- Los endpoints `/public/*` siguen **sin** autenticación: son públicos a
  propósito.

**Estimado:** 3-5 días.

### 3.4 ✅ El pool de conexiones

**Qué pasa hoy.** `pool_size=10, max_overflow=20` por proceso.

- **En Railway** (un contenedor): correcto tal cual.
- **En Vercel:** cada instancia serverless abre su propio pool. Diez requests
  en paralelo pueden pedir 300 conexiones y Postgres las rechaza.

**Estado: resuelto.** `DB_SIN_POOL=true` hace que `app/database.py` use
`NullPool`. Los tamaños también son configurables (`DB_POOL_SIZE`,
`DB_MAX_OVERFLOW`).

Si va a Vercel: activar esa variable **y conectarse por el pooler de Railway**,
no directo a la base.

### 3.5 ✅ Rate limiting en los endpoints públicos

**El problema era real:** `/public/holds` toma cupo sin pedir nada a cambio, así
que un script podía dejar la flota entera sin disponibilidad en segundos.

**Estado: resuelto** en `app/core/rate_limit.py`. Ventana deslizante en memoria
—no balde— para que nadie pueda mandar la ráfaga justo al cambiar el minuto:

| Endpoint | Límite |
|---|---|
| `/public/disponibilidad` | 60 / 60s |
| `/public/holds` | 8 / 60s |
| `/public/solicitudes` | 5 / 300s |

Lee `X-Forwarded-For`, porque detrás del proxy de Railway todas las peticiones
parecerían venir de la misma IP y el límite se aplicaría al tráfico entero como
si fuera un solo visitante.

Verificado en vivo: 7 holds creados, el 8° chocó con el cupo (409) y del 9° en
adelante devolvió 429. La limpieza de holds vencidos va enganchada al cron.

> ⚠️ **Con más de una instancia el límite se multiplica** por la cantidad de
> instancias, porque cada una lleva su contador en memoria. Sigue frenando el
> abuso grosero pero deja de ser exacto. Si escala, ahí sí hace falta Redis.

---

## 4. Si la API igual va a Vercel

Es viable. Además de 3.1, 3.2 y 3.4 (que pasan a ser obligatorios), hace falta:

1. **`vercel.json`** que rutee todo a la app ASGI de FastAPI.
2. **Reducir el bundle.** Vercel tiene un tope de tamaño por función y hoy se
   instalan `boto3`, `reportlab`, `resend` y `python-jose`. Conviene medirlo
   antes de comprometerse.
3. **Aceptar los cold starts.** El primer request después de un rato tarda unos
   segundos. En el mostrador, con alguien esperando, se nota.
4. **Los PDF** (recibos, contratos, reservas) se generan con ReportLab, que es
   Python puro y anda en serverless — pero cada generación paga el cold start.

**Estimado adicional:** 2-3 días, con riesgo de sorpresas en el tamaño del
bundle.

---

## 5. Las APIs que faltan integrar

### 5.1 Mercado Pago — el cobro online

> ### ⚠️ DESACTUALIZADO — esto ya está construido (revisado el 14/08)
>
> Todo lo que la tabla de abajo lista como "por construir" **existe y está en
> producción**: `app/adapters/pagos/mercadopago.py` (preferencia + Checkout Pro
> + refunds), `PagoWebService` (webhook idempotente, revalidación de cupo,
> comparación de monto) y el endpoint
> `POST /api/v1/public/webhooks/mercadopago`. El estimado de 4-5 días **ya no
> aplica**.
>
> Lo único que falta son **las credenciales y la configuración del webhook**:
> el paso a paso está en `docs/para-la-reunion/PASO_A_PASO_MERCADOPAGO.md`.
>
> Dos matices sobre el estado real, para no sobrevender:
> - El paso 4 de la web **hoy no termina en WhatsApp ni en
>   `POST /public/solicitudes`**: cobra por **transferencia bancaria**, con los
>   datos de FINAR ya cargados (`/api/v1/public/config` → `transferencia`).
> - Los tests cubren sólo las funciones puras
>   (`tests/domain/test_pagos_web.py`). **No hay test del endpoint del webhook
>   ni del adaptador de MP**: eso se ejercita por primera vez con un pago de
>   prueba real.

Es lo único que separa al flujo web de vender de verdad. Los pasos 1 a 3 ya
están; el 4 hoy termina en `POST /public/solicitudes`, que registra la
solicitud sin cobrar y **dispara un aviso instantáneo** en la campana del
sistema (`NotificacionService.avisar_reserva_web`). Se atiende a mano desde la
bandeja de Reservas web.

**Qué hay que construir:**

| Pieza | Detalle |
|---|---|
| Crear la preferencia | Con el monto de la seña elegida (30/50/100%) y la referencia de la reserva |
| Redirigir a Checkout Pro | Con las URLs de retorno a `/reservar/listo?status=...`, que **ya está hecha y espera esos parámetros** |
| **Webhook idempotente** | Es la pieza crítica: Mercado Pago reintenta, y sin idempotencia un pago genera dos reservas |
| Revalidar el cupo al acreditar | Si el hold expiró y ya no hay auto, la reserva va a `revision_sin_cupo` (el estado **ya existe**) y dispara una alerta |
| Devoluciones | La API de refunds de Mercado Pago, con contra-asiento en la cuenta corriente |

**Cuatro reglas que no se pueden saltear** (están en `PLAN_RESERVAS_WEB.md` §6):
1. **El webhook es la fuente de verdad**, no la redirección del navegador: el
   cliente puede cerrar la pestaña y el pago igual entra.
2. **Idempotencia por `payment_id`.**
3. **Re-verificar el cupo** antes de confirmar.
4. **Nunca confiar en el monto que vuelve del navegador** — se compara contra
   el de la preferencia.

**Bloqueado por:** las credenciales de la cuenta de Mercado Pago, y las
decisiones #4 y #5 (qué hacer si el pago entra sin cupo, y cómo se devuelve).

**Estimado:** 4-5 días.

### 5.2 Resend — el aviso inmediato

Resend **ya está integrado** para el resumen de las 08:00. Falta que la reserva
web dispare su mail al instante: una reserva que espera hasta mañana a la
mañana es una venta que se cae.

**Bloqueado por:** a qué casilla se avisa (D-32b).

**Estimado:** medio día.

---

## 6. Lo que queda del sistema

Ordenado por lo que más traba.

### 6.1 Datos que tienen que cargar los dueños

Sin esto **la web no puede vender**, aunque todo el código esté listo:

| Falta | Dónde se carga |
|---|---|
| Precios por categoría | `/precios` o la ficha de la categoría |
| Fotos y specs de cada categoría | `/flota/categorias` |
| Seguros y extras con su precio y franquicia | `/adicionales` |
| Franjas de recargo por edad | `/recargos-edad` |

Hay un `scripts/seed_demo_web.py` con datos de demostración para probar el
flujo, y su `--limpiar` para sacarlos antes de producción. **No dejarlos.**

### 6.2 Decisiones pendientes

| Decisión | Traba |
|---|---|
| **D-C1** Datos fiscales del locador | El contrato sale marcado "DOCUMENTO PROVISORIO" |
| **D-C3** Monto de la franquicia | El contrato y la web |
| **D-36** Horarios de entrega | La web ofrece horarios que nadie confirmó |
| **D-39b** Capital Federal | Hoy la web vende sólo Bahía Blanca |
| **D-30b** Descuento por pagar el 100% | Un valor de configuración |
| **D-32b** Casilla de avisos | El mail inmediato |

### 6.2-bis Lo que se cerró después de escribir este plan

Todo esto ya está hecho y verificado, y **no hace falta volver a mirarlo**:

| Qué | Por qué importaba |
|---|---|
| **Doble reserva del mismo auto** | `validar_disponibilidad` leía sin lock: dos personas confirmando el mismo auto veían las dos "libre" y grababan las dos. Se reprodujo el bug y se cerró con `SELECT FOR UPDATE` sobre la fila del vehículo. Hay un `scripts/verificar_concurrencia.py` en el checklist de deploy |
| **Contrato antes de la entrega** (migr. 049) | Colgaba del alquiler, que sólo existe después del check-out. Ahora cuelga de la reserva y se emite apenas se acuerda el alquiler |
| **Firmar en papel** (migr. 050) | Funcionaba pero no estaba contemplado ni registrado. Ahora es explícito y la reimpresión lo dice |
| **Pantalla de Contratos** | `/contratos` era un placeholder en el menú. Era el último del sistema |
| **Familia de avisos "falta completar"** | 5 reglas nuevas: fecha especial sin tarifa cargada (el caso Navidad), categoría con flota pero sin precio, vehículo sin categoría, contrato sin emitir, datos fiscales vacíos |
| **Cola de prioridad en notificaciones** | Se ordenaban sólo por fecha: una crítica de ayer quedaba debajo de una baja de hoy |
| **Política de caché en tres niveles** | Había un único `staleTime` de 2 min con `refetchOnWindowFocus` apagado. Con 3 personas eso significa ver la flota de hace 2 minutos |
| **Filtros** | Cobros por medio/cliente/fecha/factura con desglose de caja; notificaciones por familia y urgencia; reservas por origen, categoría y estado de contrato |
| **Baja de vehículo con reservas vivas** | Se podía dar de baja un auto circulando con un cliente sin que el sistema dijera nada |
| **Total del PDF de reserva** | Mostraba `precio_total`, que no incluye adicionales: el cliente recibía un total menor al que iba a pagar |

### 6.3 Deuda técnica conocida

**`extender()` no genera asiento en la cuenta corriente** (`PLAN_MAESTRO.md`
§2.11). Si un alquiler se extiende después del check-out, el débito queda corto
y **el sistema subfactura en silencio**: la pantalla muestra un saldo que no
coincide con la suma de los movimientos.

Está acotado a una sola función, pero **necesita tres decisiones** antes de
tocarlo: si va un asiento nuevo por la diferencia o se anula el original, qué
fecha de vencimiento le corresponde, y qué pasa si la extensión baja el precio.

**Es lo primero que hay que resolver del sistema interno**, porque toca plata.

### 6.4 Mejoras que ya se pueden hacer

| Mejora | Por qué |
|---|---|
| **`VehiclesSection` conectada al backend** | Hoy son 3 bloques escritos a mano; el sistema tiene 6 categorías reales con foto |
| **Textos legales revisados** | Están escritos y publicados, pero los datos del locador siguen marcados como pendientes |
| **Backups automáticos de la base** | Railway los ofrece; hay que activarlos y **probar una restauración** |
| **Monitoreo de errores** | Hoy un error en producción no avisa a nadie |

---

## 7. El orden de trabajo

### Etapa 1 — Antes de poder deployar (1-2 días)

Se acortó: el storage y el rate limiting **ya están hechos** (§3.1, §3.5).

| # | Tarea | Días |
|---|---|---|
| 1 | **Rotar el token de Meta**, que estuvo público en el bundle de la versión Vite | 0,5 |
| 2 | **Arreglar `extender()`** (§6.3) — necesita las 3 decisiones, y toca plata | 1 |
| 3 | Cargar los **datos fiscales de la empresa** (§6.2, D-C1). Mientras estén vacíos, **todo contrato sale marcado "DOCUMENTO PROVISORIO"**. Ya hay una notificación avisándolo | 0,25 |

> El ítem 2 es el único que sigue siendo código, y es el que más conviene no
> saltear: si un alquiler se extiende después del check-out, **el sistema
> subfactura en silencio**.

### Etapa 2 — Deploy de infraestructura (3-4 días)

| # | Tarea |
|---|---|
| 4 | Bucket R2 + credenciales (§3.1 ya está en código) |
| 5 | Postgres en Railway + **backups activados y una restauración probada** |
| 6 | Correr las migraciones (**hasta la 050**) contra la base de producción |
| 7 | API en Railway (o en Vercel con §4), con el cron de las 08:00 |
| 8 | `web/` y `frontend/` en Vercel |
| 9 | Dominios, HTTPS y CORS con los dominios reales |
| 10 | Verificar `/health` (mira el `storage`) y correr `python -m scripts.verificar_concurrencia` |
| 11 | Monitoreo de errores |

**Al terminar esta etapa el sistema interno ya se puede usar en producción**,
con la salvedad de que todavía no hay login real.

### Etapa 3 — Auth (3-5 días)

| # | Tarea |
|---|---|
| 12 | **Clerk** (§3.3): login, verificación en el backend, roles |
| 13 | Sacar `DEV_BYPASS_AUTH` de producción |

**Es el corte para que el sistema sea usable de verdad por varias personas** —
y para que el contrato salga con el nombre de quien realmente atendió.

### Etapa 4 — Cobro online (1 semana)

| # | Tarea |
|---|---|
| 14 | **Mercado Pago** (§5.1): preferencia, Checkout Pro, webhook idempotente |
| 15 | Devoluciones con contra-asiento |
| 16 | **Resend inmediato** (§5.2) |
| 17 | Cargar los datos reales y sacar los de demo |

**Al terminar esta etapa la web vende sola.**

### Etapa 5 — Pulido

| # | Tarea |
|---|---|
| 18 | `VehiclesSection` conectada al backend |
| 19 | Cerrar las decisiones pendientes (§6.2) y regenerar el contrato sin la marca de provisorio |
| 20 | Textos legales finales |
| 21 | **Módulo de auditoría** — el rastro ya existe (14 modelos guardan quién hizo qué), pero recién con Clerk el usuario registrado es real. Falta la pantalla que lo muestre |

---

## 8. Resumen

**Total estimado hasta que la web venda sola: 2 a 3 semanas.**

Se acortó respecto de la primera versión de este plan porque tres de los cinco
bloqueantes ya están resueltos en código.

| Etapa | Qué habilita | Tiempo |
|---|---|---|
| 1 | Cerrar lo último del sistema | 1-2 días |
| 2 | El sistema interno en producción | 2-3 días |
| 3 | Varias personas usándolo, con auditoría real | 3-5 días |
| 4 | La web vendiendo con cobro online | 1 semana |
| 5 | Pulido | continuo |

**Se puede cortar antes.** Terminadas las etapas 1 y 2, el sistema interno ya
sirve para operar todos los días: reservas, entregas, devoluciones, cobros,
cuentas corrientes, contratos, adicionales y avisos. La web queda completa
hasta el paso 4 y las solicitudes entran por `POST /public/solicitudes`, que
genera un aviso instantáneo en la campana del sistema — o sea que se pueden
atender a mano desde el primer día, sin Mercado Pago.

**Lo que no conviene saltear:**

1. **Crear el bucket** (§3.1). El código está, pero sin bucket los documentos,
   las fotos de daños y las firmas se pierden — justo lo que se necesitaría el
   día que hay un reclamo. El `/health` avisa si está mal configurado.
2. **Los datos fiscales** (§6.2, D-C1). Sin CUIT ni razón social, cada contrato
   que se emita sale marcado **DOCUMENTO PROVISORIO**.
3. **`extender()`** (§6.3). Es el único lugar del sistema donde el ledger puede
   quedar desalineado sin que nadie se entere.

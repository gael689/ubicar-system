# Plan de puesta en producción

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

### 3.1 🔴 El almacenamiento de archivos

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

**Qué hacer:**
1. Escribir `BlobStorage` implementando `IStorage`. Con Vercel Blob o con R2 —
   `boto3` ya está en las dependencias, así que R2 (que es compatible con S3)
   no agrega nada nuevo.
2. Elegir la implementación por variable de entorno en `core/deps.py::get_storage`.
3. `public_url` pasa a devolver la URL del blob, y **desaparece el
   `app.mount("/static")`**.
4. Migrar lo que ya está subido (hoy es poco).

**Estimado:** 1 día.

### 3.2 🔴 El scheduler de las 08:00

**Qué pasa hoy.** `main.py` levanta un `AsyncIOScheduler` en el `lifespan` que
corre todos los días a las 08:00 hora Argentina y genera las 29 alertas.

- **En Railway:** funciona tal cual. No hay nada que hacer.
- **En Vercel:** nunca se dispara.

**Qué hacer si va a Vercel.** El endpoint ya existe: `POST /notificaciones/generar`.
Alcanza con un **Vercel Cron** que lo llame:

```json
{ "crons": [{ "path": "/api/cron/notificaciones", "schedule": "0 11 * * *" }] }
```

Dos detalles que importan:
- **La hora va en UTC.** Las 08:00 de Argentina son las **11:00 UTC**. Poner
  `0 8 * * *` haría correr el proceso a las 5 de la mañana.
- **El endpoint tiene que quedar protegido** con un secreto, o cualquiera
  puede dispararlo desde afuera.

**Estimado:** 2 horas (sólo si va a Vercel).

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

### 3.4 🟠 El pool de conexiones

**Qué pasa hoy.** `pool_size=10, max_overflow=20` por proceso.

- **En Railway** (un contenedor): correcto tal cual.
- **En Vercel:** cada instancia serverless abre su propio pool. Diez requests
  en paralelo pueden pedir 300 conexiones y Postgres las rechaza.

**Qué hacer si va a Vercel:** `poolclass=NullPool` en el engine y conectarse
**por el pooler de Railway**, no directo a la base.

**Estimado:** 1 hora (sólo si va a Vercel).

### 3.5 🟠 Rate limiting en los endpoints públicos

**Qué pasa hoy.** `/public/holds` no tiene límite. Un script puede pedir holds
en loop y **dejar toda la flota sin cupo en segundos**, sin pagar nada.

**Qué hacer:**
- Límite por IP en `/public/holds` y `/public/disponibilidad`.
- Tope de holds vigentes simultáneos por IP.
- El job de limpieza de holds vencidos ya existe (`HoldService.limpiar_vencidos`);
  engancharlo al cron diario.

**Estimado:** medio día.

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

Es lo único que separa al flujo web de vender de verdad. Los pasos 1 a 3 ya
están; el 4 hoy cierra por WhatsApp.

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

### Etapa 1 — Antes de poder deployar (1 semana)

| # | Tarea | Días |
|---|---|---|
| 1 | **Storage a blob** (§3.1) | 1 |
| 2 | **Arreglar `extender()`** (§6.3) — necesita las 3 decisiones | 1 |
| 3 | **Rate limiting** en `/public/*` (§3.5) | 0,5 |
| 4 | Variables de entorno separadas por ambiente y **rotar el token de Meta**, que estuvo público | 0,5 |

### Etapa 2 — Deploy de infraestructura (3-4 días)

| # | Tarea |
|---|---|
| 5 | Postgres en Railway + **backups activados y una restauración probada** |
| 6 | Correr las migraciones contra la base de producción |
| 7 | API en Railway (o en Vercel con §4), con el cron de las 08:00 |
| 8 | `web/` y `frontend/` en Vercel |
| 9 | Dominios, HTTPS y CORS con los dominios reales |
| 10 | Monitoreo de errores y health check |

**Al terminar esta etapa el sistema interno ya se puede usar en producción**,
con la salvedad de que todavía no hay login real.

### Etapa 3 — Auth (3-5 días)

| # | Tarea |
|---|---|
| 11 | **Clerk** (§3.3): login, verificación en el backend, roles |
| 12 | Sacar `DEV_BYPASS_AUTH` de producción |

**Es el corte para que el sistema sea usable de verdad por varias personas** —
y para que el contrato salga con el nombre de quien realmente atendió.

### Etapa 4 — Cobro online (1 semana)

| # | Tarea |
|---|---|
| 13 | **Mercado Pago** (§5.1): preferencia, Checkout Pro, webhook idempotente |
| 14 | Devoluciones con contra-asiento |
| 15 | **Resend inmediato** (§5.2) |
| 16 | Cargar los datos reales y sacar los de demo |

**Al terminar esta etapa la web vende sola.**

### Etapa 5 — Pulido

| # | Tarea |
|---|---|
| 17 | `VehiclesSection` conectada al backend |
| 18 | Cerrar las decisiones pendientes (§6.2) y regenerar el contrato sin la marca de provisorio |
| 19 | Textos legales finales |

---

## 8. Resumen

**Total estimado hasta que la web venda sola: 3 a 4 semanas.**

| Etapa | Qué habilita | Tiempo |
|---|---|---|
| 1 | Que el deploy no pierda datos | 1 semana |
| 2 | El sistema interno en producción | 3-4 días |
| 3 | Varias personas usándolo, con auditoría real | 3-5 días |
| 4 | La web vendiendo con cobro online | 1 semana |
| 5 | Pulido | continuo |

**Se puede cortar antes.** Terminadas las etapas 1 y 2, el sistema interno ya
sirve para operar todos los días: reservas, entregas, devoluciones, cobros,
cuentas corrientes, contratos y avisos. La web queda como está hoy —completa
hasta el paso 4, cerrando por WhatsApp— que ya es mejor que lo que hay.

**Lo único que no se puede saltear es el storage (§3.1).** Deployar sin eso
significa perder documentos, fotos de daños y firmas de contratos, que es
justamente lo que se necesitaría el día que hay un reclamo.

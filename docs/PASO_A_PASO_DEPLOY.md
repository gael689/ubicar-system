# Deploy paso a paso — Railway + Vercel

> ⚠️ **§2.1 quedó desactualizado — ver `DECISION_HOSTING.md` (2026-08-11).** El
> sistema interno va a **Railway**, no a Vercel. El orden obligatorio de abajo
> no cambia: la API sigue yendo primero, porque su URL se congela adentro del
> build del sistema igual que antes.

> Orden obligatorio: **Railway primero**. Los dos proyectos de Vercel necesitan
> la dirección del backend metida adentro del build, así que sin esa URL hay
> que rehacerlos.
>
> Tiempo estimado: 40 minutos si nada se complica.

---

# PARTE 1 — Railway (el backend)

## 1.1 Crear el servicio

Ya tenés el repo conectado. Ahora:

1. En el proyecto de Railway → **+ New** → **GitHub Repo** → `gael689/ubicar-system`
2. Cuando aparezca el servicio → **Settings**
3. **Root Directory**: `backend`
   > ⚠️ **Esto es lo que más se olvida.** Sin esto Railway mira la raíz del
   > repo, no encuentra el `Dockerfile` y falla con un error que no explica
   > nada.
4. **Build**: debería detectar el `Dockerfile` solo. Si te pregunta, elegí
   **Dockerfile**.

## 1.2 Conectar la base de datos

La base ya existe y ya tiene el esquema completo (52 migraciones aplicadas).

1. **Variables** → **+ New Variable** → **Add Reference**
2. Elegí el servicio **Postgres** → variable `DATABASE_URL`

> Esto crea una referencia, no una copia. Si Railway rota la contraseña, se
> actualiza sola. **No pegues la URL a mano.**

## 1.3 Las variables

**Variables** → **Raw Editor** y pegá esto de una:

```env
ENVIRONMENT=production
DEV_BYPASS_AUTH=false

CLERK_JWKS_URL=https://obliging-pheasant-9.clerk.accounts.dev/.well-known/jwks.json
CLERK_ADMIN_SUBS=

STORAGE_PROVIDER=local
STORAGE_PATH=./storage_local

RESEND_API_KEY=
FROM_EMAIL=onboarding@resend.dev
NOTIFICACIONES_DIGEST_DESTINATARIOS=ubicar.rent@gmail.com

PAGOS_PROVIDER=mercadopago
MERCADOPAGO_ACCESS_TOKEN=
MERCADOPAGO_SANDBOX=true

FRONTEND_URL=https://ubicar-sistema.vercel.app
WEB_URL=https://ubicar-web.vercel.app
LANDING_URL=https://ubicar-web.vercel.app
BACKEND_PUBLIC_URL=
```

### Las que tenés que completar

| Variable | De dónde sale |
|---|---|
| `CLERK_ADMIN_SUBS` | Tu **User ID** de Clerk (`user_...`). Dashboard → Users → tu usuario. **Sin esto no podés entrar al sistema** |
| `RESEND_API_KEY` | La que ya tenés en `backend/.env` |
| `BACKEND_PUBLIC_URL` | La URL que te dé Railway. **Se completa recién en el paso 1.5** |
| `FRONTEND_URL` / `WEB_URL` / `LANDING_URL` | Las URLs de Vercel. Si todavía no las tenés, dejá los valores de arriba y corregilas en la parte 2 |
| `MERCADOPAGO_ACCESS_TOKEN` | Después de la reunión. Vacío = el cobro online queda apagado y la web ofrece WhatsApp, que es el comportamiento correcto |

> ⚠️ **`DEV_BYPASS_AUTH=false` y `ENVIRONMENT=production` no son opcionales.**
> Con el bypass activo, el sistema entero queda accesible sin contraseña. El
> backend ahora se **niega a arrancar** si detecta esa combinación, así que si
> ves el deploy fallar con "Configuración insegura para producción", el mensaje
> te dice exactamente qué falta.

> `STORAGE_PROVIDER=local` hace que el backend arranque con una advertencia en
> el log: los archivos subidos se pierden en cada despliegue. Está bien para
> mostrar el sistema; hay que resolverlo antes de cargar documentos de verdad.

## 1.4 Generar el dominio

1. **Settings** → **Networking** → **Generate Domain**
2. Te da algo tipo `ubicar-system-production.up.railway.app`
3. **Copiala**

## 1.5 Completar la URL propia

1. Volvé a **Variables**
2. `BACKEND_PUBLIC_URL` = `https://ubicar-system-production.up.railway.app`
   (sin barra al final)

> Esta es la que usa Mercado Pago para avisar los pagos. El sistema le agrega
> solo el `/api/v1/public/webhooks/mercadopago`.

## 1.6 Verificar

Abrí en el navegador:

```
https://<tu-url-de-railway>/health
```

Tenés que ver algo así:

```json
{"status": "ok", "database": "ok", "storage": "ok", "storage_provider": "local"}
```

**Si falla**, mirá los logs en **Deployments**:

| Error | Qué pasó |
|---|---|
| `Configuración insegura para producción` | Falta `DEV_BYPASS_AUTH=false` o `CLERK_JWKS_URL` |
| No encuentra el Dockerfile | Falta **Root Directory = `backend`** |
| Error de conexión a la base | La referencia a `DATABASE_URL` no quedó |

> `/docs` ya **no funciona** en producción, a propósito: publicaba el mapa
> completo de los 185 endpoints internos.

---

# PARTE 2 — Vercel (los dos frontends)

Los dos salen del mismo repo, en **proyectos separados**. Vercel no limita la
cantidad de proyectos.

## 2.1 El sistema interno

**Add New** → **Project** → `gael689/ubicar-system`

| Campo | Valor |
|---|---|
| **Project Name** | `ubicar-sistema` |
| **Framework Preset** | **Vite** |
| **Root Directory** | `frontend` |

**Environment Variables:**

```
VITE_API_URL = https://<tu-url-de-railway>
VITE_CLERK_PUBLISHABLE_KEY = <la pk_test_... de frontend/.env.local>
```

> ⚠️ **`VITE_API_URL` va SIN `/api/v1`.** El código lo agrega solo. Si lo
> ponés, todo da 404.
>
> ⚠️ Sin `VITE_CLERK_PUBLISHABLE_KEY` el build **pasa** y la página queda en
> blanco. Es el error más difícil de diagnosticar de los dos proyectos.

**Deploy.**

## 2.2 La web pública

**Add New** → **Project** → el mismo repo otra vez.

| Campo | Valor |
|---|---|
| **Project Name** | `ubicar-web` |
| **Framework Preset** | **Next.js** |
| **Root Directory** | `web` |

**Environment Variables:**

```
NEXT_PUBLIC_API_URL = https://<tu-url-de-railway>/api/v1
```

> ⚠️ Acá **SÍ lleva `/api/v1`**. Es al revés que el otro proyecto. Es una
> asimetría fea del código, pero es así.

**Deploy.**

## 2.3 Cerrar el círculo

Volvé a Railway → **Variables** y corregí con las URLs reales que te dio
Vercel:

```env
FRONTEND_URL=https://ubicar-sistema.vercel.app
WEB_URL=https://ubicar-web.vercel.app
LANDING_URL=https://ubicar-web.vercel.app
```

> **Sin esto el navegador bloquea todo por CORS**, y los dos frontends van a
> mostrar "sin conexión con el servidor" aunque el backend esté perfecto.

Railway redespliega solo al guardar.

---

# PARTE 3 — Probar que anda

## 3.1 La web pública
1. Abrí `https://ubicar-web.vercel.app`
2. Buscá un rango de fechas → tienen que aparecer las categorías con precio
3. Entrá al flujo de reserva hasta el paso 4 → tiene que ofrecer WhatsApp
   (porque todavía no hay token de Mercado Pago). **Eso es correcto.**

## 3.2 El sistema interno
1. Abrí `https://ubicar-sistema.vercel.app`
2. Tiene que aparecer la pantalla de ingreso de Clerk
3. Entrá con tu usuario
4. Si te dice *"Tu cuenta todavía no tiene acceso al sistema"* → falta tu
   `user_...` en `CLERK_ADMIN_SUBS` en Railway

> **En Clerk**: Configure → Restrictions → **Enable restricted mode**, para que
> no pueda registrarse cualquiera.

---

# Lo que va a quedar pendiente después de esto

| | Qué falta | Impacto mientras tanto |
|---|---|---|
| 🟡 | Token de Mercado Pago | La web ofrece cerrar por WhatsApp |
| 🟡 | Dominio verificado en Resend | Los mails sólo llegan a la casilla de Ubicar |
| 🟡 | Bucket R2 o volumen de Railway | Los archivos subidos se pierden al redesplegar |
| 🟡 | Dominios propios | Todo anda con las URLs de Vercel y Railway |

**Nada de esto impide mostrar el sistema funcionando en la reunión.**

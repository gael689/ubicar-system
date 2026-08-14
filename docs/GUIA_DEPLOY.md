# Guía de deploy — paso a paso

> ⚠️ **El paso 5 quedó desactualizado — ver `DECISION_HOSTING.md`
> (2026-08-11).** El sistema interno va a **Railway**, no a Vercel. Las
> variables y las verificaciones del paso 5 valen igual; cambia el panel donde
> se cargan.

**Complementa a `PLAN_DEPLOY.md`**, que explica *qué* hay que hacer y *por qué*.
Esto es el *cómo*: los comandos, la configuración de cada panel y el orden.

**Tiempo estimado del deploy completo: media jornada.**

> **Antes de arrancar, lo que hay que tener a mano.** El código está listo —
> tres de los cinco bloqueantes de `PLAN_DEPLOY.md` §3 ya se resolvieron y sólo
> queda Clerk. Lo que falta son **cuentas y credenciales**:
>
> | Necesitás | Para qué | Paso |
> |---|---|---|
> | Cuenta de **Cloudflare** | Bucket R2 (documentos, fotos, firmas) | 1 |
> | Cuenta de **Railway** | Postgres + la API | 2 y 3 |
> | Cuenta de **Vercel** | Las dos aplicaciones de frontend | 4 y 5 |
> | Dominio `ubicar-rent.com.ar` | Apuntar los DNS | 3, 4 y 5 |
> | API key de **Resend** | Digest diario por mail | 3 |
> | Token **rotado** de Meta | La web estuvo con el viejo público | 4 |
> | **CUIT y razón social** de Ubicar | Sin esto todo contrato sale "PROVISORIO" | 6 |
>
> Clerk y Mercado Pago **no hacen falta para deployar**: el sistema arranca sin
> ellos (con la protección por contraseña de Vercel mientras tanto) y la web
> recibe solicitudes sin cobrar.

---

## Las tres piezas y cómo se conectan

```
   Navegador del cliente          Navegador del equipo
            │                              │
            ▼                              ▼
   ubicar-rent.com.ar          sistema.ubicar-rent.com.ar
   (web/ · Next.js)             (frontend/ · React + Vite)
        VERCEL                        VERCEL
            │                              │
            └──────────┬───────────────────┘
                       │  HTTPS · JSON
                       ▼
            api.ubicar-rent.com.ar
              (backend/ · FastAPI)
                    RAILWAY
                       │
            ┌──────────┴──────────┐
            ▼                     ▼
        Postgres            Cloudflare R2
        (Railway)          (archivos)
```

**Las dos aplicaciones de frontend no se conocen entre sí.** Son dos proyectos
independientes que hablan con la misma API. Lo único que comparten es el
backend, y la conexión entre ellos es una sola variable de entorno apuntando
a la misma URL:

| Proyecto | Variable | Valor |
|---|---|---|
| `web/` | `NEXT_PUBLIC_API_URL` | `https://api.ubicar-rent.com.ar/api/v1` |
| `frontend/` | `VITE_API_URL` | `https://api.ubicar-rent.com.ar` |

> ⚠️ **Ojo con el `/api/v1`.** `web/` lo lleva en la variable; `frontend/`
> **no**, porque su cliente ya lo agrega. Ponerlo en los dos termina pidiendo
> `/api/v1/api/v1` y todo da 404.

Y del otro lado, el backend tiene que **autorizar esos dos dominios** por CORS
(`FRONTEND_URL` y `LANDING_URL`). Si eso falta, el navegador bloquea las
llamadas y el síntoma es *"No pudimos conectarnos"* aunque el backend esté
perfectamente vivo.

---

## Paso 1 — Almacenamiento de archivos (Cloudflare R2) ✅ HECHO

> **Resuelto el 11/08 y andando en producción.** Queda documentado para poder
> rehacerlo. El bucket real se llama **`ubicarrent`** (no `ubicar-rent-docs`) y
> sirve por la *Public Development URL*
> `https://pub-dc0a8f08881c4db095f52a836c074c3e.r2.dev`, todavía sin dominio
> propio.

1. En Cloudflare → **R2** → *Enable / Purchase R2*. **Este paso pide tarjeta y
   no se puede hacer por API**: sin él, la API responde
   `Please enable R2 through the Cloudflare Dashboard` y el endpoint S3 ni
   siquiera resuelve TLS.
2. *Create bucket* → nombre `ubicarrent`.
3. *Settings* → **Public Development URL** → habilitar. Lo ideal es un dominio
   propio (`archivos.ubicar-rent.com.ar`), pero eso depende del DNS.
4. **Manage R2 API Tokens** → *Create API token* con permiso **Object Read &
   Write** **sólo sobre ese bucket**. Anotar:
   - Access Key ID
   - Secret Access Key
   - Endpoint (`https://<account_id>.r2.cloudflarestorage.com`) — **sin el
     nombre del bucket al final**: ese va aparte, en `STORAGE_BUCKET`

> ### ⚠️ El dominio público del bucket no pide credenciales
>
> Quien conoce la clave, se baja el archivo. Por eso `S3Storage.public_url()`
> sirve por ese dominio **únicamente el prefijo `categorias/`** y todo lo demás
> —contratos, firmas, documentos de clientes— con **URL firmada que vence a la
> hora**. Ver D-46 y `CIERRE_2026-08-11.md` §3.
>
> **No amplíes esa lista sin leer el test candado** de
> `tests/domain/test_storage_publico.py`.

> **Por qué R2 y no S3:** no cobra egreso. Este sistema muestra fotos de daños
> y reimprime contratos, o sea que lee mucho más de lo que escribe — y en S3
> eso se paga por GB servido.

---

## Paso 2 — Base de datos (Railway)

1. Crear proyecto en Railway → **+ New** → **Database** → **PostgreSQL**.
2. Copiar la `DATABASE_URL` de la pestaña *Variables*.
3. **Activar backups** en *Settings* → *Backups*.

> **Probá una restauración antes de confiar en el backup.** Un backup que
> nunca se restauró es una suposición, no un respaldo.

---

## Paso 3 — La API (Railway)

1. En el mismo proyecto → **+ New** → **GitHub Repo** → elegir el repositorio.
2. *Settings* → **Root Directory**: `backend`.
3. Railway detecta el `Dockerfile` y el `railway.toml` solos.
4. Cargar las variables de entorno:

```bash
DATABASE_URL=${{Postgres.DATABASE_URL}}     # referencia al servicio de arriba
ENVIRONMENT=production

# CRÍTICO: sin esto el sistema queda abierto a cualquiera
DEV_BYPASS_AUTH=false

# CORS — los dominios de los dos frontends
FRONTEND_URL=https://sistema.ubicar-rent.com.ar
LANDING_URL=https://ubicar-rent.com.ar

# CRÍTICO: sin esto se pierden documentos, fotos de daños y firmas
STORAGE_PROVIDER=r2
STORAGE_BUCKET=ubicar-rent-docs
STORAGE_ACCESS_KEY_ID=...
STORAGE_SECRET_ACCESS_KEY=...
STORAGE_ENDPOINT_URL=https://<account_id>.r2.cloudflarestorage.com
STORAGE_PUBLIC_BASE_URL=https://archivos.ubicar-rent.com.ar

RESEND_API_KEY=...
FROM_EMAIL=noreply@ubicar-rent.com.ar
NOTIFICACIONES_DIGEST_DESTINATARIOS=franco@...,martin@...

# Cobro online. Faltaban en esta guía — se agregaron el 14/08.
# Ver docs/para-la-reunion/PASO_A_PASO_MERCADOPAGO.md
PAGOS_PROVIDER=mercadopago
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
MERCADOPAGO_SANDBOX=false
# El notification_url que viaja en cada preferencia. Tiene que ser el MISMO
# que se carga en el panel de Mercado Pago: si se cambia uno solo, se rompe.
#
# ⚠️ HOY VA LA URL DE RAILWAY, NO ESTA. Verificado el 14/08:
# `api.ubicar-rent.com.ar` todavía NO está conectado — no resuelve. Si se
# copia este valor tal cual, el notification_url de cada preferencia apunta a
# un host muerto. Usar mientras tanto:
#   BACKEND_PUBLIC_URL=https://ubicar-system-production.up.railway.app
# Y el día que se conecte el subdominio, cambiarlo ACÁ **y en el panel de
# Mercado Pago** al mismo tiempo.
BACKEND_PUBLIC_URL=https://api.ubicar-rent.com.ar
# CRÍTICO y el más fácil de olvidar: de acá salen las URLs de retorno de la
# preferencia, y su default es localhost:3200. Mercado Pago RECHAZA una
# preferencia con back_urls a localhost, así que sin esto el botón de pagar
# tira error y no se llega ni al checkout.
WEB_URL=https://ubicar-rent.com.ar

# Sólo si la API va a Vercel (en Railway el scheduler corre solo).
# Sin esta variable el endpoint de cron queda deshabilitado, para que no
# sea un agujero abierto por olvido.
# CRON_SECRET=<token largo al azar>
# DB_SIN_POOL=true
```

5. *Settings* → **Networking** → *Custom Domain* → `api.ubicar-rent.com.ar`.
6. Deploy. **Las migraciones corren solas** antes de levantar el servidor
   (`railway.toml`).

> ### ⚠️ Corregido el 11/08 — un fallo de migración **no** frena el deploy
>
> El `startCommand` de `railway.toml` usa `alembic upgrade head; exec uvicorn…`
> con **punto y coma, no `&&`**, y está puesto a propósito: la base se migra por
> fuera del deploy. La consecuencia es que **si alembic falla, uvicorn levanta
> igual contra el esquema viejo y el healthcheck da verde**.
>
> Por eso hay que **verificar `alembic current` a mano** después de cada deploy,
> no confiar en el tilde de Railway.

> La última migración es la **058**. Un `alembic current` tiene que terminar en
> `058_tarifa_generica`. Varias son irreversibles a propósito: la 043 y la 049
> levantan un `RuntimeError` con el motivo, y la **057** no se puede bajar porque
> Postgres no quita valores de un ENUM.
>
> **Las 054 a 058 tocan precios.** Antes de correrlas en una base con datos, ver
> `CIERRE_2026-08-11.md` §6 quater: hay que revisar qué categorías tienen tarifa
> semanal o mensual **sin** diaria, porque ahí la escalera de descuentos se
> aplica encima del precio por bloque y se descuenta dos veces.

### Verificar

```bash
curl https://api.ubicar-rent.com.ar/health
```

```json
{
  "status": "ok",
  "database": "ok",
  "storage": "ok",
  "storage_provider": "r2",
  "environment": "production"
}
```

> **Mirá el `storage`.** El health check escribe y lee un archivo de prueba a
> propósito: una credencial mal cargada no rompe el arranque — la API responde
> perfecto y recién falla cuando alguien sube la foto de un daño. Si dice
> `error`, revisá las variables de R2 antes de seguir.

### Si venís de la base de desarrollo

Subir los archivos que hoy están en disco **antes** de cambiar el proveedor:

```bash
python -m scripts.migrar_storage_a_blob
python -m scripts.migrar_storage_a_blob --verificar
```

Las `archivo_key` guardadas en la base no cambian: son las mismas rutas en los
dos storages. **No borres el disco local hasta verificar.**

---

## Paso 4 — La web pública (Vercel)

1. Vercel → **Add New** → **Project** → importar el repositorio.
2. Configuración:

| Campo | Valor |
|---|---|
| Root Directory | `web` |
| Framework Preset | Next.js *(se detecta solo)* |

3. Variables de entorno:

```bash
NEXT_PUBLIC_API_URL=https://api.ubicar-rent.com.ar/api/v1
NEXT_PUBLIC_STORAGE_URL=https://pub-dc0a8f08881c4db095f52a836c074c3e.r2.dev
META_CONVERSIONS_TOKEN=...     # ⚠️ el token ROTADO, ver abajo
META_PIXEL_ID=26876823408666329
```

> ⚠️ **`NEXT_PUBLIC_STORAGE_URL` no es opcional.** `next/image` necesita el host
> de las imágenes declarado **en tiempo de build** (`next.config.ts`). Sin ella
> el deploy sale en verde y **las fotos de las categorías no renderizan**, aunque
> las URLs que devuelve la API sean correctas. Tiene que coincidir con
> `STORAGE_PUBLIC_BASE_URL` del backend: es el mismo dominio del bucket,
> declarado de los dos lados.

4. **Domains** → `ubicar-rent.com.ar` y `www.ubicar-rent.com.ar`.

> ⚠️ **El token de Meta hay que rotarlo antes de publicar.** En la versión Vite
> estaba dentro del bundle de JavaScript, o sea que fue público. Ya se movió al
> servidor, pero el token viejo sigue comprometido: generar uno nuevo en Meta
> Business y usar ése.

### Verificar

- `https://ubicar-rent.com.ar` carga y **aparece el aviso de cookies**.
- Elegir fechas → aparecen las categorías con precio. Si dice *"No pudimos
  conectarnos"*, es CORS (paso 3, `LANDING_URL`).
- `https://ubicar-rent.com.ar/sitemap.xml` lista cuatro URLs.

---

## Paso 5 — El sistema interno (Vercel)

Segundo proyecto de Vercel, **desde el mismo repositorio**:

| Campo | Valor |
|---|---|
| Root Directory | `frontend` |
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |

```bash
# Sin /api/v1: el cliente de este proyecto ya lo agrega.
VITE_API_URL=https://api.ubicar-rent.com.ar
```

**Domain:** `sistema.ubicar-rent.com.ar`.

> 🔴 **Todavía no hay login.** Hasta que entre Clerk, cualquiera con la URL
> entra al sistema. Mientras tanto, **activar la protección por contraseña de
> Vercel** (*Settings → Deployment Protection*), o dejarlo sin dominio propio.
> No publicarlo abierto.

El `vercel.json` ya trae el rewrite a `index.html` —sin eso, recargar
`/clientes/12` da 404— y el `noindex`, porque es la herramienta interna de la
empresa.

---

## Paso 6 — Después del deploy

### Cargar los datos reales

```bash
# Si quedaron los datos de demostración, sacarlos
python -m scripts.seed_demo_web --limpiar
```

Y cargar desde el sistema, **en este orden** — cada cosa depende de la anterior:

| # | Qué | Dónde | Si falta |
|---|---|---|---|
| 1 | **CUIT y razón social** | Configuración → Empresa | Todo contrato sale "DOCUMENTO PROVISORIO" |
| 2 | Categorías con foto y specs | Flota → Categorías | La web no las muestra |
| 3 | Precio por categoría | Precios | La web dice "sin disponibilidad" **aunque haya autos libres** |
| 4 | Categoría asignada a cada vehículo | Ficha del vehículo | El auto no aparece en la web ni se puede cotizar |
| 5 | Coberturas y extras | Adicionales | El paso 2 de la reserva web sale vacío |
| 6 | Franjas de recargo por edad | Precios → Recargos por edad | La edad no afecta el precio |
| 7 | Fechas especiales y su tarifa | Fechas especiales / Precios | Los feriados se venden al precio de un martes |

> **No hace falta acordarse de todo esto.** El sistema lo reclama solo: la
> familia de avisos **"📌 Falta completar"** detecta los huecos 1 a 4 y 7, y
> aparecen en la campana apenas corra el motor de reglas. Después de cargar los
> datos, tocar "actualizar" en la campana y **la lista tiene que quedar
> vacía de esa familia**.

### Verificación de punta a punta

**Infraestructura**

- [ ] `/health` responde ok y dice `storage: ok`
- [ ] `alembic current` termina en `058_tarifa_generica` (verificado a mano, no por el tilde de Railway)
- [ ] `python -m scripts.verificar_concurrencia` dice OK
- [ ] Subir un documento a un cliente y **volver a abrirlo** (prueba el storage de verdad)

**Sistema interno**

- [ ] Crear una reserva → se descarga el PDF de confirmación y el total incluye los adicionales
- [ ] Emitir un contrato **desde la reserva, sin hacer check-out**, y descargar el PDF
- [ ] Firmarlo en pantalla → el trazo cae **sobre la línea de firma**
- [ ] Registrar un cobro → el botón **Emitir** del listado de Cobros genera el recibo de un click
- [ ] `POST /notificaciones/generar` crea notificaciones, y **las críticas aparecen primero**
- [ ] La campana no muestra nada de la familia "📌 Falta completar"

**Web pública**

- [ ] Muestra categorías con precio real
- [ ] Se puede tomar un hold y se ve la cuenta regresiva
- [ ] Completar una solicitud → **llega el aviso a la campana del sistema en el acto**
- [ ] El aviso de cookies aparece, y **rechazar no carga Meta ni Analytics**

> **Lo de concurrencia no es opcional.** Son tres personas trabajando sobre la
> misma flota: si el lock del vehículo no funciona contra la base de
> producción, dos pueden reservar el mismo auto y el problema recién aparece
> el día de la entrega. El script tarda dos segundos.

### Google

1. **Search Console** → agregar `ubicar-rent.com.ar` → enviar el sitemap.
2. **Perfil de Empresa de Google** — es lo que más mueve la aguja en búsquedas
   locales: dirección, horarios, fotos y el link a `/reservar`.

---

## Si la API va a Vercel en vez de Railway

Es viable pero hay que resolver tres cosas más. El detalle está en
`PLAN_DEPLOY.md` §4; el resumen:

| Qué | Cómo |
|---|---|
| `STORAGE_PROVIDER=r2` **obligatorio** | El disco es efímero |
| **Vercel Cron** | Ver abajo |
| Desactivar el pool | `DB_SIN_POOL=true` y conectarse por el **pooler** de Railway, no directo a la base |

### El cron en Vercel

En `vercel.json`:

```json
{
  "crons": [{ "path": "/api/cron", "schedule": "0 11 * * *" }]
}
```

Y esa ruta llama a `POST /api/v1/notificaciones/cron` con el header
`Authorization: Bearer $CRON_SECRET`.

> **La hora va en UTC.** Las 08:00 de Argentina son las **11:00 UTC**. Poner
> `0 8 * * *` haría correr el proceso a las 5 de la mañana.

El endpoint además limpia los holds vencidos. Está protegido por `CRON_SECRET`
—quien llama es una máquina, no una persona logueada— y si esa variable no
está cargada devuelve 404, para que no quede abierto por olvido.

---

## Problemas frecuentes

| Síntoma | Causa casi segura |
|---|---|
| *"No pudimos conectarnos"* en la web | El dominio no está en `FRONTEND_URL`/`LANDING_URL` (CORS) |
| Recargar una página del sistema da 404 | Falta el rewrite del `vercel.json` |
| Las fotos de categorías no cargan | `STORAGE_PUBLIC_BASE_URL` mal, o falta el host en `next.config.ts` |
| Un documento subido "desaparece" | `STORAGE_PROVIDER` quedó en `local` |
| No llegan notificaciones | El scheduler no arrancó (Railway) o falta el cron (Vercel) |
| El cron devuelve 404 | Falta `CRON_SECRET`: sin esa variable el endpoint queda deshabilitado |
| El cron devuelve 401 | El token del header no coincide con `CRON_SECRET` |
| 429 en la web | Rate limiting. Es lo esperado ante un script; si le pasa a un cliente real, subir los límites en `core/rate_limit.py` |
| `/health` dice `storage: error` | Credenciales de R2 mal cargadas. La API igual responde, pero no se pueden subir archivos |
| El deploy falla al arrancar | Una migración falló. Ver los logs: es intencional que no despliegue |
| La web dice "sin disponibilidad" con autos libres | La categoría no tiene precio cargado. Lo avisa "📌 Falta completar" |
| Un auto no aparece en la web | No tiene categoría asignada |
| El contrato sale con "DOCUMENTO PROVISORIO" | Faltan `empresa.cuit` y `empresa.razon_social` en Configuración |
| Dos reservas sobre el mismo auto | No debería pasar. Correr `scripts/verificar_concurrencia`: si falla, el lock no está funcionando contra esa base |
| Una pantalla muestra datos viejos | El caché es de 15s para lo compartido y se revalida al volver a la pestaña. Si persiste, mirar `lib/queryClient.ts` |
| El PDF del contrato no muestra la firma | Puede ser correcto: si se firmó **en papel** no hay imagen, y el pie del contrato lo aclara |

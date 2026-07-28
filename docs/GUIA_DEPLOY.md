# Guía de deploy — paso a paso

**Complementa a `PLAN_DEPLOY.md`**, que explica *qué* hay que hacer y *por qué*.
Esto es el *cómo*: los comandos, la configuración de cada panel y el orden.

**Tiempo estimado del deploy completo: media jornada**, si los bloqueantes de
`PLAN_DEPLOY.md` §3 ya están resueltos.

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

## Paso 1 — Almacenamiento de archivos (Cloudflare R2)

**Primero esto**, porque el backend lo necesita al arrancar.

1. En Cloudflare → **R2** → *Create bucket* → nombre `ubicar-rent-docs`.
2. *Settings* → **Public access** → habilitar y conectar un dominio, por
   ejemplo `archivos.ubicar-rent.com.ar`.
3. **Manage R2 API Tokens** → *Create API token* con permiso **Object Read &
   Write** sobre ese bucket. Anotar:
   - Access Key ID
   - Secret Access Key
   - Endpoint (`https://<account_id>.r2.cloudflarestorage.com`)

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

# Sólo si la API va a Vercel (en Railway el scheduler corre solo).
# Sin esta variable el endpoint de cron queda deshabilitado, para que no
# sea un agujero abierto por olvido.
# CRON_SECRET=<token largo al azar>
# DB_SIN_POOL=true
```

5. *Settings* → **Networking** → *Custom Domain* → `api.ubicar-rent.com.ar`.
6. Deploy. **Las migraciones corren solas** antes de levantar el servidor
   (`railway.toml`): si fallan, el deploy falla y queda sirviendo la versión
   anterior — que es lo que se quiere.

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
META_CONVERSIONS_TOKEN=...     # ⚠️ el token ROTADO, ver abajo
META_PIXEL_ID=26876823408666329
```

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

Y cargar desde el sistema: precios por categoría, fotos y specs de cada
categoría, coberturas y extras, y las franjas de recargo por edad.

### Verificación de punta a punta

- [ ] `/health` responde ok
- [ ] La web muestra categorías con precio real
- [ ] Se puede tomar un hold y se ve la cuenta regresiva
- [ ] Subir un documento a un cliente y **volver a abrirlo** (prueba el storage)
- [ ] Generar un contrato y descargar el PDF
- [ ] `POST /notificaciones/generar` crea notificaciones
- [ ] El aviso de cookies aparece, y **rechazar no carga Meta ni Analytics**
- [ ] `python -m scripts.verificar_concurrencia` dice OK

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

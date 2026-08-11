# Decisión de hosting — dónde vive cada pieza

**Fecha:** 2026-08-11
**Estado:** decidido por Gael. Corrige a `PLAN_DEPLOY.md` §2, `GUIA_DEPLOY.md`
paso 5 y `PASO_A_PASO_DEPLOY.md` §2.1, que daban los dos frontends en Vercel.

Cambian **dos cosas** respecto de esos documentos. Todo lo demás (Railway para
la API y Postgres, R2 para archivos, el orden de los pasos, las variables) sigue
valiendo tal cual está escrito ahí.

1. El **sistema interno** (`frontend/`) se va de Vercel a **Railway**.
2. La **web pública** (`web/`) se queda en Vercel pero **en plan pago**, porque
   el plan gratuito no admite uso comercial.

---

## El reparto final

| Pieza | Dónde | Dominio |
|---|---|---|
| `web/` — landing + reservas (Next 16) | **Vercel (Pro)** | `ubicar-rent.com.ar` + `www` |
| `frontend/` — sistema interno (Vite) | **Railway** | `sistema.ubicar-rent.com.ar` |
| `backend/` — API (FastAPI) | **Railway** | `api.ubicar-rent.com.ar` |
| Postgres | **Railway** | interno |
| Documentos, fotos, firmas | **Cloudflare R2** | `archivos.ubicar-rent.com.ar` |

El dominio es `.com.ar`, así que el registrante es **NIC.ar** y ningún proveedor
puede venderlo ni transferirlo — sólo se apunta. Conviene delegar los
nameservers de NIC.ar a **Cloudflare** y manejar los cinco nombres desde un
panel único, total R2 ya obliga a tener cuenta ahí.

> ⚠️ **Los registros que apuntan a Vercel van en DNS-only (nube gris), no
> proxied.** Dos CDN encadenadas traen problemas de certificado y de caché que
> después cuestan horas de diagnosticar.

---

## Por qué el sistema interno se va a Railway

**No es una mejora técnica, es sacarlo de un plan que no le corresponde.** Pero
además queda mejor de lo que estaba:

- **Cuesta prácticamente nada de más.** Railway ya se paga por la API y la base.
  Un contenedor sirviendo estáticos idlea en ~40 MB de RAM y sin CPU: entra
  holgado en lo que ya se va a facturar.
- **Queda al lado de su API.** Mismo proyecto, misma consola, mismos logs. Un
  solo lugar donde mirar cuando el mostrador dice "no anda".
- **Se termina el problema de los términos de uso.** El sistema es la pieza más
  inequívocamente comercial de las tres.

**Lo que se pierde: el CDN.** Railway sirve desde una región sola. Para el
sistema da igual — lo usan cuatro personas del mostrador, el bundle se baja una
vez y queda cacheado, y la API está en la misma región, así que hasta juega a
favor. Para la web pública **no** daría igual, y por eso la web no se mueve.

### Cómo se sirve

Es un SPA de Vite: `npm run build` escupe `dist/` y alcanza con un servidor de
estáticos. Dos caminos, en este orden:

1. **Probar primero el detector de Railway** con Root Directory `frontend`. Si
   reconoce Vite y sirve el estático solo, no hace falta escribir nada.
2. **Si no**, un `Dockerfile` de dos etapas con Caddy:

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Vite congela las variables adentro del bundle: tienen que existir ACÁ,
# en el build, no en el runtime. Ver la advertencia de abajo.
ARG VITE_API_URL
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
```

```caddyfile
:{$PORT:80} {
	root * /srv
	encode gzip
	# Sin esto, refrescar en /alquileres da 404: React Router resuelve las
	# rutas en el cliente y el servidor no tiene ese archivo.
	try_files {path} /index.html
	file_server
}
```

> ⚠️ **Las dos variables de Vite se inlinean en tiempo de build.** Son
> `VITE_API_URL` (sin `/api/v1`: el cliente de `src/lib/api.ts` lo agrega) y
> `VITE_CLERK_PUBLISHABLE_KEY`. Si Railway no se las pasa al build, el deploy
> sale **en verde** y el sistema queda pegándole a `http://localhost:8000`
> desde el navegador del mostrador. **Verificarlo después del primer deploy**,
> no asumirlo: abrir el sistema, mirar la pestaña Network y confirmar que los
> requests van a `api.ubicar-rent.com.ar`.

### Lo que queda huérfano

`frontend/vercel.json` y `frontend/VERCEL.md` dejan de aplicar. No se borran
todavía — se borran recién cuando el deploy en Railway esté verificado
andando, no antes.

---

## Por qué la web pública se queda en Vercel, y pagando

### Por qué no se mueve

`web/` es **Next 16 con React 19**, y usa cosas que necesitan runtime de Next:
optimización de `next/image` (declarada en `next.config.ts` para el host del
backend y para Pexels), una API route (`app/api/track/route.ts`), una ruta
dinámica (`app/contrato/[token]`) y `sitemap.ts`. **No es un export estático**,
así que no entra en ningún host de estáticos sin adaptador.

- **Cloudflare Pages** exigiría el adaptador OpenNext: `wrangler.toml`, flag
  `nodejs_compat`, soporte de versiones de Next siempre corriendo atrás, y
  `next/image` resuelto con un loader propio. Es debuggear el adaptador en
  lugar de entregar.
- **Railway** correría `next start` en un contenedor sin problema, pero sin CDN
  ni edge. Para la pieza que hace SEO y recibe al turista desde el celular, eso
  es un downgrade.

### Por qué en plan pago

**El plan Hobby de Vercel es para uso personal y no comercial.** La web de una
rentadora que cobra reservas con Mercado Pago es comercial sin discusión
posible, y el riesgo de suspensión no es teórico.

Las salidas evaluadas:

| Opción | Costo | Veredicto |
|---|---|---|
| **Vercel Pro** | ~USD 20/mes | ✅ **Elegida.** Cero fricción con Next 16, y entra en el mantenimiento mensual |
| Netlify (free) | 0 | Permite uso comercial, pero es un runtime de Next de terceros: puede tener asperezas con Next 16 |
| Vercel Hobby | 0 | ❌ Fuera de términos. Suspenderla un finde largo cuesta más que los 20 dólares |

Si el cliente no banca los USD 20, la alternativa es **Netlify**, que no obliga
a tocar una línea de código. Cloudflare Pages para la web queda descartado.

---

## Lo que hay que tocar el día del deploy

Además de lo que ya está en `GUIA_DEPLOY.md`:

- **`FRONTEND_URL=https://sistema.ubicar-rent.com.ar`** en el backend. Ya está
  documentado en `backend/railway.toml`, pero ahora ese dominio apunta a un
  servicio de Railway, no de Vercel. **El valor no cambia** — CORS mira el
  dominio, no el proveedor.
- **Clerk en instancia de producción** pide sus propios CNAME (`clerk.`,
  `accounts.`, `clkmail.`…). Se olvida siempre y el login queda roto.
- **`BACKEND_PUBLIC_URL=https://api.ubicar-rent.com.ar`**: es el
  `notification_url` del webhook de Mercado Pago. Vacío = el pago se cobra y la
  reserva nunca se confirma.
- **`DEV_BYPASS_AUTH=false`** y **`STORAGE_PROVIDER=r2`**, los dos marcados como
  CRÍTICO en `backend/railway.toml`. El primero deja el back-office abierto a
  internet; el segundo pierde los documentos en cada redeploy.
- **Desactivar el sleep / serverless del servicio de la API en Railway.** Si el
  contenedor duerme por falta de tráfico, el digest de las 08:00 no se manda
  nunca y nadie se entera de que no se mandó.

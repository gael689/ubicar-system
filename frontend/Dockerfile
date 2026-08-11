# Sistema interno (SPA de Vite) servido desde Railway.
#
# Reemplaza al deploy en Vercel — ver `docs/DECISION_HOSTING.md`. El
# `vercel.json` queda en el repo como referencia de los headers y del rewrite,
# pero **lo que manda en produccion es este archivo**.
#
# Dos etapas: se compila con Node y se sirve el `dist/` con Caddy, que pesa
# ~50 MB contra los ~1,1 GB de una imagen de Node con todo el node_modules
# adentro. La imagen final no lleva ni npm ni el codigo fuente.

# ─── Etapa 1: build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

# **Las variables de Vite se congelan en el bundle, no se leen en runtime.**
# Por eso entran como ARG del build y no como ENV del contenedor: si se cargan
# solo como variables del servicio, el deploy sale en verde y la app le pega a
# `http://localhost:8000` (ver `src/lib/api.ts`) o queda en pantalla en blanco
# porque falta la clave de Clerk (`src/main.tsx`).
#
# En Railway hay que declararlas en el servicio; el builder las pasa como
# build args automaticamente cuando existen con el mismo nombre.
ARG VITE_API_URL
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY

# El package-lock primero: mientras no cambien las dependencias, esta capa se
# reusa y el deploy no vuelve a bajar todo npm.
COPY package*.json ./
RUN npm ci

COPY . .

# `npm run build` corre `tsc && vite build`: un error de tipos **frena el
# deploy**, que es lo que se quiere. Un sistema interno que compila con tipos
# rotos es un sistema que falla en la pantalla del que lo esta usando.
RUN npm run build

# ─── Etapa 2: servir ──────────────────────────────────────────────────────────
FROM caddy:2-alpine

COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile

# Railway inyecta PORT. El Caddyfile lo lee; el default es para correr local.
ENV PORT=8080
EXPOSE 8080

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]

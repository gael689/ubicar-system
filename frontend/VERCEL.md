# Deploy del sistema interno en Vercel

Es un SPA de Vite: se compila a estáticos y Vercel los sirve por CDN. No hay
servidor.

## Configuración del proyecto

| Campo | Valor |
|---|---|
| Root Directory | `frontend` |
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |

## Variables de entorno

| Variable | Valor |
|---|---|
| `VITE_API_URL` | `https://api.ubicar-rent.com.ar/api/v1` |

## Dos cosas del `vercel.json`

**El rewrite a `/index.html`** es lo que hace andar el ruteo del lado del
cliente. Sin eso, entrar directo a `/clientes/12` o recargar esa página da 404:
Vercel busca un archivo en esa ruta y no existe.

**`X-Robots-Tag: noindex`** — es el sistema interno de la empresa. No tiene
nada que hacer en Google.

## Antes de publicar

El sistema **todavía no tiene login** (`DEV_BYPASS_AUTH`). Hasta integrar
Clerk, cualquiera con la URL entra. Opciones mientras tanto:

- Dejarlo en una URL de preview de Vercel, sin dominio propio.
- Activar la protección por contraseña de Vercel sobre el proyecto.

**No publicarlo en un dominio conocido sin auth.**

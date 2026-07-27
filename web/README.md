# Ubicar Rent — Web pública (Next.js)

Migración de la landing `ubicar-rent-pro` (Vite + React + shadcn) a Next.js
App Router. Es el punto de partida del ítem 63 del roadmap; el plan completo
está en `docs/PLAN_MAESTRO.md` §9.1.

```bash
npm run dev     # desarrollo
npm run build   # build de producción
npx next start  # servir el build
```

## Qué se migró y qué cambió

| | Antes (Vite) | Ahora (Next 16) |
|---|---|---|
| Render | SPA: el HTML era un `<div id="root">` vacío | `/` y `/maquinaria` **prerenderizadas estáticas** |
| SEO | `react-helmet-async` en cliente | Metadata API + JSON-LD en el HTML servido |
| Rutas | `react-router-dom` | App Router (`app/page.tsx`, `app/maquinaria/page.tsx`) |
| Tipografía | `@import` a fonts.googleapis.com (bloqueante) | `next/font/google`, auto-hosteada |
| Imágenes | 12 MB importados como módulos de Vite | `public/img/` |
| Conversions API | token **expuesto en el bundle** | `app/api/track/route.ts`, token server-side |

### El diseño no se tocó

Se mantuvo **Tailwind 3** a propósito, con el `tailwind.config.ts` y las
variables HSL originales. Migrar a la sintaxis CSS-first de Tailwind 4 habría
implicado reescribir los tokens y arriesgar deriva visual sobre un diseño ya
aprobado. Los componentes de `components/ui/` son los mismos de shadcn.

Sólo se copiaron los 7 componentes de UI que la landing realmente usa
(`button`, `calendar`, `checkbox`, `popover`, `sonner`, `tooltip`), no los 47
del proyecto original.

## ⚠️ Rotar el token de Meta antes de publicar

En la versión Vite el access token de la Conversions API estaba hardcodeado en
`src/lib/meta-pixel.ts` — el propio código lo admitía en un comentario. Estuvo
**público en el JS del sitio en producción**, así que hay que darlo de baja y
generar uno nuevo en Meta Business.

El nuevo va en `META_CONVERSIONS_TOKEN` (ver `.env.example`), nunca en el
código. La API route lo lee del entorno; si no está configurado, el tracking
es un no-op silencioso y no rompe nada en desarrollo.

## Lo que falta (Fase 6)

La landing hoy termina siempre en un link de WhatsApp: no hay disponibilidad
real, ni precios, ni reserva. Encima de esta base van:

- Buscador de disponibilidad por categoría + fechas (ítem 60).
- Flujo de reserva de 3 pasos con hold temporal (ítem 61).
- Checkout con seña por Mercado Pago (ítem 62) — el webhook como API route,
  que es una de las razones por las que esto no podía seguir siendo un SPA.
- Las reservas caen en la bandeja del sistema (ítem 64).

El WhatsApp **no se saca**: es el canal que funciona hoy y convive con la
reserva online.

Depende de la Fase 5 (reserva por categoría + motor de precios): sin eso la
web no tiene qué vender ni a qué precio.

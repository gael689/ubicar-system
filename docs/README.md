# Documentación — Ubicar Rent

Índice de qué sirve para qué. **Actualizado el 2026-08-11.**

Lo que ya cumplió su función está en **`_archivo/`**: no se borra, pero no se
lee para trabajar. Si un documento contradice a otro, gana el más nuevo — y hay
que arreglar el viejo o archivarlo.

---

## 📁 Para la reunión → `para-la-reunion/`

Lo que va a la reunión con Franco y Martín está **todo junto en esa carpeta**,
con un `LEEME.md` que dice en qué orden usarlo y qué traerse de vuelta. Si
estás preparando una reunión, no necesitás nada de lo que sigue.

## Empezá por acá

| Documento | Para qué |
|---|---|
| **`DECISIONES.md`** | **La fuente de verdad.** Toda decisión de producto, con su porqué. Si algo del sistema no se entiende, la respuesta suele estar acá |
| **`CIERRE_2026-08-11.md`** | Lo último que se hizo, qué quedó desplegado y qué falta para el deploy final |
| **`para-la-reunion/PENDIENTES.md`** | Qué falta y qué depende de los dueños, por urgencia |

## Para los dueños

| Documento | Para qué |
|---|---|

## Poner en producción

| Documento | Para qué |
|---|---|
| **`GUIA_DEPLOY.md`** | El *cómo*: comandos, paneles y orden. **Es el que se sigue** |
| `DECISION_HOSTING.md` | Dónde vive cada pieza. Corrige a los planes viejos: el sistema interno va a **Railway**, no a Vercel |
| `PLAN_DEPLOY.md` | El *qué* y el *por qué* de la arquitectura de despliegue |
| `DEMO_LOCAL.md` | Levantar todo en una máquina, sin depender de internet. Plan B para mostrar |

## Referencia del sistema

| Documento | Para qué |
|---|---|
| `MANUAL_DEL_SISTEMA.md` | Qué hace el sistema hoy, módulo por módulo, relevado del código |
| `CASOS_DE_USO.md` | Lista trackeable de todo lo que tiene que poder hacer, con IDs estables |
| `CATALOGO_NOTIFICACIONES.md` | Todos los avisos que el sistema genera solo |
| `ANALISIS_CICLO_RESERVA.md` | El ciclo operativo en detalle: reserva, precios, clientes, vencimientos |
| `PLAN_MAESTRO.md` | Arquitectura y fases. Marco general |

## Temas puntuales

| Documento | Para qué |
|---|---|
| `DECISIONES_RESERVAS_WEB.md` | Las decisiones específicas del flujo web y Mercado Pago |
| `ANALISIS_WAPA.md` | Si Wapa sirve para cobrar, y por qué sí en el mostrador y no en la web |
| `ALTERNATIVAS_COBRO.md` | El resto del mercado de cobros, y el requisito de preautorización para la garantía |
| `PLAN_TEXTOS_LEGALES.md` | Términos, privacidad y clausulado |
| `PLAN_ANALYTICS.md` · `PLAN_ESCALABILIDAD.md` · `PLAN_FRONTEND_UX.md` | Planes por área, todavía vigentes |

---

## Historial

`CIERRE_2026-08-09.md` y `CIERRE_2026-08-11.md` son el registro de las últimas
jornadas. Los cierres viejos están en `_archivo/`.

**Convención:** un cierre por jornada de trabajo, con lo que se hizo, **por qué**
y qué quedó sin hacer. Las decisiones que salen de ahí se copian a
`DECISIONES.md`, que es lo que se lee después.

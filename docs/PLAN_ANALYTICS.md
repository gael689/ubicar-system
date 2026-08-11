# Plan de Analytics y Reportes — Ubicar Rent

**Fecha:** 2026-07-25 · **Parte B agregada:** 2026-08-11
**Objetivo:** poder medir todo lo medible del negocio — por mes, semana y año, y por cliente, vehículo, categoría, empresa, sucursal y operador.
**Relacionados:** `docs/DECISIONES.md` · `docs/PLAN_MAESTRO.md` · `docs/PLAN_FRONTEND_UX.md`

> **Dos cosas distintas, no confundirlas.**
> - **Parte A (secciones 1 a 6)** — los reportes del **sistema interno**, en `/reportes`. Miden el negocio: plata, flota, clientes. Salen de la base de datos.
> - **Parte B (sección 7)** — la **analítica del sitio público**, en Google Analytics y Meta. Mide el sitio: cuánta gente entra, por dónde se cae, qué campaña trajo la reserva. Sale de las cookies del visitante.
>
> Se responden preguntas distintas y los números **no van a coincidir nunca**: el sistema sabe de reservas confirmadas, Google Analytics sabe de navegadores.

> ⚠️ **El Inicio no se toca.** El calendario estilo Excel sigue siendo la pantalla de entrada, completa y sin scroll (decisión D-24). Todo lo que está en este documento vive en `/reportes`, un módulo aparte. El panel "Flujo del día" que hoy está en el Inicio se muda acá.

---

## 1. Estado actual

`/reportes` tiene hoy dos pestañas:

| Reporte | Qué muestra |
|---|---|
| Ingresos | Desglose mensual por año: ingresos, egresos, margen, por medio de pago. BarChart + tabla + export CSV |
| Flota | Por rango de fechas: ocupación, alquileres, ingresos, gastos y margen por vehículo. BarChart + tabla + CSV |

Está bien hecho (recharts, `staleTime` de 5 min, export CSV) pero **cubre sólo dos preguntas de las decenas que el negocio necesita responder**. No hay nada de clientes, ni de categorías, ni de operación, ni comparativas contra el período anterior.

---

## 2. Los indicadores del rubro

Antes de listar pantallas, vale fijar las métricas que definen un rent-a-car. Son las que hay que poder ver de un vistazo:

| Métrica | Qué mide | Cómo se calcula |
|---|---|---|
| **Ocupación (%)** | Cuánto se usó la flota | Días alquilados / días disponibles |
| **Tarifa promedio diaria (ADR)** | A cuánto se vendió el día | Ingresos por alquiler / días alquilados |
| **RevPAV** | **El indicador rey.** Combina precio y ocupación | Ingresos / vehículos disponibles. Permite comparar categorías entre sí |
| **Duración promedio** | Qué tan largos son los alquileres | Días totales / cantidad de alquileres |
| **Ticket promedio** | Cuánto factura una reserva | Ingresos / reservas |
| **Margen por vehículo** | Si el auto se paga solo | Ingresos − gastos − mantenimiento |
| **Costo por km** | Eficiencia real de la unidad | Gastos totales / km recorridos |
| **Tasa de conversión** | Cotizaciones que terminan en reserva | Reservas / cotizaciones |
| **Tasa de cancelación y no-show** | Demanda que se pierde | Canceladas / total |
| **Días de cobranza (DSO)** | Cuánto tardan en pagar | Saldo promedio / ventas × días |
| **Demanda insatisfecha** | Reservas que no se pudieron tomar | Solicitudes `SIN_DISPONIBILIDAD` por categoría |

La última sale gratis gracias a la decisión D-04 (dejar reservar sin cupo) y es la que dice **qué autos conviene comprar**.

---

## 3. Estructura del módulo

Seis pestañas dentro de `/reportes`, más un selector de período global que se aplica a todas.

**Selector de período, siempre arriba:**
```
[ Hoy ] [ Semana ] [ Mes ] [ Trimestre ] [ Año ] [ Personalizado ▾ ]
☑ Comparar con el período anterior
```

La comparación contra el período anterior es lo que convierte un número en información: "$4.200.000" no dice nada; "$4.200.000, +18% vs junio" sí.

### 3.1 Resumen

La pantalla de apertura del módulo. Tarjetas con la métrica, la variación y un sparkline.

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ Ingresos     │ Ocupación    │ ADR          │ RevPAV       │
│ $ 4.200.000  │    68%       │ $ 71.500     │ $ 48.600     │
│ ▲ 18% ~~~~   │ ▼ 4% ~~~~    │ ▲ 9% ~~~~    │ ▲ 12% ~~~~   │
├──────────────┼──────────────┼──────────────┼──────────────┤
│ Reservas     │ Duración med.│ Ticket med.  │ Margen       │
│    47        │  5,2 días    │ $ 89.400     │    41%       │
└──────────────┴──────────────┴──────────────┴──────────────┘

  Ingresos vs egresos por mes          Ocupación por categoría
  [ barras ]                           [ barras horizontales ]

  Top 5 vehículos por margen           Top 5 clientes por facturación
  [ tabla ]                            [ tabla ]
```

Más el **Flujo del día** que hoy vive en el Inicio: la línea de tiempo con reservas nuevas, check-outs, devoluciones, pagos y gastos de la jornada.

### 3.2 Ingresos y finanzas

Amplía el reporte actual:

- Ingresos, egresos y margen por mes/semana/año, con comparativa
- **Desglose por concepto:** alquiler, excedentes, adicionales, combustible, limpieza, daños, multas. Hoy todo va junto y no se sabe de dónde viene la plata
- Por medio de pago
- **Facturado vs no facturado** (decisión D-14 del plan: `requiere_factura` en la reserva)
- **Cobranzas:** DSO, aging de deuda, evolución del saldo total en cuenta corriente
- **Cartera de echeqs por mes de vencimiento** — con qué plata se cuenta
- **Descuentos otorgados** por período y por operador
- **Excedentes bonificados** — el agujero de ingresos que hoy nadie mira
- Proyección de cobros de los próximos 30/60/90 días

### 3.3 Flota

- Ocupación por vehículo y **por categoría**
- Ingresos, gastos, mantenimiento y margen por unidad
- **Costo por kilómetro**
- Km recorridos por período
- **Ranking de rentabilidad** — qué autos conviene renovar o vender
- Días fuera de servicio y su motivo
- Vencimientos próximos consolidados
- Historial de precios por categoría
- **Curva de vida:** margen acumulado del vehículo desde su compra

### 3.4 Clientes

Todo esto falta por completo hoy.

- Ranking por facturación, por cantidad de alquileres y por margen
- **Empresas vs particulares** — volumen, ticket, duración y morosidad de cada segmento
- Clientes nuevos vs recurrentes por período
- **Frecuencia de recompra** y tiempo entre alquileres
- Deudores ordenados por antigüedad de la deuda
- Clientes inactivos (no alquilan hace N meses) — lista de recuperación
- Tasa de cancelación y no-show por cliente
- **Categoría preferida** por cliente, para ofrecerle lo correcto
- Origen del cliente: web, mostrador, teléfono, referido

### 3.5 Operación

- Reservas creadas, confirmadas, canceladas, no-show
- **Motivos de cancelación** agrupados
- Check-outs y check-ins por día de semana y por hora → **cuándo hace falta más gente en el mostrador**
- Puntualidad: % de devoluciones en hora, con atraso y anticipadas
- Atraso promedio y cargos por excedente cobrados vs bonificados
- Estado de combustible y limpieza en las devoluciones
- Daños registrados por vehículo y por cliente
- Duración promedio por categoría
- **Demanda insatisfecha** — solicitudes sin cupo por categoría y fecha
- Estacionalidad: mapa de calor de ocupación por día del año

### 3.6 Comercial

- Cotizaciones emitidas, aceptadas, vencidas
- **Tasa de conversión** global, por operador y por categoría
- Tiempo promedio entre cotización y reserva
- Valor promedio de la cotización vs de la reserva concretada
- Adicionales más vendidos y su aporte al margen
- Cuando esté la web: reservas online vs mostrador, y el embudo del flujo de 3 pasos

---

## 4. Cortes disponibles en todos los reportes

Cualquier métrica se tiene que poder ver filtrada por:

**Tiempo** — día · semana · mes · trimestre · año · rango libre, con comparativa contra el período anterior o contra el mismo período del año pasado.

**Dimensión** — vehículo · categoría · cliente · tipo de cliente · sucursal · operador · medio de pago · origen de la reserva · con/sin factura.

El principio: **toda tarjeta o barra tiene que ser clickeable y llevar al detalle**. Si el margen de julio bajó, quiero poder clickear y ver qué alquileres lo componen, sin cambiar de pantalla ni exportar nada.

---

## 5. Notas técnicas

**Rendimiento.** Los reportes actuales calculan todo en Python recorriendo registros. Con dos años de operación eso no aguanta. Recomendaciones:

- Agregaciones en SQL con `GROUP BY`, no en el service
- Índices sobre las columnas de fecha (que además deben migrar de `String` a `Date`, ver Fase 0)
- Tabla materializada de resúmenes diarios, recalculada por el mismo scheduler que las alertas: `resumen_diario` con ingresos, egresos, ocupación, alquileres y km por día. Los reportes largos leen de ahí en vez de recorrer la historia
- Caché con `staleTime` alto (ya está bien aplicado)

**Exportación.** CSV en todo (ya existe) + **PDF con el membrete de Ubicar**, reutilizando el pipeline server-side de recibos y facturas de la Fase 1.

**Reporte mensual automático.** El mismo motor de notificaciones puede mandar el día 1 de cada mes un resumen del mes cerrado por email. Cuesta poco y es lo que hace que efectivamente lo miren.

**Consistencia visual.** Un solo sistema de gráficos (recharts, que ya está), una paleta común y formato de moneda unificado en todo el módulo.

---

## 6. Prioridad

| Etapa | Qué | Cuándo |
|---|---|---|
| 1 | Selector de período global + comparativa contra período anterior | Fase 3 |
| 2 | Pestaña **Resumen** con las 8 métricas clave | Fase 3 |
| 3 | Mudar el **Flujo del día** desde el Inicio | Fase 3 |
| 4 | Ampliar **Ingresos** con desglose por concepto, facturado/no facturado y cobranzas | Fase 3 (depende del ledger de la Fase 1) |
| 5 | Pestaña **Clientes** completa | Fase 3 |
| 6 | Pestaña **Operación** | Fase 4 (varias métricas dependen de los estados y cargos nuevos) |
| 7 | Ampliar **Flota** con costo por km y ranking de rentabilidad | Fase 4 |
| 8 | Pestaña **Comercial** | Fase 5 (depende del cotizador con BD) |
| 9 | Tabla `resumen_diario` + reporte mensual por email | Fase 4 |

**Dependencias a tener en cuenta:** buena parte de estas métricas sólo son calculables después de la Fase 1 (ledger de cuenta corriente, cargos de cierre desglosados, con/sin factura) y de la Fase 4 (estados `NO_SHOW` y `VENCIDA`, parte de daños). Construir la pestaña Operación antes de tener esos datos daría gráficos vacíos.

---
---

# Parte B — Analítica del sitio público (`web/`)

**Fecha:** 2026-08-11
**Pregunta que responde:** *"el uso de cookies, ¿en dónde las vemos? ¿cómo medimos estas métricas y demás?"*

## 7.1 Dónde se ven las métricas

Hay **dos tableros**, y hay que entrar con las cuentas correspondientes. No hay
nada de esto dentro del sistema: son servicios de afuera.

| Dónde | Qué se ve | Con qué ID | Estado |
|---|---|---|---|
| [Google Analytics](https://analytics.google.com) → propiedad de Ubicar Rent | Visitas, de dónde vienen, qué páginas miran, el embudo de reserva y la tasa de conversión | `G-25783YNP7G` | **Activo**, verificado el 11/08 |
| [Meta Events Manager](https://business.facebook.com/events_manager2) | Qué anuncio de Instagram/Facebook trajo cada reserva | Píxel `26876823408666329` | **Activo**, verificado el 11/08 |

Los dos IDs ahora se leen de variables de entorno (`NEXT_PUBLIC_GA_ID` y
`NEXT_PUBLIC_META_PIXEL_ID`), con los de arriba como valor por defecto. Antes
estaban escritos duro en `web/app/layout.tsx`.

> **Nota sobre verificar el píxel a mano.** Si se prueba con un navegador
> automatizado, el píxel de Meta **no dispara nada**: tiene `botblocking`
> activado y descarta el user-agent `HeadlessChrome` sin avisar. No es que esté
> roto. Con un user-agent normal manda todo. Esto costó un rato entenderlo.

## 7.2 Qué se mide

Todo pasa por `web/lib/analitica.ts`, que es **el único lugar** donde se declaran
eventos. Cada acción va a GA4 (nombre de e-commerce, para que arme el informe de
embudo solo) y a Meta (evento estándar, el único tipo que un anuncio puede tomar
como objetivo de optimización).

| Momento del negocio | GA4 | Meta | Estado |
|---|---|---|---|
| Buscó disponibilidad | `view_item_list` | `Search` | ⏳ falta enganchar |
| Buscó y no había cupo | `sin_disponibilidad` | — | ⏳ falta enganchar |
| Eligió una categoría | `select_item` | `ViewContent` | ⏳ falta enganchar |
| Se le tomó el cupo (arrancó la reserva) | `begin_checkout` | `InitiateCheckout` | ⏳ falta enganchar |
| Completó sus datos | `add_shipping_info` | `AddPaymentInfo` | ⏳ falta enganchar |
| **Reserva concretada** | `purchase` | `Purchase` | ⏳ falta enganchar |
| Dejó datos sin cupo (D-04) | `generate_lead` | `Lead` | ⏳ falta enganchar |
| Click en WhatsApp / teléfono | `generate_lead` | `Lead` | ✅ **andando** |
| Click a `/reservar` desde la portada | `select_promotion` | — | ✅ **andando** |

Las funciones **ya están escritas y probadas**; lo que falta es la línea que las
llama desde el flujo de reserva. Ver 7.5.

### Lo que estaba mal contado

Dos botones que **no son contactos** mandaban `Lead` a Meta:

- El buscador del Hero (`Hero.tsx:116`): cada persona que apretaba "Buscar"
  contaba como lead.
- Cada tarjeta de la grilla de vehículos (`VehiclesSection.tsx`): "Ver
  disponibilidad y precio" es una navegación interna, no un contacto.

No es sólo un número inflado: Meta **optimiza hacia el evento que le declarás
como conversión**. Diciéndole que un click en "Buscar" es un lead, le enseñás a
buscar gente que hace clicks, no gente que alquila. El de la grilla ya está
corregido; el del Hero está en 7.5 porque el archivo lo estaba tocando otro.

## 7.3 Consentimiento — cómo está resuelto

La Ley 25.326 y la política de privacidad publicada en `/privacidad` prometen que
eligiendo "sólo necesarias" Google y Meta **no reciben ningún dato**. Eso hoy es
cierto y está verificado con navegador real:

- **Sin decidir nada no se descarga ni un script de terceros.** No es que se
  carguen y no disparen: `web/components/Analitica.tsx` directamente no los
  monta. Si el script está, ya puso su cookie.
- **Las dos categorías se eligen por separado.** El botón "Elegir" del aviso abre
  las casillas de *Analíticas* y *Publicidad*. Antes el modelo de datos las
  distinguía pero el aviso era todo o nada.
- **Rechazar pesa lo mismo que aceptar**: mismos botones, mismo tamaño. Un
  "Rechazar" en gris chiquito es un patrón oscuro.
- **Revocar borra las cookies ya puestas**, desde `/privacidad`. Antes revocar
  sólo evitaba la carga futura: el `_ga` y el `_fbp` seguían en el navegador dos
  años más.

Detalle que costó encontrar: borrar las cookies no alcanzaba, porque `gtag`
sigue vivo en memoria y **reescribía su `_ga_<ID>` en el instante siguiente**.
Se resolvió avisándole primero con el Consent Mode de Google
(`gtag('consent','update', ... denied)`) y el `fbq('consent','revoke')` de Meta,
y borrando después. El orden importa y está comentado en el código.

## 7.4 Verificación del 11/08 (navegador real, `web/` en :3200)

| Paso | Resultado |
|---|---|
| Visitante nuevo, sin decidir | 0 pedidos a terceros · 0 cookies |
| "Sólo necesarias" | 0 pedidos a terceros · 0 cookies |
| Sólo analíticas (publicidad destildada) | Carga Google · **no** carga Meta |
| "Aceptar todas" | GA4 `page_view` + Meta `PageView`; cookies `_ga`, `_ga_25783YNP7G`, `_fbp` |
| Click en WhatsApp | GA4 `generate_lead` + Meta `Lead` con `eid` de deduplicación |
| Click en la grilla de vehículos | GA4 `select_promotion`, **sin** `Lead` |
| Revocar desde `/privacidad` | **0 cookies** quedan · el aviso vuelve a aparecer |

`npx tsc --noEmit` en `web/` pasa limpio.

## 7.5 Lo que falta — enganchar el embudo

Las funciones están listas en `web/lib/analitica.ts`. Falta agregar la llamada en
`web/components/reservar/FlujoReserva.tsx` y en `Hero.tsx`, que el 11/08 los
estaba editando otra tarea en paralelo. Son estas líneas:

```ts
// FlujoReserva.tsx — arriba, con los demás imports
import * as analitica from "@/lib/analitica";
```

| Dónde | Línea a agregar |
|---|---|
| `Hero.tsx` · `handleBuscar`, **reemplazando** `trackLeadEvent()` (línea ~116) | `analitica.intencionDeReserva("hero:buscador")` |
| `FlujoReserva.tsx` · al resolver la búsqueda de disponibilidad | `analitica.verDisponibilidad({ fechaInicio, fechaFin, lugarRetiro, dias, resultados: categorias.length })` |
| `FlujoReserva.tsx` · `elegirCategoria`, al entrar | `analitica.elegirCategoria({ categoriaId: c.categoria_id, nombre: c.nombre, precio: c.precio?.total })` |
| `FlujoReserva.tsx` · `elegirCategoria`, después de `setHold(...)` | `analitica.iniciarReserva({ categoriaId: c.categoria_id, nombre: c.nombre, precio: c.precio?.total })` |
| `FlujoReserva.tsx` · `siguiente()`, dentro del `if (paso === 3)` ya validado | `analitica.completarDatos(cotizacion?.total)` |
| `Paso4Pago.tsx` · al volver `api.crearReserva(...)` con éxito | `analitica.reservaConfirmada({ reservaId, categoriaId, categoriaNombre, valor: montoAnticipo, total: cotizacion.total, dias })` |
| `DialogoSinCupo.tsx` · al volver `api.crearSolicitud(...)` con éxito | `analitica.solicitudSinCupo({ categoriaId, nombre })` |

**`purchase` es el que más importa.** Sin él no hay tasa de conversión en GA4 ni
optimización por reservas en Meta.

Ojo con dónde se pone: la reserva **se confirma en el webhook de Mercado Pago**,
no al volver del checkout. Disparar `purchase` al iniciar el pago contaría como
vendida gente que abandonó en Mercado Pago. La opción correcta es dispararlo en
`/reservar/listo`, que es donde se vuelve con el pago hecho.

## 7.6 Pendiente de Gael

1. **Rotar el token de la Conversions API.** `META_CONVERSIONS_TOKEN` está vacío,
   así que hoy **la mitad server-side del tracking está apagada**: los eventos
   llegan sólo por el píxel del navegador, y se pierde lo que bloquean los
   bloqueadores de anuncios y Safari. El token viejo viajaba dentro del bundle de
   JavaScript en la versión Vite, o sea que fue público: hay que **generar uno
   nuevo** en Meta Business y cargarlo en Vercel, no reutilizar el anterior.
2. **Marcar las conversiones en los dos tableros.** En GA4, `purchase` y
   `generate_lead` como *eventos clave*. En Meta, `Purchase` como evento de
   optimización de las campañas. Si no se marcan, se registran pero no se
   optimiza nada con ellos.
3. **Decidir quién mira esto y cada cuánto.** Un tablero que nadie abre no sirve;
   GA4 manda un resumen por mail si se lo configura.

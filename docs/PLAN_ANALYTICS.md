# Plan de Analytics y Reportes — Ubicar Rent

**Fecha:** 2026-07-25
**Objetivo:** poder medir todo lo medible del negocio — por mes, semana y año, y por cliente, vehículo, categoría, empresa, sucursal y operador.
**Relacionados:** `docs/DECISIONES.md` · `docs/PLAN_MAESTRO.md` · `docs/PLAN_FRONTEND_UX.md`

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

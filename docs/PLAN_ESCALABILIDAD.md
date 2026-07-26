# Plan de Escalabilidad y Rendimiento — Ubicar Rent

**Fecha:** 2026-07-25
**Objetivo:** que el sistema siga siendo rápido con dos, cinco y diez años de operación encima. No traer todo de golpe.
**Relacionados:** `docs/PLAN_MAESTRO.md` · `docs/PLAN_ANALYTICS.md` · `docs/DECISIONES.md`

---

## 0. Lo que está bien (para no romperlo)

Antes de la lista de problemas, tres cosas que ya están bien resueltas y conviene mantener:

- **Eager loading en los repositorios.** `reserva_repo.py` y `alquiler_repo.py` usan `joinedload` para vehículo, cliente y usuario. Eso evita el N+1 clásico en los listados. Bien.
- **Paginación real** en reservas, vehículos y clientes, con `page` / `page_size` y tope de 100.
- **Caché de TanStack Query** configurada con `staleTime` de 2 minutos por defecto, y 5 minutos en reportes.

El problema no es que no se haya pensado — es que hay puntos concretos donde se salteó.

---

## 1. Problemas confirmados

### 1.1 🔴 El reporte de flota es un N+1 anidado en tres niveles

`routers/reportes.py`, endpoint `/reportes/flota`:

```
for v in vehiculos:                          ← 1 query
    reservas = db.query(Reserva)...          ← 1 query por vehículo
    for r in reservas:
        alquiler = db.query(Alquiler)...     ← 1 query por reserva
        pagos = db.query(Pago)...            ← 1 query por alquiler
    gastos = db.query(Gasto)...              ← 1 query por vehículo
```

Con 20 vehículos y 50 reservas cada uno: **más de 2.000 consultas** para armar una sola pantalla. Hoy con pocos datos no se nota; a los dos años el reporte tarda decenas de segundos o directamente da timeout.

**Arreglo:** una sola consulta con `GROUP BY vehiculo_id` y agregaciones (`SUM`, `COUNT`) en SQL. De 2.000 queries a 3.

### 1.2 🔴 El dashboard se refresca cada 15 segundos contra un endpoint N+1

`hooks/useDashboardStats.ts`: `refetchInterval: 15_000`.

Y el endpoint `/reportes/dashboard` tiene su propio N+1:

```python
for r in entregas_hoy:
    alq = db.query(Alquiler).filter(Alquiler.reserva_id == r.id).first()
for r in devoluciones_hoy:
    alq = db.query(Alquiler).filter(...).first()
```

Como el dashboard es la pantalla de inicio y queda abierta todo el día, esto son **240 ejecuciones por hora, por usuario**, cada una disparando decenas de queries. Con 3 usuarios con la pantalla abierta, la base no para nunca.

**Arreglo:** subir el intervalo a 60-120 segundos (los datos del día no cambian cada 15 segundos), agregar un botón de refresco manual, y eliminar el N+1 con un `join`.

### 1.3 🔴 Los reportes de ingresos escanean todo y no pueden usar índices

`routers/reportes.py`, `/reportes/ingresos`:

```python
for mes in range(1, 13):
    pagos_mes = db.query(Pago).filter(Pago.fecha.like(f"{prefijo}%")).all()
    gastos_mes = db.query(Gasto).filter(Gasto.fecha.like(f"{prefijo}%")).all()
    total = sum(float(p.monto) for p in pagos_mes)
```

Tres problemas juntos:
1. **24 consultas** para un solo reporte anual.
2. `LIKE '2026-07%'` sobre una columna `String` — el índice sirve poco y la comparación es textual.
3. **Trae todas las filas a Python** para sumarlas, cuando Postgres puede hacer `SUM()` sin mover un solo registro.

**Arreglo:** una query con `date_trunc('month', fecha)` + `GROUP BY` + `SUM`. Requiere que `Pago.fecha` sea `Date`, que ya está en la Fase 0.

### 1.4 🟠 `_cargar_ventanas()` trae 9.999 reservas cada vez

`reserva_service.py:464` y `alquiler_service.py:494`:

```python
reservas = self.reserva_repo.list(vehiculo_id=vehiculo_id, page=1, page_size=9999)[0]
```

Trae **toda la historia** del vehículo y filtra por estado y fechas en Python. Se ejecuta en cada crear, editar, confirmar, cancelar, reasignar y extender.

**Arreglo:** filtrar por rango de fechas y estado en SQL. Sólo interesan las reservas que se solapan con la ventana propuesta, que son un puñado.

### 1.5 🟠 El calendario escribe en la base cada vez que se abre

`routers/ocupacion.py` llama a `sincronizar_estados_por_horario()` en cada request. Ese método hace dos `UPDATE` masivos más un `COMMIT`.

**El calendario es la pantalla de inicio** (decisión D-24). Cada vez que alguien entra, navega o cambia de mes, se disparan escrituras. Con varios usuarios, son writes constantes sobre la tabla más consultada del sistema.

**Arreglo:** que la sincronización la haga el **scheduler**, una vez por minuto, no cada request. Los endpoints sólo leen. Es más consistente además: hoy el estado de una reserva depende de quién abrió qué pantalla.

### 1.6 🟠 N+1 escondido en el calendario

`ocupacion.py`: `tiene_alquiler=r.alquiler is not None`.

El `find_para_ocupacion` hace `joinedload` de `vehiculo` y `cliente`, pero **no de `alquiler`**. Entonces cada reserva del calendario dispara una consulta extra. Con 120 días y 20 autos, son cientos de queries en la pantalla de inicio.

**Arreglo:** agregar `joinedload(Reserva.alquiler)` al repositorio.

### 1.7 🟠 `/notificaciones` recorre toda la historia, cada 60 segundos

Ya está documentado en el Plan Maestro: el bloque de pagos pendientes trae **todos los alquileres finalizados desde siempre** y suma sus pagos en Python. Con `refetchInterval: 60_000`.

**Arreglo:** con la tabla `notificaciones` de la Fase 2 esto pasa a ser un `SELECT` sobre índice. El cálculo pesado lo hace el scheduler una vez, no cada cliente cada minuto.

### 1.8 🟡 El calendario carga 120 días completos

`OcupacionPage.tsx` (832 líneas) renderiza un timeline de 120 días × todos los vehículos activos. Hoy con ~10 autos son 1.200 celdas, manejable. Con 40 autos son 4.800 nodos en el DOM.

**Arreglo:** cargar por ventana (el mes visible ± 1) y virtualizar las filas si la flota crece. No es urgente, pero conviene diseñarlo así ahora que se va a tocar.

### 1.9 🟡 Sin índices en las columnas que más se filtran

Faltan índices compuestos para los patrones reales de consulta: `reservas(vehiculo_id, fecha_inicio, fecha_fin)`, `reservas(estado, fecha_fin)`, `pagos(fecha)`, `pagos(alquiler_id)`, `gastos(vehiculo_id, fecha)`, `movimientos_cc(cuenta_corriente_id, fecha)`.

`Reserva` ya tiene `ix_reservas_vehiculo_fecha_inicio`, que es un buen comienzo pero se queda corto para los rangos.

### 1.10 🟡 `float` para plata

Varios services castean `Numeric(12,2)` a `float` (`routers/cuentas_corrientes.py`, reportes). Además del error de precisión acumulado, obliga a traer los registros a Python en vez de sumar en SQL.

**Arreglo:** `Decimal` de punta a punta, y agregaciones con `SUM()` en la base.

---

## 2. Estrategia de datos

### 2.1 Nunca traer todo

Regla general: **ningún endpoint devuelve una colección sin límite.**

| Patrón | Dónde aplica |
|---|---|
| **Paginación por página** | Listados con contador total: reservas, clientes, vehículos, pagos |
| **Paginación por cursor** | Historiales largos y movimientos de cuenta corriente — no necesitan saber el total y son más eficientes |
| **Scroll infinito** | Timelines de actividad y auditoría |
| **Ventana temporal obligatoria** | Calendario, reportes, caja — siempre con `fecha_desde`/`fecha_hasta`, con un default acotado |
| **Top N + "ver todos"** | Rankings de los reportes |

Y un tope duro por defecto: si alguien pide `page_size=9999`, el backend lo recorta a 100.

### 2.2 Agregar en SQL, no en Python

Todo lo que sea `SUM`, `COUNT`, `AVG` o agrupar por período va con `GROUP BY` y `date_trunc`. Python sólo formatea el resultado.

### 2.3 Tabla `resumen_diario`

Para los reportes largos (anuales, comparativas, evolución), una tabla materializada con un registro por día:

| Campo | |
|---|---|
| `fecha` | PK |
| `ingresos`, `egresos`, `margen` | Del día |
| `alquileres_activos`, `checkouts`, `checkins` | Conteos |
| `vehiculos_disponibles`, `alquilados`, `ocupacion_pct` | Estado de la flota |
| `km_recorridos` | |
| `reservas_creadas`, `canceladas` | |

La recalcula el mismo scheduler que las alertas, de madrugada, sólo para los días que cambiaron. Un reporte anual pasa de escanear cientos de miles de pagos a leer 365 filas.

Los reportes del **período en curso** se calculan en vivo (son pocos días); los históricos leen de acá.

### 2.4 Snapshots, no recálculos

Ya está decidido para precios (`tarifa_snapshot`) y saldos (`saldo_posterior` en cada movimiento). El principio se generaliza: **si un dato ya se calculó y no debe cambiar, se guarda**. Recalcular la deuda de un cliente recorriendo toda su historia es caro y frágil.

---

## 3. Estrategia de caché

### 3.1 Frontend — TanStack Query

Los tiempos actuales están mal calibrados: lo que casi no cambia se refresca cada 15 segundos, y lo que cambia seguido tiene 2 minutos.

| Tipo de dato | `staleTime` | `refetchInterval` |
|---|---|---|
| Catálogos (categorías, tarifas, adicionales, sucursales, configuración) | 30 min | — |
| Clientes y vehículos | 5 min | — |
| Calendario de ocupación | 1 min | 5 min |
| Dashboard / flujo del día | 2 min | **2 min** (hoy 15 s) |
| Notificaciones | 1 min | 2 min (hoy 1 min sobre un endpoint pesado) |
| Reportes históricos | 30 min | — |
| Caja del día | 1 min | — |

Más:
- **Invalidación quirúrgica.** Al crear una reserva, invalidar sólo `['reservas']` y `['ocupacion', mes]`, no todo.
- **Actualización optimista** en las acciones frecuentes (cambiar estado, marcar leída una notificación).
- **`keepPreviousData`** al paginar y al cambiar de mes en el calendario, para que no parpadee.
- **Prefetch** del mes siguiente en el calendario, que es la navegación más previsible.

### 3.2 Backend

- **Caché en memoria** (TTL corto) para catálogos que casi no cambian: configuración, categorías, sucursales, tarifas vigentes. Se invalida al editarlos.
- **ETag / `If-None-Match`** en los reportes históricos: si el cliente ya tiene la versión, se devuelve `304` sin recalcular nada.
- **Redis** sólo si hace falta más adelante. Con 3 usuarios, memoria del proceso alcanza y sobra. No sumar infraestructura por adelantado.

---

## 4. Base de datos

**Índices a crear** (los del punto 1.9), más los de las tablas nuevas:
`notificaciones(clave_dedupe)` único, `notificaciones(estado, programada_para)`, `movimientos_cc(cuenta_corriente_id, fecha)`, `echeqs(cliente_id, fecha_pago)`, `recibos(cliente_id, fecha)`, `auditoria(entidad_tipo, entidad_id)`, `auditoria(usuario_id, timestamp)`.

**Auditoría — la tabla que más va a crecer.** Con seguimiento de absolutamente todo (decisión D-13), crece más rápido que ninguna otra. Previsiones: índices bien elegidos, `datos_antes`/`datos_despues` como `JSONB` (comprimible y consultable), particionado por mes si el volumen lo pide, y política de retención — el detalle completo por 2 años, y después sólo el resumen del evento.

**Otros:** `EXPLAIN ANALYZE` sobre las consultas de reportes antes de darlas por buenas, pool de conexiones dimensionado, y `pg_stat_statements` activado en producción para saber qué consulta duele de verdad en vez de adivinar.

---

## 5. Frontend

- **Code splitting por ruta** — hoy todo el bundle se descarga de una. `React.lazy` por página; el cotizador solo (con `jspdf` y `html2canvas`) pesa bastante y casi no se usa.
- **Virtualización** en el timeline del calendario y en los listados largos.
- **Debounce** en los buscadores (300 ms). Hoy el buscador de reservas dispara una consulta por tecla.
- **Memoización** de los cálculos del timeline, que se recalculan en cada render.
- **Imágenes optimizadas** — las fotos de vehículos van a servirse en el catálogo web; conviene generar miniaturas al subirlas.

---

## 6. Cuándo hacer cada cosa

| Prioridad | Qué | Fase |
|---|---|---|
| 🔴 | Subir el `refetchInterval` del dashboard de 15 s a 2 min | Fase 0 — una línea |
| 🔴 | `joinedload(Reserva.alquiler)` en el calendario | Fase 0 — una línea |
| 🔴 | `_cargar_ventanas()` con filtro de fechas en SQL | Fase 0 |
| 🔴 | Sacar `sincronizar_estados_por_horario()` de los endpoints y pasarlo al scheduler | Fase 0-2 |
| 🟠 | Fechas `String` → `Date` + índices | Fase 0 |
| 🟠 | Reescribir los reportes con `GROUP BY` | Fase 3 |
| 🟠 | Recalibrar los tiempos de caché | Fase 3 |
| 🟠 | Tope duro de `page_size` en el backend | Fase 0 |
| 🟡 | Tabla `resumen_diario` | Fase 4 |
| 🟡 | Paginación por cursor en historiales | Fase 3 |
| 🟡 | Code splitting y virtualización | Fase 3 |
| 🟡 | Caché backend de catálogos + ETag | Fase 4 |
| 🔵 | Redis, particionado, réplica de lectura | Sólo si los números lo piden |

Las cuatro primeras son cambios de pocas líneas con el mayor impacto: sacan de encima la mayor parte de la carga inútil que el sistema se genera a sí mismo.

---

## 7. Cómo saber si va bien

Sin medición, esto es adivinar. Mínimo indispensable:

- **Log de consultas lentas** en Postgres (> 500 ms) desde el día uno en producción.
- **Tiempo de respuesta por endpoint** en los logs de FastAPI.
- **Contador de queries por request** en desarrollo — es lo que detecta un N+1 apenas se introduce, en vez de descubrirlo dos años después.
- **Presupuesto de rendimiento:** ningún endpoint por encima de 500 ms con datos reales; el calendario por debajo de 300 ms; ningún request con más de 20 consultas.

Con el volumen de este negocio (una flota chica, 3 usuarios, decenas de reservas por mes) **nada de esto debería requerir infraestructura extra durante años** — alcanza con no hacer trabajo al pedo. Los problemas de arriba no son de escala, son de consultas evitables.

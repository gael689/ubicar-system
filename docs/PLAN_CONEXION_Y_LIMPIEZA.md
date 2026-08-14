# Plan de conexión y limpieza — 13/08/2026

Sale de dos pedidos que son el mismo: **que nada de lo que pasa afuera se
entere el sistema por casualidad.** El de Gael (reserva web, firma de contrato,
todo al calendario de ocupación, asignación de vehículo) y los ocho puntos que
mandó Franco el 11/08.

**Actualizado el 13/08** con seis definiciones nuevas. Con esto **ya no queda
nada que bloquee empezar**:

- La ventana de la web son **10 días de anticipación** y 4 meses de horizonte
  → §3.1, D-52.
- Todo lo que la web no puede vender sale por **una sola puerta**: un cartel que
  avisa qué va a pasar y deriva al **WhatsApp de Ubicar** con el pedido completo
  ya escrito. Detrás quedan dos escapes: seguir en la web con lo que sí hay, o
  dejar la consulta → **§3.9**, D-59.
- La **franquicia es configuración**: cuáles hay y qué impacto tiene cada una
  → §3.8b, D-53.
- El **upgrade es propuesto siempre**, nunca automático → §3.5, D-54.
- Las reservas sin auto asignado se ven en un **panel abajo del calendario**, con
  el pedido y el cliente completos → 2.2.
- El calendario de ocupación suma una **vista anual** —la de Fechas especiales,
  que es la que le gustó al dueño— como **pre-vista** de la vista actual, que se
  mantiene → 2.8.

> **Esto es un plan, no un cambio.** Nada de acá está implementado todavía.
> Cada hallazgo está verificado contra el código, con archivo y línea, para que
> no haya que volver a buscarlo.

**Cómo leerlo:** la sección 1 es el diagnóstico —qué está desconectado y por
qué—, la 2 es el orden en que conviene arreglarlo, la 3 mapea los ocho puntos
de Franco a código concreto, la 4 es la limpieza, y la 5 lo que hay que
preguntarle antes de tocar nada.

---

## 0. Qué se auditó

El ciclo completo de una reserva y de un contrato, en los tres repos:

| | Qué es | Estado |
|---|---|---|
| `backend/` | FastAPI + Postgres. 39 tablas, 60 migraciones, ~185 endpoints | El que manda |
| `frontend/` | El sistema interno (Vite + React + Clerk) | En Railway |
| `web/` | La web pública y el flujo de reserva (Next.js) | En Vercel |
| `../ubicar-rent-pro/` | La landing vieja (Vite). **No habla con el backend** | Muerta — ver §4.4 |

Se recorrieron de punta a punta: `public.py`, `pago_web_service.py`,
`reservas_web.py`, `ocupacion.py`, `reserva_repo.py`, `notificacion_service.py`,
`notificaciones_reglas.py`, `contrato_service.py`, `contrato_pdf.py`,
`email_reservas.py`, `OcupacionPage.tsx`, `ReservasWebPage.tsx`,
`useOcupacion.ts`, `useResolverReserva.ts` y el flujo `web/components/reservar/`.

---

## 1. Diagnóstico: los doce cortes

Están ordenados por lo que cuesta cada uno, no por lo que cuesta arreglarlo.
Los tres primeros explican casi todo lo que Gael describió.

### C-1 · 🔴 Una reserva web pagada y confirmada **no aparece en el calendario**

Es el corte más grave y el más invisible, porque no falla nada: simplemente
no está.

Una reserva web se crea **por categoría**, con `vehiculo_id = None`
(`models/reserva.py:23`, `pago_web_service.py:223`). Es correcto y es
deliberado (D-02). Pero el calendario hace esto:

```python
# repositories/reserva_repo.py:304
if vehiculo_ids:
    q = q.filter(Reserva.vehiculo_id.in_(vehiculo_ids))
```

y `routers/ocupacion.py:40` **siempre** manda la lista de vehículos activos.
Un `IN (...)` nunca matchea `NULL`, así que **toda reserva sin auto asignado
queda afuera del calendario, en cualquier estado.**

Encadenado con esto, dos cosas más:

- Los tres estados web quedan explícitamente afuera del query
  (`reserva_repo.py:295-301`) y el enum lo documenta como decisión:
  *"Ninguno de los tres ocupa calendario"* (`domain/enums.py:24-28`). Para
  `pendiente_pago` tiene sentido económico (el cupo lo sostiene el hold), **pero
  no visual**: que no descuente cupo no significa que no haya que verlo.
- Una reserva que se paga con cupo disponible pasa a `confirmada` directo desde
  el webhook (`domain/pagos_web.py:148-156`) y **nunca pasa por la bandeja**,
  porque `ESTADOS_BANDEJA` excluye `confirmada` a propósito
  (`reservas_web.py:40-44`).

**El resultado:** el cliente pagó, la reserva está confirmada, no tiene auto, y
en la pantalla que se mira todo el día no existe. La única forma de encontrarla
es acordarse de entrar a Reservas web y bajar hasta la sección "Cobradas, pero
sin terminar" (`ReservasWebPage.tsx:117`) — que existe justamente porque alguien
ya notó el agujero, pero no lo cerró.

### C-2 · 🔴 El aviso de reserva web **se borra solo antes de que alguien lo vea**

`avisar_reserva_web` crea una notificación de tipo `reserva_web_nueva`
(`notificacion_service.py:139`). **Ninguna regla del catálogo emite ese tipo**
(`domain/notificaciones_reglas.py:1200-1237`).

Y el motor hace esto en cada corrida:

```python
# notificacion_service.py:157-176 — _auto_resolver
for n in pendientes:
    key = (n.tipo, n.entidad_tipo, n.entidad_id)
    if key not in activas_por_entidad:
        n.estado = "resuelta"
```

O sea: **cualquier notificación cuyo tipo no esté en el catálogo se marca
"resuelta" en la próxima corrida del motor.** Y el motor corre a las 08:00
(`main.py:112-117`) **y cada vez que alguien aprieta el botón "Actualizar" de la
campana** (`NotificacionesPanel.tsx:47-53`).

Entra una reserva el sábado a la tarde → salta el aviso → alguien abre la
campana el lunes, aprieta actualizar por reflejo, y **el aviso desaparece sin
haberse leído.**

La red de seguridad no lo salva: `reserva_web_sin_atender`
(`notificaciones_reglas.py:826-872`) sólo cubre `sin_disponibilidad` y
`revision_sin_cupo`. **Una reserva confirmada y pagada no vuelve a avisar
nunca.**

### C-3 · 🔴 La firma del contrato tiene el mismo bug, exacto

`public.py:1014` crea la notificación `contrato_firmado` con `generar_una`.
Tampoco hay regla en el catálogo con ese tipo. **Autoresuelta en la próxima
corrida.**

Esto es, literalmente, *"cuando firman con la web no lo veo desde el sistema"*.
El mail sí sale (`contrato_firmado_email.py:110-149`) — pero el mail depende de
que Resend tenga el dominio verificado, que sigue pendiente
(`para-la-reunion/PENDIENTES.md`, ítem 3). Hoy el aviso de una firma real vive
30 minutos en la campana y después no queda en ningún lado excepto el registro
de emails.

### C-4 · 🔴 La reserva web **por transferencia** entra en silencio total

Comparar los dos caminos:

| | Mercado Pago | Transferencia |
|---|---|---|
| Crea la reserva | ✅ | ✅ |
| Notificación en la campana | ✅ `procesar_webhook:364` | ❌ **no llama a nada** |
| Mail al equipo | ✅ `procesar_webhook:367` | ❌ |
| Aparece en el calendario | ❌ (C-1) | ❌ (C-1) |
| La cubre `reserva_web_sin_atender` | — | ❌ `pendiente_pago` está excluido a propósito |

`reservar_para_transferencia` (`pago_web_service.py:522-623`) crea la reserva,
devuelve el CBU y **termina**. Cero campana, cero mail, cero calendario.

Y es el único camino de cobro que funciona hoy, porque las credenciales de
Mercado Pago todavía no están. **O sea: hoy, el 100% de las reservas web que se
pueden cobrar entran sin avisarle a nadie.**

### C-5 · 🔴 El calendario **no se refresca nunca**

Dos cosas, y las dos son de una línea:

1. `hooks/useOcupacion.ts` es `useState` + `useCallback` a mano, **no es
   react-query**. Así que estos `invalidateQueries` no invalidan nada — esa
   clave no existe en el cache:

   ```ts
   // useResolverReserva.ts:116 y useReservasWeb.ts:48
   qc.invalidateQueries({ queryKey: ['ocupacion'] });   // no-op
   ```

2. `OcupacionPage.tsx:163` recarga **sólo cuando cambia el mes**:
   `useEffect(() => { loadData(); }, [currentYear, currentMonth])`. No hay
   `refetchInterval` ni nada parecido.

Asignás el auto desde el panel, el backend lo guarda bien, y el calendario
sigue mostrando lo de antes hasta que alguien aprieta F5. **Esto es la mitad de
"la asignación del vehículo no funciona muy bien": funciona, pero no se ve.**

### C-6 · 🟠 "Pendiente de confirmación" no se distingue en el calendario

`find_para_ocupacion` sí trae las `pendiente`. Pero `ESTADO_COLORS_EVENTO`
(`OcupacionPage.tsx:11-25`) **no tiene entrada para `pendiente`**, así que cae
al fallback:

```ts
// OcupacionPage.tsx:475
const colorClass = ESTADO_COLORS_EVENTO[ev.estado] || 'bg-slate-500 …';
```

El mismo gris que `finalizada`. Y `ESTADOS_RESERVA_LEYENDA`
(`OcupacionPage.tsx:29`) ni la menciona. El pedido *"que ahí mismo salga si hay
pendiente de confirmación"* hoy no se puede cumplir ni mirando fijo.

### C-7 · 🟠 No se puede asignar el auto desde donde se trabaja

`PanelResolverReserva` se abre desde `ReservasList.tsx:558` y desde
`ReservasWebPage.tsx:128`. **Desde el calendario, no.** Y el calendario es la
home (`App.tsx:33` → `Dashboard.tsx:96`).

Peor: la reserva sin auto tampoco está en el calendario (C-1), así que no hay
ni de dónde agarrarla.

### C-8 · 🟠 El contador del menú no cuenta lo que falta terminar

`/reservas-web/resumen` (`reservas_web.py:99-113`) suma sólo
`sin_disponibilidad + revision_sin_cupo`. Las confirmadas sin auto ni contrato
—la sección que la propia pantalla llama "Cobradas, pero sin terminar"— **no
entran en `pendientes`**.

Y el `Sidebar.tsx` no muestra ningún badge de reservas web. El único indicador
numérico del sistema es la campana, que es la que se autoborra (C-2).

### C-9 · 🟠 Las notificaciones son globales, sin acuse y sin escalamiento

- `Notificacion` no tiene `usuario_id`: **"Leída" de uno la esconde para todos**
  (`notificacion_service.py:268-273`).
- Nada distingue una alerta de hace 5 minutos de una de hace 3 días. La
  urgencia se fija al crearla y no sube.
- No hay ningún canal que insista. El pedido *"me tiene que salir un cartel y
  avisos hasta que alguien vea esta reserva"* **no tiene sobre qué apoyarse
  hoy**.

### C-10 · 🟡 Un contrato emitido y sin firmar no reclama nada hasta la entrega

El catálogo tiene las dos puntas y le falta el medio:

- `contrato_no_firmado_entrega_hoy` → mira las entregas **de hoy**.
- `contrato_sin_emitir` → el auto **ya salió** y no hay contrato.
- Falta: *link enviado, sin firmar, y la entrega es en 3 días.* Que es cuando
  todavía se puede hacer algo.

### C-11 · 🟡 Las fechas especiales no se ven en el calendario de ocupación

Es la función **número 1** declarada del modelo:

> *"**Hoy**: que el administrador las VEA en el calendario de ocupación. Saber
> que la semana que viene es Navidad cambia cómo se planifica la flota, y hoy
> esa información no está en ningún lado del sistema."*
> — `models/fecha_especial.py:14-16`

El endpoint `/ocupacion` devuelve `vehiculos` + `eventos` (reservas y bloqueos)
y nada más, y `OcupacionPage` no las pide por otro lado. Hay 22 períodos
cargados que no se ven en ninguna parte. **Esto importa para el punto 7 de
Franco** (temporadas): si se cargan y no se ven, es lo mismo que no cargarlas.

### C-12 · 🟡 Los estados por horario se sincronizan sólo si alguien abre el calendario

`sincronizar_estados_por_horario()` se llama desde `ocupacion.py:44` y desde
`reserva_service.py:79`. **No hay job en el scheduler** — el único que hay es el
motor de notificaciones de las 08:00 (`main.py:112`).

Una reserva pasa a `vencida` recién cuando alguien mira. Y la regla
`checkin_vencido` corre a las 08:00, **antes** de que nadie haya mirado, así
que el aviso de "el auto no volvió" puede llegar un día tarde.

---

## 2. El plan, en orden

El orden no es por importancia: es por dependencia. Arreglar la plomería
primero permite **verificar** con los datos de prueba que hoy existen; limpiar
después deja el sistema arrancando de cero con todo ya conectado.

### Fase 1 — Que nada entre en silencio

Es lo más barato y lo que más duele. Cierra C-2, C-3, C-4, C-9 y C-10.

**1.1 · Arreglar `_auto_resolver` para que no mate lo que no puede evaluar.**
Dos formas, y conviene hacer las dos:

- Que `_auto_resolver` sólo considere los tipos que el catálogo **sabe**
  evaluar. Un tipo que ninguna regla emite no puede ser autoresuelto: nadie
  sabe si sigue aplicando. Se calcula la lista de tipos evaluables de las reglas
  y se filtra por ahí.
- Marcar las notificaciones de evento (`generar_una`) como **no autoresolubles**
  con una columna nueva. Se resuelven cuando alguien las lee, las descarta, o
  cuando la entidad cambia de estado — nunca por barrido.

  > Migración nueva (062): `notificaciones.autoresoluble BOOLEAN DEFAULT true`.

**1.2 · Reglas de catálogo para los tipos que hoy quedan huérfanos.** Aunque se
arregle 1.1, hacen falta como red de seguridad —que es el rol que la propia
docstring de `reserva_web_sin_atender` se asigna—:

| Regla nueva | Condición | Urgencia |
|---|---|---|
| `reserva_web_sin_asignar` | `origen='web'`, `confirmada`, `vehiculo_id IS NULL` | alta, **crítica** si la entrega es en ≤48h |
| `reserva_web_esperando_transferencia` | `origen='web'`, `pendiente_pago`, `forma_pago_prevista='transferencia'`, hace >2h | alta, sube con las horas |
| `contrato_firmado_sin_ver` | contrato firmado por link, sin que nadie lo haya abierto en el sistema | media |
| `contrato_sin_firmar_entrega_proxima` | contrato emitido, `firmado=false`, entrega en ≤3 días | alta (cierra C-10) |

**1.3 · Avisar en el camino de la transferencia.** `reservar_para_transferencia`
tiene que llamar a `avisar_reserva_web` y a un `notificar_reserva_reservada`
equivalente al de Mercado Pago. Es literalmente el mismo par de líneas que
`procesar_webhook:363-367`. **Es el arreglo con mejor relación
esfuerzo/impacto de todo el documento.**

**1.4 · Aviso también en la solicitud sin cupo.** `crear_solicitud_sin_cupo`
(`public.py:593`) avisa por campana pero **no por mail**. Un contacto sin cupo es
una venta a recuperar: tiene que salir el mail igual que las otras.

> Este punto estuvo a punto de caerse con la decisión del 13/08 y **vuelve a
> estar en pie**: el formulario no se retira, se degrada a tercera opción
> (§3.9). Va a entrar menos gente por ahí, pero la que entre no puede seguir
> sin generar mail.

**1.5 · Escalamiento y acuse (C-9).** Lo que el pedido *"avisos hasta que
alguien vea esta reserva"* necesita, en tres piezas:

- **Acuse por usuario**: tabla `notificaciones_vistas (notificacion_id,
  usuario_id, visto_at)`. Que uno la lea no la esconde para los demás. La
  notificación se considera atendida cuando **la entidad cambia de estado**, no
  cuando alguien la lee.
- **Escalamiento por tiempo sin atender**: la urgencia sube sola. Una reserva
  web sin asignar pasa de `alta` a `crítica` a las 4 horas hábiles. Es una
  columna `escalada_en` y una pasada del motor.
- **Cartel que no se puede ignorar**: una franja fija arriba del calendario
  —no un toast, no la campana— mientras haya reservas web sin resolver.
  El calendario es la home; es el único lugar donde un cartel se ve seguro.
  Se alimenta del `/reservas-web/resumen` corregido (2.5).

**1.6 · Correr el motor más seguido.** Una sola corrida a las 08:00 no alcanza
para nada que escale. Pasar a cada 30 minutos con el digest sólo a las 08:00, o
agregar una corrida "liviana" que evalúe únicamente las reglas de operación
diaria. Y agregar el job de `sincronizar_estados_por_horario` (C-12).

### Fase 2 — Que todo caiga en el calendario de ocupación

Cierra C-1, C-5, C-6, C-7, C-8 y C-11 — el pedido central — y suma las dos cosas
que se pidieron para esa pantalla: el **panel de pendientes de asignación**
(2.2) y la **vista anual** (2.8). Esas dos no arreglan un corte: son pantalla
nueva, y conviene hacerlas **después** de 2.1 y 2.4, porque las dos se apoyan en
que el dato llegue y se refresque.

**2.1 · Que el calendario muestre las reservas sin auto asignado.** El cambio
de fondo es en `find_para_ocupacion`: el filtro por vehículo tiene que dejar
pasar los `NULL`.

```python
# en vez de:  q.filter(Reserva.vehiculo_id.in_(vehiculo_ids))
# va:         q.filter(or_(Reserva.vehiculo_id.in_(vehiculo_ids),
#                          Reserva.vehiculo_id.is_(None)))
```

Y los tres estados web entran al query, **con un campo que diga si ocupan cupo
o no**. Esa distinción hay que conservarla: `pendiente_pago` se ve pero no
bloquea, y el evento tiene que decirlo.

**2.2 · Panel "Pendiente de asignación" abajo del calendario.** El calendario
tiene una fila por vehículo, y una reserva sin auto no tiene fila: no hay dónde
dibujarla. Entonces no va *en* la grilla, va en un panel propio **abajo**, con
la información completa del pedido.

Qué muestra cada fila —todo, porque el panel existe para no tener que abrir otra
pantalla—:

| | Qué |
|---|---|
| **El pedido** | Categoría pedida · fechas y horas · lugar de retiro y de devolución (marcado si difieren) · adicionales contratados · notas |
| **El cliente** | Nombre · teléfono y mail **clickeables** · DNI/CUIT · si es cliente nuevo o ya existía |
| **La plata** | Total · cuánto se cobró · cuánto falta · medio de pago |
| **El estado** | Origen (web / mostrador) · hace cuánto que espera · **qué le falta**: confirmar el pago, asignar el auto, emitir el contrato |
| **La acción** | Botón que abre `PanelResolverReserva` ahí mismo (2.5) |

Tres decisiones de diseño que no son cosméticas:

- **Sólo ocupa lugar cuando hay algo.** Con cero pendientes el panel no se
  renderiza. Hay precedente y está documentado en el código: el flujo del día
  era una franja fija de 220px abajo del calendario y se sacó justamente por
  esto — *"le comía un cuarto de pantalla al calendario, que es lo que de verdad
  se mira todo el día, para no decir nada"* (`Dashboard.tsx:99-104`). El
  calendario es `flex-1 min-h-0`: lo que le saque el panel se lo saca a la
  grilla.
- **Colapsable, con el contador siempre visible.** Plegado se ve
  `▸ Pendiente de asignación (3)`; desplegado, las fichas completas. Así el dato
  de que *hay* algo nunca desaparece, y el detalle se pide cuando se lo va a
  usar.
- **Ojo con el botón flotante.** "Ver flujo del día" está fijo abajo al centro
  (`Dashboard.tsx:105-110`). El panel tiene que dejarle lugar o se pisan.

**De dónde salen los datos: del mismo `/ocupacion`, no de otra llamada.** El
endpoint devuelve un array `sin_asignar` junto a `vehiculos` y `eventos`. Razón:
si el panel consultara `/reservas?origen=web&estado=confirmada` por su cuenta
—que es lo que hace hoy `ReservasWebPage`—, el panel y la grilla podrían
mostrar cosas distintas y refrescarse en momentos distintos. Una llamada, un
refresco (2.4), una sola verdad en pantalla.

**Y la ficha no se escribe de nuevo.** `FilaReservaWeb`
(`ReservasWebPage.tsx:192-291`) ya renderiza casi exactamente esto: contacto
clickeable, total/cobrado/falta, hace cuánto espera y la lista de qué le falta.
Se extrae a `components/reservas/` y se usa en los dos lugares. Escribir una
tercera versión de la misma ficha es cómo se llega a que dos pantallas informen
distinto sobre la misma reserva.

> **Recomendación (chica, y conviene):** que el panel se llame **"Pendiente de
> asignación"** y no "de la web", y que muestre **cualquier** reserva sin
> vehículo marcando el origen. Una reserva de mostrador cargada por categoría
> tiene el mismo problema y hoy también es invisible (C-1 no distingue origen).
> Filtrar por web dejaría un segundo agujero, más chico y del mismo tipo.

> **Sobre D-24.** `DECISIONES.md:263` pedía la home sin paneles auxiliares. **Se
> enmienda a propósito** (D-58): el panel es trabajo trabado, no una métrica, y
> con cero pendientes la home vuelve a ser el calendario y nada más. Queda
> anotado nada más que para que nadie lo saque en tres meses "porque D-24 dice
> otra cosa".

**2.3 · Distinguir visualmente lo que espera algo** (C-6). Entradas nuevas en
`ESTADO_COLORS_EVENTO` / `ESTADO_ICONS` / la leyenda:

| Estado | Cómo se ve | Por qué |
|---|---|---|
| `pendiente` | ámbar con borde punteado | Pendiente de confirmación, tomado pero no firme |
| `pendiente_pago` | gris con borde punteado y opacidad | Se ve, **no ocupa**: espera al cliente |
| `revision_sin_cupo` | rojo pulsante | Hay plata del cliente en juego |
| `sin_disponibilidad` | ámbar rayado, en la banda de categoría | Es un contacto, no una reserva |
| `confirmada` sin auto | azul con `⚠` y "sin asignar" | Vendida y sin auto: es lo que hay que resolver hoy |

**2.4 · Que el calendario se refresque de verdad** (C-5). Migrar
`useOcupacion` a `useQuery` con `queryKey: ['ocupacion', desde, hasta]`. Con
eso los `invalidateQueries` que ya están escritos empiezan a funcionar, sin
tocar los mutation hooks. Sumar `refetchInterval` de 60s, igual que la campana
y el resumen de la bandeja.

**2.5 · Asignar el auto desde el calendario** (C-7). Click en una reserva de la
banda "Sin asignar" → abre `PanelResolverReserva`, que ya hace todo lo que hace
falta (cobrar, asignar con revalidación, ofrecer emitir el contrato). No hay
lógica nueva: es conectar lo que existe donde se trabaja.

**2.6 · Arreglar el contador** (C-8). `/reservas-web/resumen` suma también las
`confirmada` de origen web sin `vehiculo_id` o con `contrato_estado =
'sin_emitir'`. Y badge en el Sidebar, en el ítem de Reservas web.

**2.7 · Fechas especiales en el calendario** (C-11). El endpoint devuelve
también los períodos que solapan el rango, y la página los pinta como una
banda de fondo en el encabezado de días. **Importa para las temporadas de
Franco** — ver §3.7 y la trampa que ahí se explica.

**2.8 · Vista anual del calendario de ocupación** — la pre-vista del año

Pedido nuevo, y con una referencia concreta: **la vista de Fechas especiales le
gustó al dueño** y quiere la misma para la ocupación. Los doce meses del año en
un cuadro, con todos los días, como pre-vista; y desde ahí saltar al mes o al
día que quiera, cayendo en la vista que ya existe.

**Lo que hay que replicar ya está escrito.** Es `MesMini`, en
`pages/fechas-especiales/FechasEspecialesPage.tsx:88-154`: una grilla de 12
meses (`grid-cols-1 sm:2 lg:3 xl:4`), cada mes un mini calendario de 7 columnas
arrancando en lunes, cada día una celda `aspect-square` pintada, contador de
días marcados por mes, navegación por año (`‹ Hoy ›`) y leyenda abajo.

**Cómo se hace sin duplicarlo:** se extrae `MesMini` a un componente compartido
—`components/shared/CalendarioAnual.tsx`— **generalizando qué pinta cada día**.
Hoy está atado a `FechaEspecial`: recibe `porDia: Map<string, FechaEspecial[]>`
y saca el color de `COLOR_FECHA_ESPECIAL`. Pasa a recibir una marca genérica
(color, etiqueta, contadores) y la página de Fechas especiales lo usa igual que
ahora. **Dos copias de un calendario anual derivan igual que dos copias de
cualquier regla** (§7, punto 5).

> Detalle lindo: `MesMini` ya resuelve el solapamiento con el mismo criterio que
> el motor de precios — *"si un día cae en varias, gana la de rango más corto:
> es la más específica"* (línea 126-132), idéntico a `resolver_regla_dia`. Al
> generalizarlo hay que conservar eso, porque es lo que hace que Navidad se vea
> arriba de temporada alta (§3.7, trampa 2).

**Qué muestra cada día.** En una celda de ~20px no entra texto, así que la
información va por color y por marcas:

| Señal | Cómo se ve | De dónde sale |
|---|---|---|
| **Ocupación** | Intensidad del fondo: cuántos autos de la flota están ocupados ese día | reservas + bloqueos |
| **Entregas** (check-out) | Punto o triángulo al pie de la celda | reservas que empiezan ese día |
| **Devoluciones** (check-in) | Punto del otro lado | reservas que terminan ese día |
| **Alertas** | Borde o punto rojo | notificaciones activas con `fecha_objetivo` ese día |
| **Sin asignar** | Marca ámbar | reservas sin vehículo que cubren ese día |
| **Temporada / feriado** | Tinte de fondo o anillo | `fechas_especiales` (2.7) |
| **Todo junto** | Tooltip con los números: *"12/15 ocupados · 3 entregas · 2 devoluciones · 1 alerta"* | — |

**Navegación: ya está construida, sólo hay que cablearla.**
`ViewMode = 'timeline' \| 'agenda'` (`OcupacionPage.tsx:106`) suma `'anual'`. Y
para los saltos:

- **Click en el nombre del mes** → `setCurrentYear` + `setCurrentMonth` +
  `setViewMode('timeline')`.
- **Click en un día** → lo mismo, más `setScrollToDate(clave)`. Ese estado y el
  `useEffect` que scrollea hasta la columna del día **ya existen**
  (`OcupacionPage.tsx:166-174`): se usan para el botón "Hoy". No hay que
  escribir nada nuevo, hay que llamarlo.

**Un endpoint propio, y no un año de `/ocupacion`.** Pedirle al endpoint actual
un rango de 365 días traería 15 vehículos × todos los eventos del año para
después reducirlo a un número por día en el navegador. La vista anual **no
necesita cada evento: necesita la densidad y los contadores.** Va
`GET /ocupacion/resumen-anual?anio=2027`, agregado en SQL, una fila por día:

```json
{ "fecha": "2027-01-14", "ocupados": 12, "total": 15,
  "entregas": 3, "devoluciones": 2, "alertas": 1, "sin_asignar": 0 }
```

365 filas chicas, cacheables, y la vista mensual queda intacta. Los `alertas`
salen de contar `notificaciones` activas por `fecha_objetivo` — columna que ya
existe y que hoy sólo se usa para deduplicar.

**Qué vista queda por defecto:** la de hoy, sin cambios. **La anual es una
pre-vista de esa misma vista, no un reemplazo** — se entra por una tercera
pestaña, al lado de Timeline y Agenda, y desde ahí se cae en la vista actual con
el mes o el día ya puestos. El `viewMode` ya se inicializa según el ancho de
pantalla (`OcupacionPage.tsx:107-110`); vale recordar la última elegida.

> **Por qué esto vale más de lo que parece:** el timeline muestra 120 días
> (`DAYS_TO_SHOW = 120`) y hay que scrollear horizontalmente para recorrerlos.
> Con la ventana web de 4 meses (§3.1) y las temporadas del año (§3.7), la
> pregunta "cómo viene el año" no se puede contestar hoy en ninguna pantalla.

### Fase 3 — Las reglas de negocio de Franco

Todo el detalle en §3. No dependen de la limpieza y conviene hacerlas antes,
para que la carga de datos posterior ya salga con las reglas nuevas.

### Fase 4 — Limpieza y carga real

Todo el detalle en §4. Va **después** de las fases 1 a 3 por una razón
concreta: hoy hay datos de prueba con los que se pueden verificar los arreglos.
Si se limpia primero, no hay nada contra qué probar.

### Fase 5 — Prueba de punta a punta

Con la base limpia y las reglas nuevas, correr el ciclo completo y verificar
cada eslabón. Checklist en §6.

---

## 3. Los ocho puntos de Franco, mapeados a código

### 3.1 y 3.8 · La ventana de la web (10 días de anticipación · 4 meses de horizonte)

**Estado hoy** — dos constantes en el router y ningún tope de horizonte:

```python
# routers/public.py:48-49
ANTICIPACION_MINIMA_HORAS = 72     # D-50, decidido el 11/08
DURACION_MAXIMA_DIAS = 90
```

`validar_rango_web` (`domain/disponibilidad.py:313`) valida anticipación y
duración. **No valida cuán adelante se puede reservar**: hoy se puede pedir un
auto para agosto de 2028.

**✅ Resuelto (13/08): son 10 días de *anticipación*.** La web vende sólo lo que
empieza **de acá a 10 días o más**, y **hasta 4 meses adelante**. Los "10 días"
no son duración: **la duración máxima queda en 90 días, sin cambio.**

La ventana de venta online, entonces:

```
hoy ──── 10 días ──────────────────────────── 4 meses ────►
     ✗ WhatsApp   │      ✓ la web vende      │  ✗ WhatsApp
                  └─ duración: hasta 90 días ─┘
```

Es coherente con el razonamiento de **D-50** (que fijó las 72hs el 11/08) y lo
extiende: una reserva web dispara trabajo de mostrador **antes** de que el
cliente aparezca —asignar el vehículo, emitir el contrato, esperar la firma
(D-47)—, y Franco decide que eso necesita diez días, no tres.

**La consecuencia hay que asumirla de frente: la web deja de vender esta semana
y la que viene.** Toda esa demanda —que es la más caliente— pasa a WhatsApp. Eso
convierte el desvío en la pieza crítica del punto, no en un caso de borde:

- **El Hero lo dice de entrada**, no al validar. Ya hay precedente: D-50 fijó que
  la anticipación se avisa en el Hero, *"no sólo al validar"*. Con diez días eso
  pasa de recomendable a obligatorio.
- **El calendario del navegador deshabilita los diez primeros días**, con el
  motivo escrito y el botón de WhatsApp al lado — no un `422` después de tres
  pasos (ver el punto sobre el front, abajo).
- **El mensaje de WhatsApp va precargado** con fechas, categoría y lugar, igual
  que el desvío que ya existe cuando falta Mercado Pago (`public.py:716-723`).
  Si el cliente tiene que volver a escribir todo, la venta se cae en el traspaso.

**Cómo se implementa:** los tres números salen de `configuracion` en vez de ser
constantes, aunque ya estén decididos. Razón: son palancas comerciales y Franco
las va a querer mover por temporada —sobre todo ésta— y eso no puede requerir un
deploy. Es el criterio que el sistema ya usa para `web.hold_minutos`
(migración 048) y para el descuento por pago total.

| Clave nueva | Valor | Reemplaza |
|---|---|---|
| `web.anticipacion_minima_horas` | **240** (10 días) | `ANTICIPACION_MINIMA_HORAS` (72) |
| `web.horizonte_maximo_dias` | **120** (4 meses) | — (no existe hoy) |
| `web.duracion_maxima_dias` | **90** (sin cambio) | `DURACION_MAXIMA_DIAS` (90) |

**Detalle chico que se nota mucho:** el mensaje de error de `validar_rango_web`
está escrito en horas:

```python
# domain/disponibilidad.py:337-340
f"Las reservas online necesitan al menos {anticipacion_minima_horas} horas de anticipación."
```

Con 72 se leía bien; con 240 dice **"al menos 240 horas de anticipación"**, que
nadie procesa. El texto tiene que expresarse en días cuando el valor pasa de 48
horas. Y el tope de horizonte necesita su propio mensaje, que hoy no existe
porque la validación tampoco.

> Las claves nuevas necesitan una fila insertada por migración:
> `ConfiguracionService.set_valor` usa `get()`, que levanta `NotFoundError` si
> la clave no existe (`configuracion_service.py:26-33`). Una clave que no está
> en la tabla no se puede cargar desde la pantalla.

**Y falta el otro lado: el front sólo respeta uno de los tres topes.**
`FlujoReserva.tsx:292` le pasa al buscador **únicamente** `anticipacionHoras`.
`duracion_maxima_dias` ya viaja en `/public/config` y está tipado en
`web/lib/types.ts:12`, pero **la web no lo usa**, y el horizonte todavía no
existe ni en el backend. Hoy el cliente elige 100 días, avanza, y recién ahí le
llega un `422`.

Con la ventana nueva eso deja de ser un caso raro: **los diez primeros días del
calendario son los que la gente toca primero.** Los tres topes tienen que estar
en el calendario del navegador —días deshabilitados y el cartel de §3.9— y no
sólo en la validación del servidor. La regla se sigue decidiendo en el backend
(§7, punto 5); lo que se agrega es que el front la **muestre** en vez de
descubrirla al fallar.

**Los tres topes salen por la misma puerta:** el cartel de derivación comercial
de **§3.9**, con el copy y el botón de WhatsApp ya redactados ahí.

### 3.2 · El texto de la franquicia

Cuatro lugares dicen "franquicia a cargo" y tienen que decir **"seguro con
franquicia de $X"**:

| Archivo | Línea | Texto hoy |
|---|---|---|
| `web/components/contrato/FirmaContrato.tsx` | 195 | `Franquicia a tu cargo: {pesos(...)}` |
| `backend/app/services/contrato_pdf.py` | 284 | `FRANQUICIA: $ X (responsabilidad del cliente)` |
| `web/components/reservar/Paso2Adicionales.tsx` | 115-118 | franquicia sola, sin encuadre |
| `frontend/src/components/cotizador/CotizacionPreview3.tsx` | 17 | `'Seguro con franquicia'` ← ya está bien |

Cambio de texto, no de lógica. Pero **no se toca solo**: si se corrige el
rótulo sin corregir §3.8b, queda un cartel que dice "seguro con franquicia de
$0" en el peor de los casos, que es todavía peor que el rótulo viejo.

### 3.8b · La franquicia está al revés — y es un bug, no una interpretación

Franco lo describió bien: *"0 de franquicia sería el alquiler MÁS CARO, porque
no pagan franquicia."* En el código pasa exactamente lo contrario:

```python
# services/contrato_service.py:331-336
if contratadas and contratadas[0]["franquicia"] is not None:
    franquicia = contratadas[0]["franquicia"]
else:
    franquicia = float(self.config.get_decimal("contrato.franquicia_default", Decimal("0")))
```

**Sin cobertura contratada, la franquicia default es 0.** Y el PDF imprime
"FRANQUICIA: $ 0". O sea: el alquiler **más barato**, el que no contrató nada,
sale con el cartel que se lee como *"no pagás nada ante un siniestro"* — cuando
es justamente el caso en que el cliente responde por todo.

Es la inversión completa del modelo. Y es plata: es el número que un cliente
puede oponer si hay un daño.

**El modelo correcto**, que es el que Franco describe:

```
seguro obligatorio, sin cobertura extra  →  franquicia BASE (la más alta)   $0 extra
cobertura intermedia                     →  franquicia bajada un escalón    $ más
cobertura total                          →  franquicia 0                    $ mucho más
```

#### ✅ Resuelto (13/08): la franquicia es **configuración**, no código

La definición es: **cuáles franquicias hay, y qué impacto tiene cada una en el
alquiler, se cargan desde el sistema.** No se decide un número ahora ni se
hardcodea ninguno.

Eso **desbloquea el trabajo**: hasta ahora esto esperaba a que Franco dijera un
monto (D-C3, abierto desde julio). Ya no — se construye la pantalla y los montos
se cargan cuando estén.

**Y casi todo el modelo ya existe.** Una cobertura en `adicionales` es
exactamente *"una franquicia y qué impacto tiene en el alquiler"*: tiene
`nombre`, `precio`, `unidad_cobro` y `franquicia` (`models/adicional.py:61`). Lo
que falta son cuatro cosas:

1. **La franquicia base, que hoy no existe como concepto.** Es la del seguro
   obligatorio solo, sin cobertura extra: **la más alta**, y el punto de partida
   de la escalera. Va como `contrato.franquicia_base` en `configuracion`,
   reemplazando a `contrato.franquicia_default`.

   > **Y mientras no esté cargada, el contrato no imprime una franquicia.** Hoy
   > imprime `$ 0`, que es el peor valor posible: se lee como "no pagás nada".
   > Con la clave vacía tiene que salir sin el bloque, o con "a definir" — nunca
   > un número que miente. El aviso de la campana lo reclama solo, como ya hace
   > `datos_empresa_sin_cargar` con los datos fiscales.

2. **Que la pantalla de Adicionales muestre la escalera y no una lista.** Hoy
   `AdicionalesPage` pide franquicia y precio en campos sueltos, sin decir cómo
   se relacionan. Tiene que verse:

   ```
   Base (sólo seguro obligatorio) ····  franquicia $ 800.000   sin costo
   ├ Cobertura parcial ··············  franquicia $ 300.000   + $ 8.000/día
   └ Cobertura total ················  franquicia $       0   + $ 15.000/día
   ```

   Es la misma información que ya se carga, ordenada de forma que el error salte
   a la vista.

3. **Validar la relación inversa al guardar.** Es lo único que impide volver a
   cargar la tabla al revés. Hoy lo único que se valida es que un extra no lleve
   franquicia (`routers/adicionales.py:81-84`, `schemas/adicional.py:17-21`).
   Falta: ninguna cobertura puede tener franquicia **≥ la base**, y **a menor
   franquicia, mayor precio**. Sin esto, la configuración permite cargar la
   inversión que este mismo punto viene a arreglar.

4. **Que la web comunique la escalera.** Las coberturas ordenadas por franquicia
   **descendente**, con la base arriba como punto de partida — para que se lea
   "pagando más, te llevás menos riesgo". Hoy `Paso2Adicionales` las ordena por
   `grupo, orden, nombre` (`public.py:112`), que no comunica nada.

### 3.3 · Los lugares de retiro y devolución

**Estado hoy** — hardcodeados en el backend y **duplicados** en el front:

```python
# routers/public.py:359-367
"lugares_retiro": ["Paraguay 241", "Alsina 350", "Aeropuerto Comandante Espora"]
```
```ts
// web/components/reservar/FlujoReserva.tsx:29
const LUGARES_FALLBACK = ["Paraguay 241", "Alsina 350", "Aeropuerto Comandante Espora"];
```

**D-10 ya pedía otra cosa** (`DECISIONES.md:110-127`):

> *"Los predefinidos se pueden editar y agregar desde Configuración — no van
> hardcodeados"* · *"Más una opción **Otro** con texto libre para casos
> puntuales"* · *"Cada punto lleva horario de atención"*

Nada de eso está. Lo que pide Franco es cerrar D-10 y agregarle el desvío:

1. Los lugares salen de `configuracion` (clave `web.lugares_retiro`, o tabla
   propia si se quiere el horario de atención de cada uno).
2. **Opción "Otro lugar"** en el flujo web que **no continúa la reserva
   online**: usa el mismo cartel de derivación comercial que todo lo demás, con
   su copy y su botón — ver **§3.9**. No es un caso especial ni un componente
   propio.
3. Lo mismo si la **devolución** difiere de los tres puntos: retirar en Paraguay
   y devolver en el aeropuerto es un caso normal, pero devolver en un lugar que
   no está en la lista es logística que alguien tiene que aceptar. D-10 ya
   anticipa esto: *"cuando difieren, se marca visualmente… es el caso que
   después habilita el cargo one-way"*.
4. Borrar `LUGARES_FALLBACK`. Un fallback que repite la lista es una segunda
   fuente de verdad que un día va a quedar vieja.

### 3.4 · Edad mínima 21 y sacar "conductor joven" del contrato

**Esto revierte D-38.** La decisión vigente dice, con todas las letras:

> **D-38 · Edad: no hay mínimo, hay recargo por franja etaria** ✅ DECIDIDO
> — `DECISIONES.md:471`

Y está construido así a propósito: *"No hay edad mínima: la edad modifica el
precio, no rechaza al cliente"* (`domain/recargo_edad.py:5`). Franco lo cambia.
**Necesita número nuevo de decisión (D-51) y quedar escrito**, o en tres meses
alguien lee D-38 y "arregla" el mínimo sacándolo.

Puntos a tocar:

| Dónde | Hoy | Va |
|---|---|---|
| `web/components/Hero.tsx:35` | selector desde 17 | desde 21 |
| `routers/public.py:61` | `edad: int = Query(None, ge=16, le=110)` | `ge=21` |
| `routers/public.py:157` | `edad: int = Field(None, ge=16, le=110)` | `ge=21` |
| `domain/recargo_edad.py` | doctrina "no hay mínimo" | piso configurable |
| Validación de `fecha_nacimiento` | ninguna contra la edad | rechazo con mensaje mostrable |

**Y el mostrador es el caso que hay que pensar, no la web.** Un tope duro en el
backend haría que tampoco se pueda cargar una reserva de mostrador para alguien
de 20 — y ahí hay una persona que puede decidir. Propuesta: **el piso rechaza
en la web y advierte en el mostrador**, con motivo obligatorio para saltearlo,
igual que el patrón de descuento autorizado que el sistema ya usa
(`reserva.descuento_motivo` / `descuento_autorizado_por`).

> La edad mínima va a `configuracion` (`alquiler.edad_minima`, default 21), no
> a una constante. Es un número de negocio.

**"Sacar conductor joven del contrato"** es aparte y es concreto: hoy el
recargo por edad se imprime como **línea propia del anverso, con su nombre y la
edad del cliente**:

```python
# services/contrato_service.py:264-270
lineas.append({
    "concepto": f"{r.recargo_edad_nombre} ({r.recargo_edad_edad} años)",
    ...
})
```

Con la franja llamada "Conductor joven" (que es el placeholder que sugiere
`RecargosEdadPage.tsx:221`), el contrato le dice al cliente en la cara que le
cobran más por su edad. **En la web esto ya se resolvió** por D-44: el recargo
va *dentro* de la línea del alquiler, sin rótulo
(`web/components/reservar/ResumenReserva.tsx:62-71`). El contrato quedó
desalineado. Hay que aplicarle el mismo criterio: el importe se suma a la línea
de días de alquiler y **no aparece como concepto separado**. El dato sigue
guardado en la reserva para auditarlo — sólo deja de imprimirse.

### 3.5 · Upgrade cuando no hay la categoría pedida

**Buena noticia: el motor ya está.** `asignar_vehiculo`
(`reserva_service.py:1126-1200`) acepta un auto de **cualquier** categoría, y
**no toca el precio** — que es exactamente *"se entrega eso mejor al mismo
precio"*. El endpoint de sugerencias ya devuelve todas las categorías y marca
la pedida (`routers/reservas.py:388-390`, `useResolverReserva.ts:26`).

#### ✅ Resuelto (13/08): el upgrade es **propuesto, siempre**

**Nunca automático.** La web no confirma sola con una categoría superior: alguien
del equipo mira el caso y lo propone. Es la opción segura y por una razón
concreta — con 15 autos y varias categorías de una sola unidad, regalar la
pick-up puede costar la reserva de pick-up del día siguiente, y eso sólo lo puede
juzgar una persona que ve la semana.

**Y encaja con la ventana de 10 días (§3.1):** cuando el cupo se resuelve con
diez días de plazo, casi siempre hay tiempo de que alguien decida. Automatizarlo
no ahorraría nada.

**Consecuencia importante y simplificadora: en la web no se toca nada.** Sin cupo,
el cliente ve el cartel de §3.9 y se va a WhatsApp. El upgrade **no es una
función del flujo web**, es una herramienta del mostrador. Eso baja el riesgo del
punto entero: no hay que tocar el flujo de reserva, que es lo más frágil que hay.

Lo que falta, entonces:

1. **Definir "mejor".** `Categoria.orden` ya existe (`models/categoria.py:26`) y
   sirve como escalera. Sin un orden explícito, "algo mejor" es una opinión y el
   sistema puede sugerir un downgrade creyendo que sube. Hoy el desplegable de
   autos libres los ordena por *"categoría pedida primero, después por patente"*
   (`routers/reservas.py:437`) — no por qué tan arriba está la categoría.
2. **Que el panel lo diga en voz alta.** Al elegir un auto de otra categoría,
   `PanelResolverReserva` tiene que mostrar `Pick-up · UPGRADE, mismo precio` en
   verde, o **advertir** si el `orden` es menor que el de la pedida. Que hoy se
   pueda hacer sin que nada lo señale es lo que permite un downgrade silencioso.
3. **Registrar que fue un upgrade.** `asignar_vehiculo` no toca `categoria_id`,
   así que la reserva sigue diciendo "Compacto" con una pick-up asignada. Para el
   cupo está bien (con vehículo asignado se cuenta por vehículo), pero **no queda
   registro de la cortesía ni forma de medirla**. Propuesta: `categoria_entregada_id`
   + `upgrade_motivo`. Sin esto no se puede contestar "¿cuántos upgrades
   regalamos este verano?".
4. **Que el cliente se entere de qué le toca.** El contrato ya dice el auto real
   (se emite al asignar, D-47). El mail de confirmación sale **antes** de asignar
   y habla de la categoría pedida: cuando hay upgrade, hay que avisarlo —y ahí
   aparece la duda de por qué canal (ver §5).

> El pendiente **#14 de `para-la-reunion/PENDIENTES.md`** —*"sin cupo, avanzar
> igual con la reserva, sin cobrar"*, decidido y sin implementar— **queda
> reemplazado** por el cartel de §3.9: la salida sin cupo es WhatsApp, no un
> formulario ni una reserva a riesgo. Conviene marcarlo como cerrado ahí, o va a
> quedar figurando como deuda de algo que ya se decidió de otra forma.

### 3.6 · Limpiar el programa

Todo el detalle en **§4**.

### 3.7 · Temporadas (may-ago baja, sep-oct media, nov-feb alta, mar-abr media)

**Encaja sin migración ninguna.** Las dos piezas ya existen:

- `FechaEspecial.tipo` ya tiene el valor `"temporada"`
  (`models/fecha_especial.py:37`) y ya se documenta como "temporada alta/baja".
- `TarifaCalendario` con `prioridad = 10` es la capa "fecha especial /
  temporada" (`models/tarifa_calendario.py:20-24`), y `fecha_especial_id` hace
  que la regla **herede el rango**: la temporada se define una vez y sirve para
  el precio y para el calendario.

**Cómo se carga:** 4 `FechaEspecial` de tipo `temporada` por año (con color
propio para distinguirlas de los feriados) + una `TarifaCalendario` por
temporada **y por categoría**, colgada de la fecha especial, prioridad 10.

**⚠️ Dos trampas que hay que evitar, y las dos son silenciosas:**

1. **Si las temporadas se cargan con rango propio en vez de colgadas de la fecha
   especial, se apaga el aviso de todos los feriados del año.** La regla
   `fecha_especial_sin_precio` considera cubierta una fecha si hay una regla con
   rango propio que la solapa:

   ```python
   # domain/notificaciones_reglas.py:918-925
   por_rango = [r for r in reglas if not r.fecha_especial_id and r.fecha_desde and r.fecha_hasta]
   if any(r.fecha_desde <= fe.fecha_hasta and r.fecha_hasta >= fe.fecha_desde for r in por_rango):
       continue
   ```

   Una temporada de 4 meses con rango propio solapa **todos** los feriados de
   esos 4 meses. La campana dejaría de reclamar el precio de Navidad, y nadie se
   enteraría de que dejó de reclamar. **Colgadas de la fecha especial no pasa.**

2. **El desempate a igual prioridad es "el rango más corto gana"**
   (`domain/precios.py`, `resolver_regla_dia`). Navidad (una semana) le gana a
   temporada alta (cuatro meses). **Eso es lo que se quiere** — pero es una
   propiedad del desempate, no algo declarado. Vale documentarlo al cargar: si
   algún día se cambia el criterio, los precios de los feriados se pierden
   dentro de la temporada sin que nada falle.

Y una consecuencia de C-11: **una temporada que no se ve en el calendario de
ocupación es una temporada que nadie recuerda.** El punto 2.7 pasa de "estaría
bueno" a necesario. Con el detalle de que una banda de 4 meses no se puede
pintar como se pinta un feriado: va como franja de fondo en el encabezado de
días, no como evento.

> **Lo que dijo Franco tiene marzo dos veces**: *"marzo a abril media, baja"*.
> Ver §5, pregunta 3.

### 3.9 · La puerta de salida: WhatsApp primero, y dos escapes

Pedido del 13/08 y refinado dos veces el mismo día. Es la pieza que sostiene a
casi todo el resto: **cada vez que la web no puede vender algo, sale un cartel
estético que deriva al WhatsApp de Ubicar con todo el pedido ya escrito.**

**El principio que ordena todo lo demás:** *lo más rápido y el trato lo más
directo posible.* Cada decisión de acá abajo se toma con esa vara — si algo
agrega un paso, tiene que ganárselo.

Hoy no existe nada de eso. Hay cuatro comportamientos distintos para el mismo
hecho: un `422` con texto crudo, un formulario de 160 líneas
(`DialogoSinCupo.tsx`), un cartel propio cuando falta Mercado Pago
(`public.py:716-723`), y para "otro lugar" no hay nada porque la opción tampoco
existe. **Va todo a un solo componente**, con el motivo como parámetro.

#### La forma: aviso primero, un camino principal y dos escapes

**No se redirige de una.** Primero se le dice qué va a pasar, y se le deja elegir.

```
┌───────────────────────────────────────────────────────┐
│  Esta categoría está completa para esas fechas        │
│                                                       │
│  Podemos seguir por WhatsApp para ver la posibilidad   │
│  de ofrecerte este vehículo o uno similar.             │
│                                                       │
│  ┏━━━━━━━━━━━━━━━━━━━━━━━━━┓                          │
│  ┃ Sí, seguir por WhatsApp ┃   [ Ver los que sí hay ] │
│  ┗━━━━━━━━━━━━━━━━━━━━━━━━━┛                          │
│                                                       │
│  ¿Preferís que te escribamos? Dejanos tus datos       │
└───────────────────────────────────────────────────────┘
```

1. **WhatsApp** — el camino principal, con toda la información del pedido ya
   escrita. Es el trato directo: la conversación arranca ahora.
2. **Seguir en la web** — se queda en el sitio y elige entre lo que sí hay.
3. **Dejar consulta** — el formulario, para quien no quiere escribir ahora.

**Por qué el aviso previo y no el salto directo**, que era la primera versión: un
redirect a WhatsApp sin avisar se lee como que el sitio te echó, y encima el
navegador puede bloquear la apertura si no hubo un gesto del usuario. Con el
aviso, el click en "Sí" **es** ese gesto. Y sobre todo: **quien quería un
Compacto y no le importa tanto la categoría no tiene por qué irse del sitio.**

#### La tercera opción va como link, no como tercer botón

El pedido fue *"en todo caso se puede agregar un tercer botón"*, y la
recomendación es **tenerlo, pero con menos peso**: un link de texto debajo de los
dos botones, no un tercer botón del mismo tamaño.

La razón es exactamente el principio de arriba. **Tres botones iguales no son
tres opciones: son una decisión más que tomar.** El que llega a este cartel ya
recibió un "no" y está a un segundo de cerrar la pestaña; ponerle tres cajas del
mismo peso le agrega justo la fricción que se quiere sacar. Como link, la opción
sigue estando entera para el que la busca —el que no quiere escribir ahora, o
está en la computadora sin WhatsApp Web— y **no le cuesta un segundo al que sí
quiere el trato directo.**

Si en la práctica se ve que mucha gente lo usa, subirlo a botón es cambiar una
clase de CSS. Al revés —arrancar con tres y darse cuenta de que frenaba— no se
mide, porque el que se fue no dejó rastro.

#### Los dos escapes existen siempre, y cambian según el caso

Es la generalización del *"quiero seguir la reserva desde la web"*: en los cinco
casos hay algo que el sitio todavía puede vender, y el botón lleva ahí.

| Caso | WhatsApp (principal) | Seguir en la web | Dejar consulta |
|---|---|---|---|
| **Sin cupo** | Ver este vehículo o similares | **Ver los que sí hay** — la grilla con las disponibles habilitadas | Avisame cuando haya |
| **Menos de 10 días** | Retirar antes | **Elegir otras fechas** — el calendario abierto en el día 10 | Que me contacten |
| **Más de 4 meses** | Reservar más adelante | **Elegir otras fechas** | Que me contacten |
| **Más de 90 días** | Pedir cotización de alquiler largo | **Acortar el alquiler** — el calendario con el tope marcado | Que me pasen precio |
| **Otro lugar** | Coordinar ese punto | **Elegir uno de nuestros puntos** | Que me contacten |

**WhatsApp va primero y con más peso visual**, como se pidió. Pero el segundo
botón no es letra chica: en el caso "sin cupo" es el único de los cinco donde el
sitio puede cerrar la venta **sin ocupar a nadie**, y vale que se vea.

#### Las reglas del copy

Salen de mirar por qué el estado actual no funciona:

1. **Nunca decir "error" ni mostrar un código.** Es una derivación comercial, no
   una falla del sitio. Un `422` con texto de validación hace que la persona crea
   que la web está rota y se vaya.
2. **Siempre decir el motivo.** Un "no" sin razón se lee como que el sitio no
   anda. Con razón, se entiende que hay un camino.
3. **No decir "no podemos": decir quién sí puede.** El sujeto de la frase es el
   agente comercial, no la limitación.
4. **Decir qué va a pasar antes de que pase.** El aviso previo es parte del copy,
   no un paso extra: *"al tocar acá seguimos por WhatsApp"*.
5. **Nunca dejar sin salida.** Un camino principal y dos escapes, siempre. Un
   cartel con una sola puerta que no le sirve es un cliente que cierra la pestaña.
6. **La opción más rápida se lleva el lugar más visible.** El resto existe, pero
   no compite. Es lo que hace que el cartel no sea un menú.
7. **Llegar antes, no después.** El cartel aparece **al elegir la fecha en el
   calendario**, no después de tres pasos. Hoy el tope de duración viaja al
   navegador y no se usa (§3.1).
8. **No prometer lo que no se sabe.** *"Tenemos disponibilidad que no
   publicamos"* es una frase que un agente después tiene que sostener. Por eso el
   copy dice **"para ver la posibilidad de"**, que es exactamente lo que se puede
   prometer sin quedar mal.

#### El copy, caso por caso

**Sin cupo** — el caso que se refinó:

> ### Esta categoría está completa para esas fechas
> Podemos seguir por WhatsApp para ver la posibilidad de ofrecerte **este
> vehículo o uno similar**.
>
> **[ Sí, seguir por WhatsApp ]**  ·  [ Ver los que sí hay ]
>
> <sub>¿Preferís que te escribamos? **Dejanos tus datos**</sub>

**Menos de 10 días** — el que más plata mueve:

> ### Para estas fechas te atiende un agente
> Las reservas online se toman con **10 días de anticipación**. Para retirar
> antes, seguimos por WhatsApp y lo vemos con un agente comercial.
>
> **[ Sí, seguir por WhatsApp ]**  ·  [ Elegir otras fechas ]
>
> <sub>¿Preferís que te escribamos? **Dejanos tus datos**</sub>

**Más de 4 meses:**

> ### Todavía no tomamos esa fecha por la web
> Online reservamos hasta **4 meses** adelante. Más lejos que eso lo reserva un
> agente comercial por WhatsApp.
>
> **[ Sí, seguir por WhatsApp ]**  ·  [ Elegir otras fechas ]
>
> <sub>¿Preferís que te escribamos? **Dejanos tus datos**</sub>

**Más de 90 días de duración** — el único que es una oportunidad y no una
disculpa; el copy lo trata así:

> ### Un alquiler largo se cotiza aparte
> Para más de 90 días tenemos condiciones de alquiler prolongado que no salen en
> el sitio. Te las pasa un agente comercial.
>
> **[ Pedir cotización por WhatsApp ]**  ·  [ Acortar el alquiler ]
>
> <sub>¿Preferís que te pasemos el precio por mail? **Dejanos tus datos**</sub>

**Otro lugar de entrega o devolución:**

> ### Ese punto lo coordinamos con vos
> Entregamos en **Paraguay 241**, **Alsina 350** y el **Aeropuerto**. Para otro
> lugar, seguimos por WhatsApp y un agente lo coordina.
>
> **[ Sí, seguir por WhatsApp ]**  ·  [ Elegir uno de nuestros puntos ]
>
> <sub>¿Preferís que te escribamos? **Dejanos tus datos**</sub>

#### El botón de WhatsApp

**Es el WhatsApp principal de Ubicar**, el que ya usa toda la web:
`WHATSAPP_GENERAL` en `web/lib/constants.ts` (`wa.me/5492914180554`), el mismo
del Hero, el flotante, el CTA final y Contacto — ocho lugares. No se agrega un
número nuevo.

**Y le llega toda la información del pedido**, que es el punto: el agente tiene
que poder contestar sin volver a preguntar nada. `whatsappLink(mensaje)` ya
existe y toma el texto; hay que armarlo con todo lo que la persona ya cargó:

```
Hola! Vengo de la web y quería reservar:

• Categoría: SUV
• Retiro: 20/09 a las 10:00 — Paraguay 241
• Devolución: 27/09 a las 10:00 — Paraguay 241
• 7 días · conductor de 34 años
• Seguro con franquicia reducida

Me apareció que esa categoría está completa para esas fechas.
¿Tienen ese vehículo o alguno similar?
```

Cada campo que falte es una pregunta que el agente va a tener que hacer, y cada
pregunta es tiempo en el que la venta se enfría. Es el mismo criterio del cartel
de transferencia, que ya precarga el comprobante (`Paso4Pago.tsx:526`).

> **Detalle práctico que se nota en el uso real:** en la computadora, `wa.me`
> abre WhatsApp Web y **pide sesión**. Si la persona no la tiene, el botón
> aparenta no hacer nada. Conviene mostrar el número también como texto
> copiable, al menos en escritorio — cuesta una línea y evita el caso en que el
> cliente crea que el sitio se rompió justo en el momento en que lo estamos
> derivando.

#### Medir la pared, que es lo que permite revisar los 10 días

Cada aparición del cartel se registra **con su motivo**, y también **qué botón se
tocó**, con el `trackLeadEvent` que ya existe (`lib/analitica.ts`).

Sin esto, la ventana de 10 días es una decisión que no se puede revisar: dentro
de dos meses nadie va a saber si mandó 5 consultas a WhatsApp o 200. Con esto se
contesta con números — y además aparece el dato que más importa del refinamiento:
**cuántos eligieron quedarse en la web.** Si ese número es alto, el segundo botón
se paga solo; si es cero, el cartel está mal puesto y hay que mirarlo.

#### ✅ D-04 no se toca: el formulario se degrada, no se borra

Buena noticia para el alcance: **no hay nada que retirar.** El formulario de
D-04 (`DialogoSinCupo.tsx`, `POST /public/solicitudes`, el estado
`sin_disponibilidad` y la bandeja) **queda tal cual y sigue funcionando**. Lo
único que cambia es **el lugar que ocupa**: de ser la única salida pasa a ser la
tercera, detrás del link *"Dejanos tus datos"*.

Eso baja bastante el riesgo del punto. Todo lo que se toca es la jerarquía:

| | Antes | Ahora |
|---|---|---|
| Sin cupo | Formulario, y nada más | Cartel → WhatsApp · ver los que hay · **link** al formulario |
| El formulario | La puerta | Una puerta de servicio, para quien la busca |
| Código a borrar | — | **Ninguno** |

Y hay que tener presente **lo que el formulario se lleva puesto cuando alguien
lo usa**, porque sigue vivo:

- Crea una `Reserva` en `sin_disponibilidad`, que **aparece en la bandeja** y
  dispara una notificación de urgencia alta. Eso está bien —alguien la va a
  llamar—, pero significa que la bandeja sigue recibiendo trabajo por este
  camino, aunque sea menos.
- Sigue valiendo el punto **1.4** de la Fase 1 (que hoy avisa por campana pero
  **no por mail**). Ese arreglo vuelve a estar en pie, no se cae.
- Y sigue en pie el gotcha de **§4.3**: sin ningún cliente en la base,
  `/public/solicitudes` devuelve **503**. Con el formulario vivo, eso hay que
  resolverlo sí o sí en el script de limpieza.

**Lo que sí conviene sumar: medir también a los que no dejan datos.** Con el
formulario como tercera opción, la mayoría va a irse por WhatsApp o a seguir
navegando, y de esos no queda nada. La mitad de D-04 que habla de *"medir la
demanda insatisfecha por categoría — el dato que dice qué auto conviene comprar"*
se cumpliría sólo para la minoría que completa el formulario.

Se arregla con una **fila de estadística** al aparecer el cartel
(`fecha, categoria_id, fecha_inicio, fecha_fin, motivo, boton_elegido`) — sin
contacto, sin bandeja, sin que nadie tenga que atender nada. No le suma un paso
al cliente y es lo que después permite decir "en enero perdimos 14 SUV" mirando
**todos** los casos, no sólo los que dejaron el mail. Ver §5, pregunta 1.

---

## 4. La limpieza

> *"la idea ahora es limpiar todo el programa, quedaron cosas viejas,
> únicamente que quede la flota vehicular, y los usuarios creados en CLERK,
> pero toda reserva, gasto, caja, anterior, todo eliminado"*

Se hace con un script versionado en `backend/scripts/`, no a mano en el panel de
Postgres. Razón: **hay que poder repetirlo** —va a haber una segunda ronda de
pruebas antes de publicar— y hay que poder leer qué borró.

### 4.1 · Qué se borra y qué se queda

De las 39 tablas:

**Se vacían** (datos operativos):

```
Ciclo de reserva ─── reservas · reserva_adicionales · alquileres · holds
                     contratos · pagos_web
Plata ───────────── pagos · recibos · comprobantes · movimientos_cuenta_corriente
                     cuentas_corrientes · echeqs · gastos · presupuestos
Operación ───────── danios · fotos_danio · multas · bloqueos_vehiculo · servicios
Clientes ────────── clientes · conductores_adicionales · cliente_contactos
                     tarjetas_cliente · documentos (los de cliente)
Avisos ──────────── notificaciones · emails_enviados
```

**Se conserva** (configuración y flota):

```
vehiculos · categorias · usuarios · configuracion · contrato_plantillas
tarifas · tarifas_calendario · descuentos_duracion · fechas_especiales
adicionales · recargos_edad · documentos (los del vehículo: VTV, póliza)
```

**A decidir** — ver §5, pregunta 4:

- `auditoria` — es un **ledger**: registra quién hizo qué. Borrarlo es borrar
  la prueba de que el sistema audita. **Recomendación: no se borra.** Las
  entradas de las pruebas son ruido inofensivo y quedan fechadas.
- `servicios` y los km de los vehículos — son historial **real** de la flota,
  no de las pruebas. Si el service de la Amarok se cargó de verdad, borrarlo es
  perder un dato que no se recupera. **Recomendación: preguntar antes.**
- `tarifas` y `tarifas_calendario` — hoy tienen la tarifa genérica de demo de
  $85.000 (migración 058). Esas sí se van, pero **el aviso
  `categoria_precio_generico` tiene que quedar sonando** hasta que estén las
  reales.

### 4.2 · El orden importa (claves foráneas)

De hoja a raíz, en una sola transacción:

```
1. fotos_danio → danios
2. reserva_adicionales
3. contratos            (cuelga de reservas — migración 049)
4. pagos_web · holds
5. recibos · comprobantes
6. movimientos_cuenta_corriente → cuentas_corrientes
7. pagos
8. alquileres
9. reservas
10. echeqs · multas · gastos · presupuestos · bloqueos_vehiculo
11. tarjetas_cliente · conductores_adicionales · cliente_contactos
12. documentos WHERE cliente_id IS NOT NULL
13. clientes
14. notificaciones · emails_enviados
```

Un `TRUNCATE ... CASCADE` es más corto y peor: arrastra en silencio tablas que
uno no listó, y justamente lo que se quiere es una lista explícita de lo que se
borró.

### 4.3 · Cuatro cosas que se rompen si sólo se borra

Esto es lo que hace que la limpieza no sea un `DELETE`:

1. **🔴 Sin clientes, la web deja de aceptar consultas sin cupo.**
   `crear_solicitud_sin_cupo` agarra el primer cliente que encuentra como
   genérico:

   ```python
   # routers/public.py:562-568
   cliente_generico = db.query(Cliente).order_by(Cliente.id).first()
   if usuario_sistema is None or cliente_generico is None:
       raise HTTPException(status_code=503, ...)
   ```

   Base limpia → **503 en `/public/solicitudes`**, y el síntoma que ve el cliente
   es que el formulario "no anda", sin más explicación. Hay que crear un cliente
   **"Consultas web"** explícito y marcado, como parte del script.

   > Este gotcha llegó a estar en verde cuando el plan retiraba el formulario. Con
   > la decisión del 13/08 —el formulario **queda** como tercera opción (§3.9)—
   > **vuelve a ser rojo**. Es el tipo de detalle que se pierde cuando una
   > decisión se revierte, y por eso quedó anotado el ida y vuelta.

2. **🟠 El "usuario sistema" es el que tenga el id más bajo.** Dos lugares hacen
   `db.query(Usuario).order_by(Usuario.id).first()`
   (`pago_web_service.py:697`, `public.py:562`). Después de la limpieza eso va a
   ser una persona real, y **la auditoría va a decir que Franco cargó una
   reserva que entró sola por la web a las 3 de la mañana.** El propio código lo
   anota como deuda: *"Con Clerk integrado corresponde crear un usuario
   'Sistema' explícito"*. Es el momento.

3. **🟠 Los vehículos quedan mintiendo.** `Vehiculo.estado` puede estar en
   `alquilado`, `reservado` o `en_transicion` por reservas que ya no existen. El
   script tiene que resetear todos a `disponible` y `estado_desde = now()`. Si
   no, la flota arranca con autos ocupados por nada.

4. **🟡 Los archivos del bucket quedan huérfanos.** Firmas, PDFs de contratos y
   fotos de daños viven en R2 (`contratos/{id}/firma.png`, etc.). Borrar las
   filas no borra los objetos. No es urgente —son unos KB— pero el prefijo
   `contratos/` va a tener claves de contratos que no existen. Limpiarlos en la
   misma corrida, o dejarlo anotado.

### 4.4 · El repo muerto

`../ubicar-rent-pro/` es la landing vieja: Vite + React, un solo commit
(*"rescate de control de versiones"*), sin **ninguna** llamada al backend
(`grep` de `VITE_API`, `localhost:8000` y `api/v1` sobre `src/`: cero
resultados). Fue reemplazada por `ubicar-system/web/`.

**Y todavía es lo que se sirve en `ubicar-rent.com.ar`** — está anotado en
`para-la-reunion/PENDIENTES.md`: *"⚠️ `ubicar-rent.com.ar` hoy sirve el sitio
viejo. No probar ahí"*, y el ítem 10 es sacar el dominio de ese proyecto de
Vercel.

Es el "quedaron cosas viejas" más literal que hay. Va a `Clientes/Archivo/` o se
borra el proyecto de Vercel, **después** de mover el dominio (ítem 10) — no
antes, o el sitio queda caído en el medio.

---

## 5. Lo que queda abierto

### Ya resuelto (13/08) — nada de esto bloquea

| | Definición |
|---|---|
| **Ventana de la web** | 10 días de anticipación · 4 meses de horizonte · duración sin cambio en 90 días → §3.1, D-52 |
| **Franquicia** | Es **configuración**: cuáles hay y qué impacto tiene cada una. No se decide un monto en el código → §3.8b, D-53 |
| **Upgrade** | **Propuesto siempre**, nunca automático. Es herramienta de mostrador, no del flujo web → §3.5, D-54 |
| **Salida sin venta** | Un solo cartel, con aviso previo. **WhatsApp es el camino principal**, con el pedido completo precargado; detrás, seguir en la web o dejar consulta. Lo más rápido y directo posible → §3.9, D-59 |
| **Vista anual** | Pre-vista de la vista actual, que se mantiene. D-24 se enmienda y se anota → 2.8, D-58 |

### Lo que falta decidir

Cuatro cosas. Ninguna frena el arranque de la Fase 1 ni de la Fase 2.

**1 · ¿Se anota también a los que NO dejan datos?** (§3.9) El formulario queda
como tercera opción, así que la demanda insatisfecha se mide **para el que lo
completa**. La pregunta es por los otros: **si el sistema anota, para sí mismo,
que alguien buscó un SUV para el 20/09 y no había, aunque se haya ido por
WhatsApp o haya cambiado de categoría.**

No es una consulta ni aparece en ninguna bandeja: es una fila de estadística que
alimenta un reporte de demanda insatisfecha. **Recomendación: guardarla.** No le
pide nada al cliente ni le suma un paso, y es la diferencia entre medir todos los
casos o sólo los pocos que dejan el mail — que es justamente el sesgo que
arruinaría el dato con el que se decide comprar un auto.

**2 · ¿Por qué canal se propone un upgrade?** (§3.5) Alguien tiene que
proponérselo al cliente. WhatsApp es el canal natural, **pero es asistido a
propósito** —el sistema arma el link, una persona aprieta enviar—, así que no
puede salir solo. Las opciones son: un botón "Proponer upgrade" que arma el
WhatsApp, o un mail automático. Y la segunda mitad: **cuando el cliente acepta
por WhatsApp, ¿quién y dónde lo registra?** Sin eso, la aceptación queda en un
chat y el contrato se emite sin constancia de que se acordó otra categoría.

**3 · Las temporadas: marzo aparece dos veces.** *"marzo a abril media, baja"* —
¿marzo media y abril baja? ¿Las dos media? La partición que se entiende es:
may-ago baja · sep-oct media · nov-feb alta · mar-abr **?**.

**4 · Qué alcanza la limpieza.** Tres cosas que **no** son "reservas, gastos y
caja": (a) el **log de auditoría** —recomendación: no se borra, es la prueba de
que el sistema audita—; (b) el **historial de services y los km** de cada
vehículo, que es historial real de la flota y no de las pruebas; (c) los
**clientes** — se borran todos, ¿confirmado? Si alguno se cargó de verdad, se
pierde.

### Y una que no es pregunta, es un riesgo operativo

**Con diez días de anticipación, todo lo de esta semana y la que viene cae en
WhatsApp** — que es la demanda más caliente que hay. Y el canal es **asistido por
decisión**: el sistema arma el link, una persona aprieta enviar (D-06, y la regla
de que Meta quema números por automatizar).

No hay nada que programar acá, pero sí algo que confirmar con Franco: **quién
mira ese WhatsApp y en qué horario.** El desvío recién funciona si del otro lado
hay alguien; si no, la ventana de 10 días no mueve la venta a otro canal, la
apaga. Y por eso el punto de medición de §3.9 no es opcional: es lo que después
permite decir "los 10 días nos costaron X" con un número en vez de una impresión.

### Decisiones nuevas que hay que escribir en `DECISIONES.md`

Numerando desde D-50, que es la última:

| | Qué | Nota |
|---|---|---|
| **D-51** | Edad mínima 21 para alquilar | **Revierte D-38.** Si no queda escrito, alguien lo "arregla" leyendo D-38 |
| **D-52** ✅ | **La web vende de 10 días a 4 meses.** Anticipación mínima 10 días, horizonte máximo 4 meses, duración máxima sin cambio en 90 días. Menos de 10 días o más de 4 meses → lo atiende un vendedor por WhatsApp, con el pedido precargado | **Reemplaza D-50** (72hs, del 11/08), que a su vez había reemplazado las 24hs originales. **Decidido el 13/08.** El costo asumido es la venta de la misma semana: por eso el desvío a WhatsApp es parte de la decisión, no un caso de borde |
| **D-53** ✅ | **Las franquicias son configuración.** Se carga cuáles hay y qué impacto tiene cada una en el alquiler; la base (sólo seguro obligatorio) es la más alta y cada cobertura la baja a mayor precio | **Cierra D-C3** en cuanto a la estructura: los montos son un dato que cargan los dueños, no una decisión de código. **Decidido el 13/08** |
| **D-54** ✅ | **Upgrade a categoría superior al mismo precio, siempre propuesto.** Nunca automático. Es herramienta del mostrador, no del flujo web | **Decidido el 13/08.** Simplifica: la web no se toca. Queda abierto por qué canal se propone y quién registra la aceptación (§5, pregunta 2) |
| **D-55** | Cuatro temporadas, cargadas como fechas especiales | Encaja en lo que ya existe |
| **D-56** | Los lugares salen de Configuración; "Otro" deriva a un vendedor | **Cierra D-10**, que lo pedía desde el principio |
| **D-57** | Reinicio de datos operativos antes de publicar | Con el alcance que salga de la pregunta 4 |
| **D-58** | **La home muestra lo que está trabado, y suma una vista anual.** Barra al pie sólo cuando hay reservas sin asignar, desplegable en el lugar; y una tercera pestaña con el año completo | **Enmienda D-24** (*"sin paneles auxiliares"*, *"la página no debe tener scroll"*). No la contradice del todo: sin pendientes la home sigue siendo el calendario y nada más, el scroll queda dentro del panel, y el modo por defecto no cambia. Ver 2.2 |
| **D-59** ✅ | **Todo lo que la web no puede vender sale por una sola puerta:** un cartel que avisa qué va a pasar y deriva al WhatsApp principal con el pedido completo. Detrás, dos escapes: seguir en la web con lo disponible, o dejar la consulta. **El criterio es lo más rápido y el trato lo más directo posible** | **Decidido el 13/08.** Unifica cinco casos que hoy se comportan de cuatro formas distintas. **No retira nada**: el formulario de D-04 queda como tercera opción, degradado a link. Copy en §3.9 |

---

## 6. Cómo se verifica que quedó conectado

Cada arreglo tiene que poder comprobarse sin leer código. El ciclo completo,
sobre la base limpia:

**Reserva web con pago (Mercado Pago)**
1. Reservar desde la web y pagar en el sandbox.
2. ☐ Salta la notificación en la campana, **y sigue estando después de apretar
   "Actualizar"** ← esto es C-2.
3. ☐ Llega el mail al equipo.
4. ☐ **Aparece en el panel "Pendiente de asignación"**, abajo del calendario,
   con el pedido y el cliente completos ← C-1 + 2.2.
5. ☐ El badge de Reservas web la cuenta ← C-8.
6. ☐ Asignar el auto **desde ese panel**, sin cambiar de pantalla ← C-7.
7. ☐ El calendario se actualiza **sin recargar la página**, y la reserva salta
   del panel a la fila del auto ← C-5.
8. ☐ Con cero pendientes, **el panel no ocupa un píxel**, la home vuelve a ser
   el calendario y nada más, y **la página no scrollea** ← 2.2 y la enmienda a
   D-24. Con pendientes, el scroll queda **dentro** del panel y no tapa el botón
   de "Ver flujo del día".
9. ☐ Ofrece emitir el contrato en el mismo panel (D-47).

**Reserva web por transferencia**
10. ☐ Salta la notificación **y** sale el mail ← C-4, hoy no pasa ninguna de las dos.
11. ☐ Aparece en el calendario, en gris punteado: se ve y no ocupa ← C-6.
12. ☐ Registrar el cobro la confirma en un solo paso.

**Firma del contrato por link**
13. ☐ Firmar desde el teléfono.
14. ☐ Salta la notificación **y sobrevive a la corrida del motor** ← C-3.
15. ☐ El estado del contrato cambia a "firmado" en el listado y en el calendario.
16. ☐ Un contrato sin firmar con la entrega en 3 días reclama solo ← C-10.

**Reserva de mostrador** (control: esto ya funciona y tiene que seguir igual)
17. ☐ Se ve en el calendario, y una `pendiente` se distingue de una `confirmada`
    y de una `finalizada` ← C-6.
18. ☐ Una de mostrador cargada **por categoría** también cae en el panel de
    pendientes de asignación, marcada como mostrador ← 2.2.

**Vista anual** (2.8)
19. ☐ Los doce meses se ven en un cuadro, con todos los días, igual que en
    Fechas especiales.
20. ☐ Un día con mucha ocupación se distingue de uno vacío **de un vistazo**, sin
    leer números.
21. ☐ Se ven las entregas, las devoluciones y las alertas del día.
22. ☐ **Click en el mes** → salta a la vista timeline de ese mes.
23. ☐ **Click en un día** → salta a la timeline **scrolleada hasta ese día**.
24. ☐ Las temporadas y los feriados se ven pintados en el año ← 2.7 + §3.7.
25. ☐ Cambiar de año no rompe nada y trae los datos del año pedido.
26. ☐ Fechas especiales **sigue funcionando igual** después de generalizar
    `MesMini` — incluido que Navidad se vea arriba de temporada alta.

**Precios y temporadas**
27. ☐ Cotizar un día de cada temporada da cuatro precios distintos.
28. ☐ Cotizar Navidad da el precio de Navidad, **no el de temporada alta**.
29. ☐ La campana sigue reclamando los feriados sin precio ← la trampa de §3.7.

**La ventana de venta** (§3.1 — los cuatro bordes, uno por uno)
30. ☐ **Día 9**: los diez primeros días del calendario están **deshabilitados**,
    con el cartel de §3.9 — no un `422` después de tres pasos.
31. ☐ **Día 10**: se puede reservar normal. Es el primer día hábil de la web y
    el que hay que probar sí o sí, porque es donde se equivoca un `<` por un `<=`.
32. ☐ **Día 121**: rechazado por horizonte (hoy esa validación no existe).
33. ☐ **91 días de duración**: rechazado por duración, que **no cambió**. Que la
    anticipación pase a 10 días no puede haber tocado este tope.
34. ☐ El mensaje de anticipación dice **"10 días"**, no "240 horas".

**El cartel de derivación comercial** (§3.9 — es la puerta de salida de todo)
35. ☐ Los **cinco** casos muestran el mismo componente: menos de 10 días · más de
    4 meses · más de 90 días · sin cupo · otro lugar.
36. ☐ Ninguno dice "error" ni muestra un código de validación.
37. ☐ Todos dicen **el motivo** y **avisan qué va a pasar** antes de redirigir.
38. ☐ **Nunca redirige solo:** hace falta tocar el botón. Nada de un `location =`
    automático que el navegador pueda bloquear.
39. ☐ **La jerarquía se respeta:** WhatsApp es el botón dominante, "seguir en la
    web" es el secundario, y "dejar consulta" es un **link**, no un tercer botón
    del mismo tamaño. Se mira de lejos y tiene que quedar obvio dónde tocar.
40. ☐ Los **cinco** casos tienen los tres caminos, y el segundo lleva a algo que
    el sitio sí puede vender — no a la nada.
41. ☐ **"Ver los que sí hay"** vuelve a la grilla con las categorías disponibles
    habilitadas, manteniendo las fechas ya elegidas.
42. ☐ **"Elegir otras fechas"** abre el calendario **en el día 10**, no en hoy —
    o vuelve a ofrecer un día que también va a rechazar.
43. ☐ **Llegar a WhatsApp es un solo toque** desde que aparece el cartel. Ningún
    paso intermedio se coló en el camino rápido.
44. ☐ El botón abre el **WhatsApp principal** (`WHATSAPP_GENERAL`), no otro número.
45. ☐ El mensaje llega con **todo**: categoría, fechas, horas, los dos lugares,
    días, edad, adicionales y el motivo. Se prueba leyéndolo como si fueras el
    agente: si te queda una pregunta, falta un campo.
46. ☐ En **computadora**, si no hay sesión de WhatsApp Web, el número se puede
    copiar. Que el botón no aparente estar roto.
47. ☐ **El link a la consulta abre el formulario de siempre y sigue andando**: la
    solicitud entra a la bandeja y ahora **también manda mail** ← 1.4.
48. ☐ Se registra **el motivo y cuál de los tres caminos se tomó** — sin eso, los
    10 días no se pueden revisar con datos, y no se sabe si los escapes sirven.
49. ☐ Queda la estadística de demanda insatisfecha **también para el que no deja
    datos** (o se anotó en D-04 que se decidió no medirlo) ← §5, pregunta 1.

**El resto de las reglas nuevas**
50. ☐ Una edad menor a 21 no puede avanzar en la web.
51. ☐ El contrato **no** imprime una línea que diga la edad del cliente ← §3.4.
52. ☐ El contrato dice "seguro con franquicia de $X" con X real ← §3.2.
53. ☐ **Con la franquicia base sin cargar, el contrato no imprime `$ 0`**: sale
    sin el bloque y la campana lo reclama ← §3.8b.
54. ☐ La pantalla de Adicionales **no deja guardar** una cobertura con franquicia
    mayor a la base, ni una más cara con franquicia más alta ← §3.8b.
55. ☐ La web muestra las coberturas de mayor a menor franquicia, con la base
    arriba ← §3.8b.
56. ☐ Asignar un auto de otra categoría avisa **"UPGRADE, mismo precio"**, y
    **advierte** si en realidad es un downgrade ← §3.5.

---

## 7. Qué NO hacer

Siete cosas que parecen atajos y rompen algo que hoy anda:

1. **No hacer que `pendiente_pago` ocupe calendario.** Que se **vea** no es lo
   mismo que que **descuente cupo**. El cupo lo sostiene el hold justamente para
   que un checkout abandonado no bloquee un auto. Son dos ejes distintos y hay
   que mantenerlos separados.
2. **No cargar las temporadas como reglas con rango propio.** Apaga el aviso de
   todos los feriados del año, en silencio (§3.7, trampa 1).
3. **No `TRUNCATE CASCADE`.** Arrastra tablas que nadie listó. La lista
   explícita es el punto (§4.2).
4. **No arreglar el rótulo de la franquicia sin arreglar el valor.** "Seguro con
   franquicia de $0" es peor que lo que dice hoy (§3.2).
5. **No duplicar reglas entre `web/` y `backend/`.** Ya pasó con
   `LUGARES_FALLBACK`, y es la misma clase de error que la regla global sobre las
   auditorías de leads: dos copias de una regla derivan hasta contradecirse. La
   ventana, los lugares, la edad mínima y la franquicia salen todas del backend.
6. **No dejar el panel de pendientes como franja fija abajo.** Es exactamente lo
   que ya se probó y se sacó con el flujo del día, y está escrito por qué en
   `Dashboard.tsx:99-104`. Sin pendientes, no ocupa un píxel (2.2).
7. **No copiar `MesMini` a la página de ocupación.** Se generaliza y se comparte.
   Dos calendarios anuales significa que un día uno pinta los feriados y el otro
   no, y nadie sabe cuál está bien (2.8).

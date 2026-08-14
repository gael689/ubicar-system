# Dónde quedó todo — 14 de agosto de 2026

> Para retomar sin tener que reconstruir el contexto. Lo que está hecho está
> pusheado; lo que falta está acá con su decisión ya tomada, así que se puede
> arrancar a codear sin volver a discutir nada.

---

## Lo primero que tenés que saber

**Railway despliega solo con cada push a `master`.** No lo sabíamos hasta hoy.
Concretamente: un push mete el backend en producción y **corre las migraciones**.
Ya pasó una vez y mis pruebas de navegador terminaron creando registros en la
base de producción y **mandando 3 mails reales a `ubicar.rent@gmail.com`** con
asunto "Piden que los llamemos — Prueba…". Los registros los borré; los mails
no se pueden deshacer. Si Franco pregunta, son míos.

**Antes de probar cualquier cosa contra la web local, verificá a qué API
apunta.** `web/.env.local` tiene `NEXT_PUBLIC_API_URL` apuntando a **Railway**,
no a local. Para probar contra local hay que levantarla así:

```bash
cd web && NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1 npm run dev
```

Y confirmar que el server **arrancó de verdad** — si el puerto 3200 está
ocupado por un proceso viejo, falla en silencio y seguís pegándole a producción.

**`api.ubicar-rent.com.ar` todavía no está conectado** (no resuelve). Todo lo
que apunte al backend tiene que usar
`https://ubicar-system-production.up.railway.app`.

**Datos de prueba que dejé en la base LOCAL** (producción está limpia):
7 reservas y 1 bloqueo en julio/agosto/septiembre 2026 para ver el calendario
anual pintado, 2 solicitudes de contacto ("Marina Suarez", "Diego Paz") y
2 más de las pruebas de la web. Borralos cuando no los necesites.

---

## Lo que quedó pendiente, en orden de tamaño

### 1. El día extra por devolver más tarde — **no empezado**

**La regla, tal como la dio Gael:** si el retiro es a las 10:00 y la devolución
a las 11:00, se cobra **un día más**. Sale directo del conteo de días,
**sin aclarárselo al cliente**. **Sólo por la web.**

**Dónde está el cálculo:** `backend/app/domain/tarifas.py:90`

```python
def calcular_duracion_dias(fecha_inicio: date, fecha_fin: date) -> int:
    return (fecha_fin - fecha_inicio).days   # ignora las horas por completo
```

**El punto difícil, y por eso no lo hice de una:** esa función tiene **diez
llamadores** entre `precio_service`, `reserva_service`, `alquiler_service` y
`routers/alquileres`, y la regla es **sólo para la web**. Cambiarla ahí adentro
afectaría también al mostrador, a las extensiones de alquiler y al recálculo de
adicionales por duración.

Lo que hay que resolver antes de tocar nada:
- ¿Se agrega un parámetro `origen`/`web` a la función, o una función nueva que
  la envuelva y se use sólo en el camino web?
- ¿Qué pasa cuando el mostrador edita una reserva que entró por la web? ¿Se
  recalcula con la regla web o con la del mostrador?
- El día extra **cambia el precio**, así que también cambia el subtotal sobre el
  que se calculan las coberturas por porcentaje y el recargo por edad. Hay que
  ver dónde entra en el pipeline.
- ¿El cliente ve "5 días" cuando eligió 4 y un rato? Gael dijo que no se
  aclara, pero el desglose de precio muestra la cantidad de días.

### 2. La reasignación de vehículo — **Fase 0 hecha, resto pendiente**

**Ya está hecho y pusheado** (commit `de5c5c2`), los cuatro agujeros que existían:

- El frontend descartaba el aviso de que se había anulado un contrato firmado.
- Anular un contrato no dejaba rastro en auditoría.
- El link de firma sobrevivía al contrato anulado (el cliente podía firmar uno
  ya anulado desde el WhatsApp viejo).
- Se podía cambiar el auto **con el alquiler abierto**, lo que reescribe qué
  vehículo salió y deja los km de salida colgando del auto equivocado.

**Lo que falta** (el plan completo está en la conversación, pero lo esencial):

**El problema de fondo:** hay **tres implementaciones paralelas** del cambio de
vehículo, cada una con reglas distintas. La única que llega desde la pantalla
(`ReservaService.asignar_vehiculo`) **no toca el contrato**, así que un contrato
firmado sobrevive nombrando la patente vieja. Y `POST /reservas-web/{id}/aceptar`
reimplementa la asignación a mano: sin lock, sin la lógica de upgrade/downgrade
de D-54, sin auditoría y sin contrato. **Ésa es la raíz de "que funcione igual
para web y para mostrador".**

**La política sobre contratos firmados, ya decidida:** nunca se pisa. Se anula y
se emite uno nuevo; los dos quedan en el historial. Si el que se anula estaba
firmado, hace falta confirmación explícita con motivo y queda auditado.
Regenerar conservando la firma vieja no produce un documento inválido: produce
uno **falso**.

**Gael aclaró que esto casi nunca va a pasar**, porque la firma pasa a ser **en
el checkout**, al entregar el vehículo. Antes de eso el contrato normalmente no
está firmado, así que el caso "tiene que firmar de nuevo" es la excepción.

**D-65, que se suma:** al reasignar tiene que poder **corregirse el precio**,
por día y también el total.

**Trampa a no olvidar:** al regenerar el contrato hay que hacer `flush()`
**antes**, o el contrato nuevo sale con la patente vieja y nadie lo nota hasta
que el cliente lo firma.

### 3. Las tres coberturas (D-63) — **los bugs de plata resueltos, el modelo no**

**Ya está hecho y pusheado** (commit `b9594e5`): las coberturas que cuestan un
porcentaje del alquiler ya no se congelan en $0. Antes el cliente pagaba la
cobertura en la pasarela y en el sistema esa plata **no existía como concepto**.
También se corrigió que el porcentaje no se multiplique por los días (cobraba
30% por día, o sea 120% en un alquiler de cuatro) y que la web dijera
"Incluido" sobre algo que cuesta 30% más.

**Lo que falta, con los números ya definidos:**

| Nivel | Franquicia | Recargo |
|---|---|---|
| **LDW** (base) | la de la categoría | +0% |
| **TOP COVER** | base − $500.000 | **+20%** |
| **SUPER TOP COVER** | base − $1.000.000 | **+45%** |

| Categoría | Franquicia LDW |
|---|---|
| Compacto · Sedán | $1.500.000 |
| Sedán superior | $2.000.000 |
| Pick-up | $3.000.000 |
| **SUV · Furgón** | **Gael los pasa después** |

Reglas confirmadas:
- Los porcentajes **no son acumulativos**: van sobre el alquiler base. Super Top
  es +45%, nunca +20% y después +45%.
- **Ninguna cobertura incluye ruedas y vidrios.** Es un servicio aparte:
  se toma el precio total, se divide por los días, y a ese precio diario se le
  suma **10%**. *(Aritméticamente da lo mismo que 10% del total; se calcula y
  se muestra por día porque es como se le explica al cliente.)*
- **SUV y Furgón no se reservan por la web** mientras no tengan franquicia.
  Caen en el panel de derivación a un agente, que **ya está construido** (D-61)
   — hace falta un motivo nuevo (`sin_franquicia`) y el gate en el backend.

**Hallazgos del análisis que hay que tener presentes:**
- `categorias.franquicia_base` **no es editable desde ninguna pantalla**: no
  está en los schemas. Hoy cambiar una franquicia exige escribir una migración.
- La migración 064 inventó valores para SUV y Furgón ("se asimila a sedán
  superior"). Hay que **ponerlos en NULL**, que es lo que dispara el bloqueo.
  Y Pick-up está en $2.500.000, tiene que pasar a $3.000.000.
- Las dos coberturas actuales (`demo_cob_basica`, `demo_cob_full`) se **dan de
  baja lógica**, no se reescriben: las reservas viejas tienen que seguir
  apuntando a filas intactas.
- Hay un bug menor sin arreglar: al extender un alquiler, la cobertura por
  porcentaje no crece (sólo se recalculan las líneas `por_dia`).

**D-64, ya resuelto y pusheado** (`9a77ab4`): en un upgrade rige la franquicia
del **vehículo entregado**, no la del contratado. Ubicar no absorbe la
diferencia, porque el contrato se firma al entregar el auto.

### 4. Mercado Pago — **esperando credenciales**

El instructivo corregido está en
`docs/para-la-reunion/PASO_A_PASO_MERCADOPAGO.md`. Falta que Franco traiga los
tokens. Lo que hay que saber:

- Hacen falta **cinco variables** en Railway, no sólo el webhook.
  **`WEB_URL` es la que se olvida**: su default es `localhost` y Mercado Pago
  rechaza una preferencia que apunte ahí, así que sin ella el botón de pagar
  falla antes del checkout.
- **El panel de Mercado Pago muestra todo en verde aunque nada funcione**,
  porque el webhook siempre responde 200 a propósito. La verdad está en la
  tabla `pagos_web`.
- **Conviene excluir el efectivo** (Rapipago, Pago Fácil): se acredita dos o
  tres días después y mientras tanto el hold vence y el auto se libera.

Sin arreglar, anotado: **no hay tests del webhook ni del adaptador de MP** —
la primera corrida real va a ser el pago de prueba. Y
`MERCADOPAGO_PUBLIC_KEY` es código muerto (declarada, cero usos).

---

## Lo que se hizo hoy y ya está en producción

| Commit | Qué |
|---|---|
| `530cb8f` | **D-61** — la web deriva en vez de frenar: menos de 10 días, sin cupo y "otro lugar" dejan avanzar y ofrecen agente. Se acabó el "Sin disponibilidad para estas fechas" |
| `de4f78f` | El formulario "que me llamen ustedes", conectado en los tres casos |
| `d5b1600` | **D-62** — el calendario anual pinta por estado de reserva, no por densidad |
| `d0fe864` | El pie del contrato ya no se pisa, con test de geometría |
| `de5c5c2` | Los cuatro agujeros del cambio de vehículo |
| `b9594e5` | La cobertura cobrada al cliente ya queda registrada |
| `e3e5a46` · `0b6e53b` | Instructivo de Mercado Pago corregido, y límite al webhook |
| `9a77ab4` | **D-64** — la franquicia sale del auto entregado |

**Las dos bases están limpias** de datos operativos (reservas, gastos,
clientes, caja) — se corrió el 14/08 en local y en Railway. Quedaron los
vehículos, las categorías, la configuración y los usuarios.

Se encontró y arregló un bug del script de limpieza: borraba `multas` después
de `alquileres` y moría contra la clave foránea. En Railway no habría saltado
porque ahí `multas` estaba vacía.

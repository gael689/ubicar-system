# Plan del Módulo de Contratos — Fase 4, ítems 50-51

**Fecha:** 2026-07-28
**Estado del módulo hoy:** `routers/contratos.py` es un stub de 19 líneas que
devuelve *"Módulo en construcción"*. `services/contrato_pdf.py` tiene 14 líneas
vacías. El modelo `Contrato` existe (con `datos_prellenados`, `firmado`,
`url_pdf`) pero **nunca se escribió una fila**. Es el último bloqueante duro
antes de poder entregar un auto con respaldo legal.

**Qué cambió respecto del plan original:** el ítem 50 estaba
`⏸️ bloqueado esperando el texto legal de Franco/Martín`. **Ya no lo está.**
El 2026-07-28 el usuario aportó un contrato real de la competencia (SIXT /
Compañía General de Vehículos S.A., franquiciado en Argentina) con la
instrucción explícita: **replicarlo igual, cambiando toda referencia a la otra
empresa por Ubicar Rent**, y que los datos operativos (check-out, check-in,
kilometraje, vehículo, etc.) se completen solos desde el sistema pero se puedan
editar.

Eso desbloquea el 50 y, con él, el 51.

> **Una advertencia que corresponde dejar escrita una vez.** El reverso es un
> texto legal redactado para otra empresa, con su estructura societaria, sus
> productos de cobertura y su jurisdicción. Adaptar el clausulado estándar del
> rubro es práctica normal, pero **hay pasajes que no se pueden copiar tal
> cual sin volverlos falsos o inaplicables** (están listados en §4). El plan
> los resuelve uno por uno. Aun así, antes de hacerlo firmar a un cliente
> real conviene que un abogado lo lea — es media hora de un profesional sobre
> un documento que define quién paga un auto destruido.

---

## 1. Anatomía del documento a replicar

Dos caras, dos naturalezas distintas, y **esa distinción ordena todo el
diseño**:

| | Anverso | Reverso |
|---|---|---|
| Qué es | La **liquidación** de este alquiler puntual | El **clausulado** legal, igual para todos |
| Cambia | En cada contrato | Casi nunca (y cuando cambia, es un hecho legal) |
| De dónde sale | Datos del sistema | Texto fijo versionado |
| Editable | Sí, campo por campo | No desde la pantalla del contrato |

Por eso el anverso se arma con datos vivos y el reverso vive en una
**plantilla versionada** (§5). Meter el clausulado hardcodeado en el generador
de PDF haría que corregir una coma obligue a un deploy, y —peor— que los
contratos ya firmados se rendericen con el texto nuevo si alguien los vuelve a
descargar. Un contrato firmado tiene que poder reimprimirse **exactamente**
como se firmó.

---

## 2. Mapeo del anverso — campo por campo

Leyenda: **AUTO** = sale solo del sistema · **EDIT** = se precarga pero el
operador lo puede pisar · **CONFIG** = dato fijo de la empresa · **❌** = no
aplica a Ubicar y se elimina del formulario.

### 2.1 Cabecera

| Campo en el original | En Ubicar Rent | Origen |
|---|---|---|
| Logo SIXT RENT A CAR | Logo Ubicar Rent | `assets/logo.png` (ya se usa en recibo y reserva) |
| Código de barras + N° de contrato `9523661538` | **N° de contrato** `0001-00000042` | AUTO — secuencia propia, mismo patrón que `recibos_numero_seq` |
| "Contrato de Alquiler" | Igual | fijo |

**Sobre el código de barras:** el original lo usa para escanear el contrato en
mostrador. Ubicar no tiene ese flujo. **Se reemplaza por un QR** con el número
de contrato y un link a la ficha del alquiler — mismo espacio visual, utilidad
real. Es una decisión abierta (§7, D-C6): si prefieren el código de barras
literal, ReportLab lo genera igual (`reportlab.graphics.barcode`).

### 2.2 Datos del servicio y del vehículo

| Campo | En Ubicar | Origen |
|---|---|---|
| `Check Out: 23.06.2026 15:39 Bahia Blanca Centro` | Igual | **AUTO** `Alquiler.checkout_fecha` + `checkout_hora` + `Reserva.lugar_entrega` · **EDIT** |
| `Check In: 24.06.2026 16:00 Bahia Blanca Centro` | Igual | **AUTO** `Reserva.fecha_fin`/`hora_fin` + `lugar_devolucion` (previsto, el contrato se firma antes de devolver) · **EDIT** |
| `Kilometraje: 74510 km` | Igual | **AUTO** `Alquiler.checkout_km` · **EDIT** |
| `Vehiculo: RENAU SANDERO EST PET MAN` | `FIAT CRONOS DRIVE 1.3` | **AUTO** `Vehiculo.marca + modelo + version` |
| — | **Combustible de salida** | **AUTO** `Alquiler.checkout_combustible`. **Se agrega**: la cláusula 1 obliga a devolver con el tanque lleno y el 6.(iv) permite debitar la diferencia. Reclamar eso sin haber dejado escrito con cuánto salió es indefendible. |

### 2.3 Datos administrativos (columna derecha)

| Campo | En Ubicar | Decisión |
|---|---|---|
| `Numero de cliente: 0` | N° de cliente | **AUTO** `Cliente.id` |
| `Patente: AG608PJ` | Igual | **AUTO** `Vehiculo.patente` |
| `Numero Interno: 15667661` | N° interno de flota | **AUTO** `Vehiculo.id` / `orden` |
| `Estacionamiento: 47447` | ❌ | Ubicar no tiene playa numerada |
| `Numero de Orden` | ❌ | Vacío también en el original |
| `Numero de Voucher` | ❌ | Es de operadores turísticos / vouchers de agencia |
| `Numero de Reserva: 9944020843` | N° de reserva | **AUTO** `Reserva.id` |
| `Agencia: 0` | ❌ | Sucursales descartadas (ítem 55) |

Los cuatro ❌ salen del formulario. Dejar campos que nunca se llenan es lo que
hace que un documento se lea como una plantilla copiada.

### 2.4 Conductor

El original imprime apellido, nombres, calle y número, CP + localidad, país, en
líneas separadas. Ubicar tiene exactamente esos datos desde la migración 023
(`domicilio`, `localidad`, `provincia`, `codigo_postal`).

| Campo | Origen |
|---|---|
| Conductor (nombre, domicilio, localidad, CP, país) | **AUTO** `Cliente` · **EDIT** |
| `Empresa:` | **AUTO** `Cliente.razon_social` si `tipo == "empresa"`, si no vacío |
| `Segundo Conductor:` | **AUTO** `Reserva.conductor_id` → `ConductorAdicional` · **EDIT**. La cláusula 2.h) exige nombre, documento **y dirección** de cada conductor adicional para que la autorización valga: `ConductorAdicional` hoy no tiene domicilio → **campo nuevo** (§5). |
| `Registro de Conductor: 36272589, 04.05.2026, puan, RA` | **AUTO** `licencia_numero`, `licencia_vencimiento`, `licencia_pais`, `licencia_categoria` |
| `Forma de Pago: FE, , 99/12` | **AUTO** `Reserva.forma_pago_prevista` + últimos 4 y vencimiento de la tarjeta de garantía si la hay. **Nunca el número completo.** |
| `Programa de Millas` | ❌ Ubicar no tiene programa de fidelidad |
| `Tarifa: ARRY9000` | Nombre de la tarifa/regla aplicada | **AUTO** del motor de precios (§2.5) |
| `Categoria de Vehiculo: CDMR` | Nombre de la categoría (no el código ACRISS) | **AUTO** `Categoria.nombre` |

`CDMR` es código ACRISS, un estándar internacional que sólo sirve entre
rentadoras y GDS. Ubicar vende en Bahía Blanca a cliente final: se imprime
"Sedán" y se entiende.

### 2.5 Desglose de cargos

El original lista conceptos con Cantidad × Valor unitario = Total, y después
liquida IVA. **Acá el sistema ya tiene todo y bastante mejor**: el motor de
precios (migración 039) devuelve el desglose día por día y los adicionales
(migración 040) están congelados por reserva.

Filas a generar, en este orden:

```
Días de alquiler         N x <precio/día promedio>   <subtotal_vehiculo>
<cada adicional>         N x <precio congelado>      <total>
Cargo por late check-out  1 x ...                    (sólo si > 0)
────────────────────────────────────────────────────────────
Descuento (si precio_total < precio_lista)          -<dif>
Valor Neto                                           <neto>
21,00% IVA                                           <iva>
Valor Estimado                                       <total>
```

Cuatro decisiones dentro de esto:

1. **"Valor Estimado", no "Total"** — el original usa esa palabra a propósito
   y hay que conservarla. Al firmar el contrato el auto todavía no volvió: el
   excedente, el combustible y los daños se liquidan en el check-in. Escribir
   "Total" sería prometer un número que el propio contrato (cláusula 6) se
   reserva el derecho de aumentar.
2. **El IVA se muestra desagregado sólo si `Reserva.con_factura`** y el cliente
   es responsable inscripto. Para un consumidor final el precio es final:
   desglosar IVA en ese caso confunde y no aporta.
3. **El descuento se imprime como línea propia.** Existe `precio_lista` vs
   `precio_total` justamente para eso (auditoría de descuentos, ítem 22).
   Esconderlo dentro de un precio unitario menor rompería esa auditoría en el
   único documento que el cliente se lleva.
4. **`precio incluye kilometraje`** — el original lo aclara al pie de la
   tabla. Ubicar no cobra por km (regla ya establecida), así que la línea se
   mantiene: es una ventaja comercial escrita.

### 2.6 Coberturas, advertencias y franquicia

Este bloque es el más delicado y el que mejor calza con lo ya construido.

El original imprime **el rechazo explícito** de las coberturas no contratadas:

> *"A pesar de la explicación, el arrendatario no desea la prot. a todo riesgo."*
> *"A pesar de la explicación, el arrendatario no desea la protección de robo."*

Eso no es decoración: es la prueba de que se ofreció y el cliente dijo que no.
Sin esa línea, un cliente que choca puede alegar que nunca le ofrecieron nada.

**Cómo se genera solo:** el módulo de Adicionales ya distingue `cobertura` de
`extra`, y las coberturas son **excluyentes** (se elige una). Entonces:

- Las coberturas **contratadas** se listan en el desglose (§2.5) con su nombre
  y su **franquicia**, que es un campo propio del adicional.
- Las coberturas **del catálogo que no se contrataron** generan
  automáticamente una línea de rechazo con el texto de arriba.
- `FRANQUICIA: $2.620.000 (responsabilidad del cliente)` sale de
  `Adicional.franquicia` de la cobertura contratada. Si no se contrató
  ninguna, sale de un valor por vehículo o por categoría — **hoy no existe**
  (§7, D-C3).

Cierra el bloque la advertencia de cambios de fecha/lugar, que se copia literal.

### 2.7 Firma y pie

| Original | En Ubicar |
|---|---|
| "Por la presente acepto la información, los términos y condiciones que figuran en el anverso y reverso del presente contrato." | **Literal** |
| Línea de firma | Igual + aclaración y DNI |
| `Usted fue atendido por el Sr, Hernandez` | **AUTO** — el usuario logueado. Hoy es el usuario ficticio de `DEV_BYPASS_AUTH`: **es la primera vez que el nombre del operador sale impreso en un papel que firma un cliente.** Refuerza que Clerk (Fase 3.5) va antes de usar esto en producción. |
| Pie institucional (razón social, domicilio, CUIT, II.BB, teléfonos, mail) | **CONFIG** — datos de Ubicar Rent. Faltan (§7, D-C1) |
| "Compañía General de Vehículos is the franchisee of SIXT..." | ❌ Se elimina. Ubicar no es franquiciado de nadie. |

---

## 3. El reverso — las 13 cláusulas

Se transcriben **completas y en el mismo orden**, con los títulos en negrita y
los subrayados del original conservados (son los pasajes de exención de
responsabilidad y penalidades; que estén marcados es parte de la validez).

**El reemplazo mecánico:** todas las apariciones de `LEONARDO DANIEL ILARI`
—que en el original es la persona física titular, no la sociedad del anverso—
pasan a ser **el locador de Ubicar Rent**. Cuál es exactamente ese nombre es la
decisión D-C1 y es la que bloquea todo lo demás de este bloque.

En el texto de la plantilla no va el nombre literal sino un **placeholder
`{{LOCADOR}}`**, resuelto al renderizar. Así, si mañana la operación pasa de
persona física a S.R.L., se cambia un valor de configuración y no se reescriben
13 cláusulas con riesgo de olvidar una.

---

## 4. Los siete pasajes que NO se pueden copiar literal

Estos son los puntos donde "igual que el de ellos" produciría un contrato
falso, inaplicable, o que le regala una defensa al cliente. Cada uno con su
resolución propuesta.

**1. La ambigüedad locador ↔ razón social.**
En el original el anverso factura una S.A. y el reverso otorga todos los
derechos a una persona física. Es una particularidad de esa franquicia (y
discutible). **En Ubicar el nombre del anverso y el del reverso tienen que ser
el mismo.** Si no, un cliente puede argumentar que no sabe con quién contrató.

**2. `Top Cover` / `Super Top Cover` / `LDW` / `Protección Ruedas y Vidrios`.**
Son **productos comerciales de SIXT**. La cláusula 5 dedica tres párrafos a
cómo interactúan entre sí. Copiar eso significa que el contrato de Ubicar
referencia coberturas que Ubicar no vende: cualquier cliente puede reclamar la
"reducción de franquicia a CERO" que el papel menciona.
**Resolución:** los nombres se reemplazan por **los adicionales de tipo
`cobertura` que Franco y Martín carguen en el sistema** (migración 040). El
párrafo se genera con los nombres reales del catálogo. Si no hay ninguna
cobertura cargada, el párrafo entero se omite en vez de nombrar productos
inexistentes.

**3. Jurisdicción: "Tribunales Ordinarios de la Capital Federal".**
Tiene sentido para una empresa con sede en Cerrito 1366. Para Ubicar, con toda
la operación en Bahía Blanca y clientes de la zona, litigar en CABA es caro
para ambas partes y además **un juez puede tenerlo por no escrito**: una
cláusula de prórroga de jurisdicción abusiva en un contrato de adhesión con un
consumidor es de las primeras que se caen (art. 37 Ley 24.240 y art. 988
CCyC). **Propuesta: Tribunales Ordinarios de Bahía Blanca** (§7, D-C4).

**4. El pie de página fiscal completo.**
CUIT `30-70985871-4`, II.BB `901-224568-1`, `Activities started on: 17 Oct
2006`, las direcciones de Cerrito y los teléfonos de SIXT. **Todo eso son datos
de otra empresa** — imprimirlos sería falso y, en el caso del CUIT,
directamente un problema. Se reemplazan por los de Ubicar (D-C1).

**5. La numeración rota de la cláusula 12.**
El original tiene un `"4."` huérfano dentro de la cláusula 12 ("El cliente ha
leído y acepta..."). Es un error de maquetación del papel original. Se corrige:
pasa a ser un párrafo más de las Previsiones Generales, sin número.

**6. `El CLIENTE deberá mequear si tales conductores...`** (cláusula 2.h)
"mequear" no es una palabra. Es un typo de "chequear" que quedó impreso. Se
escribe **"verificar"**.

**7. "el formulario de accidente incluido con los papeles del vehículo"** (2.f)
Ese formulario **no existe en Ubicar**. Una obligación del cliente que
referencia un papel que no se le entrega es inejecutable. Dos salidas: crear el
formulario (es un PDF de una página, sale del mismo pipeline) o cambiar la
redacción a "comunicando por escrito por los medios de contacto indicados".
Recomiendo lo segundo ahora y lo primero después (§7, D-C5).

**Además, tres cláusulas quedan más fuertes de lo que hoy el sistema puede
sostener, y vale saberlo:**

- La **1** obliga a devolver con **tanque lleno**. El sistema hoy registra
  combustible como nivel visual (0-100), sin litros ni capacidad de tanque, y
  `cargo_combustible` es un monto que el operador escribe a mano. Es
  suficiente para reclamar, pero el contrato promete más precisión de la que
  hay. No bloquea: el cargo lo decide una persona, como todo lo demás.
- La **6** autoriza a **debitar de la tarjeta** cargos posteriores. Ubicar
  guarda datos de tarjeta como garantía (`garantia_tarjeta_*`) pero **no
  procesa débitos**: no hay pasarela conectada al sistema interno. La cláusula
  se conserva (habilita el reclamo y la imputación contra la garantía, que sí
  se hace), pero nadie debería prometerle a un cliente que "se le va a debitar
  automáticamente".
- La **11** define **retención indebida a las 48 hs**. El motor de
  notificaciones ya avisa del check-in vencido con urgencia crítica; conviene
  agregar una regla a las 48 hs exactas que cite la cláusula, porque es el
  momento en que se habilita la acción penal. Es una regla nueva sobre el
  catálogo existente, barata.

---

## 5. Modelo de datos

### `contrato_plantillas` (tabla nueva)

El clausulado versionado. **Ninguna edición pisa la versión anterior**: se crea
una versión nueva y la vieja queda vigente para los contratos ya firmados con
ella. Es el mismo criterio que `reserva_adicionales.precio` congelado y que
`precio_lista` — cambiar un precio o un texto no puede reescribir el pasado.

| Campo | Notas |
|---|---|
| `version` | Entero correlativo. Se imprime chiquito al pie: "Cond. Grales. v3 — 28/07/2026" |
| `titulo` | "CLÁUSULAS, CONDICIONES Y NORMAS DE UTILIZACIÓN DEL VEHÍCULO" |
| `clausulas` | JSON: `[{numero, titulo, parrafos: [{texto, subrayados: [[ini,fin]]}]}]` |
| `vigente_desde` | `Date` |
| `activa` | Sólo una activa a la vez |
| `activo`, `created_at`, `creado_por` | Regla de nunca eliminar |

**Por qué JSON estructurado y no un blob de texto:** los subrayados y las
negritas de los títulos son parte del documento, y el generador necesita saber
dónde van. Guardar HTML invitaría a que alguien pegue markup roto en un
contrato legal.

### `contratos` (tabla existente, se extiende)

Hoy tiene `alquiler_id`, `url_pdf`, `firmado`, `datos_prellenados`,
`link_prellenado`. Se agrega:

| Campo | Para qué |
|---|---|
| `numero` | Correlativo `0001-00000042` vía secuencia, igual que recibos |
| `plantilla_id` | FK — **con qué versión del clausulado se firmó**. Es lo que hace reimprimible un contrato viejo |
| `snapshot` | JSON con **todos los campos del anverso ya resueltos** al momento de generar |
| `firmado_at`, `firma_key` | La imagen de la firma en el storage |
| `firmado_por_nombre`, `firmado_por_dni` | Quién firmó — puede no ser el titular |
| `atendido_por` | FK usuario, el "Usted fue atendido por" |
| `anulado`, `motivo_anulacion` | Nunca se borra |
| `activo`, `created_at`, `creado_por` | |

**`snapshot` es la pieza central.** El contrato firmado tiene que poder
reimprimirse idéntico dentro de dos años aunque el cliente se haya mudado, el
auto se haya vendido y los precios hayan cambiado tres veces. Renderizar contra
las tablas vivas produciría un PDF distinto del que el cliente firmó — que es
exactamente lo que un contrato no puede hacer. El JSON congela: cliente,
conductor, vehículo, fechas, km, desglose de cargos, coberturas, franquicia,
totales y operador.

Es también lo que hace posible el **EDIT** del pedido: el operador corrige lo
que haga falta antes de generar, y lo que queda guardado es lo corregido, no lo
que decía el sistema.

### `conductores_adicionales` — un campo

`domicilio` (String, nullable). La cláusula 2.h lo exige para que la
autorización del conductor adicional sea válida.

### `configuracion` — claves nuevas

`empresa.locador_nombre`, `empresa.razon_social`, `empresa.cuit`,
`empresa.ingresos_brutos`, `empresa.domicilio`, `empresa.localidad`,
`empresa.telefonos`, `empresa.email`, `empresa.jurisdiccion`,
`contrato.franquicia_default`.

Van a `configuracion` (clave/valor, ya existe, editable desde pantalla) y no
hardcodeadas: son datos que cambian sin aviso y que **también los necesitan el
recibo, el comprobante y el PDF de reserva**, que hoy tienen el contacto de
Ubicar escrito a mano en `reserva_pdf.py:63`. Se unifican de paso.

---

## 6. Generación, firma y bloqueo

### El PDF

`services/contrato_pdf.py`, ReportLab, **dos páginas A4** — el mismo pipeline
que `recibo_pdf.py` y `reserva_pdf.py`. Sin dependencias de sistema, sin
navegador: un contrato tiene que poder regenerarse desde un job.

- **Página 1 = anverso.** Densa, en bloques, tipografía chica. **No es el
  recibo ni la confirmación de reserva**: esos son documentos comerciales con
  aire y color de marca. Este es un formulario administrativo y tiene que
  parecerlo — si se lo maqueta "lindo" pierde el registro visual de contrato.
  Marca sólo en el logo y en las líneas divisorias.
- **Página 2 = reverso.** Texto corrido justificado, cuerpo ~6.5pt, dos
  columnas, títulos en negrita, subrayados donde el original los tiene.
  Renderizado desde `clausulas` con `{{LOCADOR}}` resuelto.

### La firma

`POST /contratos/{id}/firmar` con la imagen del canvas (base64 → `IStorage`,
el mismo que documentos, comprobantes y fotos de daños). Guarda `firma_key`,
`firmado_at`, `firmado_por_nombre`, `firmado_por_dni`, y **regenera el PDF con
la firma estampada**.

Es firma ológrafa digitalizada, no firma digital con certificado. Vale como
prueba (es lo que usan todas las rentadoras) pero conviene no llamarla "firma
digital" en ningún texto de la interfaz.

### El bloqueo del check-out

El ítem 51 pide *hard block*: no se entrega el auto sin contrato firmado.
**Propuesta más fina, coherente con "el sistema informa, la persona decide"**
(regla ya establecida del proyecto): el check-out **advierte fuerte** y exige
confirmación explícita con motivo, en vez de impedirlo.

Motivo concreto: el día que el generador de PDF falle, o que se corte internet
en el mostrador con un cliente esperando, un bloqueo duro deja el negocio
parado. La advertencia con motivo obligatorio deja el mismo rastro auditable y
no puede paralizar una entrega. Es la misma decisión que se tomó en bloqueos de
vehículo (ítem 59: "no se impide, se advierte").

Si Franco y Martín prefieren el bloqueo duro, es una línea (§7, D-C7).

### Endpoints

```
POST   /contratos/{alquiler_id}/preparar   → devuelve el snapshot precargado, editable
POST   /contratos                          → crea con el snapshot final + N° + plantilla vigente
GET    /contratos/{id}/pdf                 → el PDF (regenerado desde el snapshot, siempre igual)
POST   /contratos/{id}/firmar              → firma + regenera
POST   /contratos/{id}/anular              → motivo obligatorio, nunca borra
GET    /contratos                          → listado con filtros
GET    /contrato-plantillas                → ABM del clausulado
POST   /contrato-plantillas                → nueva versión (nunca edita la anterior)
```

### Frontend

- **Paso dentro del check-out**: formulario con todo precargado y editable,
  vista previa en vivo al costado (mismo patrón split que el cotizador y el
  recibo), canvas de firma, botón "Generar y firmar".
- **Pestaña "Contrato"** en la ficha del alquiler: ver, descargar, reimprimir,
  anular.
- **Pantalla `/configuracion/contrato`**: el clausulado versionado, en modo
  lectura con un botón "Nueva versión". Editar 13 cláusulas legales no debería
  sentirse como editar una nota.

---

## 7. Decisiones — respondidas el 2026-07-28

Seis de las siete quedaron cerradas. **Sólo D-C1 sigue abierta**, y no frena la
construcción.

| # | Decisión | Respuesta |
|---|---|---|
| **D-C1** 🔴 | ¿Quién es el locador? | ⏳ **PENDIENTE** — *"dejalo como pendiente, poné algo genérico mientras"*. Ver abajo |
| **D-C2** ✅ | ¿Se adopta el clausulado? | **Sí, tal cual**, con las 7 correcciones de §4. → **D-33** |
| **D-C3** 🟡 | Monto de la franquicia | **Un valor único** que cargan los dueños, usado en web, reserva y sistema. Falta entender cómo lo manejan hoy. Ver abajo |
| **D-C4** ✅ | Jurisdicción | **Bahía Blanca**. → D-33 |
| **D-C5** ✅ | Formulario de accidente | A criterio: **se reformula ahora**, el formulario se crea después |
| **D-C6** ✅ | Código de barras o QR | A criterio: **QR** |
| **D-C7** ✅ | ¿Bloquea el check-out? | **No bloquea, advierte y deja constancia visible**. → **D-34** |

### D-C1 — el locador, mientras tanto

Hasta que estén los datos reales, la plantilla usa el placeholder
`{{LOCADOR}}` con este valor por defecto:

```
LOCADOR   = "UBICAR RENT"
RAZON_SOCIAL, CUIT, INGRESOS_BRUTOS, DOMICILIO_FISCAL = ""  (no se imprimen)
CONTACTO  = Bahía Blanca, Argentina · +54 9 291 4180554 · ubicar.rent@gmail.com
```

**Los campos fiscales vacíos no se imprimen en vez de imprimirse con un
relleno.** Un CUIT inventado o un "XX-XXXXXXXX-X" en un contrato es peor que un
espacio en blanco: el blanco se nota y se completa, el relleno se firma.

Y **el generador emite una advertencia visible** —en la pantalla y en el
listado de contratos— mientras `empresa.cuit` esté vacío: *"Contrato generado
sin datos fiscales del locador"*. Así el placeholder no se vuelve permanente
por olvido, que es exactamente lo que pasa con estas cosas.

Cuando lleguen los datos, se cargan en `configuracion` y **todos los contratos
nuevos salen bien sin tocar código**. Los ya firmados conservan su `snapshot`,
como corresponde.

### D-C3 — la franquicia

**Decisión: un valor único, configurable, que aplica a todo** — web, reserva y
sistema. Va a `configuracion` con la clave `contrato.franquicia_default`.

Esto **cambia** la recomendación original del plan (que proponía franquicia por
categoría). El motivo para aceptar el cambio: es lo que los dueños entienden y
van a mantener. Una franquicia por categoría que nadie actualiza es peor que
una sola bien cargada.

**La estructura queda preparada para diferenciar sin migrar:** la resolución
del monto es una función —`franquicia_para(vehiculo, adicionales)`— que hoy
devuelve siempre el valor de configuración. El día que quieran distinguir
pick-ups de compactos, se agrega el campo por categoría y la función lo
prefiere; nada más cambia.

**Lo que falta preguntarles** (no bloquea, pero conviene saberlo antes de
imprimirlo): la franquicia que cargan, ¿es la que se aplica **sin** cobertura
contratada, o ya contempla alguna? Porque las coberturas del sistema
(`Adicional.franquicia`) **ya tienen su propio monto**, y el contrato tiene que
imprimir el que efectivamente corresponde a lo que el cliente contrató —si no,
el papel dice un número y la realidad es otra.

**Regla de resolución propuesta:** si el cliente contrató una cobertura, se
imprime la franquicia **de esa cobertura**; si no contrató ninguna, la de
configuración.

### D-C7 — la constancia, en concreto

*"No se bloquea, pero se advierte y se deja constancia de ello, siempre que
figure, por ejemplo en el historial de reservas, reserva sin contrato y demás."*

Cuatro lugares, para que la constancia no sea un dato enterrado en la auditoría:

1. **En el check-out** — advertencia con confirmación explícita y motivo.
2. **En el listado de reservas y alquileres** — un indicador **"Sin contrato"**
   en la fila, con el mismo peso visual que cualquier otro estado que requiere
   atención (sólido, no `bg-x/10` — la regla de colores del proyecto).
3. **En la ficha del alquiler** — bloque visible con la fecha, quién autorizó
   la entrega sin contrato y el motivo.
4. **Como notificación que no se resuelve sola** — persiste hasta que el
   contrato se firme. Es la única de las cuatro que **persigue** el problema en
   vez de sólo mostrarlo.

---

## 8. Orden de ejecución

| # | Qué | Depende de |
|---|---|---|
| 1 | `configuracion` con los datos de la empresa + unificar el pie de los PDF que ya existen | D-C1 |
| 2 | `contrato_plantillas` + carga de la v1 con el clausulado adaptado | D-C1, D-C2 |
| 3 | Extender `contratos` (número, snapshot, plantilla, firma) + `conductores_adicionales.domicilio` | 2 |
| 4 | `services/contrato_pdf.py` — las dos páginas | 3 |
| 5 | Endpoints + `ContratoService` | 4 |
| 6 | Frontend: paso en el check-out + pestaña + firma | 5 |
| 7 | Franquicia por categoría | D-C3 |
| 8 | ABM del clausulado en Configuración | 2 |
| 9 | Regla de notificación "retención indebida 48 hs" | 5 |

Los pasos 1-6 son el módulo utilizable. El 7-9 lo completan.

**Prerequisito real:** `atendido_por` imprime el nombre del operador en un papel
que firma un cliente, y hoy todos los usuarios son el mismo usuario ficticio de
`DEV_BYPASS_AUTH`. **Clerk (Fase 3.5) debería ir antes de usar esto con
clientes reales**, o el contrato va a decir siempre lo mismo sin importar quién
atendió.

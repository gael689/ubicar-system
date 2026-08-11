# Alternativas para cobrar — agosto 2026

Complementa `ANALISIS_WAPA.md`, que cubre Wapa en particular. Acá está el resto
del mercado y, sobre todo, **el requisito que ninguna comparación de comisiones
muestra y que para una rentadora define la elección**.

---

## 0. Antes de comparar comisiones: la garantía

Una rentadora no cobra igual que un ecommerce. Cobra **tres veces distintas**:

1. **La seña**, online, al reservar.
2. **El saldo**, en el mostrador, al entregar.
3. **La garantía** — que no es un cobro: es plata **retenida** en la tarjeta
   del cliente, que se libera al devolver el auto sin daños, o se captura si
   hay que cobrar la franquicia, el combustible o una multa.

La 3 es la que decide qué pasarela sirve. Se llama **preautorización** (o
retención, o `capture=false`), y es exactamente lo que hacen los hoteles y
todas las rentadoras del mundo.

### Cómo se resuelve hoy

Hoy la garantía se toma **anotando la tarjeta a mano** (`tarjetas_cliente`,
`reservas.garantia_tarjeta_*`). En la práctica eso **no garantiza nada**: no hay
fondos reservados. Si el auto vuelve con un daño y la tarjeta no tiene límite,
no hay de dónde cobrar.

Con preautorización, en cambio, no se guarda ninguna tarjeta —la pasarela
devuelve un token— y la plata está efectivamente reservada.

> Guardar la tarjeta a mano tiene además un problema de cumplimiento que se
> trata **aparte de esta decisión** y no depende de qué pasarela se elija: ver
> la tarea *"Dejar de guardar el CVV de la tarjeta de garantía"*.

Por eso, para elegir pasarela, la pregunta no es "¿cuál cobra menos comisión?"
sino **"¿cuál me da preautorización con un plazo que cubra el alquiler?"**.

---

## 1. Cómo funciona la comisión (antes de mirar la tabla)

Tres cosas que hacen que los números publicados no se puedan comparar de frente:

**1 · El porcentaje depende de cuándo querés la plata.** No es un precio por
"procesar": es el costo de que te adelanten los fondos. La tarjeta le paga al
comercio a los ~18 o 35 días; si querés la plata al instante, alguien te la
adelanta y te cobra por eso. **Es la palanca más grande de todas** y no requiere
cambiar de proveedor.

**2 · Casi todas publican el porcentaje sin IVA.** El costo real es 21% más
alto. Comparar un número con IVA contra uno sin IVA puede invertir cuál
conviene.

**3 · Las cuotas las paga el vendedor**, salvo que se ofrezcan "con interés" al
comprador. Cuantas más cuotas ofrecés, menos te queda.

Y una que no es comisión pero cuesta igual: **la comisión se descuenta antes de
acreditar**, así que nunca la ves como un gasto — aparece como plata que no
llegó.

---

## 2. Las opciones con API y webhook

Para el flujo web hace falta lo mismo que ya implementa el adaptador de Mercado
Pago: crear un pago, consultarlo, y **recibir un webhook**. Sin webhook la
reserva no se confirma sola (ver `ANALISIS_WAPA.md` §2).

| | Qué es | API | Preautorización | Comisión **con IVA** |
|---|---|---|---|---|
| **Mercado Pago** | El de siempre. ~69% del mercado | ✅ Completa | ⚠️ Sí, pero **5 días y sin captura parcial** — ver §3 | **7,85%** inmediato · **2,17%** a 35 días |
| **Payway** (ex Decidir, Prisma) | El *acquirer* que está detrás de Wapa | ✅ `developers.decidir.com/api/v2`, con SDKs | ✅ **31 días con Mastercard** en el rubro alquiler — ver §4-bis | **~2,2%** crédito (8–18 días) · ~1,2% débito · ~1% QR |
| **Mobbex** | Gateway argentino, orientado a PyME | ✅ Buena API | 🔍 Consultar | **~4,8%**, 5 días hábiles |
| **Getnet** | Santander. Más orientado a POS | ✅ Sí | 🔍 Consultar | Competitiva con MP |
| **MODO** | Billetera interoperable de los bancos | ✅ Botón de pago | ❌ No aplica | **0,73%** QR |
| **Wapa** | Banco Patagonia (mostrador) | ❌ | ❌ | **0,8%** QR · 4,90% crédito |

> **El QR cuesta lo mismo en todas.** MODO 0,6%, Wapa 0,8%: no es casualidad ni
> mérito de ninguna. El QR interoperable no viaja por la red de tarjetas sino
> por transferencia inmediata, y ahí el arancel es una fracción. **Lo que
> importa no es de quién es el QR, sino usar QR en vez de tarjeta.**

---

## 3. Checkout Pro vs. Checkout API, y por qué la preautorización de MP no alcanza

**Checkout Pro** —lo que usa el sistema hoy— es una **redirección**: se crea una
preferencia, el cliente se va al sitio de Mercado Pago, paga, y vuelve. El
formulario de tarjeta es de ellos.

**Checkout API** (o **Bricks**, su versión con componentes) deja el formulario
**en nuestro sitio**. Bricks tokeniza contra Mercado Pago, así que el número de
tarjeta no toca nuestro servidor.

| | Checkout Pro | Checkout API / Bricks |
|---|---|---|
| Dónde paga | En el sitio de MP | En nuestro sitio |
| Exposición a PCI | Ninguna | Baja con Bricks (tokeniza del lado de MP) |
| Control del diseño | Poco | Total |
| Reserva de fondos | No documentada | ✅ Documentada |
| Esfuerzo | **Ya está hecho** | Rehacer el paso 4 de la web |

### 🔴 Pero la reserva de MP no sirve como garantía de alquiler

La documentación de Mercado Pago es explícita en dos límites que la descartan
para este caso:

> *"El tiempo límite para realizar la captura del pago autorizado es de **5
> días** desde su creación. Si no la capturas hasta ese momento, será
> cancelado."*
>
> *"Actualmente, sólo es posible realizar una **captura del monto total** del
> pago reservado."*

Traducido a un alquiler:

- **5 días.** Un alquiler de una semana se queda sin garantía **antes de que el
  auto vuelva**. Justo cuando hace falta.
- **Sin captura parcial.** Si el auto vuelve con un daño de $200.000 y la
  retención era de $500.000, no se puede capturar sólo el daño: es todo o nada.
  Hay que cancelar y cobrar por otro lado.

**Conclusión, y corrige lo dicho antes:** migrar a Checkout API **por la
garantía no vale la pena**. Sirve si algún día se quiere controlar el diseño
del checkout, no para resolver la retención. Mercado Pago queda como muy buena
opción **para cobrar la seña**, que es para lo que ya está construido.

Los plazos largos y la captura parcial existen en las verticales *hotel* y
*rent-a-car* que definen las marcas de tarjeta, y se acceden **por el
acquirer** — que es exactamente lo que es Payway.

---

## 4. Las alternativas que valen la pena, en orden

### A · Payway (ex Decidir), el acquirer que ya tienen

Ubicar ya opera con Wapa, que corre sobre **Prisma** — y Payway *es* la pata de
ecommerce de Prisma. **Es la misma familia comercial.**

| A favor | En contra |
|---|---|
| **~2,2% con IVA en crédito** contra 7,85% de MP inmediato, y acredita en 8–18 días | Hay que escribir un adaptador nuevo desde cero |
| Es la vertical *rent-a-car*: **31 días de retención con Mastercard** | Ingresos Brutos es requisito de alta, y todavía no lo tienen |
| **Una sola relación comercial** con Prisma en vez de dos, y un solo extracto | Menos documentación pública y comunidad que MP |
| La actividad 771190 de FINAR ya es la del rubro: el MCC sale solo | El cliente no lo reconoce como marca: paga con su tarjeta y listo |
| Ya hay una puerta abierta: **el oficial de cuenta de Wapa** | Falta confirmar captura parcial |

**Es la opción más limpia**, y la primera que hay que preguntar porque no cuesta
nada averiguarlo. Detalle completo de alta, aranceles y plazos en **§4-bis**.
**Lo que hay que preguntar concretamente:**

> Somos alquiler de vehículos sin conductor (actividad 771190, MCC 7512).
> ¿Payway habilita preautorización con **captura parcial** y **autorización
> incremental** para extender la retención? ¿Qué arancel y qué plazo de
> acreditación nos corresponden por volumen?

### B · Mercado Pago para la seña, con acreditación a 35 días

Ya está construido y probado. Lo único que hay que decidir es **el plazo**, que
es donde está la plata:

| Plazo | Comisión con IVA | Sobre una seña de $150.000 |
|---|---|---|
| Al instante | 7,85% | $11.775 |
| **A 35 días** | **2,17%** | **$3.255** |

**La seña se cobra semanas antes del alquiler**, así que esperar 35 días
probablemente no moleste: a partir del segundo mes es un saldo que rota. El
único mes incómodo es el primero.

### C · MODO al lado, para la seña sin cuotas

MODO no reemplaza a nadie: **se suma**. Es la billetera de los bancos, con
comisión muy por debajo de Mercado Pago para pago contado.

La combinación que usa mucho comercio hoy: **MODO para el que paga de una,
Mercado Pago para el que quiere cuotas.** Si la seña es el 30% y buena parte de
la gente la paga de una, mueve la aguja.

No sirve para la garantía: no hace preautorización.

---

---

## 4-bis. Payway en concreto: alta, aranceles y la vertical rent-a-car

### ¿Puede FINAR abrir la cuenta? Sí, y con una ventaja

Payway da de alta comercios por **CUIT**, así que una S.R.L. entra sin
problema. Lo que piden:

| Requisito | Estado de FINAR |
|---|---|
| CUIT | ✅ 30-71756601-3 |
| Acta de designación de autoridades | ✅ Sociedad constituida el 01-04-2022 |
| Representante legal + DNI escaneado | ✅ |
| Poder o acta que lo autorice | ✅ |
| **Número de Ingresos Brutos** | ❌ **Es el dato que falta** |
| CBU donde acreditar los fondos | ✅ |

> 🔴 **Ingresos Brutos deja de ser un detalle fiscal pendiente y pasa a
> bloquear el alta.** Era el último dato que faltaba para el contrato; ahora
> también traba esto. Es lo primero que hay que pedirle a la contadora.

**La ventaja que ya tienen:** la actividad principal declarada en ARCA es
**771190 — Alquiler de vehículos automotores N.C.P., sin conductor ni
operarios**. Esa actividad es la que determina el **MCC** con el que el
adquirente los codifica, y el que corresponde es **7512 — Car rental
agencies**: exactamente la vertical que habilita las retenciones largas. No hay
que argumentarlo ni pedir una excepción, es su rubro registrado.

> ⚠️ **Un detalle práctico del alta.** El nombre de la sociedad es *Grupo
> Financiero*, y las entidades financieras son rubro de riesgo alto para
> cualquier adquirente. Conviene **presentar el alta por la actividad 771190 y
> con la constancia de ARCA a la vista**, para que el análisis de riesgo no
> arranque leyendo "financiera" en la razón social. Es un trámite más rápido si
> el rubro queda claro desde el primer mail.

### Los aranceles: la diferencia entre agregador y adquirente

Acá está la razón de fondo por la que las rentadoras y los hoteles no usan
Mercado Pago:

|  | **Mercado Pago** (agregador) | **Payway** (adquirente) |
|---|---|---|
| Crédito | 6,49% + IVA inmediato · 1,79% + IVA a 35 días | **~1,8% + IVA**, acreditación 8–18 días |
| Débito | incluido en lo anterior | **~1% + IVA**, 24 hs hábiles |
| QR / dinero en cuenta | — | **0,8% + IVA** (0% los primeros 3 meses) |
| Adelantar el cobro | ya viene en el % | **0,63% por día adelantado**, se paga aparte |
| Contracargo | — | ~USD 2,75 + impuestos |

**Un agregador cobra todo junto**: procesamiento, gateway y adelanto de fondos
en un solo número. **Un adquirente lo desarma**: pagás ~1,8% por procesar y,
sólo si querés la plata antes, pagás el adelanto por separado.

Por eso el 6,49% de Mercado Pago no es "caro": es 1,8% de procesamiento más
~4,7% de adelantarte 35 días. **Si no necesitás la plata mañana, estás pagando
por algo que no usás.**

### La cuenta, lado a lado

Seña de $150.000, con IVA incluido:

| | Comisión | Cuándo cobrás |
|---|---|---|
| Mercado Pago inmediato | $11.775 (7,85%) | al instante |
| Mercado Pago a 35 días | $3.249 (2,17%) | 35 días |
| **Payway crédito** | **$3.267 (2,18%)** | **8–18 días** |

**Cuestan prácticamente lo mismo, pero Payway te paga entre dos y cuatro
semanas antes** — y además trae la preautorización. Ésa es toda la diferencia.

### Los plazos de retención, que es lo que se venía a buscar

Acá está el número concreto de la vertical, y **depende de la marca de la
tarjeta, no del adquirente**:

| Marca | Ventana de retención |
|---|---|
| **Mastercard**, rubro alquiler de vehículos (MCC 7512) | **31 días** |
| **Visa**, ventana por defecto | **7 días** |

Traducido a la operación:

- Con **Mastercard**, la garantía cubre hasta un alquiler de un mes completo.
- Con **Visa**, cubre una semana. Para un alquiler más largo hay que
  **reautorizar** antes de que venza, o pedirle al cliente una Mastercard.

Contra los **5 días sin captura parcial** de Mercado Pago, es otra categoría.

**Lo que todavía no pude confirmar** y hay que preguntar: si Payway habilita
**captura parcial** (cobrar sólo el daño y liberar el resto) y **autorización
incremental** (extender la retención cuando el alquiler se alarga). Las marcas
las contemplan para este rubro; falta saber si Payway las expone en su API.

---

## 5. Stripe, y qué usan "las plataformas"

### Stripe no se puede usar

**No es que cobre caro: no opera en Argentina.** En toda Latinoamérica, Stripe
sólo admite comercios en México. No hay forma de cobrarle en pesos a una
tarjeta argentina.

El rodeo que circula —abrir una LLC en Estados Unidos— cobra **en dólares a
tarjetas internacionales**, a ~2,9% + US$0,30. Para Ubicar no sirve: los
clientes son locales, pagan en pesos y con tarjeta argentina.

Lo mismo vale para **PayPal**: sin adquirencia local.

### Qué usan las plataformas grandes

Es una pregunta con trampa, porque hay dos mundos:

- **Booking, Airbnb, Hertz global** usan **Adyen, Stripe o Braintree**. Pero
  cobran desde afuera del país o a través de una entidad local propia, con
  volúmenes que les consiguen aranceles negociados. Nada de eso es replicable
  para una PyME argentina.
- **Las rentadoras y hoteles que operan en Argentina** cobran a través del
  **acquirer**: Prisma/Payway, Fiserv/Posnet, Getnet. **Ahí es donde vive la
  preautorización con plazos largos**, porque son las verticales *hotel* y
  *rent-a-car* que definen las marcas de tarjeta.

Ésa es la razón de fondo por la que Payway es la respuesta acá, y no una
preferencia de marca: **no es una pasarela más barata, es la capa donde existe
la función que hace falta.**

### Las otras apps

- **Ualá Bis, Naranja X, Cuenta DNI** — links de pago y QR desde una app. Igual
  que Wapa: sin API ni webhook, no confirman una reserva solas.
- **MODO** — sí tiene botón de pago para ecommerce y es lo más barato para
  contado, pero no hace preautorización.
- **Links de pago sueltos** de cualquier billetera — no hay forma de atar el
  pago a una reserva.

---

## 6. La recomendación

### Para cobrar, hoy, sin construir nada

| | Canal | Comisión con IVA |
|---|---|---|
| **Seña (30%)** | Mercado Pago, **acreditación a 35 días** | 2,17% |
| **Saldo (70%)** | **QR** en el mostrador (Wapa o MODO) | ~0,8% |

Sobre un alquiler de $500.000:

| Cómo se cobra | Comisión |
|---|---|
| Todo por Mercado Pago al instante | **$39.250** (7,85%) |
| Seña MP al instante + saldo con QR | $14.575 (2,9%) |
| **Seña MP a 35 días + saldo con QR** | **$6.055 (1,2%)** |

**Seis veces más barato que la opción por defecto**, sin cambiar una línea de
código: son dos decisiones de configuración y una instrucción de mostrador
("cobrale con el QR, no con la tarjeta").

### Y en paralelo: abrir la cuenta en Payway

Para la **garantía**, Mercado Pago no sirve (5 días, sin captura parcial).
Payway sí: **31 días con Mastercard** en el rubro alquiler.

Y para **cobrar**, resulta que también conviene: ~2,2% con IVA acreditando en
8–18 días, contra 2,17% de Mercado Pago acreditando a 35. **Cuesta lo mismo y
cobrás entre dos y cuatro semanas antes.**

Los tres pasos, en orden:

1. **Pedirle Ingresos Brutos a la contadora.** Es requisito del alta y es el
   mismo dato que falta para el contrato. Bloquea todo lo demás.
2. **Hablar con el oficial de cuenta de Wapa**, presentando el alta por la
   actividad 771190 y con la constancia de ARCA a la vista.
3. Si sale, escribir el adaptador. La interfaz `IPasarelaPago` ya existe y
   Mercado Pago ya la implementa: **es agregar una clase y cambiar
   `PAGOS_PROVIDER`**. Esa abstracción se hizo justamente para esto.

Mientras tanto, Mercado Pago a 35 días + QR en el mostrador ya baja la comisión
de 7,85% a 1,2% sin construir nada.

> ⚠️ Corrige lo dicho en una versión anterior de este documento, que daba por
> hecho que migrar a Checkout API resolvía la garantía. No la resuelve.

## Fuentes

- [Reservar, capturar y cancelar fondos — Mercado Pago Developers](https://www.mercadopago.com.ar/developers/es/docs/checkout-api-v2/payment-management/reserve-capture-cancel)
- [SDK de Payway (Decidir) para venta online](https://github.com/payway-ar/sdk-java-ventaonline)
- [Planes y precios de Payway](https://www.payway.com.ar/planes-precios)
- [Comisiones de pasarelas de pago en Argentina 2026](https://talo.com.ar/blogs/comisiones-pasarelas-de-pago)
- [Aranceles y costos de cobro — Getnet Argentina](https://www.getnet.com.ar/comisiones-por-ventas)
- [PCI DSS v3.2 — Requisito 3: no almacenar datos de autenticación sensibles](https://listings.pcisecuritystandards.org/documents/PCI_DSS_v3-2es-LA.pdf)

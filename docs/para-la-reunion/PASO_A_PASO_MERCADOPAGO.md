# Mercado Pago — paso a paso para dejarlo andando

> Para hacer de una sentada. Al final hay una lista de lo que tenés que
> traerte: son **cuatro datos**.
>
> El código ya está construido. Esto es sólo sacar credenciales y configurar
> el aviso de pagos.
>
> **Revisado el 14/08 contra el código y contra el backend andando.** Tres
> correcciones respecto de la versión anterior: la clave secreta del webhook
> **no hace falta** (no hay dónde cargarla), aparecieron **cuatro variables de
> entorno más** que sí son obligatorias, y se agregó cómo verificar que el
> webhook llegó de verdad — porque el panel de Mercado Pago muestra todo en
> verde aunque no esté funcionando.

---

## Antes de empezar

Necesitás la cuenta de Mercado Pago **de la empresa** (la que va a recibir la
plata), no una personal. Si Franco o Martín ya tienen una cuenta de MP donde
cobran, es esa.

---

## 1. Crear la aplicación

1. Entrá a **mercadopago.com.ar/developers** con la cuenta de la empresa
2. Arriba a la derecha: **Tus integraciones**
3. Botón **Crear aplicación**
4. Completá:
   - **Nombre**: `Ubicar Rent — Reservas web`
   - **¿Qué producto estás integrando?** → **Pagos online**
   - **¿Estás usando una plataforma de e-commerce?** → **No**
   - **¿Qué tipo de solución?** → **Checkout Pro**
5. **Crear aplicación**

> **Por qué Checkout Pro y no otro**: es el que redirige al cliente a la
> pantalla de Mercado Pago para pagar. No pasamos datos de tarjeta por nuestro
> sistema, así que no nos aplica ninguna certificación de seguridad de tarjetas.
> Es la opción correcta para este caso.

---

## 2. Sacar las credenciales de PRUEBA

Con estas se prueba todo sin mover un peso real.

1. Dentro de la aplicación → menú izquierdo → **Credenciales de prueba**
2. Copiá el **Access Token**. Empieza con `TEST-`

📋 **DATO 1 — Access Token de prueba** (`TEST-...`)

---

## 3. Sacar las credenciales de PRODUCCIÓN

Con estas se cobra de verdad.

1. Menú izquierdo → **Credenciales de producción**
2. Puede pedirte **completar los datos de la empresa** antes de mostrarlas:
   razón social, CUIT, rubro, domicilio. Completalo — es un trámite de una vez
3. Copiá el **Access Token**. Empieza con `APP_USR-`

📋 **DATO 2 — Access Token de producción** (`APP_USR-...`)

> ⚠️ Si te pide una **verificación de identidad** o queda "en revisión", puede
> tardar. No frena nada: se arranca con las de prueba y se cambia después. Es
> un solo cambio de variable, sin tocar código.

---

## 4. Crear los usuarios de prueba

Para probar una compra completa hacen falta dos cuentas falsas: una que vende
y otra que compra. **No se puede probar comprándose a uno mismo.**

1. Menú izquierdo → **Cuentas de prueba** (o **Usuarios de prueba**)
2. **Crear cuenta de prueba** → tipo **Vendedor** → país Argentina
3. **Crear cuenta de prueba** → tipo **Comprador** → país Argentina → poné un
   saldo, por ejemplo 500000
4. Anotá usuario y contraseña de las dos

📋 **DATO 3 — usuario y contraseña de la cuenta compradora de prueba**

---

## 5. Configurar el aviso de pagos (webhook)

**Este es el paso más importante y el que más se olvida.** Es cómo Mercado Pago
le avisa al sistema que un pago entró.

Sin esto: el cliente paga, la plata entra a la cuenta, y **la reserva nunca se
confirma**. El auto se libera solo y nadie se entera.

1. Dentro de la aplicación → menú izquierdo → **Webhooks** (o
   **Notificaciones** → **Webhooks**)
2. **Configurar notificaciones**
3. En **URL de producción** poné **esta, tal cual, copiada y pegada**:

   ```
   https://ubicar-system-production.up.railway.app/api/v1/public/webhooks/mercadopago
   ```

   > **Esa dirección ya está andando** — verificado el 14/08 mandándole un POST
   > de prueba: responde 200. Cuando conectemos `api.ubicar-rent.com.ar` cambia
   > por `https://api.ubicar-rent.com.ar/...`, y hay que **actualizarla acá en
   > Mercado Pago Y en la variable `BACKEND_PUBLIC_URL` del servidor**. Si se
   > cambia una sola de las dos, se rompe.
   >
   > **Fijate que termine en `/api/v1/public/webhooks/mercadopago`** — sin el
   > `/api/v1` Mercado Pago recibe un 404 en cada aviso y **ninguna reserva se
   > confirma nunca**. Y falla en silencio, así que no te vas a enterar.

4. En **Eventos**, tildá únicamente: **Pagos** (`payment`)
5. **Guardar**

> **Si Mercado Pago te muestra una "clave secreta" o "firma secreta" al
> guardar: copiala y guardala, pero no hace falta traérmela.** El sistema no la
> usa. Se verificó en el código: no hay ninguna variable donde cargarla.
>
> No es un descuido. El webhook **descarta casi todo lo que Mercado Pago le
> manda**: sólo saca el número de pago, y después **vuelve a consultarle a
> Mercado Pago** cuánto se pagó y si está aprobado, usando nuestro token. O sea
> que aunque alguien invente un aviso falso, no consigue confirmar nada: el
> monto y el estado salen de la consulta, no del aviso.

---

## 6. Revisar la configuración de cobro

Menú izquierdo → **Preferencias de cobro** o **Configuración**:

- **Cuotas**: definí hasta cuántas aceptan. Ojo: **las cuotas las paga el
  vendedor**, o sea que cuantas más cuotas, menos plata les queda. Es una
  decisión de Franco y Martín, no técnica
- **Medios de pago**: **conviene excluir el efectivo** (Rapipago, Pago Fácil).
  No es una preferencia: un pago en efectivo se acredita dos o tres días
  después, y mientras tanto **la reserva se queda esperando y el auto se
  libera solo** a los 20 minutos. El cliente termina pagando por un auto que
  ya no está reservado.

📋 **DATO 4 — cuántas cuotas aceptan y si excluyen algún medio de pago**

---

## Lo que tenés que traerte

| # | Qué | Cómo empieza |
|---|---|---|
| 1 | Access Token de **prueba** | `TEST-...` |
| 2 | Access Token de **producción** | `APP_USR-...` |
| 3 | Usuario y contraseña de la cuenta **compradora** de prueba | |
| 4 | Cuántas **cuotas** aceptan y qué medios excluyen | |

> **La public key no hace falta.** El panel te la va a mostrar al lado del
> token y es fácil pensar que falta cargarla. Con Checkout Pro el navegador
> nunca habla con Mercado Pago —sólo se lo redirige—, así que no se usa.

> ⚠️ Los tokens son **como una contraseña de la cuenta bancaria**: quien los
> tiene puede cobrar y ver todos los movimientos. No los mandes por WhatsApp ni
> los pegues en un chat. Lo mejor: cargalos vos directamente en el archivo de
> configuración y avisame que ya están.

---

## Lo que hago yo después

1. Cargo los tokens y paso `PAGOS_PROVIDER` a `mercadopago`
2. Pruebo una reserva completa con la cuenta compradora de prueba: elegir auto,
   pagar, y confirmar que la reserva queda confirmada y el asiento entra en la
   cuenta corriente
3. Reviso los casos feos: pago rechazado, pago que entra dos veces, y pago que
   se acredita cuando ya no queda auto
4. Recién ahí pasamos a las credenciales de producción

---

## Las variables del servidor (parte técnica — para Gael)

En **Railway**, servicio del backend. Las cinco son obligatorias:

```bash
PAGOS_PROVIDER=mercadopago
MERCADOPAGO_ACCESS_TOKEN=TEST-...          # APP_USR-... en producción
MERCADOPAGO_SANDBOX=true                   # false cuando pase a APP_USR-
BACKEND_PUBLIC_URL=https://ubicar-system-production.up.railway.app
WEB_URL=https://ubicar-rent.com.ar
```

⚠️ **`WEB_URL` es la que se olvida.** No estaba en `railway.toml` ni en la
guía de deploy, y su valor por defecto es `localhost:3200`. De ahí salen las
direcciones de retorno de la preferencia de pago, y **Mercado Pago rechaza una
preferencia que apunte a localhost**: el botón de pagar tira error y ni se
llega al checkout. Verificala **antes** que ninguna otra cosa.

**En Vercel no hay que cargar nada de Mercado Pago.** La web pública nunca
habla con MP: le pregunta al backend si el cobro está habilitado y con eso
decide qué mostrar.

**El interruptor** que enciende el cobro son dos variables juntas:
`PAGOS_PROVIDER=mercadopago` **y** el token cargado. Con eso,
`/api/v1/public/config` empieza a devolver `"cobro_online": true` y la web
muestra la tarjeta de Mercado Pago. Para apagarlo de urgencia: vaciar el
token en Railway — la web vuelve sola a transferencia, sin necesidad de
deploy.

---

## Cómo saber si el webhook llegó de verdad

**El panel de Mercado Pago te va a mostrar todo en verde aunque nada esté
funcionando.** No es un error del panel: el webhook siempre responde 200 a
propósito, porque un error haría que Mercado Pago reintente en bucle durante
horas. Pero eso significa que **el panel no sirve para diagnosticar**.

La verdad está en la tabla `pagos_web`:

```sql
SELECT id, reserva_id, payment_id, monto, estado, detalle, procesado_en
FROM pagos_web ORDER BY id DESC LIMIT 5;
```

| Lo que ves | Qué significa |
|---|---|
| `estado='iniciado'`, `procesado_en` vacío | **El webhook no llegó.** Revisá la URL en el panel de MP |
| `estado='aprobado'`, con `payment_id` y fecha | Funcionó |
| `estado='revision'` | Llegó, pero algo no cerró. La columna `detalle` dice qué |

Después de un pago aprobado tiene que haber pasado todo esto: la reserva pasó
a **confirmada**, se creó el cobro con medio `mercado_pago`, entró **un** solo
asiento en la cuenta corriente, saltó la campana y salieron los mails.

**Si el cliente pagó y la reserva no se confirmó**, el aviso se puede reenviar
desde el panel de Mercado Pago, o a mano si tenés el número de pago:

```bash
curl -X POST https://ubicar-system-production.up.railway.app/api/v1/public/webhooks/mercadopago \
  -H "Content-Type: application/json" \
  -d '{"type":"payment","data":{"id":"EL_NUMERO_DE_PAGO"}}'
```

Es seguro repetirlo las veces que haga falta: el sistema no genera dos
asientos por el mismo pago, aunque el aviso llegue diez veces.

En los logs de Railway, buscá `[MercadoPago]`: ahí sale si llegó un aviso de
un pago que no es nuestro, si el monto no coincidió, o el error completo.

---

## Preguntas que van a aparecer

**¿Cuánto cobra Mercado Pago?** Alrededor del 6% + IVA por cobro con
acreditación inmediata, menos si aceptan esperar unos días. Está en
**Costos** dentro del panel. Es plata que se va de cada reserva: vale que
Franco y Martín lo miren antes de decidir cuánto se cobra por adelantado.

**¿Cuándo llega la plata?** Depende de lo que elijan en **Costos**: al
instante (más comisión) o a 10/18 días (menos).

**¿Y si hay que devolver una plata?** Se hace desde el panel de Mercado Pago.
El sistema **no devuelve nada solo, a propósito**: una devolución automática
ante un problema que puede ser un error nuestro es peor que una llamada. Queda
marcada para que una persona la resuelva.

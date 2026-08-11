# Mercado Pago — paso a paso para dejarlo andando

> Para hacer de una sentada. Al final hay una lista de lo que tenés que
> traerte: son **cinco datos**.
>
> El código ya está construido y probado. Esto es sólo sacar credenciales y
> configurar el aviso de pagos.

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

   > La dirección del backend te la paso yo cuando esté desplegado en Railway.
   > Va a ser algo tipo `https://ubicar-backend-production.up.railway.app`.
   > **Esa direccion ya esta andando** (verificado el 11/08: responde 200). Es la
> del ambiente de prueba; cuando conectemos `ubicar-rent.com.ar` cambia por
> `https://api.ubicar-rent.com.ar/...` y **hay que actualizarla aca en Mercado
> Pago tambien**, o los pagos dejan de confirmarse.
>
> **Fijate que termine en `/api/v1/public/webhooks/mercadopago`** — sin el
   > `/api/v1` no funciona.

4. En **Eventos**, tildá únicamente: **Pagos** (`payment`)
5. **Guardar**
6. Mercado Pago te va a mostrar una **clave secreta** (*firma secreta* o
   *secret*). Copiala

📋 **DATO 4 — la clave secreta del webhook**

> Si todavía no tenemos la dirección del backend, salteá este paso y volvé
> cuando esté. Es lo único que depende del deploy.

---

## 6. Revisar la configuración de cobro

Menú izquierdo → **Preferencias de cobro** o **Configuración**:

- **Cuotas**: definí hasta cuántas aceptan. Ojo: **las cuotas las paga el
  vendedor**, o sea que cuantas más cuotas, menos plata les queda. Es una
  decisión de Franco y Martín, no técnica
- **Medios de pago**: si quieren excluir alguno (por ejemplo, pago en efectivo
  en Rapipago, que tarda días en acreditar y no sirve para una reserva)

📋 **DATO 5 — cuántas cuotas aceptan y si excluyen algún medio de pago**

---

## Lo que tenés que traerte

| # | Qué | Cómo empieza |
|---|---|---|
| 1 | Access Token de **prueba** | `TEST-...` |
| 2 | Access Token de **producción** | `APP_USR-...` |
| 3 | Usuario y contraseña de la cuenta **compradora** de prueba | |
| 4 | Clave secreta del **webhook** | |
| 5 | Cuántas **cuotas** aceptan | |

> ⚠️ Los tokens son **como una contraseña de la cuenta bancaria**: quien los
> tiene puede cobrar y ver todos los movimientos. No los mandes por WhatsApp ni
> los pegues en un chat. Lo mejor: cargalos vos directamente en el archivo de
> configuración y avisame que ya están.

---

## Lo que hago yo después

1. Cargo los tokens y paso `PAGOS_PROVIDER` a `mercadopago`
2. Verifico la firma del webhook con esa clave secreta, para que nadie más
   pueda avisarnos pagos falsos
3. Pruebo una reserva completa con la cuenta compradora de prueba: elegir auto,
   pagar, y confirmar que la reserva queda confirmada y el asiento entra en la
   cuenta corriente
4. Reviso los casos feos: pago rechazado, pago que entra dos veces, y pago que
   se acredita cuando ya no queda auto
5. Recién ahí pasamos a las credenciales de producción

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

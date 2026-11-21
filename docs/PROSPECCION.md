# Prospección: campañas de mail a empresas

Cómo dejar andando el envío de campañas desde **Prospectos** (pestañas Empresas,
Campañas y Casillas). Esto se hace **una sola vez**. Después, mandar una campaña
es: **Nueva campaña** → elegir a quiénes → revisar el mensaje → **Enviar**.

> **Por qué un subdominio.** Las campañas salen de casillas como
> `franco@empresas.ubicar-rent.com.ar`, **nunca** de `@ubicar-rent.com.ar`. De la
> raíz salen las confirmaciones de reserva y los mails a clientes; si una campaña
> en frío cae en spam, Gmail castiga al dominio que la mandó. Con un subdominio,
> el daño queda ahí. El sistema rechaza una casilla en la raíz.

---

## Paso a paso (Gael, una vez)

### 1. Elegir el subdominio
Usá **`empresas.ubicar-rent.com.ar`**. No hay que crear nada en el hosting: sólo
existe para el mail.

### 2. API key de Resend
En <https://resend.com/api-keys> → **Create API Key** → permiso **Full access**
(no "Sending access"). Con *Full access* la pestaña Casillas crea el subdominio
y verifica los registros sola. Con una de sólo-envío la pantalla pasa a **modo
manual** (te muestra los pasos y un botón "Ya está verificado").

### 3. Variables en Railway
Proyecto `ubicar-system` → servicio del backend → **Variables**:

| Variable | Valor | ¿Obligatoria? |
|---|---|---|
| `PROSPECCION_WEBHOOK_SECRET` | el `whsec_…` del paso 5 | **Sí** (sin esto no se ven rebotes, quejas ni respuestas y el freno queda ciego) |
| `PROSPECCION_SECRETO` | un texto largo al azar (`openssl rand -hex 32` en la Terminal) | Recomendada. **Fijarla una vez**: cambiarla rompe los links de baja de lo ya enviado |
| `PROSPECCION_RESEND_API_KEY` | la key del paso 2 | Sólo si `RESEND_API_KEY` no es de *Full access* |
| `BACKEND_PUBLIC_URL` | `https://ubicar-system-production.up.railway.app` | **Sí** (ya debería estar, la usa Mercado Pago). Sin esto no se manda nada: el link de baja no andaría |
| `PROSPECCION_SOLO_A` | tu mail | Para la primera prueba (paso 7). **Después vaciarla** |
| `PROSPECCION_FIRMA_NOMBRE` | `Franco` | Opcional: la firma que se propone |
| `PROSPECCION_FIRMA_TELEFONO` | `291 418-0554` | Opcional (es el default) |
| `PROSPECCION_TOPE_DIARIO` | `150` | Opcional (es el default) |
| `PROSPECCION_DOMINIO_RAIZ` | `ubicar-rent.com.ar` | Opcional: se deduce de `FROM_EMAIL` |
| `PROSPECCION_RESEND_REGION` | `sa-east-1` | Opcional (São Paulo, el default) |
| `PROSPECCION_DMARC_REPORTES` | un mail | Opcional: adónde llegan los reportes DMARC |

Desde la Mac: `cd ~/Developer/2-productos/ubicar-system && direnv exec . railway variables --set "PROSPECCION_SECRETO=…"`.

### 4. Crear la primera casilla y el subdominio
En el sistema: **Prospectos → Casillas → Agregar casilla**.
- Dirección: `franco@empresas.ubicar-rent.com.ar`
- Nombre visible: `Franco de Ubicar Rent`
- Adónde llegan las respuestas: **un mail que alguien lea todos los días**
  (la casilla del subdominio no tiene bandeja propia salvo que actives
  *Receiving* en Resend, ver paso 5).
- Máximo por día: `30`.

Abajo aparece la ficha de `empresas.ubicar-rent.com.ar`: tocá **Crear el
subdominio** (modo manual: crealo vos en <https://resend.com/domains> → *Add
Domain* → región São Paulo).

La ficha lista los registros DNS, cada uno con **tipo / nombre / valor**, botón
de copiar y su estado. Son estos (los valores exactos salen en la pantalla):

| Para qué | Tipo | Nombre | Valor |
|---|---|---|---|
| SPF (rebotes) | MX, prioridad 10 | `send.empresas` | `feedback-smtp.sa-east-1.amazonses.com` |
| SPF | TXT | `send.empresas` | `v=spf1 include:amazonses.com ~all` |
| DKIM | TXT | `resend._domainkey.empresas` | la clave larga que da Resend (es única) |
| DMARC (recomendado) | TXT | `_dmarc.empresas` | `v=DMARC1; p=none; rua=mailto:…` |

Cargalos donde está el DNS de `ubicar-rent.com.ar` (NIC Argentina delega al
proveedor que tenga el dominio: ahí se agregan). El **nombre** va tal cual sale
en la pantalla (relativo a `ubicar-rent.com.ar`); si el panel del proveedor pide
el nombre completo, pasá el mouse sobre el nombre en la ficha y lo muestra.

Tardan de minutos a unas horas. Tocá **Verificar ahora** hasta que todo esté en
verde; la casilla pasa sola a **Mandando**. En modo manual, cuando Resend lo
muestre verificado, tocá **Ya está verificado** en la casilla.

### 5. Webhook de Resend
<https://resend.com/webhooks> → **Add Endpoint**:
- **URL:** `https://ubicar-system-production.up.railway.app/api/v1/public/webhooks/resend-prospeccion`
- **Eventos:** `email.delivered`, `email.bounced`, `email.complained` y, si
  activaste *Receiving* para el subdominio, `email.received` (así una respuesta
  frena los seguimientos sola; si no, se marca a mano con **Marcar que
  respondió** en la campaña).
- Copiá el **Signing Secret** (`whsec_…`) a `PROSPECCION_WEBHOOK_SECRET` (paso 3).

El webhook es de toda la cuenta: también le llegan los eventos de los mails a
clientes. Los ignora sin problema.

### 6. Más casillas (opcional)
Con dos o tres casillas en el mismo subdominio (`franco@`, `ventas@`…) se reparte
el volumen: cada mail sale de la que menos mandó ese día.

### 7. La prueba
1. Con `PROSPECCION_SOLO_A=tu@mail` cargada, armá una campaña chica (**Nueva
   campaña**) y tocá **Enviarme una prueba**: te llega tal cual le llegaría a la
   empresa de la vista previa.
2. Revisá que no caiga en spam, que la firma esté bien y que el link de baja
   abra la página (el de la prueba no da de baja a nadie).
3. Si querés probar de punta a punta, mandá la campaña: sólo te sale a vos; al
   resto queda registrado como "de prueba".
4. Todo bien → **vaciá `PROSPECCION_SOLO_A`**. Desde ahí sale en serio.

---

## Límites y frenos (ya programados)

| Qué | Número | Por qué |
|---|---|---|
| Rampa de una casilla nueva | **15/día** la 1.ª semana, **25/día** la 2.ª, desde la 3.ª su límite (**30** por defecto) | Un dominio nuevo que manda de a cientos se ve como spammer |
| Tope entre todas las casillas | **150/día** (`PROSPECCION_TOPE_DIARIO`) | Techo general |
| Horario | Lunes a viernes, **9 a 13 y 15 a 18** (hora argentina) | Que llegue cuando alguien está en la oficina |
| Entre dos mails de la misma casilla | **90 a 240 segundos**, al azar | Una persona no manda 30 mails en el mismo segundo |
| Motor | Una vuelta cada **2 minutos** | — |
| Freno por queja | **1 queja de spam** pausa la casilla | Es la señal más cara |
| Freno por rebotes | Más de **3 %** de rebotes duros (con 30+ envíos) o **3 rebotes** (con menos), sobre los últimos **100** envíos | Resend suspende la cuenta al 4 % |
| Seguimientos | A los **5** y a los **12** días | Se cortan si rebotó, respondió o se dio de baja |
| Volver a escribirle en frío | No antes de **30 días** desde la última campaña | — |
| Baja | Link en el pie de cada mail; también un "no me escriban más" respondido | Queda en `no_contactar` y **ninguna importación lo revive** |

Una casilla frenada aparece **Pausada** con el motivo; se reactiva desde la
pestaña Casillas después de mirar qué pasó (lista vieja, mails mal escritos…).

## Importar empresas
**Empresas → Importar archivo** acepta:
- El `.json` del sincronizador o una lista investigada:
  `{"prospectos":[{"ref_externa","nombre","segmento","ciudad","direccion","telefono","email","website","instagram","score","notas","fuente"}]}`
  (`fuente` se guarda al final de la nota interna; nunca va en un mail).
- Un `.csv` de planilla (separado por `,` o `;`), con columnas como *Empresa,
  Mail, Teléfono, Web, Rubro, Ciudad, Notas*.

Antes de guardar muestra cuántas son **nuevas**, cuántas **ya estaban** y cuántas
**no entran**. Una empresa que ya estaba (mismo `ref_externa`, mail, teléfono o
dominio propio) se completa: nunca se pisa un dato con vacío ni se le vuelve a
escribir a quien pidió la baja.

# Qué falta — 11/08/2026

Reemplaza a `PENDIENTES_REUNION.md`, que quedó del 29/07.

> **Estamos en ambiente de prueba.** El dominio `ubicar-rent.com.ar` se conecta
> **la semana que viene**, cuando terminemos de probar. Hasta entonces:
>
> - **Sistema:** `virtuous-communication-production-7f1e.up.railway.app`
> - **Web:** `ubicar-system.vercel.app`
> - **API:** `ubicar-system-production.up.railway.app`
>
> ⚠️ `ubicar-rent.com.ar` hoy sirve el **sitio viejo**. No probar ahí.

---

## 🔴 Bloquea vender

| | Qué | Quién | Consecuencia |
|---|---|---|---|
| 1 | **Los precios reales por categoría** | Franco y Martín | Hoy cotiza con una tarifa de demostración de $85.000 |
| 2 | **Credenciales de Mercado Pago** | Ellos + Gael | La web no cobra con tarjeta |
| 3 | **Verificar el dominio en Resend** | Necesita el DNS | A ningún cliente le llega un mail |
| 4 | **Autos para SUV y Furgón** | Ellos | Esas dos categorías no se pueden vender |

## 🟠 Importante

| | Qué |
|---|---|
| 5 | **Rotar el token de Meta** — está vacío y el viejo fue público. Sin él se pierde la mitad de la medición |
| 6 | **Marcar las conversiones** en GA4 y Meta, o se registran pero no optimizan |
| 7 | **Achicar el token de Cloudflare** a sólo el bucket, y rotar la clave (viajó por chat) |
| 8 | **Backups de Postgres**: activarlos **y probar una restauración** |
| 9 | **Fotos reales** de las categorías — hoy son de demostración |

## 🟡 Para la semana que viene, con el dominio

10. Sacar `ubicar-rent.com.ar` del proyecto viejo de Vercel y ponerlo en el nuevo.
11. Decidir **apex o `www`**. Recomendación: `www` — el apex sólo admite un
    registro A con IP fija; `www` es un CNAME que sigue solo al hosting.
12. **Clerk a producción**: claves `pk_live`, CNAMEs, y volver a cargar los IDs
    de usuario — **no se migran entre instancias**, y con los viejos nadie entra.
13. Actualizar `WEB_URL` y `LANDING_URL` en Railway al dominio definitivo.

---

## Mercado Pago — paso a paso

Se hace de una sentada, con la cuenta de la empresa abierta.

1. **mercadopago.com.ar → Tu negocio → Configuración → Credenciales.**
2. Copiar de **Credenciales de producción**:
   - `Public Key` (empieza con `APP_USR-`)
   - `Access Token` (empieza con `APP_USR-`)
3. **Webhooks / Notificaciones** → *Configurar notificaciones* → pegar:
   ```
   https://ubicar-system-production.up.railway.app/api/v1/public/webhooks/mercadopago
   ```
   Evento: **Pagos**. Guardar y copiar la **clave secreta** que genera.
4. Pasarme esos **tres datos** y los cargo en Railway.

> **El webhook es el paso que más se olvida y sin él el sistema no funciona:**
> el cliente paga, vuelve al sitio, y la reserva nunca se confirma. Mercado Pago
> avisa por ahí, no por el navegador.

**Dos decisiones de negocio que van a aparecer:**

- **¿Cuántas cuotas?** Las paga el vendedor: cuantas más ofrecés, menos te queda.
- **¿Cuándo querés la plata?** Al instante con ~6% + IVA, o a 10/18 días con
  menos. Recomendación: **a 35 días**, y cobrar el saldo en el mostrador con el
  QR de Wapa (0,80%). Sobre un alquiler de $500.000 son **$6.055 de comisión
  contra $39.250** si se cobra todo con tarjeta al instante.

---

## Decisiones importantes que se tomaron

Todas están en `DECISIONES.md` con el detalle. Las que más cambian el día a día:

| | |
|---|---|
| **D-49** | En la web, el **descuento por duración sólo corre pagando el 100%**. Con seña parcial se cobra el precio de lista. En el mostrador aplica siempre |
| **D-50** | Las reservas online piden **72 horas de anticipación** (eran 24) |
| **D-47** | El contrato se emite **al asignar el vehículo**, no al pagar: la web vende por categoría y un contrato sin patente no dice qué auto se entregó |
| **D-48** | Si se cambia el auto y el contrato ya estaba firmado, **se anula y el cliente firma de nuevo** |
| **D-44** | La **edad se pregunta en la portada** y el precio ya sale con el recargo adentro. Al cliente no se le muestra una línea que lo etiquete por su edad |
| **D-46** | El bucket público sirve **sólo las fotos del catálogo**. Contratos, firmas y documentos van con link que vence a la hora |
| **D-39** | **Sólo Bahía Blanca.** Capital Federal salió de la web y quedó únicamente como contacto |
| **D-11** | **La seña nunca se devuelve**, salvo que el que no pueda cumplir sea Ubicar |
| **D-C1** | El locador es **FINAR GRUPO FINANCIERO S.R.L.**, no "Ubicar Rent" |

---

## Lo que se resolvió hoy y ya no hay que traer

- ✅ **Cloudflare R2**: los archivos ya no se pierden en cada actualización
- ✅ **Ingresos Brutos**: cargado. FINAR es contribuyente directo de la
  Provincia, así que el número es el propio CUIT
- ✅ **Usuarios de Martín, Franco y Ramiro**: creados. La auditoría ya distingue
  quién hizo qué
- ✅ **Datos fiscales del contrato**: completos, ya no sale "PROVISORIO"

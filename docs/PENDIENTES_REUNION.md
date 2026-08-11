# Todo lo pendiente — 29 de julio de 2026

> Estado **verificado contra el sistema en producción** el 29/07 a la tarde, no
> escrito de memoria.
>
> **El sistema está en línea y funcionando.** Casi todo lo que sigue son datos
> que hay que cargar y decisiones que tomar, no programación pendiente.

---

## ✅ Lo que ya está funcionando en línea

| | Dónde / cuánto |
|---|---|
| **Backend** | `ubicar-system-production.up.railway.app` — responde OK |
| **Sistema interno** | `ubicar-system.vercel.app` — con login real de Clerk |
| **Base de datos** | Producción, **39 tablas**, migración `053` |
| **Flota** | **15 vehículos** activos, todos categorizados |
| **Categorías** | 6 |
| **Adicionales** | 4 (2 coberturas + 2 extras) |
| **Recargo por edad** | 1 franja cargada |
| **Fechas especiales** | **22 períodos** cargados en el calendario |
| **Fotos de catálogo** | Las 4 categorías principales |
| **Correo** | Resend conectado y enviando |
| **Auditoría** | Registrando (todavía sin movimientos: nadie operó en producción) |

La **web pública se muestra desde la computadora**, apuntando a estos mismos
datos reales. El flujo completo de reserva —los 4 pasos, con precio, seguros,
recargo por edad y resumen final— funciona de punta a punta.

---

# 🔴 1. Datos fiscales — bloquea los contratos

**Es lo más concreto de la reunión.** Verifiqué en producción: faltan
exactamente **cuatro datos**. Mientras falten, **cada contrato que se emita
sale con la leyenda "DOCUMENTO PROVISORIO"** impresa.

> ### ⚠️ Actualizado el 11/08 — de los cuatro, **falta uno solo**
>
> D-C1 se cerró el 09/08: el locador es **FINAR GRUPO FINANCIERO S.R.L.**, CUIT
> 30-71756601-3, Paraguay 241 Piso 9 Dpto A, Bahía Blanca. Salió de la constancia
> de ARCA. **Los contratos ya no salen marcados "PROVISORIO".**
>
> **Lo único que falta es Ingresos Brutos**, y no está en esa constancia porque
> es un impuesto **provincial**: lo emite ARBA. Como se opera sólo en Bahía
> Blanca (D-39), alcanza con el número provincial — no hace falta Convenio
> Multilateral. **Se lo pide la contadora.**

| Falta | Ejemplo de lo que necesitamos |
|---|---|
| ~~Razón social~~ | ✅ FINAR GRUPO FINANCIERO S.R.L. |
| ~~CUIT~~ | ✅ 30-71756601-3 |
| **Ingresos Brutos** | 🔴 Número de inscripción en **ARBA** |
| ~~Domicilio fiscal~~ | ✅ Paraguay 241, Piso 9, Dpto. A, Bahía Blanca |

> Ya están cargados: nombre del locador, localidad, jurisdicción, teléfonos y
> mail. Faltan sólo esos cuatro.

**Y una decisión de fondo (D-C1):** ¿el contrato va a nombre de **Ubicar Rent**
como empresa, o a nombre de una persona física? De eso depende qué se escribe
en esos campos.

---

# ✅ 2. La política de la seña — cerrada

**La seña nunca se devuelve.** Ni si el cliente cancela, ni si no se presenta.

Ya está así en las tres partes que tienen que decir lo mismo:

- **En los términos y condiciones de la web** (sección 4): *"El monto
  adelantado al reservar no se reintegra en caso de cancelación por parte del
  cliente ni si el cliente no se presenta a retirar el vehículo."*
- **En el sistema:** al cancelar una reserva con seña cargada, queda registrada
  como ingreso retenido en la cuenta corriente del cliente, con el motivo.
- **La excepción, que sí devuelve el 100%:** cuando el que no puede cumplir es
  Ubicar Rent. Ahí se ofrece otro vehículo sin costo o se reintegra todo.

No bloquea nada: se puede publicar la web con esta política tal como está.

---

# 🔴 3. Los precios reales — es lo que más falta

Verificado en producción: **hay 0 reglas de precio cargadas.** Por eso la
grilla del calendario muestra el mismo número todos los días — ese número sale
de una tarifa de demostración, que es el piso al que cae el sistema cuando
ninguna regla cubre el día.

**Hay 22 fechas especiales cargadas y ninguna tiene precio propio**, así que
hoy Navidad y un martes de marzo se cobran igual.

> ### Antes que nada: hay **dos capas** de precio, y se cargan en lugares distintos
>
> | | **La tarifa** | **La regla del calendario** |
> |---|---|---|
> | Qué es | El precio de siempre | La excepción para unas fechas |
> | Dónde | **Flota → Categorías** | **Precios de mostrador / de la web** |
> | Fechas | No tiene: vale todo el año | Sí, un desde y un hasta |
> | Canal | **Ninguno: vale para los dos** | Una pantalla por canal |
>
> El sistema resuelve día por día: si hay regla, manda la regla; si no, manda
> la tarifa. **La tarifa es el piso y las reglas son las excepciones.**

Lo que hay que cargar, **en este orden**:

1. **La tarifa real de cada categoría** (diaria, semanal, mensual) — en
   **Flota → Categorías**. Es lo que permite cotizar los 365 días por los dos
   canales, y es lo que más falta. Con la diaria sola ya se puede vender.
2. **Precio de las fechas especiales** — una regla por período, capa "Fecha
   especial". Se puede **heredar el rango** de las 22 ya cargadas.
3. **Precio propio de la web**, sólo si va a ser distinto al del mostrador.
4. **Descuentos por duración**, si los quieren (hoy hay 0).
5. **Franjas de recargo por edad** — hay 1 cargada, revisar si es la correcta.

> **Ojo:** cambiar la tarifa de una categoría cambia el precio **en la web y en
> el mostrador a la vez**. Para que sean distintos hace falta una regla de
> calendario en la pantalla del canal correspondiente.

**Falta además:** SUV y Furgón **no tienen autos asignados** — no aparecen con
disponibilidad, ni en el sistema ni en la web. Y no tienen foto.

---

# 🟠 4. Mercado Pago — para sacar en la reunión

El cobro online **está construido y probado**. Falta sacar las credenciales de
la cuenta de la empresa.

**Instructivo aparte: `PASO_A_PASO_MERCADOPAGO.md`** — cinco datos para
traerse, incluido el webhook, que es el paso que más se olvida y sin el cual
el cliente paga y la reserva nunca se confirma.

**Dos preguntas de negocio que van a aparecer ahí:**

- **¿Cuántas cuotas aceptan?** Las cuotas **las paga el vendedor**: cuantas más
  ofrecen, menos les queda de cada alquiler
- **¿Cuándo quieren la plata?** Al instante con más comisión (~6% + IVA), o a
  10/18 días con menos

Mientras no haya credenciales, el paso 4 de la web **cierra por WhatsApp** con
todo pre-cargado. No se simula un pago que no existe.

---

# 🟠 5. El correo del dominio

Para que a un cliente le llegue "tu reserva está confirmada", Resend necesita
verificar el dominio.

> **NO es crear casillas de correo ni pagar nada.** Son tres registros en la
> configuración del dominio. Si un cliente responde, esa respuesta se redirige
> al Gmail que ya usan.

**Hoy el sistema puede mandar mails sólo a la casilla de Ubicar.** A un cliente
real no le llega nada.

**Necesitamos:** acceso al panel donde está registrado `ubicar-rent.com.ar`, o
que alguien cargue tres registros que les pasamos.

---

# 🟡 6. Decisiones que se pueden dejar para después

| Pregunta | Si no se decide hoy |
|---|---|
| **¿Horarios de entrega y devolución?** ¿Sábados y domingos igual? ¿El aeropuerto tiene horario propio? ¿Se entrega fuera de hora con cargo? | Queda 24hs de anticipación y franja 08:00-20:00 |
| **¿Cuánto es la franquicia?** Y cuánto baja con cada cobertura | Queda sin mostrar en el contrato |
| **¿Descuento por pagar el 100% adelantado?** | Queda en 0%, sin descuento |
| **¿A qué casilla llega el aviso de reserva web?** | Cae a los destinatarios del resumen matutino |
| **¿Se alquila en Capital Federal por la web?** ¿Misma flota? | La web vende sólo Bahía Blanca |

Las cinco se cambian desde la pantalla de Configuración, sin tocar el sistema.

---

# 📋 7. Cómo saber cuándo está listo para vender

**No hay que acordarse de nada de esto.** El sistema lo reclama solo con los
avisos **"📌 Falta completar"** en la campana. Cuando esa lista quede vacía,
está listo.

Hoy esa lista tiene, entre otras cosas: las 22 fechas especiales sin precio,
las categorías sin tarifa, y los dos grupos sin autos asignados.

---

# ⚙️ 8. Lo técnico que queda (no depende de ellos)

| | Qué | Mientras tanto |
|---|---|---|
| ✅ | ~~**Almacenamiento de archivos**~~ — **resuelto el 11/08**: Cloudflare R2 activo en producción, bucket `ubicarrent` | Los archivos ya **no** se pierden. Ver `CIERRE_2026-08-11.md` §1 |
| 🟡 | **Publicar la web** | Se muestra desde la computadora |
| 🟡 | **Dominios propios** | Todo anda con direcciones de Vercel y Railway |
| 🟡 | **Usuarios de Franco, Martín y Ramiro** | Sólo está creado el de Gael. Se crean en dos minutos con sus mails — y hasta que existan, la auditoría no distingue quién hizo qué |
| 🟡 | **Rotar credenciales** | La clave de Resend y la de la base viajaron por chat; conviene rotarlas |
| 🟡 | **`extender()` sin asiento** | Extender una reserva no genera el débito de la diferencia |
| 🟡 | **Echeqs y garantías sin auditar** | El resto del sistema sí registra quién hizo qué |

---

# Resumen: qué traerse de la reunión

| | Qué | Bloquea |
|---|---|---|
| 1 | **Razón social, CUIT, Ingresos Brutos y domicilio fiscal** | Los contratos salen "provisorios" |
| 2 | **Los precios reales** — la **tarifa** de cada categoría primero, después las fechas especiales | Vender de verdad, por cualquier canal |
| 3 | **Credenciales de Mercado Pago** | Cobrar online |
| 4 | **Acceso al DNS del dominio** | Que los clientes reciban mails |
| 5 | **Mails de Franco, Martín y Ramiro** | Que puedan entrar, y que la auditoría diga quién fue |
| 6 | Autos para SUV y Furgón, y sus fotos | Que esas dos categorías se puedan vender |

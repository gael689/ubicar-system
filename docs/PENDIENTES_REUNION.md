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

| Falta | Ejemplo de lo que necesitamos |
|---|---|
| **Razón social** | El nombre exacto como figura en AFIP |
| **CUIT** | 30-XXXXXXXX-X |
| **Ingresos Brutos** | Número de inscripción |
| **Domicilio fiscal** | Calle, número, localidad |

> Ya están cargados: nombre del locador, localidad, jurisdicción, teléfonos y
> mail. Faltan sólo esos cuatro.

**Y una decisión de fondo (D-C1):** ¿el contrato va a nombre de **Ubicar Rent**
como empresa, o a nombre de una persona física? De eso depende qué se escribe
en esos campos.

---

# 🔴 2. La seña — bloquea publicar la web

Es la única decisión que impide publicar los términos y condiciones, y los
términos hay que publicarlos **antes** de cobrar el primer peso online.

Nos dijeron dos cosas que juntas no cierran:

- Que **al cancelar se retiene la seña**
- Que **la seña no se pierde si el cliente no aparece**

Combinadas, la política queda: **al que avisa se le retiene, al que no avisa se
le devuelve.** Eso premia el peor comportamiento. Y cuesta plata: **el auto que
se libera con 48 horas de aviso se revende; el que se libera porque nadie
apareció, no.**

**Recomendación:**

| Situación | Seña |
|---|---|
| Avisa con **más de 48 horas** | Se devuelve completa |
| Avisa con **menos de 48 horas** | Se retiene |
| **No avisa** | Se retiene |

---

# 🔴 3. Los precios reales — es lo que más falta

Verificado en producción: **hay 0 reglas de precio cargadas.** Por eso la
grilla del calendario muestra el mismo número todos los días — ese número sale
de una tarifa de demostración, que es el piso al que cae el sistema cuando
ninguna regla cubre el día.

**Hay 22 fechas especiales cargadas y ninguna tiene precio propio**, así que
hoy Navidad y un martes de marzo se cobran igual.

Lo que hay que cargar, en orden:

1. **Precio base por categoría** — una regla del 1/1 al 31/12, capa "Precio
   base". Con seis reglas la grilla deja de estar en rojo.
2. **Precio de las fechas especiales** — una regla por período, capa "Fecha
   especial". Se puede **heredar el rango** de las 22 ya cargadas.
3. **Descuentos por duración**, si los quieren (hoy hay 0).
4. **Franjas de recargo por edad** — hay 1 cargada, revisar si es la correcta.

> **Ahora son dos pantallas: "Precios de mostrador" y "Precios de la web".**
> Están separadas a propósito, para que cargar un precio pensando en un canal
> no le cambie el precio al otro. Si el precio es el mismo, se carga una vez
> eligiendo "Los dos canales".

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
| 🟠 | **Almacenamiento de archivos** — falta el bucket. Cloudflare pide tarjeta | Los documentos y fotos subidos **se pierden en cada actualización del sistema** |
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
| 2 | **Política de la seña** | Publicar los términos y condiciones |
| 3 | **Los precios reales** — base por categoría y por fecha especial | Vender de verdad, por cualquier canal |
| 4 | **Credenciales de Mercado Pago** | Cobrar online |
| 5 | **Acceso al DNS del dominio** | Que los clientes reciban mails |
| 6 | **Mails de Franco, Martín y Ramiro** | Que puedan entrar, y que la auditoría diga quién fue |
| 7 | Autos para SUV y Furgón, y sus fotos | Que esas dos categorías se puedan vender |

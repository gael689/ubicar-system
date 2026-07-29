# Todo lo pendiente — 29 de julio de 2026

> Estado verificado contra el sistema en producción, no contra la memoria.
>
> **El sistema está en línea y funcionando.** Lo que sigue son datos que hay
> que cargar y decisiones que tomar. Nada de esto es programación pendiente.

---

## ✅ Lo que ya está funcionando en línea

| | Dónde |
|---|---|
| **Backend** | `ubicar-system-production.up.railway.app` — responde OK |
| **Sistema interno** | `ubicar-system.vercel.app` — con login real de Clerk |
| **Base de datos** | Producción, 39 tablas, migración `053` |
| **Auditoría** | Quién hizo qué, en Configuración → Auditoría |
| **Flota** | 15 vehículos cargados y categorizados |
| **Precios** | Tarifa diaria, semanal y mensual |
| **Adicionales** | 2 coberturas + 2 extras |
| **Fotos de catálogo** | Las 4 categorías principales |
| **Correo** | Resend conectado y enviando |

La web pública se muestra desde la computadora, apuntando a estos mismos
datos reales.

---

# 🔴 1. Datos fiscales — bloquea los contratos

**Es lo más concreto de la reunión.** Verifiqué en producción y faltan
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

# 🟠 3. Mercado Pago — para sacar en la reunión

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

---

# 🟠 4. El correo del dominio

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

# 🟡 5. Decisiones que se pueden dejar para después

| Pregunta | Si no se decide hoy |
|---|---|
| **¿Horarios de entrega y devolución?** ¿Sábados y domingos igual? ¿El aeropuerto tiene horario propio? ¿Se entrega fuera de hora con cargo? | Queda 24hs de anticipación y franja 08:00-20:00 |
| **¿Cuánto es la franquicia?** Y cuánto baja con cada cobertura | Queda sin mostrar en el contrato |
| **¿Descuento por pagar el 100% adelantado?** | Queda en 0%, sin descuento |
| **¿Se alquila en Capital Federal por la web?** ¿Misma flota? | La web vende sólo Bahía Blanca |

Las cuatro se cambian desde la pantalla de Configuración, sin tocar el sistema.

---

# 📋 6. Datos que hay que cargar para vender

El sistema está listo, pero necesita estos datos para poder cotizar. **Hoy hay
cargados datos de demostración**, que sirven para mostrar el sistema pero **no
son los precios reales**.

1. **Precios reales por categoría** — hoy hay una tarifa de demostración y
   **ninguna regla de calendario cargada**: por eso la grilla de precios muestra
   el mismo número todos los días del mes. Se carga una regla "Precio base" por
   categoría, de enero a diciembre, y encima las fechas especiales
2. **Fotos reales de cada categoría** — hoy hay 4 de demostración, y **SUV y
   Furgón no tienen ninguna**
3. **SUV y Furgón no tienen autos asignados** — no aparecen con disponibilidad
4. **Seguros y extras reales**, con su precio y su franquicia
5. **Franjas de recargo por edad**, si las quieren usar
6. **Precio de las fechas especiales** ya cargadas en el calendario

> **No hay que acordarse de nada de esto.** El sistema lo reclama solo con los
> avisos **"📌 Falta completar"**. Cuando esa lista quede vacía en la campana,
> está listo para vender.

---

# ⚙️ 7. Lo técnico que queda (no depende de ellos)

| | Qué | Mientras tanto |
|---|---|---|
| 🟡 | **Almacenamiento de archivos** — falta el bucket. Cloudflare pide tarjeta | Los documentos y fotos subidos **se pierden en cada actualización del sistema** |
| 🟡 | **Publicar la web** | Se muestra desde la computadora |
| 🟡 | **Dominios propios** | Todo anda con direcciones de Vercel y Railway |
| 🟡 | **Usuarios de Franco, Martín y Ramiro** | Sólo está creado el de Gael. Se crean en dos minutos con sus mails |
| 🟠 | **Tres correcciones en el cobro online** | Detectadas en una auditoría; hay que cerrarlas antes de que Mercado Pago tenga credenciales reales |

---

# Resumen: qué traerse de la reunión

| | Qué | Bloquea |
|---|---|---|
| 1 | **Razón social, CUIT, Ingresos Brutos y domicilio fiscal** | Los contratos salen "provisorios" |
| 2 | **Política de la seña** | Publicar los términos y condiciones |
| 3 | **Credenciales de Mercado Pago** | Cobrar online |
| 4 | **Acceso al DNS del dominio** | Que los clientes reciban mails |
| 5 | **Mails de Franco, Martín y Ramiro** | Que puedan entrar al sistema |
| 6 | Precios reales y fotos | Vender de verdad |

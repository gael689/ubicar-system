# Para la reunión

**Cuatro documentos, en este orden.** Todo lo demás que hay en `docs/` es
técnico y no va a la reunión.

Actualizado el **11/08/2026**.

---

| # | Documento | Para qué | ¿Se lo doy a ellos? |
|---|---|---|---|
| **1** | **`MANUAL_DE_USO.md`** | Qué hace el sistema y **qué no**. Web vs mostrador, contratos, caja, precios, notificaciones | **Sí** |
| **2** | **`PENDIENTES.md`** | Qué falta, quién lo tiene que resolver, y las decisiones que se tomaron | **Sí** |
| **3** | **`PASO_A_PASO_MERCADOPAGO.md`** | Los datos a sacar de la cuenta. Se hace ahí mismo, con ellos | **Sí** |
| **4** | `MANUAL_PARA_LOS_DUENOS.md` | El manual largo de julio. Sirve de consulta; **el 1 lo reemplaza** para la reunión | Opcional |

---

## ⚠️ Antes de mostrar nada

**Estamos en ambiente de prueba.** El dominio `ubicar-rent.com.ar` **sirve el
sitio viejo** — no lo abras y no lo compartas. Se conecta la semana que viene.

Lo que sí funciona, verificado hoy:

| Pieza | Dirección |
|---|---|
| **Sistema interno** | `virtuous-communication-production-7f1e.up.railway.app` |
| **Web pública** | `ubicar-system.vercel.app` |
| **API** | `ubicar-system-production.up.railway.app` |

---

## El orden de la reunión

**1 · Mostrar la web andando.** Buscar fechas, ver precios reales, elegir un
vehículo, llegar hasta el paso de pago. Que vean que se reserva solo.

**2 · Mostrar el sistema.** Que la reserva de la web cae en el mismo listado, y
de ahí: asignar vehículo → emitir contrato → mandar el link → firmar del
teléfono.

**3 · Los precios.** Es lo que más falta y lo que más va a llevar. Explicar
primero las **dos capas** —la tarifa y el calendario— antes de que carguen
nada. Está en el manual, §5.

**4 · Mercado Pago.** Se sacan las credenciales ahí mismo, con el instructivo
abierto. Es lo único que conviene hacer durante la reunión y no después.

**5 · Lo que falta de ellos.** `PENDIENTES.md` §🔴, que son cuatro cosas.

---

## Qué traerse de vuelta

1. **Los precios reales por categoría** — sin eso no se vende por ningún canal
2. **Las credenciales de Mercado Pago**, incluido el webhook
3. **Acceso al DNS del dominio** — sin eso no le llega un mail a ningún cliente
4. **Qué autos van a SUV y Furgón**, y fotos reales de las categorías

---

## Cosas que conviene decir, y que no están en los documentos

- **Todo lo que se decidió, lo decidió Gael para poder avanzar.** Está
  construido y funcionando, pero es revisable.
- **Los precios que se ven hoy son de demostración.** No son los suyos.
- **Los mails a clientes todavía no salen**, y el sistema lo dice: quedan
  marcados como "omitido", no como enviados. Se destraba con el dominio.
- **El pago online todavía no cobra**: la web cierra por transferencia
  bancaria, que ya funciona y tiene los datos de la cuenta cargados.

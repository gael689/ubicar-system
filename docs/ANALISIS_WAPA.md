# ¿Sirve Wapa para cobrar por la web?

> Para el resto del mercado —Payway, Mobbex, Getnet, MODO— y para el requisito
> de **preautorización** que una rentadora necesita para la garantía, ver
> **`ALTERNATIVAS_COBRO.md`**.

Análisis del 9 de agosto de 2026. Wapa es la solución de cobros de **Banco
Patagonia**, construida junto a **Prisma Medios de Pago** y **Geopagos**.

**Respuesta corta: sí para el mostrador, no para la web —al menos no
automatizado.** Y conviene usarla igual, porque cobra bastante menos.

---

## 1. Qué es Wapa exactamente

Tres formas de cobrar, todas operadas **desde su app**:

| | Qué es | Comisión |
|---|---|---|
| **mPOS** | Lector de tarjetas por Bluetooth | 4,90% crédito · 2,90% débito |
| **Link de pago** | Se genera en la app y se manda por WhatsApp o mail | idem tarjetas |
| **QR** | Transferencia inmediata | **0,80%** |
| **QR Pix** | Para turistas brasileños | 3% |

Sin gastos fijos de mantenimiento.

---

## 2. El problema: no hay API

**No existe documentación pública de API, webhooks ni integración para
comercios.** Ni en el sitio de Wapa, ni en el de Banco Patagonia, ni en
ninguna fuente encontrada. Es un producto de app, no una plataforma para
desarrolladores.

Eso choca de frente con lo que el sistema necesita. La interfaz `IPasarelaPago`
que ya existe pide tres cosas:

```
crear_preferencia()  → una URL de pago, generada por el servidor
obtener_pago()       → consultar el estado de un pago
reembolsar()
```

y una cuarta que no está en la interfaz pero es la más importante: **el
webhook**. En `PLAN_RESERVAS_WEB.md` §6 está escrito por qué, y no es un
detalle de implementación:

> **El webhook es la fuente de verdad, no la vuelta del navegador.** El cliente
> puede cerrar la pestaña y el pago igual entra.

Sin webhook, una reserva web con Wapa se comporta así: el cliente paga, cierra
la pestaña, y **nadie se entera**. El hold vence a los 20 minutos, el auto se
libera, y la plata quedó cobrada sin reserva. Es exactamente el modo de falla
que ya está documentado para el caso de olvidarse de configurar el webhook de
Mercado Pago — sólo que acá no habría forma de arreglarlo.

Un link fijo o un QR fijo es peor todavía: no hay manera de saber **qué
reserva** pagó cada transferencia.

---

## 3. Lo que sí conviene hacer, y ya está hecho

**Wapa como medio de pago del mostrador.** No hace falta integrar nada: se
cobra desde la app y se registra en el sistema como cualquier otro cobro.

Se agregó `wapa` como medio de pago propio (migración 057), con el mismo
criterio que en su momento justificó separar `mercado_pago` de `tarjeta`: se
concilia contra **otro extracto** (Banco Patagonia, no la terminal), con otras
comisiones y otros plazos de acreditación. Mezclado con "tarjeta", la caja del
día cierra pero nadie puede saber qué se cobró por dónde ni cuánto se fue en
comisiones.

Ya aparece en el selector de medios de pago de la caja, de los cobros, del
panel de pagos y del alta de reserva.

### Por qué vale la pena aunque no se integre

Comparado con Mercado Pago, la diferencia es real:

- **QR al 0,80%** contra el ~6% + IVA de acreditación inmediata de MP. En un
  alquiler de $500.000, son ~$4.000 contra ~$36.000.
- Crédito 4,90% contra ~6% + IVA.

Para el cobro presencial —que hoy es la mayoría— **empujar el QR de Wapa es la
decisión de plata más rentable del sistema**, y no cuesta una línea de código.

---

## 4. Si igual se quiere usar Wapa en la web

Hay un camino intermedio que sí funciona, **cobro asistido**:

1. Entra la reserva por la web y queda en `pendiente_pago`.
2. El operador genera el link de pago en la app de Wapa y lo pega en el sistema.
3. El sistema se lo manda al cliente.
4. Cuando la plata entra, alguien lo marca cobrado a mano.

Es exactamente el mismo patrón que ya se usa para WhatsApp: **el sistema arma,
la persona ejecuta**. Funciona, no miente sobre estar automatizado, y sirve
mientras no haya credenciales de Mercado Pago.

**Contra:** deja de ser autoservicio. El cliente no puede reservar y pagar a
las 11 de la noche de un domingo sin que nadie intervenga, que es la razón por
la que existe el flujo online.

**No está construido.** Es una decisión de negocio, no técnica: si la web va a
vender sin intervención humana, hace falta Mercado Pago (o algo con webhook).
Si se acepta que alguien confirme cada reserva, Wapa alcanza y sale mucho más
barato.

---

## 5. La pregunta que vale hacerle al banco

**Wapa corre sobre Geopagos, y Geopagos sí tiene plataforma de APIs.** Lo que
no está claro es si Banco Patagonia la revende a sus comercios o si la usa sólo
puertas adentro.

Vale una consulta al oficial de cuenta, concreta:

> ¿Wapa expone API de cobros y notificaciones (webhooks) para el comercio, o
> alguna forma de conciliación automática? Lo necesitamos para confirmar
> reservas online sin intervención manual.

Si la respuesta es que sí, el adaptador se escribe en un día: la interfaz
`IPasarelaPago` ya está y Mercado Pago ya la implementa, así que agregar una
segunda pasarela es escribir una clase y cambiar `PAGOS_PROVIDER`. **Esa
abstracción se hizo justamente para esto.**

---

## 6. La recomendación: los dos, cada uno en su momento

La pregunta "¿Mercado Pago o Wapa para la web?" tiene una trampa: **el alquiler
no se cobra una vez, se cobra dos.**

- **La seña (30%) se cobra online**, y ahí la única opción real es **Mercado
  Pago**: es la que confirma la reserva sola por webhook. Ya está construida y
  probada; sólo faltan las credenciales.
- **El saldo (70%) se cobra en el mostrador** al entregar el auto, y ahí entra
  el **QR de Wapa al 0,80%**.

Sobre un alquiler de $500.000:

| Cómo se cobra | Comisión total | Efectiva |
|---|---|---|
| Todo por Mercado Pago | ~$31.500 | 6,3% |
| **Seña por MP + saldo con QR de Wapa** | **~$12.200** | **2,4%** |
| Todo con QR de Wapa | ~$4.000 | 0,8% — pero sin venta online desatendida |

**La comisión cara sólo toca el 30%**, y eso es lo que se paga por que alguien
pueda reservar y señar un domingo a las 11 de la noche sin que nadie
intervenga. Es exactamente la razón por la que existe el flujo web: si hay que
esperar a que alguien lo atienda, la web no vende, agenda.

### Un corolario que conviene mirar: D-30

El descuento por pagar el 100% por adelantado empuja al cliente **justo al
canal caro**: pagar todo online triplica la comisión sobre esa operación.

Hoy `web.descuento_pago_total_pct` está en **0%** y conviene dejarlo ahí. Si
algún día se quiere usar para eliminar la cobranza en el mostrador y el
incobrable, el número tiene que ser **mayor que el ~4,5% de comisión extra que
cuesta** — si no, se está pagando dos veces por la misma tranquilidad.

### Lo que sí conviene empujar en el mostrador

Que el saldo se pague **con el QR y no con la tarjeta del mPOS**: 0,80% contra
4,90%. Sobre $350.000 de saldo son $2.800 contra $17.150. Es una instrucción de
mostrador, no una función del sistema.

---

## Resumen

| | Veredicto |
|---|---|
| Wapa en el mostrador (mPOS y QR) | ✅ **Sí, y conviene**. Ya cargado como medio de pago |
| Wapa como pasarela automática de la web | ❌ No: sin API ni webhook, la reserva nunca se confirma sola |
| Wapa como cobro asistido en la web | 🟡 Viable, no construido. Decisión de negocio |
| **Mercado Pago para la seña online** | ✅ **Recomendado.** Construido y probado, faltan credenciales |
| **QR de Wapa para el saldo en el mostrador** | ✅ **Recomendado.** Baja la comisión total del 6,3% al 2,4% |
| Preguntarle al banco por la API de Geopagos | 📞 Vale la consulta: si existe, el adaptador es un día de trabajo |

## Fuentes

- [Wapa Patagonia](https://www.wapa.com.ar/)
- [WAPA | Banco Patagonia](https://www.bancopatagonia.com.ar/personas/productos-y-servicios/wapa.php)
- [Wapa, nueva herramienta de cobranzas con Prisma y Geopagos](https://bahiacesar.com/2023/05/18/wapa-nueva-herramienta-de-cobranzas-del-banco-patagonia-con-prisma-medios-de-pago-y-geopagos/)
- [Banco Patagonia lanza cobros con QR Pix (marzo 2026)](https://www.cronista.com/protagonistas/banco-patagonia-lanza-solucion-de-cobros-con-qr-a-traves-de-pix/)

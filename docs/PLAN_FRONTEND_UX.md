# Plan de Frontend y UX — Ubicar Rent

**Fecha:** 2026-07-25
**Objetivo:** que el sistema sea intuitivo y fácil de manejar. Formularios por pasos en lugar de pantallas enormes. El operador nunca debería tener que calcular, recordar ni deducir nada.

**Relacionados:** `docs/DECISIONES.md` · `docs/PLAN_MAESTRO.md` · `docs/ANALISIS_CICLO_RESERVA.md` · `docs/CASOS_DE_USO.md` · `docs/PLAN_ANALYTICS.md`

> ⚠️ **El Inicio queda fuera de este plan (decisión D-24).** La pantalla de entrada es el calendario estilo Excel, completo y **sin scroll**. No lleva métricas, listas ni paneles. El "Flujo del día" que hoy está abajo se muda a `/reportes`. Todo lo que sigue aplica a las **otras** pantallas: reserva, check-out, check-in, clientes, flota, tarifas y configuración.

---

## 1. Diagnóstico de los formularios actuales

| Pantalla | Líneas | Campos | Problema |
|---|---|---|---|
| `ReservaModal.tsx` | **703** | ~25 en 7 secciones | Un solo scroll gigante. Todo visible siempre, aunque no aplique |
| `CheckinModal.tsx` | **616** | ~18 | Ídem, y la decisión de excedente aparece mezclada con el resto |
| `CotizadorPage.tsx` | 489 | variable | Split form/preview — **este patrón está bien**, sirve de referencia |
| `CheckoutModal.tsx` | 247 | ~14 | Más contenido, pero va a crecer con las validaciones |
| `ClienteFormDialog.tsx` | 249 | ~10 | Va a crecer mucho con datos fiscales y contactos de empresa |
| `VehiculoFormDialog.tsx` | 220 | ~12 | Va a crecer con categoría, seguro, VTV, specs |
| `GarantiaTarjetaSection.tsx` | 416 | — | Componente muy bueno, se reutiliza |

**El diagnóstico honesto:** `ReservaModal` es un modal de 703 líneas donde el operador ve al mismo tiempo el vehículo, el cliente, las fechas, los lugares, la cotización, el pago, la garantía, el late checkout y las notas. Y con los cambios que vienen (categorías, adicionales, con/sin factura, conductor distinto del pagador) sumaría ~10 campos más. **No escala.**

---

## 2. Principios de diseño

1. **Un paso, una decisión.** Cada pantalla del wizard responde una sola pregunta.
2. **Progresivo:** lo que no aplica, no se muestra. Si eligen "Sin garantía", los campos de garantía no existen.
3. **Siempre visible el contexto:** un panel lateral fijo con lo que se lleva elegido y el total en vivo.
4. **Validar al avanzar, no al final.** El error aparece en el paso donde se cometió.
5. **Se puede volver sin perder nada.** Ir al paso 2 desde el 4 y volver no borra lo cargado.
6. **Borrador automático.** Si se cierra el modal por accidente, al reabrir ofrece retomar.
7. **Nada de cálculo mental.** Precios, atrasos, saldos y cargos siempre calculados y desglosados.
8. **Teclado primero.** Enter avanza, Escape retrocede, atajos en las opciones frecuentes.

---

## 3. Componente base: `<Wizard>`

Un solo componente reutilizable para todos los formularios largos. Evita reinventar la navegación en cada pantalla.

```
┌────────────────────────────────────────────────────────────────┐
│  Nueva Reserva                                            [×]  │
├────────────────────────────────────────────────────────────────┤
│  ①━━━━━●━━━━━②━━━━━○━━━━━③━━━━━○━━━━━④                          │
│  Quién     Cuándo      Precio     Confirmar                    │
├─────────────────────────────────────┬──────────────────────────┤
│                                     │  RESUMEN                 │
│   [ contenido del paso actual ]     │  ─────────────           │
│                                     │  Hilux AB123CD           │
│                                     │  Constructora del Sur    │
│                                     │  24/07 10:00 → 31/07 18:00│
│                                     │  7 días                  │
│                                     │                          │
│                                     │  Total     $ 546.000     │
│                                     │  Seña      $ 200.000     │
│                                     │  Saldo     $ 346.000     │
├─────────────────────────────────────┴──────────────────────────┤
│  [ ← Atrás ]                          [ Siguiente → ]          │
└────────────────────────────────────────────────────────────────┘
```

**API del componente:**

```
<Wizard
  pasos={[...]}              // definición declarativa
  onFinish={...}
  borradorKey="reserva-nueva" // autosave en localStorage
  resumen={<PanelResumen/>}   // panel lateral fijo
/>
```

Cada paso declara: `titulo`, `icono`, `componente`, `validar()`, `visible()` (para pasos condicionales), `opcional`.

**Comportamiento:**
- Los pasos ya completados se pueden clickear en la barra superior para volver.
- Los pasos futuros están deshabilitados hasta validar el actual.
- Un paso opcional muestra "Omitir".
- En mobile, el panel de resumen colapsa a una barra inferior fija con el total.

---

## 4. Nueva Reserva — 4 pasos

Reemplaza el modal de 703 líneas.

### Paso 1 · Quién
```
  Cliente        [ buscador con autocompletado ]   [ + Nuevo cliente ]
                 ┌──────────────────────────────────────────────┐
                 │ Constructora del Sur SRL          EMPRESA    │
                 │ CUIT 30-71234567-8                           │
                 │ ✓ Licencia OK   ⚠️ Debe $95.000 (vencido)    │
                 └──────────────────────────────────────────────┘

  Conductor      ● El mismo cliente
                 ○ Otro conductor  →  [ selector de conductores ]
                 ( para empresas se pide siempre quién maneja )
```

Al elegir el cliente aparece el **semáforo de habilitación**: licencia, deuda, no-shows, lista negra. Es lo que evita descubrir el problema recién en el check-out.

### Paso 2 · Cuándo y dónde
```
  Retiro         [ Paraguay 241 ] [ Alsina 350 ] [ Aeropuerto ] [ Otro… ]
                 Fecha [ 24/07/2026 ]   Hora [ 10:00 ]

  Devolución     [ Paraguay 241 ] [ Alsina 350 ] [ Aeropuerto ] [ Otro… ]
                 Fecha [ 31/07/2026 ]   Hora [ 18:00 ]
                 ⓘ Devolución en otro punto → cargo one-way $X

                 Duración: 7 días
```

Los tres puntos como botones grandes, un click. "Otro" despliega el campo libre.

### Paso 3 · Qué vehículo
```
  ● Por categoría        ○ Vehículo específico

  ┌─────────────┬─────────────┬─────────────┐
  │  🚗 SEDÁN   │  🚙 SUV     │  🛻 PICK-UP │
  │  3 libres   │  1 libre    │  Sin cupo   │
  │  $ 62.000/d │  $ 78.000/d │             │
  └─────────────┴─────────────┴─────────────┘

  ▸ Unidades disponibles de SUV:  ● Toyota Corolla Cross AB123CD
                                  ○ Jeep Renegade CD456EF
```

Muestra **disponibilidad real** para esas fechas y el precio ya resuelto. Hoy hay que elegir el vehículo a ciegas y descubrir el conflicto al guardar.

### Paso 4 · Precio, adicionales y pago
```
  ┌─ Precio ──────────────────────────────────────────────┐
  │  7 días × $78.000  (tarifa semanal, SUV)   $ 546.000  │
  │  Precio de lista: $546.000                            │
  │  Descuento  [ 0 ] %   Motivo [            ]  $      0 │
  └───────────────────────────────────────────────────────┘

  ┌─ Adicionales ─────────────────────────────────────────┐
  │  Cobertura:  ● Básica (franquicia $2.000.000)  incl.  │
  │              ○ Intermedia          + $8.000/día       │
  │              ○ Full sin franquicia + $15.000/día      │
  │  ☐ Pet friendly      $4.500/día                       │
  │  ☐ Silla de bebé     $3.000/día   (2 disponibles)     │
  └───────────────────────────────────────────────────────┘

  Facturación   ● Con factura      ○ Sin factura
  Garantía      [ Sin ] [ Efectivo ] [ Tarjeta ] [ Transf. ]
  Pago          ○ No abonó   ● Seña   ○ Pagó todo
```

La garantía con tarjeta reutiliza `GarantiaTarjetaSection`, que ya está muy bien resuelto.

### Paso 5 · Confirmar (resumen)
Todo junto en modo lectura, con link "editar" en cada bloque que vuelve al paso correspondiente. Botón final **Crear reserva**.

---

## 5. Check-out — 3 pasos con semáforo

### Paso 0 · Verificación (automático, antes de empezar)
```
  VERIFICACIONES PREVIAS

  ✓  Contrato firmado
  ✓  Licencia del conductor vigente hasta 03/2028
  ✓  Póliza vigente hasta 15/11/2026
  ⚠️  VTV vence en 6 días (31/07)
  ✗  El cliente adeuda $95.000 con 12 días de atraso

     [ Continuar de todos modos ]   ← requiere motivo, queda auditado
     [ Resolver primero ]
```

Los bloqueos duros (póliza vencida) no tienen botón de continuar.

### Paso 1 · Estado del vehículo
Km, combustible (selector visual actual, que funciona bien), limpieza, **fotos** y parte de daños con croquis.

### Paso 2 · Garantía y cobro
Garantía + cobro inmediato con el desglose de lo que queda pendiente.

### Paso 3 · Confirmar
Resumen + entrega. Si el retiro es más tarde de lo pactado, acá aparecen los dos botones: **"Mantener fecha de devolución"** / **"Correr la devolución N horas"**.

---

## 6. Check-in — la pantalla más importante

No es un formulario, es una **liquidación**. Un solo paso con todo visible, porque el operador necesita ver el conjunto para decidir.

```
  DEVOLUCIÓN                    Programada: jue 24/07 18:00
                                Real:       vie 25/07 22:00
  ──────────────────────────────────────────────────────────
  Atraso 1 día 4 hs · gracia 40 min · 27 hs cobrables
  ⚠️ Este atraso afectó la reserva #151 del sábado

  ┌─ ¿Qué se cobra por el atraso? ────────────────────────┐
  │  ○ Completo    $160.000   ● Parcial [1] día  $80.000  │
  │  ○ Bonificar   Motivo: [ ▾ requerido ]                │
  └───────────────────────────────────────────────────────┘

  Km          142.350 → [ 143.780 ]      1.430 km
  Combustible salió ¾ · vuelve [ ½ ]  →  $ 18.000  [editar]
  Limpieza    [ Sucio ]               →  $ 12.000  [editar]
  Daños       1 rayón nuevo           →  $ 35.000  [ver]

  ──────────────────────────────────────────────────────────
  Garantía retenida                            $ 300.000
  Total de cargos                              $ 145.000
  A DEVOLVER                                   $ 155.000

  Saldo del alquiler                           $  48.750
              [ Cobrar ahora ]  [ Dejar en cuenta corriente ]
```

Cada cargo se calcula solo y se puede editar. Nada de cuentas a mano.

---

## 7. Cliente — pasos condicionales

### Paso 1 · Tipo
Dos tarjetas grandes: **Particular** / **Empresa**. Esta elección define los pasos siguientes.

### Particular
2. Datos personales (nombre, DNI, nacimiento, contacto)
3. Licencia (número, categoría, vencimiento, país) — **obligatoria**
4. Conductores adicionales *(opcional)*

### Empresa
2. Datos de la empresa (razón social, nombre de fantasía, CUIT con validación de dígito verificador, rubro)
3. Datos fiscales (condición IVA, domicilio, localidad, provincia)
4. **Contactos** — al menos uno con nombre y **puesto**, marcando quién recibe facturas y quién recibe notificaciones
5. Condición comercial (condición de pago, límite de crédito)
6. Conductores habilitados

---

## 8. Vehículo — 4 pasos

1. **Identificación** — patente, marca, modelo, año, color, **categoría**
2. **Documentación** — VTV, póliza (compañía, número, vencimiento), patente. Como **campos**, no sólo documentos adjuntos
3. **Mantenimiento** — km actual, km entre services, próximo service
4. **Specs y foto** — transmisión, combustible, capacidad de tanque, pasajeros, valijas, aire

---

## 9. Otras pantallas

### Tarifas
Grilla editable por categoría × banda, con carga por precio/día o por total de la banda, y el descuento implícito calculado a la vista.

### Adicionales
Lista + editor de reglas con vista previa en vivo ("para 35 días en SUV, este adicional costaría $0 — bonificado por duración").

### Configuración (nueva)
Agrupada en pestañas: **Operación** (gracia, umbrales, buffer) · **Cargos** (limpieza, combustible, one-way) · **Puntos de retiro** · **Empresa** (datos para PDFs) · **Notificaciones** · **Permisos**.

### Auditoría (nueva)
Pantalla global con filtros, más una pestaña **"Actividad"** dentro de cada ficha.

---

## 10. Navegación

**Menú de 9 items → 6 grupos:**

| | Absorbe |
|---|---|
| 🏠 **Hoy** | Ocupación + Dashboard |
| 📋 **Reservas** | Reservas, Alquileres, Contratos |
| 🚗 **Flota** | Flota, Mantenimiento, Multas |
| 👤 **Clientes** | Clientes, Cuentas Corrientes |
| 💰 **Finanzas** | Caja, Echeqs, Recibos, Facturas |
| ⚙️ **Más** | Reportes, Cotizador, Configuración, Auditoría |

**Densidad:** sidebar `w-60` → `w-52`, auto-colapsado en Reservas y Ocupación con expansión al hover (recupera 176px), filtros colapsables con badge de activos, header sticky, toggle de densidad persistido.

---

## 11. Consistencia visual

Hoy conviven **tres sistemas de color**: la paleta oficial (`primary #407EC9`), los tokens de shadcn (`bg-primary`, `text-danger`) y clases crudas de Tailwind (`bg-indigo-600`, `text-slate-800` en `ReservasList`, `MultasPage`, `CajaPage`). Más una migración a medias de lucide-react a Heroicons.

**Antes de sumar pantallas nuevas hay que fijar una sola paleta, un set de íconos (lucide, que es el que domina) y un set de componentes base.** Si no, la web pública hereda el desorden.

También: unificar confirmaciones (hay `confirm()` nativo mezclado con `ConfirmDialog`), estados vacíos con acción en vez de "Sin movimientos registrados", y borrar los archivos muertos (`pages/clientes/List.tsx` y `Detail.tsx` duplicados, 5 variantes del preview del cotizador).

---

## 12. Orden de trabajo

| Etapa | Qué | Cuándo |
|---|---|---|
| 1 | Componente `<Wizard>` + panel de resumen + borrador automático | Fase 1 |
| 2 | Check-in como liquidación *(el de mayor impacto operativo)* | Fase 1 |
| 3 | Nueva Reserva en 5 pasos | Fase 1 |
| 4 | Check-out con semáforo | Fase 1-3 |
| 5 | Cliente con pasos condicionales | Fase 1 |
| 6 | Menú, densidad, paleta e íconos | Fase 3 |
| 7 | Vehículo, Tarifas, Adicionales, Configuración | Fase 3 |
| 8 | Auditoría | Fase 3.5 |
| 9 | Búsqueda global Cmd+K | Fase 3 |

El check-in va antes que la reserva a propósito: es donde se decide plata todos los días y donde hoy el operador tiene que hacer cuentas de cabeza.

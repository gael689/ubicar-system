# Ubicar Rent — Auditoría de funcionalidad del sistema

> Documento de revisión en lenguaje claro y humano. Detalla **todo lo que el sistema hace hoy** y **todo lo que queda por decidir o construir**.
> Versión: 2026-06-26.

---

## Índice

1. [Resumen del sistema](#1-resumen-del-sistema)
2. [Navegación general](#2-navegación-general)
3. [Flota de vehículos](#3-flota-de-vehículos)
4. [Clientes](#4-clientes)
5. [Reservas y Alquileres](#5-reservas-y-alquileres)
6. [Calendario de Ocupación](#6-calendario-de-ocupación)
7. [Dashboard y Flujo del Día](#7-dashboard-y-flujo-del-día)
8. [Multas](#8-multas)
9. [Finanzas (Caja, Echeqs, Cuentas Corrientes)](#9-finanzas-caja-echeqs-cuentas-corrientes)
10. [Reportes](#10-reportes)
11. [Notificaciones automáticas](#11-notificaciones-automáticas)
12. [Cotizador](#12-cotizador)
13. [Tarjeta bancaria del cliente](#13-tarjeta-bancaria-del-cliente)
14. [Reglas generales del sistema](#14-reglas-generales-del-sistema)
15. [Dudas y decisiones operativas pendientes](#15-dudas-y-decisiones-operativas-pendientes)
16. [Próximas funcionalidades a desarrollar](#16-próximas-funcionalidades-a-desarrollar)

---

## 1. Resumen del sistema

**Ubicar Rent** es un sistema de gestión integral para una empresa de alquiler de vehículos. Está pensado para reemplazar el trabajo con planillas de Excel, anotaciones en papel y agendas físicas. Centraliza en un único lugar la operación diaria del negocio.

**¿Qué se puede hacer hoy?**

- Llevar el control de toda la flota de autos y camionetas, con sus papeles, gastos, services y tarifas.
- Manejar la cartera de clientes (particulares y empresas) con sus documentos, licencias, conductores adicionales y tarjetas bancarias.
- Crear reservas, hacer entregas y devoluciones de vehículos, calcular automáticamente cobros, excedentes y garantías.
- Ver en un calendario en tiempo real qué vehículos están ocupados y cuándo.
- Cobrar al cliente, registrar pagos por distintos medios (efectivo, transferencia, tarjeta, cheque, echeq, cuenta corriente).
- Gestionar echeqs recibidos y emitidos con sus estados completos.
- Llevar cuentas corrientes de los clientes (deudas y saldos a favor).
- Cargar fotomultas y descubrir automáticamente quién manejaba el auto en ese momento.
- Ver reportes mensuales de ingresos/egresos y de rendimiento por vehículo.
- Recibir avisos automáticos cuando hay documentos por vencer, services próximos, devoluciones atrasadas, multas pendientes, etc.

**¿Quién lo usa?**

- El **dueño** o gerente, para tener visión global del negocio (ocupación, ingresos, alertas).
- El **operario / empleado**, para el día a día: confirmar reservas, entregar autos, recibir devoluciones, registrar pagos.
- Más adelante, también el **cliente** desde la web, para solicitar reservas online (esta parte todavía no está construida — ver sección 16).

**¿Desde dónde se accede?**

Hoy funciona como una aplicación web. Se puede abrir desde computadora y desde celular. La interfaz se adapta automáticamente al tamaño de pantalla. Algunas vistas, como el calendario, cambian de formato en celular (pasa de timeline horizontal a vista agenda con calendario mensual y panel del día).

---

## 2. Navegación general

A la izquierda hay un **menú lateral** con todas las secciones principales:

- **Ocupación** — pantalla de inicio del sistema. Muestra el calendario y el flujo del día.
- **Flota** — listado de vehículos.
- **Reservas** — listado de todas las reservas con filtros.
- **Contratos** — sección en construcción (los contratos digitales firmados aún no están implementados).
- **Clientes** — listado de clientes.
- **Multas** — buscador y gestión de multas.
- **Cotizador** — generador de presupuestos en PDF.
- **Finanzas** — sección unificada con tres pestañas: **Caja**, **Echeqs** y **Cuentas Corrientes**.
- **Reportes** — gráficos y tablas de ingresos, egresos y rendimiento de flota.

En el pie del menú lateral hay un **ícono de campana** que abre el panel de notificaciones (todas las alertas activas del sistema). El número arriba del ícono indica cuántas alertas hay.

En celular, el menú lateral se reemplaza por una **barra inferior** con las secciones principales para que se naveguen con el pulgar.

**Login:** en esta etapa de desarrollo el sistema no exige usuario y contraseña — el operador entra directamente. Más adelante se integrará con un sistema de login real (Clerk) para que cada usuario tenga su propia cuenta y rol.

---

## 3. Flota de vehículos

### 3.1 Listado general

Al entrar a **Flota** se ve una tabla con todos los vehículos de la empresa. Por cada vehículo se muestra:

- Foto pequeña del auto (si tiene cargada)
- Patente
- Marca y modelo, año, color
- Tipo (auto o camioneta)
- **Estado simplificado**: solo se muestran dos valores en esta columna —
  - **"En uso"** (cuando el auto está alquilado en este momento)
  - **"Disponible"** (cualquier otro caso: libre, reservado para el futuro, en transición, fuera de servicio)
- Kilómetros actuales del vehículo
- Acciones (editar, ver detalle, dar de baja)

**Filtros disponibles:**
- Buscar por marca, modelo o patente
- Filtrar por tipo (auto/camioneta)
- Toggle para mostrar también los vehículos dados de baja (que normalmente no aparecen)

**Avisos automáticos en la tabla:**
- Si el vehículo tiene el próximo service a menos de 1.000 km → aparece una etiqueta amarilla **"Service próximo"**.
- Si el vehículo ya pasó el kilometraje del próximo service → aparece una etiqueta roja **"Mantenimiento vencido"**.

### 3.2 Crear un vehículo nuevo

Botón **"Nuevo vehículo"** arriba a la derecha. Se completa:
- Patente (debe ser única, se guarda en mayúsculas)
- Marca, modelo, año, color
- Tipo (auto o camioneta)
- Kilómetros actuales en este momento
- Cada cuántos kilómetros hay que hacerle service (intervalo de service)
- Foto (opcional, se sube después de guardar)

El sistema calcula solo el **kilometraje del próximo service** sumando los kilómetros actuales más el intervalo.

### 3.3 Detalle del vehículo

Al hacer click en una fila se entra al detalle del vehículo, con varias pestañas:

#### Datos
Se ve y se edita toda la información del vehículo. También se puede:
- Subir o reemplazar la foto
- Dar de baja el vehículo (queda inactivo pero no se borra, se puede reactivar después)
- Reactivar uno que estaba inactivo

#### Documentos
Permite cargar los papeles del vehículo:
- Póliza de seguro
- VTV
- Cláusulas del contrato
- Otros documentos

Para cada documento se carga el archivo (PDF o imagen), un nombre, la fecha de inicio de vigencia y la fecha de vencimiento. El sistema muestra etiquetas automáticas:
- **VENCIDO** (rojo) si la fecha de vencimiento ya pasó
- **POR VENCER** (amarillo) si vence en los próximos 30 días

Estos documentos también disparan alertas en el panel de notificaciones.

#### Gastos
Se registran todos los gastos del vehículo:
- **Tipos de gasto:** service, combustible, cubiertas, reparación, seguro, patente, VTV, lavado, otro.
- Por cada gasto se carga: tipo, descripción, monto, medio de pago, fecha, opcionalmente proveedor y los kilómetros al momento del gasto, y notas.
- Los gastos se pueden editar y eliminar.
- Los gastos del día también aparecen en la **Caja** del día.

#### Tarifas
Se definen los precios de alquiler del vehículo:
- **Tarifa diaria** (se aplica si el alquiler es de menos de 7 días)
- **Tarifa semanal** (se aplica si es de 7 a 29 días)
- **Tarifa mensual** (se aplica si es de 30 días o más)

Cada tarifa tiene su monto y fecha desde la cual está vigente. El sistema elige automáticamente cuál usar cuando se cotiza una reserva, según la duración. También existen tarifas globales (para toda la flota) que sirven como respaldo cuando un vehículo no tiene tarifa propia.

#### Mantenimiento
Pantalla dedicada al service del auto. Tiene un panel arriba con un semáforo:
- **Verde** si quedan más de 1.000 km hasta el próximo service
- **Amarillo** si quedan menos de 1.000 km
- **Rojo** si el service ya está vencido

Muestra los KM actuales, los KM del próximo service y cuántos quedan.

**Registrar un nuevo service:**
- Tipo de service (service general, cambio de aceite, neumáticos, frenos, filtros, correa, suspensión, otro)
- Fecha del service
- Kilómetros al momento del service (precargados con el km actual del vehículo)
- Kilómetros del próximo service (calculados automáticamente sumando el intervalo, pero editable)
- Costo (opcional)
- Próxima fecha por calendario (opcional)
- Descripción/notas (taller, repuestos, etc.)

Al guardar, el sistema actualiza los KM próximos del vehículo, y los avisos en la tabla y notificaciones cambian automáticamente.

Más abajo se ve el historial completo de todos los services del vehículo, en orden del más reciente al más viejo, con detalle y opción de eliminar.

#### Historial
Log cronológico de los gastos y services del vehículo. Útil para auditar todo lo que pasó con un auto en particular.

#### Reservas
Lista de todas las reservas que tuvo el vehículo en su historia. Por cada reserva con alquiler efectivo se muestra:
- KM de salida (al entregarse al cliente)
- KM de llegada (al devolverse)
- KM recorridos por el cliente en ese alquiler
- Si el alquiler está en curso (no devuelto aún) → muestra "en curso" en lugar del KM de llegada

Es la "historia clínica" del vehículo.

---

## 4. Clientes

### 4.1 Listado

Tabla con todos los clientes. Columnas:
- Nombre completo (o razón social si es empresa)
- DNI o CUIT
- Teléfono
- Tipo (particular o empresa)
- Estrella si es cliente frecuente
- Estado (activo / inactivo)
- Aviso si la licencia está por vencer o vencida
- Acciones

**Filtros:** buscar por nombre, DNI, email o teléfono; filtrar por tipo, por activo/inactivo.

### 4.2 Crear un cliente

**Si es particular:**
- Nombre completo, DNI, teléfono, email (opcional), notas
- Datos de la licencia de conducir: número, categoría, fecha de vencimiento (opcionales — se pueden completar después)
- Marca "cliente frecuente" (estrella)

**Si es empresa:**
- Razón social, CUIT, teléfono, email
- No se piden datos de licencia (es la empresa, no una persona)

### 4.3 Detalle del cliente

Pestañas dentro del perfil:

#### Datos
Información completa del cliente, editable. Se puede dar de baja al cliente (queda inactivo) y reactivar.

#### Documentos
Se cargan papeles del cliente:
- DNI
- Licencia de conducir
- Contratos
- Otros

Mismo sistema de fechas de vencimiento y avisos automáticos que en la flota.

#### Conductores adicionales
**(solo para clientes particulares)**

Cuando el auto lo van a usar varias personas, se pueden cargar conductores adicionales autorizados:
- Nombre completo
- DNI
- Número de licencia y vencimiento

Se pueden editar y dar de baja conductores.

#### Tarjeta bancaria
Sección **protegida por PIN** (`Ubicar123`). Al abrirla aparece una pantalla con candado pidiendo el PIN. Sin el PIN no se ven los datos.

Una vez ingresado el PIN, se ve la tarjeta del cliente en formato visual (gradiente azul, número enmascarado tipo `**** **** **** 1234`). Hay un toggle (ícono de ojo) para revelar el número completo y el CVV.

Permite:
- Crear la tarjeta del cliente (titular, número, vencimiento MM/AA, CVV de 3 dígitos, DNI del titular)
- Editarla
- Eliminarla (este es uno de los pocos casos en que se borra de verdad — es información sensible)

Es útil cuando una reserva pide garantía con tarjeta.

#### Multas
Historial de fotomultas asociadas al cliente, con sus estados.

#### Cuenta corriente
Saldo del cliente y movimientos.
- Si tiene saldo negativo → es deuda
- Si tiene saldo positivo → saldo a favor

Se puede agregar un movimiento manual (débito o crédito con concepto). Los movimientos automáticos se generan cuando se cobra un alquiler con medio de pago "cuenta corriente".

#### Historial
Todas las reservas y alquileres del cliente. Permite ver cuántas veces alquiló, qué vehículos usó, fechas, montos.

---

## 5. Reservas y Alquileres

Es el corazón del sistema. Toda la operación diaria pasa por acá.

### 5.1 Concepto

- **Reserva** = el acuerdo de que un cliente va a alquilar un vehículo en determinadas fechas.
- **Alquiler** = cuando el vehículo ya fue entregado y está en uso por el cliente.

Una reserva pasa por distintos estados a lo largo del tiempo. El sistema automatiza muchas de estas transiciones.

### 5.2 Estados de una reserva

```
        creación
            ↓
       confirmada  ──── (Check-out, entrega) ──→  activa  ──── (Check-in, devolución) ──→  finalizada
            ↓
       cancelada
```

| Estado | Significado |
|---|---|
| **Confirmada** | Reserva creada, todavía no se entregó el auto. |
| **Activa** | El auto ya fue entregado al cliente, está en uso. |
| **Finalizada** | El auto ya fue devuelto, el alquiler terminó. |
| **Cancelada** | La reserva fue anulada antes de la entrega. |

### 5.3 Convención clave: Check-out y Check-in

Para evitar confusiones, **el sistema entero usa estas dos palabras desde la perspectiva del auto** (no del cliente, como en un hotel):

- **CHECK-OUT** = el auto **sale** de la cochera → el cliente se lo lleva (entrega del vehículo).
- **CHECK-IN** = el auto **vuelve** a la cochera → el cliente lo devuelve (devolución del vehículo).

Esta convención está aplicada en todos los carteles, botones, alertas y mensajes del sistema. Es la natural en el negocio del alquiler de autos.

### 5.4 Crear una reserva

Botón **"Nueva reserva"** desde el listado de reservas, o haciendo click en una celda vacía del calendario de ocupación (que pre-completa vehículo y fecha).

Campos del formulario:

**Vehículo:** se elige del listado. Si el vehículo ya está alquilado en este momento, aparece un cartelito amarillo de aviso, pero no impide crear la reserva.

**Cliente:** se busca por nombre o DNI.

**Fechas y horas:** fecha y hora de inicio (entrega), fecha y hora de fin (devolución).

**Lugar de entrega y lugar de devolución:** texto libre (ej. "Aeropuerto Ezeiza", "Sucursal centro").

**Cotización (obligatoria):** no se puede guardar la reserva sin un precio total. Hay dos caminos:

1. **Desde las tarifas del vehículo:** al seleccionar un vehículo, aparecen botones con todas sus tarifas activas (diaria, semanal, mensual). El sistema resalta en azul con un tilde la tarifa que corresponde según la duración elegida (menos de 7 días → diaria, 7 a 29 → semanal, 30 o más → mensual). Clic en cualquier botón aplica ese precio por día y calcula el total automáticamente. Si el vehículo no tiene tarifas cargadas, no aparecen los botones y hay que ir por el segundo camino.

2. **Precio especial (manual):** el operador escribe el precio por día y el total se calcula solo (días × precio), o escribe el total directamente y el precio por día se calcula dividiendo. Ambos campos están sincronizados.

**Late checkout (opcional):** si el cliente devuelve después del horario habitual (mediodía), se puede marcar y cargar un cargo adicional.

**Garantía o depósito:** se elige el tipo:
- **Sin garantía** (default)
- **Efectivo:** se ingresa el monto que se retiene
- **Transferencia:** se ingresa el monto que se recibe por transferencia
- **Tarjeta:** aparecen campos para titular, número de tarjeta y vencimiento. Estos datos quedan guardados en la reserva.

**Cobros y anticipos:**
- **Forma de pago prevista:** se anota cómo se cobrará el alquiler (efectivo, transferencia, etc.).
- **Anticipo:** si el cliente dejó dinero adelantado, se carga el monto, la fecha y el medio de pago.

**Notas:** texto libre.

### 5.5 Detección automática de problemas al crear

Al guardar la reserva, el sistema verifica:

- **Solapamiento con otras reservas del mismo vehículo:** si hay conflicto, lo avisa con un cartel pero no bloquea (a veces el operador sabe que va a haber tiempo suficiente entre uno y otro).
- **Vehículo todavía alquilado:** si el vehículo seleccionado tiene un alquiler en curso, también lo avisa pero no bloquea.

### 5.6 Editar y cancelar una reserva

- **Editar:** se pueden cambiar fechas, horas, lugares, precio, notas y datos de garantía mientras la reserva esté en estado confirmada o activa.
- **Cancelar:** solo se puede cancelar una reserva en estado **confirmada** (antes del check-out). El vehículo vuelve a quedar disponible y la reserva queda como cancelada en el historial.

### 5.7 Check-out — Entrega del vehículo al cliente

Cuando llega el día y el cliente viene a buscar el auto, el operario hace el **Check-out**. Este paso es **puramente operativo** — no se piden datos de plata acá.

Se abre el modal de Check-out y se completa:

- **Fecha y hora exacta de entrega** (por defecto la fecha y hora pactadas en la reserva, editable).
- **Kilometraje de salida:** se **auto-completa con el kilometraje actual del vehículo registrado en el sistema**. El operario solo confirma o ajusta si la diferencia es mínima.
- **Nivel de combustible:** selector visual con 5 botones de colores: Vacío, ¼, ½, ¾, Lleno.
- **Estado de limpieza:** Limpio / Sucio normal / Requiere lavado profundo.
- **Observaciones:** texto libre con cualquier detalle de la entrega.
- **Garantía:** si la reserva tenía una garantía definida, se muestra como información de solo lectura. El operario la ve pero no la modifica acá.

Al confirmar, el sistema:
- Crea el alquiler asociado a la reserva.
- Cambia la reserva al estado **activa**.
- Marca el vehículo como **alquilado**.
- Actualiza los kilómetros del vehículo en toda la app.
- **Si la reserva tenía un anticipo registrado, lo materializa como un pago real que aparece en la Caja del día automáticamente.**

### 5.8 Alerta amarilla en el calendario (Check-out olvidado)

Si una reserva ya pasó su fecha y hora de inicio pero nadie hizo el Check-out, el sistema lo detecta y muestra **un cartel amarillo de aviso sobre el bloque de la reserva en el calendario**.

Al hacer click en ese cartel, aparece un pop-up preguntando:
- **¿Se entregó en tiempo y forma?** → abre el modal de Check-out con la hora pactada precargada.
- **No, se atrasó (cargar ahora)** → abre el modal con la hora actual.
- **No se entregó (cancelar reserva)** → cancela directamente la reserva.

Esto resuelve el caso de cuando el operario se olvidó de registrar la entrega en el momento.

### 5.9 Check-in — Devolución del vehículo por el cliente

Cuando el cliente trae el auto de vuelta, el operario hace el **Check-in**. Acá sí se centraliza toda la parte financiera.

Se abre el modal de Check-in y se completa:

**Datos operativos:**
- **Fecha de devolución** (por defecto hoy).
- **Hora de devolución** (por defecto la hora pactada de devolución que figura en la reserva — si el cliente llega antes o después, se edita).
- **Kilómetros de llegada** (no puede ser menor al kilometraje de salida).
- **Nivel de combustible al volver.** Si el combustible es menor al que tenía al salir, aparece un aviso amarillo de posible recargo.
- **Estado de limpieza al volver.**
- **Observaciones.**

**Resumen financiero (panel automático):**

El sistema muestra el detalle completo:
- Precio del alquiler
- Cargo de late checkout (si aplica)
- Anticipo ya pagado
- **Saldo base pendiente** = precio + late − anticipo − pagos previos
- Si hay un excedente por horas extra, se muestra estimado debajo

**Cálculo automático de excedente:**

Si el cliente devuelve después de la hora acordada, el sistema calcula cuántas horas se excedió. Hay **40 minutos de gracia**.

- Si el atraso es **menor o igual a 40 minutos** → sin cargo, mensaje verde "Dentro del período de gracia".
- Si es **mayor a 40 minutos** → el sistema sugiere un cargo y el operario elige:
  - **Cobrar completo:** se aplica el monto sugerido (horas × tarifa por hora).
  - **Cobrar parcial:** el operario indica cuántas horas cobrar.
  - **No cobrar (bonificar):** se anula el cargo, pero hay que escribir un motivo.

El cargo por hora se calcula como `tarifa_diaria / 24`. Si el atraso es muy grande puede convertirse en un día completo de cargo.

**Cobrar al cliente ahora (panel nuevo, opcional):**

Un checkbox abre un formulario rápido para registrar el cobro al instante:
- Monto (precompletado con saldo base + excedente)
- Medio de pago (efectivo, transferencia, tarjeta, cheque, echeq, cuenta corriente)
- Fecha del cobro (por defecto hoy)
- Notas opcionales

Esto cubre tres escenarios:
- **Paga el total:** el alquiler queda saldado.
- **Paga una parte:** queda el resto como saldo pendiente, visible en la Caja.
- **No paga ahora (no se marca el checkbox):** todo queda como deuda y aparece en "Saldos Pendientes" de la Caja para cobrarlo después.

**Resolución de garantía:**

Si la reserva tenía garantía definida, aparece el bloque para decidir qué hacer:
- **Devuelta:** se le devuelve completa al cliente.
- **Retención parcial:** el cliente recibe parte y la empresa retiene el resto. Se indica el monto a devolver.
- **Retenida (siniestro):** queda retenida pendiente de resolución. Esto genera una alerta en notificaciones.

Al confirmar el Check-in, el sistema:
- Cambia la reserva al estado **finalizada**.
- Marca el vehículo como **disponible** (o como **en transición** si hay un nuevo alquiler programado en menos de 4 horas).
- Actualiza los kilómetros del vehículo con el KM de devolución.
- Si se cargó un cobro, lo registra como pago en la Caja del día.
- Si el medio de pago fue "cuenta corriente", también actualiza la cuenta corriente del cliente.
- Refresca todas las pantallas (calendario, dashboard, notificaciones, reportes).

### 5.10 Extensión de un alquiler

Si el cliente quiere quedarse más días, el operario hace click en **"Extender"** desde la fila del alquiler activo en el listado de reservas, o desde el modal de información de la reserva en el calendario.

Se ingresa la nueva fecha y hora de fin. El sistema:
- Verifica que el vehículo esté libre en ese período. Si hay solapamiento con otra reserva, devuelve un error con los datos del conflicto.
- Recalcula el precio total según la nueva duración. Puede pasar de tarifa diaria a semanal, por ejemplo.
- Muestra una pantalla de resumen comparando: fecha anterior vs nueva, días adicionales, precio anterior vs nuevo, diferencia a cobrar.

> **Punto pendiente de definir:** ver sección 15.3 — cómo y cuándo se cobra la diferencia de la extensión.

### 5.11 Alerta en el listado de reservas

En la página de Reservas, arriba del todo, aparece un cartel amarillo si hay vehículos cuya fecha de devolución ya pasó y el cliente no devolvió el auto. Dice cuántos son y los muestra con patente, nombre del cliente y fecha vencida. Es solo un aviso — no bloquea ninguna acción.

### 5.12 Acciones rápidas desde la fila de la reserva

En el listado de Reservas, cada fila tiene botones según el estado:

| Estado de la reserva | Botones disponibles |
|---|---|
| Confirmada (todavía no se entregó) | Editar · Cancelar · **Check-out** |
| Activa (en uso) | Extender · **Check-in** |
| Finalizada | — (solo lectura) |
| Cancelada | — (solo lectura) |

### 5.13 Hacer click sobre una reserva en el calendario

Al hacer click sobre cualquier bloque de reserva en el calendario de ocupación (sea timeline o agenda), se abre un **modal de información de la reserva** con todos los datos relevantes:
- Número de reserva y badge de estado
- Vehículo (marca, modelo, patente)
- Cliente
- Período de la reserva (fechas y horas)
- Lugar de entrega y devolución
- Precio total y anticipo (si lo hay)
- Notas
- Avisos contextuales (si hay check-out o check-in vencido)

Y abajo, botones de acción según el estado:
- Si está confirmada → botones Check-out, Editar, Cancelar.
- Si está activa → botones Check-in, Extender, Editar.
- Si está finalizada o cancelada → solo lectura.

Cada botón abre el formulario correspondiente sin perder el contexto.

---

## 6. Calendario de Ocupación

Pantalla central del sistema. Muestra visualmente qué vehículos están ocupados en qué fechas. Tiene dos vistas:

### 6.1 Vista Timeline (escritorio)

Una grilla horizontal donde:
- Cada **fila** es un vehículo de la flota (con foto y patente).
- Cada **columna** es un día (se muestran 120 días).
- Las **reservas** aparecen como bloques de colores sobre la grilla, ocupando los días que duran. Los colores indican el estado:
  - **Azul:** confirmada
  - **Verde:** activa (en curso)
  - **Gris:** finalizada
  - **Rojo:** cancelada (tachada)

**Información en cada bloque:** nombre del cliente, hora de entrega y devolución, lugar.

**Funcionalidades:**
- **Click en celda vacía** → abre el formulario de nueva reserva con vehículo y fecha precargados.
- **Click sobre un bloque de reserva** → abre el modal de información detallada (ver 5.13).
- **Drag and drop de filas** → el operario puede reordenar los vehículos como prefiera (el orden se guarda).
- **Botón "Hoy"** y selector "Ir a fecha" para saltar directamente a una fecha específica.
- **Navegación mes anterior / mes siguiente.**

**Alerta amarilla sobre un bloque:** indica que esa reserva ya pasó su hora de inicio y nadie registró el Check-out. Al hacer click, abre el pop-up de resolución (entregado en tiempo / atrasado / cancelar).

### 6.2 Vista Agenda (celular y escritorio)

Optimizada para celular. Tiene dos partes:

- **Arriba: calendario mensual** con puntos de colores en los días que tienen reservas. El día de hoy queda destacado. Se navega entre meses con flechas.
- **Abajo: panel del día seleccionado** con la lista de todas las reservas de ese día, cada una en una tarjeta con: nombre del cliente, vehículo, patente, badge de estado, horario de entrega y devolución, lugar.

Al hacer click sobre una tarjeta también se abre el modal de información de la reserva.

Botón "Nueva reserva" abajo que pre-carga la fecha seleccionada.

---

## 7. Dashboard y Flujo del Día

Cuando se entra al sistema, la pantalla principal es **Ocupación**. Arriba se ve el calendario de ocupación (timeline o agenda según el dispositivo). Abajo hay un panel expandible llamado **Flujo del Día**.

### 7.1 ¿Qué muestra el Flujo del Día?

Es una **línea de tiempo en vivo** de todo lo que pasó hoy:

- **Nuevas reservas creadas hoy** (con su hora de creación).
- **Check-outs (entregas)** programados y/o realizados. Muestra:
  - La **hora pactada** (lo que había que hacer).
  - La **hora real** en la que se entregó el auto.
- **Check-ins (devoluciones)** programados y/o realizados, con misma comparación pactada vs real.
- **Cobros** que ingresaron hoy: monto, medio de pago, cliente.
- **Gastos** cargados hoy: tipo, descripción, monto.

El panel se actualiza automáticamente cada 15 segundos sin necesidad de refrescar la pantalla. Permite ver de un vistazo si todo el día fluyó bien o si hay desfasajes.

Se puede expandir y contraer arrastrando el borde superior.

### 7.2 ¿Para qué sirve?

Para que el dueño o el operario vean en cualquier momento del día:
- "¿Qué tengo que hacer hoy?" (entregas y devoluciones pendientes)
- "¿Qué se hizo hoy?" (todo lo cumplido)
- "¿Cuánto cobramos hoy?"
- "¿Hay alguna entrega o devolución que se está atrasando?"

---

## 8. Multas

Para gestionar fotomultas y poder identificar al responsable.

### 8.1 Flujo principal — buscador inteligente

Cuando llega una fotomulta, el operario hace:

1. En la sección **Multas**, ingresa:
   - Patente del vehículo multado
   - Fecha de la infracción
   - Hora (opcional)
2. El sistema busca automáticamente qué alquiler estaba activo en ese momento para esa patente.
3. Si lo encuentra, muestra:
   - Nombre del cliente responsable
   - DNI
   - Período del alquiler
   - Número de alquiler
4. El operario completa: monto de la multa, descripción, notas.
5. Se confirma y la multa queda registrada en estado **pendiente** asociada al cliente correcto.

Si no encuentra un alquiler (por ejemplo, fecha incorrecta), avisa con un mensaje claro y permite cargar la multa manualmente desde el perfil del cliente.

### 8.2 Cargar una multa desde el cliente

También se puede ir directamente al perfil de un cliente → pestaña **Multas** → botón "Cargar multa", y completar los datos.

### 8.3 Estados de la multa

```
pendiente → imputada → cobrada
                ↓
            apelando
```

- **Pendiente:** la multa fue registrada pero todavía no se gestionó.
- **Imputada:** se le cargó formalmente al cliente (ej. se le notificó).
- **Cobrada:** el cliente pagó la multa, queda cerrada.
- **Apelando:** está en proceso de apelación.

El operario cambia el estado manualmente desde la lista de multas.

### 8.4 Avisos automáticos

Las multas en estado pendiente generan una alerta amarilla en el panel de notificaciones, para que no se queden olvidadas.

---

## 9. Finanzas (Caja, Echeqs, Cuentas Corrientes)

Todo lo financiero está unificado bajo **una sola sección llamada "Finanzas"** con tres pestañas: Caja, Echeqs y Cuentas Corrientes.

### 9.1 Pestaña Caja

Es la vista de movimientos de dinero del día.

**Selector de fecha** arriba (por defecto hoy) + botón para refrescar.

**Cards arriba con resumen del día:**
- Ingresos totales
- Egresos totales
- Balance (ingresos − egresos)

**Desglose por medio de pago:** muestra cuánto entró por cada método (efectivo, transferencia, tarjeta, cheque, echeq, cuenta corriente) con badges de colores distintos.

**Lista de cobros del día:** quién pagó, qué alquiler, cuánto, por qué medio, si lleva factura o no, notas. Cada cobro tiene botón para eliminarlo.

**Lista de gastos del día:** tipo de gasto, descripción, monto. Cada gasto linkea al vehículo correspondiente.

**Panel "Saldos Pendientes" (siempre visible):**

Lista de clientes que deben dinero por alquileres ya finalizados. Por cada uno se ve:
- Nombre del cliente
- Patente del vehículo
- Monto pendiente
- Botón rápido para registrar el cobro

Este panel es independiente del filtro de fecha — siempre muestra todas las deudas pendientes.

**Registrar un cobro nuevo:**

Botón en el header abre un formulario:
- Número de alquiler
- Monto
- Medio de pago (efectivo, transferencia, tarjeta, cheque, echeq, cuenta corriente)
- Fecha (por defecto hoy)
- Tilde "con factura"
- Notas

**Comportamiento especial:**
- Si el medio de pago es **cuenta corriente**, el sistema busca o crea la cuenta corriente del cliente y descuenta automáticamente el monto de su saldo.
- Si el medio de pago es **echeq**, se puede vincular con un echeq en cartera. *(Esta vinculación es manual hoy — ver dudas, sección 15.2).*

**Eliminar un cobro:** elimina el registro definitivamente. Es intencional, los cobros son contables. Si el cobro había sido por cuenta corriente, el movimiento de CC no se revierte solo — hay que hacerlo a mano.

### 9.2 Pestaña Echeqs

Se registran los cheques electrónicos.

**Dos tabs internos:**
- **← Recibidos:** los que recibimos de clientes.
- **→ Emitidos:** los que nosotros emitimos a proveedores.

**Crear un echeq:**
- Tipo (recibido / emitido)
- Monto
- Contraparte (nombre del cliente o proveedor)
- Banco
- Número de cheque
- Fecha de emisión
- Fecha de cobro
- Opcionalmente vincular a un alquiler (si es cobro de cliente) o a un gasto (si es pago a proveedor)
- Notas

**Estados posibles y transiciones:**

```
en cartera ──→ depositado ──→ cobrado
     │            └────────→ rechazado
     └──→ endosado ──→ cobrado
     └──────────────→ rechazado
     └──[ vence sin cobrar ]──→ vencido
```

- **En cartera:** lo tenemos en mano, sin movimiento.
- **Depositado:** se llevó al banco.
- **Endosado:** se le pasó a un tercero (ej. proveedor).
- **Cobrado:** efectivamente entró el dinero.
- **Rechazado:** el banco lo rechazó (sin fondos, firma, etc.).
- **Vencido:** pasó la fecha de cobro y nunca se cobró.

**Aviso automático:** banner en la página cuando hay echeqs próximos a cobrar (dentro de los próximos 7 días).

Cada tarjeta de echeq muestra: monto destacado, contraparte, banco, número, fechas, días restantes para cobro con semáforo de colores, badge de estado y un menú para cambiar el estado según donde esté en el flujo.

### 9.3 Pestaña Cuentas Corrientes

Cada cliente puede tener una cuenta corriente. Sirve para llevar deudas o saldos a favor entre la empresa y el cliente.

**¿Cómo se mueve?**
- **Movimientos automáticos:** cuando se cobra un alquiler con medio "cuenta corriente" en la Caja, se descuenta solo del saldo del cliente.
- **Movimientos manuales:** el operario puede agregar un débito o un crédito con concepto y fecha en cualquier momento.

**Lógica de saldo:**
- **Saldo negativo** = el cliente debe dinero
- **Saldo positivo** = el cliente tiene saldo a favor
- **Saldo cero** = sin deuda, sin saldo

**Vista principal:**

Cards arriba:
- Cantidad de clientes con deuda + total adeudado
- Cantidad de clientes con saldo a favor
- Cantidad de clientes en cero

Lista de todos los clientes con CC, ordenados con los más deudores arriba. Click en una fila abre el detalle.

**Detalle de la cuenta corriente de un cliente:**
- Saldo actual con leyenda (debe / a favor / en cero)
- Formulario para agregar un movimiento manual (tipo, concepto, monto, fecha)
- Historial completo de todos los movimientos (más reciente primero)

También se accede a la CC del cliente desde su perfil → pestaña **Cuenta corriente**.

---

## 10. Reportes

### 10.1 Reporte de Ingresos (por año)

Se elige el año. El sistema muestra:

**Cards arriba con resumen anual:**
- Ingresos totales del año (verde)
- Egresos totales del año (rojo)
- Margen (verde o rojo según signo)

**Gráfico de barras:** ingresos vs egresos mes a mes.

**Tabla con detalle mensual:** mes, ingresos, egresos, margen. Solo aparecen los meses con actividad.

**Botón "Exportar a CSV"** para bajar la planilla.

### 10.2 Reporte de Flota (por período)

Se eligen fecha desde y fecha hasta. El sistema calcula para cada vehículo:

- Cantidad de alquileres en el período
- Días totales que estuvo ocupado
- **Porcentaje de ocupación** (verde si ≥70%, amarillo 40-69%, gris <40%)
- Ingresos generados
- Gastos del período
- Margen

Se ordena por ocupación, más utilizado primero. Hay un gráfico horizontal con el % de ocupación de cada vehículo, y la tabla con el detalle.

También exportable a CSV.

---

## 11. Notificaciones automáticas

En el ícono de campana del menú lateral. El número arriba indica cuántas alertas activas hay (en rojo si alguna es urgente, en ámbar si todas son media o baja).

Al hacer click se abre el panel agrupado por categoría:

### Alertas rojas (urgentes):

- **Check-out pendiente:** reservas que tenían que entregarse hoy y no se entregaron.
- **Check-in pendiente:** alquileres cuya fecha de devolución ya pasó y el auto no volvió.
- **Documentos de vehículos vencidos:** seguro, VTV, etc.
- **Documentos de clientes vencidos:** DNI, licencia.
- **Service vencido:** vehículos que pasaron el km del próximo service.
- **Pagos pendientes:** clientes con deudas de alquileres finalizados hace más de 3 días.

### Alertas amarillas (media urgencia):

- **Garantías sin resolver:** alquileres terminados donde la garantía quedó retenida.
- **Documentos por vencer en los próximos 30 días** (vehículos y clientes).
- **Service próximo:** vehículos a menos de 1.000 km del próximo service.
- **Multas pendientes.**
- **Deudas de 1 a 3 días.**

Cada alerta es clickeable y navega directamente a la sección correspondiente. No hay que marcarlas como leídas — desaparecen solas cuando se resuelve el problema (por ej. cuando se carga el documento renovado, cuando se cobra la deuda, etc.).

Se refresca automáticamente cada 60 segundos.

---

## 12. Cotizador

Sección para armar un presupuesto en PDF antes de confirmar la reserva.

El operario completa:
- Datos de la empresa (nombre, dirección, teléfono)
- Datos del cliente (nombre, DNI)
- Vehículo (elige de la flota o describe libre)
- Fechas de inicio y fin
- Precio por día
- Descuento opcional en porcentaje
- Notas

El sistema calcula: días × precio × (1 − descuento).

Botón **"Generar PDF"** descarga un documento con formato comercial (incluye el logo de la empresa).

> **Pendiente:** hoy el cotizador no guarda nada — cada vez se arma de cero. Falta que las cotizaciones se persistan en el sistema, tengan estados (borrador → enviado → aceptado → vencido), se asocien al historial del cliente, y un botón "Convertir en reserva" que pase el presupuesto a una reserva real con un click.

---

## 13. Tarjeta bancaria del cliente

Sección dentro del perfil de cada cliente, en una pestaña llamada **Tarjeta**.

**Acceso protegido:**
- Al entrar aparece una pantalla con un candado y un input de PIN.
- PIN actual del sistema: `Ubicar123`.
- Sin el PIN no se ven los datos. Se puede bloquear nuevamente con un botón "Bloquear" en cualquier momento.

**Cuando está desbloqueado:**
- Se ve la tarjeta en formato visual de tarjeta bancaria, con gradiente azul.
- El número aparece enmascarado por defecto: `**** **** **** 1234`.
- El CVV aparece como `***`.
- Hay un toggle (ícono de ojo) para revelar el número completo y el CVV.

**Acciones:**
- Crear la tarjeta del cliente (titular, número, vencimiento MM/AA, CVV, DNI del titular).
- Editar.
- Eliminar (este es el único caso en el sistema donde se borra de verdad — la información es sensible y no debería quedar).

**Para qué sirve:** cuando una reserva pide garantía con tarjeta, se puede asociar esta tarjeta del cliente sin tener que reingresar los datos cada vez.

---

## 14. Reglas generales del sistema

### 14.1 Nada se elimina del sistema

Como regla principal, todas las entidades (vehículos, clientes, reservas, documentos) **no se borran**. Cuando el operario "elimina" algo, en realidad queda inactivo — sigue en la base de datos con todo su historial y puede reactivarse cuando se quiera. Esto preserva la trazabilidad histórica (saber qué pasó con cualquier vehículo o cliente, aunque ya no esté operativo).

**Excepciones (sí se eliminan de verdad):**
- **Pagos** de la Caja — son registros contables, la eliminación es intencional.
- **Gastos** de los vehículos — mismo criterio.
- **Tarjetas bancarias** de los clientes — información sensible, no debe quedar.

### 14.2 Foto del vehículo y archivos

Los archivos (fotos de vehículos, documentos) se guardan en el sistema y se pueden ver y descargar desde sus secciones correspondientes.

### 14.3 Idioma y horarios

- Toda la interfaz está en español.
- Todas las fechas y horas se manejan en zona horaria **Argentina (Buenos Aires)**.

### 14.4 Aplicación de tarifas (regla automática)

Cuando el sistema tiene que aplicar una tarifa (al cotizar una reserva, al calcular un excedente, etc.), busca en este orden:
- Primero busca la tarifa específica del vehículo.
- Si no hay, usa una tarifa global (válida para todos los vehículos).
- Si ninguna existe, no puede cotizar y avisa al operario.

La banda se elige por duración del alquiler:
- Menos de 7 días → tarifa **diaria**
- De 7 a 29 días → tarifa **semanal**
- 30 días o más → tarifa **mensual**

### 14.5 Control 24 horas y gracia de 40 minutos

Cuando un alquiler se devuelve tarde, el sistema:
- No cobra si el atraso es de hasta 40 minutos (gracia).
- Cobra las horas netas (excedente menos los 40 minutos de gracia) a una tarifa de `tarifa_diaria / 24` por hora.
- Si el atraso supera cierto umbral, puede convertir el cargo en un día completo.

### 14.6 Estados internos del vehículo

Aunque el operario solo ve **"En uso"** o **"Disponible"** en la tabla, internamente el sistema maneja más estados (reservado, en transición, fuera de servicio). Estos se usan para reglas internas (ej. el calendario, los cálculos de ocupación), pero no se exponen al operador para no confundir la vista.

---

## 15. Dudas y decisiones operativas pendientes

> Este capítulo reúne **temas a definir con el dueño** sobre el funcionamiento actual del sistema. Son decisiones que afectan cómo opera el negocio en el día a día y necesitan acuerdo.

### 15.1 Cuentas corrientes — flujo no terminado de definir

Hoy la cuenta corriente del cliente se mueve sola cuando se cobra un alquiler con medio de pago "cuenta corriente", y también se mueve cuando el operario agrega un movimiento manual (débito o crédito).

**Preguntas para definir con el dueño:**

- ¿La cuenta corriente sólo aplica a empresas (clientes corporativos) o también a particulares frecuentes?
- ¿Tiene un **límite de crédito** por cliente? (cuánto puede deber máximo). Si lo supera, ¿el sistema debería avisar? ¿bloquear?
- Cuando un cliente paga su deuda de cuenta corriente (no asociado a un alquiler específico), ¿cómo se registra ese pago? ¿va a la Caja del día como un cobro y al mismo tiempo cancela el saldo de CC? ¿O es un movimiento puramente interno?
- ¿Hay que generar un **resumen / estado de cuenta** periódico (mensual) para enviar al cliente?
- ¿El cliente debería poder ver su cuenta corriente desde una vista pública (cuando exista la web), o sólo el admin la ve?
- Si un cobro hecho con CC se elimina de la Caja, hoy el movimiento en la CC no se revierte solo. ¿Querés que el sistema lo revierta automáticamente?
- ¿Hay distintas "cuentas corrientes" por concepto (alquiler, multas, garantías) o todo va a la misma?

### 15.2 Echeqs — flujo no terminado de definir

Hoy se registran echeqs recibidos y emitidos, con sus estados completos, pero hay varias preguntas operativas sin resolver:

- Cuando un cliente paga con echeq, ¿el cobro impacta **inmediatamente** en la Caja del día o queda "pendiente" hasta que el echeq se cobre realmente? Hoy se registra como cobro al recibirlo.
- Si un echeq se **rechaza**, ¿qué hace automáticamente el sistema? ¿Genera una deuda en la cuenta corriente del cliente? ¿Una notificación urgente? ¿Hay que reabrir el saldo del alquiler asociado?
- ¿Cuando un echeq pasa a "vencido" debería disparar una alerta automática?
- En el **endoso** de echeqs, ¿hace falta registrar a qué proveedor se endosó? ¿Vincularlo con un gasto?
- ¿Imprimir o exportar un PDF con el detalle de un echeq?
- ¿Necesitan un **reporte de echeqs por vencer / cobrar este mes** dedicado, además del aviso en pantalla?
- Hoy la integración entre Caja y Echeqs es manual (no hay un botón "convertir este cobro en echeq registrado"). ¿Querés que cuando se cobre con medio "echeq" en Caja, se cree automáticamente el echeq en cartera?

### 15.3 Cómo cobrar la extensión de un alquiler

Cuando un alquiler se extiende, el sistema recalcula el precio total y muestra la diferencia a cobrar. **Pero no hay un flujo claro para cobrar esa diferencia.**

**Preguntas para definir:**

- ¿La diferencia se cobra en el momento de extender, o queda pendiente hasta el check-in?
- ¿Debería aparecer automáticamente en "Saldos pendientes" de la Caja apenas se confirma la extensión?
- ¿El modal de extensión debería tener su propio bloque "Cobrar diferencia ahora" (como el del check-in)?
- Si el cliente extiende varias veces, ¿cada extensión genera su propio cargo independiente o se suma todo en la cuenta?
- Si el precio recalculado por la extensión cambia de banda (ej. pasa de tarifa diaria a semanal), ¿se aplica retroactivamente o sólo desde la extensión?

### 15.4 Estados visibles del vehículo en Flota

Hoy en la tabla de Flota se muestran **solo dos estados**: "En uso" o "Disponible". Internamente el sistema maneja más estados (reservado, en transición, fuera de servicio).

**Preguntas:**

- ¿Está bien así, o querés que también aparezca un estado distinto cuando el vehículo está **fuera de servicio** (en taller, dado de baja temporal)?
- ¿La fila de un vehículo en mantenimiento debería verse diferente (ícono de llave inglesa, color distinto)?
- ¿Cuando un vehículo tiene una reserva confirmada para mañana, debería aparecer "Reservado" o seguir como "Disponible"?

### 15.5 Pagos y temas contables

- ¿Es necesario que el sistema integre con AFIP en algún momento (factura electrónica, libro IVA)?
- ¿Quién factura — un sistema externo (Tango, Bejerman, Contabilium) o hay que generar facturas desde acá?
- Hoy los pagos se pueden eliminar de la Caja. ¿Querés mantener eso así, o pasarlo a una **anulación con motivo registrado** (que el pago no se borre, sino que quede como "anulado")?
- ¿Necesitan un **arqueo de caja** diario (al cerrar el día, comparar lo que está en el sistema con lo que hay en la caja física)?
- ¿Recibos para los cobros? ¿Qué formato?

### 15.6 Operativa diaria y permisos de usuarios

- Hoy no hay distinción entre usuarios (todos pueden hacer todo). Cuando se integre el login real, ¿qué **roles** vamos a tener? ¿Qué puede hacer cada rol?
  - Sugerido: **Dueño / Admin** (todo), **Operario** (operaciones del día, sin reportes financieros sensibles), **Solo lectura** (ver pero no modificar). Necesita confirmación.
- ¿Quién puede eliminar pagos? ¿Quién puede dar de baja vehículos? ¿Quién puede cambiar tarifas?
- ¿Querés que cada acción importante (crear reserva, cobrar, dar de baja) quede registrada con el nombre del usuario que la hizo? (auditoría)

### 15.7 Garantías

- Cuando una garantía queda "retenida por siniestro", ¿qué pasa después? ¿Hay un flujo para devolver parte / convertirla en cobro / etc?
- ¿Necesitan un **reporte de garantías en curso** (cuánto dinero está retenido en garantías hoy)?
- ¿Vinculación con multas — si llega una multa de un alquiler que tenía garantía, ¿se descuenta automáticamente?

### 15.8 Contratos digitales

- Hoy no hay generación de contratos firmados (es la sección "Contratos" del menú, que está vacía).
- ¿Querés que al hacer un Check-out se genere automáticamente un contrato PDF con todos los datos del cliente, vehículo, fechas, precio, garantía?
- ¿El cliente lo firma a mano (impreso) o necesitan firma digital?
- ¿Sin contrato firmado no se puede entregar el auto (bloqueante), o solo un aviso?

### 15.9 Notificaciones por email / WhatsApp

Hoy todas las alertas son en pantalla (dentro del sistema). Sería útil:

- ¿Avisar al cliente cuando se acerca su fecha de devolución? ¿Por email o WhatsApp?
- ¿Avisar al operario al inicio del día qué entregas y devoluciones tiene programadas?
- ¿Recordatorios de pago a clientes con saldos vencidos?
- ¿Avisos al dueño cuando hay alertas urgentes (documento vencido, devolución muy atrasada)?

---

## 16. Próximas funcionalidades a desarrollar

> Este capítulo cubre las **funcionalidades grandes que el dueño mencionó** o que están en el horizonte. Cada una incluye una propuesta de cómo podría funcionar y las preguntas concretas para definir el alcance.

---

### 16.1 🌐 Sistema de Reservas Online (integración con la web pública)

**Esta es la funcionalidad central que el dueño mencionó como una de las prioridades del proyecto:** que la web pública de la empresa tenga un sistema de reservas integrado al sistema interno de Ubicar Rent. Que los clientes finales puedan buscar disponibilidad y solicitar una reserva sin necesidad de llamar por teléfono.

#### 16.1.1 Propuesta de flujo (a confirmar y refinar)

**Paso 1 — El cliente entra a la web pública:**
- Ve un buscador de disponibilidad en la home.
- Ingresa:
  - Fecha y hora de inicio
  - Fecha y hora de fin
  - Lugar de entrega
  - Lugar de devolución (puede ser igual al de entrega)

**Paso 2 — El cliente NO elige un auto específico, sino una CATEGORÍA:**
- "Auto chico" (Fiat Cronos, Chevrolet Onix, etc.)
- "Auto mediano"
- "Auto grande / familiar"
- "Camioneta"
- (Las categorías exactas se definen con el dueño.)

La idea es que el cliente no se "case" con un vehículo específico que después puede no estar disponible. El sistema le asigna uno del pool de esa categoría al confirmar.

**Paso 3 — El cliente ve el precio estimado:**
- Total calculado según las fechas (días × tarifa de la categoría).
- Si las fechas caen en un período de precio especial (ver 16.2), aparece el precio promocional destacado.

**Paso 4 — El cliente completa sus datos:**
- Nombre completo
- DNI
- Email
- Teléfono
- Notas (vuelo si viene del aeropuerto, etc.)

**Paso 5 — El cliente envía la solicitud:**
- La solicitud llega al sistema Ubicar Rent como una **reserva pendiente de aprobación**.
- Le aparece al operario en un nuevo panel "Solicitudes web" o como notificación.

**Paso 6 — El operario revisa y aprueba o rechaza:**
- Ve la categoría solicitada, fechas, datos del cliente.
- Analiza qué vehículo específico ofrecerle (basado en disponibilidad real).
- Acepta o rechaza la solicitud.

**Paso 7 — Confirmación automática al cliente:**
- Si se aprueba: el cliente recibe un email automático con todos los datos del auto asignado, el contrato, instrucciones para retirar.
- Si se rechaza: el cliente recibe un email con la decisión y motivo.

#### 16.1.2 Preguntas concretas para conversar con el dueño

**Sobre el pago:**
- ¿El cliente paga online (Mercado Pago, tarjeta) o paga al retirar el auto?
- Si paga online, ¿paga un **anticipo** (ej. 30%) o el **total**?
- Si paga anticipo, ¿es reembolsable si cancela con anticipación?

**Sobre la aprobación:**
- ¿La aprobación es **siempre manual** (un operario debe revisar) o puede ser **automática** si hay un vehículo disponible que cumple la categoría?
- ¿Querés un sistema de aprobación automática durante horario comercial y manual fuera de horario?
- Si una solicitud no se aprueba en X horas (ej. 24h), ¿se auto-cancela?

**Sobre la visibilidad de la flota:**
- ¿La web mostrará el catálogo completo de autos con fotos y características, o sólo categorías abstractas?
- ¿Querés mostrar la cantidad disponible ("Quedan 2 autos de esta categoría") o no?

**Sobre los clientes:**
- ¿El cliente puede crear una cuenta y ver su historial de reservas anteriores, o cada reserva es anónima?
- ¿Permitís cancelaciones desde la web hasta cierto plazo (ej. hasta 48hs antes)?
- ¿La empresa quiere una **lista de clientes bloqueados** para no aceptarles reservas online (clientes problemáticos del pasado)?
- ¿Las multas o deudas previas bloquean nuevas reservas online del mismo cliente?

**Sobre las tarifas web:**
- Para mostrar precios en la web, ¿usamos las tarifas existentes del sistema, o querés un esquema de precios **específico para la web** (que pueden ser distintos, ej. precios web 10% más altos para incentivar reservas por teléfono)?

**Sobre la prevención de abuso:**
- ¿Querés captcha para evitar bots?
- ¿Confirmación por email (validar email antes de aceptar la reserva)?
- ¿Confirmación por SMS para validar teléfono?

**Sobre la comunicación al cliente:**
- ¿El email debe ser con la imagen y branding de la empresa? ¿Tienen una plantilla?
- ¿Querés también enviar el contrato PDF adjunto en el email de confirmación?

#### 16.1.3 Lo que ya está listo en el sistema para soportar esto

- Cálculo automático de precio según duración y tarifa.
- Estado "pendiente" para reservas.
- Modelo de cliente completo con todos los datos.
- Lógica de detección de solapamientos.

#### 16.1.4 Lo que falta construir

- **Frontend público en la web** (separado del sistema interno, con look comercial).
- **Backend público:** consultas de disponibilidad y precios accesibles desde la web sin login.
- **Sistema de aprobación/rechazo** en la pantalla del operario (panel nuevo).
- **Lógica de asignación automática** de vehículo a categoría.
- **Sistema de email transaccional** (Resend, SendGrid, etc.).
- **Pasarela de pago online** (Mercado Pago) — si va a haber cobro web.
- **Captcha o anti-spam.**
- **Plantillas de email** (confirmación, rechazo, recordatorio, cancelación).

---

### 16.2 🎄 Precios por fechas especiales / promocionales

**El dueño mencionó que quiere poder fijar precios distintos en fechas particulares**, por ejemplo:
- Precio promocional para Navidad / Año Nuevo.
- Precio especial para vacaciones de invierno.
- Aumento para fines de semana largos.
- Descuento en temporada baja.

#### 16.2.1 Propuesta de funcionamiento

**Crear un período de precio especial:**
- Nombre (ej. "Vacaciones de verano 2027")
- Fecha desde
- Fecha hasta
- Precio (diario / semanal / mensual)
- ¿Aplica a toda la flota / a una categoría / a vehículos específicos?
- ¿Es un precio fijo o un % de descuento sobre el precio normal?
- Color/etiqueta visual para reconocerlo en el calendario.

**Cuando el sistema cotiza una reserva** (tanto en el sistema interno como en la web pública), revisa si las fechas tocan algún período especial y aplica esa tarifa en lugar de la habitual.

#### 16.2.2 Preguntas concretas para conversar con el dueño

**Sobre el alcance:**
- ¿El precio especial es **para toda la flota** o **por vehículo específico**?
- ¿Es por **categoría** de vehículo (ej. todos los autos chicos)?
- ¿Puede haber **varios precios especiales superpuestos** (ej. "Navidad" + "Fin de Año")? Si sí, ¿cuál tiene prioridad?

**Sobre la granularidad temporal:**
- ¿El precio especial es solo en rangos de fechas continuas, o también puede ser **por día de la semana** (ej. los viernes y sábados son siempre más caros)?
- ¿Aplica solo a tarifa diaria, o también a la semanal y mensual?

**Sobre alquileres que cruzan fechas mixtas:**

Si un cliente alquila del 20 de diciembre al 5 de enero, y hay precio especial del 24 al 1, ¿cómo se cobra?
- **Opción A — Prorrateado día por día:** precio especial los días dentro del período, precio normal los otros. (Más justo pero más complejo.)
- **Opción B — Si toca aunque sea un día especial, se cobra todo a precio especial.** (Simple pero puede ser caro o barato injustamente.)
- **Opción C — Precio normal:** el precio especial no aplica si la reserva no es enteramente dentro del período. (Solo precio promo si todo cae dentro.)

**Sobre descuentos y promos:**
- ¿Querés además **precios promocionales con descuento** sobre el precio normal (ej. -20% en temporada baja) además de precios fijos?
- ¿Códigos de descuento aplicables por el cliente (ej. "VERANO20")?

**Sobre la visibilidad para el cliente:**
- En la web pública, ¿el cliente debería ver el precio promocional **destacado** (badge "Precio Navidad", "Promo")?
- ¿Mostrar también el "ahorro" o "% de descuento" respecto al precio normal?
- ¿Permitir que el cliente filtre por "ofertas / promociones activas"?

**Sobre la gestión:**
- ¿Quién puede cargar precios especiales — solo el dueño, o cualquier operario admin?
- Si se crea un precio especial **después** de que ya hay reservas hechas en ese período con la tarifa vieja, ¿se respeta lo cobrado o se ofrece la opción de reliquidar?
- ¿Necesitan un calendario que muestre los períodos especiales pintados con colores (ej. verde = promo barata, rojo = precio alto)?

**Sobre control de excesos:**
- ¿Hay un precio mínimo absoluto (por debajo del cual nunca se puede ir, ni con promo)?
- ¿Hay un techo (precio máximo en fechas especiales para no espantar clientes)?

---

### 16.3 ✍️ Contratos digitales firmados

Hoy el menú lateral tiene una sección "Contratos" que está vacía. La idea sería:

- Al hacer Check-out (entrega) se genera un PDF con todos los datos del alquiler, cliente, vehículo, garantía, condiciones.
- El cliente lo firma — opciones:
  - Firma a mano sobre tablet/celular (firma digital simple)
  - Firma digital con servicio externo (DocuSign, Tribunal de Firma Digital)
  - Impresión + firma a mano + escaneo
- El contrato firmado se guarda asociado al alquiler.
- Posibilidad de bloquear el Check-out si no hay contrato firmado (regla a definir).

**Preguntas:**
- ¿Qué nivel de validez legal necesitan? Esto define la tecnología (firma simple vs. firma digital certificada).
- ¿Quién genera el contrato — el operario al hacer el Check-out, o se le manda al cliente por email para que firme antes?
- ¿Sin contrato firmado no se entrega el auto (bloqueante) o solo es un aviso?
- ¿Plantilla de contrato — tienen una que usan hoy?

---

### 16.4 📋 Mejoras al Cotizador

Hoy el cotizador genera un PDF pero no guarda nada. Mejoras pendientes:

- Persistir los presupuestos en el sistema (que queden en una lista para consultarlos después).
- Estados de un presupuesto: borrador → enviado → aceptado → vencido.
- Botón **"Convertir en reserva"** — si el cliente acepta el presupuesto, con un click se crea la reserva con todos los datos ya cargados.
- Historial de cotizaciones por cliente (ver desde el perfil cuántos presupuestos le hice y cuáles aceptó).
- Enviar el presupuesto directamente por email desde el sistema.

---

### 16.5 💳 Pasarela de pago integrada (Mercado Pago)

Para cobrar online (sea anticipos de reservas web, saldos pendientes, etc.). Permitiría:
- El cliente paga con un link enviado por WhatsApp o email.
- El pago se registra automáticamente en la Caja con el medio "Mercado Pago".
- Comprobante automático al cliente.

---

### 16.6 📱 App móvil (a futuro)

Aunque la web actual funciona en celular, una app nativa permitiría:
- Notificaciones push.
- Trabajar offline (cargar y sincronizar después).
- Cámara para escanear DNI o tomar fotos del estado del vehículo en el Check-in/Check-out.

---

### 16.7 🔧 Otros pendientes técnicos / menores

- **Botón "Ver cobros" dentro de cada reserva:** que abra el detalle de pagos asociados sin tener que ir a la Caja.
- **Integrar echeqs en las notificaciones generales:** hoy los echeqs próximos a vencer solo se ven en su propia pestaña.
- **Subir el sistema a producción:** hoy corre en la computadora local. Hay que ponerlo en un servidor (Railway o similar) para que sea accesible desde internet.
- **Login real:** integración con Clerk para que cada usuario tenga su cuenta y rol.
- **Backup automático de la base de datos.**

---

## Cierre

Este documento es una foto del sistema al **2026-06-26**. Refleja todo lo construido, lo decidido y lo que queda por definir.

La idea es **revisarlo en vivo con el dueño** y por cada sección preguntar:
1. ¿Lo que está descripto refleja cómo querés que funcione?
2. ¿Hay algo que falta o que querrías cambiar?
3. En las secciones de Dudas y Próximas funcionalidades, ¿podemos ir tomando decisiones?

Una vez recorrido, este documento se actualiza con las decisiones tomadas para que quede como **acta operativa de referencia** del sistema.

# Progreso Ubicar Rent — Plan de Ejecución

**Fecha inicio:** 2026-06-25  
**Última actualización:** 2026-06-26  
**Objetivo:** Completar todos los módulos funcionales del sistema.  
**Excluidos de esta sesión:** Cotizador (frontend-only ya existe), Contratos.

---

## FASE A — Backend: Documentos de clientes + Tarjeta de cliente
**Estado:** ✅ COMPLETADO

### A1. Migración BD
- [x] Agregar columna `cliente_id` (nullable) a tabla `documentos` → `009_documentos_cliente_tarjeta.py`
- [x] Crear tabla `tarjetas_cliente` (nombre_completo, nro_tarjeta, vencimiento, codigo_3_digitos, dni_titular)

### A2. Modelos SQLAlchemy
- [x] Actualizar `Documento` con `cliente_id` optional FK + relación
- [x] Crear modelo `TarjetaCliente` con campos protegidos

### A3. Schemas Pydantic
- [x] Actualizar `DocumentoResponse` con `cliente_id: int | None`
- [x] Crear schemas `TarjetaClienteCreate / Response` con validadores (MM/AA, 3 dígitos)

### A4. Services
- [x] `DocumentoService.list_by_cliente()` + `create_for_cliente()`
- [x] Rutas de archivos: `clientes/{id}/documentos/{doc_id}-{uuid}.{ext}`

### A5. Routers
- [x] `GET /clientes/{id}/documentos` + `POST /clientes/{id}/documentos` (multipart)
- [x] `GET /clientes/{id}/tarjeta` + `PUT /clientes/{id}/tarjeta` + `DELETE /clientes/{id}/tarjeta`
- [x] PIN check via header `x-tarjeta-pin: Ubicar123` en todos los endpoints de tarjeta

---

## FASE B — Frontend: Documentos de clientes
**Estado:** ✅ COMPLETADO

- [x] Actualizar `useDocumentos` con namespace separado `vehiculo` / `cliente`
- [x] Hooks: `useDocumentosCliente`, `useCreateDocumentoCliente`, `useDeleteDocumentoCliente`
- [x] Crear `ClienteDocumentosTab` (tipos: dni, licencia, contrato, otro; badges vencido/por vencer)
- [x] Agregar tab "Documentos" en `ClienteDetail`
- [x] Mostrar "CUIT" en lugar de "DNI/CUIT" cuando tipo=empresa (header + tab Datos)

---

## FASE C — Frontend: Tarjeta de cliente (protegida)
**Estado:** ✅ COMPLETADO

- [x] Hook `useTarjeta` con PIN en header
- [x] Componente `TarjetaTab` con pantalla de contraseña (PIN: Ubicar123)
- [x] UI de tarjeta visual con gradiente azul
- [x] Toggle mostrar/ocultar número completo y CVV (ojo/ojo-tachado)
- [x] Editar campos: nombre completo, nro tarjeta, vencimiento (MM/AA), código 3 dígitos, DNI titular
- [x] Botón "Bloquear" para re-cerrar el apartado
- [x] Delete con diálogo de confirmación
- [x] Agregar tab "Tarjeta" en `ClienteDetail`

---

## FASE D — Frontend: Calendario + Buscadores
**Estado:** ✅ COMPLETADO

- [x] Input "Ir a fecha" (date picker) en OcupacionPage → salta a mes y scrollea columna en timeline
- [x] Botón de toggle Timeline / Agenda en OcupacionPage
- [x] Vista Agenda estilo iPhone Calendar:
  - Grid mensual con puntos de colores bajo días con eventos
  - Día seleccionado con círculo índigo
  - Panel inferior con lista de reservas del día (tarjetas con borde de color)
- [x] Auto-detección mobile (< 768px) → abre en vista Agenda por defecto
- [x] Buscador de reservas por nombre/DNI en `ReservasList`
- [x] Filtro por fecha específica en `ReservasList`
- [x] Botón "Limpiar filtros" en `ReservasList`

---

## FASE E — Backend: Search en reservas
**Estado:** ✅ COMPLETADO

- [x] Parámetro `q` en `GET /reservas` → busca en `nombre_completo` e `dni_cuit` (ilike)
- [x] Parámetro `fecha` en `GET /reservas` → filtra reservas que contienen ese día
- [x] Joins a Cliente en `reserva_repo.list()` cuando se pasa `q`
- [x] `reserva_service.list()` con firma explícita (sin **kwargs)

---

## FASE F — Checkin funcional + Fix DB
**Estado:** ✅ COMPLETADO

- [x] Botón Checkin en `ReservasList` conectado a `CheckinModal` con datos del alquiler/cliente/vehiculo
- [x] Fix `DATABASE_URL` en `.env` → cambio de `postgres:5432` (Docker) a `localhost:5432`
- [x] Fix encoding `.env` → `env_file_encoding="utf-8-sig"` para manejar BOM de Windows

---

## FASE G — Quick wins: Mantenimiento + Extensión de alquiler
**Estado:** ✅ COMPLETADO

### G1. Badge de mantenimiento preventivo en Flota
- [x] Badge amarillo "Service próximo" en `VehiculoTable` cuando `km_proximo_service - km_actual < 1000`
- [x] Badge rojo "Mant. vencido" cuando `km_actual >= km_proximo_service`
- [x] Íconos `Wrench` y `AlertTriangle` de lucide-react

### G2. Modal de extensión de alquiler
- [x] Crear `ExtenderModal.tsx` con selector nueva fecha fin + hora fin
- [x] Pantalla de éxito con preview de precio nuevo y diferencia (`ExtenderResponse`)
- [x] Manejar error `solapamiento_extension` con mensaje claro (quién tiene el auto esos días)
- [x] Botón "Extender" en `ReservasList` para reservas con `alquiler_estado === 'activo'`

---

## FASE H — Módulo Multas (slice vertical completo)
**Estado:** ✅ COMPLETADO

### H1. Backend — Modelo + Migración
- [x] Enums `EstadoMulta`, `EstadoLimpieza`, `TipoGarantia`, `EstadoGarantia` en `domain/enums.py`
- [x] Modelo `Multa` en `models/multa.py`
- [x] Migración `010_multas.py` (crea tabla multas + enum estado_multa)
- [x] Registrar `Multa` en `models/__init__.py`

### H2. Backend — Schema + Repo + Service + Router
- [x] `schemas/multa.py` (MultaCreate, MultaUpdate, MultaResponse, BusquedaMultaResponse)
- [x] `repositories/multa_repo.py` (list con filtros por cliente_id, vehiculo_id, estado, patente)
- [x] `services/multa_service.py` (crear, actualizar, buscar_responsable por patente+fecha+hora)
- [x] `routers/multas.py`:
  - `GET /multas/buscar` — cruza patente+fecha+hora con historial de alquileres
  - `GET /multas` — listar con filtros
  - `POST /multas` — crear multa
  - `GET /multas/{id}` — detalle
  - `PATCH /multas/{id}` — actualizar estado / notas
  - `DELETE /multas/{id}` — baja lógica
- [x] Registrar router en `main.py`

### H3. Frontend — Tipos + Hook + Constantes
- [x] Tipos `Multa`, `MultaCreate`, `MultaUpdate`, `BusquedaMultaResult` en `types/index.ts`
- [x] Constantes `ESTADO_MULTA_LABEL/COLOR` en `constants.ts`
- [x] Hook `useMultas.ts` (listMultas, buscarResponsable, crearMulta, actualizarMulta, eliminarMulta)

### H4. Frontend — Tab Multas en ClienteDetail
- [x] Componente `MultasTab.tsx` — lista multas del cliente con badge estado + monto
- [x] Inline edit de estado + notas por multa
- [x] Formulario rápido para cargar nueva multa directamente desde el perfil
- [x] Botón "Buscador global" → link a /multas
- [x] Agregar tab "Multas" en `ClienteDetail`

### H5. Frontend — Página /multas (buscador global)
- [x] Página `MultasPage.tsx` en `pages/multas/`
- [x] Buscador: patente + fecha + hora → muestra cliente responsable + período del alquiler
- [x] Si encontrado: formulario inline para crear la multa vinculada al cliente/alquiler
- [x] Si no encontrado: mensaje claro con opción manual
- [x] Lista global de todas las multas con filtros por estado y patente
- [x] Edición inline de estado, baja con ConfirmDialog
- [x] Ruta `/multas` en `App.tsx`
- [x] Entrada "Multas" con ícono `AlertTriangle` en `NAV_ITEMS` y Sidebar

---

## FASE I — Combustible visual + Estado de limpieza
**Estado:** ✅ COMPLETADO

### I1. Backend — Schema + Migración
- [x] Enums `EstadoLimpieza`, `TipoGarantia`, `EstadoGarantia` en `domain/enums.py`
- [x] Campos `checkout_estado_limpieza` y `checkin_estado_limpieza` (nullable) en modelo `Alquiler`
- [x] Migración `011_alquiler_limpieza_garantia.py` (incluye campos de garantía también)
- [x] Actualizar `CheckoutCreate`, `CheckinCreate`, `AlquilerResponse`
- [x] Actualizar `AlquilerService.checkout()` y `AlquilerService.checkin()`
- [x] Actualizar routers `reservas.py` y `alquileres.py`

### I2. Frontend — CheckoutModal mejorado
- [x] Selector visual de combustible (5 botones: Vacío/¼/½/¾/Lleno con colores)
- [x] Selector de limpieza al salir (Limpio/Sucio/Lavado profundo)
- [x] Pasar `checkout_estado_limpieza` al payload

### I3. Frontend — CheckinModal mejorado
- [x] Mismo selector visual de combustible para llegada
- [x] Alerta visual si combustible llegada < combustible salida
- [x] Selector de limpieza al regresar
- [x] Pasar `checkin_estado_limpieza` al payload

---

## FASE J — Garantías / Depósitos de seguridad
**Estado:** ✅ COMPLETADO

### J1. Backend — Campos en Alquiler + Migración
- [x] Campos en `Alquiler`: `garantia_tipo`, `garantia_monto`, `garantia_estado`, `garantia_monto_devuelto`
- [x] Migración `011_alquiler_limpieza_garantia.py` (unificada con limpieza)
- [x] Actualizar `CheckoutCreate`, `CheckinCreate`, `AlquilerResponse`
- [x] `checkout()`: auto-setea `garantia_estado='retenida'` si hay garantía
- [x] `checkin()`: recibe `garantia_estado` y `garantia_monto_devuelto`

### J2. Frontend — CheckoutModal con sección garantía
- [x] Sección "Garantía / Depósito" con selector: Sin garantía / Efectivo / Tarjeta / Transferencia
- [x] Campo de monto retenido (solo visible si tipo != no_aplica)

### J3. Frontend — CheckinModal con resolución de garantía
- [x] Si hay garantía registrada: bloque "Resolver garantía" con tipo y monto original
- [x] Opciones: Devuelta completa / Retención parcial (con monto a devolver) / Retenida por siniestro

---

## FASE K — Integración tarjeta en CheckoutModal (garantía)
**Estado:** ✅ COMPLETADO

- [x] Componente `GarantiaTarjetaSection.tsx` en `components/reservas/`
- [x] Al seleccionar "Tarjeta" como garantía: fetch automático de tarjeta del cliente
- [x] Si tarjeta existe: preview visual con gradiente + opciones "Usar esta tarjeta" / "Usar datos distintos"
- [x] Si no existe: alerta + accordion "Registrar tarjeta ahora" con tabs:
  - [x] Modo datos: form completo (nombre siempre requerido + nro + vencimiento + CVV + DNI) → guarda en perfil vía PUT /clientes/{id}/tarjeta con PIN
  - [x] Modo foto: dropzone → sube vía POST /clientes/{id}/documentos (tipo=otro, nombre="Foto tarjeta garantía")
- [x] Integrado en `CheckoutModal.tsx`

---

## FASE L — Registro de Servicios / Mantenimiento
**Estado:** ✅ COMPLETADO

### L1. Backend — Modelo + Migración
- [x] Modelo `Servicio` (vehiculo_id, tipo_servicio, km_realizado, fecha, descripcion, costo, proximo_km, proxima_fecha, activo) en `models/servicio.py`
- [x] Enum `TipoServicio` en `domain/enums.py`
- [x] Migración `012_servicios.py` (crea tabla servicios + enum tipo_servicio)
- [x] Al crear servicio: auto-actualizar `vehiculo.km_proximo_service = proximo_km` (o km_realizado + km_entre_services si no se especifica)
- [x] Back-reference `vehiculo.servicios` en modelo Vehiculo

### L2. Backend — Schema + Repo + Service + Router
- [x] `schemas/servicio.py` (ServicioCreate, ServicioUpdate, ServicioResponse)
- [x] `repositories/servicio_repo.py` (list, get, create, update, deactivate)
- [x] `services/servicio_service.py` (lista, crear, actualizar, eliminar con sincronización de km)
- [x] `routers/servicios.py`: GET/POST `/vehiculos/{id}/servicios`, PATCH/DELETE `/servicios/{id}`
- [x] Router registrado en `main.py`

### L3. Frontend — MantenimientoTab en FlotaDetail
- [x] Tipos `Servicio`, `ServicioCreate`, `ServicioUpdate`, `TipoServicio` en `types/index.ts`
- [x] Hook `useServicios`, `useCrearServicio`, `useActualizarServicio`, `useEliminarServicio` en `hooks/useServicios.ts`
- [x] Componente `MantenimientoTab.tsx` — estado actual (km restantes, badge verde/amarillo/rojo) + formulario + historial
- [x] Tipos de servicio con emojis: 🔧 Service, 🛢️ Aceite, ⭕ Neumáticos, 🔴 Frenos, 🌀 Filtros, ⚙️ Correa, 🚗 Suspensión
- [x] Tab "Mantenimiento" agregado en `FlotaDetail.tsx`

---

## FASE M — Sistema de Notificaciones In-System
**Estado:** ✅ COMPLETADO

### M1. Backend — Endpoint /notificaciones (computed, sin tabla)
- [x] `routers/notificaciones.py` — `GET /notificaciones` computa en tiempo real:
  - `checkout_pendiente` — reservas confirmadas con fecha_inicio ≤ hoy sin alquiler
  - `checkin_pendiente` — reservas activas con fecha_fin < hoy
  - `garantia_sin_resolver` — alquileres finalizados con garantia_estado='retenida'
  - `doc_vehiculo_vencido` / `doc_vehiculo_por_vencer` — vigencia_hasta < hoy / ≤ +30 días
  - `doc_cliente_vencido` / `doc_cliente_por_vencer` — ídem para clientes
  - `service_vencido` / `service_proximo` — km_actual vs km_proximo_service
  - `multa_pendiente` — multas con estado='pendiente'
- [x] Response: `{ items, total, urgentes }` con `urgencia: alta|media|baja`
- [x] Router registrado en `main.py`

### M2. Frontend — Bell + Panel de alertas
- [x] Tipos `NotificacionItem`, `NotificacionesResponse`, `TipoNotificacion`, `UrgenciaNot` en `types/index.ts`
- [x] Hook `useNotificaciones()` — polling cada 60s
- [x] Componente `NotificacionesPanel.tsx` — panel con:
  - Bell icon con badge numérico (rojo si hay urgentes, amarillo si solo media)
  - Alertas agrupadas por categoría (Checkouts, Checkins, Garantías, Docs, Mantenimiento, Multas)
  - Dot de color por urgencia
  - Click en alerta → navega a la sección correspondiente
  - Botón de refresh manual
- [x] Panel integrado en `Sidebar.tsx` (bottom, visible en modo expandido y colapsado)

---

---

## FASE N — Dashboard Operativo con Métricas Reales (F4)
**Estado:** ✅ COMPLETADO

### N1. Backend — /reportes/dashboard con datos reales
- [x] `vehiculos_disponibles`, `alquilados`, `reservados`, `fuera_servicio`
- [x] `checkouts_hoy` (reservas confirmadas con fecha_inicio == hoy)
- [x] `devoluciones_hoy` (reservas activas con fecha_fin == hoy)
- [x] `ingresos_mes` (sum pagos.monto con fecha like 'YYYY-MM-%')
- [x] `egresos_mes` (sum gastos.monto del mes)
- [x] `ocupacion_porcentaje` (alquilados / total activos × 100)
- [x] `alquileres_activos` — lista compacta (máx 8) con cliente, vehículo, fecha_fin
- [x] `devoluciones_lista` — lista compacta de devoluciones de hoy con hora

### N2. Frontend — Métricas debajo del calendario en Dashboard
- [x] Hook `useDashboardStats` (queryKey: `['reportes', 'dashboard']`, refetchInterval 120s)
- [x] Cards: Disponibles, Alquilados (% ocupación), Devoluciones hoy, Ingresos del mes
- [x] Lista compacta "Alquileres activos" con botón "Ver todos" → /reservas
- [x] Lista compacta "Devoluciones hoy" con hora
- [x] Banner de checkouts pendientes (si hay) con navegación
- [x] `DashboardDetalle` type en `types/index.ts`

---

## FASE O — Caja y Pagos + Echeqs + Cuentas Corrientes (F6+F7)
**Estado:** ✅ COMPLETADO

### O1. Backend — Migración 013
- [x] `013_caja_echeq_cc.py` — ALTER TYPE estado_echeq ADD VALUE ('en_cartera', 'depositado', 'endosado')
- [x] ALTER TYPE medio_pago ADD VALUE 'cuenta_corriente'

### O2. Backend — Pagos mejorado
- [x] `GET /pagos` con filtros `alquiler_id`, `fecha_desde`, `fecha_hasta`
- [x] `GET /pagos/caja/dia?fecha=` — vista diaria: ingresos + egresos + por_medio_pago + cobros + gastos
- [x] `POST /pagos` — si `medio_pago=cuenta_corriente` → auto-crea/actualiza CC + MovimientoCuentaCorriente
- [x] `DELETE /pagos/{id}` (hard delete, los pagos son log contable)
- [x] `PagoDetalladoResponse` con `cliente_nombre`, `vehiculo_patente`, `reserva_id`

### O3. Backend — Echeqs mejorado
- [x] `schemas/echeq.py` — `EstadoEcheq` con estados completos: en_cartera, depositado, endosado, cobrado, rechazado, vencido
- [x] `EcheqUpdate` ampliado con `fecha_cobro`

### O4. Backend — Cuentas Corrientes (nuevo router)
- [x] `GET /cuentas-corrientes` — lista todas las CC con saldo y nombre de cliente
- [x] `GET /cuentas-corrientes/cliente/{id}` — get o crea automáticamente la CC del cliente
- [x] `GET /cuentas-corrientes/{id}/movimientos` — historial de movimientos
- [x] `POST /cuentas-corrientes/{id}/movimientos` — agregar movimiento manual (débito/crédito)
- [x] Router registrado en `main.py`

### O5. Frontend — Tipos y Hooks
- [x] Types: `Pago`, `PagoCreate`, `Echeq`, `EcheqCreate`, `EcheqUpdate`, `CuentaCorriente`, `MovimientoCC`, `MovimientoCCCreate`, `CajaData`
- [x] `usePagos`, `useCajaDia`, `useCrearPago`, `useEliminarPago`
- [x] `useEcheqs`, `useCrearEcheq`, `useActualizarEcheq`
- [x] `useCuentasCorrientes`, `useCuentaCorrienteCliente`, `useMovimientosCC`, `useAgregarMovimiento`

### O6. Frontend — CajaPage (`/caja`)
- [x] Selector de fecha (default hoy)
- [x] Cards resumen: Ingresos, Egresos, Balance del día
- [x] Desglose por medio de pago con badges de colores
- [x] Lista de cobros con cliente, patente, medio, opción eliminar
- [x] Lista de gastos de flota (link a vehículo)
- [x] Formulario inline "Registrar cobro" (alquiler_id, monto, medio, fecha, factura, notas)

### O7. Frontend — EcheqsPage (`/echeqs`)
- [x] Tabs "← Recibidos" | "→ Emitidos"
- [x] Filtro por estado
- [x] Banner alerta: echeqs próximos a cobrar (≤ 7 días)
- [x] Tarjeta por echeq: monto, contraparte, banco, número, fechas, días restantes
- [x] Menú de transición de estado (en_cartera → depositado/endosado/cobrado/rechazado)
- [x] Formulario nuevo echeq completo

### O8. Frontend — CuentasCorrientesPage (`/cuentas-corrientes`)
- [x] Cards resumen: con deuda, con saldo a favor, en cero
- [x] Lista de clientes con CC y saldo (deudores primero)
- [x] Modal detalle por cliente: saldo, historial de movimientos, formulario movimiento manual
- [x] Link directo a ficha del cliente
- [x] Tab "Cta. Corriente" en `ClienteDetail` (componente `CuentaCorrienteTab`)

### O9. Frontend — PagosTab reutilizable
- [x] `components/pagos/PagosTab.tsx` — tab de cobros para usar en alquiler detail
- [x] Resumen cobrado / esperado / pendiente
- [x] Lista pagos con badge de medio de pago, botón eliminar
- [x] Formulario inline "Registrar cobro"

### O10. Frontend — Routing
- [x] `/caja` → `CajaPage`
- [x] `/echeqs` → `EcheqsPage`
- [x] `/cuentas-corrientes` → `CuentasCorrientesPage`

---

## FASE P — Reportes (F10)
**Estado:** ✅ COMPLETADO

### P1. Backend — Endpoints reales
- [x] `GET /reportes/ingresos?anio=YYYY` — desglose mensual (ingresos, egresos, margen, por_medio_pago)
- [x] `GET /reportes/flota?fecha_desde=&fecha_hasta=` — ocupación, alquileres, ingresos, gastos, margen por vehículo

### P2. Frontend — ReportesPage (`/reportes`)
- [x] Tabs: "Ingresos" | "Flota"
- [x] Reporte Ingresos: selector de año, cards anuales (ingresos/egresos/margen), BarChart recharts ingresos vs egresos por mes, tabla resumida, export CSV
- [x] Reporte Flota: date range picker, BarChart horizontal de ocupación por vehículo, tabla con días/ocupación%/ingresos/gastos/margen, export CSV
- [x] Hooks `useReporteIngresos`, `useReporteFlota` con `staleTime: 5min`
- [x] Types `ReporteMes`, `ReporteIngresos`, `ReporteVehiculo`

---

## FASE Q — Integración de Pagos y Caja (PLAN_CAJA_PAGOS.md)
**Estado:** ✅ COMPLETADO

### Q1. Backend — Cambios estructurales
- [x] Migración `016_pago_intent_reserva` con 5 nuevas columnas de información de pago en `reservas`
- [x] Modelos y schemas de `Reserva` actualizados con campos de pago
- [x] `routers/reservas.py` actualizado para procesar pagos en la creación/edición de reservas y el checkout

### Q2. Frontend — Checkout y Reservas
- [x] Modificación de `CheckoutModal` para incluir panel de estado de pago (Cobrar Ahora / Dejar Pendiente)
- [x] Modificación de `ReservaModal` para seleccionar forma de pago prevista y estado de pago (anticipo)
- [x] Types en frontend actualizados

### Q3. Backend y Frontend — Saldos Pendientes
- [x] Backend: Nuevo endpoint `GET /pagos/pendientes` que calcula deudas de alquileres finalizados y reservas confirmadas
- [x] Frontend: `usePagosPendientes` implementado
- [x] Frontend: `PendientesSection` añadido en `/caja` para cobrar saldos deudores de manera centralizada

### Q4. Check-in y Notificaciones
- [x] Modificación de `CheckinModal` para mostrar el saldo deudor del cliente y obtener correctamente los kilómetros de salida (checkout_km)
- [x] Adición de alerta automática `pago_pendiente` para alquileres finalizados con deuda
- [x] Documentación actualizada en `FLUJOS_FUNCIONALES.md` y `flujos_leng_natural.md`

---

## Lo que ya funcionaba (pre-sesión)
- Flota: CRUD, documentos de vehículos, gastos, historial, tarifas, foto
- Clientes: CRUD, conductores adicionales, historial
- Reservas: crear, editar, cancelar, checkout (crear alquiler), filtrar por estado
- Calendario de ocupación: timeline 120 días, drag & drop orden vehículos, nueva reserva desde celda
- Dashboard: embebe OcupacionPage completo
- Cotizador: frontend con PDF export (sin BD, sin backend — excluido de esta sesión)

---

## Pendiente para próximas sesiones

### DB / Deploy — CRÍTICO (hacer antes de probar en producción)
- [ ] **Aplicar migraciones:** `cd backend && .venv\Scripts\python.exe -m alembic upgrade head`
  - Aplica: 010_multas → 011_alquiler_limpieza_garantia → 012_servicios → 013_caja_echeq_cc
- [ ] Deploy en Railway (backend + frontend + PostgreSQL)

### Integración pendiente (menor, operativa)
- [ ] `PagosTab` en `ReservasList` — botón "Ver cobros" desde fila de reserva activa/finalizada
  - Requires: `reserva.alquiler_id` en la respuesta de la API y modal o panel lateral

### Módulos excluidos (decisión del usuario, retomar cuando quiera)
- [ ] F5: Contratos digitales (PDF generation, bloqueo de checkout sin firma)
- [ ] F8: Cotizador backend (persistencia en BD, conversión a reserva, historial por cliente)

### Features técnicas diferidas
- [ ] Auth real (Clerk — `DEV_BYPASS_AUTH=true` activo)
- [ ] Storage en R2 (hoy filesystem local bajo `uploads/`)
- [ ] F9: APScheduler + emails/WhatsApp de alertas automáticas (vencimientos, devoluciones)
- [ ] F9: Endpoints públicos para landing page (`GET /api/v1/public/disponibilidad`)

### TS pre-existentes (no introducidos en esta sesión)
- [ ] `ClienteFormDialog.tsx:88` → dni_cuit type mismatch (string | undefined)
- [ ] Prop `title` en ícono Lucide en varias tablas
- [ ] CheckoutModal / ConductorForm / HistorialTab type mismatches menores

 # #   F A S E   R   -   R e f a c t o r i z a c i � n   d e   I n t e r f a z   e   � c o n o s 
 * * E s t a d o : * *   =���  C O M P L E T A D O 
 
 # # #   R 1 .   D a s h b o a r d 
 -   [ x ]   E l i m i n a d a s   m � t r i c a s   a n t i g u a s   y   l i s t a s   s e p a r a d a s . 
 -   [ x ]   A g r e g a d o   F l u j o   d e l   d � a   ( T i m e l i n e )   q u e   c o n s o l i d a   n u e v a s   r e s e r v a s ,   c h e c k - i n s ,   d e v o l u c i o n e s ,   p a g o s   y   g a s t o s . 
 
 # # #   R 2 .   R e s e r v a s 
 -   [ x ]   I n t e g r a c i � n   d e   H e r o i c o n s   e n   l u g a r   d e   l u c i d e - r e a c t   y   e m o j i s   p a r a   C o t i z a c i � n ,   P a g o ,   y   G a r a n t � a   e n   R e s e r v a M o d a l . 
 -   [ x ]   C o l o r   p r i m a r i o   a p l i c a d o   d e   f o r m a   f o r z o s a   e n   l o s   � c o n o s   ( t e x t - i n d i g o - 6 0 0 ) .  
 ### R3. Flujo del D�a (Mejoras Tiempos y Alertas)
- [x] Agregada la separaci�n de tiempos: hora_real y hora_programada.
- [x] Corregida la alerta de Checkout amarillo: Se detecta la falta de contrato (	iene_alquiler) cuando el sistema auto-transiciona a "Activa".
- [x] Inclusi�n de reservas creadas en el mismo d�a como notificaci�n adicional en el flujo.

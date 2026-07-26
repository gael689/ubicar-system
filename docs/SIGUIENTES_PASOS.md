# Siguientes pasos — Fases 4 a 10

> Resumen de los módulos que vienen después de Reservas y Alquileres. El detalle de cada uno se escribe cuando empezamos la fase, siguiendo el formato de `modules/02_modulo_flota.md`.

## Cómo se documenta cada módulo cuando llega su turno

Crear `docs/modules/XX_modulo_<nombre>.md` con las secciones:

1. Objetivo.
2. Alcance backend (endpoints, services, repos, domain, migraciones, tests).
3. Alcance frontend (hooks, páginas, componentes, schemas).
4. Dependencias sobre fases anteriores.
5. Criterio de salida (checklist verificable).
6. Smoke test (pasos manuales).
7. Notas de despliegue (migraciones, env vars, rollback).
8. Tiempo estimado.

---

## Fase 4 — Ocupación y Endpoints públicos

**Depende de:** Fase 3 (Reservas y Alquileres).

**Backend:**

- `GET /api/v1/ocupacion?fecha_inicio&fecha_fin&vehiculo_ids` retorna reservas + alquileres por vehículo en formato timeline.
- Endpoint público `GET /api/v1/public/disponibilidad?fecha_inicio&fecha_fin&categoria` sin auth, con rate limiting (slowapi, 10 req/min por IP).
- Endpoint público `POST /api/v1/public/reservas` que crea Cliente nuevo (si DNI no existe) o asocia, y crea Reserva en estado `pendiente` para revisión manual.
- CORS extra para `LANDING_URL`.
- Reuso de `domain/solapamientos.py` para no duplicar lógica.

**Frontend:**

- Página `/ocupacion` con timeline custom (vehículo en filas, días en columnas) usando @dnd-kit para drag and drop de reservas.
- Color por estado de reserva/alquiler.
- Tooltip con datos de la reserva al hover.
- Drag para reasignar fechas → invoca PATCH y revierte si falla.
- Selector de rango (semana, mes) y filtro por categoría.

**Tiempo:** 4 días.

---

## Fase 5 — Contratos digitales

**Depende de:** Fase 3.

**Backend:**

- `POST /api/v1/alquileres/{id}/contrato` genera PDF con reportlab desde un template en `app/adapters/pdf/contrato.py`.
- Sube a storage (`contratos/{alquiler_id}/{timestamp}.pdf`).
- `GET /api/v1/contratos/{id}` retorna metadata + URL presigned.
- `POST /api/v1/contratos/{id}/firmar` marca firmado (en MVP es manual; en futuro podría integrar con Docusign o similar).
- `POST /api/v1/contratos/prellenado` genera token de un solo uso con expiración para que el cliente cargue datos antes del checkout.
- Validación: checkout en Fase 5 requiere `Contrato.firmado == true`. Activar el hard block que en Fase 3 era warning.

**Frontend:**

- Página `/contratos` con listado, filtros, vista previa del PDF en iframe.
- Botón "Generar contrato" en la vista de alquiler.
- Pantalla pública `/c/:token` con form de pre-llenado para el cliente (sin auth).

**Tiempo:** 4-5 días.

---

## Fase 6 — Caja y Pagos + Audit log

**Depende de:** Fase 3.

**Backend:**

- Tabla `audit_log` (append-only) con migración.
- Helper `core/audit.py::log(action, entity_type, entity_id, before, after)`.
- CRUD `Pago` con todos los métodos (efectivo, transferencia, tarjeta, cheque, echeq, cuenta_corriente).
- CRUD `Gasto` (puede o no ligarse a Vehículo).
- Cuando `Pago.metodo == cuenta_corriente`: crear automáticamente `MovimientoCuentaCorriente` débito en la cuenta del cliente. Una sola transacción.
- Endpoint de caja diaria: `GET /api/v1/caja?fecha=YYYY-MM-DD` retorna ingresos por método, egresos, totales.
- Export CSV: `GET /api/v1/caja/export?fecha_desde&fecha_hasta&format=csv`.

**Frontend:**

- Página `/caja` con vista por día: cards con totales por método, listado de movimientos, botón de export.
- Form rápido para registrar pago/gasto.
- Filtros por rango de fechas.

**Tiempo:** 4 días.

---

## Fase 7 — Cuentas corrientes y Echeqs

**Depende de:** Fase 6.

**Backend:**

- `GET /api/v1/cuentas-corrientes?cliente_id` lista clientes con saldo distinto de 0.
- `GET /api/v1/cuentas-corrientes/{cliente_id}/movimientos?page&page_size`.
- `POST /api/v1/cuentas-corrientes/{cliente_id}/movimientos` para movimiento manual (ingreso/egreso) con concepto.
- Recalculo de `CuentaCorriente.saldo` después de cada movimiento, dentro de la transacción.
- Test de invariante: `saldo == sum(movimientos.signo * movimientos.monto)`.
- CRUD `Echeq` con máquina de estados estricta (en `domain/echeqs.py`).

**Frontend:**

- Página `/cuentas-corrientes` con listado de clientes + saldos, ficha de cuenta con movimientos paginados, modal de movimiento manual.
- Página `/echeqs` con tabs por estado, filtros, alta, cambio de estado con dialog de confirmación.

**Tiempo:** 3-4 días.

---

## Fase 8 — Cotizador y Presupuestos

**Depende de:** Fase 1 + Fase 2.

**Backend:**

- `POST /api/v1/cotizador` recibe `vehiculo_id, fecha_inicio, fecha_fin, cliente_id?` y devuelve desglose con tarifa aplicada (auto seleccionada, o especial del cliente si existe).
- CRUD `Presupuesto` con generación de PDF.
- `POST /api/v1/presupuestos/{id}/convertir-a-reserva` crea la reserva y marca el presupuesto como `aceptado`.

**Frontend:**

- Página `/cotizador` con form de cotización rápida y vista de desglose.
- Botón "Guardar como presupuesto" → genera PDF descargable.
- En el detalle del presupuesto: botón "Convertir a reserva".

**Tiempo:** 3 días.

---

## Fase 9 — Dashboard funcional + Scheduler de alertas

**Depende de:** Fase 1, Fase 3, Fase 6.

**Backend:**

- `GET /api/v1/dashboard/stats` con todos los campos que ya consume `Dashboard.tsx`.
- Endpoint `GET /api/v1/alertas?estado=no_vista` para listar alertas pendientes.
- Endpoint `POST /api/v1/alertas/{id}/marcar-vista`.
- APScheduler en `jobs/alertas.py` con job diario a las 08:00 (zona Argentina).
- Tabla `alertas` (migración).

**Frontend:**

- Reemplazar mocks en `Dashboard.tsx` con datos reales.
- Bell de alertas en el header con badge de no vistas.
- Dropdown con alertas, link a la entidad relacionada.

**Tiempo:** 3 días.

---

## Fase 10 — Reportes

**Depende de:** Fase 1, Fase 3, Fase 6, Fase 7.

**Backend:**

- `GET /api/v1/reportes/ocupacion?fecha_desde&fecha_hasta` con porcentaje de ocupación por vehículo.
- `GET /api/v1/reportes/ingresos?fecha_desde&fecha_hasta&group_by=mes|semana` con desglose por método.
- `GET /api/v1/reportes/vehiculos` con stats por vehículo (ingresos, días alquilado, gastos).
- Export CSV y PDF de cada uno.

**Frontend:**

- Página `/reportes` con tabs por tipo de reporte.
- Gráficos con Recharts (barras, líneas, pie).
- Filtros de fecha y export.

**Tiempo:** 4 días.

---

## Después del MVP

Cuando termine la Fase 9 (dashboard + alertas) el sistema reemplaza el Excel de Franco y Martín. La Fase 10 agrega valor pero no es bloqueante.

Roadmap futuro tentativo (cuando haya feedback real del uso):

- Integración con WhatsApp Business API (en lugar de link wa.me) para automatizar mensajes.
- App móvil con React Native (compartiendo tipos y queryClient).
- Integración con sistemas contables (AFIP, factura electrónica).
- Multi-sucursal si crecen.
- Dashboards públicos para cliente: "consultá el estado de tu reserva con código X".

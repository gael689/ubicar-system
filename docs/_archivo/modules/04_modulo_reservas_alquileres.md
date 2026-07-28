# Módulo Reservas y Alquileres — Fase 3

> El corazón del sistema. Reservas, alquileres, checkout, checkin, control 24hs, bonificaciones.

## Objetivo

Que el operador pueda:

- Crear reservas con detección automática de solapamientos.
- Confirmar y cancelar reservas.
- Hacer checkout (entrega del vehículo) con captura de km y combustible.
- Hacer checkin (devolución) con cálculo automático de excedentes.
- Bonificar excedentes (rol admin) con auditoría.
- Ver el estado del vehículo cambiando automáticamente.

## Alcance

### Backend

#### B3.1 — Domain puro

```
app/domain/
├── solapamientos.py        # detectar_conflicto(vehiculo_id, ventana, db) -> Conflicto | None
├── tarifas.py              # seleccionar_tarifa(duracion_dias, tarifas) -> Tarifa
├── control_24hs.py         # calcular_excedente(...)
└── transiciones.py         # puede_transicionar_reserva, vehiculo, etc.
```

Funciones puras, sin imports de SQLAlchemy. Reciben datos como argumentos, devuelven resultados.

##### `solapamientos.py`

```python
from datetime import datetime
from dataclasses import dataclass

@dataclass
class Ventana:
    inicio: datetime
    fin: datetime

def hay_solapamiento(a: Ventana, b: Ventana) -> bool:
    return a.inicio < b.fin and b.inicio < a.fin
```

##### `control_24hs.py`

```python
GRACIA_MINUTOS = 40

def calcular_excedente(
    fecha_fin_estimada: datetime,
    fecha_fin_real: datetime,
    tarifa_diaria: Decimal,
) -> Decimal:
    """Devuelve el cargo extra. 0 si está dentro de la gracia."""
    if fecha_fin_real <= fecha_fin_estimada + timedelta(minutes=GRACIA_MINUTOS):
        return Decimal("0")
    delta = fecha_fin_real - fecha_fin_estimada
    horas = delta.total_seconds() / 3600
    dias_completos = math.ceil(horas / 24)  # cualquier excedente sobre la gracia cuenta como día completo
    return tarifa_diaria * dias_completos
```

##### `tarifas.py`

```python
def seleccionar_tarifa(duracion_dias: int, tarifas_activas: list[Tarifa]) -> Tarifa:
    if duracion_dias < 7:
        tipo = TipoTarifa.DIARIA
    elif duracion_dias < 30:
        tipo = TipoTarifa.SEMANAL
    else:
        tipo = TipoTarifa.MENSUAL
    candidatas = [t for t in tarifas_activas if t.tipo == tipo]
    if not candidatas:
        raise BusinessRuleError("tarifa_no_disponible", f"No hay tarifa {tipo} activa")
    return candidatas[0]
```

#### B3.2 — Repositorios + Services

```
app/repositories/reserva_repo.py
app/repositories/alquiler_repo.py
app/services/reserva_service.py
app/services/alquiler_service.py
```

`ReservaService.create(data, usuario_id)`:

- Verifica solapamientos contra reservas confirmadas y alquileres activos del mismo vehículo.
- Si solapa → `ConflictError("solapamiento", ...)` con detalle de la entidad conflictiva.
- Persiste con estado `pendiente`.

`ReservaService.confirmar(id, usuario_id)`:

- Transición pendiente → confirmada.
- Cambia estado del vehículo a `reservado` si está disponible.
- Vuelve a verificar solapamientos (otra reserva pudo haberse creado entre medio).

`ReservaService.cancelar(id, usuario_id)`:

- Transición a cancelada (desde pendiente o confirmada).
- Si el vehículo estaba `reservado` por esta reserva → vuelve a `disponible`.

`AlquilerService.checkout(reserva_id, data, usuario_id)`:

- Verifica que la reserva esté `confirmada`.
- Verifica `Contrato.firmado == true` para esa reserva (si no hay contrato → bloquea con mensaje claro). En Fase 3 esta validación queda como warning, en Fase 5 (Contratos) se vuelve hard block.
- Crea `Alquiler` con `checkout_*` y marca reserva como `activa`.
- Cambia estado vehículo a `alquilado`.

`AlquilerService.checkin(alquiler_id, data, usuario_id)`:

- Verifica reserva `activa`.
- Calcula `horas_excedente` y `cargo_excedente` con `calcular_excedente`.
- Persiste `checkin_*`, `horas_excedente`, `cargo_excedente`.
- Marca reserva como `finalizada`.
- Cambia estado vehículo a `disponible` o `en_transicion` según regla de 4 horas (ver B3.3).

`AlquilerService.bonificar_excedente(alquiler_id, usuario_id)`:

- Solo `admin`.
- Marca `excedente_bonificado = true`, registra `bonificado_por`.
- Inserta entrada en `audit_log` (si la tabla existe; si no, log estructurado).

#### B3.3 — Estado en transición

Cuando se hace checkin de Alquiler A y dentro de 4 horas se hace checkout de un nuevo Alquiler B del mismo vehículo:

- Entre el checkin de A y el checkout de B, el vehículo queda en `en_transicion`.
- Implementación práctica: al hacer checkin, si existe una reserva confirmada del mismo vehículo con `fecha_inicio` dentro de 4hs → setear estado a `en_transicion`. Si no → `disponible`.
- Al hacer checkout, siempre setear a `alquilado`.

#### B3.4 — Endpoints

```
GET    /api/v1/reservas                ?estado=&vehiculo_id=&cliente_id=&fecha_desde=&fecha_hasta=
GET    /api/v1/reservas/{id}
POST   /api/v1/reservas
PATCH  /api/v1/reservas/{id}           ← solo en estado pendiente
POST   /api/v1/reservas/{id}/confirmar
POST   /api/v1/reservas/{id}/cancelar

GET    /api/v1/alquileres              ?estado=&vehiculo_id=&cliente_id=
GET    /api/v1/alquileres/{id}
POST   /api/v1/reservas/{reserva_id}/checkout    ← crea el alquiler
POST   /api/v1/alquileres/{id}/checkin
POST   /api/v1/alquileres/{id}/bonificar-excedente   ← admin only
```

#### B3.5 — Notificaciones adapter

```
app/adapters/notificaciones/
├── interface.py            # INotifier
├── whatsapp.py             # build_wa_link(telefono, mensaje) -> str
└── email.py                # ResendEmailNotifier
```

Endpoint helper:

```
GET /api/v1/reservas/{id}/wa-link    → genera link wa.me con resumen de la reserva
```

#### B3.6 — Migraciones

- `007_add_audit_columns_alquileres` — si hace falta agregar columnas (la mayoría ya están).
- `008_indices_reservas_alquileres` — índices para búsquedas frecuentes:
  - `reservas(vehiculo_id, fecha_inicio)`.
  - `reservas(estado) WHERE estado IN ('pendiente', 'confirmada', 'activa')`.
  - `alquileres(checkout_fecha)`.

#### B3.7 — Tests

Críticos. Cobertura obligatoria:

- `domain/control_24hs`: gracia, excedente justo en el límite, varios días excedidos, redondeo.
- `domain/tarifas`: 6 días → diaria, 7 días → semanal, 29 días → semanal, 30 días → mensual, sin tarifa activa → error.
- `domain/solapamientos`: solapamiento total, parcial, exacto en bordes.
- Services con DB:
  - Crear reserva con solapamiento → 409.
  - Crear reserva con solapamiento contra alquiler activo → 409.
  - Cancelar reserva confirmada → vehículo vuelve a disponible.
  - Checkout sin reserva confirmada → error.
  - Checkin con excedente → cargo correcto.
  - Bonificar excedente → flag y auditor.
  - Estado en transición cuando hay reserva próxima.
- Property-based: secuencias arbitrarias de checkouts/checkins respetan invariante "vehículo nunca alquilado a 2 clientes a la vez".

### Frontend

#### F3.1 — Hooks

`hooks/useReservas.ts`:

- `useReservas(filters)`.
- `useReserva(id)`.
- `useCreateReserva()`.
- `useUpdateReserva()`.
- `useConfirmarReserva()`.
- `useCancelarReserva()`.
- `useWaLinkReserva()`.

`hooks/useAlquileres.ts`:

- `useAlquileres(filters)`.
- `useAlquiler(id)`.
- `useCheckout()`.
- `useCheckin()`.
- `useBonificarExcedente()`.

#### F3.2 — Página `/reservas`

`pages/reservas/List.tsx`:

- Tabs por estado: Pendientes, Confirmadas, Activas (alquileres en curso), Finalizadas, Canceladas.
- Tabla con: vehículo, cliente, fecha inicio/fin, estado, acciones (confirmar, cancelar, ir a checkout/checkin).
- Filtros: rango de fechas, vehículo, cliente.
- Botón "Nueva reserva".

#### F3.3 — Modal "Nueva reserva"

`components/reservas/ReservaFormDialog.tsx`:

- Selector de vehículo (autocomplete).
- Selector de cliente (autocomplete con creación inline opcional).
- Fechas y horas inicio/fin.
- Lugares de entrega y devolución.
- Validación con Zod antes de enviar.
- Si el backend devuelve 409 de solapamiento → mostrar mensaje claro con detalle.

#### F3.4 — Pantalla de Checkout `/alquileres/:reserva_id/checkout`

`pages/reservas/Checkout.tsx`:

- Resumen de la reserva.
- Form de checkout: km salida, % combustible, descripción/observaciones, foto opcional (Fase 5+ con contrato).
- Botón "Confirmar checkout".
- En Fase 3 muestra warning si no hay contrato firmado; en Fase 5 lo bloquea.

#### F3.5 — Pantalla de Checkin `/alquileres/:id/checkin`

`pages/reservas/Checkin.tsx`:

- Resumen del alquiler en curso.
- Form de checkin: km llegada, % combustible, descripción.
- Cálculo de excedente en vivo (preview) — frontend usa la misma fórmula que el backend, pero el valor final lo manda el backend.
- Si hay excedente: badge prominente con monto.
- Botón "Confirmar checkin".

#### F3.6 — Bonificar excedente

En la pantalla de detalle de un alquiler finalizado con excedente, si el usuario es `admin`:

- Botón "Bonificar excedente".
- ConfirmDialog con motivo opcional.
- Después de bonificar: badge "Bonificado por <nombre>" visible.

#### F3.7 — Componentes

```
components/reservas/
├── ReservaFormDialog.tsx
├── ReservaTable.tsx
├── ReservaFilters.tsx
├── ReservaStatusBadge.tsx
├── VehiculoCombobox.tsx
├── ClienteCombobox.tsx
├── ConfirmCancelarDialog.tsx
├── CheckoutForm.tsx
├── CheckinForm.tsx
├── ExcedenteBadge.tsx
└── BonificarDialog.tsx
```

## Dependencias

- **Fase 1 (Flota):** vehículos disponibles.
- **Fase 2 (Clientes):** clientes disponibles.

## Criterio de salida

- [ ] Crear reserva con solapamiento → 409 con mensaje claro.
- [ ] Confirmación cambia estado vehículo a reservado.
- [ ] Cancelación libera el vehículo.
- [ ] Ciclo Reserva → Checkout → Checkin completo end-to-end.
- [ ] Cálculo de excedente correcto en al menos 5 escenarios (sin excedente, dentro de gracia, justo después de gracia, varios días, etc.).
- [ ] Bonificación registra usuario y queda auditable.
- [ ] Estado en transición se aplica cuando hay reserva próxima.
- [ ] Tests de domain con cobertura 100% y tests de integración pasan.
- [ ] Property-based test del invariante "no doble booking" pasa.
- [ ] Frontend con flujo completo verificable manualmente.
- [ ] Generación de link wa.me con resumen de reserva.

## Smoke test

1. Crear vehículo (Fase 1) y cliente (Fase 2) si no existen.
2. Crear reserva del vehículo para mañana 10am-15hs.
3. Intentar crear otra reserva del mismo vehículo solapada → 409.
4. Confirmar la primera reserva → vehículo pasa a reservado.
5. Hacer checkout → vehículo pasa a alquilado, alquiler activo.
6. Hacer checkin con km > km checkout y dentro de gracia → sin excedente.
7. Crear otra reserva, hacer checkout, hacer checkin con 2 horas de retraso → excedente proporcional.
8. Bonificar el excedente → flag y registro.
9. Generar wa.me link → abre WhatsApp con resumen.

## Notas de despliegue

- Migraciones: `007_audit_columns`, `008_indices_reservas_alquileres`.
- Env vars nuevas: `RESEND_API_KEY` (puede quedar vacío en dev → modo dry_run).
- Rollback: revertir migraciones; los datos ya creados se preservan si no se altera estructura crítica.

## Tiempo estimado

6-8 días. Es la fase más compleja.

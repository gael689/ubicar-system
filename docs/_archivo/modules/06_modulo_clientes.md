# Módulo Clientes — Fase 2

> CRUD de clientes, conductores adicionales y validación de licencias.

## Objetivo

Que el operador pueda:

- Listar clientes con búsqueda por DNI/nombre/email.
- Dar de alta, editar y dar de baja lógica clientes.
- Cargar conductores adicionales asociados.
- Ver advertencia si la licencia está vencida o por vencer.

Es prerequisito de Reservas y Cotizador.

## Alcance

### Backend

#### B2.1 — Repositorio + Service

```
app/repositories/cliente_repo.py
app/services/cliente_service.py
```

`ClienteService.create(data)`:

- Valida unicidad de `dni_cuit` cuando no es null.
- Persiste.

`ClienteService.update(id, data)`:

- 404 si no existe.
- Valida que el `dni_cuit` no choque con otro.
- Aplica cambios parciales.

`ClienteService.deactivate(id)`:

- Marca `activo = false`.
- Falla si tiene alquileres activos o reservas pendientes/confirmadas.

`ClienteService.add_conductor_adicional(cliente_id, data)`:

- Persiste un `ConductorAdicional` ligado al cliente.

#### B2.2 — Endpoints

```
GET    /api/v1/clientes                  ?q=&tipo=&page=&page_size=
GET    /api/v1/clientes/{id}
POST   /api/v1/clientes
PATCH  /api/v1/clientes/{id}
DELETE /api/v1/clientes/{id}             ← baja lógica
GET    /api/v1/clientes/{id}/conductores
POST   /api/v1/clientes/{id}/conductores
DELETE /api/v1/conductores/{id}
```

Búsqueda `q`: `ILIKE` en `nombre_completo`, `dni_cuit`, `email`, `telefono`.

#### B2.3 — Validaciones de licencia

Pydantic en `ClienteCreate`/`ClienteUpdate`:

- `licencia_numero` opcional pero si está, valida formato (regex laxo, ej. alfanumérico de 6 a 12 chars).
- `licencia_vencimiento` ISO date.
- `licencia_categoria` enum sugerido (B1, B2, C1, C2, D1, etc.).

No se rechaza alta con licencia vencida (puede ser un cliente existente). El warning vive en el frontend.

#### B2.4 — Migraciones

- `005_indices_clientes` — índice sobre `clientes(dni_cuit) WHERE dni_cuit IS NOT NULL`.
- `006_indice_busqueda_clientes` — opcional, índice trigram para búsqueda. Saltable si volumen es chico.

#### B2.5 — Tests

- Service: alta, búsqueda por DNI duplicado (debe fallar), deactivate con reserva pendiente (debe fallar).
- Endpoints: 200/201/422/404/409.

### Frontend

#### F2.1 — Hooks

`hooks/useClientes.ts`:

- `useClientes(filters)`.
- `useCliente(id)`.
- `useCreateCliente()`.
- `useUpdateCliente()`.
- `useDeactivateCliente()`.

`hooks/useConductoresAdicionales.ts`:

- `useConductores(clienteId)`.
- `useAddConductor(clienteId)`.
- `useDeleteConductor()`.

#### F2.2 — Página `/clientes`

`pages/clientes/List.tsx`:

- Tabla: nombre completo, DNI, teléfono, email, licencia (con indicador de vencimiento), tipo, acciones.
- Búsqueda con debounce.
- Filtros: tipo (particular/empresa), frecuente (sí/no).
- Botón "Nuevo cliente".

#### F2.3 — Detalle `/clientes/:id`

`pages/clientes/Detail.tsx`:

- Header con datos principales y badge de licencia (verde, amarillo, rojo).
- Tabs:
  - **Datos** → form de edición.
  - **Conductores adicionales** → tabla y alta.
  - **Historial** (placeholder hasta Fase 3) → "Reservas y alquileres aparecerán acá".
  - **Cuenta corriente** (placeholder hasta Fase 7).

#### F2.4 — Componentes

```
components/clientes/
├── ClienteFormDialog.tsx
├── ClienteTable.tsx
├── ClienteFilters.tsx
├── LicenciaBadge.tsx          # verde / amarillo / rojo según vencimiento
├── ConductorForm.tsx
└── ConductoresTab.tsx
```

#### F2.5 — Lógica de licencia (frontend)

Helper `lib/licencia.ts`:

```ts
type EstadoLicencia = 'vigente' | 'por_vencer' | 'vencida' | 'sin_datos';

export function estadoLicencia(vencimientoIso?: string): EstadoLicencia {
  if (!vencimientoIso) return 'sin_datos';
  const dias = diasHasta(vencimientoIso);
  if (dias < 0) return 'vencida';
  if (dias <= 30) return 'por_vencer';
  return 'vigente';
}
```

`<LicenciaBadge>` consume el helper y muestra el color del design system.

## Dependencias

- **Fase 0:** completa.
- **Paralelizable con Fase 1.**

## Criterio de salida

- [ ] CRUD de clientes end-to-end.
- [ ] Búsqueda por DNI/nombre/email funciona y es razonablemente rápida.
- [ ] Validación de DNI único.
- [ ] CRUD de conductores adicionales.
- [ ] Badge de licencia muestra los 4 estados correctamente.
- [ ] Tests de service y endpoints pasan.
- [ ] No se puede dar de baja un cliente con reservas activas (test cubre el caso).
- [ ] Frontend con datos reales, sin errores TS ni de consola.

## Smoke test

1. Crear un cliente particular con DNI y licencia.
2. Intentar crear otro con el mismo DNI → 409.
3. Editar el cliente, cambiar el teléfono.
4. Agregar dos conductores adicionales.
5. Buscar por apellido, por DNI parcial.
6. Filtrar por tipo "empresa".
7. Crear un cliente con licencia vencida ayer → badge rojo.
8. Crear un cliente con licencia que vence en 15 días → badge amarillo.
9. Dar de baja el cliente.

## Notas de despliegue

- Migraciones: `005_indices_clientes` (`006_indice_busqueda_clientes` opcional).
- Sin env vars nuevas.

## Tiempo estimado

3 días.

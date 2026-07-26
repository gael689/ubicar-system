# Planning Frontend — Ubicar Rent

> Documento de diseño y arquitectura del frontend. Leer antes de implementar cualquier página o componente nuevo.

## Índice

1. [Principios de diseño](#1-principios-de-diseño)
2. [Arquitectura](#2-arquitectura)
3. [Stack y versiones](#3-stack-y-versiones)
4. [Routing y layout](#4-routing-y-layout)
5. [Data fetching: TanStack Query](#5-data-fetching-tanstack-query)
6. [Estado: cliente vs servidor](#6-estado-cliente-vs-servidor)
7. [Formularios](#7-formularios)
8. [Autenticación con Clerk](#8-autenticación-con-clerk)
9. [Design system y componentes](#9-design-system-y-componentes)
10. [Manejo de errores y feedback](#10-manejo-de-errores-y-feedback)
11. [Tipos compartidos con backend](#11-tipos-compartidos-con-backend)
12. [Convenciones de código](#12-convenciones-de-código)
13. [Performance y bundle](#13-performance-y-bundle)
14. [Testing](#14-testing)
15. [Estructura por módulo](#15-estructura-por-módulo)

---

## 1. Principios de diseño

| Principio | Aplicación concreta |
|-----------|---------------------|
| **Separación: UI vs lógica vs datos** | Componentes UI puros en `components/`, hooks de fetching en `hooks/`, llamadas HTTP en `lib/api.ts`. Un componente nunca importa axios directamente. |
| **Server state ≠ client state** | TanStack Query para datos del backend, Zustand para estado UI puro (sidebar abierto, filtros activos, modales). |
| **Composición sobre props drilling** | Si un dato cruza más de 2 niveles → contexto o store. Nunca pasar 7 props para un sub-sub-componente. |
| **Tipado estricto** | TypeScript estricto, sin `any`. Tipos derivados del backend cuando es posible (no duplicar shapes). |
| **Convención de nombres en español para UI** | Rutas, labels, mensajes de error en español. Código (variables, funciones, hooks) en inglés. |
| **shadcn/ui como base** | Si existe un componente de shadcn que cubre el caso → usarlo. No construir custom hasta que justifique. |
| **Optimistic UI moderado** | Para acciones críticas (pagos, checkout) NO optimistic. Para acciones triviales (toggle de filtros, cambio de estado a "leído") sí. |
| **Mobile-first** | Sidebar colapsa a bottom nav en mobile. Tablas se transforman en cards en pantallas chicas. |
| **Accesibilidad** | shadcn/ui ya viene accesible. No romper foco al cerrar dialogs. Labels asociados a inputs. |

---

## 2. Arquitectura

```
┌────────────────────────────────────────────────────────────────┐
│ src/main.tsx                                                   │
│   ClerkProvider → QueryClientProvider → BrowserRouter → App    │
├────────────────────────────────────────────────────────────────┤
│ src/App.tsx                                                    │
│   Routes con ProtectedRoute (Clerk) y AppLayout                │
├────────────────────────────────────────────────────────────────┤
│ src/pages/                  ← Una carpeta por módulo           │
│   - Componentes "página": orquestan hooks + componentes        │
│   - Sin lógica de fetching directa                             │
├────────────────────────────────────────────────────────────────┤
│ src/components/                                                 │
│   - ui/        ← shadcn (no tocar manualmente)                 │
│   - layout/    ← Sidebar, Header, AppLayout, MobileNav         │
│   - shared/    ← StatusBadge, EmptyState, ConfirmDialog        │
│   - <modulo>/  ← Componentes específicos por módulo            │
├────────────────────────────────────────────────────────────────┤
│ src/hooks/                  ← TanStack Query hooks por módulo  │
│   - useVehiculos.ts → list, detail, create, update             │
│   - mutations devuelven onSuccess que invalidan queries        │
├────────────────────────────────────────────────────────────────┤
│ src/lib/                                                        │
│   - api.ts          ← Axios + interceptor de token Clerk       │
│   - queryClient.ts  ← Config TanStack Query                    │
│   - utils.ts        ← formatCurrency, formatDate, cn(),...     │
│   - constants.ts    ← Labels, colores, NAV_ITEMS               │
├────────────────────────────────────────────────────────────────┤
│ src/store/                  ← Zustand                          │
│   - useAppStore.ts  ← UI global (sidebar, breadcrumbs)         │
│   - useFiltersStore.ts ← Filtros persistidos en URL/localStorage│
├────────────────────────────────────────────────────────────────┤
│ src/types/                                                      │
│   - index.ts                ← Tipos del dominio (espejo backend)│
│   - api.ts                  ← Tipos de respuestas envoltorio   │
└────────────────────────────────────────────────────────────────┘
```

### Reglas de dependencia

- `pages/` puede importar de `components/`, `hooks/`, `lib/`, `store/`, `types/`.
- `components/` puede importar de `lib/`, `types/`, otros componentes.
- `components/` **no** importa de `pages/`.
- `hooks/` solo importa de `lib/api.ts` y `types/`.
- `lib/` no importa de nada del dominio (es infra).

---

## 3. Stack y versiones

Todas las dependencias ya están en `package.json`. Versiones objetivo:

| Componente | Versión | Notas |
|-----------|---------|-------|
| React | 18.3 | StrictMode activo en dev. |
| Vite | 5.3 | HMR, proxy a `localhost:8000` para `/api`. |
| TypeScript | 5.2 | `strict: true`, `noUncheckedIndexedAccess: true`. |
| React Router | 6.24 | Solo `<BrowserRouter>`, sin loaders ni actions. |
| TanStack Query | 5.51 | `staleTime: 30s`, `retry: 1`. |
| Axios | 1.7 | Una sola instancia con interceptor de Clerk token. |
| Zustand | 4.5 | Para UI state mínimo. |
| React Hook Form | 7.52 | Con resolver Zod. |
| Zod | 3.23 | Schemas espejo de Pydantic en backend. |
| Tailwind | 3.4 | Config con colores del design system Ubicar. |
| shadcn/ui | última | Instalado via `npx shadcn-ui add`. |
| Lucide React | 0.408 | Iconos. |
| Sonner | 1.5 | Toasts. |
| Recharts | 2.12 | Gráficos del módulo Reportes. |
| @clerk/clerk-react | última | Reemplaza @auth0/auth0-react. |

### Cambio en deps

- **Quitar:** `@auth0/auth0-react`.
- **Agregar:** `@clerk/clerk-react`.
- **Agregar (Fase 4 Ocupación):** `@dnd-kit/core` + `@dnd-kit/sortable` para drag and drop del timeline.

---

## 4. Routing y layout

Estructura ya implementada en `App.tsx`. Convenciones:

- Rutas protegidas envueltas en `<ProtectedRoute>` que valida Clerk.
- `<AppLayout title="...">` aplica Sidebar + Header.
- Todos los módulos usan `PlaceholderPage` hasta que su Fase los reemplace.

### URLs de las rutas

| Ruta | Módulo |
|------|--------|
| `/dashboard` | Dashboard |
| `/flota` | Flota |
| `/flota/:id` | Detalle de vehículo |
| `/clientes` | Clientes |
| `/clientes/:id` | Detalle de cliente |
| `/reservas` | Reservas y Alquileres |
| `/reservas/:id` | Detalle de reserva |
| `/alquileres/:id/checkout` | Checkout |
| `/alquileres/:id/checkin` | Checkin |
| `/contratos` | Contratos |
| `/cotizador` | Cotizador |
| `/caja` | Caja y Pagos |
| `/cuentas-corrientes` | Cuentas corrientes |
| `/cuentas-corrientes/:cliente_id` | Detalle |
| `/echeqs` | Echeqs |
| `/ocupacion` | Calendario de ocupación |
| `/reportes` | Reportes |

### Sidebar

`NAV_ITEMS` en `lib/constants.ts` ya define los 11 módulos. El sidebar renderiza desde ahí. Para agregar un módulo nuevo: editar el array.

---

## 5. Data fetching: TanStack Query

### Convención de hooks

Por módulo, un archivo `hooks/use<Modulo>.ts` con:

```ts
// Lecturas
export function useVehiculos(filters: VehiculoFilters) { ... }
export function useVehiculo(id: number) { ... }

// Mutaciones
export function useCreateVehiculo() { ... }
export function useUpdateVehiculo() { ... }
export function useDeleteVehiculo() { ... }
```

### Query keys

Convención jerárquica:

```ts
['vehiculos']                          // todos
['vehiculos', 'list', filters]         // listado con filtros
['vehiculos', 'detail', id]            // detalle
['dashboard', 'stats']                 // stats del dashboard
```

Esto permite invalidaciones quirúrgicas: al crear un vehículo, `queryClient.invalidateQueries({ queryKey: ['vehiculos'] })` invalida todo lo relacionado a vehículos sin tocar el resto.

### Cache config

```ts
new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,      // 30s antes de marcar como stale
      gcTime: 5 * 60_000,     // 5 min en cache después de unmount
      retry: 1,
      refetchOnWindowFocus: false,  // panel interno, no necesario
    },
    mutations: {
      retry: 0,
    },
  },
})
```

### Patrón de mutación con invalidación

```ts
export function useCreateVehiculo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: VehiculoCreate) =>
      api.post<ApiResponse<Vehiculo>>('/vehiculos', input).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehiculos'] });
      toast.success('Vehículo creado');
    },
    onError: (err) => toast.error(extractError(err)),
  });
}
```

---

## 6. Estado: cliente vs servidor

### Servidor (TanStack Query)

- Cualquier dato que viene del backend.
- Listados, detalles, stats del dashboard.
- **Nunca** copiar a Zustand.

### Cliente (Zustand)

- Sidebar abierto/colapsado.
- Pestaña activa en una vista con tabs.
- Filtros activos en una tabla (si no se persisten en URL).
- Estado de modales globales (rara vez).

### URL (search params)

- Filtros de listados (`?estado=activo&page=2`).
- Tabs visibles en URL para shareable links.
- Hook helper: `useSearchParamsState(key, defaultValue)`.

### Local

- Forms en progreso (RHF maneja).
- Estado UI ephemeral (hover, focus).

### Anti-patrón a evitar

Sincronizar TanStack Query → Zustand (`useEffect(() => setStore(query.data), ...)`). Causa duplicación, race conditions, doble render. Si necesitás derivar algo del query → `useMemo` o un `select` del query.

---

## 7. Formularios

- React Hook Form + `@hookform/resolvers/zod`.
- Schema Zod en `<modulo>/schemas.ts` espejando el `<Entidad>Create` del backend.
- Inputs envueltos en componentes de `components/ui/form.tsx` (shadcn provee `<FormField>`).
- Validación on submit, no on change (excepto `email` y `dni`).

### Manejo de errores del backend

Cuando el backend devuelve 422 con detalle de campos, mapearlo a `setError(fieldName, ...)` de RHF para mostrar inline.

---

## 8. Autenticación con Clerk

### Setup en main.tsx

```tsx
import { ClerkProvider } from '@clerk/clerk-react';

<ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
</ClerkProvider>
```

### Páginas

- `/sign-in/*` → componente `<SignIn />` de Clerk con apariencia personalizada.
- `/sign-up/*` → no se usa (no hay self-signup, los usuarios los crea el admin en Clerk dashboard).

### ProtectedRoute

```tsx
import { useAuth } from '@clerk/clerk-react';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <LoadingSpinner />;
  if (!isSignedIn) return <Navigate to="/sign-in" />;
  return <>{children}</>;
}
```

### Inyección de token en axios

```ts
// hooks/useAxiosAuth.ts
import { useAuth } from '@clerk/clerk-react';
import { useEffect } from 'react';
import api from '@/lib/api';

export function useAxiosAuth() {
  const { getToken } = useAuth();
  useEffect(() => {
    const id = api.interceptors.request.use(async (config) => {
      const token = await getToken();
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    });
    return () => api.interceptors.request.eject(id);
  }, [getToken]);
}
```

### UserButton

Reemplaza la lógica manual de logout. Va en el header:

```tsx
import { UserButton } from '@clerk/clerk-react';
<UserButton afterSignOutUrl="/sign-in" />
```

---

## 9. Design system y componentes

### Paleta (ya configurada en Tailwind)

- `primary: #407EC9`
- `secondary: #8BB8E8`
- `surface: #F0F6FD`
- `border: #D0E4F5`
- `success: #059669`, `warning: #D97706`, `danger: #DC2626`

### Componentes base disponibles (shadcn)

`button`, `card`, `badge`, `input`, `select`, `dialog`, `sheet`, `table`, `tabs`, `dropdown-menu`, `popover`, `tooltip`, `avatar`, `skeleton`, `separator`, `alert-dialog`, `toast` (vía Sonner), `form`, `label`.

A instalar a medida que se necesiten:

- Fase 1 Flota: ya tenemos lo necesario.
- Fase 4 Ocupación: `calendar`, `popover` (combos de fecha).
- Fase 6 Caja: `data-table` custom basada en `table` + paginación.

### Componentes shared del proyecto

- `StatusBadge` ✅ (ya existe).
- `EmptyState` (a crear): icono + título + descripción + acción opcional.
- `ConfirmDialog` (a crear): wrapper de `<AlertDialog>`.
- `PageHeader` (a crear): título + breadcrumb + acción primaria.
- `DataTable` (Fase 6+): tabla con sort, filtros y paginación.
- `LoadingState` y `ErrorState`: placeholders consistentes.

---

## 10. Manejo de errores y feedback

### Toasts (Sonner)

```ts
toast.success('Vehículo creado');
toast.error('No se pudo crear el vehículo');
toast.info('Sin cambios para guardar');
```

### Helper de errores

`lib/utils.ts::extractError(err)` recibe un error de axios y devuelve el detail si es 4xx, o un mensaje genérico.

```ts
export function extractError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail.map(d => d.msg).join(', ');
  }
  return 'Ocurrió un error inesperado';
}
```

### Empty states

Cualquier listado vacío muestra `<EmptyState>` con call to action ("Agregar vehículo"). Nunca solo "No hay datos".

### Loading states

- Listados: `<Skeleton>` simulando filas de la tabla.
- Detalles: `<Skeleton>` simulando los campos.
- Mutaciones: deshabilitar el botón con spinner inline.

### Error boundaries

Un `<ErrorBoundary>` global en `App.tsx` con UI de fallback amigable + botón "Reintentar" que recarga.

---

## 11. Tipos compartidos con backend

`src/types/index.ts` ya tiene los tipos espejos de Pydantic. Convención:

- `<Entidad>` = response shape.
- `<Entidad>Create` = input para POST.
- `<Entidad>Update` = input para PATCH (todos los campos opcionales).
- `ApiResponse<T>` y `PaginatedResponse<T>` para envoltorios.

### Mantener sincronía

Cuando se agrega un campo a un modelo del backend → se agrega al type del frontend en el mismo PR.

A futuro (no para Fase 0-3): considerar generación automática con `openapi-typescript` desde el OpenAPI de FastAPI. No vale la pena hasta que el contrato esté estable.

---

## 12. Convenciones de código

### Naming

- Componentes: PascalCase (`VehiculoForm.tsx`).
- Hooks: camelCase con `use` prefix (`useVehiculos.ts`).
- Utilidades: camelCase (`formatCurrency`).
- Constantes: SCREAMING_SNAKE (`NAV_ITEMS`, `GRACE_PERIOD_MINUTES`).

### Imports

```tsx
// 1. React
import { useState } from 'react';
// 2. Externos
import { useQuery } from '@tanstack/react-query';
// 3. Internos con alias '@/'
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
// 4. Tipos al final (separados por type)
import type { Vehiculo } from '@/types';
```

### Componentes funcionales

Sin `React.FC`. Siempre tipo explícito de props:

```tsx
interface Props { id: number }
export function VehiculoDetail({ id }: Props) { ... }
```

### Sin `any`

Si TS se queja → o el tipo está mal o falta type guard. Nunca cast a `any`.

### Sin barrel files innecesarios

`components/ui/index.ts` exportando todo no aporta. Importar directo:

```tsx
import { Button } from '@/components/ui/button';
```

### Comentarios

- Solo cuando explican el "por qué", no el "qué".
- TODO con autor: `// TODO(franco): manejar caso X`.

---

## 13. Performance y bundle

### Code splitting

A partir de Fase 4 (cuando el bundle pase 500KB), aplicar lazy loading a páginas pesadas:

```tsx
const Reportes = lazy(() => import('@/pages/Reportes'));
```

### Memoización

- `useMemo` solo cuando hay cómputo costoso (mapas, sorts grandes).
- `React.memo` solo en componentes de lista cuando hay re-renders observados con DevTools.
- Premature memoization es código muerto.

### Imágenes

- Fotos de vehículos: thumbnails generados en backend (futuro, Fase 1+).
- Hasta entonces: URL directa con `loading="lazy"`.

---

## 14. Testing

Estrategia mínima viable para un panel interno:

- **Componentes shared (StatusBadge, EmptyState):** Vitest + Testing Library.
- **Hooks de TanStack Query:** Vitest con `QueryClient` mock.
- **Páginas críticas (checkout, checkin, registrar pago):** integration test con MSW para mockear el backend.
- **Sin e2e** por ahora (Playwright/Cypress se evalúa cuando haya 5+ flujos críticos estabilizados).

Setup en Fase 3 (Reservas/Alquileres) cuando aparece la primera lógica compleja en el frontend.

---

## 15. Estructura por módulo

Cada módulo nuevo sigue este esqueleto:

```
src/pages/<modulo>/
├── List.tsx              # Listado principal, ruta /<modulo>
├── Detail.tsx            # Detalle, ruta /<modulo>/:id
├── New.tsx               # Alta (puede ser modal en List.tsx en módulos chicos)
└── Edit.tsx              # Edición

src/components/<modulo>/
├── <Modulo>Form.tsx      # Form compartido entre New y Edit
├── <Modulo>Table.tsx     # Tabla con filtros
├── <Modulo>Filters.tsx   # Componente de filtros
└── ...

src/hooks/use<Modulo>.ts   # Todos los queries y mutations

src/pages/<modulo>/schemas.ts  # Zod schemas para forms
```

Páginas chicas (Echeqs, Documentos): un solo archivo `pages/<modulo>/index.tsx` que aglutina list + dialogs.

---

## Cómo usar este documento

1. Antes de tocar el frontend: leer este archivo + el archivo de contexto del módulo (`docs/modules/XX_modulo_*.md`).
2. Si una decisión cambia → editar acá.
3. Si una convención no está cubierta → preguntar antes de inventar.

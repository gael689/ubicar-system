# Ubicar Rent — Contexto General del Sistema
> Archivo maestro. Leer antes de cualquier módulo.

---

## ¿Qué es este sistema?

Sistema de gestión integral para **Ubicar Rent**, empresa de alquiler de vehículos (autos y camionetas) con sede en Bahía Blanca, Argentina. Reemplaza un Excel manual y contratos en papel por una plataforma web accesible desde computadora y celular.

**Usuarios del sistema:** Franco y Martín (dueños, acceso total). Un tercer usuario con acceso limitado solo a carga de documentación de vehículos.

---

## Stack Tecnológico

### Frontend
- **Framework:** React 18 + Vite (SPA, client-side only — es un panel interno, no necesita SSR ni SEO)
- **Lenguaje:** TypeScript (estricto, sin `any`)
- **Estilos:** Tailwind CSS
- **Componentes UI:** shadcn/ui
- **Formularios:** React Hook Form + Zod
- **Estado global:** Zustand
- **Fetching / caché:** TanStack Query (React Query) — maneja caché, loading states, refetch automático y sincronización con el backend FastAPI
- **Routing:** React Router v6
- **Calendario/timeline:** @dnd-kit para drag and drop, timeline custom
- **Gráficos:** Recharts
- **Iconos:** Lucide React
- **PDF generation:** jsPDF + html2canvas
- **Notificaciones toast:** Sonner

### Backend
- **Framework:** FastAPI (Python 3.11+)
- **ORM:** SQLAlchemy 2.0 con Alembic para migraciones
- **Base de datos:** PostgreSQL 15+
- **Autenticación:** Auth0 (delegada — resuelve JWT, refresh tokens, recuperación de contraseña sin desarrollo adicional)
- **Almacenamiento de archivos:** Cloudflare R2 o carpeta local según entorno
- **Tareas programadas:** APScheduler (alertas de vencimiento, control de 24hs)
- **Envío de mensajes:** WhatsApp vía link directo `wa.me`; email vía Resend
- **Generación de PDFs server-side:** WeasyPrint o reportlab
- **Variables de entorno:** python-dotenv

### Infraestructura
- **Hosting backend:** Railway o Render (VPS simple, ~USD 5-7/mes)
- **Hosting frontend:** Vercel o Netlify (deploy de SPA estática, gratuito)
- **Base de datos:** PostgreSQL en Railway o VPS propio
- **Auth:** Auth0 (plan free, hasta 7.500 usuarios activos — sobra para este proyecto)

### Consideración de escalabilidad — Landing page y reservas online
La landing page de Ubicar Rent existe en React y puede migrarse a Next.js a futuro. El sistema debe estar preparado para esto desde el día 1:
- La API del backend expone endpoints públicos (sin auth) para disponibilidad y reservas: `GET /public/disponibilidad`, `POST /public/reservas`.
- Estos endpoints están documentados, versionados bajo `/api/v1/` y tienen CORS configurado para aceptar el dominio de la landing además del sistema interno.
- El módulo de reservas del sistema interno y las reservas online usan la misma lógica y la misma base de datos — no hay sistemas separados.
- Cuando se implemente la reserva online, el frontend de la landing consume estos endpoints públicos directamente. No requiere cambios en el backend.

---

## Design System — Ubicar Rent

### Paleta de colores
```
--color-primary:   #407EC9   /* 30% — azul principal, botones, headers, acentos */
--color-secondary: #8BB8E8   /* 20% — azul claro, fondos de cards, hover states */
--color-white:     #FFFFFF   /* 50% — fondo general, superficies */

/* Derivados funcionales */
--color-bg:        #FFFFFF
--color-surface:   #F0F6FD   /* muy leve tinte azul para superficies secundarias */
--color-border:    #D0E4F5
--color-text:      #1A2A3A   /* casi negro con tinte azul */
--color-muted:     #6B8CAE
--color-success:   #059669
--color-warning:   #D97706
--color-danger:    #DC2626
--color-info:      #407EC9
```

### Estados de vehículos (colores consistentes en todo el sistema)
```
Disponible   → verde    #059669  bg: #D1FAE5
Alquilado    → azul     #407EC9  bg: #DBEAFE
Reservado    → amarillo #D97706  bg: #FEF3C7
En transición→ violeta  #7C3AED  bg: #EDE9FE
Fuera de servicio → rojo #DC2626 bg: #FEE2E2
```

### Tipografía
- **Font:** Inter (Google Fonts)
- **Tamaños:** base 14px, headings con escala Tailwind estándar

### Componentes base (todos en shadcn/ui)
Button, Input, Select, Dialog, Sheet, Table, Badge, Card, Tabs, Tooltip, Dropdown, Calendar, Avatar

---

## Estructura de Carpetas

```
ubicar-rent/
├── frontend/                        # React + Vite SPA
│   ├── src/
│   │   ├── main.tsx                 # Entry point
│   │   ├── App.tsx                  # Router principal
│   │   ├── pages/                   # Una carpeta por módulo
│   │   │   ├── Login.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── flota/
│   │   │   ├── ocupacion/
│   │   │   ├── reservas/
│   │   │   ├── clientes/
│   │   │   ├── contratos/
│   │   │   ├── cotizador/
│   │   │   ├── caja/
│   │   │   ├── cuentas-corrientes/
│   │   │   ├── echeqs/
│   │   │   └── reportes/
│   │   ├── components/
│   │   │   ├── ui/                  # shadcn components
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── Header.tsx
│   │   │   │   ├── AppLayout.tsx    # Wrapper con sidebar + header
│   │   │   │   └── MobileNav.tsx
│   │   │   ├── dashboard/
│   │   │   ├── flota/
│   │   │   ├── ocupacion/
│   │   │   ├── reservas/
│   │   │   ├── clientes/
│   │   │   ├── contratos/
│   │   │   ├── cotizador/
│   │   │   ├── caja/
│   │   │   └── shared/
│   │   │       ├── StatusBadge.tsx
│   │   │       ├── EmptyState.tsx
│   │   │       ├── ConfirmDialog.tsx
│   │   │       └── PageHeader.tsx
│   │   ├── lib/
│   │   │   ├── api.ts               # Axios instance con interceptors Auth0
│   │   │   ├── auth.ts              # Auth0 helpers (@auth0/auth0-react)
│   │   │   ├── utils.ts
│   │   │   └── constants.ts         # Estados, colores, enums
│   │   ├── hooks/                   # TanStack Query hooks por módulo
│   │   │   ├── useVehiculos.ts
│   │   │   ├── useClientes.ts
│   │   │   ├── useReservas.ts
│   │   │   └── ...
│   │   ├── store/
│   │   │   └── useAppStore.ts       # Zustand — estado UI global (sidebar, filtros activos)
│   │   └── types/
│   │       └── index.ts             # Todos los tipos TypeScript
│   ├── public/
│   │   └── logo-ubicar.svg
│   ├── index.html
│   ├── vite.config.ts
│   └── tsconfig.json
│
└── backend/                         # FastAPI
    ├── app/
    │   ├── main.py                  # FastAPI app, CORS, routers
    │   ├── config.py                # Settings con pydantic-settings
    │   ├── database.py              # Engine, SessionLocal, Base
    │   ├── auth.py                  # Auth0 JWT verification
    │   ├── models/                  # SQLAlchemy models
    │   │   ├── __init__.py
    │   │   ├── vehiculo.py
    │   │   ├── cliente.py
    │   │   ├── reserva.py
    │   │   ├── alquiler.py
    │   │   ├── contrato.py
    │   │   ├── pago.py
    │   │   ├── gasto.py
    │   │   ├── echeq.py
    │   │   ├── documento.py
    │   │   └── usuario.py
    │   ├── schemas/                 # Pydantic schemas
    │   │   ├── vehiculo.py
    │   │   ├── cliente.py
    │   │   ├── reserva.py
    │   │   └── ...
    │   ├── routers/                 # Endpoints por módulo (todos bajo /api/v1/)
    │   │   ├── vehiculos.py
    │   │   ├── clientes.py
    │   │   ├── reservas.py
    │   │   ├── alquileres.py
    │   │   ├── contratos.py
    │   │   ├── pagos.py
    │   │   ├── gastos.py
    │   │   ├── echeqs.py
    │   │   ├── documentos.py
    │   │   ├── cotizador.py
    │   │   ├── reportes.py
    │   │   └── public.py            # Endpoints públicos sin auth para landing page
    │   ├── services/                # Lógica de negocio
    │   │   ├── control_24hs.py      # Cálculo de excedentes
    │   │   ├── contrato_pdf.py      # Generación de contratos PDF
    │   │   ├── presupuesto_pdf.py
    │   │   ├── notificaciones.py    # WhatsApp / email
    │   │   └── alertas.py           # APScheduler jobs
    │   └── utils/
    │       └── helpers.py
    ├── alembic/                     # Migraciones DB
    ├── requirements.txt
    └── .env
```

---

## Modelos de Base de Datos (resumen)

### Usuario
```
id, email, nombre, rol (admin | docs), auth0_id, activo, created_at
```

### Vehiculo
```
id, patente, marca, modelo, año, tipo (auto | camioneta), color,
estado (disponible | alquilado | reservado | en_transicion | fuera_de_servicio),
km_actual, km_proximo_service, km_entre_services,
activo, created_at
```

### Cliente
```
id, nombre_completo, dni_cuit, telefono, email,
licencia_numero, licencia_vencimiento, licencia_categoria,
tipo (particular | empresa), es_frecuente,
notas, activo, created_at
```

### Conductores adicionales
```
id, cliente_id (FK), nombre_completo, dni, licencia_numero, licencia_vencimiento
```

### Reserva
```
id, vehiculo_id (FK), cliente_id (FK),
fecha_inicio, hora_inicio, fecha_fin, hora_fin,
lugar_entrega, lugar_devolucion,
estado (pendiente | confirmada | activa | finalizada | cancelada),
usuario_id (FK), created_at
```

### Alquiler (extiende Reserva)
```
id, reserva_id (FK),
checkout_fecha, checkout_hora, checkout_km, checkout_combustible, checkout_descripcion,
checkin_fecha, checkin_hora, checkin_km, checkin_combustible, checkin_descripcion,
horas_excedente, cargo_excedente, excedente_bonificado, bonificado_por (FK usuario),
contrato_firmado (bool), contrato_url
```

### Contrato
```
id, alquiler_id (FK), url_pdf, firmado, fecha_generacion,
datos_prellenados (jsonb), link_prellenado, link_expiracion
```

### Tarifa
```
id, vehiculo_id (FK nullable — si es null aplica a todos),
tipo (diaria | semanal | mensual), monto, activo, vigencia_desde
```

### Pago
```
id, alquiler_id (FK), monto, medio_pago (efectivo | transferencia | tarjeta | cheque | echeq),
con_factura (bool), cobrado_por (FK usuario),
fecha, notas
```

### CuentaCorriente
```
id, cliente_id (FK), saldo, updated_at
```

### MovimientoCuentaCorriente
```
id, cuenta_corriente_id (FK), tipo (debito | credito),
concepto, monto, fecha, alquiler_id (FK nullable)
```

### Echeq
```
id, tipo (emitido | recibido), monto, fecha_emision, fecha_cobro,
estado (pendiente | cobrado | rechazado | vencido),
contraparte (nombre), banco, numero_cheque,
alquiler_id (FK nullable), gasto_id (FK nullable), notas
```

### Gasto
```
id, vehiculo_id (FK), tipo (service | combustible | cubiertas | reparacion | seguro | patente | vtv | lavado | otro),
descripcion, monto, medio_pago, fecha, proveedor, km_al_momento, notas
```

### Documento
```
id, vehiculo_id (FK), tipo (poliza | vtv | clausulas | otro),
nombre, url_archivo, fecha_carga, vigencia_desde, vigencia_hasta,
cargado_por (FK usuario)
```

### Presupuesto
```
id, cliente_id (FK nullable), vehiculo_id (FK nullable),
fecha_inicio, fecha_fin, dias, tarifa_unitaria, descuento, total,
estado (borrador | enviado | aceptado | vencido),
notas, created_by (FK usuario), created_at
```

---

## Reglas de Negocio Críticas

### Control de 24 horas
- Cada alquiler corre desde la hora exacta del checkout.
- Período de gracia: **40 minutos** post-vencimiento sin cargo extra.
- Si excede los 40 min → se calcula cargo proporcional por día adicional.
- El excedente se puede bonificar manualmente. Queda registro de quién bonificó.

### Contrato obligatorio
- No se puede completar el checkout sin generar el contrato.
- El contrato puede ser pre-llenado por el cliente vía link antes de la entrega.

### Estados de vehículo
- Los cambios de estado son automáticos según el flujo (reserva → checkout → checkin).
- "En transición" se activa cuando hay un checkin y un nuevo checkout el mismo día con menos de 4 horas de diferencia.

### Tarifas
- El sistema selecciona automáticamente la tarifa según la duración (diaria < 7 días, semanal 7-29 días, mensual 30+ días).
- Se pueden aplicar tarifas especiales por cliente o por acuerdo.

### Alertas automáticas (APScheduler — corre diariamente)
- VTV o póliza por vencer (30, 15, 7 días antes).
- Licencia de cliente por vencer (30 días antes).
- Próximo service de vehículo (500 km antes del límite).
- Echeqs próximos a vencer (7 días antes).
- Devoluciones que vencen hoy.

---

## Módulos del Sistema

| # | Módulo | Archivo de contexto |
|---|---|---|
| 1 | Dashboard | `01_modulo_dashboard.md` |
| 2 | Flota (Vehículos) | `02_modulo_flota.md` |
| 3 | Ocupación y Calendario | `03_modulo_ocupacion.md` |
| 4 | Reservas y Alquileres | `04_modulo_reservas.md` |
| 5 | Contratos Digitales | `05_modulo_contratos.md` |
| 6 | Clientes | `06_modulo_clientes.md` |
| 7 | Cotizador y Presupuestos | `07_modulo_cotizador.md` |
| 8 | Caja y Pagos | `08_modulo_caja.md` |
| 9 | Cuentas Corrientes | `09_modulo_cuentas_corrientes.md` |
| 10 | Echeqs | `10_modulo_echeqs.md` |
| 11 | Reportes | `11_modulo_reportes.md` |

---

## Instrucciones para Claude Code

**Orden de construcción recomendado:**

1. Setup del proyecto (este archivo + instrucciones de base abajo).
2. Módulos 1 → 11 en orden, usando el archivo de contexto correspondiente.

**Para el setup inicial, construir:**
- Estructura de carpetas completa (frontend + backend).
- Configuración de Next.js 14 con TypeScript, Tailwind, shadcn/ui.
- Configuración de FastAPI con SQLAlchemy, Alembic, Auth0.
- Design system: variables CSS con los colores de Ubicar Rent, componentes base.
- Layout principal: Sidebar de navegación, Header, estructura de rutas.
- Pantalla de Login con Auth0.
- Página de Dashboard vacía con el layout aplicado (placeholder).
- Modelos SQLAlchemy completos y primera migración con Alembic.
- CORS configurado para desarrollo local.
- `.env.example` con todas las variables necesarias.

**Convenciones de código:**
- TypeScript estricto en frontend. Sin `any`.
- Nombres en español para rutas, variables de dominio y UI. Código y funciones en inglés.
- Componentes funcionales con hooks. Sin class components.
- Todos los endpoints de FastAPI con tipado Pydantic completo.
- Respuestas de API siempre con estructura `{ data, message, success }`.
- Manejo de errores con try/catch en frontend y HTTPException en backend.
- Fechas siempre en ISO 8601. Zona horaria: America/Argentina/Buenos_Aires.

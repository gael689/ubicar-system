# Fase 0 — Fundación

> Pre-fase fundacional. Deja el sistema listo para construir módulos.

## Objetivo

Tener:

1. Base de datos creada con todas las tablas (migración inicial Alembic aplicada).
2. Auth migrado de Auth0 a Clerk, login funcional end-to-end.
3. Estructura base del backend (capas `core/`, `domain/`, `repositories/`, `services/`) lista para que la Fase 1 la extienda.
4. Seed de usuarios admin (Franco, Martín).
5. Endpoint `/health` que verifica conectividad a DB.
6. Documentación de setup actualizada.

## Alcance

### Backend

#### B0.1 — Migración inicial Alembic

- Generar `alembic revision --autogenerate -m "initial schema"`.
- Revisar a mano el archivo generado: tipos enum correctos, FKs con `ondelete`, índices.
- Aplicar contra Postgres local.
- Verificar las 15 tablas creadas: `usuarios`, `vehiculos`, `clientes`, `conductores_adicionales`, `tarifas`, `reservas`, `alquileres`, `contratos`, `pagos`, `cuentas_corrientes`, `movimientos_cuenta_corriente`, `echeqs`, `gastos`, `documentos`, `presupuestos`.

#### B0.2 — Migrar Auth0 a Clerk

Detalle completo en `docs/AUTH_CLERK.md`. Resumen:

- `config.py`: cambiar settings de `auth0_*` a `clerk_*`.
- `auth.py`: reescribir `verify_token` para JWKS de Clerk.
- Renombrar `Usuario.auth0_sub` → `Usuario.auth_sub` (migración B0.2.1).
- Probar login con un usuario invitado en Clerk.

#### B0.3 — Estructura base de capas

Crear:

```
backend/app/
├── core/
│   ├── __init__.py
│   ├── deps.py            # get_db, get_current_user, require_role
│   ├── responses.py       # _response, _paginated
│   └── exceptions.py      # NotFoundError, ConflictError, etc.
├── domain/
│   ├── __init__.py
│   └── enums.py           # Enums centralizados
├── repositories/
│   ├── __init__.py
│   └── base.py            # BaseRepository[Model] genérico
└── services/
    └── __init__.py
```

#### B0.4 — `core/exceptions.py` y middleware de errores

Definir excepciones de dominio y un exception handler en `main.py` que las traduce a HTTPException.

#### B0.5 — `core/deps.py`

Centralizar:

- `get_db()` (mover desde `database.py`).
- `get_current_user(claims, db)` con upsert de Clerk + check de `activo`.
- `require_role(*roles)` factory para proteger endpoints por rol.

#### B0.6 — `core/responses.py`

Helpers `ok(data, message)` y `paginated(items, total, page, page_size)` para no repetir el envelope.

#### B0.7 — Seed de admins

Script `backend/scripts/seed.py` que:

- Lee `CLERK_ADMIN_SUBS` del `.env`.
- Inserta filas en `usuarios` con `auth_sub`, `email`, `nombre`, `rol='admin'`, `activo=true`.
- Idempotente (ON CONFLICT DO NOTHING).

#### B0.8 — `/health` con check de DB

```python
@app.get("/health")
async def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "db": "ok"}
```

#### B0.9 — Tests base

- `tests/conftest.py` con fixture `db_session` que usa Postgres de prueba.
- `tests/test_health.py` que valida el endpoint.
- `tests/test_auth.py` que valida flujo de upsert con un JWT mock firmado.

### Frontend

#### F0.1 — Migrar Auth0 a Clerk

Detalle en `docs/AUTH_CLERK.md`. Resumen:

- `npm uninstall @auth0/auth0-react`, `npm install @clerk/clerk-react`.
- `main.tsx`: `<ClerkProvider>`.
- `App.tsx`: `ProtectedRoute` con `useAuth` de Clerk.
- `pages/Login.tsx` → `pages/SignIn.tsx` con `<SignIn />` de Clerk.
- `hooks/useAxiosAuth.ts`: usar `getToken()` de Clerk.
- `components/layout/Header.tsx`: agregar `<UserButton />`.

#### F0.2 — Variables de entorno

Actualizar `.env.example`:

```
VITE_API_URL=http://localhost:8000/api/v1
VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxx
```

Eliminar las variables de Auth0.

#### F0.3 — Componentes shared base

Crear (no se usan todavía pero se necesitan en Fase 1):

- `components/shared/EmptyState.tsx`
- `components/shared/ConfirmDialog.tsx`
- `components/shared/PageHeader.tsx`

#### F0.4 — `lib/utils.ts` con helpers

- `extractError(err)` (ver `PLANNING_FRONTEND.md` sección 10).
- `formatCurrency(value)` con locale `es-AR`.
- `formatDate(iso, format)` con `Intl.DateTimeFormat`.
- `cn(...)` ya debería existir (util de Tailwind).

#### F0.5 — README actualizado

Actualizar `README.md` raíz con:

- Setup de Clerk (link al dashboard, env vars).
- Setup de Postgres local (Docker compose si conviene).
- Comando para correr migraciones.
- Comando para levantar backend (`uvicorn app.main:app --reload`) y frontend (`npm run dev`).

## Dependencias

Ninguna. Es la fase fundacional.

## Criterio de salida

Checklist objetiva:

- [ ] `alembic upgrade head` corre sin errores en una base limpia.
- [ ] Las 15 tablas se ven en `\dt` de psql.
- [ ] `GET /health` responde `{"status": "ok", "db": "ok"}`.
- [ ] Login con Clerk funciona end-to-end (sign-in en frontend → JWT en backend → upsert de Usuario en DB).
- [ ] Un usuario fuera de `CLERK_ADMIN_SUBS` recibe 403 al pegar a un endpoint protegido.
- [ ] El usuario logueado aparece en `usuarios` con su email correcto y rol `admin`.
- [ ] Tests `pytest` pasan (al menos `test_health` y `test_auth`).
- [ ] Estructura de carpetas `core/`, `domain/`, `repositories/`, `services/` creada (puede tener archivos vacíos).
- [ ] README actualizado con setup de Clerk.

## Smoke test

1. Levantar Postgres local.
2. Correr `alembic upgrade head`.
3. Correr `python scripts/seed.py`.
4. `uvicorn app.main:app --reload`.
5. `curl http://localhost:8000/health` → debe retornar status ok.
6. Frontend `npm run dev`.
7. Abrir `localhost:5173/sign-in` → loguearse con un admin de Clerk.
8. Verificar que aterriza en `/dashboard`.
9. Abrir DevTools → ver que el request a `/api/v1/dashboard/stats` (404 esperado, ese endpoint llega en Fase 9) lleva el `Authorization: Bearer ey...` correcto.
10. En psql: `SELECT * FROM usuarios;` debe mostrar el usuario con su email y `rol='admin'`.

## Notas de despliegue

- Migraciones nuevas en esta fase: `001_initial_schema`, `002_rename_auth0_sub`.
- Env vars nuevas en backend: `CLERK_FRONTEND_API`, `CLERK_ADMIN_SUBS`.
- Env vars eliminadas en backend: `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`.
- Env vars nuevas en frontend: `VITE_CLERK_PUBLISHABLE_KEY`.
- Env vars eliminadas en frontend: `VITE_AUTH0_*`.
- Procedimiento de rollback: `alembic downgrade base` revierte a base limpia. La rama Auth0 vive en git si hubiera que volver atrás (improbable).

## Tiempo estimado

1-2 días.

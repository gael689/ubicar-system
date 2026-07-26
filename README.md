# Ubicar Rent — Sistema de Gestión de Flota

Sistema web para la empresa de alquiler de vehículos **Ubicar Rent** (Bahía Blanca, Buenos Aires).
Reemplaza el flujo actual de Excel + contratos en papel con una plataforma digital completa.

---

## Documentación

Toda la documentación de planificación, arquitectura y módulos está en `docs/`:

| Archivo | Descripción |
|---------|-------------|
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Plan por fases con grafo de dependencias |
| [`docs/PLANNING_BACKEND.md`](docs/PLANNING_BACKEND.md) | Arquitectura, capas, convenciones backend |
| [`docs/PLANNING_FRONTEND.md`](docs/PLANNING_FRONTEND.md) | Arquitectura, convenciones frontend |
| [`docs/AUTH_CLERK.md`](docs/AUTH_CLERK.md) | Migración Auth0 → Clerk |
| [`docs/SIGUIENTES_PASOS.md`](docs/SIGUIENTES_PASOS.md) | Resumen Fases 4–10 |
| [`docs/er-diagram.html`](docs/er-diagram.html) | Diagrama ER interactivo (abrir en browser) |
| [`docs/modules/`](docs/modules/) | Contexto detallado por módulo/fase |

---

## Stack

| Capa | Tecnología |
|------|------------|
| Frontend | React 18 + Vite + TypeScript strict |
| Estilos | Tailwind CSS + shadcn/ui |
| Estado | TanStack Query v5 + Zustand |
| Formularios | React Hook Form + Zod |
| Auth | Clerk (`@clerk/clerk-react`) |
| Backend | FastAPI + Python 3.11 |
| ORM | SQLAlchemy 2.0 + Alembic |
| Base de datos | PostgreSQL 15+ |

---

## Setup rápido

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
cp .env.example .env          # completar variables
alembic upgrade head
uvicorn app.main:app --reload
```

Swagger en `http://localhost:8000/docs`

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local    # completar variables
npm run dev
```

App en `http://localhost:5173`

### Variables de entorno

**Frontend** (`.env.local`):
```env
VITE_API_URL=http://localhost:8000
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

**Backend** (`.env`):
```env
DATABASE_URL=postgresql://user:password@localhost:5432/ubicar_rent
CLERK_FRONTEND_API=https://<app>.clerk.accounts.dev
CLERK_ADMIN_SUBS=user_xxx,user_yyy
FRONTEND_URL=http://localhost:5173
STORAGE_PROVIDER=local
STORAGE_PATH=./storage
```

---

## Estado actual

- ✅ Setup base completo (frontend + backend + modelos + auth).
- 🔄 Próxima fase: **Fase 0 — Fundación** (migraciones Alembic + migración a Clerk).
- Ver [`docs/ROADMAP.md`](docs/ROADMAP.md) para el plan completo.

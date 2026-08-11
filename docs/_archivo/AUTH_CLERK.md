# Migración Auth0 → Clerk

> Documento de la decisión y el plan de migración. Aplica en Fase 0.

## Decisión

**Adoptamos Clerk en lugar de Auth0.**

Razones:

- DX: componentes UI listos (`<SignIn />`, `<UserButton />`, `<UserProfile />`) ahorran semanas de UI custom.
- Familiaridad: ya venís trabajando con Clerk, costo de aprendizaje cero.
- Tooling: Clerk Dashboard maneja invitaciones, sessions, MFA sin desarrollo adicional.
- Pricing equivalente al free tier de Auth0 para el volumen esperado (3 usuarios).

Backend cambia mínimamente: ambos servicios emiten JWT firmado con RS256 y exponen JWKS estándar. La verificación es genérica.

## Cambios en backend

### Variables de entorno

Reemplazar:

```env
# Eliminar
AUTH0_DOMAIN=...
AUTH0_AUDIENCE=...
AUTH0_CLIENT_ID=...
AUTH0_CLIENT_SECRET=...

# Agregar
CLERK_FRONTEND_API=https://<your-app>.clerk.accounts.dev
CLERK_JWT_AUDIENCE=                      # opcional, vacío en proyectos simples
CLERK_ADMIN_SUBS=user_xxx,user_yyy       # lista de auth_sub permitidos para auto-provisionar como admin
```

### `app/config.py`

Actualizar `Settings` quitando los campos `auth0_*` y agregando `clerk_frontend_api`, `clerk_admin_subs`.

### `app/auth.py`

Reescribir la verificación para apuntar al JWKS de Clerk:

```python
JWKS_URL = f"{settings.clerk_frontend_api}/.well-known/jwks.json"
```

Validaciones:

- `iss` (issuer) = `settings.clerk_frontend_api`.
- `aud` opcional (Clerk default emite con `azp` en lugar de `aud`).
- `exp`, `nbf`, `iat` con tolerancia de 30 s de clock skew.

Claims relevantes del JWT de Clerk:

- `sub` → `Usuario.auth_sub`
- `email` → `Usuario.email`
- `name` o `first_name + last_name` → `Usuario.nombre`

### Modelo `Usuario`

Renombrar `auth0_sub` → `auth_sub` (más genérico). Migración incluida en Fase 0.

### Upsert en primer login

`core/deps.py::get_current_user(claims, db)`:

1. Buscar `Usuario` por `auth_sub`.
2. Si existe y `email` cambió → actualizar.
3. Si no existe:
   - Si `auth_sub` está en `CLERK_ADMIN_SUBS` → crear con rol `admin`.
   - Si no → 403 "Usuario no autorizado".
4. Si `Usuario.activo == false` → 403.

## Cambios en frontend

### Variables de entorno

Reemplazar:

```env
# Eliminar
VITE_AUTH0_DOMAIN=...
VITE_AUTH0_CLIENT_ID=...
VITE_AUTH0_AUDIENCE=...

# Agregar
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

### Dependencias

```bash
npm uninstall @auth0/auth0-react
npm install @clerk/clerk-react
```

### `main.tsx`

```tsx
import { ClerkProvider } from '@clerk/clerk-react';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ClerkProvider>
  </React.StrictMode>
);
```

### `App.tsx`

`ProtectedRoute` ahora usa `useAuth` de Clerk en lugar de Auth0.

```tsx
import { useAuth } from '@clerk/clerk-react';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <LoadingSpinner />;
  if (!isSignedIn) return <Navigate to="/sign-in" replace />;
  return <>{children}</>;
}
```

Rutas:

```tsx
<Route path="/sign-in/*" element={<SignInPage />} />
<Route path="/sign-up/*" element={<Navigate to="/sign-in" replace />} />
```

### `pages/SignIn.tsx`

```tsx
import { SignIn } from '@clerk/clerk-react';

export function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <SignIn
        path="/sign-in"
        routing="path"
        signUpUrl=""
        appearance={{ variables: { colorPrimary: '#407EC9' } }}
      />
    </div>
  );
}
```

### `hooks/useAxiosAuth.ts`

```tsx
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

### Header con UserButton

En `components/layout/Header.tsx`:

```tsx
import { UserButton } from '@clerk/clerk-react';
<UserButton afterSignOutUrl="/sign-in" />
```

Reemplaza el botón de logout manual y el avatar custom.

## Setup en Clerk Dashboard

1. Crear aplicación nueva en clerk.com.
2. Habilitar solo Email/Password (no Google/social por ahora).
3. Deshabilitar self-signup → solo invitaciones.
4. Invitar a Franco y Martín → copiar sus `user_id` para `CLERK_ADMIN_SUBS`.
5. JWT template: usar el default (incluye `email`, `sub`, `iat`, `exp`, `iss`).
6. Copiar `Publishable Key` para frontend, `Secret Key` y `Frontend API URL` para backend.

## Plan de ejecución (Fase 0)

1. Crear app en Clerk + invitar admins.
2. Branch `feat/migrate-clerk`.
3. Backend: `config.py`, `auth.py`, modelo `Usuario` (rename), migración.
4. Frontend: deps, `main.tsx`, `App.tsx`, `Login.tsx` → `SignIn.tsx`, `useAxiosAuth.ts`, `Header.tsx`.
5. Probar login completo end-to-end con un usuario admin.
6. Probar 403 con un usuario no listado en `CLERK_ADMIN_SUBS`.
7. Borrar archivos viejos de Auth0 (`pages/Login.tsx` si se renombró).
8. Actualizar README con instrucciones de Clerk.
9. Merge.

## Riesgos y mitigaciones

- **Riesgo:** los issuers/audiences cambian en producción. **Mitigación:** env vars separadas por entorno.
- **Riesgo:** `getToken()` retorna null si la sesión expira en background. **Mitigación:** TanStack Query reintenta con backoff y Clerk re-emite token automáticamente al volver al foco.
- **Riesgo:** un admin pierde acceso al Clerk Dashboard. **Mitigación:** dejar al menos 2 owners en la org.

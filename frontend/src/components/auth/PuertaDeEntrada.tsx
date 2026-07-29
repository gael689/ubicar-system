import { useEffect } from 'react';
import { useAuth } from '@clerk/react';
import { SignIn } from '@clerk/react';
import { registrarProveedorDeToken } from '@/lib/api';

/**
 * La puerta del sistema interno.
 *
 * **Todo el sistema queda detrás de esto.** No hay pantallas públicas del lado
 * interno: quien no tiene sesión no ve ni el menú. La web pública es otra
 * aplicación (`web/`) y no pasa por acá — el cliente que reserva no necesita
 * cuenta.
 *
 * Además es donde se conecta el token con el cliente HTTP. Se registra la
 * **función** que lo trae, no el token: los de Clerk vencen al minuto.
 */
export function PuertaDeEntrada({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();

  useEffect(() => {
    registrarProveedorDeToken(isSignedIn ? () => getToken() : null);
    return () => registrarProveedorDeToken(null);
  }, [isSignedIn, getToken]);

  // Mientras Clerk resuelve si hay sesión no se muestra ni el login ni la app:
  // el parpadeo del formulario de ingreso a alguien que ya está adentro se lee
  // como que lo desloguearon.
  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-muted px-4 py-12">
        <div className="text-center">
          <img src="/logo.png" alt="Ubicar Rent" className="mx-auto mb-4 h-14 w-auto" />
          <p className="text-sm text-muted-foreground">
            Sistema de gestión — ingresá con tu cuenta
          </p>
        </div>
        <SignIn routing="hash" />
      </div>
    );
  }

  return <>{children}</>;
}

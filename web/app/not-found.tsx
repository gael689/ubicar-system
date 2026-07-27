import Link from "next/link";

/**
 * 404. En Next es un server component: no hace falta el `useEffect` que
 * logueaba la ruta en la versión Vite — el servidor ya registra los 404.
 * De paso queda en español, como el resto del sitio.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-6">
      <div className="text-center">
        <h1 className="mb-4 text-5xl font-bold text-foreground">404</h1>
        <p className="mb-6 text-xl text-muted-foreground">
          No encontramos la página que buscabas.
        </p>
        <Link
          href="/"
          className="inline-flex items-center rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}

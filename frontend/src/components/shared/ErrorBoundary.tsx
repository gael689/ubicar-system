import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * La red debajo de toda la aplicación.
 *
 * **Sin esto, cualquier campo nulo que el código no espera pinta la pantalla en
 * blanco.** Una reserva sin vehículo asignado, un `toLocaleString()` sobre
 * `undefined`, un precio que llega `null` — React desmonta el árbol entero y el
 * operador se queda mirando una pantalla vacía, sin menú y sin mensaje. La
 * única salida es F5, perdiendo lo que estuviera cargando.
 *
 * Un error de render no es un error de red: no lo agarra ningún `try/catch` ni
 * ningún `onError` de react-query. Hace falta un límite de error de React, y no
 * había ninguno en toda la app.
 *
 * **Muestra el error de verdad, no un "algo salió mal".** Quien lo va a leer no
 * es programador, pero el texto es lo único que después permite reproducirlo:
 * pedirle a alguien que cuente qué pasó sin ese dato es pedirle que adivine.
 *
 * `key` en el `children` de `App` hace que "reintentar" vuelva a montar el
 * árbol sin recargar la página, así no se pierde la sesión.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Queda en la consola para poder pegarlo en un reporte. No se manda a
    // ningún lado: no hay servicio de errores contratado y mandar datos de
    // clientes a un tercero sin decirlo sería peor que no tener el dato.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-surface p-6">
        <div className="w-full max-w-md rounded-xl border border-border bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2.5 text-danger">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <h1 className="font-bold">Se rompió esta pantalla</h1>
          </div>

          <p className="mt-3 text-sm text-muted-foreground">
            No se perdió nada de lo que ya estaba guardado. Lo que estabas
            cargando en esta pantalla sí, así que conviene revisarlo después.
          </p>

          <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-slate-100 p-3 text-[11px] leading-relaxed text-slate-700">
            {this.state.error.message || String(this.state.error)}
          </pre>

          <p className="mt-3 text-xs text-muted-foreground">
            Si vuelve a pasar, sacale una foto a este texto y pasásela a Gael:
            es lo que permite encontrar la causa.
          </p>

          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            <RotateCcw className="h-4 w-4" />
            Volver a intentar
          </button>
        </div>
      </div>
    );
  }
}

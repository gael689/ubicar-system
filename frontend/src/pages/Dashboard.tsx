import { OcupacionPage } from './ocupacion/OcupacionPage';
import { PanelHoy } from '@/components/hoy/PanelHoy';

/**
 * La pantalla de inicio: el calendario, y debajo lo que hay que hacer.
 *
 * **El calendario no cede tamaño.** Sigue ocupando todo el espacio disponible
 * (`flex-1`), con su vista anual, su timeline y su agenda intactos. Es lo que
 * se mira todo el día.
 *
 * **Debajo va `PanelHoy`, colapsado a una franja de una línea.** Reemplaza al
 * botón flotante "Ver flujo del día" y a su modal, que mostraban exactamente
 * los mismos movimientos del mismo endpoint: tener las dos cosas era dejar la
 * misma información en dos lugares.
 *
 * Lo que el modal no tenía y esto sí: la bandeja de Pendientes, y poder ver un
 * día sin abrir nada.
 *
 * Sobre el intento anterior de poner contenido acá abajo —una franja fija de
 * 220px que casi siempre decía "aún no hay movimientos"— ver el comentario de
 * `PanelHoy`: la diferencia es que ahora colapsado ocupa una línea que igual
 * informa, y que Pendientes no depende del día, así que rara vez está vacío.
 */
export function Dashboard() {
  return (
    <div className="relative flex h-full flex-col gap-0 overflow-hidden bg-background">
      <section className="min-h-0 flex-1">
        <OcupacionPage />
      </section>

      <PanelHoy />
    </div>
  );
}

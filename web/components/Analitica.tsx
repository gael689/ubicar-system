"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { EVENTO, leerConsentimiento } from "@/lib/consentimiento";

interface Props {
  metaPixelId: string;
  gaId: string;
}

/**
 * Carga el píxel de Meta y Google Analytics **sólo si el visitante aceptó**.
 *
 * Antes se cargaban siempre, en el propio `layout.tsx`. Eso contradecía la
 * política de privacidad que publicamos: no alcanza con declarar que se usan
 * cookies de terceros, hay que dejar de usarlas cuando alguien dice que no.
 *
 * **Los scripts ni siquiera se descargan sin consentimiento.** No se trata de
 * cargarlos y después no dispararlos: si el script está, ya puso sus cookies.
 * Por eso el componente devuelve `null` y no un `<Script>` desactivado.
 *
 * Reacciona al evento de consentimiento, así que aceptar en el banner activa
 * el tracking en el momento, sin recargar la página.
 *
 * Las dos categorías son independientes: aceptar analíticas y rechazar
 * publicidad carga Google y no carga Meta.
 */
export function Analitica({ metaPixelId, gaId }: Props) {
  const [publicidad, setPublicidad] = useState(false);
  const [analiticas, setAnaliticas] = useState(false);

  useEffect(() => {
    const aplicar = () => {
      const c = leerConsentimiento();
      setPublicidad(c?.publicidad === true);
      setAnaliticas(c?.analiticas === true);
    };
    aplicar();
    window.addEventListener(EVENTO, aplicar);
    return () => window.removeEventListener(EVENTO, aplicar);
  }, []);

  return (
    <>
      {publicidad && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${metaPixelId}');
          fbq('track', 'PageView');`}
        </Script>
      )}

      {analiticas && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            strategy="afterInteractive"
          />
          {/* El `consent default` va ANTES del `config`, que es el momento en
              que gtag decide si puede escribir cookies. Declararlo después no
              tiene efecto sobre lo que ya escribió.

              Acá siempre entra con analítica concedida —el script no se monta
              de otra forma—, pero la publicidad se declara por separado: quien
              aceptó medir y no aceptó publicidad no debe quedar en las
              audiencias de Google Ads. Y dejarlo declarado es lo que permite
              después revocar en caliente con un `consent update`. */}
          <Script id="ga4" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('consent', 'default', {
              analytics_storage: 'granted',
              ad_storage: '${publicidad ? "granted" : "denied"}',
              ad_user_data: '${publicidad ? "granted" : "denied"}',
              ad_personalization: '${publicidad ? "granted" : "denied"}'
            });
            gtag('js', new Date());
            gtag('config', '${gaId}', { anonymize_ip: true });`}
          </Script>
          <VistasDePagina gaId={gaId} />
        </>
      )}
    </>
  );
}

/**
 * Cuenta las páginas que se visitan después de la primera.
 *
 * El `gtag('config')` de arriba dispara **un solo** `page_view`, el de la
 * página donde el visitante entró. En el App Router pasar de la portada a
 * `/reservar` no recarga nada: es una navegación del lado del cliente, no hay
 * script nuevo y GA4 no se entera. El resultado era que todo el tráfico
 * aparecía concentrado en la home y `/reservar` figuraba con cero visitas,
 * aunque la reserva sea el flujo principal del sitio.
 *
 * Se salta la primera ejecución para no contar dos veces la página de entrada.
 *
 * Usa **sólo** `usePathname`, a propósito. `useSearchParams` obligaría a
 * renderizar del lado del cliente todo el árbol hasta el `Suspense` más
 * cercano, y como esto cuelga del layout raíz ese árbol es el sitio entero: la
 * portada dejaría de prerenderizarse por medir una visita. Además la query de
 * `/reservar` lleva fechas, así que incluirla llenaría el informe de URLs
 * únicas irrepetibles. Lo que pasa dentro del flujo ya lo cuentan los eventos
 * del embudo de `lib/analitica.ts`, que es donde corresponde.
 */
function VistasDePagina({ gaId }: { gaId: string }) {
  const pathname = usePathname();
  const primera = useRef(true);

  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    window.gtag?.("config", gaId, { anonymize_ip: true, page_path: pathname });
  }, [pathname, gaId]);

  return null;
}

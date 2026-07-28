"use client";

import { useEffect, useState } from "react";
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
          <Script id="ga4" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${gaId}', { anonymize_ip: true });`}
          </Script>
        </>
      )}
    </>
  );
}

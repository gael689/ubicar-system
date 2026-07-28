"use client";

import { useState } from "react";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
import { revocarConsentimiento } from "@/lib/consentimiento";

/**
 * Permite cambiar la decisión sobre cookies desde la política de privacidad.
 *
 * La política dice que el visitante puede ejercer sus derechos: si no hay
 * forma de revertir el "acepto todas", eso no es cierto. Revocar vuelve a
 * mostrar el aviso para decidir de nuevo.
 */
export function BotonCookies() {
  const [listo, setListo] = useState(false);

  return (
    <div className="mt-3">
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          revocarConsentimiento();
          setListo(true);
          window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
        }}
      >
        <Cookie className="h-4 w-4" /> Cambiar mis preferencias de cookies
      </Button>
      {listo && (
        <p className="mt-2 text-xs text-muted-foreground">
          Listo. El aviso volvió a aparecer al pie de la página.
        </p>
      )}
    </div>
  );
}

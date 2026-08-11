import type { Metadata } from "next";
import { FirmaContrato } from "@/components/contrato/FirmaContrato";

/**
 * La página que abre el cliente cuando le mandamos el link del contrato.
 *
 * **`noindex, nofollow` no es opcional acá.** La URL lleva el token que
 * permite leer y firmar el contrato: si un buscador la indexa, el contrato de
 * una persona queda listado en Google. `nofollow` además evita que se sigan
 * los links del PDF, y `nocache` que quede una copia en la caché del buscador
 * cuando el token ya venció.
 */
export const metadata: Metadata = {
  title: "Firmá tu contrato | Ubicar Rent",
  robots: { index: false, follow: false, nocache: true },
};

export default async function ContratoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <main className="min-h-screen bg-muted/30">
      <FirmaContrato token={token} />
    </main>
  );
}

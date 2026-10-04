import { useState } from 'react';
import { ChevronDown, ChevronUp, RotateCcw, ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { ClausulaContrato } from '@/types';

interface Props {
  /** Lo que dice la plantilla vigente: contra esto se marca lo modificado. */
  originales: ClausulaContrato[];
  /** Lo que se va a imprimir. */
  value: ClausulaContrato[];
  onChange: (c: ClausulaContrato[]) => void;
}

const textos = (c: ClausulaContrato) => c.parrafos.map(p => p.texto);

/**
 * Revisar o cambiar las cláusulas del contrato **antes de generarlo**.
 *
 * Cerrado por defecto: casi todos los contratos salen con el texto de siempre
 * y no tiene que estorbar. Lo que se cambia vale **sólo para este contrato**;
 * el contrato lo dice en el pie del reverso para que quien lo lea sepa que no
 * es el modelo estándar.
 */
export function ClausulasEditables({ originales, value, onChange }: Props) {
  const [abierto, setAbierto] = useState(false);

  const original = (n: number) => originales.find(c => c.numero === n);
  const modificada = (c: ClausulaContrato) => {
    const o = original(c.numero);
    return !o || JSON.stringify(textos(o)) !== JSON.stringify(textos(c)) || o.titulo !== c.titulo;
  };
  const cantidad = value.filter(modificada).length;

  const editarParrafo = (numero: number, i: number, texto: string) =>
    onChange(value.map(c => c.numero !== numero ? c : {
      ...c, parrafos: c.parrafos.map((p, j) => j === i ? { ...p, texto } : p),
    }));
  const restaurar = (numero: number) => {
    const o = original(numero);
    if (o) onChange(value.map(c => c.numero === numero ? o : c));
  };

  return (
    <div className="rounded-xl border border-border p-4 space-y-3" data-campo="clausulas">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">Cláusulas del contrato</p>
            <p className="text-xs text-muted-foreground">
              {cantidad === 0
                ? 'Se imprimen como siempre.'
                : `${cantidad} ${cantidad === 1 ? 'cláusula modificada' : 'cláusulas modificadas'} para este contrato.`}
            </p>
          </div>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setAbierto(a => !a)}>
          {abierto ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {abierto ? 'Cerrar' : 'Revisar o editar'}
        </Button>
      </div>

      {abierto && (
        <div className="space-y-3">
          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            Lo que cambies vale <strong>sólo para este contrato</strong>. El reverso tiene
            lugar limitado: si agregás mucho texto, bajá la vista previa del PDF y revisá
            que no se corte.
          </p>
          {value.map(c => (
            <div key={c.numero} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">
                  {c.numero}. {c.titulo}
                  {modificada(c) && (
                    <span className="ml-2 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      Modificada
                    </span>
                  )}
                </p>
                {modificada(c) && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => restaurar(c.numero)}>
                    <RotateCcw className="h-3.5 w-3.5" /> Volver al original
                  </Button>
                )}
              </div>
              {c.parrafos.map((p, i) => (
                <Textarea
                  key={i}
                  value={p.texto}
                  onChange={e => editarParrafo(c.numero, i, e.target.value)}
                  rows={Math.min(8, Math.max(2, Math.ceil(p.texto.length / 95)))}
                  className="text-xs leading-relaxed"
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

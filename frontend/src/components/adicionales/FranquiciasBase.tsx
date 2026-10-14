import { useState } from 'react';
import { Pencil, ShieldAlert } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { InputMoneda } from '@/components/shared/InputMoneda';
import { useCategorias, useUpdateCategoria } from '@/hooks/useCategorias';
import { formatCurrency } from '@/lib/utils';
import type { Categoria } from '@/types';

/**
 * La franquicia base de cada categoría, junto a las coberturas (14/10).
 *
 * Es el punto de partida de la escalera: lo máximo que paga el cliente ante un
 * siniestro **sin cobertura extra**. Cada cobertura de arriba la baja. Por eso
 * vive acá y no en Precios: se piensa junto con las coberturas, no con el
 * precio del día.
 *
 * La imprime el contrato. `null` no es cero: sin cargar, el contrato omite la
 * línea, porque "franquicia $0" se leería como "no pagás nada".
 */
export function FranquiciasBase() {
  const { data: categorias = [] } = useCategorias();
  if (categorias.length === 0) return null;
  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Franquicia base por categoría</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Lo máximo que paga el cliente ante un siniestro si no contrata ninguna cobertura. Cada
        cobertura la baja en el monto que tiene cargado. Es lo que imprime el contrato.
      </p>
      <div className="divide-y divide-border rounded-lg border border-border">
        {categorias.map(c => <Fila key={c.id} categoria={c} />)}
      </div>
    </Card>
  );
}

function Fila({ categoria }: { categoria: Categoria }) {
  const actualizar = useUpdateCategoria();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState<number | ''>('');

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
      <span className="text-sm font-medium text-foreground">{categoria.nombre}</span>
      {editando ? (
        <form
          onSubmit={e => {
            e.preventDefault();
            if (valor === '' || Number(valor) < 0) return;
            actualizar.mutate(
              { id: categoria.id, body: { franquicia_base: Number(valor) } },
              { onSuccess: () => setEditando(false) },
            );
          }}
          className="flex items-center gap-1.5"
        >
          <InputMoneda
            value={valor}
            onChange={setValor}
            placeholder="1.500.000"
            autoFocus
            className="w-32 rounded-md border border-input bg-background px-2 py-1 text-sm"
          />
          <Button size="sm" type="submit" disabled={actualizar.isPending || valor === ''}>Guardar</Button>
          <Button size="sm" variant="ghost" type="button" onClick={() => setEditando(false)}>Cancelar</Button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => { setValor(categoria.franquicia_base ?? ''); setEditando(true); }}
          className="group inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 hover:bg-muted"
          title="Cambiar la franquicia base"
        >
          {categoria.franquicia_base != null ? (
            <span className="font-semibold tabular-nums text-foreground">{formatCurrency(categoria.franquicia_base)}</span>
          ) : (
            <span className="font-medium text-amber-700">Sin cargar</span>
          )}
          <Pencil className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
        </button>
      )}
    </div>
  );
}

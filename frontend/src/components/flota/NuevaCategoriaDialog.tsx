import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { InputMoneda } from '@/components/shared/InputMoneda';
import { useCategorias, useCreateCategoria } from '@/hooks/useCategorias';
import api from '@/lib/api';
import { extractError } from '@/lib/utils';

/** "Sedán Superior" → "sedan-superior": el código interno, que nadie tipea. */
function codigoDe(nombre: string): string {
  return nombre
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Alta de una categoría desde Flota (14/10).
 *
 * Desde que Categorías se mudó a Precios no había dónde crear una. Pide lo
 * mínimo: el nombre, y opcionalmente el precio por día y si va en la web. El
 * resto (foto, franquicia base, precios por fecha) se ajusta después en
 * Precios y en Adicionales.
 *
 * **Sin precio por día no se publica por defecto**: una categoría publicada
 * sin precio la web la muestra como "sin disponibilidad".
 */
export function NuevaCategoriaDialog({ open, onOpenChange }: {
  open: boolean;
  onOpenChange: (abierto: boolean) => void;
}) {
  const qc = useQueryClient();
  const { data: categorias = [] } = useCategorias();
  const crear = useCreateCategoria();
  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState<number | ''>('');
  const [enWeb, setEnWeb] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cerrar = () => {
    setNombre(''); setPrecio(''); setEnWeb(false);
    onOpenChange(false);
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = nombre.trim();
    if (!n) return;
    setGuardando(true);
    try {
      const cat = await crear.mutateAsync({
        codigo: codigoDe(n),
        nombre: n,
        // Al final de la lista: las que ya existen no cambian de lugar.
        orden: Math.max(0, ...categorias.map(c => c.orden ?? 0)) + 1,
        visible_web: enWeb,
      });
      if (precio !== '' && Number(precio) > 0) {
        await api.post(`/categorias/${cat.id}/tarifas`, { tipo: 'diaria', monto: Number(precio) });
      }
      qc.invalidateQueries({ queryKey: ['categorias'] });
      qc.invalidateQueries({ queryKey: ['precios'] });
      toast.success(`Categoría "${n}" creada. Foto y precios por fecha, en Precios; franquicia, en Adicionales.`);
      cerrar();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) cerrar(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva categoría</DialogTitle>
          <DialogDescription>
            Por ejemplo "SUV" o "Furgón". Después se le asignan los autos desde la ficha de cada uno.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={guardar} className="space-y-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Nombre *</span>
            <input value={nombre} onChange={e => setNombre(e.target.value)} autoFocus
              placeholder="SUV" className="input-base" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Precio por día <span className="font-normal text-muted-foreground">(opcional)</span></span>
            <InputMoneda value={precio} onChange={v => { setPrecio(v); if (v !== '' && Number(v) > 0) setEnWeb(true); }}
              placeholder="60.000" className="input-base" />
            <span className="text-xs text-muted-foreground">
              El precio base, que queda fijo. Desde el calendario de Precios se ajusta por fecha.
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={enWeb} onChange={e => setEnWeb(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-primary" />
            <span>
              Mostrarla en la web
              {enWeb && (precio === '' || Number(precio) <= 0) && (
                <span className="block text-xs text-amber-700">
                  Sin precio por día, la web la va a mostrar sin disponibilidad.
                </span>
              )}
            </span>
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={cerrar}>Cancelar</Button>
            <Button type="submit" disabled={!nombre.trim() || guardando}>
              {guardando ? 'Creando…' : 'Crear categoría'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

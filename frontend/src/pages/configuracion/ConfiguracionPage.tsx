import { useEffect, useState } from 'react';
import { Save, UserPen } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/shared/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfiguracion, useUpdateConfiguracion } from '@/hooks/useConfiguracion';
import { useActualizarMiNombre, useMiUsuario } from '@/hooks/useMiUsuario';
import { extractError, formatDate } from '@/lib/utils';
import type { ConfiguracionItem } from '@/types';

const CATEGORIA_LABEL: Record<string, string> = {
  'Control de 24hs': 'Control de 24 horas (excedente)',
  control_24hs: 'Control de 24 horas (excedente)',
};

/**
 * El grupo que agrupa todo lo del sitio público.
 *
 * Se muestra en su propia pantalla ("Canal web") y **no** en Configuración
 * general: la ventana de venta, el cupo, los lugares de retiro, los datos
 * bancarios y el tope de cuotas son decisiones del canal online, y mezclarlas
 * con el CUIT de la empresa y los plazos del excedente hacía una lista plana
 * de 37 parámetros donde no se encontraba nada.
 */
const GRUPO_CANAL_WEB = 'Reservas web';

export function ConfiguracionPage({ soloCanalWeb = false }: { soloCanalWeb?: boolean }) {
  const { data: items, isLoading } = useConfiguracion();

  const grupos = (items ?? [])
    .filter(item =>
      soloCanalWeb ? item.categoria === GRUPO_CANAL_WEB : item.categoria !== GRUPO_CANAL_WEB
    )
    .reduce<Record<string, ConfiguracionItem[]>>((acc, item) => {
      if (!acc[item.categoria]) acc[item.categoria] = [];
      acc[item.categoria].push(item);
      return acc;
    }, {});

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={soloCanalWeb ? 'Canal web' : 'Configuración'}
        description={soloCanalWeb
          ? 'Todo lo que decide cómo vende el sitio: la ventana de fechas que se puede reservar, cuánto dura el cupo apartado, los lugares de retiro, el anticipo y los datos para transferencia.'
          : 'Parámetros de negocio editables sin tocar código. Los cambios aplican al instante para todo cálculo posterior. Lo del sitio público está aparte, en Canal web.'}
      />

      {!soloCanalWeb && <MiNombreEnLosDocumentos />}

      {isLoading ? (
        <Card className="p-5 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </Card>
      ) : Object.keys(grupos).length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Sin parámetros configurables.</Card>
      ) : (
        Object.entries(grupos).map(([categoria, items]) => (
          <Card key={categoria} className="p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">
              {CATEGORIA_LABEL[categoria] ?? categoria}
            </h3>
            <div className="divide-y divide-border">
              {items.map((item) => (
                <ConfiguracionRow key={item.clave} item={item} />
              ))}
            </div>
          </Card>
        ))
      )}

      <p className="text-xs text-muted-foreground px-1">
        ¿Falta un parámetro? Esta pantalla lee de una tabla genérica clave/valor — agregar uno nuevo es una fila más, no requiere rediseñar la UI.
      </p>
    </div>
  );
}

/**
 * "Usted fue atendido por" en el pie del contrato sale de acá (plan 27/09,
 * A4). El sistema intenta traerlo solo desde Clerk al iniciar sesión; si Clerk
 * no lo tiene, queda "Operador" y el contrato sale con el pie en blanco. Esta
 * es la salida manual.
 */
function MiNombreEnLosDocumentos() {
  const { data: yo } = useMiUsuario();
  const guardar = useActualizarMiNombre();
  const [nombre, setNombre] = useState('');
  useEffect(() => {
    if (yo) setNombre(yo.nombre_presentable ? yo.nombre : '');
  }, [yo]);
  if (!yo) return null;
  const dirty = nombre.trim().length >= 2 && nombre.trim() !== yo.nombre;

  return (
    <Card className={`p-5 space-y-3 ${yo.nombre_presentable ? '' : 'border-warning'}`}>
      <div className="flex items-center gap-2">
        <UserPen className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Tu nombre en los documentos</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Es el que sale en el contrato como “Usted fue atendido por”.
        {!yo.nombre_presentable && ' Todavía no está cargado: los contratos salen con esa línea en blanco.'}
      </p>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={e => { e.preventDefault(); if (dirty) guardar.mutate(nombre.trim()); }}
      >
        <Input
          value={nombre}
          onChange={e => setNombre(e.target.value)}
          placeholder="Nombre y apellido"
          className="w-64"
        />
        <Button type="submit" size="sm" disabled={!dirty || guardar.isPending}>
          <Save className="h-3.5 w-3.5" />
          {guardar.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
        <span className="text-xs text-muted-foreground">{yo.email}</span>
      </form>
    </Card>
  );
}

function ConfiguracionRow({ item }: { item: ConfiguracionItem }) {
  const [valor, setValor] = useState(item.valor);
  const update = useUpdateConfiguracion();
  const dirty = valor !== item.valor;

  async function handleSave() {
    try {
      await update.mutateAsync({ clave: item.clave, valor });
      toast.success('Configuración actualizada');
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  return (
    <div className="flex items-center gap-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{item.descripcion}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          <code className="bg-muted px-1 py-0.5 rounded">{item.clave}</code>
          {' · Última edición: '}{formatDate(item.updated_at)}
        </p>
      </div>
      <Input
        type={item.tipo === 'int' || item.tipo === 'decimal' ? 'number' : 'text'}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        className="w-28"
      />
      <Button size="sm" onClick={handleSave} disabled={!dirty || update.isPending}>
        <Save className="h-3.5 w-3.5" />
        {update.isPending ? 'Guardando…' : 'Guardar'}
      </Button>
    </div>
  );
}

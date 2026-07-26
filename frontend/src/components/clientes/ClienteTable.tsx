import { Link } from 'react-router-dom';
import { Building2, ChevronRight, Mail, Phone, Star, User } from 'lucide-react';
import type { Cliente } from '@/types';
import { LicenciaBadge } from '@/components/clientes/LicenciaBadge';
import { cn } from '@/lib/utils';

interface Props {
  clientes: Cliente[];
}

export function ClienteTable({ clientes }: Props) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Cliente</th>
            <th className="px-4 py-3 font-medium">DNI/CUIT</th>
            <th className="px-4 py-3 font-medium">Contacto</th>
            <th className="px-4 py-3 font-medium">Licencia</th>
            <th className="px-4 py-3 font-medium text-right"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {clientes.map((cliente) => (
            <tr
              key={cliente.id}
              className={cn(
                'group transition-colors hover:bg-muted/50',
                !cliente.activo && 'opacity-60 grayscale'
              )}
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    {cliente.tipo === 'empresa' ? (
                      <Building2 className="h-4 w-4" />
                    ) : (
                      <User className="h-4 w-4" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">
                        {cliente.nombre_completo}
                      </span>
                      {cliente.es_frecuente && (
                        <Star className="h-3.5 w-3.5 fill-warning text-warning" title="Cliente frecuente" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground capitalize">
                      {cliente.tipo}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <span className="font-mono text-sm">{cliente.dni_cuit}</span>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    {cliente.telefono}
                  </span>
                  {cliente.email && (
                    <span className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      {cliente.email}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-col items-start gap-1">
                  <span className="font-mono text-xs">{cliente.licencia_numero}</span>
                  <LicenciaBadge vencimiento={cliente.licencia_vencimiento} />
                </div>
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  to={`/clientes/${cliente.id}`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-background hover:text-foreground text-muted-foreground transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

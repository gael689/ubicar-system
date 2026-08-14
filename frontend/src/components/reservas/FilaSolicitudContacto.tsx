import { Clock, Mail, Phone, MessageCircle, PhoneCall, Check, Archive, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn, formatDate } from '@/lib/utils';
import { MOTIVO_SOLICITUD_LABEL, MOTIVO_SOLICITUD_COLOR } from '@/lib/constants';
import { esperandoHace } from './FilaReservaWeb';
import type { SolicitudContacto } from '@/types';

/** Sólo dígitos: `wa.me` no acepta espacios ni guiones, y el teléfono se carga
 *  a mano desde la web así que viene como la persona lo escribió. */
const soloDigitos = (tel: string) => tel.replace(/\D/g, '');

/**
 * La ficha de alguien que pidió que lo llamemos (D-61).
 *
 * **Deliberadamente distinta de `FilaReservaWeb`.** Comparte el `esperandoHace`
 * —una promesa de llamada también se enfría— pero no muestra plata, ni estado
 * de contrato, ni botón "Resolver": no hay nada que cobrar ni ningún auto que
 * asignar. Lo único que hace falta es levantar el teléfono, así que la ficha
 * responde cuatro preguntas y nada más: **quién es, cómo lo ubico, qué pidió y
 * por qué cayó acá**.
 */
export function FilaSolicitudContacto({
  solicitud: s, onContactado, onCerrar,
}: {
  solicitud: SolicitudContacto;
  onContactado: () => void;
  onCerrar: () => void;
}) {
  const espera = esperandoHace(s.created_at);
  const tel = soloDigitos(s.telefono);

  // Qué pidió. Puede no haber elegido nada todavía — quien cae acá por fecha
  // muy cerca nunca llegó a ver la grilla de vehículos.
  const cuando = s.fecha_inicio
    ? `${formatDate(s.fecha_inicio)}${s.hora_inicio ? ` ${s.hora_inicio.slice(0, 5)}` : ''}`
      + (s.fecha_fin ? ` → ${formatDate(s.fecha_fin)}${s.hora_fin ? ` ${s.hora_fin.slice(0, 5)}` : ''}` : '')
    : null;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">{s.nombre}</span>
            <span className={cn(
              'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold',
              MOTIVO_SOLICITUD_COLOR[s.motivo],
            )}>
              {MOTIVO_SOLICITUD_LABEL[s.motivo]}
            </span>
            {espera && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" /> {espera}
              </span>
            )}
          </div>

          {/* Qué pidió */}
          <p className="text-sm text-foreground">
            {cuando ?? <span className="text-muted-foreground">Sin fechas elegidas</span>}
            {s.categoria_nombre && (
              <span className="text-muted-foreground"> · {s.categoria_nombre}</span>
            )}
            {s.edad_declarada && (
              <span className="text-muted-foreground"> · {s.edad_declarada} años</span>
            )}
          </p>

          {/* El lugar tipeado a mano va destacado: es el dato que explica por
              qué la web no pudo cerrarlo sola, y el que hay que coordinar. */}
          {s.lugar_texto_libre && (
            <p className="flex items-center gap-1 text-sm text-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-warning" />
              <span className="italic">«{s.lugar_texto_libre}»</span>
            </p>
          )}
          {!s.lugar_texto_libre && s.lugar_retiro && (
            <p className="text-xs text-muted-foreground">{s.lugar_retiro}</p>
          )}

          {/* Cómo ubicarlo — los tres clickeables, que es de lo que se trata */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <a
              href={`tel:${s.telefono}`}
              className="flex items-center gap-1 font-medium text-foreground hover:text-primary"
            >
              <Phone className="h-3 w-3" /> {s.telefono}
            </a>
            <a
              href={`https://wa.me/${tel}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-muted-foreground hover:text-primary"
            >
              <MessageCircle className="h-3 w-3" /> WhatsApp
            </a>
            {s.email && (
              <a
                href={`mailto:${s.email}`}
                className="flex items-center gap-1 text-muted-foreground hover:text-primary"
              >
                <Mail className="h-3 w-3" /> {s.email}
              </a>
            )}
          </div>

          {s.notas && <p className="text-xs text-muted-foreground">{s.notas}</p>}
        </div>

        <div className="flex gap-2">
          <Button size="sm" onClick={onContactado}>
            <PhoneCall className="h-4 w-4" /> Ya lo llamé
          </Button>
          <Button size="sm" variant="ghost" onClick={onCerrar}>
            <Archive className="h-4 w-4" /> Cerrar
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** La misma ficha, apagada, para las que ya se atendieron. */
export function FilaSolicitudResuelta({ solicitud: s }: { solicitud: SolicitudContacto }) {
  return (
    <Card className="p-3 opacity-70">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Check className="h-3.5 w-3.5 text-success" />
        <span className="font-medium text-foreground">{s.nombre}</span>
        <span className="text-xs text-muted-foreground">{s.telefono}</span>
        <span className="text-xs text-muted-foreground">
          {MOTIVO_SOLICITUD_LABEL[s.motivo]}
        </span>
        {s.resultado && (
          <span className="text-xs text-muted-foreground">· {s.resultado}</span>
        )}
      </div>
    </Card>
  );
}

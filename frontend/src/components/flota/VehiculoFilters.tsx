import { Search } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { ESTADO_VEHICULO_LABEL, TIPO_VEHICULO_LABEL } from '@/lib/constants';
import type { EstadoVehiculo, TipoVehiculo } from '@/types';

const ALL = '__all__';

export interface FlotaFilters {
  q: string;
  estado: EstadoVehiculo | '';
  tipo: TipoVehiculo | '';
  incluir_inactivos: boolean;
}

interface Props {
  value: FlotaFilters;
  onChange: (next: FlotaFilters) => void;
}

export function VehiculoFilters({ value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="grid gap-1.5 flex-1 min-w-[200px]">
        <Label htmlFor="q" className="text-xs">Buscar</Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="q"
            placeholder="Patente, marca o modelo"
            className="pl-8"
            value={value.q}
            onChange={(e) => onChange({ ...value, q: e.target.value })}
          />
        </div>
      </div>

      <div className="grid gap-1.5 w-full sm:w-44">
        <Label className="text-xs">Estado</Label>
        <Select
          value={value.estado || ALL}
          onValueChange={(v) => onChange({ ...value, estado: v === ALL ? '' : (v as EstadoVehiculo) })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos</SelectItem>
            {Object.entries(ESTADO_VEHICULO_LABEL).map(([v, label]) => (
              <SelectItem key={v} value={v}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5 w-full sm:w-36">
        <Label className="text-xs">Tipo</Label>
        <Select
          value={value.tipo || ALL}
          onValueChange={(v) => onChange({ ...value, tipo: v === ALL ? '' : (v as TipoVehiculo) })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos</SelectItem>
            {Object.entries(TIPO_VEHICULO_LABEL).map(([v, label]) => (
              <SelectItem key={v} value={v}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2 sm:pb-2 sm:ml-2">
        <Switch
          id="inactivos"
          checked={value.incluir_inactivos}
          onCheckedChange={(checked) => onChange({ ...value, incluir_inactivos: checked })}
        />
        <Label htmlFor="inactivos" className="text-xs cursor-pointer select-none">
          Mostrar inactivos
        </Label>
      </div>
    </div>
  );
}

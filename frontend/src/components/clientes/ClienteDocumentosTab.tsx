import { useState } from 'react';
import { Download, FileText, Plus, Trash2, AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';

import {
  useDocumentosCliente,
  useCreateDocumentoCliente,
  useDeleteDocumentoCliente,
  type Documento,
  type DocumentoCreateInput,
} from '@/hooks/useDocumentos';
import { resolveAssetUrl } from '@/lib/api';
import { formatDate } from '@/lib/utils';

const TIPO_LABEL: Record<string, string> = {
  dni: 'DNI',
  licencia: 'Licencia',
  contrato: 'Contrato',
  otro: 'Otro',
};

const TIPO_COLOR: Record<string, string> = {
  dni: 'bg-primary/10 text-primary',
  licencia: 'bg-success/10 text-success',
  contrato: 'bg-warning/10 text-warning',
  otro: 'bg-muted/40 text-muted-foreground',
};

interface Props {
  clienteId: number;
}

function isVencido(vigenciaHasta: string | null): boolean {
  if (!vigenciaHasta) return false;
  return new Date(vigenciaHasta) < new Date();
}

function isPorVencer(vigenciaHasta: string | null, dias = 30): boolean {
  if (!vigenciaHasta) return false;
  const venc = new Date(vigenciaHasta);
  const hoy = new Date();
  const diff = (venc.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24);
  return diff > 0 && diff <= dias;
}

export function ClienteDocumentosTab({ clienteId }: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Documento | null>(null);

  const { data: documentos, isLoading } = useDocumentosCliente(clienteId);
  const createDoc = useCreateDocumentoCliente(clienteId);
  const deleteDoc = useDeleteDocumentoCliente(clienteId);

  if (isLoading) {
    return (
      <Card className="p-5 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </Card>
    );
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Documentos del cliente</h3>
          <p className="text-xs text-muted-foreground">DNI, licencia, contratos y otros archivos.</p>
        </div>
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" /> Subir documento
        </Button>
      </div>

      {(!documentos || documentos.length === 0) && (
        <EmptyState
          icon={FileText}
          title="Sin documentos"
          description="Subi el DNI, licencia u otros documentos del cliente."
        />
      )}

      {documentos && documentos.length > 0 && (
        <div className="divide-y divide-border rounded-lg border">
          {documentos.map(doc => (
            <div key={doc.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground truncate">{doc.nombre}</span>
                    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${TIPO_COLOR[doc.tipo] ?? TIPO_COLOR.otro}`}>
                      {TIPO_LABEL[doc.tipo] ?? doc.tipo}
                    </span>
                    {isVencido(doc.vigencia_hasta) && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger">
                        <AlertTriangle className="h-3 w-3" /> Vencido
                      </span>
                    )}
                    {isPorVencer(doc.vigencia_hasta) && !isVencido(doc.vigencia_hasta) && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                        <AlertTriangle className="h-3 w-3" /> Por vencer
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {doc.vigencia_desde && doc.vigencia_hasta
                      ? `Vigencia: ${formatDate(doc.vigencia_desde)} — ${formatDate(doc.vigencia_hasta)}`
                      : `Cargado: ${formatDate(doc.fecha_carga.split('T')[0])}`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {doc.archivo_url && (
                  <Button variant="ghost" size="sm" asChild>
                    <a href={resolveAssetUrl(doc.archivo_url) ?? '#'} target="_blank" rel="noopener noreferrer">
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(doc)}>
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <DocumentoClienteFormInline
          onSubmit={(data) => {
            createDoc.mutate(data, { onSuccess: () => setFormOpen(false) });
          }}
          onCancel={() => setFormOpen(false)}
          loading={createDoc.isPending}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="Eliminar documento"
        description={`Esto elimina "${deleteTarget?.nombre}" permanentemente.`}
        confirmLabel="Eliminar"
        destructive
        loading={deleteDoc.isPending}
        onConfirm={async () => {
          if (deleteTarget) {
            await deleteDoc.mutateAsync(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
      />
    </Card>
  );
}

function DocumentoClienteFormInline({
  onSubmit,
  onCancel,
  loading,
}: {
  onSubmit: (data: DocumentoCreateInput) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [tipo, setTipo] = useState<string>('dni');
  const [nombre, setNombre] = useState('');
  const [vigDesde, setVigDesde] = useState('');
  const [vigHasta, setVigHasta] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !nombre.trim()) return;
    onSubmit({
      tipo: tipo as DocumentoCreateInput['tipo'],
      nombre: nombre.trim(),
      vigencia_desde: vigDesde || null,
      vigencia_hasta: vigHasta || null,
      file,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-dashed border-primary/40 p-4 bg-primary/5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Tipo</label>
          <select
            value={tipo}
            onChange={e => setTipo(e.target.value)}
            className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          >
            <option value="dni">DNI</option>
            <option value="licencia">Licencia</option>
            <option value="contrato">Contrato</option>
            <option value="otro">Otro</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Nombre</label>
          <input
            type="text"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="DNI frente y dorso"
            className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Vigencia desde</label>
          <input
            type="date"
            value={vigDesde}
            onChange={e => setVigDesde(e.target.value)}
            className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Vigencia hasta</label>
          <input
            type="date"
            value={vigHasta}
            onChange={e => setVigHasta(e.target.value)}
            className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Archivo (PDF, imagen)</label>
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary"
          required
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={loading || !file}>
          {loading ? 'Subiendo...' : 'Subir'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

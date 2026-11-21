/**
 * Prospectos: selección en masa (las de la página, o todas las del filtro).
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

const filas = Array.from({ length: 3 }, (_, i) => ({
  id: i + 1, nombre: `Empresa ${i + 1}`, segmento: 'Constructoras', ciudad: 'Bahía Blanca',
  direccion: null, telefono: null, email: `e${i + 1}@x.com`, website: null, instagram: null,
  score: 80, estado: 'nuevo', es_cliente: i === 2, ya_cliente_id: i === 2 ? 9 : null,
  ya_cliente_nombre: i === 2 ? 'Cliente SA' : null, cruce_por: i === 2 ? 'nombre' : null,
  cruce_descartado: false,
  no_contactar: false, no_contactar_motivo: null, notas: null,
}));
const mut = { mutate: vi.fn(), isPending: false };
const importar = { mutate: vi.fn(), isPending: false };
const simular = {
  mutate: vi.fn((_l: unknown, o: { onSuccess: (t: unknown) => void }) =>
    o.onSuccess({ nuevos: 1, actualizados: 0, invalidos: 0, ya_clientes: 0 })),
  isPending: false,
};
const agregar = { mutate: vi.fn(), isPending: false };

vi.mock('@/hooks/useProspectos', () => ({
  // 120 en total, pero la página trae 3: para que aparezca "seleccionar todos".
  useProspectos: () => ({ data: { items: filas, total: 120 }, isLoading: false, isFetching: false }),
  useResumenProspectos: () => ({ data: {
    total: 200, contactables: 120, por_estado: { cliente: 5, no_contactar: 2 },
    segmentos: [{ segmento: 'Constructoras', cantidad: 120 }], ciudades: ['Bahía Blanca'],
  } }),
  useContarSeleccion: (f: unknown) => ({ data: f ? { cantidad: 120, supera_el_maximo: false, maximo: 5000 } : undefined }),
  useCambiarEstadoProspectos: () => mut,
  useNoEsClienteProspecto: () => mut,
  useCruzarProspectos: () => mut,
  useImportarArchivoProspectos: () => importar,
  useSimularImportacion: () => simular,
  useAgregarProspecto: () => agregar,
  usePanelProspeccion: () => ({ data: {
    contactables: 120, enviados_semana: 40, respuestas: 3, bajas: 1, envio: { listo: false },
  } }),
  useCampanasProspecto: () => ({ data: [], isLoading: false }),
  useCampanaProspecto: () => ({ data: undefined }),
  useGuardarMensajeCampana: () => mut,
  useAccionCampana: () => mut,
  useMarcarRespondio: () => mut,
  useCasillas: () => ({ isLoading: false, data: {
    casillas: [], raiz: 'ubicar-rent.com.ar', modo: 'manual', aviso: 'La API key es de sólo-envío.', dominios: [],
    envio: { listo: false },
  } }),
  useAccionCasilla: () => mut,
  useDominio: () => mut,
  useGuardarCasilla: () => mut,
}));

import { ProspectosPage } from './ProspectosPage';

describe('Prospectos', () => {
  it('muestra las marcas del cruce y nunca un "contactado antes"', () => {
    render(<ProspectosPage />);
    expect(screen.getByText('¿Es Cliente SA?')).toBeTruthy();
    // Era el historial de leadgen, no de Ubicar (14/10): no se muestra más.
    expect(screen.queryByText('Contactado antes')).toBeNull();
    expect(screen.getByText(/No es el mismo/)).toBeTruthy();
  });

  it('seleccionar la página ofrece seleccionar todos los que cumplen el filtro', async () => {
    const user = userEvent.setup();
    render(<ProspectosPage />);
    await user.click(screen.getByLabelText('Seleccionar los de esta página'));
    expect(screen.getByText('3', { selector: 'strong' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Seleccionar los 120 que cumplen el filtro/ }));
    expect(screen.getByText('120', { selector: 'strong' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Crear campaña/ })).toBeTruthy();
  });

  it('sin selección no aparece la barra de acciones', () => {
    render(<ProspectosPage />);
    expect(screen.queryByRole('button', { name: /Crear campaña/ })).toBeNull();
  });

  it('importar muestra la vista previa y recién después guarda', async () => {
    const user = userEvent.setup();
    render(<ProspectosPage />);
    const archivo = new File([JSON.stringify({ prospectos: [{ nombre: 'Constructora Sur', fuente: 'web' }] })], 'p.json', { type: 'application/json' });
    await user.upload(screen.getByTestId('archivo-prospectos'), archivo);
    const previa = await screen.findByTestId('vista-previa-importacion');
    expect(simular.mutate.mock.calls[0][0]).toEqual([{ nombre: 'Constructora Sur', fuente: 'web' }]);
    expect(previa.textContent).toMatch(/1Nuevas/);
    expect(importar.mutate).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Importar' }));
    expect(importar.mutate.mock.calls[0][0]).toEqual([{ nombre: 'Constructora Sur', fuente: 'web' }]);
  });

  it('acepta un CSV de planilla con los nombres de columna de la gente', async () => {
    simular.mutate.mockClear();
    const user = userEvent.setup();
    render(<ProspectosPage />);
    const csv = 'Empresa;Mail;Rubro\n"Sur; S.A.";compras@sur.com.ar;Constructoras\n';
    await user.upload(screen.getByTestId('archivo-prospectos'), new File([csv], 'lista.csv', { type: 'text/csv' }));
    await screen.findByTestId('vista-previa-importacion');
    expect(simular.mutate.mock.calls[0][0]).toEqual([
      { nombre: 'Sur; S.A.', email: 'compras@sur.com.ar', segmento: 'Constructoras' },
    ]);
  });

  it('un archivo que no se puede leer no se manda', async () => {
    simular.mutate.mockClear();
    const user = userEvent.setup();
    render(<ProspectosPage />);
    await user.upload(screen.getByTestId('archivo-prospectos'), new File(['{hola'], 'x.json', { type: 'application/json' }));
    await new Promise(r => setTimeout(r, 50));
    expect(simular.mutate).not.toHaveBeenCalled();
  });

  it('agregar prospecto a mano', async () => {
    const user = userEvent.setup();
    render(<ProspectosPage />);
    await user.click(screen.getByRole('button', { name: /Agregar prospecto/ }));
    await user.type(screen.getByLabelText('Empresa'), 'Montajes Norte');
    await user.type(screen.getByLabelText('Mail'), 'info@norte.com.ar');
    await user.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(agregar.mutate.mock.calls[0][0]).toEqual({ nombre: 'Montajes Norte', email: 'info@norte.com.ar' });
  });

  it('el resumen de arriba y las tres pestañas', async () => {
    const user = userEvent.setup();
    render(<ProspectosPage />);
    expect(screen.getByText('Enviados esta semana')).toBeTruthy();
    expect(screen.getByText('40')).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: 'Campañas' }));
    expect(screen.getByText(/Todavía no mandaste ninguna campaña/)).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: 'Casillas' }));
    expect(screen.getByText(/Modo manual/)).toBeTruthy();
  });

  it('una casilla en la raíz del dominio se rechaza explicando por qué', async () => {
    const user = userEvent.setup();
    render(<ProspectosPage />);
    await user.click(screen.getByRole('tab', { name: 'Casillas' }));
    await user.click(screen.getByRole('button', { name: /Agregar casilla/ }));
    await user.type(screen.getByLabelText('Dirección'), 'franco@ubicar-rent.com.ar');
    await user.type(screen.getByLabelText('Nombre visible'), 'Franco');
    expect(screen.getByRole('alert').textContent).toMatch(/confirmaciones de reserva/);
    expect((screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

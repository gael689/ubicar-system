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
  cruce_descartado: false, contacto_previo: i === 1, contacto_previo_detalle: null,
  no_contactar: false, no_contactar_motivo: null, notas: null,
}));
const mut = { mutate: vi.fn(), isPending: false };
const importar = { mutate: vi.fn(), isPending: false };

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
  useCampanasProspecto: () => ({ data: [], isLoading: false }),
  useCampanaProspecto: () => ({ data: undefined }),
  useCrearCampanaProspecto: () => mut,
  useGuardarMensajeCampana: () => mut,
  usePrepararCampana: () => mut,
}));

import { ProspectosPage } from './ProspectosPage';

describe('Prospectos', () => {
  it('muestra las marcas del cruce y del contacto previo', () => {
    render(<ProspectosPage />);
    expect(screen.getByText('¿Es Cliente SA?')).toBeTruthy();
    expect(screen.getByText('Contactado antes')).toBeTruthy();
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

  it('importar archivo manda la lista del .json', async () => {
    const user = userEvent.setup();
    render(<ProspectosPage />);
    const archivo = new File([JSON.stringify({ prospectos: [{ nombre: 'Constructora Sur' }] })], 'p.json', { type: 'application/json' });
    await user.upload(screen.getByTestId('archivo-prospectos'), archivo);
    await vi.waitFor(() => expect(importar.mutate).toHaveBeenCalled());
    expect(importar.mutate.mock.calls[0][0]).toEqual([{ nombre: 'Constructora Sur' }]);
  });

  it('un archivo que no es el del sincronizador no se manda', async () => {
    importar.mutate.mockClear();
    const user = userEvent.setup();
    render(<ProspectosPage />);
    await user.upload(screen.getByTestId('archivo-prospectos'), new File(['hola'], 'x.json', { type: 'application/json' }));
    await new Promise(r => setTimeout(r, 50));
    expect(importar.mutate).not.toHaveBeenCalled();
  });
});

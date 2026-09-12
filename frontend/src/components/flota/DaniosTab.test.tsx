/**
 * El parte de daños adentro de la devolución.
 *
 * El reporte del mostrador, del 10/09:
 *
 * > *"Desde el celu cuando estoy registrando el check in, pongo registrar
 * > daños, agrego un daño y me saca a la parte de reservas y alquileres. No sé
 * > si me registró el daño o no y no me deja seguir avanzando."*
 *
 * No era el celular. Los botones de este componente no tenían `type`, y un
 * `<button>` sin `type` adentro de un `<form>` **envía el formulario**: tocar
 * "Registrar daño" registraba la devolución entera con lo que hubiera en
 * pantalla y cerraba el modal. Estos tests montan el componente adentro de un
 * formulario y verifican que ningún botón lo envíe.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const crearDanio = vi.fn();
const subirFoto = vi.fn();
const mut = { mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false };
let daniosEnServidor: any[] = [];

vi.mock('@/hooks/useDanios', () => ({
  useDanios: () => ({ data: daniosEnServidor, isLoading: false }),
  useCrearDanio: () => ({ mutateAsync: crearDanio, isPending: false }),
  useSubirFotoDanio: () => ({ mutateAsync: subirFoto, isPending: false }),
  useActualizarDanio: () => mut,
  useImputarDanio: () => mut,
  useCobrarDanio: () => mut,
  useBonificarDanio: () => mut,
  useDarDeBajaDanio: () => mut,
  useEliminarFotoDanio: () => mut,
}));
vi.mock('@/lib/api', () => ({ default: {}, api: {}, resolveAssetUrl: (x: string) => x }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

import { DaniosTab } from './DaniosTab';

const danio = (over: Partial<any> = {}) => ({
  id: 31, vehiculo_id: 7, alquiler_id: 5, cliente_id: 3, momento: 'checkin', zona: 'Puerta',
  tipo: 'rayon', severidad: 'leve', descripcion: null, fecha_deteccion: '2026-09-10',
  costo_estimado: null, monto_imputado: null, responsable: 'sin_definir', estado: 'detectado',
  movimiento_cc_id: null, motivo_bonificacion: null, activo: true, registrado_por: 1,
  created_at: '2026-09-10T12:00:00', fotos: [], vehiculo_patente: 'AB123CD', cliente_nombre: 'Juan',
  ...over,
});

beforeEach(() => {
  daniosEnServidor = [];
  crearDanio.mockReset();
  subirFoto.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:foto-${++n}`);
  URL.revokeObjectURL = vi.fn();
});

function adentroDeUnFormulario(ui: React.ReactNode) {
  const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
  render(<form onSubmit={onSubmit}>{ui}</form>);
  return onSubmit;
}

const foto = (nombre: string) => new File(['x'], nombre, { type: 'image/jpeg' });

describe('Ningún botón del parte de daños envía el formulario que lo contiene', () => {
  it('"Registrar daño", cargar la zona con Enter y "Guardar daño" no envían la devolución', async () => {
    const user = userEvent.setup();
    crearDanio.mockResolvedValue({ data: { data: danio() } });
    const onSubmit = adentroDeUnFormulario(
      <DaniosTab vehiculoId={7} alquilerId={5} momento="checkin" alcance="alquiler" compacto />,
    );

    await user.click(screen.getByRole('button', { name: /Registrar daño/i }));
    await user.type(screen.getByPlaceholderText('Ej: Puerta trasera izq.'), 'Puerta{Enter}');
    await waitFor(() => expect(crearDanio).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: /Registrar daño/i }));
    await user.type(screen.getByPlaceholderText('Ej: Puerta trasera izq.'), 'Capó');
    await user.click(screen.getByRole('button', { name: /Guardar daño/i }));
    await waitFor(() => expect(crearDanio).toHaveBeenCalledTimes(2));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('los botones de un daño ya cargado tampoco', async () => {
    const user = userEvent.setup();
    daniosEnServidor = [danio()];
    const onSubmit = adentroDeUnFormulario(
      <DaniosTab vehiculoId={7} alquilerId={5} momento="checkin" alcance="alquiler" compacto />,
    );

    for (const nombre of [/^Foto$/, /Imputar al cliente/, /Marcar reparado/, /Dar de baja/]) {
      await user.click(screen.getByRole('button', { name: nombre }));
    }
    expect(onSubmit).not.toHaveBeenCalled();
    // Y no hay formularios anidados: HTML inválido, con envío implícito propio.
    expect(document.querySelectorAll('form form')).toHaveLength(0);
  });

  it('sin zona no guarda y lo dice, en vez de depender del `required` de un form', async () => {
    const user = userEvent.setup();
    adentroDeUnFormulario(<DaniosTab vehiculoId={7} compacto />);
    await user.click(screen.getByRole('button', { name: /Registrar daño/i }));
    await user.click(screen.getByRole('button', { name: /Guardar daño/i }));
    expect(crearDanio).not.toHaveBeenCalled();
    expect(screen.getByText('Indicá la zona del daño.')).toBeInTheDocument();
  });
});

describe('El daño se carga con sus fotos en un solo paso', () => {
  it('las fotos elegidas antes de guardar se suben al daño recién creado', async () => {
    const user = userEvent.setup();
    crearDanio.mockResolvedValue({ data: { data: danio({ id: 44 }) } });
    subirFoto.mockResolvedValue(danio({ id: 44 }));
    const onCreado = vi.fn();
    render(<DaniosTab vehiculoId={7} momento="checkout" alcance="sesion" compacto onCreado={onCreado} />);

    await user.click(screen.getByRole('button', { name: /Registrar daño/i }));
    await user.type(screen.getByPlaceholderText('Ej: Puerta trasera izq.'), 'Paragolpes');
    fireEvent.change(screen.getByTestId('danio-camara'), { target: { files: [foto('a.jpg')] } });
    fireEvent.change(screen.getByTestId('danio-galeria'), { target: { files: [foto('b.jpg'), foto('c.jpg')] } });

    expect(screen.getAllByRole('img')).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: /Guardar daño con 3 fotos/i }));

    await waitFor(() => expect(subirFoto).toHaveBeenCalledTimes(3));
    expect(subirFoto.mock.calls.map(c => c[0].id)).toEqual([44, 44, 44]);
    expect(crearDanio.mock.calls[0][0]).toMatchObject({ momento: 'checkout', alquiler_id: null, zona: 'Paragolpes' });
    expect(onCreado).toHaveBeenCalledWith(expect.objectContaining({ id: 44 }));
    expect(toast.success).toHaveBeenCalledWith('Daño registrado con 3 fotos');
  });

  it('si una foto no sube, el daño igual queda y el aviso lo dice', async () => {
    const user = userEvent.setup();
    crearDanio.mockResolvedValue({ data: { data: danio({ id: 45 }) } });
    subirFoto.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Network Error'));
    render(<DaniosTab vehiculoId={7} alquilerId={5} momento="checkin" alcance="alquiler" compacto />);

    await user.click(screen.getByRole('button', { name: /Registrar daño/i }));
    await user.type(screen.getByPlaceholderText('Ej: Puerta trasera izq.'), 'Techo');
    fireEvent.change(screen.getByTestId('danio-galeria'), { target: { files: [foto('a.jpg'), foto('b.jpg')] } });
    await user.click(screen.getByRole('button', { name: /Guardar daño con 2 fotos/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.error.mock.calls[0][0]).toMatch(/El daño quedó registrado, pero 1 de 2 fotos no subieron/);
  });

  it('en la devolución lista sólo los daños nuevos de este alquiler, no los que ya traía', () => {
    daniosEnServidor = [
      danio({ id: 1, zona: 'Nuevo en la devolución', momento: 'checkin' }),
      danio({ id: 2, zona: 'Constatado al entregar', momento: 'checkout' }),
    ];
    render(<DaniosTab vehiculoId={7} alquilerId={5} momento="checkin" alcance="alquiler" compacto />);
    expect(screen.getByText('Nuevo en la devolución')).toBeInTheDocument();
    expect(screen.queryByText('Constatado al entregar')).not.toBeInTheDocument();
  });
});

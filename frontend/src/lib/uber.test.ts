import { describe, it, expect } from 'vitest';
import { cantidadDeSemanas, fechasDePagoUber, totalUber } from './uber';
import {
  armarCondicion, fechaCorta, linkWhatsappUber, mensajeWhatsappUber, realinearFechas,
  separarCondicion, telefonoWhatsapp, validarFechasDePago,
} from './uber';

describe('contrato de Uber', () => {
  it('cuenta las semanas enteras o empezadas', () => {
    expect(cantidadDeSemanas(7)).toBe(1);
    expect(cantidadDeSemanas(8)).toBe(2);
    expect(cantidadDeSemanas(28)).toBe(4);
    expect(cantidadDeSemanas(0)).toBe(1);
  });

  it('el total de semanas completas es exacto y el resto se prorratea', () => {
    expect(totalUber(200000, 28)).toBe(800000);
    expect(totalUber(210000, 10)).toBe(300000);
  });

  it('propone una fecha de pago por semana desde el retiro', () => {
    expect(fechasDePagoUber('2026-10-05', 21)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19']);
    expect(fechasDePagoUber('2026-10-28', 14)).toEqual(['2026-10-28', '2026-11-04']);
  });

  it('sin fecha de retiro no propone nada', () => {
    expect(fechasDePagoUber('', 14)).toEqual([]);
  });
});

describe('fechas de pago alineadas', () => {
  it('con el día del retiro es lo mismo que la propuesta', () => {
    expect(realinearFechas('2026-10-05', 21, 0)).toEqual(fechasDePagoUber('2026-10-05', 21));
  });

  it('"paga los viernes" por adelantado: la primera al retirar, el resto el viernes anterior', () => {
    // Retira un miércoles.
    expect(realinearFechas('2026-10-07', 21, 4)).toEqual(['2026-10-07', '2026-10-09', '2026-10-16']);
  });

  it('vencido paga al cerrar cada semana y nunca después de devolver', () => {
    expect(realinearFechas('2026-10-05', 14, 0, 'vencido')).toEqual(['2026-10-12', '2026-10-19']);
    expect(realinearFechas('2026-10-05', 14, 4, 'vencido')).toEqual(['2026-10-16', '2026-10-19']);
  });

  it('siempre sale una por semana y en orden', () => {
    for (let dia = 0; dia < 7; dia++) {
      for (const modalidad of ['adelantado', 'vencido'] as const) {
        for (const dias of [1, 7, 8, 10, 28, 30]) {
          expect(validarFechasDePago(realinearFechas('2026-10-07', dias, dia, modalidad), dias)).toBeNull();
        }
      }
    }
  });

  it('no deja quedar con distinta cantidad de fechas que de semanas', () => {
    expect(validarFechasDePago(['2026-10-05'], 14)).toMatch(/2 semanas.*1 fecha/);
    expect(validarFechasDePago(['2026-10-05', '2026-10-12', '2026-10-19'], 14)).toMatch(/una por semana/);
    expect(validarFechasDePago(['2026-10-05', '2026-10-05'], 14)).toMatch(/en orden/);
    expect(validarFechasDePago(['2026-10-05', ''], 14)).toMatch(/completar/);
    // Mover una fecha puntual sí se puede.
    expect(validarFechasDePago(['2026-10-05', '2026-10-14'], 14)).toBeNull();
  });

  it('muestra la fecha con el día', () => {
    expect(fechaCorta('2026-11-23')).toBe('lun 23/11');
  });
});

describe('condición de pago', () => {
  it('se guarda como una frase y se vuelve a leer', () => {
    expect(armarCondicion('adelantado', '')).toBe('Semanal por adelantado');
    expect(armarCondicion('vencido', ' por transferencia ')).toBe('Semanal vencido — por transferencia');
    expect(separarCondicion('Semanal vencido — por transferencia')).toEqual({ modalidad: 'vencido', nota: 'por transferencia' });
  });

  it('el texto libre de un contrato viejo queda como nota', () => {
    expect(separarCondicion('paga los viernes en efectivo')).toEqual({ modalidad: 'adelantado', nota: 'paga los viernes en efectivo' });
    expect(separarCondicion(null)).toEqual({ modalidad: 'adelantado', nota: '' });
  });
});

describe('WhatsApp del chofer', () => {
  it('arma el número internacional argentino desde cualquier forma de cargarlo', () => {
    expect(telefonoWhatsapp('+54 9 291 418-0554')).toBe('5492914180554');
    expect(telefonoWhatsapp('0291 15 418-0554')).toBe('5492914180554');
    expect(telefonoWhatsapp('291 4180554')).toBe('5492914180554');
    expect(telefonoWhatsapp('+54 291 4180554')).toBe('5492914180554');
    expect(telefonoWhatsapp('15 418-0554')).toBe('5492914180554');
    expect(telefonoWhatsapp('4180554')).toBe('5492914180554');
    expect(telefonoWhatsapp('011 15 5555-6666')).toBe('5491155556666');
  });

  it('sin número no hay link', () => {
    expect(telefonoWhatsapp('A COMPLETAR')).toBeNull();
    expect(telefonoWhatsapp(null)).toBeNull();
    expect(linkWhatsappUber('', 'hola')).toBeNull();
  });

  it('el mensaje cambia según cómo viene el chofer', () => {
    const base = { chofer: 'Juan Pérez', auto: 'Fiat Cronos AB123CD', semana: 3, monto: 200000, semanasAdeudadas: 0, proximaFecha: null };
    expect(mensajeWhatsappUber({ ...base, estado: 'vence_hoy' }))
      .toMatch(/^Hola Juan, te recordamos que hoy vence la semana 3 del Fiat Cronos AB123CD: \$200\.000/);
    expect(mensajeWhatsappUber({ ...base, estado: 'atrasado', semanasAdeudadas: 2, monto: 400000 }))
      .toMatch(/Tenés pendiente 2 semanas del Fiat Cronos AB123CD: \$400\.000/);
    expect(linkWhatsappUber('2914180554', 'hola che')).toBe('https://wa.me/5492914180554?text=hola%20che');
  });
});

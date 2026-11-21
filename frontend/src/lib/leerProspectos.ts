/**
 * Lee un archivo de prospectos, sea el `.json` del sincronizador
 * (`{ prospectos: [...] }` o la lista sola) o un `.csv` armado en una planilla.
 *
 * El CSV se parsea acá, a mano y sin librería: son pocas reglas (comillas,
 * separador `,` o `;` según cómo lo exportó Excel) y no justifican una
 * dependencia. Las columnas se reconocen por nombre, con los alias que usa la
 * gente al armar una planilla ("Empresa", "Mail", "Web", "Rubro"…).
 */

const ALIAS: Record<string, string> = {
  nombre: 'nombre', empresa: 'nombre', razon_social: 'nombre',
  segmento: 'segmento', rubro: 'segmento', categoria: 'segmento',
  ciudad: 'ciudad', localidad: 'ciudad',
  direccion: 'direccion', domicilio: 'direccion',
  telefono: 'telefono', tel: 'telefono', celular: 'telefono', whatsapp: 'telefono',
  email: 'email', mail: 'email', correo: 'email', 'e-mail': 'email',
  website: 'website', web: 'website', sitio: 'website', pagina: 'website',
  instagram: 'instagram', ig: 'instagram',
  score: 'score', puntaje: 'score',
  notas: 'notas', nota: 'notas', observaciones: 'notas', comentario: 'notas',
  fuente: 'fuente', ref_externa: 'ref_externa', id: 'ref_externa',
};

function normalizarColumna(texto: string): string {
  return texto.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_');
}

/** Las celdas de un CSV, respetando comillas y saltos de línea dentro de una celda. */
export function celdasDeCsv(texto: string): string[][] {
  const limpio = texto.replace(/^﻿/, '');
  const primera = limpio.split(/\r?\n/, 1)[0] ?? '';
  // Excel en español exporta con `;`: gana el separador que más aparece en el encabezado.
  const sep = (primera.match(/;/g)?.length ?? 0) > (primera.match(/,/g)?.length ?? 0) ? ';' : ',';
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = '';
  let entreComillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (entreComillas) {
      if (c === '"' && limpio[i + 1] === '"') { celda += '"'; i++; }
      else if (c === '"') entreComillas = false;
      else celda += c;
    } else if (c === '"') entreComillas = true;
    else if (c === sep) { fila.push(celda); celda = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && limpio[i + 1] === '\n') i++;
      fila.push(celda); celda = '';
      filas.push(fila); fila = [];
    } else celda += c;
  }
  if (celda !== '' || fila.length) { fila.push(celda); filas.push(fila); }
  return filas.filter(f => f.some(x => x.trim() !== ''));
}

export function prospectosDeCsv(texto: string): Record<string, string>[] {
  const [encabezado, ...filas] = celdasDeCsv(texto);
  if (!encabezado) return [];
  const columnas = encabezado.map(c => ALIAS[normalizarColumna(c)] ?? null);
  if (!columnas.includes('nombre')) {
    throw new Error('Al archivo le falta una columna «Nombre» (o «Empresa»).');
  }
  return filas.map(fila => {
    const item: Record<string, string> = {};
    columnas.forEach((col, i) => {
      const valor = (fila[i] ?? '').trim();
      if (col && valor) item[col] = valor;
    });
    return item;
  });
}

/** La lista de prospectos de un archivo `.json` o `.csv`. Tira un `Error` con un texto mostrable. */
export function leerProspectos(texto: string, nombreDeArchivo: string): unknown[] {
  const esCsv = /\.csv$/i.test(nombreDeArchivo) || !/^\s*[[{]/.test(texto);
  let lista: unknown;
  if (esCsv) {
    lista = prospectosDeCsv(texto);
  } else {
    let datos: unknown;
    try {
      datos = JSON.parse(texto);
    } catch {
      throw new Error('No pude leer ese archivo: tiene que ser un .json o un .csv.');
    }
    lista = Array.isArray(datos) ? datos : (datos as { prospectos?: unknown })?.prospectos;
  }
  if (!Array.isArray(lista) || lista.length === 0) {
    throw new Error('Ese archivo no trae ninguna empresa.');
  }
  return lista;
}

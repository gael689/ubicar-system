/**
 * Achica una foto en el navegador antes de subirla.
 *
 * **Por qué.** Una foto de la cámara de un teléfono pesa entre 3 y 8 MB. En el
 * mostrador, con 4G flojo, eso es casi un minuto por foto — y un parte de
 * daños lleva varias. A 1600 px de lado y calidad 0,8 la misma foto queda en
 * 200-400 KB y sigue mostrando el rayón con detalle de sobra.
 *
 * **Nunca falla.** Si el navegador no puede decodificar la imagen (un HEIC en
 * Chrome, un entorno sin canvas) o si el resultado pesa más que el original,
 * devuelve el archivo tal cual: subir la foto grande es peor que subirla
 * chica, pero no subirla es peor que las dos. El backend acepta hasta 10 MB y
 * también HEIC.
 */
export const LADO_MAXIMO = 1600;
const CALIDAD = 0.8;

export async function comprimirImagen(file: File, ladoMaximo = LADO_MAXIMO): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bitmap = await decodificar(file);
    if (!bitmap) return file;

    const escala = Math.min(1, ladoMaximo / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);

    const canvas = document.createElement('canvas');
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, ancho, alto);
    if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close();

    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', CALIDAD));
    if (!blob || blob.size >= file.size) return file;

    const base = (file.name || 'foto').replace(/\.[^.]+$/, '');
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}

/**
 * `createImageBitmap` con `imageOrientation: 'from-image'` respeta la rotación
 * EXIF: sin eso, la foto sacada con el teléfono vertical sale acostada, porque
 * al redibujarla en el canvas se pierde el dato que la enderezaba.
 */
async function decodificar(file: File): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return null;
  }
}

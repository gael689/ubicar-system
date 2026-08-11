import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

async function imgToBase64(src: string): Promise<string> {
  try {
    const res = await fetch(src);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return src;
  }
}

async function bakeCssFilter(img: HTMLImageElement): Promise<void> {
  const cssFilter = img.style.filter || '';
  if (!cssFilter.includes('invert')) return;
  const src = img.src;
  await new Promise<void>((resolve) => {
    const tmp = new Image();
    const apply = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width  = tmp.naturalWidth  || 200;
        canvas.height = tmp.naturalHeight || 80;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // No usar ctx.filter (Canvas 2D Filters API): soporte inconsistente en
          // navegadores/webviews móviles (iOS Safari viejo, in-app webviews Android),
          // lo que hacía que el logo saliera con sus colores originales en el PDF.
          // globalCompositeOperation es una API de composición mucho más antigua y
          // universalmente soportada; 'source-in' + fillRect blanco reproduce el mismo
          // efecto que brightness(0) invert(1): vuelve blanco cualquier píxel opaco
          // preservando la transparencia.
          ctx.drawImage(tmp, 0, 0);
          ctx.globalCompositeOperation = 'source-in';
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          img.src = canvas.toDataURL('image/png');
          img.style.filter = 'none';
        }
      } catch { /* si falla canvas queda el src original */ }
      resolve();
    };
    tmp.onload  = apply;
    tmp.onerror = () => resolve();
    tmp.crossOrigin = 'anonymous';
    tmp.src = src;
  });
}

export type ExportResult = 'shared' | 'downloaded' | 'cancelled';

/**
 * Descarga el PDF, siempre por el navegador.
 *
 * **No se usa `navigator.share`.** Existe tambien en escritorio, y ahi abre el
 * panel de compartir del sistema operativo: una ventana ajena al navegador que
 * para bajar el archivo obliga a dar mas vueltas. Lo esperado -- y lo que la
 * gente reconoce -- es la descarga que aparece arriba a la derecha, la misma de
 * cualquier PDF.
 *
 * Si algun dia se quiere compartir directo a WhatsApp desde el telefono, es un
 * boton aparte y explicito, no un cambio silencioso de comportamiento segun el
 * dispositivo.
 */
async function shareOrDownload(pdf: jsPDF, filename: string): Promise<ExportResult> {
  pdf.save(filename);
  return 'downloaded';
}

export async function exportCotizacionPDF(previewId: string, filename: string): Promise<ExportResult> {
  const element = document.getElementById(previewId);
  if (!element) throw new Error('Preview no encontrado');

  // Clonar y colocar offscreen para renderizar sin afectar el DOM visible
  const clone = element.cloneNode(true) as HTMLElement;
  Object.assign(clone.style, {
    position: 'absolute',
    top: '0',
    left: '-9999px',
    width: '794px',
  });
  document.body.appendChild(clone);

  try {
    // Convertir imágenes a base64 y hornear filtros CSS (logo blanco)
    const imgs = Array.from(clone.querySelectorAll<HTMLImageElement>('img'));
    await Promise.all(imgs.map(async (img) => {
      img.src = await imgToBase64(img.src);
      await bakeCssFilter(img);
    }));

    // Dar tiempo a que las imágenes carguen en el clon
    await new Promise(r => setTimeout(r, 400));

    const canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      width: 794,
      windowWidth: 794,
      scrollX: 0,
      scrollY: 0,
      logging: false,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.97);

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pdfW = pdf.internal.pageSize.getWidth();   // 210 mm
    const pdfH = pdf.internal.pageSize.getHeight();  // 297 mm
    const imgH = (canvas.height * pdfW) / canvas.width;

    if (imgH <= pdfH) {
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, imgH);
    } else {
      // Contenido mayor a 1 página: partir en páginas
      let yOffset = 0;
      let remaining = imgH;
      while (remaining > 0) {
        pdf.addImage(imgData, 'JPEG', 0, -yOffset, pdfW, imgH);
        remaining -= pdfH;
        yOffset   += pdfH;
        if (remaining > 0) pdf.addPage();
      }
    }

    /**
     * **Que se abra mostrando la hoja entera.**
     *
     * Sin esto, el visor usa su zoom por defecto —normalmente 100%, o el
     * último que usó la persona— y la cotización aparece gigante y cortada
     * apenas se abre. El cliente lo primero que ve es un pedazo del
     * encabezado, y tiene que alejar a mano para entender qué le mandaron.
     *
     * `fullpage` guarda esa preferencia **dentro del PDF**, así que vale igual
     * en el celular, en el mail y en el visor del navegador. `fullwidth` sería
     * peor: llena el ancho pero deja el pie afuera.
     */
    pdf.setDisplayMode('fullpage');

    return await shareOrDownload(pdf, filename);
  } finally {
    document.body.removeChild(clone);
  }
}

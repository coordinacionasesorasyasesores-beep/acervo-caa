import { limpiar, type TextoExtraido } from './tipos'

/**
 * PDF con pdf.js. No va en nuestro Web Worker porque pdf.js ya levanta
 * el suyo: el trabajo pesado sale del hilo principal por su cuenta y
 * anidar workers solo trae problemas de empaquetado.
 *
 * Un PDF escaneado devuelve texto vacío. Eso no es un error —es un
 * hecho sobre el archivo— y hay que decírselo al usuario antes de que
 * suba algo que nunca va a encontrar buscando.
 */
export async function extraerPdf(buffer: ArrayBuffer): Promise<TextoExtraido> {
  const pdfjs = await import('pdfjs-dist')

  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url,
  ).toString()

  const tarea = pdfjs.getDocument({ data: new Uint8Array(buffer) })
  const doc = await tarea.promise

  const paginas: string[] = []
  const numPages = doc.numPages

  try {
    for (let i = 1; i <= numPages; i++) {
      const pagina = await doc.getPage(i)
      const contenido = await pagina.getTextContent()

      const texto = contenido.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')

      paginas.push(texto)
      pagina.cleanup()
    }
  } finally {
    // `destroy` vive en la tarea de carga, no en el documento: es lo que
    // apaga el worker que pdf.js levantó.
    await tarea.destroy()
  }

  const texto = limpiar(paginas.join('\n\n'))

  // Un PDF de texto real trae bastante más que unos cuantos caracteres
  // por página; por debajo de eso casi siempre es un escaneo con algún
  // encabezado suelto.
  const escaneado = texto.length < numPages * 20

  return {
    texto: escaneado ? '' : texto,
    paginas: numPages,
    advertencia: escaneado
      ? 'Este PDF no tiene capa de texto: parece escaneado. Se guarda y se puede descargar, pero no aparecerá al buscar por su contenido hasta que agreguemos OCR.'
      : null,
  }
}

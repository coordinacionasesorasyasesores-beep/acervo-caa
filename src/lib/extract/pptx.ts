import { limpiar, type TextoExtraido } from './tipos'

/**
 * PowerPoint no tiene librería de extracción decente en el navegador, así
 * que se abre el .pptx como el zip que es y se leen los nodos <a:t> de
 * cada diapositiva, que es donde vive todo el texto visible.
 *
 * En F1 no hay preview de PPT, así que este texto es lo único que hace
 * buscable una presentación. Vale la pena que salga bien.
 */
export async function extraerPptx(buffer: ArrayBuffer): Promise<TextoExtraido> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(buffer)

  const diapositivas = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => numeroDe(a) - numeroDe(b))

  const notas = Object.keys(zip.files).filter((n) =>
    /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n),
  )

  const partes: string[] = []

  for (const [i, ruta] of diapositivas.entries()) {
    const xml = await zip.files[ruta].async('string')
    const texto = textoDeXml(xml)
    if (texto) partes.push(`## Diapositiva ${i + 1}\n${texto}`)
  }

  // Las notas del ponente suelen tener la explicación real de la lámina.
  for (const ruta of notas.sort((a, b) => numeroDe(a) - numeroDe(b))) {
    const xml = await zip.files[ruta].async('string')
    const texto = textoDeXml(xml)
    if (texto) partes.push(texto)
  }

  const texto = limpiar(partes.join('\n\n'))

  return {
    texto,
    paginas: diapositivas.length,
    advertencia: texto
      ? null
      : 'La presentación no tiene texto: probablemente son imágenes. No será buscable por contenido.',
  }
}

function numeroDe(ruta: string): number {
  return Number(ruta.match(/(\d+)\.xml$/)?.[1] ?? 0)
}

/**
 * Los nodos <a:t> son el texto; <a:p> son párrafos y <a:br> saltos.
 * Se resuelven las entidades XML para no dejar "&amp;" en el índice.
 */
function textoDeXml(xml: string): string {
  const lineas: string[] = []

  for (const parrafo of xml.split(/<a:p[ >]/).slice(1)) {
    const trozos = [...parrafo.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map((m) =>
      desescapar(m[1]),
    )
    const linea = trozos.join('').trim()
    if (linea) lineas.push(linea)
  }

  return lineas.join('\n')
}

function desescapar(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')
}

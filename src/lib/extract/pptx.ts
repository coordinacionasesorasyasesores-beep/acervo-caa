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
  const mudas: number[] = []
  let mudasConImagen = 0

  for (const [i, ruta] of diapositivas.entries()) {
    const xml = await zip.files[ruta].async('string')
    const texto = textoDeXml(xml)
    if (texto) partes.push(`## Diapositiva ${i + 1}\n${texto}`)

    if (!diceAlgo(texto)) {
      mudas.push(i + 1)
      if (tieneImagen(xml)) mudasConImagen++
    }
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
    advertencia: advertirDeMudas(mudas, mudasConImagen, diapositivas.length),
  }
}

/**
 * Un archivo de gráficas casi nunca es todo texto ni todo imagen: son unas
 * láminas de portada y análisis, y otras que son la gráfica exportada como
 * imagen. Esas últimas no entran al buscador, y quien sube el archivo tiene
 * que enterarse ahí mismo —no meses después, cuando busque una cifra que
 * está en el archivo y no aparezca.
 */
function advertirDeMudas(mudas: number[], conImagen: number, total: number): string | null {
  if (mudas.length === 0) return null

  const causa =
    conImagen >= mudas.length / 2
      ? 'son gráficas o imágenes'
      : 'no tienen texto que extraer'

  if (mudas.length === total) {
    return `Ninguna de las ${total} diapositivas tiene texto: ${causa}. La presentación no será buscable por contenido; conviene escribir un resumen a mano.`
  }

  return `${mudas.length} de ${total} diapositivas (${enumerar(mudas)}) ${causa}: su contenido no será buscable. El resto sí.`
}

/** Con más de cuatro, la lista completa estorba más de lo que informa. */
function enumerar(numeros: number[]): string {
  if (numeros.length <= 4) {
    return numeros.length === 1
      ? `la ${numeros[0]}`
      : `${numeros.slice(0, -1).join(', ')} y ${numeros.at(-1)}`
  }
  return `${numeros.slice(0, 3).join(', ')}… ${numeros.at(-1)}`
}

/**
 * Una lámina cuyo único texto es su número de página está tan muda como una
 * vacía. Se miden solo las letras: "8" no dice nada, "Camas censables" sí.
 */
function diceAlgo(texto: string): boolean {
  const letras = texto.replace(/[^\p{L}]/gu, '').length
  return letras >= 10
}

function tieneImagen(xml: string): boolean {
  return /<p:pic[ >]|<a:blip[ >/]/.test(xml)
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

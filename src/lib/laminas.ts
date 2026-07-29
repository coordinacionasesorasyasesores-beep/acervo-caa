/**
 * El texto de una presentación, devuelto a su forma de láminas.
 *
 * El extractor deja el PPTX como un solo texto con marcas
 * `## Diapositiva N`. Volcado así es ilegible, y no por el texto: es que
 * una gráfica de PowerPoint sale como fragmentos sueltos, cada etiqueta en
 * su propio renglón. En la presentación de deterioro del ISSSTE, la lámina
 * que comparaba el Estado benefactor con el periodo neoliberal salía como
 * cuarenta renglones de `3.62 / consultas / 2.13 / consultas / -41.2% /
 * menos consultas`, cuando en la lámina eso era una tabla de tres columnas.
 *
 * Esto vive aparte del componente a propósito: es la única parte con
 * decisiones que se pueden equivocar en silencio —qué cuenta como dato,
 * cuál es el título, qué láminas faltan— y aparte se puede probar contra un
 * archivo real sin abrir un navegador.
 *
 * Ninguna regla de aquí adivina de más: lo que no reconoce lo deja como
 * párrafo. De las dos maneras de fallar —dejar un renglón feo, o inventar
 * una estructura que el documento no tenía— la segunda es la grave.
 */

export type Lamina = {
  numero: number
  titulo: string | null
  cuerpo: Trozo[]
  /** "Fuente: …" aparte del cuerpo: en un acervo la procedencia es su propio dato. */
  fuentes: string[]
}

export type Trozo =
  | { clase: 'texto'; valor: string }
  | { clase: 'rotulo'; valor: string }
  | { clase: 'datos'; valores: Pieza[] }

export type Pieza = Dato | Serie

export type Dato = {
  clase: 'dato'
  valor: string
  /** El renglón corto que venía delante de la cifra: "Caída del", "Total de". */
  etiqueta: string | null
  /** El renglón corto que venía detrás de la cifra: "consultas", "por millón". */
  unidad: string | null
  /** Un porcentaje con signo no es una cifra más: es el cambio que la lámina enseñaba. */
  cambio: 'sube' | 'baja' | null
}

/**
 * Una escala: muchas cifras seguidas, sin unidad, subiendo o bajando a
 * pasos iguales. `$0 $5,000 $10,000 … $40,000` no es información, es el eje
 * de la gráfica, y puesto entero pesa lo mismo que el dato que la lámina
 * quería enseñar. Se recoge en un solo trozo que se puede abrir, porque en
 * este acervo nada se tira: se deja de estorbar.
 *
 * La pantalla no dice "escala", dice "seis cifras seguidas". A veces la racha
 * no es un eje sino la foliación o unas etiquetas suicidas de PowerPoint, y
 * describir la forma es cierto siempre; nombrar la intención, no.
 */
export type Serie = { clase: 'serie'; valores: string[] }

/** Cifras, años, porcentajes: lo que en la lámina era una etiqueta o una barra. */
function esCifra(linea: string): boolean {
  return linea.length <= 16 && /\d/.test(linea) && /^[$€%\d\s.,:;\-–—+()]+$/.test(linea)
}

/**
 * Tras una cifra suele venir su unidad en un renglón aparte, porque en la
 * lámina estaban en la misma caja de texto. Se vuelven a pegar. El tope de
 * largo es lo que separa una unidad de una frase: "menos camas disponibles"
 * acompaña a su cifra; "Casi las mismas unidades de 1er nivel" no.
 */
function esUnidad(linea: string): boolean {
  return (
    linea.length <= 26 && !esCifra(linea) && !/[.:!?]$/.test(linea) && !quedaColgado(linea)
  )
}

/**
 * Un renglón que acaba en preposición o artículo no ha terminado: la frase
 * sigue en el renglón siguiente. En la lámina de gasto por derechohabiente
 * decía "Caída del" y debajo "79%", y sin esto "Caída del" se pegaba como
 * unidad del `$40,000` anterior —la cifra equivocada, el sentido invertido.
 * Colgado así, el renglón es la entrada de la cifra que viene, no la cola de
 * la que pasó.
 */
const COLGADO = /\s(de|del|de la|la|el|los|las|un|una|en|por|con|para|a|al|y|o|más|menos)$/i

function quedaColgado(linea: string): boolean {
  return COLGADO.test(linea)
}

/**
 * Solo una cifra que mide algo puede llevar unidad. Las presentaciones
 * están llenas de números desnudos que no son datos: el "1", "2", "3" que
 * numera los apartados de una lámina, el folio al pie. Sin esta condición,
 * el "3" que encabezaba un apartado se quedaba con "La cobertura se
 * desplomó" pegado detrás, como si fuera su unidad de medida.
 */
function puedeLlevarUnidad(cifra: string): boolean {
  return /[$€%+]/.test(cifra) || /\d[.,]\d/.test(cifra) || cifra.replace(/\D/g, '').length >= 3
}

function cambioDe(cifra: string): Dato['cambio'] {
  if (!cifra.includes('%')) return null
  if (/^[-−–]/.test(cifra)) return 'baja'
  if (/^\+/.test(cifra)) return 'sube'
  return null
}

const ES_FUENTE = /^fuentes?\s*[:|]/i

/**
 * Un renglón corto todo en mayúsculas no es prosa: en la lámina era un
 * rótulo. En la comparación del Estado benefactor con el periodo neoliberal,
 * "ACCESO", "ESTADO BENEFACTOR (1960-1982)" y "CAÍDA" eran los encabezados
 * de las tres columnas, y puestos al tamaño del texto corrido pesaban lo
 * mismo que los dos párrafos que explicaban la lámina.
 */
function esRotulo(linea: string): boolean {
  return linea.length <= 40 && linea === linea.toUpperCase() && /\p{L}\p{L}/u.test(linea)
}

/** Cifras seguidas son una serie: una fila, no una cifra por renglón. */
function agregar(cuerpo: Trozo[], dato: Dato): void {
  const ultimo = cuerpo[cuerpo.length - 1]
  if (ultimo?.clase === 'datos') ultimo.valores.push(dato)
  else cuerpo.push({ clase: 'datos', valores: [dato] })
}

function comoNumero(cifra: string): number | null {
  const n = Number(cifra.replace(/[^\d.\-]/g, '').replace(/(?!^)-/g, ''))
  return Number.isFinite(n) ? n : null
}

/** Una cifra pelada: sin etiqueta, sin unidad, sin signo de cambio. */
function esPelada(p: Pieza): p is Dato {
  return p.clase === 'dato' && !p.etiqueta && !p.unidad && !p.cambio
}

const MINIMO_ESCALA = 5

/**
 * Busca dentro de una fila los tramos que son escala —cinco cifras peladas o
 * más, a pasos iguales— y los recoge. El paso constante es lo que distingue
 * un eje de unos datos: seis indicadores de una tabla no van de cinco mil en
 * cinco mil.
 */
function recogerEscalas(valores: Pieza[]): Pieza[] {
  const salida: Pieza[] = []
  let i = 0

  while (i < valores.length) {
    let fin = i
    if (esPelada(valores[i])) {
      let paso: number | null = null
      while (fin + 1 < valores.length && esPelada(valores[fin + 1])) {
        const a = comoNumero((valores[fin] as Dato).valor)
        const b = comoNumero((valores[fin + 1] as Dato).valor)
        if (a === null || b === null || a === b) break
        const d = b - a
        if (paso === null) paso = d
        else if (Math.abs(d - paso) > Math.abs(paso) * 0.02) break
        fin++
      }
    }

    if (fin - i + 1 >= MINIMO_ESCALA) {
      salida.push({
        clase: 'serie',
        valores: valores.slice(i, fin + 1).map((p) => (p as Dato).valor),
      })
    } else {
      salida.push(...valores.slice(i, fin + 1))
    }
    i = fin + 1
  }

  return salida
}

export function analizar(texto: string, laminas: number | null): Lamina[] {
  const partes = texto.split(/^##\s*Diapositiva\s+(\d+)\s*$/m)
  const encontradas = new Map<number, Lamina>()

  // partes = [previo, numero, contenido, numero, contenido, …]
  for (let i = 1; i < partes.length; i += 2) {
    const numero = Number(partes[i])
    const todas = (partes[i + 1] ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)

    const fuentes = todas.filter((l) => ES_FUENTE.test(l))
    const lineas = todas.filter((l) => !ES_FUENTE.test(l))
    if (lineas.length === 0 && fuentes.length === 0) continue

    const cuerpo: Trozo[] = []
    for (let j = 1; j < lineas.length; j++) {
      const linea = lineas[j]

      if (!esCifra(linea)) {
        // Un renglón colgado seguido de una cifra es su entrada: "Caída del" + "79%".
        const cifra = lineas[j + 1]
        if (quedaColgado(linea) && linea.length <= 26 && cifra && esCifra(cifra)) {
          agregar(cuerpo, {
            clase: 'dato',
            valor: cifra,
            etiqueta: linea,
            unidad: null,
            cambio: cambioDe(cifra),
          })
          j++
          continue
        }
        if (esRotulo(linea)) {
          // Rótulos seguidos eran una tira de encabezados, no cinco renglones.
          const ultimo = cuerpo[cuerpo.length - 1]
          if (ultimo?.clase === 'rotulo') ultimo.valor += ' · ' + linea
          else cuerpo.push({ clase: 'rotulo', valor: linea })
          continue
        }
        cuerpo.push({ clase: 'texto', valor: linea })
        continue
      }

      const siguiente = lineas[j + 1]
      const unidad =
        puedeLlevarUnidad(linea) && siguiente && esUnidad(siguiente) ? siguiente : null
      if (unidad) j++

      agregar(cuerpo, {
        clase: 'dato',
        valor: linea,
        etiqueta: null,
        unidad,
        cambio: cambioDe(linea),
      })
    }

    for (const t of cuerpo) if (t.clase === 'datos') t.valores = recogerEscalas(t.valores)

    encontradas.set(numero, { numero, titulo: lineas[0] ?? null, cuerpo, fuentes })
  }

  if (encontradas.size === 0) return []

  // Los huecos: láminas que existen en el archivo pero no dejaron texto.
  const tope = Math.max(laminas ?? 0, ...encontradas.keys())
  const todas: Lamina[] = []
  for (let n = 1; n <= tope; n++) {
    todas.push(encontradas.get(n) ?? { numero: n, titulo: null, cuerpo: [], fuentes: [] })
  }
  return todas
}

/**
 * El "1", "2", "3" que numera los apartados de una lámina. Es un número,
 * pero no mide nada, y pintado como los demás se lee como si fuera un dato.
 */
export function esMarca(p: Pieza): boolean {
  return p.clase === 'dato' && !p.etiqueta && !p.unidad && /^\d{1,2}$/.test(p.valor)
}

export function estaVacia(l: Lamina): boolean {
  return !l.titulo && l.cuerpo.length === 0 && l.fuentes.length === 0
}

/**
 * Junta las láminas sin texto que van seguidas. Seis tarjetas vacías ocupan
 * más que las siete que sí dicen algo; un renglón que diga "de la 8 a la
 * 13" informa lo mismo y no compite con el contenido. Los números se
 * conservan porque son lo único que permite ir a buscarlas en el archivo.
 */
export type Tramo = Lamina | { vacias: number[] }

export function porTramos(laminas: Lamina[]): Tramo[] {
  const tramos: Tramo[] = []
  for (const l of laminas) {
    if (!estaVacia(l)) {
      tramos.push(l)
      continue
    }
    const ultimo = tramos[tramos.length - 1]
    if (ultimo && 'vacias' in ultimo) ultimo.vacias.push(l.numero)
    else tramos.push({ vacias: [l.numero] })
  }
  return tramos
}

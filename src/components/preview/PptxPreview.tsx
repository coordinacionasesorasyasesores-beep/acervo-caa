'use client'

import { Image as IconoImagen, Presentation } from 'lucide-react'
import { useArchivo } from './useArchivo'
import { Cargando, Fallo } from './Estados'

/**
 * El texto de una presentación, devuelto a su forma de láminas.
 *
 * En F1 no hay preview renderizado de PPT —montarlo exigiría el worker de
 * conversión que se decidió evitar— así que lo único que hay es el texto
 * extraído. Volcado en crudo es ilegible, y no por el texto: es que una
 * gráfica de PowerPoint sale como veinte fragmentos sueltos, cada etiqueta
 * de eje en su propio renglón. Diez líneas de `$5,000 / $10,000 / $15,000`
 * seguidas no informan de nada y entierran la frase que sí importaba.
 *
 * Aquí se hacen tres cosas con eso:
 *
 * 1. Se parte por lámina, que es la unidad en la que la gente piensa una
 *    presentación.
 * 2. La primera línea de cada lámina se trata como su título.
 * 3. Las rachas de fragmentos cortos —cifras, años, porcentajes— se
 *    agrupan en una fila. Veinte renglones pasan a ser dos, y lo que era
 *    ruido vertical se vuelve lo que siempre fue: los datos de una gráfica.
 *
 * Y se enseñan los huecos. Si la presentación tiene trece láminas y el
 * texto solo trae siete, las otras seis son imágenes: decirlo es más útil
 * que dejar que alguien crea que la presentación se acaba en la séptima.
 */

type Lamina = { numero: number; titulo: string | null; cuerpo: Trozo[] }
type Trozo = { clase: 'texto'; valor: string } | { clase: 'datos'; valores: string[] }

/** Cifras, años, porcentajes: lo que en la lámina era una etiqueta de eje. */
function esDato(linea: string): boolean {
  if (linea.length > 16) return false
  return /^[$€%\d\s.,:;\-–—()+]+$/.test(linea) || /^-?\d+([.,]\d+)?\s*%$/.test(linea)
}

function analizar(texto: string, laminas: number | null): Lamina[] {
  const partes = texto.split(/^##\s*Diapositiva\s+(\d+)\s*$/m)
  const encontradas = new Map<number, Lamina>()

  // partes = [previo, numero, contenido, numero, contenido, …]
  for (let i = 1; i < partes.length; i += 2) {
    const numero = Number(partes[i])
    const lineas = (partes[i + 1] ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)

    if (lineas.length === 0) continue

    const cuerpo: Trozo[] = []
    for (const linea of lineas.slice(1)) {
      const ultimo = cuerpo[cuerpo.length - 1]
      if (esDato(linea)) {
        if (ultimo?.clase === 'datos') ultimo.valores.push(linea)
        else cuerpo.push({ clase: 'datos', valores: [linea] })
      } else {
        cuerpo.push({ clase: 'texto', valor: linea })
      }
    }

    encontradas.set(numero, { numero, titulo: lineas[0] ?? null, cuerpo })
  }

  if (encontradas.size === 0) return []

  // Los huecos: láminas que existen en el archivo pero no dejaron texto.
  const tope = Math.max(laminas ?? 0, ...encontradas.keys())
  const todas: Lamina[] = []
  for (let n = 1; n <= tope; n++) {
    todas.push(encontradas.get(n) ?? { numero: n, titulo: null, cuerpo: [] })
  }
  return todas
}

export function PptxPreview({
  versionId,
  laminas,
}: {
  versionId: string
  /** `page_count` de la versión: sirve para saber cuántas no dejaron texto. */
  laminas: number | null
}) {
  const { texto, error, cargando } = useArchivo(versionId, 'texto')

  if (error) return <Fallo>{error}</Fallo>
  if (cargando || texto === null) return <Cargando>Abriendo la presentación…</Cargando>

  const todas = analizar(texto, laminas)

  if (todas.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-linea bg-white px-6 py-10 text-center">
        <p className="text-sm text-tinta-suave">
          Esta presentación no dejó texto que mostrar: sus láminas son imágenes.
          Puedes descargarla.
        </p>
      </div>
    )
  }

  const conTexto = todas.filter((l) => l.cuerpo.length > 0 || l.titulo)
  const sinTexto = todas.length - conTexto.length

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-tinta-suave">
        <span className="inline-flex items-center gap-1.5">
          <Presentation size={14} strokeWidth={1.8} aria-hidden />
          {todas.length} lámina{todas.length === 1 ? '' : 's'}
        </span>
        {sinTexto > 0 && (
          <>
            <span aria-hidden>·</span>
            <span>
              {sinTexto} sin texto, porque {sinTexto === 1 ? 'es' : 'son'} imagen
              {sinTexto === 1 ? '' : 'es'}
            </span>
          </>
        )}
        <span aria-hidden>·</span>
        <span>descarga el archivo para verlas como láminas</span>
      </div>

      <ol className="grid gap-3 sm:grid-cols-2">
        {todas.map((l) => (
          <li key={l.numero}>
            <Tarjeta lamina={l} />
          </li>
        ))}
      </ol>
    </div>
  )
}

function Tarjeta({ lamina }: { lamina: Lamina }) {
  const vacia = !lamina.titulo && lamina.cuerpo.length === 0

  if (vacia) {
    return (
      <div className="flex h-full min-h-28 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-linea px-4 py-5 text-center">
        <IconoImagen size={18} strokeWidth={1.6} aria-hidden className="text-niebla" />
        <p className="text-xs text-tinta-suave">
          Lámina {lamina.numero} · imagen, sin texto
        </p>
      </div>
    )
  }

  return (
    <article className="flex h-full flex-col rounded-lg border border-linea bg-white px-4 py-3.5">
      <header className="mb-2 flex items-baseline gap-2">
        {/* El número es referencia, no jerarquía: va en tamaño de nota al
            pie para que el título de la lámina sea lo primero que se lee. */}
        <span className="shrink-0 font-mono text-xs text-niebla tabular-nums">
          {String(lamina.numero).padStart(2, '0')}
        </span>
        {lamina.titulo && (
          <h4 className="font-serif text-base leading-snug">{lamina.titulo}</h4>
        )}
      </header>

      <div className="space-y-2">
        {lamina.cuerpo.map((t, i) =>
          t.clase === 'texto' ? (
            <p key={i} className="text-sm leading-relaxed text-tinta-suave">
              {t.valor}
            </p>
          ) : (
            // Los datos de la gráfica, en fila. Con `tabular-nums` las
            // cifras se alinean entre sí y se leen como una serie.
            <div key={i} className="flex flex-wrap gap-1">
              {t.valores.map((v, j) => (
                <span
                  key={j}
                  className="rounded bg-papel px-1.5 py-0.5 font-mono text-xs text-tinta-suave tabular-nums"
                >
                  {v}
                </span>
              ))}
            </div>
          ),
        )}
      </div>
    </article>
  )
}

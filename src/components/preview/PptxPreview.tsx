'use client'

import { Images, Presentation } from 'lucide-react'
import type { Dato, Lamina, Pieza } from '@/lib/laminas'
import { analizar, esMarca, estaVacia, porTramos } from '@/lib/laminas'
import { useArchivo } from './useArchivo'
import { Cargando, Fallo } from './Estados'

/**
 * Las láminas de una presentación, una debajo de otra.
 *
 * En F1 no hay preview renderizado de PPT —montarlo exigiría el worker de
 * conversión que se decidió evitar— así que lo único que hay es el texto
 * extraído. `analizar` lo devuelve a su forma de láminas; aquí se pintan.
 *
 * En una columna y no en rejilla: las láminas de una presentación no miden
 * lo mismo ni de lejos. En la de deterioro del ISSSTE, la tercera trae seis
 * indicadores comparados y la sexta trae dos frases. Puestas en dos
 * columnas, cada fila crece hasta la más alta y quedan huecos del tamaño de
 * una tarjeta. En columna el número de lámina va en el margen y todos los
 * títulos arrancan en la misma vertical, que es lo que permite recorrer la
 * presentación con la vista.
 */

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
        <p className="text-tinta-suave">
          Esta presentación no dejó texto que mostrar: sus láminas son imágenes. Puedes
          descargarla.
        </p>
      </div>
    )
  }

  const sinTexto = todas.filter(estaVacia).length

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-linea pb-3 text-sm text-tinta-suave">
        <span className="inline-flex items-center gap-1.5 font-medium text-tinta">
          <Presentation size={15} strokeWidth={1.8} aria-hidden />
          {todas.length} lámina{todas.length === 1 ? '' : 's'}
        </span>
        {sinTexto > 0 && (
          <>
            <span aria-hidden>·</span>
            <span>
              {sinTexto} {sinTexto === 1 ? 'es imagen' : 'son imágenes'} y no{' '}
              {sinTexto === 1 ? 'dejó' : 'dejaron'} texto
            </span>
          </>
        )}
        <span aria-hidden>·</span>
        <span>descárgalo para verlas como láminas</span>
      </div>

      <ol className="space-y-3">
        {porTramos(todas).map((tramo) =>
          'vacias' in tramo ? (
            <li key={`v${tramo.vacias[0]}`}>
              <SoloImagenes numeros={tramo.vacias} />
            </li>
          ) : (
            <li key={tramo.numero}>
              <Tarjeta lamina={tramo} />
            </li>
          ),
        )}
      </ol>
    </div>
  )
}

function Tarjeta({ lamina }: { lamina: Lamina }) {
  return (
    <article className="rounded-lg border border-linea bg-white px-4 py-4 sm:grid sm:grid-cols-[2.75rem_1fr] sm:px-5">
      {/* El número vive en el margen, como la foliación de un expediente:
          hace falta para citar la lámina, no para leerla. */}
      <span
        aria-hidden
        className="mb-1 block font-mono text-xs tabular-nums text-niebla sm:mb-0 sm:pt-1"
      >
        {String(lamina.numero).padStart(2, '0')}
      </span>

      <div>
        {lamina.titulo && (
          <h4 className="titular font-serif text-xl leading-snug">
            <span className="sr-only">Lámina {lamina.numero}: </span>
            {lamina.titulo}
          </h4>
        )}

        {lamina.cuerpo.length > 0 && (
          <div className={`space-y-2.5 ${lamina.titulo ? 'mt-2.5' : ''}`}>
            {lamina.cuerpo.map((t, i) =>
              t.clase === 'rotulo' ? (
                <p key={i} className="text-xs font-medium tracking-wide text-niebla">
                  {t.valor}
                </p>
              ) : t.clase === 'texto' ? (
                <p key={i} className="leading-relaxed text-tinta-suave">
                  {t.valor}
                </p>
              ) : (
                // Las cifras que iban seguidas, en una fila. Lo que en el
                // volcado eran veinte renglones aquí es un solo objeto.
                <div key={i} className="flex flex-wrap items-center gap-1.5">
                  {t.valores.map((v, j) =>
                    v.clase === 'serie' ? (
                      <Escala key={j} valores={v.valores} />
                    ) : esMarca(v) ? (
                      <span key={j} className="font-mono text-xs tabular-nums text-niebla">
                        {v.valor}
                      </span>
                    ) : (
                      <Cifra key={j} dato={v} />
                    ),
                  )}
                </div>
              ),
            )}
          </div>
        )}

        {lamina.fuentes.length > 0 && (
          <footer className="mt-3 border-t border-linea/70 pt-2">
            {lamina.fuentes.map((f, i) => (
              <p key={i} className="text-xs text-niebla">
                {f}
              </p>
            ))}
          </footer>
        )}
      </div>
    </article>
  )
}

/**
 * Una cifra con lo que la acompañaba. El color solo entra cuando el
 * porcentaje trae signo, porque entonces dice algo —cayó, subió— y el signo
 * ya lo dice también en texto: el color refuerza, no informa por su cuenta.
 */
function Cifra({ dato }: { dato: Dato }) {
  const tono =
    dato.cambio === 'baja'
      ? 'border-carmin/25 bg-carmin/5 text-carmin'
      : dato.cambio === 'sube'
        ? 'border-jade/25 bg-jade/5 text-jade'
        : 'border-linea bg-papel text-tinta'

  return (
    <span className={`inline-flex items-baseline gap-1.5 rounded-md border px-2 py-1 ${tono}`}>
      {dato.etiqueta && <span className="text-xs text-tinta-suave">{dato.etiqueta}</span>}
      <span className="font-medium tabular-nums">{dato.valor}</span>
      {dato.unidad && <span className="text-xs text-tinta-suave">{dato.unidad}</span>}
    </span>
  )
}

/**
 * La escala de una gráfica, recogida. Se abre porque en este acervo nada se
 * tira: lo que el archivo dice sigue estando, solo deja de competir con el
 * dato. Sin `<details>` habría que elegir entre estorbar y esconder.
 */
function Escala({ valores }: { valores: string[] }) {
  return (
    <details className="group inline-block">
      <summary className="inline-flex cursor-pointer list-none items-baseline gap-1.5 rounded-md border border-dashed border-linea px-2 py-1 text-tinta-suave hover:border-niebla">
        <span className="tabular-nums">
          {valores[0]} … {valores[valores.length - 1]}
        </span>
        <span className="text-xs">
          {valores.length} cifras seguidas
        </span>
      </summary>
      <span className="mt-1.5 flex flex-wrap gap-1.5">
        {valores.map((v, i) => (
          <span
            key={i}
            className="rounded border border-linea bg-papel px-1.5 py-0.5 text-xs tabular-nums text-tinta-suave"
          >
            {v}
          </span>
        ))}
      </span>
    </details>
  )
}

function SoloImagenes({ numeros }: { numeros: number[] }) {
  const seguidas = numeros[numeros.length - 1] - numeros[0] + 1 === numeros.length
  const cuales =
    numeros.length === 1
      ? `Lámina ${numeros[0]}`
      : seguidas
        ? `Láminas ${numeros[0]} a ${numeros[numeros.length - 1]}`
        : `Láminas ${numeros.join(', ')}`

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-dashed border-linea px-4 py-3 sm:px-5">
      <Images size={16} strokeWidth={1.6} aria-hidden className="shrink-0 text-niebla" />
      <p className="text-sm text-tinta-suave">
        <span className="text-tinta">{cuales}</span> · {numeros.length === 1 ? 'es una imagen' : 'son imágenes'} y no{' '}
        {numeros.length === 1 ? 'dejó' : 'dejaron'} texto que mostrar
      </p>
    </div>
  )
}

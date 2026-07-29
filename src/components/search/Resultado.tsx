import Link from 'next/link'
import { trozosResaltados, type Resultado as Fila } from '@/lib/busqueda'

/**
 * Una fila de resultados.
 *
 * El fragmento con el término resaltado es un criterio de aceptación, no un
 * adorno: quien busca "quirófanos" necesita ver *dónde* aparece para saber
 * si ese es el documento, y una lista de títulos lo obliga a abrir cuatro
 * archivos para averiguarlo.
 */
export function Resultado({
  fila,
  conConsulta,
}: {
  fila: Fila
  /** Si no hay término buscado, no hay nada a lo que "caer": es el resumen y ya. */
  conConsulta: boolean
}) {
  return (
    <article className="border-b border-linea py-4 first:pt-0 last:border-0">
      <div className="flex items-baseline gap-2">
        <h3 className="min-w-0 flex-1 text-[0.95rem] leading-snug font-medium">
          <Link
            href={`/doc/${fila.id}`}
            className="underline-offset-2 hover:underline"
          >
            {fila.title}
          </Link>
        </h3>
        {fila.status !== 'publicado' && <Distintivo estatus={fila.status} />}
      </div>

      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-tinta-suave">
        <span>{fila.doc_type}</span>
        <Punto />
        <span>
          {fila.primary_topic_parent
            ? `${fila.primary_topic_parent} › ${fila.primary_topic}`
            : fila.primary_topic}
        </span>
        {fila.year && (
          <>
            <Punto />
            <span>{fila.year}</span>
          </>
        )}
        {fila.area && (
          <>
            <Punto />
            <span>{fila.area}</span>
          </>
        )}
        {fila.version_no && fila.version_no > 1 && (
          <>
            <Punto />
            <span>versión {fila.version_no}</span>
          </>
        )}
      </p>

      {fila.fragmento && (
        <p className="mt-2 text-sm leading-relaxed text-tinta-suave">
          {conConsulta && fila.fragmento_es_resumen && (
            <span className="mr-1.5 text-xs text-tinta-suave opacity-70">
              Del resumen:
            </span>
          )}
          {trozosResaltados(fila.fragmento).map((t, i) =>
            t.marcado ? (
              <mark key={i} className="rounded-sm bg-acento-suave px-0.5 text-tinta">
                {t.texto}
              </mark>
            ) : (
              <span key={i}>{t.texto}</span>
            ),
          )}
        </p>
      )}

      {fila.owner_name && (
        <p className="mt-1.5 text-xs text-tinta-suave">
          Responsable: {fila.owner_name}
        </p>
      )}
    </article>
  )
}

const Punto = () => <span aria-hidden>·</span>

function Distintivo({ estatus }: { estatus: string }) {
  const estilo =
    estatus === 'archivado'
      ? 'border-amber-300 bg-amber-50 text-amber-900'
      : 'border-linea bg-papel text-tinta-suave'

  return (
    <span
      className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] tracking-wide uppercase ${estilo}`}
    >
      {estatus === 'archivado' ? 'Archivado' : 'Borrador'}
    </span>
  )
}

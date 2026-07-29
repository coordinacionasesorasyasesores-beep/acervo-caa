import Link from 'next/link'
import type { Topic } from '@/lib/catalogos'
import { alternar, urlCon, type Filtros } from '@/lib/busqueda'

/**
 * El árbol de dos niveles de la barra lateral.
 *
 * Los temas sin documentos se enseñan apagados en lugar de esconderse: el
 * catálogo es la estructura del acervo, y que un tema esté vacío es
 * información —dice dónde falta cargar— no ruido que convenga ocultar.
 * Además, un árbol que cambia de forma según lo que hay dentro no se puede
 * aprender de memoria, y esta gente lo va a ver todos los días.
 */
export function ArbolDeTemas({
  topics,
  conteos,
  filtros,
}: {
  topics: Topic[]
  conteos: Map<number, number>
  filtros: Filtros
}) {
  const raiz = topics
    .filter((t) => t.parent_id === null)
    .sort((a, b) => a.position - b.position)

  return (
    <nav aria-label="Temas">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xs font-semibold tracking-wide text-tinta-suave uppercase">
          Temas
        </h2>
        {filtros.temas.length > 0 && (
          <Link
            href={urlCon(filtros, { temas: [], pagina: 1 })}
            className="text-xs text-acento underline-offset-2 hover:underline"
          >
            Ver todos
          </Link>
        )}
      </div>

      <ul className="space-y-2.5 text-sm">
        {raiz.map((padre) => {
          const hijos = topics
            .filter((h) => h.parent_id === padre.id)
            .sort((a, b) => a.position - b.position)

          return (
            <li key={padre.id}>
              <Rama tema={padre} conteos={conteos} filtros={filtros} nivel="padre" />
              {hijos.length > 0 && (
                <ul className="mt-0.5 space-y-0.5 border-l border-linea pl-3">
                  {hijos.map((h) => (
                    <li key={h.id}>
                      <Rama tema={h} conteos={conteos} filtros={filtros} nivel="hijo" />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function Rama({
  tema,
  conteos,
  filtros,
  nivel,
}: {
  tema: Topic
  conteos: Map<number, number>
  filtros: Filtros
  nivel: 'padre' | 'hijo'
}) {
  const activo = filtros.temas.includes(tema.id)
  const cuantos = conteos.get(tema.id) ?? 0

  return (
    <Link
      href={urlCon(filtros, { temas: alternar(filtros.temas, tema.id), pagina: 1 })}
      aria-current={activo ? 'true' : undefined}
      className={`group flex items-baseline justify-between gap-2 rounded px-1.5 py-0.5 -mx-1.5 transition-colors hover:bg-papel ${
        activo ? 'bg-acento-suave text-acento' : cuantos === 0 ? 'text-tinta-suave' : ''
      } ${nivel === 'padre' ? 'font-medium' : ''}`}
    >
      <span className={cuantos === 0 && !activo ? 'opacity-60' : ''}>{tema.name}</span>
      {cuantos > 0 && (
        <span className="shrink-0 text-xs tabular-nums text-tinta-suave">{cuantos}</span>
      )}
    </Link>
  )
}

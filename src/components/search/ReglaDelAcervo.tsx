import Link from 'next/link'
import { urlCon, type Filtros } from '@/lib/busqueda'

/**
 * La regla del acervo: los años que cubre, dibujados.
 *
 * Es la firma de la portada y no es un adorno — es el dato más
 * característico de este archivo. Lo que la CAA guarda son series
 * históricas: el concentrado va de 1960 a 2030, y la pregunta que la gente
 * trae encima suele ser de un año concreto ("¿cuántas camas había en
 * 1994?"). Así que debajo del buscador va una regla con una marca por año,
 * más alta donde hay más documentos, y cada marca es un filtro.
 *
 * Dice tres cosas de un vistazo que ninguna lista diría: desde cuándo hay
 * acervo, dónde está la densidad, y dónde están los huecos. Un archivo
 * enseñando su propia forma.
 */
export function ReglaDelAcervo({
  anios,
  filtros,
}: {
  anios: { anio: number; cuantos: number }[]
  filtros: Filtros
}) {
  if (anios.length === 0) return null

  const orden = [...anios].sort((a, b) => a.anio - b.anio)
  const min = orden[0].anio
  const max = orden[orden.length - 1].anio
  const span = Math.max(max - min, 1)
  const tope = Math.max(...orden.map((a) => a.cuantos))

  return (
    <div className="mt-8">
      {/* Sin rótulo, la regla es un adorno bonito: nadie adivina que las
          marcas son años ni que se puede hacer clic. Una línea de seis
          palabras la convierte en un control. */}
      <p className="mb-2 text-center text-xs tracking-wide text-niebla/80">
        Años que cubre el acervo · toca un año para verlo
      </p>
      <div className="relative h-14">
        {/* La línea base: donde no hay marca, hubo un año sin nada. Que se
            vea el hueco es parte de lo que la regla informa. */}
        <div className="absolute right-0 bottom-4 left-0 h-px bg-jade/70" />

        {orden.map(({ anio, cuantos }) => {
          const x = orden.length === 1 ? 50 : ((anio - min) / span) * 100
          const alto = 7 + Math.round((cuantos / tope) * 29)

          return (
            <Link
              key={anio}
              href={urlCon(filtros, { anios: [anio], pagina: 1 })}
              title={`${anio} · ${cuantos} documento${cuantos === 1 ? '' : 's'}`}
              aria-label={`Ver los ${cuantos} documentos de ${anio}`}
              className="group absolute bottom-4 flex -translate-x-1/2 flex-col items-center justify-end"
              style={{ left: `${x}%`, height: `${alto + 4}px` }}
            >
              <span
                className="w-[3px] rounded-full bg-oro transition-all group-hover:w-[5px] group-hover:bg-oro-claro"
                style={{ height: `${alto}px` }}
              />
              <span className="absolute -bottom-4 text-[11px] tabular-nums text-niebla opacity-0 transition-opacity group-hover:opacity-100">
                {anio}
              </span>
            </Link>
          )
        })}

        {/* Los extremos rotulados: sin ellos la regla es una decoración. */}
        <span className="absolute bottom-0 left-0 text-[11px] tabular-nums text-niebla">
          {min}
        </span>
        {max !== min && (
          <span className="absolute right-0 bottom-0 text-[11px] tabular-nums text-niebla">
            {max}
          </span>
        )}
      </div>
    </div>
  )
}

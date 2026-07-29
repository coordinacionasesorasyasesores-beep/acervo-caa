import Link from 'next/link'
import { alternar, urlCon, type Faceta, type Filtros } from '@/lib/busqueda'

/**
 * Las facetas se acumulan: dentro de una dimensión suman (año 2025 **o**
 * 2026), y entre dimensiones restringen (año 2026 **y** tipo informe).
 * Es lo que la gente espera aunque nadie lo diga en voz alta.
 *
 * Los conteos vienen calculados sin el filtro de su propia dimensión, así
 * que al elegir "2026" los demás años siguen a la vista con su número:
 * se puede cambiar de opinión sin tener que limpiar primero.
 */

const NOMBRES: Record<Faceta['dimension'], string> = {
  year: 'Año',
  type: 'Tipo documental',
  use: 'Uso',
  area: 'Área',
  status: 'Estatus',
}

const ORDEN: Faceta['dimension'][] = ['year', 'type', 'use', 'area', 'status']

/** Un estatus en crudo no le dice nada a nadie fuera de la base. */
const ESTATUS: Record<string, string> = {
  publicado: 'Vigente',
  archivado: 'Archivado',
  borrador: 'Borrador',
}

export function Facetas({
  facetas,
  filtros,
}: {
  facetas: Faceta[]
  filtros: Filtros
}) {
  const porDimension = ORDEN.map((d) => ({
    dimension: d,
    valores: facetas.filter((f) => f.dimension === d),
  })).filter((g) => g.valores.length > 0)

  if (porDimension.length === 0) return null

  return (
    <div className="space-y-5">
      {porDimension.map(({ dimension, valores }) => (
        <div key={dimension}>
          <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-tinta-suave uppercase">
            {NOMBRES[dimension]}
          </h3>
          <ul className="space-y-0.5 text-sm">
            {valores.map((f) => (
              <li key={f.valor}>
                <Opcion faceta={f} filtros={filtros} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function Opcion({ faceta, filtros }: { faceta: Faceta; filtros: Filtros }) {
  const { activo, destino } = calcular(faceta, filtros)

  const etiqueta =
    faceta.dimension === 'status'
      ? (ESTATUS[faceta.valor] ?? faceta.etiqueta)
      : faceta.etiqueta

  return (
    <Link
      href={destino}
      className={`flex items-baseline justify-between gap-2 rounded px-1.5 py-0.5 -mx-1.5 transition-colors hover:bg-papel ${
        activo ? 'bg-acento-suave font-medium text-acento' : ''
      }`}
    >
      <span className="flex items-baseline gap-1.5">
        <span
          aria-hidden
          className={`inline-block h-3 w-3 shrink-0 translate-y-0.5 rounded-sm border ${
            activo ? 'border-acento bg-acento' : 'border-linea bg-white'
          }`}
        />
        {etiqueta}
      </span>
      <span className="shrink-0 text-xs tabular-nums text-tinta-suave">
        {faceta.cuantos}
      </span>
    </Link>
  )
}

function calcular(faceta: Faceta, filtros: Filtros) {
  switch (faceta.dimension) {
    case 'year': {
      const n = Number(faceta.valor)
      return {
        activo: filtros.anios.includes(n),
        destino: urlCon(filtros, { anios: alternar(filtros.anios, n), pagina: 1 }),
      }
    }
    case 'type': {
      const n = Number(faceta.valor)
      return {
        activo: filtros.tipos.includes(n),
        destino: urlCon(filtros, { tipos: alternar(filtros.tipos, n), pagina: 1 }),
      }
    }
    case 'use': {
      const n = Number(faceta.valor)
      return {
        activo: filtros.usos.includes(n),
        destino: urlCon(filtros, { usos: alternar(filtros.usos, n), pagina: 1 }),
      }
    }
    case 'area':
      return {
        activo: filtros.areas.includes(faceta.valor),
        destino: urlCon(filtros, {
          areas: alternar(filtros.areas, faceta.valor),
          pagina: 1,
        }),
      }
    case 'status':
      return {
        activo: filtros.estatus.includes(faceta.valor),
        destino: urlCon(filtros, {
          estatus: alternar(filtros.estatus, faceta.valor),
          pagina: 1,
        }),
      }
  }
}

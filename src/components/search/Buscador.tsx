'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { urlCon, type Filtros } from '@/lib/busqueda'

/**
 * La caja de búsqueda. Es el único trozo de la consulta que necesita ser
 * cliente: todo lo demás son enlaces que el servidor ya sabe pintar.
 *
 * No busca mientras se escribe. Con búsqueda por servidor, cada tecla
 * sería un viaje de ida y vuelta, y los resultados brincarían debajo del
 * cursor mientras la persona todavía está formulando lo que quiere. Se
 * busca al Enter, que además es lo que la gente ya hace.
 */
export function Buscador({ filtros }: { filtros: Filtros }) {
  const router = useRouter()
  const [texto, setTexto] = useState(filtros.q)

  // Al llegar por el botón de atrás, la caja tiene que reflejar la URL.
  useEffect(() => setTexto(filtros.q), [filtros.q])

  function buscar(valor: string) {
    router.push(urlCon(filtros, { q: valor.trim(), pagina: 1 }))
  }

  return (
    <div className="relative">
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') buscar(texto)
          if (e.key === 'Escape' && texto) {
            setTexto('')
            buscar('')
          }
        }}
        placeholder="Buscar por título, resumen, etiquetas o contenido…"
        aria-label="Buscar en el acervo"
        className="w-full rounded-lg border border-linea bg-white py-2.5 pr-24 pl-3.5 text-sm outline-none focus:border-acento focus:ring-2 focus:ring-acento-suave"
      />

      <div className="absolute inset-y-0 right-2 flex items-center gap-1">
        {texto && (
          <button
            onClick={() => {
              setTexto('')
              buscar('')
            }}
            className="px-1.5 text-tinta-suave transition-colors hover:text-tinta"
            aria-label="Limpiar la búsqueda"
          >
            ×
          </button>
        )}
        <button
          onClick={() => buscar(texto)}
          className="rounded bg-acento px-3 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          Buscar
        </button>
      </div>
    </div>
  )
}

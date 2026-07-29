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
 *
 * Dos tamaños: el de la portada, que es el protagonista, y el de la barra
 * superior, que acompaña. Mismo componente porque es el mismo objeto —
 * cambia el tono de voz, no lo que hace.
 */
export function Buscador({
  filtros,
  tamano = 'barra',
}: {
  filtros: Filtros
  tamano?: 'portada' | 'barra'
}) {
  const router = useRouter()
  const [texto, setTexto] = useState(filtros.q)

  // Al llegar por el botón de atrás, la caja tiene que reflejar la URL.
  useEffect(() => setTexto(filtros.q), [filtros.q])

  function buscar(valor: string) {
    router.push(urlCon(filtros, { q: valor.trim(), pagina: 1 }))
  }

  const esPortada = tamano === 'portada'

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
        placeholder={
          esPortada ? 'Buscar en el acervo' : 'Buscar por título, resumen o contenido…'
        }
        aria-label="Buscar en el acervo"
        autoFocus={esPortada}
        className={
          esPortada
            ? 'w-full rounded-full border border-transparent bg-papel py-4 pr-32 pl-6 text-base text-tinta shadow-[0_2px_30px_-8px_rgba(0,0,0,0.5)] outline-none transition-shadow placeholder:text-tinta-suave focus:shadow-[0_2px_40px_-6px_rgba(173,132,44,0.45)]'
            : 'w-full rounded-full border border-linea bg-white py-2 pr-24 pl-4 text-sm outline-none focus:border-acento focus:ring-2 focus:ring-acento-suave'
        }
      />

      <div
        className={`absolute inset-y-0 flex items-center gap-1 ${
          esPortada ? 'right-2.5' : 'right-1.5'
        }`}
      >
        {texto && (
          <button
            onClick={() => {
              setTexto('')
              buscar('')
            }}
            className="px-2 text-tinta-suave transition-colors hover:text-tinta"
            aria-label="Limpiar la búsqueda"
          >
            ×
          </button>
        )}
        <button
          onClick={() => buscar(texto)}
          className={
            esPortada
              ? 'rounded-full bg-acento px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90'
              : 'rounded-full bg-acento px-3 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90'
          }
        >
          Buscar
        </button>
      </div>
    </div>
  )
}

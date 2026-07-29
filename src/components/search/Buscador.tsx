'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
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
  const [enfocado, setEnfocado] = useState(false)
  const campo = useRef<HTMLInputElement>(null)

  // Al llegar por el botón de atrás, la caja tiene que reflejar la URL.
  useEffect(() => setTexto(filtros.q), [filtros.q])

  // Barra diagonal para saltar al buscador desde cualquier parte de la
  // pantalla de resultados, como en cualquier herramienta que se usa a
  // diario. No se activa si ya se está escribiendo en otro campo.
  useEffect(() => {
    function alTeclear(e: KeyboardEvent) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const activo = document.activeElement
      const escribiendo =
        activo instanceof HTMLInputElement ||
        activo instanceof HTMLTextAreaElement ||
        activo instanceof HTMLSelectElement
      if (escribiendo) return
      e.preventDefault()
      campo.current?.focus()
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [])

  function buscar(valor: string) {
    router.push(urlCon(filtros, { q: valor.trim(), pagina: 1 }))
  }

  const esPortada = tamano === 'portada'

  const campoComun =
    'w-full outline-none placeholder:text-tinta-suave/70 text-tinta'

  return (
    <div className="relative">
      {/* El halo de foco vive detrás del campo, no en su borde: un anillo
          duro sobre verde profundo se ve pegado; un halo suave se ve
          encendido. */}
      {esPortada && (
        <div
          aria-hidden
          className={`pointer-events-none absolute -inset-2 rounded-full bg-oro/20 blur-xl transition-opacity duration-300 ${
            enfocado ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}

      <div className="relative">
        <input
          ref={campo}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onFocus={() => setEnfocado(true)}
          onBlur={() => setEnfocado(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') buscar(texto)
            if (e.key === 'Escape') {
              if (texto) {
                setTexto('')
                buscar('')
              } else {
                campo.current?.blur()
              }
            }
          }}
          placeholder={
            esPortada ? 'Buscar en el acervo' : 'Buscar por título, resumen o contenido…'
          }
          aria-label="Buscar en el acervo"
          autoFocus={esPortada}
          className={
            esPortada
              ? `${campoComun} rounded-2xl border border-white/10 bg-papel py-5 pr-32 pl-6 text-base shadow-[0_18px_50px_-20px_rgba(0,0,0,0.75)] sm:text-lg`
              : `${campoComun} rounded-full border border-linea bg-white py-2 pr-24 pl-4 text-sm focus:border-acento focus:ring-2 focus:ring-acento-suave`
          }
        />

        <div
          className={`absolute inset-y-0 flex items-center gap-1 ${
            esPortada ? 'right-3' : 'right-1.5'
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
                ? 'rounded-xl bg-acento px-5 py-2.5 text-sm font-medium text-white transition-transform hover:scale-[1.02] active:scale-[0.98]'
                : 'rounded-full bg-acento px-3 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90'
            }
          >
            Buscar
          </button>
        </div>
      </div>
    </div>
  )
}

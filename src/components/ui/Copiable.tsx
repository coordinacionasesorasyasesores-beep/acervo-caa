'use client'

import { useState } from 'react'

/**
 * El enlace permanente, listo para pegar en un oficio.
 *
 * Es la promesa central del sistema —una URL que no cambia aunque el
 * archivo pase por catorce versiones— así que tiene que estar a un clic de
 * distancia y no escondida en la barra del navegador, que además trae los
 * parámetros de la búsqueda que te trajo hasta aquí.
 */
export function Copiable({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sin permiso de portapapeles queda seleccionar a mano; el campo es
      // de solo lectura pero seleccionable justo para eso.
    }
  }

  return (
    <div className="flex items-stretch gap-1.5">
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        aria-label="Enlace permanente"
        className="min-w-0 flex-1 rounded border border-linea bg-papel px-2 py-1 font-mono text-xs text-tinta-suave outline-none focus:border-acento"
      />
      <button
        onClick={copiar}
        className="shrink-0 rounded border border-linea bg-white px-2.5 text-xs transition-colors hover:bg-papel"
      >
        {copiado ? '✓ Copiado' : 'Copiar'}
      </button>
    </div>
  )
}

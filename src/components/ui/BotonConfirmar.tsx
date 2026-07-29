'use client'

import { useState } from 'react'

/**
 * Un botón que pide confirmación en el sitio, sin diálogo del navegador.
 *
 * Los `confirm()` nativos bloquean la pestaña, no se pueden redactar en el
 * tono del resto de la aplicación y en algunos navegadores se pueden
 * silenciar. Aquí la confirmación es parte de la interfaz: el botón se
 * convierte en la pregunta.
 *
 * Va en las acciones que no tienen deshacer. Archivar no lleva —es
 * reversible de un clic— pero quitar un correo de la lista de acceso o
 * deshacer una curaduría de veintitrés columnas, sí.
 */
export function BotonConfirmar({
  children,
  pregunta,
  confirmar = 'Sí, quitar',
  enviando,
  className = '',
}: {
  children: React.ReactNode
  pregunta: string
  confirmar?: string
  enviando?: boolean
  className?: string
}) {
  const [preguntando, setPreguntando] = useState(false)

  if (!preguntando) {
    return (
      <button
        type="button"
        onClick={() => setPreguntando(true)}
        className={className}
      >
        {children}
      </button>
    )
  }

  return (
    <span className="flex items-center gap-2 text-xs">
      <span className="text-tinta-suave">{pregunta}</span>
      <button
        type="submit"
        disabled={enviando}
        className="rounded border border-red-300 bg-red-50 px-2 py-0.5 text-red-800 transition-colors hover:bg-red-100 disabled:opacity-50"
      >
        {enviando ? '…' : confirmar}
      </button>
      <button
        type="button"
        onClick={() => setPreguntando(false)}
        className="text-tinta-suave hover:text-tinta"
      >
        Cancelar
      </button>
    </span>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Resultado = { id: string; title: string; year: number | null }

/** Para elegir de qué documento es esta versión. */
export function BuscadorDocumentos({
  seleccionado,
  onSeleccionar,
}: {
  seleccionado: { id: string; title: string } | null
  onSeleccionar: (d: { id: string; title: string } | null) => void
}) {
  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState<Resultado[]>([])
  const [buscando, setBuscando] = useState(false)

  useEffect(() => {
    if (seleccionado || texto.trim().length < 2) {
      setResultados([])
      return
    }

    // Medio segundo de espera: sin esto se dispara una consulta por
    // cada tecla y la lista parpadea con resultados viejos.
    const t = setTimeout(async () => {
      setBuscando(true)
      const { data } = await createClient()
        .from('documents')
        .select('id, title, year')
        .ilike('title', `%${texto.trim()}%`)
        .neq('status', 'archivado')
        .order('updated_at', { ascending: false })
        .limit(8)
      setResultados(data ?? [])
      setBuscando(false)
    }, 500)

    return () => clearTimeout(t)
  }, [texto, seleccionado])

  if (seleccionado) {
    return (
      <div className="flex items-center gap-2 rounded border border-linea bg-papel px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-sm">{seleccionado.title}</span>
        <button
          type="button"
          onClick={() => {
            onSeleccionar(null)
            setTexto('')
          }}
          className="text-xs text-tinta-suave hover:text-tinta"
        >
          Cambiar
        </button>
      </div>
    )
  }

  return (
    <div>
      <label className="block">
        <span className="text-sm font-medium">¿De qué documento es esta versión?</span>
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Busca por título…"
          className="mt-1 w-full rounded border border-linea px-2.5 py-1.5 text-sm outline-none focus:border-acento focus:ring-2 focus:ring-acento-suave"
        />
      </label>

      {texto.trim().length >= 2 && (
        <div className="mt-1 overflow-hidden rounded border border-linea">
          {buscando && <p className="px-3 py-2 text-xs text-tinta-suave">Buscando…</p>}
          {!buscando && resultados.length === 0 && (
            <p className="px-3 py-2 text-xs text-tinta-suave">
              Ningún documento con ese título.
            </p>
          )}
          {resultados.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onSeleccionar({ id: r.id, title: r.title })}
              className="block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-papel"
            >
              {r.title}
              {r.year && <span className="ml-1.5 text-xs text-tinta-suave">{r.year}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

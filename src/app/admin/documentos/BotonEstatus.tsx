'use client'

import { useActionState } from 'react'
import { cambiarEstatus, type Resultado } from './acciones'

const inicial: Resultado = { error: null }

export function BotonEstatus({ id, estatus }: { id: string; estatus: string }) {
  const [estado, cambiar, enviando] = useActionState(cambiarEstatus, inicial)
  const archivado = estatus === 'archivado'

  // Un borrador no se archiva: todavía no ha salido a ningún lado. Lo
  // publica quien lo subió, desde su propia ficha.
  if (estatus === 'borrador') {
    return <span className="text-xs text-tinta-suave">Borrador de su autor</span>
  }

  return (
    <form action={cambiar} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={archivado ? 'publicado' : 'archivado'} />
      <button
        disabled={enviando}
        className={`rounded border px-2.5 py-1 text-xs transition-colors disabled:opacity-50 ${
          archivado
            ? 'border-linea bg-white hover:bg-papel'
            : 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
        }`}
      >
        {enviando ? '…' : archivado ? 'Devolver al acervo' : 'Archivar'}
      </button>
      {estado.error && <span className="text-xs text-red-700">{estado.error}</span>}
    </form>
  )
}

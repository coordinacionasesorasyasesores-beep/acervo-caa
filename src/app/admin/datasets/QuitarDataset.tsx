'use client'

import { useActionState } from 'react'
import { BotonConfirmar } from '@/components/ui/BotonConfirmar'
import { quitarDataset, type Resultado } from './acciones'

const inicial: Resultado = { error: null }

export function QuitarDataset({ id }: { id: string }) {
  const [estado, quitar, enviando] = useActionState(quitarDataset, inicial)

  return (
    <form action={quitar} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <BotonConfirmar
        pregunta="Se pierde la declaración de columnas."
        enviando={enviando}
        className="text-xs text-tinta-suave underline-offset-2 hover:text-red-700 hover:underline"
      >
        Quitar
      </BotonConfirmar>
      {estado.error && <span className="text-xs text-red-700">{estado.error}</span>}
    </form>
  )
}

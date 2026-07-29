'use client'

import { useRef, useState } from 'react'

const ACEPTADOS = '.pdf,.docx,.xlsx,.pptx'

export function Dropzone({ onArchivos }: { onArchivos: (archivos: File[]) => void }) {
  const [encima, setEncima] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  function recibir(lista: FileList | null) {
    if (!lista?.length) return
    onArchivos(Array.from(lista))
    if (input.current) input.current.value = ''
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setEncima(true)
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={(e) => {
        e.preventDefault()
        setEncima(false)
        recibir(e.dataTransfer.files)
      }}
      className={`rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
        encima ? 'border-acento bg-acento-suave' : 'border-linea bg-white'
      }`}
    >
      <p className="text-sm font-medium">Arrastra aquí los archivos</p>
      <p className="mt-1 text-xs text-tinta-suave">
        PDF, Word, Excel y PowerPoint · hasta 50 MB cada uno · varios a la vez
      </p>

      <button
        type="button"
        onClick={() => input.current?.click()}
        className="mt-4 rounded border border-linea bg-white px-3 py-1.5 text-sm transition-colors hover:bg-papel"
      >
        o elígelos del equipo
      </button>

      <input
        ref={input}
        type="file"
        multiple
        accept={ACEPTADOS}
        onChange={(e) => recibir(e.target.files)}
        className="sr-only"
      />
    </div>
  )
}

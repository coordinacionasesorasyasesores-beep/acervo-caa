'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { Check, Pencil, X } from 'lucide-react'
import { renombrar, type Resultado } from '@/app/doc/[id]/acciones'

const inicial: Resultado = { error: null }

/**
 * El título de la ficha, corregible en el sitio.
 *
 * Se edita donde se lee, no en otra pantalla: quien detecta que el título
 * está mal lo detecta leyéndolo, y en ese momento es cuando lo arregla.
 * Mandar a un formulario aparte convierte una corrección de diez segundos
 * en una tarea pendiente que nadie retoma.
 *
 * Quien no puede editar recibe el título y nada más: el lápiz no aparece
 * apagado ni pide permisos al hacer clic. Un botón que no va a funcionar
 * es peor que un botón ausente.
 */
export function TituloEditable({
  id,
  titulo,
  puedeEditar,
}: {
  id: string
  titulo: string
  puedeEditar: boolean
}) {
  const [editando, setEditando] = useState(false)
  const [estado, guardar, enviando] = useActionState(renombrar, inicial)
  const campo = useRef<HTMLTextAreaElement>(null)

  // El servidor confirma con el título ya normalizado; cerrar antes dejaría
  // en pantalla lo que se tecleó y no lo que quedó guardado.
  useEffect(() => {
    if (estado.titulo) setEditando(false)
  }, [estado.titulo])

  // Crece con el contenido: un título largo en un campo de una línea se
  // edita a ciegas, y son justo los largos los que hay que corregir.
  function ajustarAlto(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  // Depende también de `estado`: un guardado rechazado vuelve a montar el
  // campo con su alto de una línea, y el título quedaba cortado justo
  // cuando hay un error que leer y corregir.
  useEffect(() => {
    if (!editando) return
    const el = campo.current
    if (!el) return
    ajustarAlto(el)
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [editando, estado])

  // Lo guardado y lo tecleado son cosas distintas. El encabezado enseña
  // siempre lo que está en la base; el campo, lo último que se intentó, que
  // tras un error es lo que hay que corregir sin volver a escribirlo.
  const guardado = estado.titulo ?? titulo
  const enCampo = estado.intento || guardado

  if (!puedeEditar) {
    return (
      <h1 className="titular min-w-0 flex-1 font-serif text-[2rem] leading-tight">
        {guardado}
      </h1>
    )
  }

  if (!editando) {
    return (
      <div className="min-w-0 flex-1">
        <h1 className="titular font-serif text-[2rem] leading-tight">
          {guardado}
          {/* Dentro del h1 y no al lado: así el lápiz sigue al final del
              texto aunque el título ocupe tres renglones, en vez de quedar
              flotando en la primera línea lejos de donde termina. */}
          <button
            onClick={() => setEditando(true)}
            title="Cambiar el título"
            aria-label="Cambiar el título"
            className="ml-2 inline-flex translate-y-[-0.15em] items-center rounded p-1 align-middle text-tinta-suave transition-colors hover:bg-papel hover:text-acento"
          >
            <Pencil size={17} strokeWidth={1.8} aria-hidden />
          </button>
        </h1>
        {estado.error && (
          <p className="mt-1 text-xs text-carmin">{estado.error}</p>
        )}
      </div>
    )
  }

  return (
    <form action={guardar} className="min-w-0 flex-1">
      <input type="hidden" name="id" value={id} />
      <textarea
        ref={campo}
        name="titulo"
        defaultValue={enCampo}
        rows={1}
        maxLength={300}
        disabled={enviando}
        onInput={(e) => ajustarAlto(e.currentTarget)}
        onKeyDown={(e) => {
          // Enter guarda: es un título, no un párrafo, y el salto de línea
          // no significa nada aquí. Escape se va sin tocar nada.
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            e.currentTarget.form?.requestSubmit()
          }
          if (e.key === 'Escape') setEditando(false)
        }}
        className="titular w-full resize-none overflow-hidden rounded border border-acento bg-white px-2 py-1 font-serif text-[2rem] leading-tight outline-none disabled:opacity-60"
      />

      <div className="mt-2 flex items-center gap-2">
        <button
          type="submit"
          disabled={enviando}
          className="inline-flex items-center gap-1.5 rounded-lg bg-acento px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Check size={15} strokeWidth={2} aria-hidden />
          {enviando ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          type="button"
          onClick={() => setEditando(false)}
          disabled={enviando}
          className="inline-flex items-center gap-1.5 rounded-lg border border-linea bg-white px-3 py-1.5 text-sm transition-colors hover:bg-papel disabled:opacity-50"
        >
          <X size={15} strokeWidth={2} aria-hidden />
          Cancelar
        </button>
        <span className="text-xs text-tinta-suave">
          Enter guarda · Esc cancela
        </span>
      </div>

      {estado.error && <p className="mt-1.5 text-xs text-carmin">{estado.error}</p>}
    </form>
  )
}

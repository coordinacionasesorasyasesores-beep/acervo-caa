'use client'

import { useActionState, useState } from 'react'
import type { Topic } from '@/lib/catalogos'
import { crearTema, moverTema, renombrarTema, type Resultado } from './acciones'

const inicial: Resultado = { error: null }

export function PanelTemas({
  topics,
  conteos,
}: {
  topics: Topic[]
  conteos: [number, number][]
}) {
  const cuantos = new Map(conteos)
  const raiz = topics
    .filter((t) => t.parent_id === null)
    .sort((a, b) => a.position - b.position)

  return (
    <div className="space-y-6">
      <NuevoTema padres={raiz} />

      <ul className="divide-y divide-linea rounded-lg border border-linea bg-white">
        {raiz.map((padre) => (
          <li key={padre.id} className="px-4 py-3">
            <Fila tema={padre} cuantos={cuantos.get(padre.id) ?? 0} esPadre />
            <ul className="mt-1 ml-4 space-y-1 border-l border-linea pl-3">
              {topics
                .filter((h) => h.parent_id === padre.id)
                .sort((a, b) => a.position - b.position)
                .map((hijo) => (
                  <li key={hijo.id}>
                    <Fila tema={hijo} cuantos={cuantos.get(hijo.id) ?? 0} />
                  </li>
                ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Fila({
  tema,
  cuantos,
  esPadre,
}: {
  tema: Topic
  cuantos: number
  esPadre?: boolean
}) {
  const [editando, setEditando] = useState(false)
  const [estadoNombre, renombrar, renombrando] = useActionState(renombrarTema, inicial)
  const [estadoMover, mover] = useActionState(moverTema, inicial)

  return (
    <div className="flex items-center gap-2">
      {editando ? (
        <form
          action={async (datos) => {
            await renombrar(datos)
            setEditando(false)
          }}
          className="flex flex-1 items-center gap-1.5"
        >
          <input type="hidden" name="id" value={tema.id} />
          <input
            name="name"
            defaultValue={tema.name}
            autoFocus
            className="min-w-0 flex-1 rounded border border-linea px-2 py-1 text-sm outline-none focus:border-acento"
          />
          <button
            type="submit"
            disabled={renombrando}
            className="rounded bg-acento px-2.5 py-1 text-xs text-white disabled:opacity-50"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={() => setEditando(false)}
            className="px-1.5 text-xs text-tinta-suave hover:text-tinta"
          >
            Cancelar
          </button>
        </form>
      ) : (
        <>
          <span className={`flex-1 text-sm ${esPadre ? 'font-medium' : ''}`}>
            {tema.name}
            <span className="ml-2 font-mono text-xs text-tinta-suave">{tema.slug}</span>
          </span>

          <span className="text-xs text-tinta-suave tabular-nums">
            {cuantos > 0 ? `${cuantos} doc.` : '—'}
          </span>

          {/* Un formulario por botón, con el delta en un campo oculto.
              Con los dos botones en el mismo formulario y `name`/`value`
              propios, React no propaga el valor del botón que envía: la
              acción recibe el delta vacío y no mueve nada. */}
          <div className="flex">
            <form action={mover}>
              <input type="hidden" name="id" value={tema.id} />
              <input type="hidden" name="delta" value="-1" />
              <button
                className="px-1 text-xs text-tinta-suave hover:text-tinta"
                aria-label={`Subir ${tema.name}`}
              >
                ↑
              </button>
            </form>
            <form action={mover}>
              <input type="hidden" name="id" value={tema.id} />
              <input type="hidden" name="delta" value="1" />
              <button
                className="px-1 text-xs text-tinta-suave hover:text-tinta"
                aria-label={`Bajar ${tema.name}`}
              >
                ↓
              </button>
            </form>
          </div>

          <button
            onClick={() => setEditando(true)}
            className="text-xs text-acento underline-offset-2 hover:underline"
          >
            Renombrar
          </button>
        </>
      )}

      {(estadoNombre.error || estadoMover.error) && (
        <span className="text-xs text-carmin">
          {estadoNombre.error ?? estadoMover.error}
        </span>
      )}
    </div>
  )
}

function NuevoTema({ padres }: { padres: Topic[] }) {
  const [estado, crear, creando] = useActionState(crearTema, inicial)
  const [abierto, setAbierto] = useState(false)

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="rounded border border-linea bg-white px-3 py-1.5 text-sm transition-colors hover:bg-papel"
      >
        Agregar un tema
      </button>
    )
  }

  return (
    <form
      action={async (datos) => {
        await crear(datos)
        setAbierto(false)
      }}
      className="rounded-lg border border-linea bg-white p-4"
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-48 flex-1">
          <span className="text-sm font-medium">Nombre</span>
          <input
            name="name"
            required
            autoFocus
            placeholder="Medicamentos e insumos"
            className="mt-1 w-full rounded border border-linea px-2.5 py-1.5 text-sm outline-none focus:border-acento"
          />
        </label>

        <label className="min-w-48">
          <span className="text-sm font-medium">Dentro de</span>
          <select
            name="parent_id"
            className="mt-1 w-full rounded border border-linea px-2.5 py-1.5 text-sm outline-none focus:border-acento"
          >
            <option value="">— tema de primer nivel —</option>
            {padres.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          disabled={creando}
          className="rounded bg-acento px-3.5 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {creando ? 'Guardando…' : 'Agregar'}
        </button>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="px-1.5 py-1.5 text-sm text-tinta-suave hover:text-tinta"
        >
          Cancelar
        </button>
      </div>

      {estado.error && <p className="mt-2 text-sm text-carmin">{estado.error}</p>}
    </form>
  )
}

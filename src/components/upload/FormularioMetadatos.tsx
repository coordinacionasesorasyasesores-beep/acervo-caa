'use client'

import { useState } from 'react'
import { temasEnOrden, type Catalogos } from '@/lib/catalogos'
import type { Metadatos } from '@/lib/upload'

/**
 * Cinco campos obligatorios: título, tipo, tema principal, año y
 * responsable. Regla de negocio 4, y no es un capricho — cada campo
 * obligatorio de más es una razón para no subir nada. Lo demás está,
 * pero plegado y opcional.
 */
export function FormularioMetadatos({
  valor,
  onCambio,
  catalogos,
  sugeridos = [],
  deshabilitado,
}: {
  valor: Metadatos
  onCambio: (m: Metadatos, campoTocado: keyof Metadatos) => void
  catalogos: Catalogos
  /** Campos que propuso Claude y el usuario aún no ha corregido. */
  sugeridos?: (keyof Metadatos)[]
  deshabilitado?: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const [etiquetaEnCurso, setEtiquetaEnCurso] = useState('')

  // Cualquier edición retira la marca de sugerido de ese campo: a partir
  // de ahí el dato es del usuario y ya no hay nada que revisar.
  const set = <K extends keyof Metadatos>(k: K, v: Metadatos[K]) =>
    onCambio({ ...valor, [k]: v }, k)

  const sug = (k: keyof Metadatos) => sugeridos.includes(k)

  // Con algo sugerido, la sección plegada trae contenido que conviene ver.
  const [plegadoResuelto, setPlegadoResuelto] = useState(false)
  const opcionalesAbierto =
    abierto ||
    (!plegadoResuelto &&
      (sug('summary') || sug('area') || sug('doc_use_id') || sug('topic_ids') || sug('tags')))

  const temas = temasEnOrden(catalogos.topics)
  const anioActual = new Date().getFullYear()

  function agregarEtiqueta() {
    const t = etiquetaEnCurso.trim().toLowerCase()
    if (t && !valor.tags.includes(t)) set('tags', [...valor.tags, t])
    setEtiquetaEnCurso('')
  }

  return (
    <fieldset disabled={deshabilitado} className="space-y-4 disabled:opacity-60">
      <Campo etiqueta="Título" requerido sugerido={sug('title')}>
        <input
          value={valor.title}
          onChange={(e) => set('title', e.target.value)}
          className={entrada}
        />
      </Campo>

      <div className="grid grid-cols-2 gap-4">
        <Campo etiqueta="Tipo documental" requerido sugerido={sug('doc_type_id')}>
          <select
            value={valor.doc_type_id}
            onChange={(e) => set('doc_type_id', Number(e.target.value) || '')}
            className={entrada}
          >
            <option value="">Elige…</option>
            {catalogos.docTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta="Año" requerido sugerido={sug('year')}>
          <input
            type="number"
            min={1980}
            max={anioActual + 1}
            value={valor.year}
            onChange={(e) => set('year', Number(e.target.value) || '')}
            className={entrada}
          />
        </Campo>
      </div>

      <Campo
        etiqueta="Tema principal"
        requerido
        sugerido={sug('primary_topic_id')}
        pista="¿De qué habla, no qué formato tiene?"
      >
        <select
          value={valor.primary_topic_id}
          onChange={(e) => set('primary_topic_id', Number(e.target.value) || '')}
          className={entrada}
        >
          <option value="">Elige…</option>
          {temas.map((t) => (
            <option key={t.id} value={t.id}>
              {t.parent_id ? `   ${t.name}` : t.name}
            </option>
          ))}
        </select>
      </Campo>

      <Campo
        etiqueta="Responsable"
        requerido
        pista="Quien responde por el contenido, no quien lo sube."
      >
        <select
          value={valor.owner_id}
          onChange={(e) => set('owner_id', e.target.value)}
          className={entrada}
        >
          <option value="">Elige…</option>
          {catalogos.personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name ?? p.id.slice(0, 8)}
            </option>
          ))}
        </select>
      </Campo>

      <button
        type="button"
        onClick={() => {
          setPlegadoResuelto(true)
          setAbierto(!opcionalesAbierto)
        }}
        className="text-xs text-acento underline-offset-2 hover:underline"
      >
        {opcionalesAbierto ? 'Ocultar' : 'Agregar'} resumen, temas secundarios y etiquetas
      </button>

      {opcionalesAbierto && (
        <div className="space-y-4 border-l-2 border-linea pl-4">
          <Campo etiqueta="Resumen" sugerido={sug('summary')}>
            <textarea
              rows={3}
              value={valor.summary}
              onChange={(e) => set('summary', e.target.value)}
              className={entrada}
            />
          </Campo>

          <div className="grid grid-cols-2 gap-4">
            <Campo etiqueta="Área" sugerido={sug('area')}>
              <input
                value={valor.area}
                onChange={(e) => set('area', e.target.value)}
                className={entrada}
              />
            </Campo>
            <Campo etiqueta="Uso" sugerido={sug('doc_use_id')}>
              <select
                value={valor.doc_use_id}
                onChange={(e) => set('doc_use_id', Number(e.target.value) || '')}
                className={entrada}
              >
                <option value="">Sin especificar</option>
                {catalogos.docUses.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          <Campo
            etiqueta="Temas secundarios"
            sugerido={sug('topic_ids')}
            pista="Un concentrado puede hablar de salud, obra y presupuesto a la vez."
          >
            <div className="mt-1 max-h-40 space-y-0.5 overflow-y-auto rounded border border-linea p-2">
              {temas
                .filter((t) => t.id !== valor.primary_topic_id)
                .map((t) => (
                  <label
                    key={t.id}
                    className={`flex items-center gap-2 text-sm ${t.parent_id ? 'pl-4' : 'font-medium'}`}
                  >
                    <input
                      type="checkbox"
                      checked={valor.topic_ids.includes(t.id)}
                      onChange={(e) =>
                        set(
                          'topic_ids',
                          e.target.checked
                            ? [...valor.topic_ids, t.id]
                            : valor.topic_ids.filter((x) => x !== t.id),
                        )
                      }
                    />
                    {t.name}
                  </label>
                ))}
            </div>
          </Campo>

          <Campo
            etiqueta="Etiquetas"
            sugerido={sug('tags')}
            pista="Libres. Lo más fino que no cabe en un tema."
          >
            <div className="mt-1 flex flex-wrap gap-1.5">
              {valor.tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded bg-acento-suave px-2 py-0.5 text-xs"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => set('tags', valor.tags.filter((x) => x !== t))}
                    className="text-tinta-suave hover:text-tinta"
                    aria-label={`Quitar ${t}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <input
              value={etiquetaEnCurso}
              onChange={(e) => setEtiquetaEnCurso(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault()
                  agregarEtiqueta()
                }
              }}
              onBlur={agregarEtiqueta}
              placeholder="Escribe y presiona Enter"
              className={`${entrada} mt-1.5`}
            />
          </Campo>
        </div>
      )}
    </fieldset>
  )
}

const entrada =
  'w-full rounded border border-linea px-2.5 py-1.5 text-sm outline-none focus:border-acento focus:ring-2 focus:ring-acento-suave'

function Campo({
  etiqueta,
  requerido,
  pista,
  sugerido,
  children,
}: {
  etiqueta: string
  requerido?: boolean
  pista?: string
  sugerido?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">
        {etiqueta}
        {requerido && <span className="ml-0.5 text-acento">*</span>}
        {sugerido && (
          <span className="ml-2 rounded bg-acento-suave px-1.5 py-0.5 align-middle text-[11px] font-normal uppercase tracking-wide text-acento">
            sugerido
          </span>
        )}
      </span>
      {pista && <span className="mt-0.5 block text-xs text-tinta-suave">{pista}</span>}
      <div className="mt-1">{children}</div>
    </label>
  )
}

export function faltaAlgo(m: Metadatos): string | null {
  if (!m.title.trim()) return 'Falta el título.'
  if (!m.doc_type_id) return 'Falta el tipo documental.'
  if (!m.primary_topic_id) return 'Falta el tema principal.'
  if (!m.year) return 'Falta el año.'
  if (!m.owner_id) return 'Falta el responsable.'
  return null
}

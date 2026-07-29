'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Catalogos } from '@/lib/catalogos'
import {
  guardarComoDocumento,
  guardarComoVersion,
  type ArchivoEnProceso,
} from '@/lib/upload'
import { FormularioMetadatos, faltaAlgo } from './FormularioMetadatos'
import { BuscadorDocumentos } from './BuscadorDocumentos'

export function FichaArchivo({
  entrada,
  actualizar,
  quitar,
  reintentar,
  catalogos,
}: {
  entrada: ArchivoEnProceso
  actualizar: (cambios: Partial<ArchivoEnProceso>) => void
  quitar: () => void
  reintentar: () => void
  catalogos: Catalogos
}) {
  const [modo, setModo] = useState<'nuevo' | 'version'>('nuevo')
  const [documentoDestino, setDocumentoDestino] = useState<{
    id: string
    title: string
  } | null>(null)
  const [notaDeCambio, setNotaDeCambio] = useState('')
  const [hacerVigente, setHacerVigente] = useState(true)
  const [problema, setProblema] = useState<string | null>(null)

  const mb = (entrada.archivo.size / 1024 / 1024).toFixed(1)

  async function guardar() {
    setProblema(null)

    if (modo === 'nuevo') {
      const falta = faltaAlgo(entrada.metadatos)
      if (falta) return setProblema(falta)
    } else if (!documentoDestino) {
      return setProblema('Elige de qué documento es esta versión.')
    }

    actualizar({ etapa: 'guardando' })
    try {
      if (modo === 'nuevo') {
        const id = await guardarComoDocumento(entrada)
        actualizar({ etapa: 'guardado', documentoId: id })
      } else {
        await guardarComoVersion(entrada, documentoDestino!.id, notaDeCambio, hacerVigente)
        actualizar({ etapa: 'guardado', documentoId: documentoDestino!.id })
      }
    } catch (e) {
      actualizar({ etapa: 'listo' })
      setProblema(e instanceof Error ? e.message : 'No se pudo guardar.')
    }
  }

  return (
    <div className="rounded-lg border border-linea bg-white">
      <div className="flex items-start gap-3 border-b border-linea px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{entrada.archivo.name}</p>
          <p className="mt-0.5 text-xs text-tinta-suave">
            {mb} MB
            {entrada.texto?.paginas
              ? ` · ${entrada.texto.paginas} ${entrada.texto.paginas === 1 ? 'página/hoja' : 'páginas u hojas'}`
              : ''}
            {entrada.texto?.texto
              ? ` · ${entrada.texto.texto.length.toLocaleString('es-MX')} caracteres de texto`
              : ''}
          </p>
        </div>

        <Estado etapa={entrada.etapa} />

        {entrada.etapa !== 'guardando' && (
          <button
            onClick={quitar}
            className="text-tinta-suave transition-colors hover:text-tinta"
            aria-label="Quitar de la lista"
          >
            ×
          </button>
        )}
      </div>

      {(entrada.etapa === 'leyendo' ||
        entrada.etapa === 'subiendo' ||
        entrada.etapa === 'proponiendo') && (
        <div className="px-4 py-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-papel">
            <div
              className={`h-full bg-acento transition-[width] duration-200 ${
                entrada.etapa === 'proponiendo' ? 'animate-pulse' : ''
              }`}
              style={{ width: `${entrada.etapa === 'leyendo' ? 8 : entrada.progreso}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-tinta-suave">
            {entrada.etapa === 'leyendo'
              ? 'Leyendo el contenido en tu navegador…'
              : entrada.etapa === 'subiendo'
                ? `Subiendo… ${entrada.progreso}%`
                : 'Proponiendo los datos a partir del contenido…'}
          </p>
        </div>
      )}

      {entrada.etapa === 'error' && (
        <div className="px-4 py-3">
          <p className="text-sm text-carmin">{entrada.error}</p>
          <button
            onClick={reintentar}
            className="mt-2 rounded border border-linea px-2.5 py-1 text-xs transition-colors hover:bg-papel"
          >
            Reintentar
          </button>
        </div>
      )}

      {entrada.etapa === 'guardado' && (
        <div className="px-4 py-3 text-sm">
          <span className="text-tinta-suave">Guardado. </span>
          <Link
            href={`/doc/${entrada.documentoId}`}
            className="text-acento underline-offset-2 hover:underline"
          >
            Ver el documento
          </Link>
        </div>
      )}

      {(entrada.etapa === 'listo' || entrada.etapa === 'guardando') && (
        <div className="space-y-4 px-4 py-4">
          {entrada.texto?.advertencia && (
            <p className="rounded border border-oro/40 bg-oro-claro/20 px-3 py-2 text-xs leading-relaxed text-tinta">
              {entrada.texto.advertencia}
            </p>
          )}

          {entrada.duplicados.length > 0 && (
            <div className="rounded border border-oro/40 bg-oro-claro/20 px-3 py-2 text-xs leading-relaxed text-tinta">
              <p className="font-medium">Este archivo ya está en el repositorio.</p>
              <ul className="mt-1 space-y-0.5">
                {entrada.duplicados.map((d) => (
                  <li key={d.version_no}>
                    <Link
                      href={`/doc/${d.document_id}`}
                      className="underline underline-offset-2"
                    >
                      {d.document_title}
                    </Link>{' '}
                    · versión {d.version_no}
                    {d.is_current ? ' (vigente)' : ''}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5">
                Puedes quitarlo de la lista, o registrarlo como versión nueva si
                de verdad es otro archivo.
              </p>
            </div>
          )}

          <div className="flex gap-1 rounded border border-linea p-0.5 text-sm">
            <Pestaña activa={modo === 'nuevo'} onClick={() => setModo('nuevo')}>
              Documento nuevo
            </Pestaña>
            <Pestaña activa={modo === 'version'} onClick={() => setModo('version')}>
              Versión de uno existente
            </Pestaña>
          </div>

          {modo === 'nuevo' ? (
            <>
              {entrada.avisoMetadatos && (
                <p className="text-xs leading-relaxed text-tinta-suave">
                  {entrada.avisoMetadatos}
                </p>
              )}
              {entrada.sugeridos.length > 0 && (
                <p className="text-xs leading-relaxed text-tinta-suave">
                  Los campos marcados los propuso Claude leyendo el documento.
                  Revísalos: la marca desaparece en cuanto corriges uno.
                </p>
              )}
              <FormularioMetadatos
                valor={entrada.metadatos}
                onCambio={(m, campoTocado) =>
                  actualizar({
                    metadatos: m,
                    sugeridos: entrada.sugeridos.filter((c) => c !== campoTocado),
                  })
                }
                catalogos={catalogos}
                sugeridos={entrada.sugeridos}
                deshabilitado={entrada.etapa === 'guardando'}
              />
            </>
          ) : (
            <div className="space-y-3">
              <BuscadorDocumentos
                seleccionado={documentoDestino}
                onSeleccionar={setDocumentoDestino}
              />
              <label className="block">
                <span className="text-sm font-medium">Qué cambió</span>
                <input
                  value={notaDeCambio}
                  onChange={(e) => setNotaDeCambio(e.target.value)}
                  placeholder="Corrección de claves de la Jurisdicción 3"
                  className="mt-1 w-full rounded border border-linea px-2.5 py-1.5 text-sm outline-none focus:border-acento focus:ring-2 focus:ring-acento-suave"
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={hacerVigente}
                  onChange={(e) => setHacerVigente(e.target.checked)}
                />
                Marcar como la versión vigente
              </label>
            </div>
          )}

          {problema && <p className="text-sm text-carmin">{problema}</p>}

          <button
            onClick={guardar}
            disabled={entrada.etapa === 'guardando'}
            className="rounded bg-acento px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {entrada.etapa === 'guardando' ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      )}
    </div>
  )
}

function Estado({ etapa }: { etapa: ArchivoEnProceso['etapa'] }) {
  const mapa: Record<ArchivoEnProceso['etapa'], [string, string]> = {
    leyendo: ['Leyendo', 'text-tinta-suave'],
    subiendo: ['Subiendo', 'text-tinta-suave'],
    proponiendo: ['Proponiendo datos', 'text-tinta-suave'],
    listo: ['Falta guardar', 'text-acento'],
    guardando: ['Guardando', 'text-tinta-suave'],
    guardado: ['Guardado', 'text-jade'],
    error: ['Error', 'text-carmin'],
  }
  const [texto, color] = mapa[etapa]
  return <span className={`shrink-0 text-xs ${color}`}>{texto}</span>
}

function Pestaña({
  activa,
  onClick,
  children,
}: {
  activa: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded px-3 py-1.5 transition-colors ${
        activa ? 'bg-acento-suave font-medium text-acento' : 'text-tinta-suave hover:bg-papel'
      }`}
    >
      {children}
    </button>
  )
}

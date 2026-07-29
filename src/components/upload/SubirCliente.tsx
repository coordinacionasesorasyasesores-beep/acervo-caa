'use client'

import { useCallback, useState } from 'react'
import type { Catalogos } from '@/lib/catalogos'
import {
  metadatosVacios,
  procesarArchivo,
  type ArchivoEnProceso,
} from '@/lib/upload'
import { validarEnCliente } from './validar'
import { Dropzone } from './Dropzone'
import { FichaArchivo } from './FichaArchivo'

export function SubirCliente({
  catalogos,
  usuarioId,
}: {
  catalogos: Catalogos
  usuarioId: string
}) {
  const [archivos, setArchivos] = useState<ArchivoEnProceso[]>([])

  const actualizar = useCallback(
    (id: string, cambios: Partial<ArchivoEnProceso>) => {
      setArchivos((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...cambios } : a)),
      )
    },
    [],
  )

  const arrancar = useCallback(
    (entrada: ArchivoEnProceso) => {
      procesarArchivo(entrada, (cambios) => actualizar(entrada.id, cambios))
    },
    [actualizar],
  )

  function recibir(nuevos: File[]) {
    const entradas: ArchivoEnProceso[] = nuevos.map((archivo) => {
      const metadatos = metadatosVacios(archivo)
      // Quien sube suele ser el responsable; si no, lo cambia.
      metadatos.owner_id = usuarioId

      const problema = validarEnCliente(archivo)

      return {
        id: crypto.randomUUID(),
        archivo,
        etapa: problema ? 'error' : 'leyendo',
        progreso: 0,
        texto: null,
        checksum: null,
        storageKey: null,
        textKey: null,
        duplicados: [],
        error: problema,
        documentoId: null,
        metadatos,
        sugeridos: [],
        avisoMetadatos: null,
      }
    })

    setArchivos((prev) => [...prev, ...entradas])

    // En serie y no en paralelo: cinco archivos de 40 MB extrayéndose a
    // la vez tumban la pestaña, y de todos modos comparten el ancho de
    // banda de subida.
    void (async () => {
      for (const e of entradas) {
        if (e.etapa === 'error') continue
        await procesarArchivo(e, (cambios) => actualizar(e.id, cambios))
      }
    })()
  }

  const pendientes = archivos.filter((a) => a.etapa === 'listo').length
  const guardados = archivos.filter((a) => a.etapa === 'guardado').length

  return (
    <div className="space-y-6">
      <Dropzone onArchivos={recibir} />

      {archivos.length > 0 && (
        <>
          <div className="flex items-center justify-between text-sm text-tinta-suave">
            <span>
              {archivos.length} {archivos.length === 1 ? 'archivo' : 'archivos'}
              {pendientes > 0 && ` · ${pendientes} sin guardar`}
              {guardados > 0 && ` · ${guardados} guardado${guardados === 1 ? '' : 's'}`}
            </span>
            {guardados > 0 && (
              <button
                onClick={() =>
                  setArchivos((prev) => prev.filter((a) => a.etapa !== 'guardado'))
                }
                className="text-xs underline-offset-2 hover:underline"
              >
                Limpiar los guardados
              </button>
            )}
          </div>

          <div className="space-y-4">
            {archivos.map((a) => (
              <FichaArchivo
                key={a.id}
                entrada={a}
                catalogos={catalogos}
                actualizar={(cambios) => actualizar(a.id, cambios)}
                quitar={() => setArchivos((prev) => prev.filter((x) => x.id !== a.id))}
                reintentar={() => arrancar(a)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

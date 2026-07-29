/// <reference lib="webworker" />

import { extraerDocx } from './docx'
import { extraerXlsx } from './xlsx'
import { extraerPptx } from './pptx'
import type { Formato, TextoExtraido } from './tipos'

/**
 * Word, Excel y PowerPoint se parsean aquí y no en el hilo principal.
 * Un XLSX de 50 MB en el hilo de la interfaz congela la pestaña —o el
 * navegador la mata por memoria— justo cuando el usuario está viendo la
 * barra de progreso y decidiendo si el sistema es confiable.
 *
 * "Sin worker de servidor" fue la decisión; un Web Worker del navegador
 * no contradice nada de eso.
 */

export type PeticionWorker = {
  id: string
  formato: Exclude<Formato, 'pdf'>
  buffer: ArrayBuffer
}

export type RespuestaWorker =
  | { id: string; ok: true; resultado: TextoExtraido }
  | { id: string; ok: false; error: string }

self.onmessage = async (e: MessageEvent<PeticionWorker>) => {
  const { id, formato, buffer } = e.data

  try {
    let resultado: TextoExtraido
    switch (formato) {
      case 'docx':
        resultado = await extraerDocx(buffer)
        break
      case 'xlsx':
        resultado = await extraerXlsx(buffer)
        break
      case 'pptx':
        resultado = await extraerPptx(buffer)
        break
    }
    ;(self as unknown as Worker).postMessage({ id, ok: true, resultado })
  } catch (error) {
    ;(self as unknown as Worker).postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : 'Error al leer el archivo.',
    })
  }
}

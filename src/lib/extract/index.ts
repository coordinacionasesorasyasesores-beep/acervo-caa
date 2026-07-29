import { extraerPdf } from './pdf'
import { formatoDe, type TextoExtraido } from './tipos'
import type { PeticionWorker, RespuestaWorker } from './worker'

export { formatoDe } from './tipos'
export type { TextoExtraido, Formato } from './tipos'

let worker: Worker | null = null
const pendientes = new Map<
  string,
  { resolver: (r: TextoExtraido) => void; rechazar: (e: Error) => void }
>()

function obtenerWorker(): Worker {
  if (worker) return worker

  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })

  worker.onmessage = (e: MessageEvent<RespuestaWorker>) => {
    const pendiente = pendientes.get(e.data.id)
    if (!pendiente) return
    pendientes.delete(e.data.id)
    if (e.data.ok) pendiente.resolver(e.data.resultado)
    else pendiente.rechazar(new Error(e.data.error))
  }

  // Si el worker muere —memoria, casi siempre—, no dejar colgadas las
  // promesas: el usuario tiene que poder reintentar o guardar sin texto.
  worker.onerror = () => {
    for (const [, p] of pendientes) {
      p.rechazar(new Error('El navegador no pudo procesar el archivo, quizá por su tamaño.'))
    }
    pendientes.clear()
    worker?.terminate()
    worker = null
  }

  return worker
}

/**
 * Extrae el texto de un archivo en el navegador.
 *
 * Nunca lanza por culpa del contenido: si algo sale mal devuelve texto
 * vacío con una advertencia. Un archivo que no se deja leer se sube
 * igual —los metadatos se ponen a mano— y lo que no puede pasar es que
 * un PDF raro bloquee la subida de los otros cuatro que van en la misma
 * tanda.
 */
export async function extraerTexto(archivo: File): Promise<TextoExtraido> {
  const formato = formatoDe(archivo.type, archivo.name)
  if (!formato) {
    return { texto: '', paginas: null, advertencia: 'Formato no reconocido.' }
  }

  try {
    const buffer = await archivo.arrayBuffer()

    if (formato === 'pdf') return await extraerPdf(buffer)

    const id = crypto.randomUUID()
    const peticion: PeticionWorker = { id, formato, buffer }

    return await new Promise<TextoExtraido>((resolver, rechazar) => {
      pendientes.set(id, { resolver, rechazar })
      // El buffer se transfiere, no se copia: con 50 MB la diferencia
      // entre transferir y copiar es medio segundo y el doble de memoria.
      obtenerWorker().postMessage(peticion, [buffer])
    })
  } catch (error) {
    return {
      texto: '',
      paginas: null,
      advertencia:
        error instanceof Error
          ? `No se pudo leer el contenido: ${error.message} Se puede subir igual y llenar los datos a mano.`
          : 'No se pudo leer el contenido del archivo.',
    }
  }
}

/** SHA-256 del archivo, para detectar duplicados (regla de negocio 10). */
export async function calcularChecksum(archivo: File): Promise<string> {
  const buffer = await archivo.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', buffer)
  const hex = [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `sha256:${hex}`
}

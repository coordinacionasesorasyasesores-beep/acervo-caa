'use client'

import { useEffect, useRef, useState } from 'react'
import { useArchivo } from './useArchivo'
import { Cargando, Fallo } from './Estados'

/**
 * Visor de PDF con pdf.js.
 *
 * Se pintan las páginas a `<canvas>` y no se usa el visor empaquetado de
 * pdf.js: ese trae su propia interfaz, sus propios estilos y su propio
 * idioma, y aquí lo único que hace falta es ver el documento dentro de la
 * ficha. Se renderizan de a poco —diez páginas por tanda— porque un
 * anuario de trescientas páginas pintado de golpe congela la pestaña.
 */
const POR_TANDA = 10

export function PdfPreview({ versionId }: { versionId: string }) {
  const { datos, error, cargando } = useArchivo(versionId)
  const contenedor = useRef<HTMLDivElement>(null)
  const [total, setTotal] = useState(0)
  const [pintadas, setPintadas] = useState(0)
  const [problema, setProblema] = useState<string | null>(null)

  useEffect(() => {
    if (!datos || !contenedor.current) return

    let cancelado = false
    let tarea: { destroy: () => Promise<void> } | null = null
    const nodo = contenedor.current

    async function pintar() {
      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.mjs',
          import.meta.url,
        ).toString()

        tarea = pdfjs.getDocument({ data: new Uint8Array(datos!.slice(0)) })
        const doc = await (tarea as unknown as { promise: Promise<import('pdfjs-dist').PDFDocumentProxy> }).promise
        if (cancelado) return

        setTotal(doc.numPages)
        const hasta = Math.min(doc.numPages, pintadas || POR_TANDA)

        nodo.replaceChildren()

        for (let i = 1; i <= hasta; i++) {
          if (cancelado) return
          const pagina = await doc.getPage(i)

          // El ancho disponible manda: el zoom fijo deja los documentos
          // apaisados cortados y los verticales diminutos.
          const base = pagina.getViewport({ scale: 1 })
          const escala = Math.min((nodo.clientWidth || 800) / base.width, 2)
          const vista = pagina.getViewport({ scale: escala })

          const canvas = document.createElement('canvas')
          canvas.width = Math.floor(vista.width * devicePixelRatio)
          canvas.height = Math.floor(vista.height * devicePixelRatio)
          canvas.style.width = '100%'
          canvas.style.height = 'auto'
          canvas.className = 'mb-3 rounded border border-linea bg-white shadow-sm'
          canvas.setAttribute('aria-label', `Página ${i}`)

          const ctx = canvas.getContext('2d')!
          ctx.scale(devicePixelRatio, devicePixelRatio)
          nodo.appendChild(canvas)

          await pagina.render({ canvas, canvasContext: ctx, viewport: vista }).promise
          pagina.cleanup()
        }
      } catch (e) {
        if (!cancelado) {
          setProblema(e instanceof Error ? e.message : 'No se pudo mostrar el PDF.')
        }
      }
    }

    void pintar()
    return () => {
      cancelado = true
      void tarea?.destroy()
    }
  }, [datos, pintadas])

  if (error || problema) return <Fallo>{error ?? problema}</Fallo>
  if (cargando) return <Cargando>Abriendo el documento…</Cargando>

  const mostradas = Math.min(total, pintadas || POR_TANDA)

  return (
    <div>
      <div ref={contenedor} />
      {total > mostradas && (
        <button
          onClick={() => setPintadas(mostradas + POR_TANDA)}
          className="mt-2 w-full rounded border border-linea bg-white py-2 text-sm transition-colors hover:bg-papel"
        >
          Ver más páginas ({mostradas} de {total})
        </button>
      )}
    </div>
  )
}

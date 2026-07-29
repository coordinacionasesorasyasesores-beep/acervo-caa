'use client'

import { useEffect, useState } from 'react'
import { useArchivo } from './useArchivo'
import { Cargando, Fallo } from './Estados'

/**
 * Render de un Word a HTML con mammoth.
 *
 * El HTML sale de un archivo que subió un usuario, así que se sanea antes
 * de tocar el DOM. No es paranoia de manual: un .docx puede traer HTML
 * incrustado, y volcarlo tal cual sería ejecutar en la sesión del lector lo
 * que escribió quien subió el archivo. Con quince personas de confianza el
 * riesgo es bajo, pero el costo de cerrarlo es una línea.
 */
export function DocxPreview({ versionId }: { versionId: string }) {
  const { datos, error, cargando } = useArchivo(versionId)
  const [html, setHtml] = useState<string | null>(null)
  const [problema, setProblema] = useState<string | null>(null)

  useEffect(() => {
    if (!datos) return
    let cancelado = false

    async function convertir() {
      try {
        const [mammoth, DOMPurify] = await Promise.all([
          import('mammoth'),
          import('dompurify'),
        ])
        const { value } = await mammoth.convertToHtml({ arrayBuffer: datos! })
        if (cancelado) return

        setHtml(
          DOMPurify.default.sanitize(value, {
            ALLOWED_TAGS: [
              'p', 'br', 'strong', 'em', 'u', 's', 'sup', 'sub',
              'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
              'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
              'table', 'thead', 'tbody', 'tr', 'th', 'td',
              'a', 'img',
            ],
            ALLOWED_ATTR: ['href', 'title', 'alt', 'src', 'colspan', 'rowspan'],
            // Las imágenes de un .docx llegan como data: URI, que es lo
            // único que se admite: una URL remota en un documento subido
            // avisaría a un tercero cada vez que alguien abre la ficha.
            ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|data:image\/)/i,
          }),
        )
      } catch (e) {
        if (!cancelado) {
          setProblema(e instanceof Error ? e.message : 'No se pudo convertir el documento.')
        }
      }
    }

    void convertir()
    return () => {
      cancelado = true
    }
  }, [datos])

  if (error || problema) return <Fallo>{error ?? problema}</Fallo>
  if (cargando || html === null) return <Cargando>Convirtiendo el documento…</Cargando>

  return (
    <div className="rounded-lg border border-linea bg-white px-6 py-5">
      <div
        className="prose-documento max-w-none text-sm leading-relaxed"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}

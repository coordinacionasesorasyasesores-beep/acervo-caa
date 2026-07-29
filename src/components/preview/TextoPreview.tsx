'use client'

import { useArchivo } from './useArchivo'
import { Cargando, Fallo } from './Estados'

/**
 * El texto extraído, para lo que no tiene visor.
 *
 * Es el caso de PowerPoint: la decisión cerrada del documento es que en F1
 * no hay preview renderizado de PPT, porque montarlo exigiría el worker de
 * conversión que se decidió evitar. Pero enseñar solo la ficha y un botón
 * de descarga obliga a bajar 16 MB para saber si es la presentación que se
 * buscaba. El texto que ya está indexado contesta esa pregunta gratis.
 */
export function TextoPreview({
  versionId,
  nota,
}: {
  versionId: string
  nota?: string
}) {
  const { texto, error, cargando } = useArchivo(versionId, 'texto')

  if (error) return <Fallo>{error}</Fallo>
  if (cargando) return <Cargando>Abriendo el texto…</Cargando>

  return (
    <div>
      {nota && <p className="mb-2 text-xs text-tinta-suave">{nota}</p>}
      <div className="max-h-[36rem] overflow-y-auto rounded-lg border border-linea bg-white px-5 py-4">
        <pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap">
          {texto}
        </pre>
      </div>
    </div>
  )
}

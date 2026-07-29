'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { Cargando } from './Estados'

/**
 * Elige el visor según el tipo de archivo y lo carga solo cuando hace
 * falta. Los tres pesan varios MB entre pdf.js, SheetJS y mammoth; que
 * abrir la ficha de un PDF descargue también el lector de Excel sería
 * pagar el peso de la biblioteca entera en cada visita.
 *
 * El visor no arranca solo: el usuario pulsa "Ver el documento". Muchas
 * visitas a la ficha son para copiar el enlace permanente o mirar el
 * historial de versiones, y en esas no hace falta bajar 16 MB.
 */
const PdfPreview = dynamic(() => import('./PdfPreview').then((m) => m.PdfPreview), {
  ssr: false,
  loading: () => <Cargando>Cargando el visor…</Cargando>,
})
const XlsxPreview = dynamic(() => import('./XlsxPreview').then((m) => m.XlsxPreview), {
  ssr: false,
  loading: () => <Cargando>Cargando el visor…</Cargando>,
})
const DocxPreview = dynamic(() => import('./DocxPreview').then((m) => m.DocxPreview), {
  ssr: false,
  loading: () => <Cargando>Cargando el visor…</Cargando>,
})
const TextoPreview = dynamic(() => import('./TextoPreview').then((m) => m.TextoPreview), {
  ssr: false,
  loading: () => <Cargando>Cargando el texto…</Cargando>,
})

type Formato = 'pdf' | 'xlsx' | 'docx' | 'pptx' | null

function formatoDe(mime: string | null, filename: string | null): Formato {
  const m = mime ?? ''
  if (m.includes('pdf')) return 'pdf'
  if (m.includes('spreadsheetml')) return 'xlsx'
  if (m.includes('wordprocessingml')) return 'docx'
  if (m.includes('presentationml')) return 'pptx'

  const ext = (filename ?? '').toLowerCase().split('.').pop()
  return ext === 'pdf' || ext === 'xlsx' || ext === 'docx' || ext === 'pptx' ? ext : null
}

export function Vista({
  versionId,
  mime,
  filename,
  tieneTexto,
  pesoMb,
}: {
  versionId: string
  mime: string | null
  filename: string | null
  tieneTexto: boolean
  pesoMb: string
}) {
  const [abierto, setAbierto] = useState(false)
  const formato = formatoDe(mime, filename)

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="w-full rounded-lg border border-dashed border-linea bg-white px-6 py-8 text-center transition-colors hover:bg-papel"
      >
        <span className="block text-sm font-medium">
          {formato === 'pptx' ? 'Ver el texto de la presentación' : 'Ver el documento'}
        </span>
        <span className="mt-0.5 block text-xs text-tinta-suave">
          {formato === 'pptx'
            ? 'Las presentaciones no se renderizan en esta versión; se muestra su texto.'
            : `Se descarga ${pesoMb} MB para mostrarlo aquí.`}
        </span>
      </button>
    )
  }

  switch (formato) {
    case 'pdf':
      return <PdfPreview versionId={versionId} />
    case 'xlsx':
      return <XlsxPreview versionId={versionId} />
    case 'docx':
      return <DocxPreview versionId={versionId} />
    case 'pptx':
      return tieneTexto ? (
        <TextoPreview
          versionId={versionId}
          nota="Texto extraído de la presentación. Las láminas que son imágenes no aparecen aquí."
        />
      ) : (
        <SinVista>Esta presentación no dejó texto que mostrar.</SinVista>
      )
    default:
      return tieneTexto ? (
        <TextoPreview versionId={versionId} nota="Texto extraído del archivo." />
      ) : (
        <SinVista>No hay vista previa para este tipo de archivo.</SinVista>
      )
  }
}

function SinVista({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-linea bg-white px-6 py-10 text-center">
      <p className="text-sm text-tinta-suave">{children} Puedes descargarlo.</p>
    </div>
  )
}

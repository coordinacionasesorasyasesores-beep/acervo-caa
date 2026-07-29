import {
  File,
  FileSpreadsheet,
  FileText,
  FileType,
  Presentation,
} from 'lucide-react'

/**
 * El icono según el tipo de archivo.
 *
 * Un solo lugar decide la correspondencia, porque el icono aparece en tres
 * pantallas —sugerencias, resultados y ficha— y que un Excel se vea con un
 * icono distinto según dónde lo mires es peor que no ponerle icono: enseña
 * a desconfiar del icono.
 *
 * El color no es decorativo. Cada formato tiene el suyo dentro de la
 * paleta institucional, así que a los dos o tres días de uso la forma deja
 * de leerse y basta el color para saber que esa fila es una hoja de
 * cálculo. Eso es lo que hace un icono útil frente a uno bonito.
 *
 * Se decide por el mime y se cae al nombre del archivo: algunos
 * navegadores mandan el mime vacío según de dónde se arrastró el archivo.
 */

const POR_FORMATO = {
  xlsx: { Icono: FileSpreadsheet, color: 'text-jade', nombre: 'Hoja de cálculo' },
  pptx: { Icono: Presentation, color: 'text-oro', nombre: 'Presentación' },
  pdf: { Icono: FileText, color: 'text-carmin', nombre: 'PDF' },
  docx: { Icono: FileType, color: 'text-vino', nombre: 'Documento de Word' },
} as const

type Formato = keyof typeof POR_FORMATO

function formatoDe(mime: string | null, filename: string | null): Formato | null {
  const m = mime ?? ''
  if (m.includes('spreadsheetml')) return 'xlsx'
  if (m.includes('presentationml')) return 'pptx'
  if (m.includes('pdf')) return 'pdf'
  if (m.includes('wordprocessingml')) return 'docx'

  const ext = (filename ?? '').toLowerCase().split('.').pop()
  return ext && ext in POR_FORMATO ? (ext as Formato) : null
}

export function IconoArchivo({
  mime,
  filename,
  tamano = 18,
  className = '',
}: {
  mime: string | null
  filename: string | null
  tamano?: number
  className?: string
}) {
  const formato = formatoDe(mime, filename)

  if (!formato) {
    return (
      <File
        size={tamano}
        strokeWidth={1.6}
        aria-label="Archivo"
        className={`shrink-0 text-tinta-suave ${className}`}
      />
    )
  }

  const { Icono, color, nombre } = POR_FORMATO[formato]

  return (
    <Icono
      size={tamano}
      strokeWidth={1.6}
      // El icono no es solo decorativo: dice el formato, y quien usa lector
      // de pantalla también necesita ese dato.
      role="img"
      aria-label={nombre}
      className={`shrink-0 ${color} ${className}`}
    />
  )
}

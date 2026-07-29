export type TextoExtraido = {
  texto: string
  paginas: number | null
  /** Lo que el usuario debe saber antes de guardar, o null si todo salió bien. */
  advertencia: string | null
}

export type Formato = 'pdf' | 'docx' | 'xlsx' | 'pptx'

export function formatoDe(mime: string, filename: string): Formato | null {
  const porMime: Record<string, Formato> = {
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  }
  if (porMime[mime]) return porMime[mime]

  // Algunos navegadores mandan el mime vacío o genérico según de dónde
  // se arrastró el archivo; la extensión es el último recurso.
  const ext = filename.toLowerCase().split('.').pop()
  if (ext === 'pdf' || ext === 'docx' || ext === 'xlsx' || ext === 'pptx') return ext
  return null
}

/** Normaliza espacios sin perder los saltos que dan estructura al texto. */
export function limpiar(texto: string): string {
  return texto
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

import { limpiar, type TextoExtraido } from './tipos'

/** Tope por hoja: un concentrado de cien mil filas no aporta cien mil filas de búsqueda. */
const MAX_FILAS_POR_HOJA = 5000

export async function extraerXlsx(buffer: ArrayBuffer): Promise<TextoExtraido> {
  const XLSX = await import('xlsx')
  const libro = XLSX.read(buffer, { type: 'array', cellDates: true })

  const partes: string[] = []
  let truncado = false

  for (const nombre of libro.SheetNames) {
    const hoja = libro.Sheets[nombre]
    if (!hoja) continue

    // El nombre de la hoja se indexa: en un concentrado suele ser el
    // dato más informativo que hay ("Camas 2026", "Jurisdicción 3").
    partes.push(`## ${nombre}`)

    const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, {
      header: 1,
      blankrows: false,
      defval: '',
    })

    if (filas.length > MAX_FILAS_POR_HOJA) truncado = true

    for (const fila of filas.slice(0, MAX_FILAS_POR_HOJA)) {
      const linea = (fila as unknown[])
        .map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : String(c ?? '')))
        .filter((c) => c !== '')
        .join(' · ')
      if (linea) partes.push(linea)
    }
  }

  const texto = limpiar(partes.join('\n'))

  return {
    texto,
    paginas: libro.SheetNames.length,
    advertencia: truncado
      ? `Alguna hoja pasa de ${MAX_FILAS_POR_HOJA.toLocaleString('es-MX')} filas; se indexaron las primeras. El archivo completo se guarda igual.`
      : texto
        ? null
        : 'El libro no tiene celdas con contenido.',
  }
}

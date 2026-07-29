import { limpiar, type TextoExtraido } from './tipos'

export async function extraerDocx(buffer: ArrayBuffer): Promise<TextoExtraido> {
  // El campo `browser` del paquete redirige las piezas de Node a sus
  // equivalentes de navegador al empaquetar; no hace falta apuntar al
  // build de browser a mano.
  const mammoth = await import('mammoth')
  const { value } = await mammoth.extractRawText({ arrayBuffer: buffer })
  const texto = limpiar(value)

  return {
    texto,
    paginas: null, // Word no tiene páginas hasta que se pagina al imprimir.
    advertencia: texto ? null : 'El documento no tiene texto que indexar.',
  }
}

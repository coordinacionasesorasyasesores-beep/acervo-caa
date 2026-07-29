import { formatoDe } from '@/lib/extract'

const MAX_BYTES = 50 * 1024 * 1024

/**
 * Rechazo temprano, antes de leer nada. El servidor vuelve a validar al
 * firmar la URL —esto es comodidad, no seguridad— pero avisar aquí
 * ahorra que alguien espere a que suba un archivo de 200 MB para
 * enterarse de que no cabía.
 */
export function validarEnCliente(archivo: File): string | null {
  if (!formatoDe(archivo.type, archivo.name)) {
    return `"${archivo.name}" no es PDF, Word, Excel ni PowerPoint.`
  }
  if (archivo.size > MAX_BYTES) {
    return `Pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB y el límite son 50 MB.`
  }
  if (archivo.size === 0) {
    return 'El archivo está vacío.'
  }
  return null
}

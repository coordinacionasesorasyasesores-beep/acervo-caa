import { createAdminClient } from '@/lib/supabase/admin'

/**
 * El almacén de archivos: Supabase Storage por su API nativo.
 *
 * Antes esto firmaba con protocolo S3, lo que tenía una virtud —el mismo
 * código servía para Cloudflare R2— y un costo que resultó mayor: un par
 * de llaves S3 propias, que hay que generar a mano, guardar y rotar. En un
 * proyecto de tres personas sin presupuesto, cada secreto adicional es una
 * cosa más que se puede filtrar y una más que nadie va a rotar nunca.
 *
 * El API nativo firma con la llave de servicio que ya existe. Cero
 * credenciales nuevas. Si algún día hace falta R2, reescribir este archivo
 * es media hora; la portabilidad que se pierde era para un escenario que
 * quizá no llegue.
 *
 * Lo que **no** cambia es lo importante: el archivo sigue subiendo y
 * bajando directo entre el navegador y el almacén, con URLs firmadas de
 * vida corta. Nunca pasa por el servidor de la aplicación.
 */

const MAX_BYTES = 50 * 1024 * 1024

/** Lo que el navegador puede extraer y previsualizar. Nada más entra. */
export const TIPOS_PERMITIDOS: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
}

function bucket() {
  const nombre = process.env.ALMACEN_BUCKET ?? 'acervo'
  return createAdminClient().storage.from(nombre)
}

/**
 * URL de subida directa desde el navegador.
 *
 * Devuelve también el `token`: el cliente de Supabase lo necesita si se
 * usa `uploadToSignedUrl`, y un PUT plano a la URL también funciona. Se
 * entregan los dos para no atar la ruta a una de las dos formas.
 */
export async function firmarSubida(
  key: string,
): Promise<{ url: string; token: string }> {
  const { data, error } = await bucket().createSignedUploadUrl(key, { upsert: true })
  if (error || !data) {
    throw new Error(`No se pudo preparar la subida de ${key}: ${error?.message}`)
  }
  return { url: data.signedUrl, token: data.token }
}

/**
 * URL de descarga de vida corta. Se registra en access_log antes de
 * entregarla.
 *
 * `download` con el nombre original hace que el navegador guarde el
 * archivo como se llamaba, y no como la clave con uuid que usa el almacén.
 * Sin nombre, la URL sirve para previsualizar en lugar de descargar.
 */
export async function firmarDescarga(
  key: string,
  segundos = 120,
  nombreArchivo?: string,
): Promise<string> {
  const { data, error } = await bucket().createSignedUrl(
    key,
    segundos,
    nombreArchivo ? { download: nombreArchivo } : undefined,
  )
  if (error || !data) {
    throw new Error(`No se pudo firmar la descarga de ${key}: ${error?.message}`)
  }
  return data.signedUrl
}

/** Sube contenido desde el servidor. Se usa para el texto extraído. */
export async function subirDesdeServidor(
  key: string,
  cuerpo: string | ArrayBuffer | Blob,
  contentType: string,
): Promise<void> {
  const { error } = await bucket().upload(key, cuerpo, {
    contentType,
    upsert: true,
  })
  if (error) throw new Error(`No se pudo guardar ${key}: ${error.message}`)
}

export async function borrarObjeto(key: string): Promise<void> {
  await bucket().remove([key])
}

/**
 * Nombre del objeto en el almacén. Lleva un uuid para que dos archivos
 * llamados "informe final.pdf" no se pisen, y conserva el nombre
 * original legible para cuando alguien mire el bucket a mano.
 */
export function claveDeAlmacen(uuid: string, filename: string, prefijo = 'docs') {
  const limpio = filename
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-120)
  return `${prefijo}/${uuid}/${limpio || 'archivo'}`
}

export function validarArchivo(mime: string, size: number): string | null {
  if (!TIPOS_PERMITIDOS[mime]) {
    return 'Solo se aceptan PDF, Word, Excel y PowerPoint.'
  }
  if (size > MAX_BYTES) {
    return `El archivo pesa más de 50 MB (${(size / 1024 / 1024).toFixed(1)} MB).`
  }
  if (size === 0) {
    return 'El archivo está vacío.'
  }
  return null
}

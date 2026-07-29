import { AwsClient } from 'aws4fetch'

/**
 * URLs firmadas para Cloudflare R2.
 *
 * El endpoint es configurable a propósito: en desarrollo apunta al API
 * S3 de Supabase Storage, que habla el mismo protocolo. Así el camino
 * que se prueba en local es el mismo que corre en producción —firmas,
 * cabeceras y todo— y no hay una rama de código que solo se ejercita
 * cuando ya es tarde.
 */

const MAX_BYTES = 50 * 1024 * 1024

/** Lo que el navegador puede extraer y previsualizar. Nada más entra. */
export const TIPOS_PERMITIDOS: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
}

function config() {
  const endpoint = process.env.R2_ENDPOINT
  const bucket = process.env.R2_BUCKET
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'Falta configurar el almacenamiento: R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID y R2_SECRET_ACCESS_KEY.',
    )
  }

  return {
    bucket,
    base: endpoint.replace(/\/+$/, ''),
    client: new AwsClient({
      accessKeyId,
      secretAccessKey,
      service: 's3',
      region: process.env.R2_REGION ?? 'auto',
    }),
  }
}

function objectUrl(base: string, bucket: string, key: string) {
  const encoded = key.split('/').map(encodeURIComponent).join('/')
  return `${base}/${bucket}/${encoded}`
}

/** URL de subida directa desde el navegador. El archivo no toca el servidor. */
export async function firmarSubida(
  key: string,
  contentType: string,
  segundos = 600,
): Promise<string> {
  const { client, base, bucket } = config()
  const url = new URL(objectUrl(base, bucket, key))
  url.searchParams.set('X-Amz-Expires', String(segundos))

  const firmada = await client.sign(
    new Request(url, { method: 'PUT', headers: { 'content-type': contentType } }),
    { aws: { signQuery: true, allHeaders: false } },
  )
  return firmada.url
}

/** URL de descarga de vida corta. Se registra en access_log antes de entregarla. */
export async function firmarDescarga(
  key: string,
  segundos = 120,
  nombreArchivo?: string,
): Promise<string> {
  const { client, base, bucket } = config()
  const url = new URL(objectUrl(base, bucket, key))
  url.searchParams.set('X-Amz-Expires', String(segundos))
  if (nombreArchivo) {
    url.searchParams.set(
      'response-content-disposition',
      `attachment; filename="${nombreArchivo.replace(/"/g, '')}"`,
    )
  }

  const firmada = await client.sign(new Request(url, { method: 'GET' }), {
    aws: { signQuery: true },
  })
  return firmada.url
}

/** Sube contenido desde el servidor. Se usa para el texto extraído. */
export async function subirDesdeServidor(
  key: string,
  cuerpo: string | ArrayBuffer,
  contentType: string,
): Promise<void> {
  const { client, base, bucket } = config()
  const res = await client.fetch(objectUrl(base, bucket, key), {
    method: 'PUT',
    body: cuerpo,
    headers: { 'content-type': contentType },
  })
  if (!res.ok) {
    throw new Error(`No se pudo guardar ${key}: ${res.status} ${await res.text()}`)
  }
}

export async function borrarObjeto(key: string): Promise<void> {
  const { client, base, bucket } = config()
  await client.fetch(objectUrl(base, bucket, key), { method: 'DELETE' })
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

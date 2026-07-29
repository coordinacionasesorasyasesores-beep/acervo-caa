import { createClient } from '@/lib/supabase/client'
import { calcularChecksum, extraerTexto, type TextoExtraido } from '@/lib/extract'

export type Duplicado = {
  document_id: string
  document_title: string
  version_no: number
  is_current: boolean
  uploaded_at: string
}

export type Metadatos = {
  title: string
  summary: string
  year: number | ''
  area: string
  source: string
  doc_type_id: number | ''
  doc_use_id: number | ''
  primary_topic_id: number | ''
  owner_id: string
  topic_ids: number[]
  tags: string[]
}

export type Etapa =
  | 'leyendo'
  | 'subiendo'
  | 'listo'      // subido, esperando que el usuario complete los datos
  | 'guardando'
  | 'guardado'
  | 'error'

export type ArchivoEnProceso = {
  id: string
  archivo: File
  etapa: Etapa
  progreso: number
  texto: TextoExtraido | null
  checksum: string | null
  storageKey: string | null
  textKey: string | null
  duplicados: Duplicado[]
  error: string | null
  documentoId: string | null
  metadatos: Metadatos
}

export function metadatosVacios(archivo: File): Metadatos {
  return {
    // El nombre del archivo es mal título, pero es mejor punto de
    // partida que un campo vacío. En el sprint 3 lo propone Claude.
    title: archivo.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim(),
    summary: '',
    year: new Date().getFullYear(),
    area: '',
    source: '',
    doc_type_id: '',
    doc_use_id: '',
    primary_topic_id: '',
    owner_id: '',
    topic_ids: [],
    tags: [],
  }
}

/** PUT directo al almacén, con progreso. `fetch` no reporta avance de subida. */
function subirConProgreso(
  url: string,
  cuerpo: Blob | string,
  contentType: string,
  alAvanzar: (pct: number) => void,
): Promise<void> {
  return new Promise((resolver, rechazar) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', contentType)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) alAvanzar(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolver()
        : rechazar(new Error(`El almacén respondió ${xhr.status}.`))
    xhr.onerror = () => rechazar(new Error('Se cortó la conexión durante la subida.'))
    xhr.ontimeout = () => rechazar(new Error('La subida tardó demasiado.'))

    xhr.send(cuerpo)
  })
}

async function urlFirmada(payload: Record<string, unknown>) {
  const res = await fetch('/api/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const datos = await res.json()
  if (!res.ok) throw new Error(datos.error ?? 'No se pudo preparar la subida.')
  return datos as { url: string; storageKey: string }
}

/**
 * Lee el archivo, lo sube y avisa de duplicados. Deja el archivo en el
 * almacén y los datos listos para que el usuario complete el formulario;
 * el guardado en la base es un paso aparte y explícito.
 */
export async function procesarArchivo(
  entrada: ArchivoEnProceso,
  actualizar: (cambios: Partial<ArchivoEnProceso>) => void,
): Promise<void> {
  const supabase = createClient()

  try {
    actualizar({ etapa: 'leyendo', progreso: 0, error: null })

    // El checksum primero: si ya está, el usuario se entera antes de
    // esperar la extracción y la subida de 40 MB.
    const checksum = await calcularChecksum(entrada.archivo)
    actualizar({ checksum })

    const { data: duplicados } = await supabase.rpc('find_by_checksum', {
      p_checksum: checksum,
    })
    if (duplicados?.length) actualizar({ duplicados: duplicados as Duplicado[] })

    const texto = await extraerTexto(entrada.archivo)
    actualizar({ texto })

    actualizar({ etapa: 'subiendo', progreso: 0 })

    const doc = await urlFirmada({
      uuid: entrada.id,
      filename: entrada.archivo.name,
      mime: entrada.archivo.type || 'application/octet-stream',
      size: entrada.archivo.size,
    })
    await subirConProgreso(
      doc.url,
      entrada.archivo,
      entrada.archivo.type || 'application/octet-stream',
      (pct) => actualizar({ progreso: pct }),
    )

    // El texto crudo va al almacén, no a la base: catorce versiones del
    // mismo concentrado son catorce copias del mismo texto.
    let textKey: string | null = null
    if (texto.texto) {
      const t = await urlFirmada({ uuid: entrada.id, tipo: 'texto' })
      await subirConProgreso(t.url, texto.texto, 'text/plain; charset=utf-8', () => {})
      textKey = t.storageKey
    }

    actualizar({
      etapa: 'listo',
      progreso: 100,
      storageKey: doc.storageKey,
      textKey,
    })
  } catch (error) {
    actualizar({
      etapa: 'error',
      error: error instanceof Error ? error.message : 'Falló la subida.',
    })
  }
}

/** Alta como documento nuevo. Una sola transacción del lado de Postgres. */
export async function guardarComoDocumento(
  entrada: ArchivoEnProceso,
): Promise<string> {
  const supabase = createClient()
  const m = entrada.metadatos

  const { data, error } = await supabase.rpc('create_document_with_version', {
    p_document: {
      title: m.title.trim(),
      summary: m.summary.trim() || null,
      year: m.year === '' ? null : m.year,
      area: m.area.trim() || null,
      source: m.source.trim() || null,
      doc_type_id: m.doc_type_id,
      doc_use_id: m.doc_use_id === '' ? null : m.doc_use_id,
      primary_topic_id: m.primary_topic_id,
      owner_id: m.owner_id,
    },
    p_version: {
      storage_key: entrada.storageKey,
      text_key: entrada.textKey,
      filename: entrada.archivo.name,
      mime: entrada.archivo.type,
      size_bytes: entrada.archivo.size,
      checksum: entrada.checksum,
      page_count: entrada.texto?.paginas ?? null,
      upload_status: 'confirmada',
    },
    p_topic_ids: m.topic_ids,
    p_tags: m.tags,
    p_text_full: entrada.texto?.texto ?? null,
  })

  if (error) throw new Error(error.message)
  return data as string
}

/** Alta como versión nueva de un documento que ya existe. */
export async function guardarComoVersion(
  entrada: ArchivoEnProceso,
  documentId: string,
  notaDeCambio: string,
  hacerVigente: boolean,
): Promise<void> {
  const supabase = createClient()

  const { error } = await supabase.rpc('add_version', {
    p_document_id: documentId,
    p_version: {
      storage_key: entrada.storageKey,
      text_key: entrada.textKey,
      change_note: notaDeCambio.trim() || null,
      filename: entrada.archivo.name,
      mime: entrada.archivo.type,
      size_bytes: entrada.archivo.size,
      checksum: entrada.checksum,
      page_count: entrada.texto?.paginas ?? null,
      upload_status: 'confirmada',
    },
    p_text_full: entrada.texto?.texto ?? null,
    p_make_current: hacerVigente,
  })

  if (error) throw new Error(error.message)
}

/**
 * Copia los documentos de la base local a producción, con su historial.
 *
 *   PROD_URL=… PROD_ANON=… PROD_SVC=… npx tsx scripts/promover.mts [--ensayo]
 *
 * Sustituye a `migrar-a-produccion.mts`, que fue una herramienta de un solo
 * uso y no sirve para un lote: aplanaba el responsable al usuario que corría
 * el script y deduplicaba por título. Este conserva el responsable de cada
 * documento —buscándolo por correo en producción— y copia las versiones en
 * su orden, de modo que el historial llega igual que en local.
 *
 * Las credenciales de producción se pasan por variables de entorno y no se
 * leen de `.env.local`: ahí viven comentadas a propósito, para que ningún
 * script las tome por accidente. Escribir en producción tiene que costar
 * trabajo de teclear.
 *
 * Es reanudable e idempotente por título: un documento que ya está allá se
 * salta entero. No borra ni modifica nada de lo que ya existe.
 */
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const ensayo = process.argv.includes('--ensayo')

for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim()
}

const LOCAL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const LOCAL_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const LOCAL_SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!
const PROD = process.env.PROD_URL!
const PROD_ANON = process.env.PROD_ANON!
const PROD_SVC = process.env.PROD_SVC!
const BUCKET = process.env.ALMACEN_BUCKET ?? 'acervo'

if (!PROD || !PROD_ANON || !PROD_SVC) {
  console.error('Faltan PROD_URL, PROD_ANON y PROD_SVC en el entorno.')
  process.exit(1)
}
if (!LOCAL.includes('127.0.0.1') && !LOCAL.includes('localhost')) {
  console.error(`El origen debe ser local y es ${LOCAL}. Abortando.`)
  process.exit(1)
}
if (PROD.includes('127.0.0.1') || PROD.includes('localhost')) {
  console.error('El destino apunta a local. Abortando.')
  process.exit(1)
}

/** Sesión de usuario real: los RPC de alta corren con permisos de quien llama. */
async function sesion(url: string, anon: string, svc: string, correo?: string) {
  const admin = createClient(url, svc, { auth: { persistSession: false } })
  const { data: us, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (error) throw new Error(`listUsers: ${error.message}`)
  const usuarios = us?.users ?? []
  const elegido = correo
    ? usuarios.find((u) => u.email?.toLowerCase() === correo.toLowerCase())
    : usuarios[0]
  if (!elegido?.email) throw new Error(`no hay usuario ${correo ?? ''} en ${url}`)

  const { data: liga, error: eLiga } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: elegido.email,
  })
  if (eLiga) throw new Error(`generateLink: ${eLiga.message}`)

  const sb = createClient(url, anon, { auth: { persistSession: false } })
  const { error: eOtp } = await sb.auth.verifyOtp({
    type: 'email',
    token_hash: liga!.properties.hashed_token,
  })
  if (eOtp) throw new Error(`verifyOtp: ${eOtp.message}`)
  return { sb, admin, correo: elegido.email, id: elegido.id, usuarios }
}

console.log(`Origen  ${LOCAL}`)
console.log(`Destino ${PROD}${ensayo ? '   · ENSAYO, no se escribe nada' : ''}\n`)

const local = await sesion(LOCAL, LOCAL_ANON, LOCAL_SVC)
const prod = await sesion(PROD, PROD_ANON, PROD_SVC, 'contacto.ivanserrano@gmail.com')
console.log(`Sesión local: ${local.correo}`)
console.log(`Sesión producción: ${prod.correo}\n`)

// ── responsables: se conservan buscándolos por correo ─────────────
const correoLocalDe = new Map(local.usuarios.map((u) => [u.id, u.email?.toLowerCase() ?? '']))
const idProdDe = new Map(prod.usuarios.map((u) => [u.email?.toLowerCase() ?? '', u.id]))

/** Perfiles existentes allá: `owner_id` apunta a `profiles`, no a `auth.users`. */
const { data: perfilesProd } = await prod.sb.from('profiles').select('id')
const conPerfil = new Set((perfilesProd ?? []).map((p) => p.id as string))

function responsableEnProd(ownerLocal: string): string {
  const correo = correoLocalDe.get(ownerLocal)
  const id = correo ? idProdDe.get(correo) : undefined
  // Sin equivalente allá, responde quien promueve: es preferible un
  // responsable real y localizable a una referencia rota.
  return id && conPerfil.has(id) ? id : prod.id
}

// ── qué copiar ────────────────────────────────────────────────────
const { data: docs, error: eDocs } = await local.sb
  .from('documents')
  .select('*, document_topics(topic_id), document_tags(tag)')
  .order('created_at')
if (eDocs) throw new Error(`leyendo documentos locales: ${eDocs.message}`)

const { data: yaEstan } = await prod.sb.from('documents').select('title')
const titulosEnProd = new Set((yaEstan ?? []).map((d) => d.title as string))

console.log(`${docs?.length ?? 0} documento(s) en local · ${titulosEnProd.size} ya en producción\n`)

const almacenLocal = local.admin.storage.from(BUCKET)
const almacenProd = prod.admin.storage.from(BUCKET)

/** Copia un objeto del almacén local al de producción con la misma clave. */
async function copiarObjeto(clave: string | null, mime: string | null) {
  if (!clave) return
  const { data: blob, error } = await almacenLocal.download(clave)
  if (error || !blob) throw new Error(`bajando ${clave}: ${error?.message}`)
  const { error: eSubir } = await almacenProd.upload(clave, blob, {
    contentType: mime ?? undefined,
    upsert: true,
  })
  if (eSubir) throw new Error(`subiendo ${clave}: ${eSubir.message}`)
}

/** El texto completo vive en el almacén: la base solo guarda 30 KB y el vector. */
async function textoCompleto(textKey: string | null): Promise<string | null> {
  if (!textKey) return null
  const { data } = await almacenLocal.download(textKey)
  return data ? await data.text() : null
}

let creados = 0
let versiones = 0
let saltados = 0
let fallidos = 0

for (const doc of docs ?? []) {
  if (titulosEnProd.has(doc.title)) {
    console.log(`⏭  ya está: ${doc.title}`)
    saltados++
    continue
  }

  const { data: vers, error: eVers } = await local.sb
    .from('versions')
    .select('*')
    .eq('document_id', doc.id)
    .order('version_no')
  if (eVers || !vers?.length) {
    console.log(`⏭  sin versiones: ${doc.title}`)
    saltados++
    continue
  }

  console.log(`\n📄 ${doc.title}  (${vers.length} versión(es))`)
  if (ensayo) {
    creados++
    versiones += vers.length - 1
    for (const v of vers) console.log(`     v${v.version_no}  ${v.filename}`)
    continue
  }

  try {
    let documentoId: string | null = null

    for (const v of vers) {
      await copiarObjeto(v.storage_key, v.mime)
      await copiarObjeto(v.text_key, 'text/plain; charset=utf-8')
      const texto = await textoCompleto(v.text_key)

      const version = {
        storage_key: v.storage_key,
        text_key: v.text_key,
        filename: v.filename,
        mime: v.mime,
        size_bytes: v.size_bytes,
        checksum: v.checksum,
        page_count: v.page_count,
        upload_status: 'confirmada',
        change_note: v.change_note,
      }

      if (!documentoId) {
        const { data: id, error } = await prod.sb.rpc('create_document_with_version', {
          p_document: {
            title: doc.title,
            summary: doc.summary,
            year: doc.year,
            area: doc.area,
            source: doc.source,
            doc_type_id: doc.doc_type_id,
            doc_use_id: doc.doc_use_id,
            primary_topic_id: doc.primary_topic_id,
            owner_id: responsableEnProd(doc.owner_id),
            status: doc.status,
          },
          p_version: version,
          p_topic_ids: (doc.document_topics ?? []).map((t: { topic_id: number }) => t.topic_id),
          p_tags: (doc.document_tags ?? []).map((t: { tag: string }) => t.tag),
          p_text_full: texto,
        })
        if (error) throw new Error(error.message)
        documentoId = id as string
        creados++
        console.log(`     ✅ v${v.version_no}  documento creado`)
      } else {
        const { error } = await prod.sb.rpc('add_version', {
          p_document_id: documentoId,
          p_version: version,
          p_text_full: texto,
          p_make_current: true,
        })
        if (error) throw new Error(error.message)
        versiones++
        console.log(`     ✅ v${v.version_no}  ${v.filename.slice(0, 56)}`)
      }
    }
  } catch (error) {
    fallidos++
    console.log(`     ❌ ${error instanceof Error ? error.message : error}`)
  }
}

const { count } = await prod.sb.from('documents').select('*', { count: 'exact', head: true })
console.log(
  `\n══ ${creados} documento(s) · ${versiones} versión(es) adicional(es) · ` +
    `${saltados} saltado(s) · ${fallidos} con error ══`,
)
console.log(`En producción quedan ${count} documentos.`)
process.exit(fallidos > 0 ? 1 : 0)

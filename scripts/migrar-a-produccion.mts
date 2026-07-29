/**
 * Copia los documentos de la base local a la de producción.
 *
 * Se usó una vez, para llevar al proyecto real los dos documentos con los
 * que se desarrolló todo. No es una herramienta de sincronización: no
 * borra, no actualiza, y si el documento ya existe allá lo salta. Para
 * cargas de verdad, la pantalla de subida.
 *
 *   npx tsx scripts/migrar-a-produccion.mts
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim()
}

const LOCAL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const LOCAL_SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!
const PROD = 'https://mmqqtpixmjbdaxmvksoz.supabase.co'
const PROD_SVC = process.env.PROD_SVC!
const PROD_ANON = process.env.PROD_ANON!

if (!LOCAL.includes('127.0.0.1') && !LOCAL.includes('localhost')) {
  console.error('El origen no es local. Abortando.'); process.exit(1)
}

const localAdmin = createClient(LOCAL, LOCAL_SVC, { auth: { persistSession: false } })
const prodAdmin = createClient(PROD, PROD_SVC, { auth: { persistSession: false } })

// También hace falta sesión del lado local: la llave de servicio no tiene
// permiso de tabla en este esquema, y una consulta con ella no falla —
// devuelve cero filas, que es peor, porque parece que no hay nada.
const { data: usLocal } = await localAdmin.auth.admin.listUsers({ page: 1, perPage: 10 })
const { data: ligaLocal } = await localAdmin.auth.admin.generateLink({
  type: 'magiclink', email: usLocal!.users[0].email!,
})
const local = createClient(LOCAL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
  auth: { persistSession: false },
})
const { error: eLocal } = await local.auth.verifyOtp({
  type: 'email', token_hash: ligaLocal!.properties.hashed_token,
})
if (eLocal) { console.error('sesión local:', eLocal.message); process.exit(1) }

// Sesión real en producción: el alta va por RPC, que corre con los
// permisos de quien llama. La llave de servicio no tiene permiso de tabla.
const { data: us } = await prodAdmin.auth.admin.listUsers({ page: 1, perPage: 10 })
const admin = us!.users[0]
const { data: liga } = await prodAdmin.auth.admin.generateLink({
  type: 'magiclink', email: admin.email!,
})
const prod = createClient(PROD, PROD_ANON, { auth: { persistSession: false } })
const { error: eSes } = await prod.auth.verifyOtp({
  type: 'email', token_hash: liga!.properties.hashed_token,
})
if (eSes) { console.error('sesión en producción:', eSes.message); process.exit(1) }
console.log(`Sesión en producción como ${admin.email}\n`)

// ── Qué copiar ───────────────────────────────────────────────────
const { data: docs } = await local
  .from('documents')
  .select('*, document_topics(topic_id), document_tags(tag)')
  .order('created_at')

const { data: yaEstan } = await prod.from('documents').select('title')
const existentes = new Set((yaEstan ?? []).map((d) => d.title))

for (const doc of docs ?? []) {
  if (existentes.has(doc.title)) { console.log(`⏭  ya está: ${doc.title}`); continue }

  const { data: versiones } = await local
    .from('versions').select('*').eq('document_id', doc.id).order('version_no')
  if (!versiones?.length) { console.log(`⏭  sin versiones: ${doc.title}`); continue }

  console.log(`\n📄 ${doc.title}  (${versiones.length} versión(es))`)

  let documentoId: string | null = null

  for (const v of versiones) {
    // Los bytes: se bajan de local y se suben a producción con la misma clave.
    const copiar = async (clave: string | null) => {
      if (!clave) return
      const { data: blob, error } = await localAdmin.storage.from('acervo').download(clave)
      if (error || !blob) throw new Error(`bajando ${clave}: ${error?.message}`)
      const { error: eSubir } = await prodAdmin.storage
        .from('acervo')
        .upload(clave, blob, { contentType: v.mime ?? undefined, upsert: true })
      if (eSubir) throw new Error(`subiendo ${clave}: ${eSubir.message}`)
      console.log(`   ↑ ${clave.slice(0, 60)}… (${(blob.size / 1024 / 1024).toFixed(2)} MB)`)
    }
    await copiar(v.storage_key)
    await copiar(v.text_key)

    // El texto completo se relee del almacén: la base solo guarda el
    // extracto de 30 KB y el vector, que no es reversible.
    let textoCompleto: string | null = null
    if (v.text_key) {
      const { data: t } = await localAdmin.storage.from('acervo').download(v.text_key)
      if (t) textoCompleto = await t.text()
    }

    const version = {
      storage_key: v.storage_key, text_key: v.text_key, filename: v.filename,
      mime: v.mime, size_bytes: v.size_bytes, checksum: v.checksum,
      page_count: v.page_count, upload_status: 'confirmada',
      change_note: v.change_note,
    }

    if (!documentoId) {
      const { data: id, error } = await prod.rpc('create_document_with_version', {
        p_document: {
          title: doc.title, summary: doc.summary, year: doc.year, area: doc.area,
          source: doc.source, doc_type_id: doc.doc_type_id, doc_use_id: doc.doc_use_id,
          primary_topic_id: doc.primary_topic_id, owner_id: admin.id,
        },
        p_version: version,
        p_topic_ids: (doc.document_topics ?? []).map((t: { topic_id: number }) => t.topic_id),
        p_tags: (doc.document_tags ?? []).map((t: { tag: string }) => t.tag),
        p_text_full: textoCompleto,
      })
      if (error) { console.log(`   ❌ ${error.message}`); break }
      documentoId = id as string
      console.log(`   ✅ documento creado, v${v.version_no}`)
    } else {
      const { error } = await prod.rpc('add_version', {
        p_document_id: documentoId,
        p_version: version,
        p_text_full: textoCompleto,
        p_make_current: v.id === doc.current_version_id,
      })
      console.log(error ? `   ❌ v${v.version_no}: ${error.message}` : `   ✅ v${v.version_no} agregada`)
    }
  }
}

const { count } = await prod.from('documents').select('*', { count: 'exact', head: true })
console.log(`\nEn producción quedan ${count} documentos.`)

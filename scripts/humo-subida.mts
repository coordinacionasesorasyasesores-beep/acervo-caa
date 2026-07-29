/**
 * Prueba de humo del sprint 2 contra el stack local de Supabase.
 *
 * Recorre el camino completo de una subida —sesión real, firma S3, PUT del
 * archivo, PUT del texto extraído y alta por RPC— y después comprueba las
 * reglas de negocio que son la premisa del sistema: que el duplicado avise
 * (regla 10), que la versión nueva no pise a la anterior (regla 1) y que el
 * índice de búsqueda solo viva en la versión vigente.
 *
 * No sustituye probar en el navegador: la extracción y el XHR con progreso
 * son código de cliente. Lo que sí cubre es todo lo que pasa después, que es
 * donde un error se queda callado.
 *
 *   npx supabase start
 *   npx tsx scripts/humo-subida.mts "~/Downloads/CONCENTRADO.xlsx" "~/Downloads/laminas.pptx"
 *
 * Va por `npx tsx` y no por `npm run`: npm pierde las comillas y una ruta con
 * espacios llega partida en dos argumentos.
 *
 * Escribe en la base local. No apuntarlo nunca al proyecto remoto.
 */
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { firmarSubida, claveDeAlmacen, validarArchivo } from '../src/lib/almacen.ts'
import { extraerXlsx } from '../src/lib/extract/xlsx.ts'
import { extraerPptx } from '../src/lib/extract/pptx.ts'

// ── configuración ────────────────────────────────────────────────
for (const linea of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = linea.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim()
}

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!URL_SB.includes('127.0.0.1') && !URL_SB.includes('localhost')) {
  console.error(`Esta prueba escribe documentos de mentira. Apunta a ${URL_SB}, que no es local. Abortando.`)
  process.exit(1)
}

const [rutaXlsx, rutaPptx] = process.argv.slice(2)
if (!rutaXlsx || !rutaPptx) {
  console.error('Uso: npm run prueba:humo -- <archivo.xlsx> <archivo.pptx>')
  process.exit(1)
}

let fallos = 0
const ok = (s: string) => console.log('  ✅', s)
const mal = (s: string) => { console.log('  ❌', s); fallos++ }

// ── 1. sesión real, el mismo camino que el navegador ─────────────
console.log('\n1. Sesión')
// Se consulta por el API de Auth y no por la tabla: la llave de servicio
// no tiene permiso de tabla en este esquema (ver §10 del documento).
const admin = createClient(URL_SB, SERVICE, { auth: { persistSession: false } })
const { data: usuarios } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 })
const correo = usuarios?.users?.[0]?.email
if (!correo) { mal('no hay usuarios: entra una vez por /login o corre el seed'); process.exit(1) }

const { data: liga, error: eLiga } = await admin.auth.admin.generateLink({
  type: 'magiclink',
  email: correo,
})
if (eLiga) { mal(`generateLink: ${eLiga.message}`); process.exit(1) }

const sb = createClient(URL_SB, ANON, { auth: { persistSession: false } })
const { data: sesion, error: eSesion } = await sb.auth.verifyOtp({
  type: 'email',
  token_hash: liga!.properties.hashed_token,
})
if (eSesion) { mal(`verifyOtp: ${eSesion.message}`); process.exit(1) }
ok(`autenticado como ${sesion.user!.email}`)

const usuario = sesion.user!.id
const { data: perfil } = await sb.from('profiles').select('role').eq('id', usuario).single()
perfil ? ok(`perfil legible bajo RLS, rol ${perfil.role}`) : mal('RLS no dejó leer el perfil propio')

// ── helpers ──────────────────────────────────────────────────────
const MIME: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

async function checksum(buf: Buffer) {
  const h = await crypto.subtle.digest('SHA-256', buf as unknown as ArrayBuffer)
  return 'sha256:' + [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Todo lo que ocurre antes de que el usuario toque el formulario. */
async function procesar(ruta: string) {
  const buf = readFileSync(ruta)
  const ext = ruta.toLowerCase().split('.').pop()!
  const mime = MIME[ext]
  const uuid = crypto.randomUUID()
  const nombre = basename(ruta)

  const problema = validarArchivo(mime, buf.length)
  problema
    ? mal(`validarArchivo rechazó ${nombre}: ${problema}`)
    : ok(`validarArchivo acepta ${nombre} (${(buf.length / 1024 / 1024).toFixed(2)} MB)`)

  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  const texto = ext === 'pptx' ? await extraerPptx(ab) : await extraerXlsx(ab)

  const storageKey = claveDeAlmacen(uuid, nombre)
  const { url: urlDoc } = await firmarSubida(storageKey)
  const r1 = await fetch(urlDoc, {
    method: 'PUT', body: buf, headers: { 'content-type': mime },
  })
  r1.ok ? ok(`archivo subido a ${storageKey}`) : mal(`PUT del archivo: ${r1.status} ${await r1.text()}`)

  const textKey = `text/${uuid}.txt`
  const { url: urlTexto } = await firmarSubida(textKey)
  const r2 = await fetch(urlTexto, {
    method: 'PUT', body: texto.texto, headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
  r2.ok ? ok(`texto subido a ${textKey}`) : mal(`PUT del texto: ${r2.status}`)

  return {
    version: {
      storage_key: storageKey, text_key: textKey, filename: nombre, mime,
      size_bytes: buf.length, checksum: await checksum(buf),
      page_count: texto.paginas, upload_status: 'confirmada',
    },
    texto: texto.texto,
  }
}

// ── 2. documento nuevo desde un concentrado ──────────────────────
console.log('\n2. Concentrado → documento nuevo')
const xlsx = await procesar(rutaXlsx)
const { data: docId, error: eDoc } = await sb.rpc('create_document_with_version', {
  p_document: {
    title: 'Prueba de humo — concentrado', summary: 'Documento de prueba automatizada.',
    year: new Date().getFullYear(), area: 'CAA', source: 'prueba',
    doc_type_id: 3, doc_use_id: 1, primary_topic_id: 4, owner_id: usuario,
  },
  p_version: xlsx.version,
  p_topic_ids: [1, 2, 3, 4],
  p_tags: ['prueba', 'concentrado'],
  p_text_full: xlsx.texto,
})
eDoc ? mal(`create_document_with_version: ${eDoc.message}`) : ok(`documento creado: ${docId}`)

// ── 3. documento nuevo desde una presentación pesada ─────────────
console.log('\n3. Presentación → documento nuevo')
const pptx = await procesar(rutaPptx)
const { error: ePpt } = await sb.rpc('create_document_with_version', {
  p_document: {
    title: 'Prueba de humo — presentación', summary: 'Documento de prueba automatizada.',
    year: new Date().getFullYear(), area: 'CAA', source: 'prueba',
    doc_type_id: 2, doc_use_id: 2, primary_topic_id: 1, owner_id: usuario,
  },
  p_version: pptx.version,
  p_topic_ids: [1, 3],
  p_tags: ['prueba', 'gráficas'],
  p_text_full: pptx.texto,
})
ePpt ? mal(`create_document_with_version (pptx): ${ePpt.message}`) : ok('documento creado')

// ── 4. el duplicado avisa antes de subir otra vez (regla 10) ─────
console.log('\n4. Detección de duplicado')
const { data: dups, error: eDup } = await sb.rpc('find_by_checksum', {
  p_checksum: xlsx.version.checksum,
})
if (eDup) mal(`find_by_checksum: ${eDup.message}`)
else if (dups?.length) ok(`avisa: "${dups[0].document_title}" v${dups[0].version_no}`)
else mal('no detectó el duplicado')

// ── 5. versión nueva sin pisar la anterior (reglas 1 y 2) ────────
console.log('\n5. Segunda versión')
const v2 = await procesar(rutaXlsx)
const { error: eVer } = await sb.rpc('add_version', {
  p_document_id: docId,
  p_version: { ...v2.version, change_note: 'Prueba de versionado' },
  p_text_full: v2.texto,
  p_make_current: true,
})
eVer ? mal(`add_version: ${eVer.message}`) : ok('versión 2 agregada y marcada vigente')

const { data: versiones } = await sb
  .from('versions')
  .select('version_no, text_excerpt, search_vector')
  .eq('document_id', docId)
  .order('version_no')

const v1 = versiones?.find((v) => v.version_no === 1)
const vig = versiones?.find((v) => v.version_no === 2)
versiones?.length === 2 ? ok('la versión 1 sigue ahí: nada se borra') : mal('se perdió una versión')
v1?.search_vector === null && v1?.text_excerpt === null
  ? ok('la versión 1 soltó su índice: solo la vigente se indexa')
  : mal('la versión 1 conservó índice, y eso duplica peso en la base')
vig?.search_vector ? ok('la versión vigente quedó indexada') : mal('la versión vigente no tiene índice')

// ── 6. el texto quedó buscable de verdad ─────────────────────────
// El RPC de búsqueda es del sprint 4; aquí solo se comprueba que el
// tsvector quedó bien formado y que una palabra del contenido lo encuentra.
console.log('\n6. Búsqueda sobre lo indexado')
const termino = 'derechohabientes'
// El join se nombra por su llave foránea a propósito: entre documents y
// versions hay DOS (versions.document_id y documents.current_version_id),
// y sin desambiguar PostgREST responde 300 en vez de datos.
const { data: encontrados, error: eIndice } = await sb
  .from('versions')
  .select('version_no, document_id, documents!versions_document_id_fkey(title)')
  .textSearch('search_vector', termino, { config: 'spanish' })
if (eIndice) mal(`búsqueda: ${eIndice.message}`)
encontrados?.length
  ? ok(`"${termino}" → ${encontrados.length} versión(es) indexada(s)`)
  : mal(`"${termino}" no encontró nada en el índice`)

console.log(fallos === 0 ? '\n══ TODO PASÓ ══' : `\n══ ${fallos} FALLO(S) ══`)
process.exit(fallos === 0 ? 0 : 1)

/**
 * Pasa un archivo real por el extractor y por Claude, y enseña los
 * metadatos que propondría.
 *
 * Es la herramienta para afinar el prompt: el ciclo de escribir una
 * instrucción, subir un archivo por el navegador y mirar el formulario es
 * demasiado lento para iterar, y aquí se ve la propuesta cruda —incluido
 * lo que dejó en null, que es la mitad de lo que importa.
 *
 *   npx tsx scripts/metadatos.mts "~/Downloads/CONCENTRADO.xlsx"
 *
 * Lee los catálogos del Supabase local y gasta una llamada de la API por
 * archivo. Ojo: cuesta dinero de verdad, aunque sea Haiku.
 */
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { sugerirMetadatos } from '../src/lib/metadatos.ts'
import { extraerXlsx } from '../src/lib/extract/xlsx.ts'
import { extraerPptx } from '../src/lib/extract/pptx.ts'
import { extraerDocx } from '../src/lib/extract/docx.ts'
import type { Catalogos } from '../src/lib/catalogos.ts'

for (const linea of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = linea.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim()
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Falta ANTHROPIC_API_KEY en .env.local')
  process.exit(1)
}

const rutas = process.argv.slice(2)
if (rutas.length === 0) {
  console.error('Uso: npx tsx scripts/metadatos.mts <archivo> [archivo...]')
  process.exit(1)
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

// Los catálogos se leen por sesión de usuario, no con la llave de servicio:
// service_role no tiene permiso de tabla en este esquema (§10 del documento).
const { data: usuarios } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 })
const { data: liga } = await admin.auth.admin.generateLink({
  type: 'magiclink',
  email: usuarios!.users[0].email!,
})
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
)
await sb.auth.verifyOtp({ type: 'email', token_hash: liga!.properties.hashed_token })

const [topics, docTypes, docUses] = await Promise.all([
  sb.from('topics').select('*').order('position'),
  sb.from('doc_types').select('id, slug, name').order('position'),
  sb.from('doc_uses').select('id, slug, name').order('position'),
])

const catalogos: Catalogos = {
  topics: topics.data ?? [],
  docTypes: docTypes.data ?? [],
  docUses: docUses.data ?? [],
  personas: [],
}

const nombreDe = (lista: { slug: string; name: string }[], slug: string | null) =>
  slug ? (lista.find((x) => x.slug === slug)?.name ?? `⚠️ ${slug} no existe`) : '—'

for (const ruta of rutas) {
  const buf = readFileSync(ruta)
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  const ext = ruta.toLowerCase().split('.').pop()

  const extraer = ext === 'pptx' ? extraerPptx : ext === 'docx' ? extraerDocx : extraerXlsx
  const { texto } = await extraer(ab)

  const t0 = performance.now()
  const s = await sugerirMetadatos(texto, catalogos)
  const ms = Math.round(performance.now() - t0)

  console.log(`\n═══ ${basename(ruta)} ═══`)
  console.log(`  (${texto.length.toLocaleString('es-MX')} caracteres de texto · ${ms} ms)\n`)
  console.log('  título:   ', s.title ?? '—')
  console.log('  año:      ', s.year ?? '—')
  console.log('  área:     ', s.area ?? '—')
  console.log('  tipo:     ', nombreDe(catalogos.docTypes, s.doc_type_slug))
  console.log('  uso:      ', nombreDe(catalogos.docUses, s.doc_use_slug))
  console.log('  tema:     ', nombreDe(catalogos.topics, s.primary_topic_slug))
  console.log(
    '  otros:    ',
    s.topic_slugs.length
      ? s.topic_slugs.map((x) => nombreDe(catalogos.topics, x)).join(', ')
      : '—',
  )
  console.log('  etiquetas:', s.tags.length ? s.tags.join(', ') : '—')
  console.log('  resumen:  ', s.summary ? `\n    ${s.summary.replace(/\n/g, '\n    ')}` : '—')
}

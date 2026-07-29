/**
 * Prueba de humo del sprint 4 contra el stack local de Supabase.
 *
 * Siembra unos documentos de mentira, ejercita el buscador contra ellos y
 * los borra al terminar. Lo que se comprueba no es que "el buscador
 * responda", sino las decisiones que tomamos y que son fáciles de romper
 * sin darse cuenta: que el peso del título mande sobre el del contenido,
 * que un tema padre arrastre a sus hijos, que las facetas se cuenten sin
 * su propio filtro y que un archivado no aparezca sin pedirlo.
 *
 *   npx supabase start
 *   npx tsx scripts/humo-busqueda.mts
 *
 * Escribe en la base local. No apuntarlo nunca al proyecto remoto.
 */
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { leerFiltros, urlCon } from '../src/lib/busqueda.ts'

/** Deshace una URL construida por `urlCon` para volver a leerla. */
function paramsDe(url: string): Record<string, string> {
  const p = new URLSearchParams(url.split('?')[1] ?? '')
  return Object.fromEntries(p.entries())
}

for (const linea of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = linea.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim()
}

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL!
if (!URL_SB.includes('127.0.0.1') && !URL_SB.includes('localhost')) {
  console.error(`Esta prueba escribe documentos de mentira. Apunta a ${URL_SB}. Abortando.`)
  process.exit(1)
}

let fallos = 0
const ok = (s: string) => console.log('  ✅', s)
const mal = (s: string) => { console.log('  ❌', s); fallos++ }
const comprobar = (cond: boolean, s: string) => (cond ? ok(s) : mal(s))

const MARCA = 'ZZQX' // palabra inventada: no colisiona con nada real

// ── sesión ───────────────────────────────────────────────────────
const admin = createClient(URL_SB, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})
const { data: usuarios } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 })
const correo = usuarios?.users?.[0]?.email
if (!correo) { console.error('No hay usuarios. Entra una vez por /login.'); process.exit(1) }

const { data: liga } = await admin.auth.admin.generateLink({ type: 'magiclink', email: correo })
const sb: SupabaseClient = createClient(URL_SB, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
  auth: { persistSession: false },
})
const { data: sesion, error: eSesion } = await sb.auth.verifyOtp({
  type: 'email',
  token_hash: liga!.properties.hashed_token,
})
if (eSesion) { console.error('verifyOtp:', eSesion.message); process.exit(1) }
const usuario = sesion.user!.id

// ── catálogos ────────────────────────────────────────────────────
const { data: topics } = await sb.from('topics').select('*').order('position')
const padre = topics!.find((t) => t.parent_id === null)!
const hijo = topics!.find((t) => t.parent_id === padre.id)!
const otroPadre = topics!.find((t) => t.parent_id === null && t.id !== padre.id)!
const { data: tipos } = await sb.from('doc_types').select('id, slug, name').order('id')

console.log(`\nSembrando (tema padre "${padre.name}", hijo "${hijo.name}")`)

// ── siembra ──────────────────────────────────────────────────────
type Semilla = {
  titulo: string
  resumen: string
  texto: string
  anio: number
  area: string
  tema: number
  tipo: number
  estatus?: string
}

const semillas: Semilla[] = [
  {
    titulo: `${MARCA} quirófanos en el título`,
    resumen: 'Resumen sin la palabra clave.',
    texto: 'Contenido de relleno sobre otros asuntos administrativos.',
    anio: 2024, area: 'Área Alfa', tema: padre.id, tipo: tipos![0].id,
  },
  {
    titulo: `${MARCA} documento con la palabra en el contenido`,
    resumen: 'Resumen sin la palabra clave.',
    texto: 'El informe detalla la disponibilidad de quirófanos en hospitales propios.',
    anio: 2025, area: 'Área Beta', tema: hijo.id, tipo: tipos![1].id,
  },
  {
    titulo: `${MARCA} solo en el resumen`,
    resumen: 'Este resumen sí menciona quirófanos y nada más.',
    texto: 'Texto largo de relleno que no menciona la palabra buscada en ningún lado.',
    anio: 2025, area: 'Área Alfa', tema: otroPadre.id, tipo: tipos![0].id,
  },
  {
    titulo: `${MARCA} archivado con quirófanos`,
    resumen: 'Resumen del archivado.',
    texto: 'Menciona quirófanos pero está archivado.',
    anio: 2023, area: 'Área Beta', tema: padre.id, tipo: tipos![0].id,
    estatus: 'archivado',
  },
]

const creados: string[] = []
for (const s of semillas) {
  const { data: id, error } = await sb.rpc('create_document_with_version', {
    p_document: {
      title: s.titulo, summary: s.resumen, year: s.anio, area: s.area,
      source: 'prueba', doc_type_id: s.tipo, doc_use_id: null,
      primary_topic_id: s.tema, owner_id: usuario,
    },
    p_version: {
      storage_key: `docs/prueba/${crypto.randomUUID()}.pdf`,
      text_key: null, filename: 'prueba.pdf', mime: 'application/pdf',
      size_bytes: 1234, checksum: `sha256:${crypto.randomUUID()}`,
      page_count: 1, upload_status: 'confirmada',
    },
    p_topic_ids: [s.tema],
    p_tags: ['prueba'],
    p_text_full: s.texto,
  })
  if (error) { mal(`siembra: ${error.message}`); process.exit(1) }
  creados.push(id as string)

  if (s.estatus) {
    await sb.from('documents').update({ status: s.estatus }).eq('id', id as string)
  }
}
ok(`${creados.length} documentos sembrados`)

const mios = (filas: { title: string }[]) => filas.filter((f) => f.title.includes(MARCA))
const buscar = async (params: Record<string, unknown>) => {
  const { data, error } = await sb.rpc('search_documents', params)
  if (error) throw new Error(error.message)
  return data as { id: string; title: string; fragmento: string; fragmento_es_resumen: boolean; relevancia: number; total: number }[]
}

try {
  // ── 1. el peso del título manda ────────────────────────────────
  console.log('\n1. Ranking: título (peso A) sobre contenido (peso C)')
  const r1 = mios(await buscar({ p_query: 'quirófanos', p_order: 'relevancia', p_limit: 50 }))
  comprobar(r1.length === 3, `encuentra 3 publicados, no el archivado (encontró ${r1.length})`)
  comprobar(
    r1[0]?.title.includes('en el título'),
    `el del título va primero (fue "${r1[0]?.title.replace(MARCA + ' ', '')}")`,
  )

  // ── 2. fragmento resaltado ─────────────────────────────────────
  console.log('\n2. Fragmento con el término resaltado')
  const enContenido = r1.find((f) => f.title.includes('en el contenido'))!
  comprobar(
    enContenido.fragmento.includes('«quirófanos»') && !enContenido.fragmento_es_resumen,
    'el que lo trae en el contenido resalta la palabra en su fragmento',
  )
  const soloResumen = r1.find((f) => f.title.includes('solo en el resumen'))!
  comprobar(
    soloResumen.fragmento_es_resumen && soloResumen.fragmento.includes('quirófanos'),
    'sin coincidencia en el extracto, cae al resumen en vez de quedar vacío',
  )

  // ── 3. un tema padre arrastra a sus hijos ──────────────────────
  console.log('\n3. Jerarquía de temas')
  const porPadre = mios(await buscar({ p_topic_ids: [padre.id], p_limit: 50 }))
  comprobar(
    porPadre.some((f) => f.title.includes('en el contenido')),
    `filtrar por "${padre.name}" trae lo que cuelga de "${hijo.name}"`,
  )
  const porHijo = mios(await buscar({ p_topic_ids: [hijo.id], p_limit: 50 }))
  comprobar(
    porHijo.length === 1 && !porHijo.some((f) => f.title.includes('en el título')),
    'filtrar por el hijo no arrastra al padre hacia arriba',
  )

  // ── 4. estatus ─────────────────────────────────────────────────
  console.log('\n4. Estatus')
  const conArchivados = mios(
    await buscar({ p_query: 'quirófanos', p_statuses: ['publicado', 'archivado'], p_limit: 50 }),
  )
  comprobar(
    conArchivados.length === 4 && conArchivados.some((f) => f.title.includes('archivado')),
    'el archivado aparece solo cuando se pide (regla 2: no se borra, se esconde)',
  )

  // ── 5. facetas contadas sin su propio filtro ───────────────────
  console.log('\n5. Facetas')
  const facetasDe = async (params: Record<string, unknown>) => {
    const { data, error } = await sb.rpc('search_facets', params)
    if (error) throw new Error(error.message)
    return data as { dimension: string; valor: string; cuantos: number }[]
  }

  const libres = await facetasDe({ p_query: `${MARCA} quirófanos` })
  const anios = libres.filter((f) => f.dimension === 'year').map((f) => f.valor)
  comprobar(
    anios.includes('2024') && anios.includes('2025'),
    `sin filtro, la faceta de año ofrece 2024 y 2025 (${anios.join(', ')})`,
  )

  const con2025 = await facetasDe({ p_query: `${MARCA} quirófanos`, p_years: [2025] })
  const aniosFiltrados = con2025.filter((f) => f.dimension === 'year').map((f) => f.valor)
  comprobar(
    aniosFiltrados.includes('2024'),
    'con 2025 elegido, 2024 sigue ofreciéndose: se puede cambiar de opinión',
  )

  const areasCon2025 = con2025.filter((f) => f.dimension === 'area')
  comprobar(
    areasCon2025.every((f) => f.cuantos <= 2),
    'las demás dimensiones sí se recortan con el año elegido',
  )

  // ── 6. sintaxis de websearch ───────────────────────────────────
  console.log('\n6. Sintaxis de búsqueda')
  const excluido = mios(await buscar({ p_query: 'quirófanos -archivado', p_limit: 50 }))
  comprobar(excluido.length >= 1, 'el guion para excluir no rompe la consulta')
  const frase = mios(await buscar({ p_query: '"hospitales propios"', p_limit: 50 }))
  comprobar(
    frase.length === 1 && frase[0].title.includes('en el contenido'),
    'la frase entre comillas busca las palabras juntas',
  )
  const vacia = await buscar({ p_query: '   ', p_limit: 50 })
  comprobar(vacia.length > 0, 'una consulta en blanco lista el acervo en vez de fallar')

  // ── 7. paginación ──────────────────────────────────────────────
  console.log('\n7. Paginación')
  const pag1 = await buscar({ p_query: MARCA, p_limit: 2, p_offset: 0 })
  const pag2 = await buscar({ p_query: MARCA, p_limit: 2, p_offset: 2 })
  comprobar(pag1.length === 2 && Number(pag1[0].total) === 3, `total 3, página de 2 (total=${pag1[0]?.total})`)
  comprobar(
    pag2.length === 1 && pag1[0].id !== pag2[0].id,
    'la segunda página trae lo que falta, sin repetir',
  )

  // ── 8. el árbol cuenta lo que hay en pantalla ──────────────────
  console.log('\n8. Conteos del árbol')
  const contar = async (params: Record<string, unknown>) => {
    const { data } = await sb.rpc('topic_counts', params)
    return new Map((data as { topic_id: number; cuantos: number }[]).map((c) => [c.topic_id, Number(c.cuantos)]))
  }
  const sinBusqueda = await contar({})
  const conBusqueda = await contar({ p_query: `${MARCA} quirófanos` })
  comprobar(
    (conBusqueda.get(padre.id) ?? 0) < (sinBusqueda.get(padre.id) ?? 0),
    'con búsqueda activa, el árbol cuenta los resultados y no el acervo entero',
  )

  // ── 9. la URL conserva lo que el usuario eligió ────────────────
  // Estos dos se rompen sin que ninguna consulta falle: la pantalla
  // simplemente ignora el clic, y eso no lo detecta ninguna prueba de SQL.
  console.log('\n9. Estado en la URL')
  const base0 = leerFiltros({})
  const conTexto = leerFiltros({ q: 'quirófanos' })
  const porFecha = leerFiltros(paramsDe(urlCon(conTexto, { orden: 'reciente', pagina: 1 })))
  comprobar(porFecha.orden === 'reciente', 'elegir "ordenar por fecha" sobrevive al viaje por la URL')
  const dePaso = leerFiltros(paramsDe(urlCon(conTexto, { anios: [2025], pagina: 1 })))
  comprobar(
    dePaso.q === 'quirófanos' && dePaso.anios.length === 1,
    'agregar una faceta conserva el texto buscado',
  )
  comprobar(base0.orden === 'reciente', 'sin texto, el orden por relevancia no aplica')
} finally {
  // ── limpieza ─────────────────────────────────────────────────────
  // Se borra por psql y no desde la sesión de la app porque `delete` no se
  // le otorga a nadie en el esquema (regla 2, "nada se borra"), y esa
  // puerta tiene que seguir cerrada aunque le estorbe a una prueba.
  //
  // Limpiar es parte de la prueba, no un paso aparte: una corrida que deja
  // basura hace fallar a la siguiente con números que no cuadran, y se
  // pierde media hora buscando un bug en el buscador que no existe.
  try {
    execFileSync('docker', [
      'exec', 'supabase_db_acervo-caa',
      'psql', '-U', 'postgres', '-d', 'postgres', '-q',
      '-c', `delete from documents where title like '${MARCA}%';`,
    ])
    console.log(`\n🧹 ${creados.length} documentos de prueba borrados.`)
  } catch {
    console.log(`\n⚠️  No se pudieron borrar los documentos de prueba. Hazlo con:`)
    console.log(
      `  docker exec supabase_db_acervo-caa psql -U postgres -d postgres \\\n    -c "delete from documents where title like '${MARCA}%';"`,
    )
  }
}

console.log(fallos === 0 ? '\n══ TODO PASÓ ══' : `\n══ ${fallos} FALLO(S) ══`)
process.exit(fallos === 0 ? 0 : 1)

/**
 * Primera mitad de una carga masiva: recorre una carpeta y escribe el Excel
 * que una persona va a revisar.
 *
 * La plantilla sale **prellenada**, no vacía, y eso es la decisión de
 * diseño: quien cataloga corrige mucho más rápido de lo que redacta, y el
 * sistema ya sabe proponer metadatos (`src/lib/metadatos.ts`, el mismo
 * camino que la pantalla de subida). Un Excel en blanco para 300 archivos
 * son varios días de trabajo y una tasa de campos vacíos alta; uno
 * prellenado son unas horas de revisión.
 *
 *   npx tsx scripts/preparar-carga.mts "~/Acervo/centro-investigacion"
 *   npx tsx scripts/preparar-carga.mts <carpeta> -o carga.xlsx --responsable ana@issste.gob.mx
 *   npx tsx scripts/preparar-carga.mts <carpeta> --sin-ia     (no gasta API)
 *
 * Deja dos archivos: el `.xlsx` que se revisa a mano y un `.datos.json`
 * hermano con el texto extraído y los datos técnicos (checksum, mime,
 * páginas). El JSON no se toca: existe para que `cargar.mts` no tenga que
 * volver a extraer todo, y para que nadie edite en Excel un checksum.
 *
 * No escribe nada en la base: solo lee catálogos y consulta duplicados.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import * as XLSX from 'xlsx'
import { sugerirMetadatos, type MetadatosSugeridos } from '../src/lib/metadatos.ts'
import { formatoDe } from '../src/lib/extract/tipos.ts'
import {
  COLUMNAS,
  MIME_DE,
  abrirSesion,
  cargarEnv,
  checksumDe,
  enTandas,
  extraerEnNode,
  familiaDe,
  fechaDelNombre,
  horaDelNombre,
  leerCatalogos,
  limpiarNombre,
  normalizar,
  resolverCatalogo,
  resolverTema,
  rutaDeTema,
  temasEnOrden,
} from './comun-carga.mts'

const MAX_BYTES = 50 * 1024 * 1024 // el mismo tope que `validarArchivo`
const CONCURRENCIA = 4

// ── argumentos ───────────────────────────────────────────────────
// A mano y en una pasada: las banderas con valor consumen el argumento
// siguiente, así que `-o carga.xlsx` no puede confundirse con la carpeta.
const args = process.argv.slice(2)
const banderas = new Map<string, string>()
const sueltos: string[] = []
const uniones: string[] = []
let sinIa = false

for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--sin-ia') sinIa = true
  else if (a === '--unir') uniones.push(args[++i] ?? '')
  else if (a === '-o' || a === '--responsable') banderas.set(a, args[++i] ?? '')
  else if (a.startsWith('-')) {
    console.error(`Bandera desconocida: ${a}`)
    process.exit(1)
  } else sueltos.push(a)
}

const bandera = (nombre: string) => banderas.get(nombre) || undefined
const carpeta = sueltos[0]

if (!carpeta || sueltos.length > 1) {
  console.error(
      "Uso: npx tsx scripts/preparar-carga.mts <carpeta> [-o salida.xlsx] [--responsable correo]\n" +
      "                [--sin-ia] [--unir \"familia1 + familia2\"]",
  )
  process.exit(1)
}

const raiz = resolve(carpeta.replace(/^~/, process.env.HOME ?? '~'))
const salida = resolve(bandera('-o') ?? 'carga.xlsx')
const sidecar = salida.replace(/\.xlsx$/i, '') + '.datos.json'

cargarEnv()
if (!sinIa && !process.env.ANTHROPIC_API_KEY) {
  console.error('Falta ANTHROPIC_API_KEY en .env.local. Corre con --sin-ia para una plantilla vacía.')
  process.exit(1)
}

// ── 1. recorrer la carpeta ───────────────────────────────────────
type Rechazo = { archivo: string; motivo: string }

const rechazados: Rechazo[] = []
const aceptados: string[] = []

function recorrer(dir: string): void {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    // Basura del sistema y los bloqueos que Excel deja abiertos: no son
    // documentos y aparecer en la hoja de rechazados solo hace ruido.
    if (entrada.name.startsWith('.') || entrada.name.startsWith('~$')) continue

    const ruta = join(dir, entrada.name)
    if (entrada.isDirectory()) {
      recorrer(ruta)
      continue
    }
    if (!entrada.isFile()) continue

    const rel = relative(raiz, ruta)
    const formato = formatoDe('', entrada.name)
    if (!formato) {
      rechazados.push({
        archivo: rel,
        motivo: 'Formato no aceptado. El acervo solo admite PDF, DOCX, XLSX y PPTX.',
      })
      continue
    }

    const { size } = statSync(ruta)
    if (size === 0) {
      rechazados.push({ archivo: rel, motivo: 'El archivo está vacío.' })
      continue
    }
    if (size > MAX_BYTES) {
      rechazados.push({
        archivo: rel,
        motivo: `Pesa ${(size / 1024 / 1024).toFixed(1)} MB y el tope son 50 MB.`,
      })
      continue
    }
    aceptados.push(rel)
  }
}

console.log(`Recorriendo ${raiz}…`)
recorrer(raiz)
aceptados.sort()
console.log(`  ${aceptados.length} archivo(s) procesables · ${rechazados.length} fuera\n`)

if (aceptados.length === 0) {
  console.error('No hay nada que preparar.')
  process.exit(1)
}

// ── 2. sesión y catálogos ────────────────────────────────────────
const { sb, correo } = await abrirSesion(bandera('--responsable'))
const catalogos = await leerCatalogos(sb)
console.log(`Catálogos leídos como ${correo}: ${catalogos.topics.length} temas, ${catalogos.docTypes.length} tipos\n`)

// ── 3. leer, extraer y proponer ──────────────────────────────────
type Preparado = {
  archivo: string
  filename: string
  mime: string
  size_bytes: number
  checksum: string
  page_count: number | null
  texto: string
  aviso: string
  sugerido: MetadatosSugeridos | null
}

const vistos = new Map<string, string>() // checksum → primer archivo que lo trajo
const preparados: Preparado[] = []
let hechos = 0

const resultados = await enTandas(aceptados, CONCURRENCIA, async (rel) => {
  const buf = readFileSync(join(raiz, rel))
  const nombre = basename(rel)
  const checksum = await checksumDe(buf)
  const extraido = await extraerEnNode(buf, nombre)

  let sugerido: MetadatosSugeridos | null = null
  let avisoIa = ''
  if (!sinIa && extraido.texto) {
    try {
      sugerido = await sugerirMetadatos(extraido.texto, catalogos)
    } catch (error) {
      // El fallo de esta ruta nunca bloquea la carga (§5.1): la fila sale
      // con los campos vacíos y se llena a mano.
      avisoIa = `No hubo sugerencia automática: ${error instanceof Error ? error.message : error}`
    }
  }

  console.log(`  [${++hechos}/${aceptados.length}] ${rel}${extraido.advertencia ? '  ⚠️' : ''}`)

  return {
    archivo: rel,
    filename: nombre,
    mime: MIME_DE[formatoDe('', nombre)!],
    size_bytes: buf.length,
    checksum,
    page_count: extraido.paginas,
    texto: extraido.texto,
    aviso: [extraido.advertencia, avisoIa].filter(Boolean).join(' · '),
    sugerido,
  } satisfies Preparado
})

// Duplicados dentro de la propia carpeta: un acervo recopilado a mano
// siempre trae el mismo archivo en dos lugares. Se queda el primero.
for (const p of resultados) {
  const previo = vistos.get(p.checksum)
  if (previo) {
    rechazados.push({ archivo: p.archivo, motivo: `Duplicado exacto de "${previo}".` })
    continue
  }
  vistos.set(p.checksum, p.archivo)
  preparados.push(p)
}

// Duplicados contra lo que ya está cargado (regla 10).
const yaEnAcervo: Preparado[] = []
const nuevos: Preparado[] = []
for (const p of preparados) {
  const { data } = await sb.rpc('find_by_checksum', { p_checksum: p.checksum })
  if (data?.length) {
    rechazados.push({
      archivo: p.archivo,
      motivo: `Ya está en el acervo como "${data[0].document_title}" v${data[0].version_no}.`,
    })
    yaEnAcervo.push(p)
  } else {
    nuevos.push(p)
  }
}

// ── 4. deducir lo que se puede sin gastar API ────────────────────
/**
 * Lo que la carpeta y el nombre del archivo ya dicen.
 *
 * La persona que recopila no programa: su aporte es poner cada archivo en
 * la subcarpeta que le toca. Eso es una clasificación hecha a mano, y
 * tirarla para que luego alguien reescriba el mismo tema en el Excel sería
 * absurdo. Se lee de la ruta y se rellena.
 *
 * Nada de esto adivina: solo traduce lo que ya está escrito. Si la carpeta
 * no coincide con ningún tema del catálogo, la celda se queda vacía —
 * preferible a un tema plausible que nadie va a revisar.
 */
function deducir(rel: string) {
  const partes = rel.split('/')
  const nombre = partes.pop()!

  // El segmento más profundo que resuelva gana: "Salud y servicios/Camas"
  // debe quedar en Camas, no en su padre.
  let tema = ''
  let tipo = ''
  for (const segmento of partes) {
    if (resolverTema(catalogos, segmento)) tema = segmento
    // Una carpeta también puede nombrar un tipo documental ("Informes").
    const comoTipo = resolverCatalogo(catalogos.docTypes, segmento)
    if (comoTipo) tipo = catalogos.docTypes.find((t) => t.id === comoTipo)!.name
  }

  // Por extensión solo donde no hay duda. Un PDF o un Word pueden ser
  // cualquier cosa, y ahí es mejor dejar que lo diga una persona.
  if (!tipo) {
    const ext = nombre.toLowerCase().split('.').pop()
    if (ext === 'pptx') tipo = 'Presentación'
    else if (ext === 'xlsx') tipo = 'Base de datos'
  }

  // La misma limpieza que agrupa las familias: si el título se limpiara con
  // otras reglas, un archivo podría agruparse por un nombre y titularse con
  // otro, y al revisar no se entendería de dónde salió cada cosa.
  const limpio = limpiarNombre(nombre)
  const titulo = limpio ? limpio[0].toUpperCase() + limpio.slice(1) : ''

  return { tema, tipo, titulo }
}

/** Un año del contenido, si el nombre o el principio del texto lo dicen. */
function deducirAnio(rel: string, texto: string): string {
  const tope = new Date().getFullYear() + 1
  const candidatos: number[] = []
  for (const m of `${rel}\n${texto.slice(0, 3000)}`.matchAll(/\b(19[89]\d|20[0-4]\d)\b/g)) {
    const n = Number(m[1])
    if (n >= 1980 && n <= tope) candidatos.push(n)
  }
  // El más reciente: una serie histórica se cataloga por donde termina.
  return candidatos.length ? String(Math.max(...candidatos)) : ''
}

// ── 5. agrupar en familias de versiones ──────────────────────────
/**
 * Cada familia es un documento; sus archivos son sus versiones.
 *
 * Se agrupa por nombre-de-familia **y extensión**: un `.xlsx` y un `.pptx`
 * que se llaman parecido no son versiones uno del otro, son el concentrado
 * y la presentación que salió de él.
 *
 * El orden es el que el nombre declara —fecha, luego hora, luego el propio
 * nombre— y no la fecha del sistema de archivos, que al copiar una carpeta
 * queda igual para todos y no dice nada del orden real.
 */
const familias = new Map<string, Preparado[]>()
for (const p of nuevos) {
  const clave = `${familiaDe(p.filename)}|${formatoDe('', p.filename)}`
  familias.set(clave, [...(familias.get(clave) ?? []), p])
}

/**
 * Fusiones pedidas a mano con `--unir`.
 *
 * El detector automático se equivoca separando de más a propósito, y hay
 * casos que solo una persona puede resolver: dos hilos de trabajo sobre el
 * mismo concentrado, renombrado a medio camino, se ven como dos familias
 * aunque sean un solo documento. En vez de aflojar la regla general —lo que
 * fundiría documentos distintos en todo el acervo— la excepción se declara
 * aquí, para esta carpeta y por escrito.
 *
 *   --unir "data issste|xlsx + data issste concentrado con verificacion|xlsx"
 */
for (const instruccion of uniones) {
  const partes = instruccion.split('+').map((s) => s.trim()).filter(Boolean)
  const claves = partes.map((p) => (p.includes('|') ? p : `${normalizar(p)}|xlsx`))
  const faltan = claves.filter((c) => !familias.has(c))
  if (faltan.length) {
    console.error(`\n--unir: no existe la familia ${faltan.join(' ni ')}`)
    console.error('Familias detectadas:')
    for (const c of [...familias.keys()].sort()) console.error(`   ${c}`)
    process.exit(1)
  }
  const destino = claves[0]
  for (const otra of claves.slice(1)) {
    familias.set(destino, [...familias.get(destino)!, ...familias.get(otra)!])
    familias.delete(otra)
  }
  console.log(`Unidas en un documento: ${claves.join(' + ')}`)
}

// El desempate compara la raíz del nombre con `<` y no con localeCompare:
// la comparación con idioma ignora la puntuación en su nivel primario, así
// que "Data ISSSTE 23072026_3" le ganaba a "Data ISSSTE 23072026" —el `_3`
// pesaba menos que el `.xlsx`— y la copia quedaba antes del original.
const raizDe = (nombre: string) => nombre.replace(/\.[^.]+$/, '')
for (const lista of familias.values()) {
  lista.sort((a, b) => {
    const porFecha =
      (fechaDelNombre(a.filename) ?? 0) - (fechaDelNombre(b.filename) ?? 0) ||
      horaDelNombre(a.filename) - horaDelNombre(b.filename)
    if (porFecha !== 0) return porFecha
    const ra = raizDe(a.filename)
    const rb = raizDe(b.filename)
    return ra < rb ? -1 : ra > rb ? 1 : 0
  })
}

/**
 * Archivo → a qué documento pertenece y qué número de versión le toca.
 *
 * La etiqueta del documento sale del nombre de la versión **más reciente**:
 * es donde el autor ya lo llamó como quedó. Solo se pone cuando la familia
 * tiene más de un archivo; un documento de una sola versión no necesita
 * agrupador y la columna vacía se lee más fácil.
 */
const enFamilia = new Map<string, { documento: string; version: number }>()
for (const [clave, lista] of familias) {
  if (lista.length < 2) continue
  const etiqueta = deducir(lista[lista.length - 1].archivo).titulo || clave.split('|')[0]
  lista.forEach((p, i) => enFamilia.set(p.archivo, { documento: etiqueta, version: i + 1 }))
}

// ── 6. escribir el Excel ─────────────────────────────────────────
const nombreDe = (lista: { slug: string; name: string }[], slug: string | null) =>
  slug ? (lista.find((x) => x.slug === slug)?.name ?? '') : ''

// La sugerencia de Claude manda cuando existe; lo deducido de la ruta y del
// nombre llena los huecos. Con --sin-ia queda solo lo deducido.
//
// Las filas salen agrupadas: las versiones de un documento, juntas y en
// orden. Los metadatos se escriben una sola vez, en la primera versión —
// describen al documento, no al archivo, y repetirlos en seis filas invita
// a que las seis copias se contradigan.
const enOrden = [...nuevos].sort((a, b) => {
  const fa = enFamilia.get(a.archivo)
  const fb = enFamilia.get(b.archivo)
  const ga = fa?.documento ?? a.archivo
  const gb = fb?.documento ?? b.archivo
  return ga.localeCompare(gb, 'es') || (fa?.version ?? 1) - (fb?.version ?? 1)
})

const filas = enOrden.map((p) => {
  const s = p.sugerido
  const d = deducir(p.archivo)
  const fam = enFamilia.get(p.archivo)
  const esPrimera = !fam || fam.version === 1

  // Una versión posterior solo aporta su archivo. Dejar sus celdas de
  // metadatos vacías no es un hueco por llenar: es lo correcto, y así el
  // cargador sabe que no debe tratarla como documento aparte.
  if (!esPrimera) {
    return [
      p.archivo, fam.documento, fam.version,
      '', '', '', '', '', '', '', '', '', '', '',
      p.aviso, '', '', '',
    ]
  }

  return [
    p.archivo,
    fam?.documento ?? '',
    fam?.version ?? '',
    s?.title ?? d.titulo,
    s?.summary ?? '',
    s?.year ?? deducirAnio(p.archivo, p.texto),
    s?.area ?? '',
    '',
    nombreDe(catalogos.docTypes, s?.doc_type_slug ?? null) || d.tipo,
    nombreDe(catalogos.docUses, s?.doc_use_slug ?? null),
    s?.primary_topic_slug
      ? rutaDeTema(catalogos.topics, catalogos.topics.find((t) => t.slug === s.primary_topic_slug)!.id)
      : d.tema,
    (s?.topic_slugs ?? [])
      .map((slug) => catalogos.topics.find((t) => t.slug === slug))
      .filter(Boolean)
      .map((t) => rutaDeTema(catalogos.topics, t!.id))
      .join('; '),
    (s?.tags ?? []).join('; '),
    correo,
    'publicado',
    p.aviso,
    '',
    '',
    '',
  ]
})

const hojaDocs = XLSX.utils.aoa_to_sheet([[...COLUMNAS], ...filas])
hojaDocs['!cols'] = [
  { wch: 46 }, // archivo
  { wch: 34 }, { wch: 8 }, // documento, version
  { wch: 50 }, { wch: 64 }, { wch: 6 }, { wch: 22 }, { wch: 22 }, // titulo…fuente
  { wch: 18 }, { wch: 24 }, { wch: 34 }, { wch: 34 }, { wch: 28 }, // tipo…etiquetas
  { wch: 28 }, { wch: 11 }, // responsable, estatus
  { wch: 44 }, { wch: 12 }, { wch: 10 }, { wch: 40 }, // aviso, id, estado, nota
]

const hojaRechazos = XLSX.utils.aoa_to_sheet([
  ['archivo', 'motivo'],
  ...rechazados.sort((a, b) => a.archivo.localeCompare(b.archivo)).map((r) => [r.archivo, r.motivo]),
])
hojaRechazos['!cols'] = [{ wch: 60 }, { wch: 80 }]

// Los valores válidos, para copiar y pegar. SheetJS en su edición
// comunitaria no escribe validación de datos, así que no hay desplegables
// de verdad; el control real lo hace `cargar.mts`, que rechaza la fila y
// explica por qué en la columna «nota». Un desplegable habría sido mejor
// para quien llena, pero no a cambio de una dependencia nueva en un
// proyecto que cuida cada una.
const hojaCatalogos = XLSX.utils.aoa_to_sheet([
  ['tipo (columna "tipo")', 'uso (columna "uso")', 'tema (principal y secundarios)', 'estatus'],
  ...Array.from(
    { length: Math.max(catalogos.docTypes.length, catalogos.docUses.length, catalogos.topics.length, 3) },
    (_, i) => [
      catalogos.docTypes[i]?.name ?? '',
      catalogos.docUses[i]?.name ?? '',
      temasEnOrden(catalogos.topics)[i]
        ? rutaDeTema(catalogos.topics, temasEnOrden(catalogos.topics)[i].id)
        : '',
      ['publicado', 'borrador', 'archivado'][i] ?? '',
    ],
  ),
])
hojaCatalogos['!cols'] = [{ wch: 24 }, { wch: 28 }, { wch: 44 }, { wch: 14 }]

const hojaGuia = XLSX.utils.aoa_to_sheet(
  [
    ['Cómo llenar esta plantilla'],
    [],
    ['Las columnas ya vienen propuestas por el sistema a partir del contenido de cada'],
    ['archivo. Tu trabajo es corregir, no redactar desde cero. Revisa fila por fila.'],
    [],
    ['VERSIONES DEL MISMO DOCUMENTO'],
    ['  Cuando varios archivos son el mismo documento guardado varias veces, el'],
    ['  sistema los detecta y los agrupa. Se reconoce así:'],
    [],
    ['    documento   El nombre del grupo. Las filas que lo comparten son'],
    ['                versiones de un mismo documento, no documentos distintos.'],
    ['    version     1, 2, 3... El orden en que se guardaron. La última es la'],
    ['                vigente: es la que se ve y se descarga por omisión.'],
    [],
    ['  Los datos (titulo, tema, resumen...) van SOLO en la fila de la version 1,'],
    ['  porque describen al documento, no al archivo. Las demás filas los llevan'],
    ['  vacíos y así deben quedarse.'],
    [],
    ['  Si el sistema agrupó mal:'],
    ['    - Para SEPARAR: borra el contenido de "documento" y "version" de la fila'],
    ['      que sobra, y llénale sus propios datos.'],
    ['    - Para UNIR dos grupos: escribe el mismo texto en "documento" en todas'],
    ['      las filas, y numera "version" de 1 en adelante sin repetir.'],
    [],
    ['  Nada se borra nunca: las versiones anteriores quedan consultables en el'],
    ['  historial del documento.'],
    [],
    ['OBLIGATORIAS — si falta una, la fila no se carga'],
    ['  (solo en la fila de la version 1, cuando hay varias versiones)'],
    ['  titulo           Qué es y de qué. Sin nombre de archivo ni "v12_final".'],
    ['  tipo             Qué ES el documento. Valores en la hoja "catalogos".'],
    ['  tema_principal   De qué HABLA. Regla: si le quitas el formato, ¿de qué habla?'],
    ['  responsable      Correo de quien responde por el contenido. Debe haber'],
    ['                   entrado al menos una vez a la aplicación.'],
    [],
    ['OPCIONALES'],
    ['  resumen            Dos o tres frases para quien decide si abrir el archivo.'],
    ['  anio               El año del CONTENIDO, no el de la subida.'],
    ['  area               El área del ISSSTE que lo produjo, si el texto lo dice.'],
    ['  fuente             De dónde salió el archivo. Se llena a mano.'],
    ['  uso                Para qué SIRVE.'],
    ['  temas_secundarios  Separados por punto y coma. Vacío está bien.'],
    ['  etiquetas          Lo específico que no cabe en un tema. Punto y coma.'],
    ['  estatus            publicado | borrador | archivado. Por omisión, publicado.'],
    [],
    ['NO TOCAR'],
    ['  archivo          Es la llave contra el disco y el archivo .datos.json.'],
    ['  aviso            Lo que el sistema detectó al leer el archivo.'],
    ['  id/estado/nota   Los escribe la carga. "nota" dice por qué falló una fila.'],
    [],
    ['"Capacitación" nunca es un tema: una presentación de capacitación sobre'],
    ['medicamentos es tipo "Presentación", tema "Medicamentos e insumos", uso'],
    ['"Material de capacitación". Con el tema mal, no aparece al buscar medicamentos,'],
    ['que es justo como se busca.'],
  ].map((l) => l),
)
hojaGuia['!cols'] = [{ wch: 88 }]

const libro = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(libro, hojaGuia, 'como llenar')
XLSX.utils.book_append_sheet(libro, hojaDocs, 'documentos')
XLSX.utils.book_append_sheet(libro, hojaRechazos, 'rechazados')
XLSX.utils.book_append_sheet(libro, hojaCatalogos, 'catalogos')
XLSX.writeFile(libro, salida)

writeFileSync(
  sidecar,
  JSON.stringify(
    {
      raiz,
      generado_para: salida,
      documentos: nuevos.map(({ sugerido: _s, aviso: _a, ...tecnico }) => tecnico),
    },
    null,
    2,
  ),
)

// ── 7. resumen ───────────────────────────────────────────────────
const sinTexto = nuevos.filter((p) => !p.texto).length
const sinSugerencia = nuevos.filter((p) => !p.sugerido).length
const conVersiones = [...familias.values()].filter((l) => l.length > 1)
const documentos = nuevos.length - conVersiones.reduce((n, l) => n + l.length - 1, 0)

console.log(`\n══ ${salida} ══`)
console.log(`  ${documentos} documento(s) en ${nuevos.length} archivo(s)`)
if (conVersiones.length) {
  console.log(`\n  ${conVersiones.length} documento(s) con historial de versiones:`)
  for (const lista of conVersiones.sort((a, b) => b.length - a.length)) {
    const etiqueta = enFamilia.get(lista[0].archivo)!.documento
    console.log(`    ${etiqueta} — ${lista.length} versiones`)
    for (const [i, p] of lista.entries()) {
      const f = fechaDelNombre(p.filename)
      const fecha = f ? `${String(f % 100).padStart(2, '0')}/${String(Math.floor(f / 100) % 100).padStart(2, '0')}` : '  —  '
      console.log(`       v${i + 1}  ${fecha}  ${p.filename.slice(0, 58)}`)
    }
  }
}
console.log(`\n  ${rechazados.length} archivo(s) en la hoja "rechazados"`)
if (yaEnAcervo.length) console.log(`     de esos, ${yaEnAcervo.length} ya estaban cargados`)
if (sinTexto) console.log(`  ⚠️  ${sinTexto} sin capa de texto (escaneos): no serán buscables por contenido`)
if (sinSugerencia) console.log(`  ⚠️  ${sinSugerencia} sin sugerencia automática: hay que llenarlas a mano`)
console.log(`\n  Datos técnicos en ${basename(sidecar)} — no editar.`)
console.log(`  Cuando esté revisado:  npx tsx scripts/cargar.mts ${basename(salida)}`)

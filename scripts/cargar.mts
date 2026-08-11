/**
 * Segunda mitad de una carga masiva: lee el Excel revisado y da de alta los
 * documentos.
 *
 *   npx tsx scripts/cargar.mts carga.xlsx
 *   npx tsx scripts/cargar.mts carga.xlsx --ensayo    (valida y no escribe)
 *
 * Tres propiedades que importan más que la velocidad:
 *
 * 1. Reanudable. Cada fila que se logra guarda su uuid en la columna «id».
 *    Volver a correr el script salta las filas que ya lo tienen, así que si
 *    truena en la 140 de 300 se corrige y se reintenta sin duplicar nada.
 * 2. Explica. Una fila que no pasa validación deja el motivo en «nota», en
 *    la misma hoja donde está el error. Nadie tiene que leer la terminal.
 * 3. Todo o nada por documento. El alta va por el RPC transaccional, así
 *    que no quedan documentos sin versión (regla 9).
 *
 * Escribe en la base local a propósito. Lo revisado se promueve aparte con
 * scripts/migrar-a-produccion.mts.
 */
import { existsSync, readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import * as XLSX from 'xlsx'
import { firmarSubida, claveDeAlmacen, subirDesdeServidor, validarArchivo } from '../src/lib/almacen.ts'
import {
  COLUMNAS,
  abrirSesion,
  cargarEnv,
  checksumDe,
  exigirLocal,
  extraerEnNode,
  leerCatalogos,
  mapaDeResponsables,
  partirLista,
  resolverCatalogo,
  resolverTema,
  type Fila,
} from './comun-carga.mts'

const HOJA = 'documentos'

// ── argumentos ───────────────────────────────────────────────────
const args = process.argv.slice(2)
const ensayo = args.includes('--ensayo')
const sueltos = args.filter((a) => !a.startsWith('-'))

if (sueltos.length !== 1) {
  console.error('Uso: npx tsx scripts/cargar.mts <carga.xlsx> [--ensayo]')
  process.exit(1)
}

const rutaXlsx = resolve(sueltos[0])
const rutaSidecar = rutaXlsx.replace(/\.xlsx$/i, '') + '.datos.json'

cargarEnv()
exigirLocal()

if (!existsSync(rutaSidecar)) {
  console.error(
    `Falta ${basename(rutaSidecar)}, que trae el texto extraído y los checksums.\n` +
      'Lo escribe preparar-carga.mts junto al Excel; los dos viajan juntos.',
  )
  process.exit(1)
}

// ── leer plantilla y datos técnicos ──────────────────────────────
const libro = XLSX.readFile(rutaXlsx)
if (!libro.Sheets[HOJA]) {
  console.error(`El libro no tiene una hoja "${HOJA}".`)
  process.exit(1)
}

const filas = XLSX.utils.sheet_to_json<Fila>(libro.Sheets[HOJA], { defval: '', raw: false })
const sidecar = JSON.parse(readFileSync(rutaSidecar, 'utf8')) as {
  raiz: string
  documentos: {
    archivo: string
    filename: string
    mime: string
    size_bytes: number
    checksum: string
    page_count: number | null
    texto: string
  }[]
}
const tecnicoDe = new Map(sidecar.documentos.map((d) => [d.archivo, d]))

console.log(`${filas.length} fila(s) en ${basename(rutaXlsx)}`)
console.log(`Archivos en ${sidecar.raiz}\n`)

// ── sesión, catálogos, responsables ──────────────────────────────
const { sb, usuarioId, correo } = await abrirSesion()
const catalogos = await leerCatalogos(sb)
const responsables = await mapaDeResponsables(sb)

const { data: perfil } = await sb.from('profiles').select('role').eq('id', usuarioId).single()
if (perfil?.role !== 'admin' && perfil?.role !== 'cargador') {
  console.error(`${correo} tiene rol "${perfil?.role}" y no puede subir. RLS va a rechazar todo.`)
  process.exit(1)
}
console.log(`Sesión como ${correo} (${perfil.role})${ensayo ? ' · ENSAYO, no se escribe nada' : ''}\n`)

// ── validación de una fila ───────────────────────────────────────
type Resuelta = {
  documento: Record<string, unknown>
  topic_ids: number[]
  tags: string[]
}

function validar(fila: Fila): { ok: true; datos: Resuelta } | { ok: false; motivo: string } {
  const problemas: string[] = []

  const titulo = (fila.titulo ?? '').trim()
  if (!titulo) problemas.push('falta "titulo"')

  const tipoId = resolverCatalogo(catalogos.docTypes, fila.tipo ?? '')
  if (!tipoId) problemas.push(fila.tipo ? `"tipo" no existe: ${fila.tipo}` : 'falta "tipo"')

  const temaId = resolverTema(catalogos, fila.tema_principal ?? '')
  if (!temaId) {
    problemas.push(
      fila.tema_principal
        ? `"tema_principal" no existe: ${fila.tema_principal}`
        : 'falta "tema_principal"',
    )
  }

  const correoResp = (fila.responsable ?? '').trim().toLowerCase()
  const resp = responsables.get(correoResp)
  if (!resp) {
    problemas.push(
      correoResp
        ? `"responsable" sin perfil: ${correoResp} (debe haber entrado una vez a la app)`
        : 'falta "responsable"',
    )
  }

  // El uso es opcional, pero escrito y sin resolver es un error, no un
  // hueco: alguien puso algo con intención y se perdería en silencio.
  let usoId: number | null = null
  if ((fila.uso ?? '').trim()) {
    usoId = resolverCatalogo(catalogos.docUses, fila.uso)
    if (!usoId) problemas.push(`"uso" no existe: ${fila.uso}`)
  }

  let anio: number | null = null
  if ((fila.anio ?? '').trim()) {
    const n = Number.parseInt(String(fila.anio).trim(), 10)
    if (!Number.isInteger(n) || n < 1900 || n > new Date().getFullYear() + 1) {
      problemas.push(`"anio" fuera de rango: ${fila.anio}`)
    } else anio = n
  }

  const estatus = ((fila.estatus ?? '').trim() || 'publicado').toLowerCase()
  if (!['publicado', 'borrador', 'archivado'].includes(estatus)) {
    problemas.push(`"estatus" inválido: ${fila.estatus}`)
  }

  const secundarios: number[] = []
  for (const valor of partirLista(fila.temas_secundarios ?? '')) {
    const id = resolverTema(catalogos, valor)
    if (!id) problemas.push(`tema secundario no existe: ${valor}`)
    else if (id !== temaId) secundarios.push(id)
  }

  if (problemas.length) return { ok: false, motivo: problemas.join(' · ') }

  return {
    ok: true,
    datos: {
      documento: {
        title: titulo,
        summary: (fila.resumen ?? '').trim() || null,
        year: anio,
        area: (fila.area ?? '').trim() || null,
        source: (fila.fuente ?? '').trim() || null,
        doc_type_id: tipoId,
        doc_use_id: usoId,
        primary_topic_id: temaId,
        owner_id: resp!.id,
        status: estatus,
      },
      topic_ids: secundarios,
      tags: partirLista(fila.etiquetas ?? '').map((t) => t.toLowerCase()),
    },
  }
}

// ── agrupar por documento ────────────────────────────────────────
/**
 * Las filas que comparten «documento» son versiones de uno solo.
 *
 * El orden lo manda la columna «version» y no el orden de las filas: en
 * Excel, ordenar una hoja por otra columna es un clic, y si el orden de
 * versiones dependiera de la posición, ese clic reescribiría el historial
 * sin que nadie lo note.
 */
type Grupo = { documento: string; filas: { fila: Fila; indice: number }[] }

const grupos: Grupo[] = []
const porDocumento = new Map<string, Grupo>()

for (const [i, fila] of filas.entries()) {
  const clave = (fila.documento ?? '').trim()
  if (!clave) {
    // Sin agrupador es un documento de una sola versión.
    grupos.push({ documento: '', filas: [{ fila, indice: i }] })
    continue
  }
  let grupo = porDocumento.get(clave)
  if (!grupo) {
    grupo = { documento: clave, filas: [] }
    porDocumento.set(clave, grupo)
    grupos.push(grupo)
  }
  grupo.filas.push({ fila, indice: i })
}

for (const grupo of grupos) {
  grupo.filas.sort((a, b) => {
    const va = Number.parseInt((a.fila.version ?? '').trim(), 10)
    const vb = Number.parseInt((b.fila.version ?? '').trim(), 10)
    // Una versión sin número se va al final: es más seguro agregarla como
    // la última que insertarla en medio de un historial que sí está numerado.
    return (Number.isInteger(va) ? va : 1e9) - (Number.isInteger(vb) ? vb : 1e9) || a.indice - b.indice
  })
}

// ── cargar documento por documento ───────────────────────────────
let creados = 0
let versionesAgregadas = 0
let saltados = 0
let fallidos = 0

/** Sube archivo y texto al almacén y devuelve el objeto `version` del RPC. */
async function prepararVersion(
  fila: Fila,
  tecnico: NonNullable<ReturnType<typeof tecnicoDe.get>>,
  notaCambio: string,
): Promise<{ version: Record<string, unknown>; texto: string | null } | { duplicado: string }> {
  // El archivo se relee del disco, no del sidecar: los bytes nunca se
  // guardan en JSON y así el checksum se verifica contra lo que hay
  // ahora. Si alguien reemplazó el archivo después de preparar, se ve.
  const buf = readFileSync(join(sidecar.raiz, fila.archivo))

  const problema = validarArchivo(tecnico.mime, buf.length)
  if (problema) throw new Error(problema)

  const checksum = await checksumDe(buf)
  let texto = tecnico.texto
  let paginas = tecnico.page_count

  if (checksum !== tecnico.checksum) {
    // Cambió en el disco desde que se preparó la plantilla: se vuelve a
    // extraer para que el índice corresponda a los bytes que se suben.
    const extraido = await extraerEnNode(buf, tecnico.filename)
    texto = extraido.texto
    paginas = extraido.paginas
    console.log(`     ↻ ${fila.archivo} cambió en el disco; texto reextraído`)
  }

  // Duplicado contra el acervo, otra vez y no solo al preparar: entre
  // preparar y cargar pudo entrar el mismo archivo por la aplicación.
  const { data: dups } = await sb.rpc('find_by_checksum', { p_checksum: checksum })
  if (dups?.length) {
    return { duplicado: `Ya está como "${dups[0].document_title}" v${dups[0].version_no}.` }
  }

  const uuid = crypto.randomUUID()
  const storageKey = claveDeAlmacen(uuid, tecnico.filename)
  const { url } = await firmarSubida(storageKey)
  const puesto = await fetch(url, {
    method: 'PUT',
    body: new Uint8Array(buf),
    headers: { 'content-type': tecnico.mime },
  })
  if (!puesto.ok) throw new Error(`PUT del archivo: ${puesto.status} ${await puesto.text()}`)

  let textKey: string | null = null
  if (texto) {
    textKey = `text/${uuid}.txt`
    await subirDesdeServidor(textKey, texto, 'text/plain; charset=utf-8')
  }

  return {
    version: {
      storage_key: storageKey,
      text_key: textKey,
      filename: tecnico.filename,
      mime: tecnico.mime,
      size_bytes: buf.length,
      checksum,
      page_count: paginas,
      upload_status: 'confirmada',
      change_note: notaCambio,
    },
    texto: texto || null,
  }
}

for (const grupo of grupos) {
  const primera = grupo.filas[0]
  const fila = primera.fila
  const i = primera.indice
  const etiqueta = `[${i + 2}] ${fila.archivo}` // +2: encabezado y base 1 de Excel

  // Un documento ya creado en una corrida anterior no se vuelve a crear,
  // pero sus versiones sí se revisan: si la v3 falló la vez pasada, este es
  // el momento de reintentarla. Saltar el grupo entero por tener `id` en la
  // primera fila dejaría ese hueco cerrado para siempre.
  const documentoId = (fila.id ?? '').trim()
  const porHacer = grupo.filas.slice(1).filter(({ fila: f }) => !(f.id ?? '').trim())

  if (documentoId && porHacer.length === 0) {
    saltados += grupo.filas.length
    continue
  }

  const tecnico = tecnicoDe.get(fila.archivo)
  if (!tecnico) {
    fila.estado = 'error'
    fila.nota = 'No está en el .datos.json. ¿Se cambió la columna "archivo"?'
    fallidos++
    console.log(`  ❌ ${etiqueta}\n       ${fila.nota}`)
    continue
  }

  // La validación de metadatos solo aplica al crear: un documento que ya
  // existe no se revalida, porque sus datos ya están en la base y la fila
  // de una versión posterior los lleva vacíos a propósito.
  const revisada = documentoId ? null : validar(fila)
  if (revisada && !revisada.ok) {
    fila.estado = 'revisar'
    fila.nota = revisada.motivo
    fallidos++
    console.log(`  ⚠️  ${etiqueta}\n       ${revisada.motivo}`)
    continue
  }

  // Las versiones posteriores deben existir en el sidecar antes de crear
  // nada: si la v3 de un historial no está, es mejor detener el documento
  // entero que dejarlo cargado a medias y que alguien lo crea completo.
  const faltantes = grupo.filas.slice(1).filter((f) => !tecnicoDe.get(f.fila.archivo))
  if (faltantes.length) {
    fila.estado = 'error'
    fila.nota = `Faltan en el .datos.json: ${faltantes.map((f) => f.fila.archivo).join(', ')}`
    fallidos++
    console.log(`  ❌ ${etiqueta}\n       ${fila.nota}`)
    continue
  }

  const cuantas = grupo.filas.length
  const sufijo = cuantas > 1 ? `  (${cuantas} versiones)` : ''
  const nota = (n: number) =>
    cuantas > 1
      ? `Versión ${n} de ${cuantas}, carga masiva desde ${basename(rutaXlsx)}`
      : `Carga masiva desde ${basename(rutaXlsx)}`

  if (ensayo) {
    if (!documentoId) {
      fila.estado = 'lista'
      fila.nota = ''
      creados++
    }
    console.log(`  ✅ ${etiqueta}${sufijo}`)
    for (const { fila: f } of porHacer) {
      f.estado = 'lista'
      f.nota = ''
      versionesAgregadas++
      console.log(`       v${f.version || '?'}  ${f.archivo}`)
    }
    continue
  }

  try {
    let id = documentoId

    if (!id) {
      const preparada = await prepararVersion(fila, tecnico, nota(1))
      if ('duplicado' in preparada) {
        fila.estado = 'duplicado'
        fila.nota = preparada.duplicado
        saltados++
        console.log(`  ⏭  ${etiqueta}\n       ${fila.nota}`)
        continue
      }

      const { data: nuevoId, error } = await sb.rpc('create_document_with_version', {
        p_document: revisada!.datos.documento,
        p_version: preparada.version,
        p_topic_ids: revisada!.datos.topic_ids,
        p_tags: revisada!.datos.tags,
        p_text_full: preparada.texto,
      })
      if (error) throw new Error(error.message)

      id = nuevoId as string
      fila.id = id
      fila.estado = 'cargado'
      fila.nota = ''
      creados++
      console.log(`  ✅ ${etiqueta}${sufijo}`)
    } else {
      console.log(`  ↻  ${etiqueta}${sufijo} — ya existe, faltan ${porHacer.length} versión(es)`)
    }

    // Las versiones que faltan, en orden. Cada una pasa a ser la vigente,
    // así que al terminar la vigente es la última del historial (regla 1).
    for (const { fila: f } of porHacer) {
      const t = tecnicoDe.get(f.archivo)!
      // Solo para el mensaje y la nota de cambio: el número real de versión
      // lo asigna `add_version` contando lo que ya hay en la base.
      const n = Number.parseInt((f.version ?? '').trim(), 10) || grupo.filas.findIndex((x) => x.fila === f) + 1
      try {
        const sig = await prepararVersion(f, t, nota(n))
        if ('duplicado' in sig) {
          f.estado = 'duplicado'
          f.nota = sig.duplicado
          saltados++
          console.log(`       ⏭  v${n}  ${f.archivo}\n            ${f.nota}`)
          continue
        }
        const { error: eVer } = await sb.rpc('add_version', {
          p_document_id: id,
          p_version: sig.version,
          p_text_full: sig.texto,
          p_make_current: true,
        })
        if (eVer) throw new Error(eVer.message)

        f.id = id
        f.estado = 'cargado'
        f.nota = ''
        versionesAgregadas++
        console.log(`       ✅ v${n}  ${f.archivo}`)
      } catch (error) {
        // El documento ya existe con sus versiones anteriores; una versión
        // que falla no lo invalida. Se marca solo ella y se puede reintentar.
        f.estado = 'error'
        f.nota = error instanceof Error ? error.message : String(error)
        fallidos++
        console.log(`       ❌ v${n}  ${f.archivo}\n            ${f.nota}`)
      }
    }
  } catch (error) {
    fila.estado = 'error'
    fila.nota = error instanceof Error ? error.message : String(error)
    fallidos++
    console.log(`  ❌ ${etiqueta}\n       ${fila.nota}`)
  }
}

// ── devolver el resultado al Excel ───────────────────────────────
// Se reescribe la hoja completa con el encabezado explícito para que las
// columnas no se reordenen según el primer objeto, y las demás hojas
// —guía, rechazados, catálogos— se conservan tal cual.
const hoja = XLSX.utils.json_to_sheet(filas, { header: [...COLUMNAS] })
hoja['!cols'] = libro.Sheets[HOJA]['!cols']
libro.Sheets[HOJA] = hoja
XLSX.writeFile(libro, rutaXlsx)

const detalle = [
  `${creados} documento(s)`,
  versionesAgregadas ? `${versionesAgregadas} versión(es) adicional(es)` : '',
  `${saltados} saltado(s)`,
  `${fallidos} por revisar`,
].filter(Boolean)
console.log(`\n══ ${detalle.join(' · ')} ══`)
if (fallidos) {
  console.log(`Los motivos quedaron en la columna "nota" de ${basename(rutaXlsx)}.`)
  console.log('Corrige ahí mismo y vuelve a correr: las filas con "id" no se repiten.')
}
if (!ensayo && creados) console.log('Revisa el resultado en la aplicación antes de promover a producción.')
process.exit(fallidos > 0 ? 1 : 0)

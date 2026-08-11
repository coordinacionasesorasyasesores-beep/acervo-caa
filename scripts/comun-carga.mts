/**
 * Lo que comparten `preparar-carga.mts` y `cargar.mts`.
 *
 * Los dos scripts son las dos mitades de una misma carga masiva —uno
 * propone el Excel, el otro lo consume— y necesitan ver los catálogos, los
 * archivos y las sesiones exactamente igual. Cuando la resolución de un
 * tema difiere entre el que escribe la plantilla y el que la lee, el
 * síntoma es una fila que se veía bien y falló al cargar, y eso se
 * diagnostica mal. Mejor una sola definición.
 */
import * as fs from 'node:fs'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import { limpiar, formatoDe, type TextoExtraido, type Formato } from '../src/lib/extract/tipos.ts'
import { extraerXlsx } from '../src/lib/extract/xlsx.ts'
import { extraerPptx } from '../src/lib/extract/pptx.ts'
import { temasEnOrden, rutaDeTema, type Catalogos } from '../src/lib/catalogos.ts'

export { temasEnOrden, rutaDeTema }
export type { Catalogos }

/**
 * SheetJS no toca el disco hasta que se le entrega `fs`.
 *
 * En la build ESM `readFile` y `writeFile` vienen sin enlazar, y el síntoma
 * es un «cannot save file» que parece un problema de permisos y no lo es.
 * En la aplicación nunca aparece porque ahí se lee del navegador, así que
 * este es el único lugar del proyecto que lo necesita.
 */
XLSX.set_fs(fs)

/**
 * Las columnas de la hoja «documentos», en orden.
 *
 * Viven aquí y no en el script que escribe la plantilla porque el que la
 * lee necesita el mismo orden, y una constante importada de un script con
 * código al nivel del módulo ejecutaría ese script al importarla.
 */
export const COLUMNAS = [
  'archivo',
  'documento',
  'version',
  'titulo',
  'resumen',
  'anio',
  'area',
  'fuente',
  'tipo',
  'uso',
  'tema_principal',
  'temas_secundarios',
  'etiquetas',
  'responsable',
  'estatus',
  'aviso',
  'id',
  'estado',
  'nota',
] as const

export type Columna = (typeof COLUMNAS)[number]
export type Fila = Record<Columna, string>

/** El mime que le corresponde a cada formato al subir. */
export const MIME_DE: Record<Formato, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

// ── entorno ──────────────────────────────────────────────────────
export function cargarEnv(): void {
  for (const linea of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = linea.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) process.env[m[1]] = m[2].trim()
  }
}

/**
 * Una carga masiva mal formada deja cientos de documentos que no se pueden
 * borrar (regla 2). Por eso el destino es local y la promoción a producción
 * es un paso aparte y deliberado, no un descuido de configuración.
 */
export function exigirLocal(): void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  if (!url.includes('127.0.0.1') && !url.includes('localhost')) {
    console.error(
      `Este script carga documentos en lote y apunta a ${url}, que no es local.\n` +
        'Revisa el bloque activo de .env.local. Para llevar a producción lo ya\n' +
        'revisado se usa scripts/migrar-a-produccion.mts.',
    )
    process.exit(1)
  }
}

// ── sesión ───────────────────────────────────────────────────────
export type Sesion = { sb: SupabaseClient; usuarioId: string; correo: string }

/**
 * Sesión real de usuario, por el mismo camino que el navegador.
 *
 * No basta la llave de servicio: los RPC de alta son SECURITY INVOKER y en
 * este esquema service_role no tiene permiso de tabla, así que una consulta
 * con ella no falla —devuelve cero filas, que es peor.
 */
export async function abrirSesion(correoPedido?: string): Promise<Sesion> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const servicio = process.env.SUPABASE_SERVICE_ROLE_KEY!

  const admin = createClient(url, servicio, { auth: { persistSession: false } })
  const { data: usuarios, error: eLista } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  })
  if (eLista) throw new Error(`listUsers: ${eLista.message}`)

  const candidatos = usuarios?.users ?? []
  if (candidatos.length === 0) {
    throw new Error('No hay usuarios en esta base: entra una vez por /login o corre el seed.')
  }

  const elegido = correoPedido
    ? candidatos.find((u) => u.email?.toLowerCase() === correoPedido.toLowerCase())
    : candidatos[0]
  if (!elegido?.email) {
    throw new Error(`No existe el usuario ${correoPedido}. Debe haber entrado al menos una vez.`)
  }

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

  return { sb, usuarioId: elegido.id, correo: elegido.email }
}

/**
 * Correo → id de perfil, para la columna «responsable».
 *
 * `profiles` no guarda el correo: vive en `auth.users`, que solo se lee con
 * la llave de servicio por el API de Auth. Se comprueba además que el
 * perfil exista, porque `documents.owner_id` apunta a `profiles` y un
 * usuario de auth sin perfil rompería la FK a medio lote.
 */
export async function mapaDeResponsables(
  sb: SupabaseClient,
): Promise<Map<string, { id: string; nombre: string | null }>> {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const { data: usuarios } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  const { data: perfiles } = await sb.from('profiles').select('id, full_name')

  const conPerfil = new Map((perfiles ?? []).map((p) => [p.id as string, p.full_name as string | null]))
  const mapa = new Map<string, { id: string; nombre: string | null }>()

  for (const u of usuarios?.users ?? []) {
    if (!u.email || !conPerfil.has(u.id)) continue
    mapa.set(u.email.toLowerCase(), { id: u.id, nombre: conPerfil.get(u.id) ?? null })
  }
  return mapa
}

// ── catálogos ────────────────────────────────────────────────────
export async function leerCatalogos(sb: SupabaseClient): Promise<Catalogos> {
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

  if (catalogos.topics.length === 0 || catalogos.docTypes.length === 0) {
    throw new Error('Los catálogos vinieron vacíos. ¿Corrió el seed? ¿La sesión tiene RLS de lectura?')
  }
  return catalogos
}

/**
 * Compara como compara una persona: sin acentos, sin mayúsculas y sin
 * importar los espacios de sobra. Quien llene el Excel va a escribir
 * "presentacion" o "Presentación " y las dos deben resolver.
 */
export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Acepta el slug, el nombre, o la ruta "Padre › Hijo" de los temas. */
export function resolverTema(catalogos: Catalogos, valor: string): number | null {
  const buscado = normalizar(valor)
  if (!buscado) return null

  for (const t of catalogos.topics) {
    if (normalizar(t.slug) === buscado) return t.id
    if (normalizar(t.name) === buscado) return t.id
    if (normalizar(rutaDeTema(catalogos.topics, t.id)) === buscado) return t.id
    // "Salud y servicios > Camas" con el separador que sobrevive a Excel.
    if (normalizar(rutaDeTema(catalogos.topics, t.id).replace('›', '>')) === buscado) return t.id
  }
  return null
}

export function resolverCatalogo(
  lista: { id: number; slug: string; name: string }[],
  valor: string,
): number | null {
  const buscado = normalizar(valor)
  if (!buscado) return null
  const hit = lista.find((x) => normalizar(x.slug) === buscado || normalizar(x.name) === buscado)
  return hit?.id ?? null
}

// ── familias de versiones ────────────────────────────────────────
/**
 * Marcas de versión que la gente pone en el nombre de un archivo.
 *
 * No son parte del título: son el rastro de haber guardado "otra vez, pero
 * mejor". Quitarlas deja el nombre real del documento, y dos nombres reales
 * iguales son dos versiones de lo mismo.
 */
const RUIDO_DE_VERSION = [
  /\b\d{1,2}[. ]?(?:ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[a-z]*[. ]?\d{2,4}\b/gi,
  /\b\d{8}\b/g, // 23072026
  /\b\d{6}\b/g, // 230726. Después del de 8: en "23072026" un DDMMYY leería
  //               "230720", una fecha falsa que dejaría basura en el nombre.
  /\b\d{3,4}\s*[ap]\.?\s?m\.?\b/gi, // "903 am", "1013 am"
  /\bv\d+(\s+\d+)*\b/gi, // v3, v12 1 (era "v12_1")
  /\b(final(es)?|revisad[oa]s?|revision|rev\s?man|rev|definitiv[oa]|copia|copy|ultim[oa]s?|nuev[oa]|old|borrador|bis)\b/gi,
  /\(\s*\d+\s*\)/g, // (1), (2)
]

/**
 * Nombre "de familia" de un archivo: lo que queda al quitarle las marcas de
 * versión, la extensión y los acentos.
 *
 * Dos archivos con la misma familia y la misma extensión son, casi siempre,
 * el mismo documento guardado dos veces. Es una propuesta que una persona
 * revisa en el Excel, no un veredicto: por eso conviene que se equivoque
 * separando de más y no juntando de más — un documento partido en dos se
 * nota al revisar; dos documentos fundidos esconden uno en el historial del
 * otro y nadie lo vuelve a ver.
 *
 * Lo primero es volver los separadores en espacios. El guion bajo es
 * carácter de palabra para una expresión regular, así que `\b` no dispara
 * junto a él y en "verificacion_v12_1" no se reconocería ni la "v12" ni el
 * "_1". Con los nombres que salen de Windows —llenos de guiones bajos— ese
 * detalle era la diferencia entre detectar la familia y no detectarla.
 */
/**
 * El nombre del archivo sin su ruido de versión, conservando acentos y
 * mayúsculas. Sirve tanto para agrupar familias como para proponer un
 * título: son la misma limpieza y tenerla dos veces las haría divergir.
 */
export function limpiarNombre(nombre: string): string {
  let base = nombre.replace(/\.[^.]+$/, '').replace(/[_\-]+/g, ' ')

  // En bucle: quitar "FINAL" puede dejar expuesto un "(1)" que antes no
  // estaba pegado al patrón, y una sola pasada lo dejaría dentro.
  for (let i = 0; i < 4; i++) {
    const antes = base
    for (const patron of RUIDO_DE_VERSION) base = base.replace(patron, ' ')
    // Un número corto y suelto al final es marca de copia ("informe 2"), no
    // parte del nombre. Solo al final: en medio puede ser del documento
    // ("Segundo y tercer nivel gráfica 2 de julio") y ahí no se toca.
    base = base.replace(/\s+\d{1,2}\s*$/, ' ')
    // "am"/"pm" huérfanos de una hora ya borrada, y "man" de "rev-man".
    base = base.replace(/\b(a\.?m\.?|p\.?m\.?|man)\b/gi, ' ')
    if (base === antes) break
  }

  // "Copia de Presupuesto" deja un "de" colgando al perder "Copia".
  return base.replace(/^\s*(de|del|la|el|los|las)\s+/i, ' ').replace(/\s+/g, ' ').trim()
}

export function familiaDe(nombre: string): string {
  return normalizar(limpiarNombre(nombre)) || normalizar(nombre)
}

/**
 * La fecha que el nombre del archivo declara, como número comparable.
 *
 * Las fechas del sistema de archivos no sirven: al copiar la carpeta todas
 * quedan con la fecha de la copia, y en esta carpeta salieron todas iguales.
 * Lo único que conserva el orden real es lo que alguien escribió en el
 * nombre. Devuelve null si no hay fecha, y entonces se ordena por nombre.
 */
export function fechaDelNombre(nombre: string): number | null {
  // Separadores a espacios por lo mismo que en familiaDe: sin esto, en
  // "23072026_3" el `\b` del final no dispara y la fecha no se reconoce.
  nombre = nombre.replace(/[_\-]+/g, ' ')

  // "26.jul.2026"
  const meses: Record<string, number> = {
    ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
    jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12,
  }
  const conMes = nombre.match(
    /\b(\d{1,2})[.\-_ ]?(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[a-z]*[.\-_ ]?(\d{2,4})\b/i,
  )
  if (conMes) {
    const [, d, mes, a] = conMes
    const anio = a.length === 2 ? 2000 + Number(a) : Number(a)
    return anio * 10000 + meses[mes.toLowerCase()] * 100 + Number(d)
  }

  // DDMMYYYY (23072026) y DDMMYY (230726). Se prueba el largo primero: en
  // "23072026" un DDMMYY leería "230720", que es una fecha distinta y falsa.
  let mejor: number | null = null
  for (const m of nombre.matchAll(/\b(\d{8}|\d{6})\b/g)) {
    const s = m[1]
    const d = Number(s.slice(0, 2))
    const mes = Number(s.slice(2, 4))
    const a = s.length === 8 ? Number(s.slice(4)) : 2000 + Number(s.slice(4))
    if (d < 1 || d > 31 || mes < 1 || mes > 12 || a < 2000 || a > 2100) continue
    const valor = a * 10000 + mes * 100 + d
    if (mejor === null || valor > mejor) mejor = valor
  }
  return mejor
}

/** La hora declarada en el nombre ("903 am", "1013 am"), para desempatar. */
export function horaDelNombre(nombre: string): number {
  const m = nombre.replace(/[_\-]+/g, ' ').match(/\b(\d{1,2})(\d{2})\s*([ap])\.?\s?m\.?\b/i)
  if (!m) return 0
  let h = Number(m[1])
  if (m[3].toLowerCase() === 'p' && h !== 12) h += 12
  if (m[3].toLowerCase() === 'a' && h === 12) h = 0
  return h * 60 + Number(m[2])
}

/** "a; b, c" → ["a", "b", "c"]. Coma y punto y coma, porque se usan las dos. */
export function partirLista(valor: string): string[] {
  return valor
    .split(/[;,\n]/)
    .map((x) => x.trim())
    .filter(Boolean)
}

// ── archivos ─────────────────────────────────────────────────────
export async function checksumDe(buf: Buffer): Promise<string> {
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  const hash = await crypto.subtle.digest('SHA-256', ab)
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `sha256:${hex}`
}

/**
 * PDF en Node.
 *
 * `src/lib/extract/pdf.ts` no sirve aquí: usa la build de navegador de
 * pdf.js, que necesita DOMMatrix y truena con «DOMMatrix is not defined»
 * en cuanto se importa desde un script. pdf.js publica la build `legacy`
 * exactamente para esto. Se duplica el criterio de "parece escaneado"
 * porque es la única regla de negocio del extractor y tiene que dar el
 * mismo veredicto en las dos rutas.
 */
async function extraerPdfNode(buf: Buffer): Promise<TextoExtraido> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const tarea = pdfjs.getDocument({
    data: new Uint8Array(buf),
    // Sin eval y sin fuentes de sistema: no se renderiza nada, solo se
    // lee texto, y así un PDF hostil tiene menos superficie que tocar.
    isEvalSupported: false,
    useSystemFonts: false,
  })

  const paginas: string[] = []
  let numPages = 0
  try {
    const doc = await tarea.promise
    numPages = doc.numPages
    for (let i = 1; i <= numPages; i++) {
      const pagina = await doc.getPage(i)
      const contenido = await pagina.getTextContent()
      paginas.push(
        contenido.items.map((it: unknown) => (it && 'str' in (it as object) ? (it as { str: string }).str : '')).join(' '),
      )
      pagina.cleanup()
    }
  } finally {
    await tarea.destroy()
  }

  const texto = limpiar(paginas.join('\n\n'))
  const escaneado = texto.length < numPages * 20

  return {
    texto: escaneado ? '' : texto,
    paginas: numPages,
    advertencia: escaneado
      ? 'Sin capa de texto: parece escaneado. Se puede guardar y descargar, pero no será buscable por contenido hasta que haya OCR.'
      : null,
  }
}

/**
 * Word en Node.
 *
 * `src/lib/extract/docx.ts` llama a mammoth con `arrayBuffer`, que es la
 * opción del build de navegador —el que entra por el campo `browser` del
 * paquete al empaquetar—. En Node se carga el build de Node, que solo
 * entiende `buffer`, y con `arrayBuffer` responde «Could not find file in
 * options»: un error que suena a archivo corrupto y no lo es. La misma
 * trampa que pdf.js, por la misma razón.
 */
async function extraerDocxNode(buf: Buffer): Promise<TextoExtraido> {
  const mammoth = await import('mammoth')
  const { value } = await mammoth.extractRawText({ buffer: buf })
  const texto = limpiar(value)
  return {
    texto,
    paginas: null, // Word no tiene páginas hasta que se pagina al imprimir.
    advertencia: texto ? null : 'El documento no tiene texto que indexar.',
  }
}

/**
 * Extrae el texto de un archivo del disco. Nunca lanza por culpa del
 * contenido: un archivo ilegible se reporta con advertencia y se carga
 * igual con metadatos a mano, que es lo que hace la pantalla de subida.
 */
export async function extraerEnNode(buf: Buffer, nombre: string): Promise<TextoExtraido> {
  const formato = formatoDe('', nombre)
  if (!formato) return { texto: '', paginas: null, advertencia: 'Formato no reconocido.' }

  try {
    if (formato === 'pdf') return await extraerPdfNode(buf)
    if (formato === 'docx') return await extraerDocxNode(buf)

    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
    if (formato === 'pptx') return await extraerPptx(ab)
    return await extraerXlsx(ab)
  } catch (error) {
    return {
      texto: '',
      paginas: null,
      advertencia: `No se pudo leer el contenido: ${
        error instanceof Error ? error.message : String(error)
      }`,
    }
  }
}

/**
 * Corre `tarea` sobre `items` con un tope de concurrencia.
 *
 * Las llamadas a Claude son el cuello de botella de la preparación y en
 * serie una carpeta de 300 archivos tarda una hora. De cuatro en cuatro
 * baja a minutos sin acercarse al límite de tasa de la API.
 */
export async function enTandas<T, R>(
  items: T[],
  limite: number,
  tarea: (item: T, indice: number) => Promise<R>,
): Promise<R[]> {
  const resultados = new Array<R>(items.length)
  let siguiente = 0

  const obrero = async () => {
    while (true) {
      const i = siguiente++
      if (i >= items.length) return
      resultados[i] = await tarea(items[i], i)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, obrero))
  return resultados
}

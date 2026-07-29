/**
 * El estado del buscador vive en la URL, no en React.
 *
 * Es lo que permite mandar por correo "los informes de obra de 2025" como
 * un enlace, que el botón de atrás haga lo que debe, y que la pantalla se
 * renderice en el servidor sin hidratar un árbol de filtros. La consulta es
 * la prioridad tres del proyecto: tiene que responder en segundos y sin
 * pantallas en blanco.
 */

export const POR_PAGINA = 20

export type Orden = 'relevancia' | 'reciente'

export type Filtros = {
  q: string
  temas: number[]
  anios: number[]
  tipos: number[]
  usos: number[]
  areas: string[]
  estatus: string[]
  orden: Orden
  pagina: number
}

export type Resultado = {
  id: string
  title: string
  summary: string | null
  year: number | null
  area: string | null
  status: string
  updated_at: string
  doc_type: string
  doc_use: string | null
  primary_topic: string
  primary_topic_parent: string | null
  owner_name: string | null
  version_no: number | null
  filename: string | null
  mime: string | null
  size_bytes: number | null
  fragmento: string
  fragmento_es_resumen: boolean
  relevancia: number
  total: number
}

export type Faceta = {
  dimension: 'year' | 'type' | 'use' | 'area' | 'status'
  valor: string
  etiqueta: string
  cuantos: number
}

/** Lo que llega en `searchParams`: cada clave, una cadena o varias. */
type Entrada = Record<string, string | string[] | undefined>

function lista(v: string | string[] | undefined): string[] {
  if (!v) return []
  const bruto = Array.isArray(v) ? v : [v]
  return bruto.flatMap((x) => x.split(',')).map((x) => x.trim()).filter(Boolean)
}

const numeros = (v: string | string[] | undefined) =>
  lista(v).map(Number).filter((n) => Number.isFinite(n))

const ESTATUS_VALIDOS = ['publicado', 'archivado', 'borrador']

export function leerFiltros(params: Entrada): Filtros {
  const q = typeof params.q === 'string' ? params.q : ''
  const pagina = Math.max(1, Number(params.pagina) || 1)

  return {
    q: q.trim(),
    temas: numeros(params.tema),
    anios: numeros(params.anio),
    tipos: numeros(params.tipo),
    usos: numeros(params.uso),
    areas: lista(params.area),
    estatus: lista(params.estatus).filter((e) => ESTATUS_VALIDOS.includes(e)),
    // Sin texto que ranquear, "relevancia" no significa nada: todos los
    // documentos empatan en cero y el orden queda al azar del planificador.
    orden: params.orden === 'reciente' || !q.trim() ? 'reciente' : 'relevancia',
    pagina,
  }
}

/** Los parámetros del RPC. Un filtro vacío va como null, no como `{}`. */
export function aParametros(f: Filtros) {
  const oNull = <T,>(a: T[]) => (a.length ? a : null)

  return {
    p_query: f.q || null,
    p_topic_ids: oNull(f.temas),
    p_years: oNull(f.anios),
    p_type_ids: oNull(f.tipos),
    p_use_ids: oNull(f.usos),
    p_areas: oNull(f.areas),
    p_statuses: oNull(f.estatus),
  }
}

/**
 * Construye la URL resultante de tocar un filtro, conservando los demás.
 * Cualquier cambio devuelve a la página 1: quedarse en la 3 de un
 * resultado que ahora tiene una sola página es una pantalla vacía sin
 * explicación.
 */
export function urlCon(f: Filtros, cambios: Partial<Filtros>): string {
  const nuevo = { ...f, ...cambios }
  const p = new URLSearchParams()

  if (nuevo.q) p.set('q', nuevo.q)
  if (nuevo.temas.length) p.set('tema', nuevo.temas.join(','))
  if (nuevo.anios.length) p.set('anio', nuevo.anios.join(','))
  if (nuevo.tipos.length) p.set('tipo', nuevo.tipos.join(','))
  if (nuevo.usos.length) p.set('uso', nuevo.usos.join(','))
  if (nuevo.areas.length) p.set('area', nuevo.areas.join(','))
  if (nuevo.estatus.length) p.set('estatus', nuevo.estatus.join(','))
  if (nuevo.orden === 'relevancia' && nuevo.q) p.set('orden', 'relevancia')
  if (cambios.pagina && cambios.pagina > 1) p.set('pagina', String(cambios.pagina))

  const query = p.toString()
  return query ? `/?${query}` : '/'
}

/** Alterna un valor dentro de una faceta: eso es "acumulable". */
export function alternar<T>(actuales: T[], valor: T): T[] {
  return actuales.includes(valor)
    ? actuales.filter((x) => x !== valor)
    : [...actuales, valor]
}

export function hayFiltros(f: Filtros): boolean {
  return Boolean(
    f.q ||
      f.temas.length ||
      f.anios.length ||
      f.tipos.length ||
      f.usos.length ||
      f.areas.length ||
      f.estatus.length,
  )
}

/**
 * Parte el fragmento de `ts_headline` en trozos marcados y sin marcar.
 *
 * Postgres devuelve el resaltado con delimitadores, y la tentación es
 * pedirle `<b>` y volcarlo con `dangerouslySetInnerHTML`. Eso es inyectar
 * en la página el contenido de un archivo que subió un usuario. Se usan
 * «» y se parte en React, que escapa por su cuenta.
 */
export function trozosResaltados(texto: string): { texto: string; marcado: boolean }[] {
  return texto
    .split(/(«[^»]*»)/)
    .filter(Boolean)
    .map((parte) =>
      parte.startsWith('«') && parte.endsWith('»')
        ? { texto: parte.slice(1, -1), marcado: true }
        : { texto: parte, marcado: false },
    )
}

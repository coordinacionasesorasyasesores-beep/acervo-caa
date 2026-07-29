import Anthropic from '@anthropic-ai/sdk'
import type { Catalogos } from '@/lib/catalogos'

/**
 * Metadatos sugeridos por Claude a partir del texto del documento.
 *
 * Es una propuesta, nunca un hecho: el usuario la corrige antes de guardar.
 * Por eso todo campo puede venir en null —es preferible un hueco a un dato
 * inventado, que nadie revisa dos veces— y por eso el fallo de esta ruta no
 * bloquea la subida (§5.1 del documento).
 */

/**
 * La versión se ancla, no se deja en el alias: el alias apunta a otro modelo
 * cuando sale uno nuevo y el comportamiento cambiaría sin que nadie tocara
 * el código. Trampa conocida, §10 del documento.
 */
const MODELO = 'claude-haiku-4-5-20251001'

/**
 * El documento pide "los primeros ~6,000 tokens". Se acota por caracteres
 * para no gastar una llamada extra a `count_tokens` en cada subida: en
 * español son ~4 caracteres por token, así que 24,000 se queda del lado
 * seguro. Un concentrado de 35,000 caracteres entra casi entero.
 */
const MAX_CARACTERES = 24_000

/** La salida es un JSON corto y acotado por el esquema; no necesita más. */
const MAX_TOKENS = 2048

export type MetadatosSugeridos = {
  title: string | null
  summary: string | null
  year: number | null
  area: string | null
  doc_type_slug: string | null
  doc_use_slug: string | null
  primary_topic_slug: string | null
  topic_slugs: string[]
  tags: string[]
}

/**
 * El esquema se arma con los catálogos reales de la base, así que los
 * enums solo admiten valores que existen. Es la diferencia entre validar
 * la respuesta después y hacer que no pueda venir mal.
 */
function esquema(catalogos: Catalogos) {
  const slugsTema = catalogos.topics.map((t) => t.slug)

  const nulable = (tipo: object) => ({ anyOf: [tipo, { type: 'null' }] })

  return {
    type: 'object',
    properties: {
      title: nulable({ type: 'string' }),
      summary: nulable({ type: 'string' }),
      year: nulable({ type: 'integer' }),
      area: nulable({ type: 'string' }),
      doc_type_slug: nulable({
        type: 'string',
        enum: catalogos.docTypes.map((t) => t.slug),
      }),
      doc_use_slug: nulable({
        type: 'string',
        enum: catalogos.docUses.map((u) => u.slug),
      }),
      primary_topic_slug: nulable({ type: 'string', enum: slugsTema }),
      topic_slugs: {
        type: 'array',
        items: { type: 'string', enum: slugsTema },
      },
      tags: { type: 'array', items: { type: 'string' } },
    },
    required: [
      'title',
      'summary',
      'year',
      'area',
      'doc_type_slug',
      'doc_use_slug',
      'primary_topic_slug',
      'topic_slugs',
      'tags',
    ],
    additionalProperties: false,
  }
}

/**
 * El prompt lleva los catálogos completos porque los tres ejes solo se
 * distinguen viendo las opciones juntas: la regla de arbitraje del
 * documento —"si le quito el formato, ¿de qué habla?"— no se puede aplicar
 * sin tener enfrente qué es tema y qué es uso.
 */
function instrucciones(catalogos: Catalogos, anioActual: number): string {
  const temas = catalogos.topics
    .filter((t) => t.parent_id === null)
    .map((padre) => {
      const hijos = catalogos.topics.filter((h) => h.parent_id === padre.id)
      const lista = hijos.map((h) => `    ${h.slug} — ${h.name}`).join('\n')
      return `  ${padre.slug} — ${padre.name}${lista ? `\n${lista}` : ''}`
    })
    .join('\n')

  const lista = (c: { slug: string; name: string }[]) =>
    c.map((x) => `  ${x.slug} — ${x.name}`).join('\n')

  return `Eres el catalogador del repositorio documental de la Coordinación de Asesoras y Asesores (CAA) del ISSSTE. Recibes el texto extraído de un documento y propones sus metadatos.

Tu propuesta la revisa una persona antes de guardarse. Eso cambia lo que conviene hacer: un campo en null lo llena en cinco segundos, un dato plausible pero falso se queda en el sistema para siempre porque nadie lo vuelve a mirar. Cuando el texto no lo diga, responde null.

## Los tres ejes de clasificación

Son independientes y responden preguntas distintas. No los confundas.

- Tipo documental — ¿qué ES el documento?
- Tema — ¿de qué HABLA? Regla de arbitraje: si le quitas el formato, ¿de qué habla? Eso es el tema.
- Uso — ¿para qué SIRVE?

"Capacitación" nunca es un tema. Una presentación de capacitación sobre medicamentos es tipo "presentación", tema "medicamentos", uso "material de capacitación". Si la clasificaras con tema "capacitación", no aparecería al buscar medicamentos, que es justo como se busca.

## Tipos documentales
${lista(catalogos.docTypes)}

## Usos
${lista(catalogos.docUses)}

## Temas (dos niveles: el segundo indentado bajo su padre)
${temas}

## Cada campo

- title — un título descriptivo en español, en el registro de un oficio: qué es y de qué. Sin el nombre del archivo, sin extensiones, sin "v12_final". Si el documento trae un título propio, úsalo.
- summary — dos o tres frases sobre qué contiene y para qué sirve. Escríbelo para alguien que decide si abrir el archivo, no para lucirte: qué datos trae, de qué periodo, de dónde salen. Si el texto no alcanza para decir algo con contenido, null.
- year — el año al que se refiere el contenido, no la fecha en que se subió. Entre 1980 y ${anioActual + 1}. Si el documento cubre una serie histórica, el año más reciente que reporta. Si no lo dice, null.
- area — el área o dirección del ISSSTE que lo produjo, tal como aparezca en el texto. Si no aparece, null. No la deduzcas del tema.
- doc_type_slug — uno solo, de la lista.
- doc_use_slug — uno solo, o null si ninguno encaja de verdad.
- primary_topic_slug — el tema que define de qué trata. Prefiere el nivel específico (el hijo) cuando el texto lo justifique; si solo alcanza para el general, usa el padre.
- topic_slugs — los temas secundarios, sin repetir el principal. Un concentrado puede tocar salud, obra y presupuesto a la vez; un documento de un solo asunto lleva la lista vacía. No la rellenes por rellenar.
- tags — de cero a seis etiquetas en minúsculas: lo específico que no cabe en un tema (un programa con nombre propio, una unidad médica, un instrumento). Nada que ya diga el tipo, el tema o el uso.

Si el texto viene truncado, incompleto o es ilegible, propón solo lo que puedas sostener y deja el resto en null.`
}

/**
 * El texto largo va al final del turno del usuario y las instrucciones al
 * principio: es el orden que permitiría cachear el prefijo. Hoy no cachea
 * —el mínimo de Haiku 4.5 son 4,096 tokens y los catálogos no llegan— pero
 * el orden correcto no cuesta nada y el día que crezcan, cachea solo.
 */
export async function sugerirMetadatos(
  texto: string,
  catalogos: Catalogos,
): Promise<MetadatosSugeridos> {
  const cliente = new Anthropic()
  const recortado = texto.slice(0, MAX_CARACTERES)

  const respuesta = await cliente.messages.create({
    model: MODELO,
    max_tokens: MAX_TOKENS,
    system: instrucciones(catalogos, new Date().getFullYear()),
    output_config: { format: { type: 'json_schema', schema: esquema(catalogos) } },
    messages: [
      {
        role: 'user',
        content: `Texto extraído del documento${
          texto.length > MAX_CARACTERES
            ? ' (truncado: es el principio de un archivo más largo)'
            : ''
        }:\n\n${recortado}`,
      },
    ],
  })

  // Un rechazo por seguridad o un corte por tope de tokens no producen el
  // JSON del esquema. Se trata como "no hay sugerencia", que es un estado
  // que la interfaz ya sabe manejar.
  if (respuesta.stop_reason === 'refusal') {
    throw new Error('El modelo declinó procesar este documento.')
  }
  if (respuesta.stop_reason === 'max_tokens') {
    throw new Error('La respuesta del modelo se cortó antes de terminar.')
  }

  const bloque = respuesta.content.find((b) => b.type === 'text')
  if (!bloque || bloque.type !== 'text') {
    throw new Error('El modelo no devolvió contenido.')
  }

  return JSON.parse(bloque.text) as MetadatosSugeridos
}

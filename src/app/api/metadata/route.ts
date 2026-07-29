import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sugerirMetadatos } from '@/lib/metadatos'
import type { Catalogos } from '@/lib/catalogos'

/**
 * Propone los metadatos de un documento a partir de su texto.
 *
 * Vive en el servidor por la llave de la API, que no puede viajar al
 * navegador, y porque los catálogos se leen aquí: el esquema de la
 * respuesta se arma con ellos, así que el modelo no puede devolver un tema
 * que no exista.
 *
 * Esta ruta puede fallar sin consecuencias. Si el modelo no responde, el
 * usuario llena los campos a mano y guarda igual —§5.1 del documento—, así
 * que los errores se devuelven con 200 y una explicación en lugar de
 * romper el flujo de subida.
 */

/** El texto de un concentrado de 50 MB pasa de lo que cabe en un body. */
const MAX_TEXTO = 200_000

export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Sin sesión.' }, { status: 401 })
  }

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!perfil || !['cargador', 'admin'].includes(perfil.role)) {
    return NextResponse.json(
      { error: 'Tu rol no permite subir documentos.' },
      { status: 403 },
    )
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      sugerencia: null,
      aviso: 'Los metadatos automáticos no están configurados. Llena los campos a mano.',
    })
  }

  let cuerpo: { texto?: string }
  try {
    cuerpo = await request.json()
  } catch {
    return NextResponse.json({ error: 'Petición mal formada.' }, { status: 400 })
  }

  const texto = (cuerpo.texto ?? '').trim()
  if (texto.length < 200) {
    return NextResponse.json({
      sugerencia: null,
      aviso: 'El documento no tiene texto suficiente para proponer datos.',
    })
  }

  const [topics, docTypes, docUses] = await Promise.all([
    supabase.from('topics').select('*').order('position'),
    supabase.from('doc_types').select('id, slug, name').order('position'),
    supabase.from('doc_uses').select('id, slug, name').order('position'),
  ])

  const catalogos: Catalogos = {
    topics: topics.data ?? [],
    docTypes: docTypes.data ?? [],
    docUses: docUses.data ?? [],
    personas: [],
  }

  if (catalogos.topics.length === 0 || catalogos.docTypes.length === 0) {
    return NextResponse.json({
      sugerencia: null,
      aviso: 'No se pudieron leer los catálogos. Llena los campos a mano.',
    })
  }

  try {
    const s = await sugerirMetadatos(texto.slice(0, MAX_TEXTO), catalogos)

    // Los slugs se traducen a ids aquí y no en el navegador: el cliente ya
    // tiene los catálogos, pero la traducción es parte de confiar en la
    // respuesta, y eso se hace del lado que la pidió.
    const idDe = (lista: { id: number; slug: string }[], slug: string | null) =>
      (slug && lista.find((x) => x.slug === slug)?.id) || null

    const temaPrincipal = idDe(catalogos.topics, s.primary_topic_slug)

    return NextResponse.json({
      sugerencia: {
        title: s.title?.trim() || null,
        summary: s.summary?.trim() || null,
        year: añoRazonable(s.year),
        area: s.area?.trim() || null,
        doc_type_id: idDe(catalogos.docTypes, s.doc_type_slug),
        doc_use_id: idDe(catalogos.docUses, s.doc_use_slug),
        primary_topic_id: temaPrincipal,
        topic_ids: (s.topic_slugs ?? [])
          .map((slug) => idDe(catalogos.topics, slug))
          .filter((id): id is number => id !== null && id !== temaPrincipal),
        tags: (s.tags ?? [])
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 6),
      },
      aviso: null,
    })
  } catch (e) {
    console.error('[metadata]', e)
    return NextResponse.json({
      sugerencia: null,
      aviso: 'No se pudieron proponer los datos. Llénalos a mano y guarda normal.',
    })
  }
}

/** El formulario acota el año; una sugerencia fuera de rango se descarta. */
function añoRazonable(año: number | null): number | null {
  if (año === null) return null
  const tope = new Date().getFullYear() + 1
  return año >= 1980 && año <= tope ? año : null
}

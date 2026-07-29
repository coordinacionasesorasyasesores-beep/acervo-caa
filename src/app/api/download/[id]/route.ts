import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { firmarDescarga } from '@/lib/almacen'

/**
 * Entrega una URL firmada de vida corta para una versión concreta.
 *
 * Los archivos del almacén no son públicos: sin esta ruta no hay forma de
 * llegar a ellos. Aquí se verifica la sesión, se comprueba que RLS deje ver
 * el documento —la consulta se hace con la sesión del usuario, así que un
 * lector no puede descargar el borrador ajeno aunque adivine el id— y se
 * registra el acceso antes de entregar nada.
 *
 * Dos modos:
 *   GET /api/download/<version_id>            → 302 a la URL firmada
 *   GET /api/download/<version_id>?preview=1  → JSON con la URL
 *
 * El segundo existe porque los previsualizadores corren en el navegador y
 * necesitan los bytes en JavaScript, no una navegación.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Sin sesión.' }, { status: 401 })
  }

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Identificador inválido.' }, { status: 400 })
  }

  const esPreview = new URL(request.url).searchParams.get('preview') === '1'
  const conTexto = new URL(request.url).searchParams.get('texto') === '1'

  // Sin join a documents: la política `versions_select` ya exige que el
  // documento sea visible, y RLS se aplica también dentro de la subconsulta
  // de la política. Repetir la comprobación aquí obligaría a nombrar la
  // llave foránea —hay dos entre las dos tablas— y duplicaría en el código
  // una regla que ya vive en la base, que es donde tiene que estar.
  const { data: version } = await supabase
    .from('versions')
    .select('id, document_id, storage_key, text_key, filename, mime')
    .eq('id', id)
    .single()

  if (!version) {
    return NextResponse.json({ error: 'No existe o no tienes acceso.' }, { status: 404 })
  }

  const clave = conTexto ? version.text_key : version.storage_key
  if (!clave) {
    return NextResponse.json(
      { error: conTexto ? 'Esta versión no tiene texto extraído.' : 'Sin archivo.' },
      { status: 404 },
    )
  }

  // Se registra antes de firmar. Si el registro fallara después de entregar
  // la URL, la bitácora tendría huecos justo en los accesos que importan.
  const { error: eBitacora } = await supabase.from('access_log').insert({
    user_id: user.id,
    document_id: version.document_id,
    version_id: version.id,
    action: esPreview || conTexto ? 'preview' : 'descarga',
  })
  if (eBitacora) console.error('[download] bitácora:', eBitacora)

  try {
    // Vida corta a propósito: la URL firmada es una llave, y una llave que
    // circula por el historial del navegador conviene que caduque pronto.
    const url = await firmarDescarga(
      clave,
      120,
      esPreview || conTexto ? undefined : (version.filename ?? undefined),
    )

    return esPreview || conTexto
      ? NextResponse.json({ url, mime: version.mime, filename: version.filename })
      : NextResponse.redirect(url, 302)
  } catch (e) {
    console.error('[download]', e)
    return NextResponse.json(
      { error: 'No se pudo preparar la descarga. Avisa a un administrador.' },
      { status: 500 },
    )
  }
}

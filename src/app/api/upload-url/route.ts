import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { claveDeAlmacen, firmarSubida, validarArchivo } from '@/lib/almacen'

/**
 * Entrega una URL firmada para que el navegador suba el archivo directo
 * al almacén. El archivo nunca pasa por el servidor de la app: con 50 MB
 * por archivo y quince personas subiendo, hacerlo de intermediario sería
 * pagar ancho de banda y tiempo para no ganar nada.
 *
 * Lo que sí se queda aquí son las credenciales y la decisión de quién
 * puede subir.
 */
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

  let cuerpo: {
    filename?: string
    mime?: string
    size?: number
    uuid?: string
    tipo?: 'documento' | 'texto'
  }
  try {
    cuerpo = await request.json()
  } catch {
    return NextResponse.json({ error: 'Petición mal formada.' }, { status: 400 })
  }

  const { filename, mime, size, uuid, tipo = 'documento' } = cuerpo
  if (!uuid || !/^[0-9a-f-]{36}$/i.test(uuid)) {
    return NextResponse.json({ error: 'Identificador inválido.' }, { status: 400 })
  }

  try {
    // El texto extraído es contenido nuestro, no un archivo del usuario:
    // va en su propio prefijo y no pasa por la validación de formatos.
    if (tipo === 'texto') {
      const storageKey = `text/${uuid}.txt`
      const { url } = await firmarSubida(storageKey)
      return NextResponse.json({ url, storageKey })
    }

    if (!filename || !mime || typeof size !== 'number') {
      return NextResponse.json({ error: 'Faltan datos del archivo.' }, { status: 400 })
    }

    // El límite se valida aquí y no solo en el navegador: la URL firmada
    // es una llave, y una llave se pide desde donde sea.
    const problema = validarArchivo(mime, size)
    if (problema) {
      return NextResponse.json({ error: problema }, { status: 400 })
    }

    const storageKey = claveDeAlmacen(uuid, filename)
    const { url } = await firmarSubida(storageKey)
    return NextResponse.json({ url, storageKey })
  } catch (e) {
    console.error('[upload-url]', e)
    return NextResponse.json(
      { error: 'No se pudo preparar la subida. Avisa a un administrador.' },
      { status: 500 },
    )
  }
}

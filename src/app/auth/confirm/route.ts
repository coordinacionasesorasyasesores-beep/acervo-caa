import { type EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Aterrizaje del enlace del correo.
 *
 * Conviven dos caminos a propósito: el código de seis dígitos —que es
 * el que queremos y necesita plantilla propia, y por lo tanto SMTP
 * propio— y el enlace mágico de fábrica, que es lo único que manda el
 * plan gratuito con el correo integrado. Cuando haya SMTP, el enlace
 * sigue funcionando y esta ruta no estorba.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const type = searchParams.get('type') as EmailOtpType | null

  /**
   * Un enlace de recuperación siempre termina en la pantalla de contraseña
   * nueva, aunque no traiga `next`.
   *
   * La plantilla de fábrica de Supabase no lo incluye, y sin esto el
   * enlace dejaba a la persona dentro del acervo pero sin contraseña —
   * entra hoy y mañana vuelve a estar bloqueada, sin entender por qué.
   */
  const destino =
    type === 'recovery'
      ? '/auth/recuperar'
      : (searchParams.get('next') ?? '/')

  // Solo rutas de esta aplicación: un `next` con URL completa convertiría
  // este enlace en un redirector abierto hacia cualquier sitio.
  const next = destino.startsWith('/') && !destino.startsWith('//') ? destino : '/'

  const supabase = await createClient()

  // Flujo PKCE: el correo trae ?code=
  const code = searchParams.get('code')
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`)
    return NextResponse.redirect(`${origin}/login?error=enlace`)
  }

  // Flujo con token_hash, según cómo esté configurada la plantilla.
  const token_hash = searchParams.get('token_hash')
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  }

  return NextResponse.redirect(`${origin}/login?error=enlace`)
}

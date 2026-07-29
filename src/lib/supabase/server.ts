import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Cliente de Supabase para Server Components, Server Actions y rutas.
 * Usa la llave anónima a propósito: las consultas pasan por RLS con la
 * identidad de quien pidió la página, no con permisos de servicio.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Un Server Component no puede escribir cookies. El refresco
            // de sesión ya ocurrió en el middleware, así que se ignora.
          }
        },
      },
    },
  )
}

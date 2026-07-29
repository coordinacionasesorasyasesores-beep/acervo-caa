import 'server-only'
import { createClient as crearCliente } from '@supabase/supabase-js'

/**
 * Cliente con la llave de servicio, para el API de Auth.
 *
 * Se usa **solo** para crear cuentas y cambiar contraseñas: son
 * operaciones que ningún usuario puede hacer con su propia sesión, ni
 * debería. No sirve para leer ni escribir tablas —la llave de servicio no
 * tiene permiso de tabla en este esquema, a propósito (§10)— y así se
 * queda: lo que pasa por RLS debe seguir pasando por RLS.
 *
 * El `import 'server-only'` no es decorativo. Si algún día alguien importa
 * esto desde un componente de cliente, el build falla ahí mismo en vez de
 * mandar la llave de servicio al navegador de quince personas.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !llave) {
    throw new Error(
      'Falta SUPABASE_SERVICE_ROLE_KEY: sin ella no se pueden crear cuentas.',
    )
  }

  return crearCliente(url, llave, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

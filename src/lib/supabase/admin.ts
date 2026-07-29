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
 * La guarda es de navegador, no de "no-Next". Se probó primero con el
 * paquete `server-only`, que falla el build si un componente de cliente lo
 * importa —más estricto— pero también revienta en cualquier script de Node,
 * y las pruebas de humo que corren fuera de Next son justo las que han
 * cazado los bugs de este proyecto. Se prefiere una guarda que distinga el
 * navegador del servidor y deje pasar los scripts.
 */
export function createAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error(
      'createAdminClient() se llamó desde el navegador. La llave de servicio ' +
        'no puede salir del servidor.',
    )
  }

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

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { FormularioContrasena } from './FormularioContrasena'

/**
 * Poner una contraseña nueva después de llegar por el enlace del correo.
 *
 * Llegar aquí ya supone una sesión: `/auth/confirm` canjeó el token antes
 * de redirigir. Por eso la pantalla no pide el correo —sería un dato que
 * no se usa y que invita a pensar que se le puede cambiar la contraseña a
 * cualquiera— y por eso, sin sesión, no enseña el formulario: no hay a
 * quién cambiársela.
 */
export default async function RecuperarPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="flex min-h-screen items-center justify-center bg-bosque px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="titular bg-gradient-to-r from-oro via-oro-claro to-oro bg-clip-text font-serif text-5xl font-normal text-transparent">
            Acervo
          </h1>
          <p className="mt-2 text-sm text-niebla">
            Coordinación de Asesoras y Asesores · ISSSTE
          </p>
        </div>

        <div className="rounded-2xl border border-jade/40 bg-papel p-6 shadow-[0_2px_40px_-12px_rgba(0,0,0,0.6)]">
          {user ? (
            <>
              <h2 className="mb-1 text-sm font-medium">Elige tu contraseña</h2>
              <p className="mb-4 text-xs leading-relaxed text-tinta-suave">
                Para {user.email}. Al guardarla entras directo.
              </p>
              <FormularioContrasena />
            </>
          ) : (
            <>
              <h2 className="mb-1 text-sm font-medium">Este enlace ya no sirve</h2>
              <p className="text-xs leading-relaxed text-tinta-suave">
                Los enlaces de recuperación se usan una sola vez y vencen. Pide
                uno nuevo desde la pantalla de entrada.
              </p>
              <Link
                href="/login"
                className="mt-4 block w-full rounded bg-acento py-2 text-center text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                Volver a la entrada
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

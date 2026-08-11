'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { revisarContrasena } from '@/lib/contrasena'

export type Resultado = { error: string | null }

/**
 * Fija la contraseña de quien llegó por el enlace de recuperación.
 *
 * No recibe ni el correo ni el usuario: `updateUser` actúa sobre la sesión
 * que el enlace ya creó, y esa sesión es la prueba de que quien está aquí
 * abrió el correo. Aceptar un identificador por el formulario convertiría
 * esto en "cámbiale la contraseña a quien yo diga", que es exactamente el
 * agujero que hay que no abrir.
 */
export async function fijarContrasena(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  const password = String(datos.get('password') ?? '')
  const repetida = String(datos.get('password2') ?? '')

  const problema = revisarContrasena(password)
  if (problema) return { error: problema }
  if (password !== repetida) return { error: 'Las dos contraseñas no coinciden.' }

  const supabase = await createClient()

  // Sin sesión no hay a quién cambiarle nada. Pasa cuando el enlace ya se
  // usó, cuando venció, o cuando alguien llega a esta pantalla de frente.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return {
      error: 'El enlace ya se usó o venció. Pide otro desde la pantalla de entrada.',
    }
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    return {
      error: /should be different|same as the old/i.test(error.message)
        ? 'Esa es la contraseña que ya tenías. Escribe una distinta.'
        : error.message,
    }
  }

  // Entra directo: la sesión del enlace ya es válida y pedirle que se
  // identifique otra vez, con la contraseña que acaba de teclear, sobra.
  revalidatePath('/', 'layout')
  redirect('/')
}

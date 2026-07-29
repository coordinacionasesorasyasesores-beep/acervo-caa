'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/**
 * Entrada por correo y contraseña.
 *
 * No es lo que queríamos. El diseño original era código de un solo uso al
 * correo: nada que memorizar, nada que se preste, nada que se filtre. Pero
 * el correo integrado de Supabase solo entrega a miembros del proyecto, y
 * hacer miembro a alguien para que reciba su código le daría acceso al
 * panel de la base — las llaves de la bodega a cambio de una llave de la
 * puerta. Un SMTP propio lo resolvería; este proyecto no tiene presupuesto
 * para abrir otra cuenta.
 *
 * Así que las cuentas las crea un administrador desde /admin/usuarios y
 * entrega la contraseña en persona. Con tres personas es razonable; si el
 * equipo crece, esto se vuelve incómodo y conviene volver al código al
 * correo con un SMTP externo.
 *
 * No hay registro público. Aunque alguien lo intentara contra el API, el
 * trigger sobre `auth.users` aborta el alta de cualquier correo que no
 * esté en `access_list`.
 */
export async function entrar(
  _prev: { error?: string; email?: string },
  formData: FormData,
): Promise<{ error?: string; email?: string }> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')

  if (!email.includes('@') || !password) {
    return { error: 'Escribe tu correo y tu contraseña.', email }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    // El mismo mensaje para "no existe" y para "contraseña incorrecta", a
    // propósito: distinguirlos le diría a cualquiera qué correos tienen
    // cuenta en el repositorio, que es justo lo que la lista de acceso
    // intenta no revelar.
    return {
      error:
        'Correo o contraseña incorrectos. Si es la primera vez, pide a un administrador que te dé de alta.',
      email,
    }
  }

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}

'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
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

/**
 * Pide el correo de recuperación.
 *
 * Cierra el hueco que dejaba la nota de "pídele a un administrador": si
 * quien olvidó la contraseña **es** el administrador, no había a quién
 * pedírsela y la única salida era el panel de Supabase. Con un solo admin,
 * eso es un bloqueo completo del sistema.
 *
 * `redirectTo` apunta a `/auth/confirm`, que valida el token en el
 * servidor y deja la sesión en una cookie. Mandarlo a la raíz devolvería
 * los tokens en el fragmento de la URL —después del `#`— que el servidor
 * no ve nunca, y la sesión no llegaría a existir.
 *
 * Responde lo mismo exista o no la cuenta: contestar distinto revelaría
 * qué correos están dados de alta, que es justo lo que la lista de acceso
 * procura no decir.
 */
export async function pedirRecuperacion(
  _prev: { error?: string; aviso?: string },
  formData: FormData,
): Promise<{ error?: string; aviso?: string }> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!email.includes('@')) return { error: 'Escribe tu correo.' }

  const cabecera = await headers()
  const origen =
    process.env.NEXT_PUBLIC_SITE_URL ??
    `${cabecera.get('x-forwarded-proto') ?? 'http'}://${cabecera.get('host') ?? 'localhost:3000'}`

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origen}/auth/confirm?next=/auth/recuperar`,
  })

  // El fallo se registra pero no se enseña: el mensaje es el mismo pase lo
  // que pase, y el detalle sirve para depurar, no para el visitante.
  if (error) console.error('[recuperacion]', error.message)

  return {
    aviso:
      'Si ese correo tiene cuenta, le llegará un enlace para poner una contraseña nueva. Revisa también el correo no deseado.',
  }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}

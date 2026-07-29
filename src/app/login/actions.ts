'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

/** Origen de la app, para que el enlace del correo sepa a dónde volver. */
async function origen() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

/**
 * Entrada por código al correo. Sin contraseñas: son correos
 * institucionales de un equipo de quince personas y una contraseña más
 * que administrar es una contraseña más que se pierde.
 */
export async function enviarCodigo(
  _prev: { error?: string; enviado?: boolean; email?: string },
  formData: FormData,
): Promise<{ error?: string; enviado?: boolean; email?: string }> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase()

  if (!email || !email.includes('@')) {
    return { error: 'Escribe un correo válido.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${await origen()}/auth/confirm`,
    },
  })

  if (error) {
    // El trigger de la lista de acceso aborta el alta, y Supabase lo
    // devuelve como un 500 genérico. Sin esta traducción el usuario ve
    // "Database error saving new user", que no le dice nada.
    const fueraDeLista =
      error.status === 500 || /database error saving new user/i.test(error.message)

    return {
      error: fueraDeLista
        ? 'Ese correo no está dado de alta en el repositorio. Pide a un administrador del área que te agregue.'
        : error.message,
      email,
    }
  }

  return { enviado: true, email }
}

export async function verificarCodigo(
  _prev: { error?: string; enviado?: boolean; email?: string },
  formData: FormData,
): Promise<{ error?: string; enviado?: boolean; email?: string }> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const token = String(formData.get('token') ?? '').trim()

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })

  if (error) return { error: 'El código no es correcto o ya venció.', enviado: true, email }

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}

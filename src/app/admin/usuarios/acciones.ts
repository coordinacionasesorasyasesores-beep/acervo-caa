'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/**
 * Gestión de quién entra y con qué rol.
 *
 * Son dos cosas distintas y conviene no confundirlas:
 *
 * - `access_list` decide **quién puede darse de alta**. Un trigger sobre
 *   `auth.users` aborta el registro de cualquier correo que no esté ahí,
 *   porque el API de Supabase es público y Cloudflare Access no lo cubre.
 * - `profiles.role` decide **qué puede hacer** quien ya entró.
 *
 * Sacar a alguien de la lista no le cierra la puerta si ya tiene sesión:
 * le impide volver a registrarse. Para revocar el acceso de verdad hay que
 * bajarle el rol o eliminarlo de `auth.users`, y eso último no se hace
 * desde aquí a propósito (regla 2: nada se borra).
 */

export type Resultado = { error: string | null; aviso?: string }

const ROLES = ['lector', 'cargador', 'admin']

function traducir(mensaje: string): string {
  if (mensaje.includes('guard_role') || mensaje.includes('propio rol')) {
    return 'No puedes cambiarte el rol a ti mismo. Pídeselo a otro administrador.'
  }
  if (mensaje.includes('violates row-level security')) {
    return 'Solo un administrador puede cambiar roles.'
  }
  if (mensaje.includes('duplicate key')) {
    return 'Ese correo ya está en la lista.'
  }
  return mensaje
}

export async function cambiarRol(_previo: Resultado, datos: FormData): Promise<Resultado> {
  const id = String(datos.get('id') ?? '')
  const rol = String(datos.get('role') ?? '')
  if (!id || !ROLES.includes(rol)) return { error: 'Rol inválido.' }

  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update({ role: rol }).eq('id', id)
  if (error) return { error: traducir(error.message) }

  revalidatePath('/admin/usuarios')
  return { error: null }
}

export async function agregarALista(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  const correo = String(datos.get('email') ?? '').trim().toLowerCase()
  const rol = String(datos.get('role') ?? 'lector')
  const nota = String(datos.get('note') ?? '').trim()

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) {
    return { error: 'Ese correo no parece un correo.' }
  }
  if (!ROLES.includes(rol)) return { error: 'Rol inválido.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase.from('access_list').insert({
    email: correo,
    role: rol,
    note: nota || null,
    added_by: user?.id ?? null,
  })
  if (error) return { error: traducir(error.message) }

  revalidatePath('/admin/usuarios')
  return {
    error: null,
    aviso: `${correo} ya puede registrarse. El rol se le asigna en el momento del alta.`,
  }
}

export async function quitarDeLista(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  const correo = String(datos.get('email') ?? '')
  if (!correo) return { error: 'Falta el correo.' }

  const supabase = await createClient()
  const { error } = await supabase.from('access_list').delete().eq('email', correo)
  if (error) return { error: traducir(error.message) }

  revalidatePath('/admin/usuarios')
  return {
    error: null,
    aviso: 'Quitado de la lista. Si ya tenía cuenta, sigue entrando: para cerrarle la puerta hay que bajarle el rol.',
  }
}

'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

/**
 * Comprueba que quien llama es administrador **antes** de tocar la llave
 * de servicio.
 *
 * Las acciones de abajo usan el API de Auth con permisos totales, que se
 * salta RLS por definición. Sin esta guarda, cualquiera que descubriera el
 * nombre de la acción podría crear cuentas: las Server Actions son
 * endpoints, aunque no lo parezcan al leer el código.
 */
async function exigirAdmin(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return 'Sin sesión.'

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  return perfil?.role === 'admin' ? null : 'Solo un administrador puede hacer esto.'
}

/** Doce caracteres: se entrega en persona y se cambia después, no se teclea a diario. */
function contrasenaValida(p: string): string | null {
  if (p.length < 12) return 'La contraseña necesita al menos 12 caracteres.'
  return null
}

/**
 * Crea la cuenta de alguien que ya está en la lista de acceso.
 *
 * El orden importa y no es casual: primero autorizar el correo, después
 * crear la cuenta. El trigger sobre `auth.users` lee `access_list` para
 * decidir el rol, así que crear la cuenta antes de autorizar el correo
 * falla — y falla bien, porque es la misma puerta para todos.
 */
export async function crearCuenta(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  const problema = await exigirAdmin()
  if (problema) return { error: problema }

  const email = String(datos.get('email') ?? '').trim().toLowerCase()
  const password = String(datos.get('password') ?? '')
  const nombre = String(datos.get('full_name') ?? '').trim()

  if (!email.includes('@')) return { error: 'Ese correo no parece un correo.' }
  const malaContrasena = contrasenaValida(password)
  if (malaContrasena) return { error: malaContrasena }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    // Sin correo saliente no hay a quién confirmarle nada: la cuenta nace
    // confirmada porque la creó un administrador, que es la confirmación.
    email_confirm: true,
    user_metadata: nombre ? { full_name: nombre } : undefined,
  })

  if (error) {
    if (/already been registered|already exists/i.test(error.message)) {
      return { error: 'Ese correo ya tiene cuenta. Asígnale una contraseña nueva en su lugar.' }
    }

    // El trigger de la lista de acceso aborta el alta y Supabase devuelve
    // el error sin mensaje: literalmente "{}". Comprobado. Cualquier fallo
    // que no sea el duplicado se explica como lo que casi siempre es, y se
    // añade el detalle crudo solo si lo hay, para no esconder lo demás.
    const detalle = error.message && error.message !== '{}' ? ` (${error.message})` : ''
    return {
      error:
        'No se pudo crear la cuenta. Lo más probable es que el correo no esté ' +
        `en la lista de acceso: autorízalo abajo y vuelve a intentar.${detalle}`,
    }
  }

  // El trigger crea el perfil con el rol de la lista; el nombre no lo sabe.
  if (nombre) {
    const supabase = await createClient()
    const { data: usuarios } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    const creado = usuarios?.users?.find((u) => u.email === email)
    if (creado) {
      await supabase.from('profiles').update({ full_name: nombre }).eq('id', creado.id)
    }
  }

  revalidatePath('/admin/usuarios')
  return {
    error: null,
    aviso: `Cuenta creada para ${email}. Entrégale la contraseña en persona: no hay correo que se la mande.`,
  }
}

/**
 * Asigna una contraseña nueva. Es el "olvidé mi contraseña" del sistema:
 * sin correo saliente no hay enlace de recuperación que mandar, así que la
 * recuperación es que un administrador asigne otra y la entregue.
 */
export async function asignarContrasena(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  const problema = await exigirAdmin()
  if (problema) return { error: problema }

  const id = String(datos.get('id') ?? '')
  const password = String(datos.get('password') ?? '')
  if (!id) return { error: 'Falta la persona.' }

  const malaContrasena = contrasenaValida(password)
  if (malaContrasena) return { error: malaContrasena }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(id, { password })
  if (error) return { error: error.message }

  revalidatePath('/admin/usuarios')
  return {
    error: null,
    aviso: 'Contraseña asignada. Entrégasela en persona; sus sesiones abiertas siguen activas.',
  }
}

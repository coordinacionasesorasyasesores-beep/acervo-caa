'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/**
 * Alta y edición del catálogo de temas.
 *
 * El catálogo es cerrado (regla 5) y de dos niveles como máximo (regla 6):
 * lo más fino son etiquetas. Ninguna de las dos reglas se comprueba aquí —
 * viven en la base, en la política `topics_write` y en el trigger
 * `topics_depth_guard`. Estas acciones solo traducen el error de Postgres a
 * algo que se pueda leer sin saber SQL.
 */

export type Resultado = { error: string | null }

/** El slug es la llave estable: lo que se cita, no lo que se lee. */
function aSlug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function traducir(mensaje: string): string {
  if (mensaje.includes('topics_slug_key') || mensaje.includes('duplicate key')) {
    return 'Ya existe un tema con ese nombre.'
  }
  if (mensaje.includes('dos niveles') || mensaje.includes('two_levels')) {
    return 'Los temas admiten dos niveles como máximo. Un subtema no puede tener subtemas; para lo más fino están las etiquetas.'
  }
  if (mensaje.includes('violates row-level security')) {
    return 'Solo un administrador puede tocar el catálogo de temas.'
  }
  return mensaje
}

export async function crearTema(_previo: Resultado, datos: FormData): Promise<Resultado> {
  const nombre = String(datos.get('name') ?? '').trim()
  const padre = datos.get('parent_id')
  const parentId = padre && padre !== '' ? Number(padre) : null

  if (!nombre) return { error: 'El tema necesita un nombre.' }

  const supabase = await createClient()
  const { error } = await supabase.from('topics').insert({
    name: nombre,
    slug: aSlug(nombre),
    parent_id: parentId,
    position: Number(datos.get('position') ?? 0) || 0,
  })

  if (error) return { error: traducir(error.message) }

  revalidatePath('/admin/temas')
  revalidatePath('/')
  return { error: null }
}

export async function renombrarTema(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  const id = Number(datos.get('id'))
  const nombre = String(datos.get('name') ?? '').trim()
  if (!id || !nombre) return { error: 'Falta el nombre.' }

  const supabase = await createClient()

  // El slug no se toca al renombrar. Es la llave por la que el tema ya
  // quedó citado en enlaces y en los metadatos que propuso Claude; que
  // "Camas" pase a llamarse "Camas censables" no debería romper nada de eso.
  const { error } = await supabase.from('topics').update({ name: nombre }).eq('id', id)

  if (error) return { error: traducir(error.message) }

  revalidatePath('/admin/temas')
  revalidatePath('/')
  return { error: null }
}

export async function moverTema(_previo: Resultado, datos: FormData): Promise<Resultado> {
  const id = Number(datos.get('id'))
  const delta = Number(datos.get('delta'))
  if (!id || !delta) return { error: 'Movimiento inválido.' }

  const supabase = await createClient()
  const { data: tema } = await supabase
    .from('topics')
    .select('id, parent_id, position')
    .eq('id', id)
    .single()
  if (!tema) return { error: 'No existe el tema.' }

  const { data: hermanos } = tema.parent_id
    ? await supabase.from('topics').select('id, position').eq('parent_id', tema.parent_id)
    : await supabase.from('topics').select('id, position').is('parent_id', null)

  const ordenados = (hermanos ?? []).sort((a, b) => a.position - b.position)
  const i = ordenados.findIndex((t) => t.id === id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= ordenados.length) return { error: null }

  // Se renumeran los hermanos por su índice en vez de intercambiar las dos
  // posiciones. Es más escritura, pero el seed sembró todo el catálogo con
  // `position = 0` y un intercambio entre dos ceros no mueve nada: el botón
  // parecería roto. Renumerar deja el orden bien definido de una vez.
  const reordenados = [...ordenados]
  reordenados.splice(j, 0, reordenados.splice(i, 1)[0])

  const errores = await Promise.all(
    reordenados.map((t, pos) =>
      supabase.from('topics').update({ position: pos }).eq('id', t.id),
    ),
  )
  const fallo = errores.find((r) => r.error)
  if (fallo?.error) return { error: traducir(fallo.error.message) }

  revalidatePath('/admin/temas')
  revalidatePath('/')
  return { error: null }
}

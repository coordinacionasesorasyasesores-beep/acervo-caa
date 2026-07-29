'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type Resultado = { error: string | null }

/**
 * Archivar y desarchivar.
 *
 * Regla de negocio 2: nada se borra. Un documento que dejó de servir pasa a
 * `archivado`, sale de la navegación y del buscador por omisión, y sigue
 * accesible por su enlace permanente —que es lo que hace que citarlo en un
 * oficio de 2024 no se vuelva un enlace roto en 2027.
 *
 * Por eso la operación es reversible y por eso el botón dice "archivar" y
 * no "eliminar": la palabra promete lo que el sistema hace.
 */
export async function cambiarEstatus(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  const id = String(datos.get('id') ?? '')
  const estatus = String(datos.get('status') ?? '')

  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: 'Identificador inválido.' }
  if (!['publicado', 'archivado'].includes(estatus)) {
    return { error: 'Estatus inválido.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('documents')
    .update({ status: estatus })
    .eq('id', id)

  if (error) {
    return {
      error: error.message.includes('row-level security')
        ? 'Solo un administrador puede archivar documentos.'
        : error.message,
    }
  }

  revalidatePath('/admin/documentos')
  revalidatePath(`/doc/${id}`)
  revalidatePath('/')
  return { error: null }
}

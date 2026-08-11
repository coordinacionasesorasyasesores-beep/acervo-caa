'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type Resultado = {
  error: string | null
  /** El título ya guardado. Solo viene cuando de verdad se guardó. */
  titulo?: string
  /**
   * Lo que se intentó guardar, para devolvérselo al campo cuando falla.
   * Sin esto, un título largo rechazado por dos caracteres de más obliga a
   * escribirlo entero otra vez, que es la peor forma de dar un error.
   */
  intento?: string
}

/** Lo mismo que admite la base para un título, con margen de sobra. */
const MAX_TITULO = 300

/**
 * Cambiar el título de un documento.
 *
 * El título es lo que la gente lee y por lo que busca, y en una carga
 * masiva sale propuesto por una máquina o deducido del nombre del archivo:
 * corregirlo es la edición más frecuente del sistema. Por eso vive en la
 * propia ficha y no detrás de un formulario de administración — cuando el
 * arreglo cuesta tres clics y una pantalla nueva, no se hace.
 *
 * No hace falta reindexar a mano: `documents_vector_refresh` se dispara al
 * actualizar el título y reconstruye el vector de búsqueda (parte A del
 * índice). Cambiarlo aquí y que el buscador siga encontrando el título
 * viejo sería el error silencioso obvio, y el disparador lo previene.
 *
 * Quién puede: lo decide RLS, no este código. La política de `documents`
 * deja pasar a un admin o al autor con permiso de carga; si no, el update
 * afecta cero filas. Ese caso se distingue del fallo real y se explica.
 */
export async function renombrar(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  const id = String(datos.get('id') ?? '')
  const titulo = String(datos.get('titulo') ?? '').trim().replace(/\s+/g, ' ')

  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: 'Identificador inválido.' }
  if (!titulo) return { error: 'El título no puede quedar vacío.', intento: titulo }
  if (titulo.length > MAX_TITULO) {
    return {
      error: `El título no puede pasar de ${MAX_TITULO} caracteres.`,
      intento: titulo,
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('documents')
    .update({ title: titulo })
    .eq('id', id)
    .select('id')

  if (error) {
    return {
      error: error.message.includes('row-level security')
        ? 'No tienes permiso para cambiar este título.'
        : error.message,
      intento: titulo,
    }
  }

  // Sin error y sin filas es RLS filtrando en silencio: para PostgREST un
  // update que no alcanza ninguna fila es un éxito con cero resultados, y
  // sin esta comprobación la interfaz diría "guardado" sin haber guardado.
  if (!data || data.length === 0) {
    return { error: 'No tienes permiso para cambiar este título.', intento: titulo }
  }

  revalidatePath(`/doc/${id}`)
  revalidatePath('/')
  revalidatePath('/admin/documentos')
  return { error: null, titulo }
}

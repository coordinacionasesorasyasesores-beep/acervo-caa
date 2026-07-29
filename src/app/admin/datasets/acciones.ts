'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/**
 * Promoción de una hoja de Excel a dataset.
 *
 * Regla 7: un Excel es dataset solo si un admin lo promovió declarando
 * columnas y unidades. La diferencia importa — un Excel sin promover se ve
 * y se descarga, pero no alimenta nada calculado. Declarar la unidad es
 * justo lo que separa "6050345" de "6,050,345 miles de pesos", y ese
 * malentendido en un indicador es el tipo de error que nadie detecta hasta
 * que ya se citó en un oficio.
 *
 * Las filas se guardan en jsonb con la clave de columna, no con la posición:
 * insertar una columna en el Excel de origen no debe reinterpretar los
 * datos ya promovidos.
 */

export type Resultado = { error: string | null; datasetId?: string }

export type ColumnaDeclarada = {
  column_key: string
  label: string
  unit: string | null
  dtype: string | null
  topic_id: number | null
  position: number
}

export async function promover(
  versionId: string,
  sheetName: string,
  notas: string,
  columnas: ColumnaDeclarada[],
  filas: Record<string, unknown>[],
): Promise<Resultado> {
  const supabase = await createClient()

  if (!/^[0-9a-f-]{36}$/i.test(versionId)) return { error: 'Versión inválida.' }
  if (!sheetName) return { error: 'Falta la hoja.' }
  if (columnas.length === 0) return { error: 'No declaraste ninguna columna.' }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: dataset, error: eDataset } = await supabase
    .from('datasets')
    .insert({
      version_id: versionId,
      sheet_name: sheetName,
      notes: notas.trim() || null,
      curated_by: user?.id ?? null,
    })
    .select('id')
    .single()

  if (eDataset) {
    return {
      error: eDataset.message.includes('duplicate key')
        ? 'Esa hoja de esta versión ya está promovida. Quítala primero si quieres rehacerla.'
        : eDataset.message.includes('row-level security')
          ? 'Solo un administrador puede promover datasets.'
          : eDataset.message,
    }
  }

  const { error: eCols } = await supabase
    .from('dataset_columns')
    .insert(columnas.map((c) => ({ ...c, dataset_id: dataset.id })))

  if (eCols) {
    // Sin columnas el dataset no significa nada, así que no se deja a
    // medias: se deshace. `on delete cascade` se lleva lo que hubiera.
    await supabase.from('datasets').delete().eq('id', dataset.id)
    return { error: eCols.message }
  }

  // Por tandas: un concentrado de cinco mil filas en un solo insert pasa
  // del límite del cuerpo de la petición.
  const TANDA = 500
  for (let i = 0; i < filas.length; i += TANDA) {
    const { error } = await supabase.from('dataset_rows').insert(
      filas.slice(i, i + TANDA).map((data, j) => ({
        dataset_id: dataset.id,
        row_no: i + j,
        data,
      })),
    )
    if (error) {
      await supabase.from('datasets').delete().eq('id', dataset.id)
      return { error: error.message }
    }
  }

  revalidatePath('/admin/datasets')
  return { error: null, datasetId: dataset.id }
}

export async function quitarDataset(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  const id = String(datos.get('id') ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: 'Identificador inválido.' }

  // Aquí sí se borra, y no contradice la regla 2: el dataset es una lectura
  // curada de una hoja, no el documento. El Excel original y su versión
  // siguen intactos; lo que se deshace es la interpretación.
  const supabase = await createClient()
  const { error } = await supabase.from('datasets').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/admin/datasets')
  return { error: null }
}

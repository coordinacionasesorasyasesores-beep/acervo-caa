import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Promotor } from './Promotor'
import { QuitarDataset } from './QuitarDataset'

/**
 * Los Excel que ya son dataset y los que podrían serlo.
 *
 * Solo se ofrecen las versiones vigentes: promover una versión histórica
 * dejaría un dataset colgando de un archivo que ya nadie usa, y el
 * indicador que salga de ahí estaría midiendo el pasado sin avisarlo.
 */
export default async function DatasetsPage() {
  const supabase = await createClient()

  const [{ data: existentes }, { data: candidatas }, { data: topics }] =
    await Promise.all([
      supabase
        .from('datasets')
        .select(
          `id, sheet_name, notes, curated_at,
           dataset_columns(id),
           versions!inner(id, filename, version_no, documents!versions_document_id_fkey(id, title))`,
        )
        .order('curated_at', { ascending: false }),
      supabase
        .from('documents')
        .select(
          `id, title, current_version_id,
           versions!versions_document_id_fkey(id, filename, mime, version_no)`,
        )
        .eq('status', 'publicado'),
      supabase.from('topics').select('id, name, parent_id').order('position'),
    ])

  // La versión vigente y que además sea un Excel: lo demás no se promueve.
  const promovibles = (candidatas ?? [])
    .map((d) => {
      const versiones = (d.versions ?? []) as unknown as {
        id: string
        filename: string | null
        mime: string | null
        version_no: number
      }[]
      const vigente = versiones.find((v) => v.id === d.current_version_id)
      return vigente ? { documento: d, version: vigente } : null
    })
    .filter(
      (x): x is NonNullable<typeof x> =>
        x !== null &&
        Boolean(
          x.version.mime?.includes('spreadsheetml') ||
            x.version.filename?.toLowerCase().endsWith('.xlsx'),
        ),
    )

  return (
    <div>
      <p className="mb-5 text-sm leading-relaxed text-tinta-suave">
        Promover una hoja significa declarar qué es cada columna y en qué
        unidad está. Es lo que separa un número suelto de un dato que se
        puede sumar sin equivocarse: <em>6050345</em> no dice si son pesos,
        miles de pesos o metros cuadrados. Un Excel sin promover se ve y se
        descarga igual, pero no alimenta nada calculado.
      </p>

      {(existentes ?? []).length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-tinta-suave uppercase">
            Ya promovidas
          </h2>
          <ul className="divide-y divide-linea rounded-lg border border-linea bg-white">
            {(existentes ?? []).map((d) => {
              const v = d.versions as unknown as {
                version_no: number
                documents: { id: string; title: string }
              }
              return (
                <li key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <Link
                        href={`/doc/${v.documents.id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {v.documents.title}
                      </Link>
                      <span className="ml-2 text-tinta-suave">· hoja {d.sheet_name}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-tinta-suave">
                      {(d.dataset_columns ?? []).length} columnas declaradas · desde la
                      versión {v.version_no}
                      {d.notes ? ` · ${d.notes}` : ''}
                    </p>
                  </div>
                  <QuitarDataset id={d.id} />
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-xs font-semibold tracking-wide text-tinta-suave uppercase">
          Excel que se pueden promover
        </h2>

        {promovibles.length === 0 ? (
          <p className="rounded-lg border border-dashed border-linea bg-white px-6 py-8 text-center text-sm text-tinta-suave">
            No hay ningún Excel publicado con versión vigente.
          </p>
        ) : (
          <ul className="space-y-3">
            {promovibles.map(({ documento, version }) => (
              <li key={version.id}>
                <Promotor
                  versionId={version.id}
                  titulo={documento.title}
                  filename={version.filename ?? ''}
                  topics={(topics ?? []) as never}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

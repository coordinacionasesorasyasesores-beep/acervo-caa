import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Shell } from '@/components/ui/Shell'

type Topic = {
  id: number
  parent_id: number | null
  slug: string
  name: string
  position: number
}

export default async function ConsultaPage() {
  const profile = await requireSession()
  const supabase = await createClient()

  const [{ data: topics }, { count: totalDocs }] = await Promise.all([
    supabase.from('topics').select('*').order('position'),
    supabase.from('documents').select('*', { count: 'exact', head: true }),
  ])

  const raiz = (topics ?? []).filter((t: Topic) => t.parent_id === null)
  const hijos = (padre: number) =>
    (topics ?? []).filter((t: Topic) => t.parent_id === padre)

  return (
    <Shell profile={profile}>
      <div className="grid grid-cols-[15rem_1fr] gap-10">
        <aside>
          <h2 className="mb-3 text-xs font-semibold tracking-wide text-tinta-suave uppercase">
            Temas
          </h2>
          <nav className="space-y-3 text-sm">
            {raiz.map((t: Topic) => (
              <div key={t.id}>
                <div className="font-medium">{t.name}</div>
                <ul className="mt-1 space-y-0.5 border-l border-linea pl-3">
                  {hijos(t.id).map((h: Topic) => (
                    <li key={h.id} className="text-tinta-suave">
                      {h.name}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <section>
          <h1 className="text-lg font-semibold tracking-tight">Consultar el acervo</h1>
          <p className="mt-1 text-sm text-tinta-suave">
            {totalDocs === 0
              ? 'Todavía no hay documentos cargados.'
              : `${totalDocs} documento${totalDocs === 1 ? '' : 's'} en el acervo.`}
          </p>

          <div className="mt-6 rounded-lg border border-dashed border-linea bg-white p-8 text-sm text-tinta-suave">
            <p className="font-medium text-tinta">Pendiente: sprint 4.</p>
            <p className="mt-1.5 leading-relaxed">
              Aquí van el buscador de texto libre, las facetas acumulables y los
              resultados con el fragmento resaltado. El esquema y el índice ya
              están listos; falta la pantalla.
            </p>
          </div>
        </section>
      </div>
    </Shell>
  )
}

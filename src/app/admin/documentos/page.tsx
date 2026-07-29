import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { BotonEstatus } from './BotonEstatus'

/**
 * Todos los documentos, incluidos los archivados y los borradores.
 *
 * Es la única pantalla que los enseña juntos: la consulta muestra los
 * publicados salvo que se pidan los demás, y con razón. Aquí sí conviene
 * verlos todos, porque la pregunta que trae a un administrador a esta
 * pantalla es "¿qué hay que archivar?" o "¿dónde quedó aquello?".
 */
export default async function DocumentosPage() {
  const supabase = await createClient()

  const { data: docs } = await supabase
    .from('documents')
    .select('id, title, status, year, updated_at, doc_types(name), profiles!documents_owner_id_fkey(full_name)')
    .order('updated_at', { ascending: false })
    .limit(200)

  const porEstatus = (s: string) => (docs ?? []).filter((d) => d.status === s)

  return (
    <div>
      <p className="mb-5 text-sm leading-relaxed text-tinta-suave">
        Archivar saca un documento de la navegación y del buscador, pero no
        lo borra: sigue en la base y sigue abriéndose por su enlace
        permanente. Es reversible, y es lo más cerca de borrar que llega el
        sistema.
      </p>

      <Grupo titulo="Publicados" docs={porEstatus('publicado')} />
      <Grupo titulo="Archivados" docs={porEstatus('archivado')} />
      <Grupo titulo="Borradores" docs={porEstatus('borrador')} />
    </div>
  )
}

type Doc = {
  id: string
  title: string
  status: string
  year: number | null
  updated_at: string
  doc_types: unknown
  profiles: unknown
}

function Grupo({ titulo, docs }: { titulo: string; docs: Doc[] }) {
  if (docs.length === 0) return null

  return (
    <section className="mb-7">
      <h2 className="mb-2 text-xs font-semibold tracking-wide text-tinta-suave uppercase">
        {titulo} · {docs.length}
      </h2>
      <ul className="divide-y divide-linea rounded-lg border border-linea bg-white">
        {docs.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <Link
                href={`/doc/${d.id}`}
                className="text-sm underline-offset-2 hover:underline"
              >
                {d.title}
              </Link>
              <p className="mt-0.5 text-xs text-tinta-suave">
                {(d.doc_types as { name: string } | null)?.name}
                {d.year ? ` · ${d.year}` : ''}
                {(d.profiles as { full_name: string | null } | null)?.full_name
                  ? ` · ${(d.profiles as { full_name: string }).full_name}`
                  : ''}
              </p>
            </div>

            <BotonEstatus id={d.id} estatus={d.status} />
          </li>
        ))}
      </ul>
    </section>
  )
}

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { headers } from 'next/headers'
import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Shell } from '@/components/ui/Shell'
import { ArrowLeft, Download } from 'lucide-react'
import { Copiable } from '@/components/ui/Copiable'
import { IconoArchivo } from '@/components/ui/IconoArchivo'
import { Vista } from '@/components/preview/Vista'

/**
 * La ficha del documento.
 *
 * Es la pantalla que contesta la pregunta que da origen al proyecto:
 * "¿quién tiene el Excel actualizado?". Por eso lo primero que se ve es
 * cuál es la versión vigente, y el historial completo está debajo sin
 * esconderse: saber que hubo catorce versiones —y qué cambió en cada una—
 * es parte de la respuesta.
 */
export default async function FichaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const profile = await requireSession()
  const supabase = await createClient()

  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  // El join se nombra por su llave foránea: entre documents y versions hay
  // dos, y sin desambiguar PostgREST responde 300 (§10 del documento).
  const { data: doc } = await supabase
    .from('documents')
    .select(
      `id, title, summary, year, area, source, status, current_version_id,
       created_at, updated_at,
       doc_types(name), doc_uses(name),
       topics!documents_primary_topic_id_fkey(id, name, parent_id),
       owner:profiles!documents_owner_id_fkey(full_name),
       autor:profiles!documents_created_by_fkey(full_name),
       document_tags(tag),
       document_topics(topics(id, name, parent_id))`,
    )
    .eq('id', id)
    .single()

  if (!doc) notFound()

  const [{ data: versiones }, { data: padres }] = await Promise.all([
    supabase
      .from('versions')
      .select(
        `id, version_no, change_note, filename, mime, size_bytes, page_count,
         uploaded_at, text_key, uploaded_by, profiles(full_name)`,
      )
      .eq('document_id', id)
      .order('version_no', { ascending: false }),
    supabase.from('topics').select('id, name'),
  ])

  // La ficha vista también es un acceso: la bitácora tiene que poder
  // contestar "¿quién consultó este documento?", no solo quién lo bajó.
  await supabase.from('access_log').insert({
    user_id: profile.id,
    document_id: id,
    action: 'vista',
  })

  const vigente = (versiones ?? []).find((v) => v.id === doc.current_version_id)
  const historicas = (versiones ?? []).filter((v) => v.id !== doc.current_version_id)
  const nombrePadre = new Map((padres ?? []).map((t) => [t.id, t.name]))

  const cabecera = await headers()
  const origen =
    process.env.NEXT_PUBLIC_SITE_URL ??
    `${cabecera.get('x-forwarded-proto') ?? 'http'}://${cabecera.get('host') ?? 'localhost:3000'}`

  const tema = doc.topics as unknown as { id: number; name: string; parent_id: number | null }
  const secundarios = (doc.document_topics ?? [])
    .map((dt) => dt.topics as unknown as { id: number; name: string; parent_id: number | null })
    .filter((t) => t && t.id !== tema?.id)

  return (
    <Shell profile={profile}>
      <div className="mx-auto max-w-4xl">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-acento underline-offset-2 hover:underline"
        >
          <ArrowLeft size={15} strokeWidth={2} aria-hidden />
          Volver a la consulta
        </Link>

        <header className="mt-3 border-b border-linea pb-5">
          <div className="flex items-start gap-3">
            {vigente && (
              <IconoArchivo
                mime={vigente.mime}
                filename={vigente.filename}
                tamano={26}
                className="mt-1.5"
              />
            )}
            <h1 className="titular min-w-0 flex-1 font-serif text-[2rem] leading-tight">
              {doc.title}
            </h1>
            {doc.status !== 'publicado' && (
              <span className="mt-1 shrink-0 rounded border border-oro/50 bg-oro-claro/20 px-2 py-0.5 text-[11px] tracking-wide text-tinta uppercase">
                {doc.status === 'archivado' ? 'Archivado' : 'Borrador'}
              </span>
            )}
          </div>

          {doc.summary && (
            <p className="mt-2 text-sm leading-relaxed text-tinta-suave">{doc.summary}</p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {vigente && (
              <>
                <a
                  href={`/api/download/${vigente.id}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-acento px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  <Download size={16} strokeWidth={2} aria-hidden />
                  Descargar
                </a>
                <span className="text-xs text-tinta-suave">
                  {vigente.filename} · {mb(vigente.size_bytes)} MB
                  {vigente.page_count ? ` · ${vigente.page_count} páginas u hojas` : ''}
                </span>
              </>
            )}
          </div>
        </header>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_16rem]">
          <section className="min-w-0">
            {vigente ? (
              <Vista
                versionId={vigente.id}
                mime={vigente.mime}
                filename={vigente.filename}
                tieneTexto={Boolean(vigente.text_key)}
                pesoMb={mb(vigente.size_bytes)}
              />
            ) : (
              <p className="rounded-lg border border-dashed border-linea bg-white px-6 py-10 text-center text-sm text-tinta-suave">
                Este documento no tiene una versión vigente.
              </p>
            )}

            <section className="mt-8">
              <h2 className="text-xs font-semibold tracking-wide text-tinta-suave uppercase">
                Versiones
              </h2>
              <ol className="mt-2 divide-y divide-linea rounded-lg border border-linea bg-white">
                {(versiones ?? []).map((v) => (
                  <li key={v.id} className="flex items-start gap-3 px-4 py-3">
                    <span
                      className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[11px] tracking-wide uppercase ${
                        v.id === doc.current_version_id
                          ? 'bg-acento-suave text-acento'
                          : 'bg-papel text-tinta-suave'
                      }`}
                    >
                      v{v.version_no}
                      {v.id === doc.current_version_id ? ' · vigente' : ''}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        {v.change_note || (
                          <span className="text-tinta-suave">
                            {v.version_no === 1 ? 'Primera versión.' : 'Sin nota de cambio.'}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-tinta-suave">
                        {fecha(v.uploaded_at)}
                        {(v.profiles as unknown as { full_name: string | null } | null)
                          ?.full_name
                          ? ` · ${(v.profiles as unknown as { full_name: string }).full_name}`
                          : ''}
                        {' · '}
                        {mb(v.size_bytes)} MB
                      </p>
                    </div>

                    <a
                      href={`/api/download/${v.id}`}
                      className="inline-flex shrink-0 items-center gap-1.5 text-xs text-acento underline-offset-2 hover:underline"
                    >
                      <Download size={13} strokeWidth={2} aria-hidden />
                      Descargar
                    </a>
                  </li>
                ))}
              </ol>
              {historicas.length > 0 && (
                <p className="mt-1.5 text-xs text-tinta-suave">
                  Las versiones anteriores no se borran nunca y siguen descargables.
                </p>
              )}
            </section>
          </section>

          <aside className="space-y-5 text-sm">
            <div>
              <Rotulo>Enlace permanente</Rotulo>
              <p className="mt-1 mb-1.5 text-xs leading-relaxed text-tinta-suave">
                No cambia aunque se suban versiones nuevas.
              </p>
              <Copiable url={`${origen}/doc/${doc.id}`} />
            </div>

            <Dato rotulo="Tipo documental">{nombre(doc.doc_types)}</Dato>
            <Dato rotulo="Tema principal">
              {tema
                ? tema.parent_id
                  ? `${nombrePadre.get(tema.parent_id) ?? ''} › ${tema.name}`
                  : tema.name
                : null}
            </Dato>
            {secundarios.length > 0 && (
              <Dato rotulo="Otros temas">
                {secundarios.map((t) => t.name).join(', ')}
              </Dato>
            )}
            <Dato rotulo="Uso">{nombre(doc.doc_uses)}</Dato>
            <Dato rotulo="Año">{doc.year}</Dato>
            <Dato rotulo="Área">{doc.area}</Dato>
            <Dato rotulo="Fuente">{doc.source}</Dato>
            <Dato rotulo="Responsable">
              {(doc.owner as unknown as { full_name: string | null } | null)?.full_name}
            </Dato>
            <Dato rotulo="Subido por">
              {(doc.autor as unknown as { full_name: string | null } | null)?.full_name}
            </Dato>
            <Dato rotulo="Actualizado">{fecha(doc.updated_at)}</Dato>

            {(doc.document_tags ?? []).length > 0 && (
              <div>
                <Rotulo>Etiquetas</Rotulo>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(doc.document_tags ?? []).map((t) => (
                    <span
                      key={t.tag}
                      className="rounded bg-acento-suave px-1.5 py-0.5 text-xs text-acento"
                    >
                      {t.tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </Shell>
  )
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold tracking-wide text-tinta-suave uppercase">
      {children}
    </h2>
  )
}

/** Un dato vacío no se pinta: una ficha llena de "—" no informa de nada. */
function Dato({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === '') return null
  return (
    <div>
      <Rotulo>{rotulo}</Rotulo>
      <p className="mt-0.5 leading-snug">{children}</p>
    </div>
  )
}

function nombre(x: unknown): string | null {
  return (x as { name: string } | null)?.name ?? null
}

const mb = (bytes: number | null) => ((bytes ?? 0) / 1024 / 1024).toFixed(1)

function fecha(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

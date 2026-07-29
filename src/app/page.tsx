import Link from 'next/link'
import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Shell } from '@/components/ui/Shell'
import { Buscador } from '@/components/search/Buscador'
import { ArbolDeTemas } from '@/components/search/ArbolDeTemas'
import { Facetas } from '@/components/search/Facetas'
import { Resultado } from '@/components/search/Resultado'
import {
  POR_PAGINA,
  aParametros,
  hayFiltros,
  leerFiltros,
  urlCon,
  type Faceta,
  type Filtros,
  type Resultado as Fila,
} from '@/lib/busqueda'
import type { Topic } from '@/lib/catalogos'

/**
 * La pantalla principal: buscar y navegar el acervo.
 *
 * Todo se renderiza en el servidor a partir de la URL. No hay estado de
 * cliente que sincronizar, así que un enlace pegado en un correo abre
 * exactamente la misma pantalla que quien lo mandó estaba viendo.
 */
export default async function ConsultaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const profile = await requireSession()
  const supabase = await createClient()
  const filtros = leerFiltros(await searchParams)
  const params = aParametros(filtros)

  const [resultados, facetas, topics, conteos] = await Promise.all([
    supabase.rpc('search_documents', {
      ...params,
      p_order: filtros.orden,
      p_limit: POR_PAGINA,
      p_offset: (filtros.pagina - 1) * POR_PAGINA,
    }),
    supabase.rpc('search_facets', params),
    supabase.from('topics').select('*').order('position'),
    supabase.rpc('topic_counts', { p_statuses: params.p_statuses }),
  ])

  const filas = (resultados.data ?? []) as Fila[]
  const total = Number(filas[0]?.total ?? 0)
  const paginas = Math.ceil(total / POR_PAGINA)
  const fallo = resultados.error

  if (fallo) console.error('[consulta]', fallo)

  const conteoPorTema = new Map<number, number>(
    ((conteos.data ?? []) as { topic_id: number; cuantos: number }[]).map((c) => [
      c.topic_id,
      Number(c.cuantos),
    ]),
  )

  return (
    <Shell profile={profile}>
      <div className="grid gap-10 lg:grid-cols-[15rem_1fr]">
        <aside className="space-y-7 lg:sticky lg:top-6 lg:self-start">
          <ArbolDeTemas
            topics={(topics.data ?? []) as Topic[]}
            conteos={conteoPorTema}
            filtros={filtros}
          />
          <Facetas facetas={(facetas.data ?? []) as Faceta[]} filtros={filtros} />
        </aside>

        <section className="min-w-0">
          <Buscador filtros={filtros} />

          <div className="mt-4 mb-5 flex flex-wrap items-baseline justify-between gap-2 border-b border-linea pb-3 text-sm">
            <p className="text-tinta-suave">
              {fallo
                ? 'No se pudo consultar el acervo.'
                : total === 0
                  ? 'Ningún documento'
                  : `${total} documento${total === 1 ? '' : 's'}`}
              {filtros.q && !fallo && (
                <>
                  {' para '}
                  <span className="font-medium text-tinta">«{filtros.q}»</span>
                </>
              )}
            </p>

            <div className="flex items-center gap-3">
              {filtros.q && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-tinta-suave">Ordenar por</span>
                  <Orden filtros={filtros} valor="relevancia">
                    relevancia
                  </Orden>
                  <span className="text-linea">|</span>
                  <Orden filtros={filtros} valor="reciente">
                    fecha
                  </Orden>
                </div>
              )}
              {hayFiltros(filtros) && (
                <Link
                  href="/"
                  className="text-xs text-acento underline-offset-2 hover:underline"
                >
                  Limpiar todo
                </Link>
              )}
            </div>
          </div>

          {fallo ? (
            <Aviso titulo="Algo falló al consultar.">
              Vuelve a intentarlo. Si sigue pasando, avisa a un administrador: el
              detalle quedó en la bitácora del servidor.
            </Aviso>
          ) : filas.length === 0 ? (
            <Vacio conFiltros={hayFiltros(filtros)} />
          ) : (
            <>
              <div>
                {filas.map((fila) => (
                  <Resultado key={fila.id} fila={fila} />
                ))}
              </div>

              {paginas > 1 && (
                <nav className="mt-6 flex items-center justify-between border-t border-linea pt-4">
                  <Salto
                    href={urlCon(filtros, { pagina: filtros.pagina - 1 })}
                    activo={filtros.pagina > 1}
                  >
                    ← Anterior
                  </Salto>
                  <span className="text-xs text-tinta-suave">
                    Página {filtros.pagina} de {paginas}
                  </span>
                  <Salto
                    href={urlCon(filtros, { pagina: filtros.pagina + 1 })}
                    activo={filtros.pagina < paginas}
                  >
                    Siguiente →
                  </Salto>
                </nav>
              )}
            </>
          )}
        </section>
      </div>
    </Shell>
  )
}

function Orden({
  filtros,
  valor,
  children,
}: {
  filtros: Filtros
  valor: 'relevancia' | 'reciente'
  children: React.ReactNode
}) {
  const activo = filtros.orden === valor
  return (
    <Link
      href={urlCon(filtros, { orden: valor, pagina: 1 })}
      className={
        activo
          ? 'font-medium text-tinta'
          : 'text-acento underline-offset-2 hover:underline'
      }
    >
      {children}
    </Link>
  )
}

function Salto({
  href,
  activo,
  children,
}: {
  href: string
  activo: boolean
  children: React.ReactNode
}) {
  if (!activo) return <span className="text-xs text-linea">{children}</span>
  return (
    <Link href={href} className="text-xs text-acento underline-offset-2 hover:underline">
      {children}
    </Link>
  )
}

function Vacio({ conFiltros }: { conFiltros: boolean }) {
  if (!conFiltros) {
    return (
      <Aviso titulo="El acervo todavía está vacío.">
        En cuanto alguien suba el primer documento aparecerá aquí.{' '}
        <Link href="/subir" className="text-acento underline underline-offset-2">
          Subir documentos
        </Link>
        .
      </Aviso>
    )
  }

  return (
    <Aviso titulo="Nada coincide con lo que buscas.">
      Prueba con menos filtros o con otras palabras. El buscador entiende
      frases entre comillas y admite <code className="text-xs">-palabra</code> para
      excluir.
    </Aviso>
  )
}

function Aviso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-linea bg-white px-6 py-10 text-center">
      <p className="text-sm font-medium">{titulo}</p>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-tinta-suave">
        {children}
      </p>
    </div>
  )
}

import Link from 'next/link'
import { signOut } from '@/app/login/actions'
import type { SessionProfile } from '@/lib/auth'
import type { Topic } from '@/lib/catalogos'
import { urlCon, type Faceta, type Filtros } from '@/lib/busqueda'
import { Buscador } from './Buscador'
import { ReglaDelAcervo } from './ReglaDelAcervo'

/**
 * La portada: una sola pregunta, en verde profundo.
 *
 * Es el único lugar oscuro de la aplicación, y es a propósito. Buscar y
 * trabajar son dos momentos distintos: aquí no hay nada que leer, solo
 * algo que preguntar, así que la pantalla se pone en silencio y deja una
 * cosa encendida. En cuanto hay una consulta, la superficie se vuelve
 * clara y se convierte en mesa de trabajo — un archivo se lee sobre papel,
 * no sobre terciopelo.
 *
 * La profundidad viene de dos halos muy tenues, jade y vino, tomados de
 * los degradados de la identidad. Ninguno se ve como tal: lo que se nota
 * es que el verde deja de ser plano.
 *
 * El oro aparece exactamente dos veces —el logotipo y la regla— y en nada
 * más. Repartido en botones y bordes dejaría de ser oro.
 */
export function Portada({
  profile,
  topics,
  conteos,
  facetas,
  filtros,
  totalDocumentos,
}: {
  profile: SessionProfile
  topics: Topic[]
  conteos: Map<number, number>
  facetas: Faceta[]
  filtros: Filtros
  totalDocumentos: number
}) {
  const puedeSubir = profile.role === 'cargador' || profile.role === 'admin'

  const conDocumentos = topics
    .filter((t) => (conteos.get(t.id) ?? 0) > 0)
    .sort((a, b) => (conteos.get(b.id) ?? 0) - (conteos.get(a.id) ?? 0))
    .slice(0, 6)

  const anios = facetas
    .filter((f) => f.dimension === 'year')
    .map((f) => ({ anio: Number(f.valor), cuantos: f.cuantos }))
    .filter((a) => Number.isFinite(a.anio))

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-bosque text-oro-claro">
      {/* Profundidad, no decoración: sin esto el verde es una pared. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(70rem 40rem at 50% 8%, rgba(34,94,81,0.55), transparent 60%),' +
            'radial-gradient(45rem 30rem at 88% 92%, rgba(105,25,50,0.40), transparent 65%)',
        }}
      />

      <header className="relative flex items-center gap-1 px-5 py-4 text-sm sm:px-8">
        <div className="ml-auto flex items-center gap-1">
          {puedeSubir && <EnlaceTenue href="/subir">Subir</EnlaceTenue>}
          {profile.role === 'admin' && (
            <EnlaceTenue href="/admin/temas">Administrar</EnlaceTenue>
          )}
        </div>
        <div className="ml-3 flex items-center gap-2 border-l border-jade/40 pl-3">
          <span className="hidden max-w-40 truncate text-xs text-niebla sm:inline">
            {profile.fullName ?? profile.email}
          </span>
          <form action={signOut}>
            <button className="rounded px-2 py-1.5 text-xs text-niebla transition-colors hover:text-oro-claro">
              Salir
            </button>
          </form>
        </div>
      </header>

      <main className="relative flex flex-1 items-center justify-center px-5 pb-28 sm:px-8">
        <div className="w-full max-w-2xl">
          <div className="mb-9 text-center sm:mb-11">
            <h1 className="titular bg-gradient-to-r from-oro via-oro-claro to-oro bg-clip-text font-serif text-[3.25rem] leading-none font-normal text-transparent sm:text-7xl">
              Acervo
            </h1>
            <p className="mt-3 text-xs text-niebla sm:text-sm">
              Coordinación de Asesoras y Asesores · ISSSTE
            </p>
          </div>

          <Buscador filtros={filtros} tamano="portada" />

          {anios.length > 0 && <ReglaDelAcervo anios={anios} filtros={filtros} />}

          {conDocumentos.length > 0 && (
            <nav
              aria-label="Temas con documentos"
              className="mt-8 flex flex-wrap items-center justify-center gap-2"
            >
              {conDocumentos.map((t) => (
                <Link
                  key={t.id}
                  href={urlCon(filtros, { temas: [t.id], pagina: 1 })}
                  className="rounded-full border border-jade/50 bg-jade/10 px-3.5 py-1.5 text-sm text-oro-claro/90 backdrop-blur-sm transition-colors hover:border-oro/70 hover:bg-jade/25 hover:text-oro-claro"
                >
                  {t.name}
                  <span className="ml-2 text-xs tabular-nums text-niebla">
                    {conteos.get(t.id)}
                  </span>
                </Link>
              ))}
            </nav>
          )}

          <p className="mt-9 text-center text-xs leading-relaxed text-niebla">
            {totalDocumentos === 0 ? (
              <>
                El acervo está vacío.{' '}
                {puedeSubir && (
                  <Link href="/subir" className="text-oro underline underline-offset-2">
                    Sube el primer documento
                  </Link>
                )}
              </>
            ) : (
              <>
                {totalDocumentos} documento{totalDocumentos === 1 ? '' : 's'} · busca
                por título, resumen, etiquetas o por lo que dice adentro
              </>
            )}
          </p>
        </div>
      </main>
    </div>
  )
}

function EnlaceTenue({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded px-3 py-1.5 text-niebla transition-colors hover:text-oro-claro"
    >
      {children}
    </Link>
  )
}

import Link from 'next/link'
import { signOut } from '@/app/login/actions'
import type { SessionProfile } from '@/lib/auth'
import type { Topic } from '@/lib/catalogos'
import { urlCon, type Filtros } from '@/lib/busqueda'
import { Buscador } from './Buscador'

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
 * El oro aparece exactamente una vez, en el logotipo, con el degradado de
 * la identidad. Repartido en botones y bordes dejaría de ser oro.
 */
export function Portada({
  profile,
  topics,
  conteos,
  filtros,
  totalDocumentos,
}: {
  profile: SessionProfile
  topics: Topic[]
  conteos: Map<number, number>
  filtros: Filtros
  totalDocumentos: number
}) {
  const puedeSubir = profile.role === 'cargador' || profile.role === 'admin'

  // Solo los temas con contenido: en la portada, un tema vacío es una
  // puerta que no lleva a ningún lado.
  const conDocumentos = topics
    .filter((t) => (conteos.get(t.id) ?? 0) > 0)
    .sort((a, b) => (conteos.get(b.id) ?? 0) - (conteos.get(a.id) ?? 0))
    .slice(0, 6)

  return (
    <div className="flex min-h-screen flex-col bg-bosque text-oro-claro">
      <header className="flex items-center justify-end gap-1 px-6 py-4 text-sm">
        {puedeSubir && (
          <EnlaceTenue href="/subir">Subir</EnlaceTenue>
        )}
        {profile.role === 'admin' && (
          <EnlaceTenue href="/admin/temas">Administrar</EnlaceTenue>
        )}
        <span className="ml-3 hidden text-xs text-niebla sm:inline">
          {profile.fullName ?? profile.email}
        </span>
        <form action={signOut}>
          <button className="rounded px-3 py-1.5 text-xs text-niebla transition-colors hover:text-oro-claro">
            Salir
          </button>
        </form>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-24">
        <div className="w-full max-w-2xl">
          <div className="mb-10 text-center">
            <h1 className="titular bg-gradient-to-r from-oro via-oro-claro to-oro bg-clip-text font-serif text-6xl font-normal text-transparent sm:text-7xl">
              Acervo
            </h1>
            <p className="mt-3 text-sm text-niebla">
              Coordinación de Asesoras y Asesores · ISSSTE
            </p>
          </div>

          <Buscador filtros={filtros} tamano="portada" />

          {conDocumentos.length > 0 && (
            <nav
              aria-label="Temas con documentos"
              className="mt-8 flex flex-wrap items-center justify-center gap-2"
            >
              {conDocumentos.map((t) => (
                <Link
                  key={t.id}
                  href={urlCon(filtros, { temas: [t.id], pagina: 1 })}
                  className="rounded-full border border-jade/60 px-3.5 py-1.5 text-sm text-oro-claro/90 transition-colors hover:border-oro hover:text-oro-claro"
                >
                  {t.name}
                  <span className="ml-2 text-xs tabular-nums text-niebla">
                    {conteos.get(t.id)}
                  </span>
                </Link>
              ))}
            </nav>
          )}

          <p className="mt-10 text-center text-xs text-niebla">
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
                {totalDocumentos} documento{totalDocumentos === 1 ? '' : 's'} ·
                busca por título, resumen, etiquetas o por lo que dice adentro
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

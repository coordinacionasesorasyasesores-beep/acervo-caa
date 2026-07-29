import Link from 'next/link'
import type { SessionProfile } from '@/lib/auth'
import { ROLE_LABEL } from '@/lib/roles'
import { signOut } from '@/app/login/actions'

/**
 * Marco de las pantallas de trabajo.
 *
 * La barra es verde profundo, el mismo de la portada: es el hilo que dice
 * "sigues dentro del acervo" cuando la superficie de abajo ya se volvió
 * clara. Debajo, papel — un archivo se lee sobre papel, no sobre
 * terciopelo.
 *
 * `busqueda` es opcional. En la pantalla de resultados el buscador vive
 * aquí arriba, como en cualquier buscador después de la primera consulta;
 * en las demás pantallas la barra solo navega.
 */
export function Shell({
  profile,
  busqueda,
  children,
}: {
  profile: SessionProfile
  busqueda?: React.ReactNode
  children: React.ReactNode
}) {
  const puedeSubir = profile.role === 'cargador' || profile.role === 'admin'

  return (
    <div className="min-h-screen">
      <header className="bg-bosque text-oro-claro">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-3">
          <Link href="/" className="shrink-0" aria-label="Ir a la portada">
            <span className="bg-gradient-to-r from-oro via-oro-claro to-oro bg-clip-text font-serif text-xl leading-none text-transparent">
              Acervo
            </span>
          </Link>

          {busqueda && <div className="min-w-0 max-w-xl flex-1">{busqueda}</div>}

          <nav className="ml-auto flex items-center gap-1 text-sm">
            {puedeSubir && <NavLink href="/subir">Subir</NavLink>}
            {profile.role === 'admin' && (
              <NavLink href="/admin/temas">Administrar</NavLink>
            )}
          </nav>

          {/* Quién eres es referencia, no navegación: va en el tamaño de un
              pie de página. Al peso que tenía antes, competía con el
              buscador —que es a lo que vino la gente— y empujaba el botón
              de salir contra el borde de la ventana. */}
          <div className="flex shrink-0 items-center gap-2.5 border-l border-jade/50 pl-3.5">
            <div className="hidden max-w-40 text-right leading-tight lg:block">
              <div className="truncate text-xs text-oro-claro/80">
                {profile.fullName ?? profile.email}
              </div>
              <div className="text-[11px] text-niebla">{ROLE_LABEL[profile.role]}</div>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded border border-jade/60 px-2.5 py-1.5 text-xs text-niebla transition-colors hover:border-oro hover:text-oro-claro"
              >
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  )
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded px-3 py-1.5 text-niebla transition-colors hover:text-oro-claro"
    >
      {children}
    </Link>
  )
}

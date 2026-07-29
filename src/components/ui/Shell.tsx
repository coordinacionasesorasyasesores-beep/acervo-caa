import Link from 'next/link'
import { ROLE_LABEL, type SessionProfile } from '@/lib/auth'
import { signOut } from '@/app/login/actions'

/** Marco común de las pantallas con sesión: cabecera, navegación, pie. */
export function Shell({
  profile,
  children,
}: {
  profile: SessionProfile
  children: React.ReactNode
}) {
  const puedeSubir = profile.role === 'cargador' || profile.role === 'admin'

  return (
    <div className="min-h-screen">
      <header className="border-b border-linea bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <Link href="/" className="shrink-0">
            <span className="block text-[15px] leading-tight font-semibold tracking-tight">
              Repositorio de Investigaciones
            </span>
            <span className="block text-xs text-tinta-suave">CAA · ISSSTE</span>
          </Link>

          <nav className="ml-auto flex items-center gap-1 text-sm">
            <NavLink href="/">Consultar</NavLink>
            {puedeSubir && <NavLink href="/subir">Subir</NavLink>}
            {profile.role === 'admin' && <NavLink href="/admin/temas">Administrar</NavLink>}
          </nav>

          <div className="flex items-center gap-3 border-l border-linea pl-4">
            <div className="text-right leading-tight">
              <div className="text-sm font-medium">{profile.fullName ?? profile.email}</div>
              <div className="text-xs text-tinta-suave">{ROLE_LABEL[profile.role]}</div>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded border border-linea px-2.5 py-1.5 text-xs text-tinta-suave transition-colors hover:bg-papel hover:text-tinta"
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
      className="rounded px-3 py-1.5 text-tinta-suave transition-colors hover:bg-papel hover:text-tinta"
    >
      {children}
    </Link>
  )
}

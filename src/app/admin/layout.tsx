import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { Shell } from '@/components/ui/Shell'

/**
 * Marco de las pantallas de administración.
 *
 * La guarda de rol está aquí y no en cada página: una pantalla nueva de
 * admin no puede quedarse sin protección por olvido. La comprobación real
 * sigue viviendo en RLS —esto solo evita enseñar formularios que de todos
 * modos no podrían guardar nada.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await requireRole('admin')

  return (
    <Shell profile={profile}>
      <div className="mx-auto max-w-4xl">
        <h1 className="text-lg font-semibold tracking-tight">Administración</h1>

        <nav className="mt-3 mb-6 flex gap-1 border-b border-linea text-sm">
          <Pestaña href="/admin/temas">Temas</Pestaña>
          <Pestaña href="/admin/usuarios">Usuarios</Pestaña>
          <Pestaña href="/admin/documentos">Documentos</Pestaña>
          <Pestaña href="/admin/datasets">Datasets</Pestaña>
        </nav>

        {children}
      </div>
    </Shell>
  )
}

function Pestaña({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="-mb-px border-b-2 border-transparent px-3 py-1.5 text-tinta-suave transition-colors hover:border-linea hover:text-tinta"
    >
      {children}
    </Link>
  )
}

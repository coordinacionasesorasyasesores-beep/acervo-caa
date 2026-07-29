import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type Role = 'lector' | 'cargador' | 'admin'

export type SessionProfile = {
  id: string
  email: string
  fullName: string | null
  role: Role
}

/** Perfil de quien está en sesión, o null si no hay sesión. */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', user.id)
    .single()

  return {
    id: user.id,
    email: user.email ?? '',
    fullName: profile?.full_name ?? null,
    // Si el perfil aún no existe, el rol más restrictivo es el correcto.
    role: (profile?.role as Role) ?? 'lector',
  }
}

/** Igual, pero manda al login si no hay sesión. Para páginas privadas. */
export async function requireSession(): Promise<SessionProfile> {
  const profile = await getSessionProfile()
  if (!profile) redirect('/login')
  return profile
}

/**
 * Exige un rol mínimo. La comprobación real vive en RLS —esto solo
 * evita mostrar pantallas que de todos modos no podrían guardar nada.
 */
export async function requireRole(...roles: Role[]): Promise<SessionProfile> {
  const profile = await requireSession()
  if (!roles.includes(profile.role)) redirect('/')
  return profile
}

export const ROLE_LABEL: Record<Role, string> = {
  lector: 'Lector',
  cargador: 'Cargador',
  admin: 'Administrador',
}

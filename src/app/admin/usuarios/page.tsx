import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PanelUsuarios } from './PanelUsuarios'

export default async function UsuariosPage() {
  const yo = await requireRole('admin')
  const supabase = await createClient()

  const [{ data: perfiles }, { data: lista }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, role').order('full_name'),
    supabase.from('access_list').select('email, role, note, added_at').order('email'),
  ])

  return (
    <div>
      <p className="mb-5 text-sm leading-relaxed text-tinta-suave">
        Son dos cosas distintas. La <strong className="font-medium">lista de acceso</strong>{' '}
        decide quién puede registrarse: un correo que no esté ahí no consigue
        entrar ni conociendo la dirección del proyecto. El{' '}
        <strong className="font-medium">rol</strong> decide qué puede hacer quien
        ya entró.
      </p>

      <PanelUsuarios
        yo={yo.id}
        perfiles={(perfiles ?? []) as never}
        lista={(lista ?? []) as never}
      />
    </div>
  )
}

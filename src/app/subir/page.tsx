import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Shell } from '@/components/ui/Shell'
import { SubirCliente } from '@/components/upload/SubirCliente'
import type { Catalogos } from '@/lib/catalogos'

export default async function SubirPage() {
  const profile = await requireRole('cargador', 'admin')
  const supabase = await createClient()

  const [topics, docTypes, docUses, personas] = await Promise.all([
    supabase.from('topics').select('*').order('position'),
    supabase.from('doc_types').select('id, slug, name').order('position'),
    supabase.from('doc_uses').select('id, slug, name').order('position'),
    supabase.from('profiles').select('id, full_name').order('full_name'),
  ])

  const catalogos: Catalogos = {
    topics: topics.data ?? [],
    docTypes: docTypes.data ?? [],
    docUses: docUses.data ?? [],
    personas: personas.data ?? [],
  }

  return (
    <Shell profile={profile}>
      <div className="mx-auto max-w-3xl">
        <h1 className="text-lg font-semibold tracking-tight">Subir documentos</h1>
        <p className="mt-1 mb-6 text-sm leading-relaxed text-tinta-suave">
          El contenido se lee en tu navegador y el archivo sube directo al
          almacén. Puedes arrastrar varios a la vez y llenar los datos de cada
          uno mientras los demás terminan de subir.
        </p>

        <SubirCliente catalogos={catalogos} usuarioId={profile.id} />
      </div>
    </Shell>
  )
}

import { createClient } from '@/lib/supabase/server'
import { PanelTemas } from './PanelTemas'

export default async function TemasPage() {
  const supabase = await createClient()

  const [{ data: topics }, { data: usos }] = await Promise.all([
    supabase.from('topics').select('*').order('position'),
    // Cuántos documentos cuelgan de cada tema: el dato que decide si
    // renombrar es inocuo o si conviene pensárselo dos veces.
    supabase.rpc('topic_counts', { p_statuses: ['publicado', 'archivado', 'borrador'] }),
  ])

  const conteos = new Map<number, number>(
    ((usos ?? []) as { topic_id: number; cuantos: number }[]).map((c) => [
      c.topic_id,
      Number(c.cuantos),
    ]),
  )

  return (
    <div>
      <p className="mb-5 text-sm leading-relaxed text-tinta-suave">
        El catálogo de temas es cerrado y de dos niveles: solo un
        administrador lo edita, y lo más fino que un subtema son las
        etiquetas, que sí son libres. Un tema no se borra —los documentos
        que cuelgan de él se quedarían sin clasificar—; si dejó de servir,
        renómbralo o déjalo vacío.
      </p>

      <PanelTemas
        topics={(topics ?? []) as never}
        conteos={Array.from(conteos.entries())}
      />
    </div>
  )
}

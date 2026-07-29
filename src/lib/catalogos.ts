export type Topic = {
  id: number
  parent_id: number | null
  slug: string
  name: string
  position: number
}

export type Catalogo = { id: number; slug: string; name: string }

export type Persona = { id: string; full_name: string | null }

export type Catalogos = {
  topics: Topic[]
  docTypes: Catalogo[]
  docUses: Catalogo[]
  personas: Persona[]
}

/** "Salud y servicios › Medicamentos e insumos", para los desplegables. */
export function rutaDeTema(topics: Topic[], id: number): string {
  const tema = topics.find((t) => t.id === id)
  if (!tema) return ''
  if (!tema.parent_id) return tema.name
  const padre = topics.find((t) => t.id === tema.parent_id)
  return padre ? `${padre.name} › ${tema.name}` : tema.name
}

/** Los temas ordenados como se leen: padre, luego sus hijos. */
export function temasEnOrden(topics: Topic[]): Topic[] {
  const raiz = topics
    .filter((t) => t.parent_id === null)
    .sort((a, b) => a.position - b.position)

  return raiz.flatMap((padre) => [
    padre,
    ...topics
      .filter((t) => t.parent_id === padre.id)
      .sort((a, b) => a.position - b.position),
  ])
}

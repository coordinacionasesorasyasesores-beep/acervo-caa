-- ════════════════════════════════════════════════════════════════
-- Consulta: búsqueda de texto completo, facetas y árbol de temas
--
-- SECURITY INVOKER como el resto: RLS decide qué documentos ve cada
-- quien, y el buscador no puede ser la rendija por la que se vean los
-- borradores ajenos.
-- ════════════════════════════════════════════════════════════════

-- ── Un tema incluye a sus hijos ──────────────────────────────────
-- Filtrar por "Salud y servicios" tiene que traer lo que está en
-- "Medicamentos e insumos". Quien navega el árbol lateral hace clic en
-- el padre esperando ver todo lo de abajo, no una carpeta vacía.
create or replace function public.topic_con_hijos(p_topic_ids int[])
returns int[]
language sql
stable
as $$
  select coalesce(array_agg(distinct t.id), '{}')
  from public.topics t
  where t.id = any(p_topic_ids)
     or t.parent_id = any(p_topic_ids);
$$;

-- ── Búsqueda ─────────────────────────────────────────────────────
-- El ranking suma las dos mitades del índice (§5.5): el título pesa A,
-- el resumen y las etiquetas B, el contenido C. `ts_rank_cd` y no
-- `ts_rank` porque premia que los términos aparezcan juntos, que es lo
-- que distingue un documento *sobre* el tema de uno que lo menciona.
--
-- El fragmento sale de `text_excerpt`, que son los primeros 30 KB del
-- texto. Si el término aparece más allá, `ts_headline` devuelve el
-- principio del extracto sin resaltar nada; por eso se detecta ese caso
-- y se cae al resumen del documento. Nunca un resultado sin contexto.
create or replace function public.search_documents(
  p_query      text    default null,
  p_topic_ids  int[]   default null,
  p_years      int[]   default null,
  p_type_ids   int[]   default null,
  p_use_ids    int[]   default null,
  p_areas      text[]  default null,
  p_statuses   text[]  default null,
  p_order      text    default 'relevancia',
  p_limit      int     default 20,
  p_offset     int     default 0
)
returns table (
  id uuid,
  title text,
  summary text,
  year int,
  area text,
  status text,
  updated_at timestamptz,
  doc_type text,
  doc_use text,
  primary_topic text,
  primary_topic_parent text,
  owner_name text,
  version_no int,
  filename text,
  mime text,
  size_bytes bigint,
  fragmento text,
  fragmento_es_resumen boolean,
  relevancia real,
  total bigint
)
language sql
stable
as $$
  with consulta as (
    select case
             when coalesce(trim(p_query), '') = '' then null
             else websearch_to_tsquery('spanish', p_query)
           end as q
  ),
  temas as (
    select case
             when p_topic_ids is null then null
             else public.topic_con_hijos(p_topic_ids)
           end as ids
  ),
  base as (
    select
      d.*,
      v.version_no, v.filename, v.mime, v.size_bytes, v.text_excerpt,
      case
        when c.q is null then 0::real
        else coalesce(ts_rank_cd(d.search_vector, c.q), 0)
           + coalesce(ts_rank_cd(v.search_vector, c.q), 0)
      end as relevancia
    from public.documents d
    left join public.versions v on v.id = d.current_version_id
    cross join consulta c
    cross join temas t
    where
      -- Sin estatus pedido se ven los publicados. El archivado no
      -- desaparece (regla 2), pero tampoco estorba: hay que pedirlo.
      d.status = any(coalesce(p_statuses, array['publicado']))
      and (c.q is null
           or d.search_vector @@ c.q
           or v.search_vector @@ c.q)
      and (t.ids is null
           or exists (select 1 from public.document_topics dt
                      where dt.document_id = d.id and dt.topic_id = any(t.ids)))
      and (p_years    is null or d.year        = any(p_years))
      and (p_type_ids is null or d.doc_type_id = any(p_type_ids))
      and (p_use_ids  is null or d.doc_use_id  = any(p_use_ids))
      and (p_areas    is null or d.area        = any(p_areas))
  ),
  contado as (select count(*) as n from base)
  select
    b.id, b.title, b.summary, b.year, b.area, b.status, b.updated_at,
    dt.name, du.name,
    tp.name,
    (select p.name from public.topics p where p.id = tp.parent_id),
    pr.full_name,
    b.version_no, b.filename, b.mime, b.size_bytes,
    coalesce(nullif(cabecera.texto, ''), b.summary, ''),
    cabecera.texto is null or cabecera.texto = '',
    b.relevancia,
    contado.n
  from base b
  cross join contado
  cross join consulta c
  join public.doc_types dt on dt.id = b.doc_type_id
  join public.topics    tp on tp.id = b.primary_topic_id
  left join public.doc_uses du on du.id = b.doc_use_id
  left join public.profiles pr on pr.id = b.owner_id
  cross join lateral (
    select case
             when c.q is null or b.text_excerpt is null then null
             -- Sin coincidencia dentro del extracto, ts_headline
             -- devolvería el principio del texto sin marcar nada: eso
             -- es ruido, no contexto.
             when not (to_tsvector('spanish', b.text_excerpt) @@ c.q) then null
             else ts_headline(
               'spanish', b.text_excerpt, c.q,
               'StartSel=«, StopSel=», MaxFragments=2, FragmentDelimiter=" … ", MaxWords=28, MinWords=12'
             )
           end as texto
  ) cabecera
  order by
    case when p_order = 'relevancia' then b.relevancia end desc nulls last,
    b.updated_at desc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;

-- ── Facetas ──────────────────────────────────────────────────────
-- Cada faceta se cuenta aplicando todos los filtros **menos el suyo**.
-- Contarlas con el propio filtro puesto dejaría "2026" como el único
-- año visible en cuanto alguien lo eligiera, y ya no habría forma de
-- ver qué más hay ni de cambiar de opinión sin borrar el filtro.
create or replace function public.search_facets(
  p_query     text    default null,
  p_topic_ids int[]   default null,
  p_years     int[]   default null,
  p_type_ids  int[]   default null,
  p_use_ids   int[]   default null,
  p_areas     text[]  default null,
  p_statuses  text[]  default null
)
returns table (
  dimension text,
  valor text,
  etiqueta text,
  cuantos bigint
)
language sql
stable
as $$
  with consulta as (
    select case
             when coalesce(trim(p_query), '') = '' then null
             else websearch_to_tsquery('spanish', p_query)
           end as q
  ),
  temas as (
    select case
             when p_topic_ids is null then null
             else public.topic_con_hijos(p_topic_ids)
           end as ids
  ),
  -- El conjunto sin ningún filtro de faceta: el texto y el tema sí se
  -- aplican siempre, porque son la navegación, no una faceta.
  base as (
    select d.id, d.year, d.area, d.status, d.doc_type_id, d.doc_use_id
    from public.documents d
    left join public.versions v on v.id = d.current_version_id
    cross join consulta c
    cross join temas t
    where (c.q is null or d.search_vector @@ c.q or v.search_vector @@ c.q)
      and (t.ids is null
           or exists (select 1 from public.document_topics dt
                      where dt.document_id = d.id and dt.topic_id = any(t.ids)))
  ),
  -- Un predicado por dimensión, para poder apagar el propio.
  filtrado as (
    select b.*,
      (b.status      = any(coalesce(p_statuses, array['publicado']))) as ok_status,
      (p_years    is null or b.year        = any(p_years))            as ok_year,
      (p_type_ids is null or b.doc_type_id = any(p_type_ids))         as ok_type,
      (p_use_ids  is null or b.doc_use_id  = any(p_use_ids))          as ok_use,
      (p_areas    is null or b.area        = any(p_areas))            as ok_area
    from base b
  )
  select 'year', f.year::text, f.year::text, count(*)
  from filtrado f
  where f.year is not null and f.ok_status and f.ok_type and f.ok_use and f.ok_area
  group by f.year

  union all
  select 'type', f.doc_type_id::text, dt.name, count(*)
  from filtrado f join public.doc_types dt on dt.id = f.doc_type_id
  where f.ok_status and f.ok_year and f.ok_use and f.ok_area
  group by f.doc_type_id, dt.name

  union all
  select 'use', f.doc_use_id::text, du.name, count(*)
  from filtrado f join public.doc_uses du on du.id = f.doc_use_id
  where f.ok_status and f.ok_year and f.ok_type and f.ok_area
  group by f.doc_use_id, du.name

  union all
  select 'area', f.area, f.area, count(*)
  from filtrado f
  where f.area is not null and f.area <> ''
    and f.ok_status and f.ok_year and f.ok_type and f.ok_use
  group by f.area

  union all
  select 'status', f.status, f.status, count(*)
  from filtrado f
  where f.ok_year and f.ok_type and f.ok_use and f.ok_area
  group by f.status

  order by 1, 4 desc, 3;
$$;

-- ── Cuántos documentos cuelgan de cada tema ──────────────────────
-- Para el árbol lateral: un tema sin documentos se enseña apagado en
-- lugar de esconderse, porque el catálogo es la estructura del acervo
-- y saber que algo está vacío también informa.
create or replace function public.topic_counts(p_statuses text[] default null)
returns table (topic_id int, cuantos bigint)
language sql
stable
as $$
  select dt.topic_id, count(distinct dt.document_id)
  from public.document_topics dt
  join public.documents d on d.id = dt.document_id
  where d.status = any(coalesce(p_statuses, array['publicado']))
  group by dt.topic_id;
$$;

-- ════════════════════════════════════════════════════════════════
-- Las sugerencias devuelven el tipo de archivo
-- ════════════════════════════════════════════════════════════════

-- El desplegable enseña un icono por formato, y el icono tiene que salir
-- del archivo de verdad, no del tipo documental. No es lo mismo: "Base de
-- datos" es lo que el documento *es* para el acervo, y casi siempre viene
-- en un .xlsx, pero nada impide que alguien suba una base como PDF. Si el
-- icono se dedujera del tipo documental, mentiría justo en el caso raro,
-- que es cuando más importa.
--
-- Cambia la lista de columnas devueltas, así que hay que tirar la función:
-- `create or replace` no puede cambiar el tipo de retorno.
drop function if exists public.sugerencias(text, int);

create function public.sugerencias(
  p_query text,
  p_limit int default 6
)
returns table (
  tipo text,
  id text,
  etiqueta text,
  detalle text,
  cuantos bigint,
  mime text,
  filename text
)
language sql
stable
as $$
  with q as (select public.consulta_de_prefijo(p_query) as tq)
  (
    select
      'documento',
      d.id::text,
      d.title,
      dt.name || coalesce(' · ' || d.year::text, ''),
      null::bigint,
      v.mime,
      v.filename
    from public.documents d
    join public.doc_types dt on dt.id = d.doc_type_id
    left join public.versions v on v.id = d.current_version_id
    cross join q
    where q.tq is not null
      and d.status = 'publicado'
      and (d.search_vector @@ q.tq or v.search_vector @@ q.tq)
    order by
      -- El título pesa más que el contenido: quien escribe "concentrado"
      -- busca el documento que se llama así, no los que lo mencionan.
      ts_rank_cd(d.search_vector, q.tq) * 3 + coalesce(ts_rank_cd(v.search_vector, q.tq), 0) desc,
      d.updated_at desc
    limit greatest(p_limit, 1)
  )
  union all
  (
    select
      'tema',
      t.id::text,
      case when p.name is not null then p.name || ' › ' || t.name else t.name end,
      null,
      count(distinct dt.document_id),
      null,
      null
    from public.topics t
    left join public.topics p on p.id = t.parent_id
    join public.document_topics dt on dt.topic_id = t.id
    join public.documents d on d.id = dt.document_id and d.status = 'publicado'
    cross join q
    where q.tq is not null
      and to_tsvector('spanish', t.name) @@ q.tq
    group by t.id, t.name, p.name
    order by count(distinct dt.document_id) desc
    limit 3
  );
$$;

-- ════════════════════════════════════════════════════════════════
-- Sugerencias mientras se escribe
-- ════════════════════════════════════════════════════════════════

-- La búsqueda normal usa `websearch_to_tsquery`, que trata cada palabra
-- como completa. Sirve cuando alguien terminó de escribir, y no sirve
-- mientras escribe: a la cuarta letra de "quirófanos" —"quir"— no hay
-- ninguna coincidencia, y la lista de sugerencias saldría vacía justo
-- cuando más se necesita.
--
-- Aquí la última palabra se convierte en prefijo (`quir:*`) y las
-- anteriores se exigen completas. Es lo que hace que la lista se vaya
-- estrechando letra por letra en lugar de aparecer de golpe al final.
create or replace function public.consulta_de_prefijo(p_query text)
returns tsquery
language plpgsql
immutable
as $$
declare
  v_palabras text[];
  v_partes text[] := '{}';
  v_i int;
begin
  -- Se parte por espacios y se descartan los caracteres que tsquery trata
  -- como operadores: escribir "obra & pública" no debe reventar la
  -- consulta ni, peor, significar algo que el usuario no pidió.
  v_palabras := regexp_split_to_array(
    regexp_replace(coalesce(trim(p_query), ''), '[^\w\sÀ-ſ]', ' ', 'g'),
    '\s+'
  );
  v_palabras := array_remove(v_palabras, '');

  if array_length(v_palabras, 1) is null then
    return null;
  end if;

  for v_i in 1 .. array_length(v_palabras, 1) loop
    if v_i = array_length(v_palabras, 1) then
      v_partes := v_partes || (quote_literal(v_palabras[v_i]) || ':*');
    else
      v_partes := v_partes || quote_literal(v_palabras[v_i]);
    end if;
  end loop;

  return to_tsquery('spanish', array_to_string(v_partes, ' & '));
exception when others then
  -- Una consulta a medio escribir puede ser sintácticamente imposible por
  -- un instante. Devolver null y no sugerir nada es mejor que un error en
  -- pantalla mientras alguien todavía está tecleando.
  return null;
end;
$$;

-- ── Lo que se ofrece debajo del buscador ─────────────────────────
-- Dos clases de sugerencia, y el orden importa: primero documentos
-- concretos —que es a lo que la gente viene— y después temas, que sirven
-- cuando no se busca un archivo sino un asunto.
--
-- SECURITY INVOKER como todo lo demás: sugerir un título que el usuario
-- no puede abrir sería filtrar por la puerta de atrás.
create or replace function public.sugerencias(
  p_query text,
  p_limit int default 6
)
returns table (
  tipo text,
  id text,
  etiqueta text,
  detalle text,
  cuantos bigint
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
      null::bigint
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
      count(distinct dt.document_id)
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

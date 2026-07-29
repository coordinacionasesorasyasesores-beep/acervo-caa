-- ════════════════════════════════════════════════════════════════
-- Operaciones transaccionales
--
-- Todas SECURITY INVOKER: corren con los permisos de quien llama, así
-- que RLS sigue mandando y un lector no puede escribir aunque invoque
-- el RPC directamente.
-- ════════════════════════════════════════════════════════════════

-- ── Índice de texto de una versión (peso C) ──────────────────────
create or replace function public.build_version_vector(p_text text)
returns tsvector
language sql
immutable
as $$
  select setweight(to_tsvector('spanish', coalesce(p_text, '')), 'C');
$$;

-- ── Alta de documento + primera versión ──────────────────────────
-- Regla de negocio 9. La FK es circular (documento → versión vigente
-- → documento), así que el alta son tres statements: documento sin
-- versión vigente, versión, y update que la apunta. En una función
-- para que sean una sola transacción; tres llamadas sueltas desde el
-- navegador dejarían documentos sin versión al primer fallo.
create or replace function public.create_document_with_version(
  p_document  jsonb,
  p_version   jsonb,
  p_topic_ids int[]   default '{}',
  p_tags      text[]  default '{}',
  p_text_full text    default null
)
returns uuid
language plpgsql
as $$
declare
  v_document_id uuid;
  v_version_id  uuid;
  v_uid uuid := (select auth.uid());
begin
  insert into public.documents (
    title, summary, year, area, source,
    doc_type_id, doc_use_id, primary_topic_id,
    owner_id, status, created_by
  ) values (
    p_document->>'title',
    p_document->>'summary',
    (p_document->>'year')::int,
    p_document->>'area',
    p_document->>'source',
    (p_document->>'doc_type_id')::int,
    (p_document->>'doc_use_id')::int,
    (p_document->>'primary_topic_id')::int,
    (p_document->>'owner_id')::uuid,
    coalesce(p_document->>'status', 'publicado'),
    v_uid
  )
  returning id into v_document_id;

  -- El tema principal lo agrega el trigger; aquí van los secundarios.
  if array_length(p_topic_ids, 1) is not null then
    insert into public.document_topics (document_id, topic_id)
    select v_document_id, unnest(p_topic_ids)
    on conflict do nothing;
  end if;

  if array_length(p_tags, 1) is not null then
    insert into public.document_tags (document_id, tag)
    select v_document_id, trim(unnest(p_tags))
    on conflict do nothing;
  end if;

  insert into public.versions (
    document_id, version_no, change_note,
    storage_key, text_key, text_excerpt,
    filename, mime, size_bytes, checksum, page_count,
    search_vector, upload_status, uploaded_by
  ) values (
    v_document_id, 1, p_version->>'change_note',
    p_version->>'storage_key',
    p_version->>'text_key',
    left(p_text_full, 30000),
    p_version->>'filename',
    p_version->>'mime',
    (p_version->>'size_bytes')::bigint,
    p_version->>'checksum',
    (p_version->>'page_count')::int,
    public.build_version_vector(p_text_full),
    coalesce(p_version->>'upload_status', 'confirmada'),
    v_uid
  )
  returning id into v_version_id;

  update public.documents
  set current_version_id = v_version_id
  where id = v_document_id;

  return v_document_id;
end;
$$;

-- ── Versión nueva de un documento existente ──────────────────────
-- Regla 1: mueve `current_version_id` y no toca título, temas ni el
-- enlace permanente. Regla 3: el índice y el extracto solo los
-- conserva la versión vigente.
create or replace function public.add_version(
  p_document_id uuid,
  p_version     jsonb,
  p_text_full   text    default null,
  p_make_current boolean default true
)
returns uuid
language plpgsql
as $$
declare
  v_version_id uuid;
  v_next_no int;
  v_uid uuid := (select auth.uid());
begin
  select coalesce(max(version_no), 0) + 1 into v_next_no
  from public.versions where document_id = p_document_id;

  insert into public.versions (
    document_id, version_no, change_note,
    storage_key, text_key, text_excerpt,
    filename, mime, size_bytes, checksum, page_count,
    search_vector, upload_status, uploaded_by
  ) values (
    p_document_id, v_next_no, p_version->>'change_note',
    p_version->>'storage_key',
    p_version->>'text_key',
    case when p_make_current then left(p_text_full, 30000) end,
    p_version->>'filename',
    p_version->>'mime',
    (p_version->>'size_bytes')::bigint,
    p_version->>'checksum',
    (p_version->>'page_count')::int,
    case when p_make_current then public.build_version_vector(p_text_full) end,
    coalesce(p_version->>'upload_status', 'confirmada'),
    v_uid
  )
  returning id into v_version_id;

  if p_make_current then
    -- Se limpia el índice y el extracto de la anterior: con catorce
    -- versiones indexadas la base se llena de copias del mismo texto.
    update public.versions
    set search_vector = null, text_excerpt = null
    where document_id = p_document_id and id <> v_version_id;

    update public.documents
    set current_version_id = v_version_id
    where id = p_document_id;
  end if;

  return v_version_id;
end;
$$;

-- ── Volver a una versión anterior ────────────────────────────────
-- Como el índice y el extracto se limpian al dejar de ser vigente, hay
-- que devolverlos aquí. `p_text_full` se relee desde R2 con el
-- `text_key` de la versión; si no se pasa, la versión queda vigente
-- pero fuera del buscador hasta que se reindexe.
create or replace function public.set_current_version(
  p_document_id uuid,
  p_version_id  uuid,
  p_text_full   text default null
)
returns void
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.versions
    where id = p_version_id and document_id = p_document_id
  ) then
    raise exception 'La versión no pertenece a ese documento';
  end if;

  update public.versions
  set search_vector = null, text_excerpt = null
  where document_id = p_document_id and id <> p_version_id;

  update public.versions
  set search_vector = public.build_version_vector(p_text_full),
      text_excerpt  = left(p_text_full, 30000)
  where id = p_version_id and p_text_full is not null;

  update public.documents
  set current_version_id = p_version_id
  where id = p_document_id;
end;
$$;

-- ── Duplicados por checksum ──────────────────────────────────────
-- Regla 10: si el archivo ya está, no se guarda en silencio.
create or replace function public.find_by_checksum(p_checksum text)
returns table (
  document_id uuid,
  document_title text,
  version_id uuid,
  version_no int,
  uploaded_at timestamptz,
  is_current boolean
)
language sql
stable
as $$
  select d.id, d.title, v.id, v.version_no, v.uploaded_at,
         (d.current_version_id = v.id)
  from public.versions v
  join public.documents d on d.id = v.document_id
  where v.checksum = p_checksum
  order by v.uploaded_at desc;
$$;

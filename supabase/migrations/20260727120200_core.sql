-- ════════════════════════════════════════════════════════════════
-- Núcleo: documentos, temas por documento, etiquetas y versiones
-- ════════════════════════════════════════════════════════════════

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text,
  year int,
  area text,
  source text,
  doc_type_id int not null references public.doc_types(id),
  doc_use_id int references public.doc_uses(id),
  primary_topic_id int not null references public.topics(id),
  owner_id uuid not null references public.profiles(id),   -- responde por el CONTENIDO
  status text not null default 'publicado'
    check (status in ('borrador','publicado','archivado')),
  current_version_id uuid,
  -- Parte A/B del índice: título, resumen y etiquetas. Vive aquí y no
  -- en `versions` porque cambia cuando alguien corrige los metadatos,
  -- momento en que el texto completo ya no está a la mano.
  search_vector tsvector,
  created_by uuid references public.profiles(id),          -- quien SUBIÓ el archivo
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.document_topics (
  document_id uuid not null references public.documents(id) on delete cascade,
  topic_id int not null references public.topics(id),
  primary key (document_id, topic_id)
);

create table public.document_tags (
  document_id uuid not null references public.documents(id) on delete cascade,
  tag text not null,
  primary key (document_id, tag)
);

create table public.versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version_no int not null,
  change_note text,
  storage_key text not null,
  text_key text,                       -- texto crudo completo, en R2
  text_excerpt text,                   -- ~30 KB, para ts_headline
  filename text,
  mime text,
  size_bytes bigint,
  checksum text,
  page_count int,
  -- Parte C del índice: solo el contenido del archivo. Inmutable una
  -- vez subido, porque el archivo tampoco cambia.
  search_vector tsvector,
  -- Ventana entre el PUT a R2 y el guardado: una versión 'pendiente'
  -- puede tener un objeto en R2 sin confirmar, o ninguno.
  upload_status text not null default 'pendiente'
    check (upload_status in ('pendiente','confirmada')),
  uploaded_by uuid references public.profiles(id),
  uploaded_at timestamptz not null default now(),
  unique (document_id, version_no)
);

alter table public.documents
  add constraint fk_current_version
  foreign key (current_version_id) references public.versions(id);

-- ── Índices ──────────────────────────────────────────────────────
create index documents_search_idx  on public.documents using gin (search_vector);
create index versions_search_idx   on public.versions  using gin (search_vector);
create index documents_topic_year_idx on public.documents (primary_topic_id, year desc);
create index document_topics_topic_idx on public.document_topics (topic_id);
create index versions_document_idx  on public.versions (document_id, version_no desc);
create index versions_checksum_idx  on public.versions (checksum) where checksum is not null;
create index documents_status_idx   on public.documents (status);

create trigger documents_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- ── El tema principal también vive en document_topics ────────────
-- Regla de negocio 8. El árbol lateral consulta `document_topics`;
-- si el principal solo estuviera en `documents.primary_topic_id`, el
-- documento no aparecería bajo su propio tema. En trigger y no en el
-- código de aplicación para que no dependa de que alguien lo recuerde.
create or replace function public.sync_primary_topic()
returns trigger
language plpgsql
as $$
begin
  insert into public.document_topics (document_id, topic_id)
  values (new.id, new.primary_topic_id)
  on conflict do nothing;
  return new;
end;
$$;

create trigger documents_sync_primary_topic
  after insert or update of primary_topic_id on public.documents
  for each row execute function public.sync_primary_topic();

-- ── Índice de búsqueda del documento (pesos A y B) ───────────────
-- Se recalcula cuando cambian título, resumen o etiquetas. No toca la
-- parte C, que pertenece a la versión y no cambia nunca.
create or replace function public.build_document_vector(p_document_id uuid)
returns void
language sql
as $$
  update public.documents d
  set search_vector =
        setweight(to_tsvector('spanish', coalesce(d.title, '')), 'A')
     || setweight(to_tsvector('spanish', coalesce(d.summary, '')), 'B')
     || setweight(to_tsvector('spanish', coalesce(
          (select string_agg(t.tag, ' ') from public.document_tags t
           where t.document_id = d.id), '')), 'B')
  where d.id = p_document_id;
$$;

create or replace function public.documents_refresh_vector()
returns trigger
language plpgsql
as $$
begin
  perform public.build_document_vector(new.id);
  return null;
end;
$$;

create trigger documents_vector_refresh
  after insert or update of title, summary on public.documents
  for each row execute function public.documents_refresh_vector();

create or replace function public.tags_refresh_vector()
returns trigger
language plpgsql
as $$
begin
  perform public.build_document_vector(coalesce(new.document_id, old.document_id));
  return null;
end;
$$;

create trigger document_tags_vector_refresh
  after insert or delete on public.document_tags
  for each row execute function public.tags_refresh_vector();

-- ── RLS ──────────────────────────────────────────────────────────
alter table public.documents       enable row level security;
alter table public.document_topics enable row level security;
alter table public.document_tags   enable row level security;
alter table public.versions        enable row level security;

-- Publicado y archivado los ve cualquiera —lo archivado "sigue
-- accesible por enlace directo"—; el borrador solo su autor, su
-- responsable y los admins.
create policy documents_select on public.documents
  for select to authenticated
  using (
    status in ('publicado','archivado')
    or created_by = (select auth.uid())
    or owner_id   = (select auth.uid())
    or public.is_admin()
  );

create policy documents_insert on public.documents
  for insert to authenticated
  with check (public.can_upload() and created_by = (select auth.uid()));

create policy documents_update on public.documents
  for update to authenticated
  using (public.is_admin() or (public.can_upload() and created_by = (select auth.uid())))
  with check (public.is_admin() or (public.can_upload() and created_by = (select auth.uid())));

-- Sin política de delete en ninguna tabla del núcleo: regla 2, nada
-- se borra. La ausencia de política ES la prohibición.

create policy versions_select on public.versions
  for select to authenticated
  using (exists (select 1 from public.documents d where d.id = document_id));

create policy versions_insert on public.versions
  for insert to authenticated
  with check (public.can_upload() and uploaded_by = (select auth.uid()));

create policy versions_update on public.versions
  for update to authenticated
  using (public.is_admin() or (public.can_upload() and uploaded_by = (select auth.uid())))
  with check (public.is_admin() or (public.can_upload() and uploaded_by = (select auth.uid())));

create policy document_topics_select on public.document_topics
  for select to authenticated
  using (exists (select 1 from public.documents d where d.id = document_id));

create policy document_topics_write on public.document_topics
  for all to authenticated
  using (public.is_admin() or exists (
    select 1 from public.documents d
    where d.id = document_id and d.created_by = (select auth.uid()) and public.can_upload()))
  with check (public.is_admin() or exists (
    select 1 from public.documents d
    where d.id = document_id and d.created_by = (select auth.uid()) and public.can_upload()));

create policy document_tags_select on public.document_tags
  for select to authenticated
  using (exists (select 1 from public.documents d where d.id = document_id));

create policy document_tags_write on public.document_tags
  for all to authenticated
  using (public.is_admin() or exists (
    select 1 from public.documents d
    where d.id = document_id and d.created_by = (select auth.uid()) and public.can_upload()))
  with check (public.is_admin() or exists (
    select 1 from public.documents d
    where d.id = document_id and d.created_by = (select auth.uid()) and public.can_upload()));

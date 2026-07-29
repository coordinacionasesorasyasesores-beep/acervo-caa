-- ════════════════════════════════════════════════════════════════
-- Bitácora de acceso
-- ════════════════════════════════════════════════════════════════

create table public.access_log (
  id bigserial primary key,
  user_id uuid references public.profiles(id),
  document_id uuid references public.documents(id),
  version_id uuid references public.versions(id),
  action text not null check (action in ('vista','preview','descarga')),
  at timestamptz not null default now()
);

create index access_log_at_idx       on public.access_log (at desc);
create index access_log_document_idx on public.access_log (document_id, at desc);

alter table public.access_log enable row level security;

-- Cada quien deja su propia huella; solo un admin lee la bitácora
-- completa. Sin update ni delete: un registro de acceso que se puede
-- editar no sirve como registro de acceso.
create policy access_log_insert_self on public.access_log
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy access_log_select_admin on public.access_log
  for select to authenticated
  using (public.is_admin());

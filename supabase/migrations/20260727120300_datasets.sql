-- ════════════════════════════════════════════════════════════════
-- Datasets: hojas de Excel promovidas por un administrador
-- El esquema existe desde F1; la interfaz es F3.
-- ════════════════════════════════════════════════════════════════

create table public.datasets (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.versions(id) on delete cascade,
  sheet_name text not null,
  notes text,
  curated_by uuid references public.profiles(id),
  curated_at timestamptz not null default now(),
  unique (version_id, sheet_name)
);

create table public.dataset_columns (
  id serial primary key,
  dataset_id uuid not null references public.datasets(id) on delete cascade,
  column_key text not null,
  label text not null,
  unit text,
  dtype text,
  topic_id int references public.topics(id),
  notes text,
  position int not null default 0,
  unique (dataset_id, column_key)
);

create table public.dataset_rows (
  id bigserial primary key,
  dataset_id uuid not null references public.datasets(id) on delete cascade,
  row_no int,
  data jsonb not null
);

create index dataset_rows_data_idx on public.dataset_rows using gin (data jsonb_path_ops);
create index dataset_rows_dataset_idx on public.dataset_columns (dataset_id, position);

-- ── RLS ──────────────────────────────────────────────────────────
-- Regla 7: un Excel solo es dataset si un admin lo promovió. Escritura
-- exclusiva de admin; lectura para todos.
alter table public.datasets        enable row level security;
alter table public.dataset_columns enable row level security;
alter table public.dataset_rows    enable row level security;

create policy datasets_select on public.datasets
  for select to authenticated using (true);
create policy datasets_write on public.datasets
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy dataset_columns_select on public.dataset_columns
  for select to authenticated using (true);
create policy dataset_columns_write on public.dataset_columns
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy dataset_rows_select on public.dataset_rows
  for select to authenticated using (true);
create policy dataset_rows_write on public.dataset_rows
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

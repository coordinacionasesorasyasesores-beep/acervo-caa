-- ════════════════════════════════════════════════════════════════
-- Catálogos cerrados: temas, tipos documentales y usos
-- ════════════════════════════════════════════════════════════════

create table public.topics (
  id serial primary key,
  parent_id int references public.topics(id),
  slug text unique not null,
  name text not null,
  position int not null default 0
);

create table public.doc_types (
  id serial primary key,
  slug text unique not null,
  name text not null,
  position int not null default 0
);

create table public.doc_uses (
  id serial primary key,
  slug text unique not null,
  name text not null,
  position int not null default 0
);

create index topics_parent_idx on public.topics (parent_id, position);

-- ── Máximo dos niveles ───────────────────────────────────────────
-- Regla de negocio 6. `parent_id` por sí solo admite jerarquía
-- infinita; sin esta guarda el árbol lateral se rompe en cuanto
-- alguien crea un nieto, y lo hará.
create or replace function public.topics_max_two_levels()
returns trigger
language plpgsql
as $$
begin
  -- No colgarse de un tema que ya es hijo.
  if new.parent_id is not null and exists (
    select 1 from public.topics where id = new.parent_id and parent_id is not null
  ) then
    raise exception 'Los temas admiten máximo dos niveles: tema › subtema';
  end if;

  -- No convertir en hijo a un tema que ya tiene hijos.
  if new.parent_id is not null and exists (
    select 1 from public.topics where parent_id = new.id
  ) then
    raise exception 'El tema "%" ya tiene subtemas; no puede volverse subtema', new.name;
  end if;

  -- Nadie es su propio padre.
  if new.parent_id = new.id then
    raise exception 'Un tema no puede ser su propio padre';
  end if;

  return new;
end;
$$;

create trigger topics_depth_guard
  before insert or update on public.topics
  for each row execute function public.topics_max_two_levels();

-- ── RLS ──────────────────────────────────────────────────────────
-- Catálogos cerrados: cualquiera los lee, solo admin los modifica.
alter table public.topics    enable row level security;
alter table public.doc_types enable row level security;
alter table public.doc_uses  enable row level security;

create policy topics_select on public.topics
  for select to authenticated using (true);
create policy topics_write on public.topics
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy doc_types_select on public.doc_types
  for select to authenticated using (true);
create policy doc_types_write on public.doc_types
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy doc_uses_select on public.doc_uses
  for select to authenticated using (true);
create policy doc_uses_write on public.doc_uses
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

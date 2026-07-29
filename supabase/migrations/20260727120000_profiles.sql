-- ════════════════════════════════════════════════════════════════
-- Perfiles, roles y utilidades comunes
-- ════════════════════════════════════════════════════════════════

-- ── Utilidad compartida: updated_at ──────────────────────────────
-- El `default now()` de una columna solo aplica al INSERT; sin este
-- trigger la fecha de actualización nunca cambia.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ── Admins iniciales ─────────────────────────────────────────────
-- Problema de arranque: `profiles.role` nace en 'lector' y solo un
-- admin puede promover a otro, así que el primer usuario quedaría
-- encerrado sin nadie que lo ascienda. Esta lista se siembra antes
-- del primer registro y `handle_new_user()` la consulta al alta.
create table public.bootstrap_admins (
  email text primary key,
  note  text
);
alter table public.bootstrap_admins enable row level security;
-- Sin políticas: nadie la lee ni la escribe desde la app. Solo se
-- toca desde migraciones y desde el trigger (security definer).

-- ── Perfiles ─────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'lector'
    check (role in ('lector','cargador','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ── Rol del usuario en sesión ────────────────────────────────────
-- SECURITY DEFINER a propósito: las políticas RLS necesitan leer el
-- rol, que vive en `profiles`. Si lo consultaran directamente, la
-- política de `profiles` se invocaría a sí misma y Postgres abortaría
-- por recursión infinita. Al ser definer, esta función lee la tabla
-- saltándose RLS y corta el ciclo. Todas las políticas usan a ella,
-- nunca un select directo a `profiles`.
create or replace function public.auth_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = (select auth.uid());
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select public.auth_role() = 'admin';
$$;

create or replace function public.can_upload()
returns boolean
language sql
stable
as $$
  select public.auth_role() in ('cargador','admin');
$$;

-- ── Alta automática de perfil ────────────────────────────────────
-- Supabase Auth crea la fila en `auth.users`, pero nada crea la de
-- `profiles`. Sin este trigger el usuario entra sin rol y toda
-- política RLS lo rechaza.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := 'lector';
begin
  if exists (
    select 1 from public.bootstrap_admins
    where lower(email) = lower(new.email)
  ) then
    v_role := 'admin';
  end if;

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    v_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Nadie se asciende a sí mismo ─────────────────────────────────
-- RLS decide qué filas puede tocar cada quien, pero no qué columnas.
-- Sin esto, un lector con permiso de editar su propio nombre podría
-- mandar `role = 'admin'` en el mismo update.
create or replace function public.guard_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Solo un administrador puede cambiar roles';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_role_change();

-- ── RLS ──────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

-- Todos ven a todos: la interfaz necesita listar personas para elegir
-- responsable y para mostrar autoría en el historial de versiones.
create policy profiles_select on public.profiles
  for select to authenticated
  using (true);

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());

-- Sin política de insert ni delete: las filas nacen del trigger y
-- mueren con el usuario en auth.users.

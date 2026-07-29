-- ════════════════════════════════════════════════════════════════
-- Lista de acceso
--
-- Cloudflare Access protege el dominio de la app, pero NO el API de
-- Supabase: `<ref>.supabase.co` responde desde cualquier parte de
-- internet con solo la llave anónima, que por definición es pública.
-- Sin esta lista, cualquiera puede pedir un código, darse de alta como
-- 'lector' y leer todo lo publicado sin pasar nunca por la reja.
--
-- La lista vive en la base para que la puerta sea la misma sin importar
-- por dónde se entre.
-- ════════════════════════════════════════════════════════════════

-- `bootstrap_admins` resolvía solo el arranque del primer admin. Ahora
-- hace las dos cosas: quién puede entrar y con qué rol.
alter table public.bootstrap_admins rename to access_list;

alter table public.access_list
  add column role text not null default 'lector'
    check (role in ('lector','cargador','admin'));

-- Los que ya estaban en la tabla eran, por definición, administradores.
update public.access_list set role = 'admin';

alter table public.access_list
  add column added_by uuid references public.profiles(id),
  add column added_at timestamptz not null default now();

-- ── El alta comprueba la lista ───────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role
  from public.access_list
  where lower(email) = lower(new.email);

  if v_role is null then
    raise exception 'El correo % no está dado de alta en el repositorio', new.email
      using errcode = 'insufficient_privilege';
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

-- ── RLS ──────────────────────────────────────────────────────────
-- Solo un admin ve y administra la lista (pantalla del sprint 6).
-- El trigger la consulta como security definer, así que no le afecta.
grant select, insert, update on public.access_list to authenticated;

create policy access_list_admin on public.access_list
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Quitar a alguien de la lista no borra su perfil ni su historial: le
-- cierra la puerta a futuras altas. Para revocar el acceso de alguien
-- que ya entró, se le cambia el rol o se le elimina de auth.users.

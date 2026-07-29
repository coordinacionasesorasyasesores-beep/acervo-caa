-- ════════════════════════════════════════════════════════════════
-- Permisos de tabla
--
-- RLS decide QUÉ FILAS ve cada quien, pero no da acceso a la tabla:
-- son dos capas distintas y hacen falta las dos. Sin estos GRANT,
-- toda consulta desde la app responde "permission denied" aunque las
-- políticas estén bien escritas.
-- ════════════════════════════════════════════════════════════════

grant usage on schema public to anon, authenticated;

-- Nótese que DELETE no se otorga a nadie: regla de negocio 2, nada se
-- borra. Queda bloqueado por permiso y además por ausencia de política.
grant select, insert, update on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- La lista de administradores iniciales no se toca desde la app: solo
-- desde migraciones y desde handle_new_user(), que es security definer.
revoke all on public.bootstrap_admins from anon, authenticated;

-- Sin sesión no se ve nada. Cloudflare Access ya filtra antes, pero la
-- base no depende de que esa reja siga en pie.
revoke all on all tables in schema public from anon;

-- Lo que se cree después hereda el mismo criterio.
alter default privileges in schema public
  grant select, insert, update on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;

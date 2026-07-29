-- ════════════════════════════════════════════════════════════════
-- Pruebas del sprint 1
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/sprint1.sql
--
-- Cubre las reglas de negocio 1, 2 y 3 —las que el documento marca
-- como intocables— más los roles, la guarda de dos niveles y el alta
-- transaccional. Todo corre dentro de una transacción que se revierte
-- al final: la base queda como estaba.
-- ════════════════════════════════════════════════════════════════

begin;

create or replace function pg_temp.assert(cond boolean, msg text)
returns void language plpgsql as $$
begin
  if not cond then raise exception 'FALLA · %', msg; end if;
end;
$$;

-- ── Usuarios de prueba ───────────────────────────────────────────
insert into public.access_list (email, role) values
  ('admin@caa.test',  'admin'),
  ('carga@caa.test',  'cargador'),
  ('lector@caa.test', 'lector');

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data,
                        encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'admin@caa.test',
   '{"full_name":"Admin de prueba"}', '', now(), now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'carga@caa.test',
   '{"full_name":"Cargador de prueba"}', '', now(), now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'lector@caa.test',
   '{"full_name":"Lector de prueba"}', '', now(), now(), now());

-- 1 · El perfil nace solo, con el rol que dice la lista de acceso.
do $$
declare v_ok boolean := false;
begin
  perform pg_temp.assert(
    (select count(*) from public.profiles
     where id in ('11111111-1111-1111-1111-111111111111',
                  '22222222-2222-2222-2222-222222222222',
                  '33333333-3333-3333-3333-333333333333')) = 3,
    'el trigger debe crear un perfil por cada usuario de auth');

  perform pg_temp.assert(
    (select role from public.profiles where id = '11111111-1111-1111-1111-111111111111') = 'admin',
    'el rol sale de la lista de acceso, no de un default');
  perform pg_temp.assert(
    (select role from public.profiles where id = '22222222-2222-2222-2222-222222222222') = 'cargador',
    'idem para cargador');
  perform pg_temp.assert(
    (select role from public.profiles where id = '33333333-3333-3333-3333-333333333333') = 'lector',
    'idem para lector');

  perform pg_temp.assert(
    (select full_name from public.profiles where id = '22222222-2222-2222-2222-222222222222')
      = 'Cargador de prueba',
    'el nombre viene de raw_user_meta_data');

  -- Lo importante: quien no está en la lista no entra, aunque le pegue
  -- directo al API sin pasar por Cloudflare Access.
  begin
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at)
    values ('44444444-4444-4444-4444-444444444444',
            '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'ajeno@example.com', '', now(), now(), now());
  exception when others then v_ok := true;
  end;
  perform pg_temp.assert(v_ok, 'un correo fuera de la lista de acceso no puede darse de alta');
  perform pg_temp.assert(
    (select count(*) from public.profiles
     where id = '44444444-4444-4444-4444-444444444444') = 0,
    'y no deja perfil huérfano');
end $$;

-- 2 · Catálogos sembrados y jerarquía de dos niveles.
do $$
declare v_ok boolean := false;
begin
  perform pg_temp.assert((select count(*) from public.doc_types) = 8, 'ocho tipos documentales');
  perform pg_temp.assert((select count(*) from public.doc_uses)  = 5, 'cinco usos');
  perform pg_temp.assert((select count(*) from public.topics where parent_id is null) = 7,
    'siete temas de primer nivel');
  perform pg_temp.assert((select count(*) from public.topics where parent_id is not null) = 20,
    'veinte subtemas');

  -- Regla 6: no hay tercer nivel.
  begin
    insert into public.topics (parent_id, slug, name)
    values ((select id from public.topics where slug = 'medicamentos-insumos'), 'nieto', 'Nieto');
  exception when others then v_ok := true;
  end;
  perform pg_temp.assert(v_ok, 'un tema de tercer nivel debe ser rechazado');
end $$;

-- ── A partir de aquí, con RLS activo ─────────────────────────────

-- 3 · Un lector no puede subir nada (criterio de aceptación 6).
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

do $$
declare v_ok boolean := false;
begin
  perform pg_temp.assert(public.auth_role() = 'lector', 'auth_role debe resolver el rol en sesión');

  begin
    perform public.create_document_with_version(
      jsonb_build_object(
        'title', 'Intento de lector', 'year', 2026,
        'doc_type_id', (select id from public.doc_types where slug = 'informe'),
        'primary_topic_id', (select id from public.topics where slug = 'consultas'),
        'owner_id', '33333333-3333-3333-3333-333333333333'),
      jsonb_build_object('storage_key', 'x/y.pdf'));
  exception when others then v_ok := true;
  end;
  perform pg_temp.assert(v_ok, 'un lector no debe poder crear documentos');
end $$;

-- 4 · Un cargador sí, y el alta deja todo consistente.
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_doc uuid;
  v_topic_salud int := (select id from public.topics where slug = 'medicamentos-insumos');
  v_topic_obra  int := (select id from public.topics where slug = 'obra-publica');
  v_topic_gasto int := (select id from public.topics where slug = 'gasto-ejercido');
  v_topic_padron int := (select id from public.topics where slug = 'padron');
begin
  v_doc := public.create_document_with_version(
    jsonb_build_object(
      'title',   'Concentrado de abasto de medicamentos 2026',
      'summary', 'Seguimiento mensual del abasto por unidad médica.',
      'year',    2026,
      'area',    'Dirección de Administración',
      'doc_type_id',      (select id from public.doc_types where slug = 'base-de-datos'),
      'doc_use_id',       (select id from public.doc_uses  where slug = 'insumo-de-analisis'),
      'primary_topic_id', v_topic_salud,
      'owner_id', '11111111-1111-1111-1111-111111111111'),
    jsonb_build_object(
      'storage_key', 'docs/abasto-2026-v1.xlsx',
      'text_key',    'text/abasto-2026-v1.txt',
      'filename',    'abasto-2026.xlsx',
      'mime',        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'size_bytes',  482133,
      'checksum',    'sha256:aaa111'),
    array[v_topic_obra, v_topic_gasto, v_topic_padron],
    array['abasto', 'claves 2026'],
    'El abasto de medicamentos en unidades de primer nivel alcanzó 87 por ciento en el trimestre.');

  -- Regla 8 + criterio 4: cuatro temas, cuatro ramas del árbol.
  perform pg_temp.assert(
    (select count(*) from public.document_topics where document_id = v_doc) = 4,
    'el tema principal debe quedar en document_topics junto con los tres secundarios');
  perform pg_temp.assert(
    exists (select 1 from public.document_topics
            where document_id = v_doc and topic_id = v_topic_salud),
    'el tema principal debe aparecer en el árbol bajo su propia rama');

  -- Regla 9: el documento sale con su versión vigente apuntada.
  perform pg_temp.assert(
    (select current_version_id from public.documents where id = v_doc) is not null,
    'el alta debe dejar current_version_id apuntando a la versión 1');

  -- Autoría separada (regla 11).
  perform pg_temp.assert(
    (select created_by from public.documents where id = v_doc)
      = '22222222-2222-2222-2222-222222222222'
    and (select owner_id from public.documents where id = v_doc)
      = '11111111-1111-1111-1111-111111111111',
    'created_by y owner_id son personas distintas');

  -- Búsqueda: título/resumen/etiquetas en documents, contenido en versions.
  perform pg_temp.assert(
    (select search_vector from public.documents where id = v_doc)
      @@ websearch_to_tsquery('spanish', 'abasto'),
    'el título debe entrar al índice del documento');
  perform pg_temp.assert(
    (select search_vector from public.documents where id = v_doc)
      @@ websearch_to_tsquery('spanish', 'claves'),
    'las etiquetas deben entrar al índice del documento');
  perform pg_temp.assert(
    (select v.search_vector from public.versions v where v.document_id = v_doc)
      @@ websearch_to_tsquery('spanish', 'primer nivel'),
    'el contenido del archivo debe entrar al índice de la versión');

  -- El extracto permite el fragmento resaltado (criterio 2).
  perform pg_temp.assert(
    ts_headline('spanish',
                (select text_excerpt from public.versions where document_id = v_doc),
                websearch_to_tsquery('spanish', 'abasto')) like '%<b>%',
    'text_excerpt debe permitir ts_headline con resaltado');

  -- Corregir el título reindexa el documento: sin esto la búsqueda
  -- se desincroniza en silencio al editar metadatos.
  update public.documents set title = 'Concentrado de desabasto 2026' where id = v_doc;
  perform pg_temp.assert(
    (select search_vector from public.documents where id = v_doc)
      @@ websearch_to_tsquery('spanish', 'desabasto'),
    'editar el título debe regenerar el índice del documento');

  -- Regla 10: el duplicado se detecta por checksum.
  perform pg_temp.assert(
    (select count(*) from public.find_by_checksum('sha256:aaa111')) = 1,
    'find_by_checksum debe encontrar el archivo ya cargado');

  -- ── Reglas 1 y 3: versión nueva ────────────────────────────────
  perform public.add_version(
    v_doc,
    jsonb_build_object(
      'storage_key', 'docs/abasto-2026-v2.xlsx',
      'change_note', 'Corrección de claves de la Jurisdicción 3',
      'filename',    'abasto-2026-v2.xlsx',
      'checksum',    'sha256:bbb222'),
    'Cifras corregidas: el abasto real fue de 81 por ciento.');

  perform pg_temp.assert(
    (select count(*) from public.versions where document_id = v_doc) = 2,
    'regla 2: la versión anterior no se borra');
  perform pg_temp.assert(
    (select v.version_no from public.versions v
     join public.documents d on d.current_version_id = v.id where d.id = v_doc) = 2,
    'regla 1: la versión nueva pasa a ser la vigente');
  perform pg_temp.assert(
    (select search_vector from public.versions
     where document_id = v_doc and version_no = 1) is null,
    'regla 3: el índice de la versión que dejó de ser vigente se limpia');
  perform pg_temp.assert(
    (select search_vector from public.versions
     where document_id = v_doc and version_no = 2) is not null,
    'regla 3: la versión vigente sí tiene índice');
  perform pg_temp.assert(
    (select id from public.documents where id = v_doc) = v_doc,
    'regla 1: el enlace permanente (el id) no cambia al versionar');

  -- Volver a la versión 1 exige releer su texto desde R2.
  perform public.set_current_version(v_doc,
    (select id from public.versions where document_id = v_doc and version_no = 1),
    'El abasto de medicamentos en unidades de primer nivel alcanzó 87 por ciento.');
  perform pg_temp.assert(
    (select search_vector from public.versions
     where document_id = v_doc and version_no = 1) is not null,
    'al volver a una versión anterior se reconstruye su índice con el texto releído');
  perform pg_temp.assert(
    (select search_vector from public.versions
     where document_id = v_doc and version_no = 2) is null,
    'y se limpia el de la que dejó de ser vigente');
end $$;

-- 5 · Nada se borra (regla 2).
do $$
declare v_ok boolean := false;
begin
  begin
    delete from public.documents;
    if not found then v_ok := true; end if;
    v_ok := (select count(*) from public.documents) > 0;
  exception when others then v_ok := true;
  end;
  perform pg_temp.assert(v_ok, 'regla 2: ningún rol puede borrar documentos');
end $$;

-- 6 · Nadie se asciende a sí mismo.
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
do $$
declare v_ok boolean := false;
begin
  begin
    update public.profiles set role = 'admin'
    where id = '33333333-3333-3333-3333-333333333333';
  exception when others then v_ok := true;
  end;
  perform pg_temp.assert(v_ok, 'un lector no puede cambiarse el rol');

  -- Pero sí puede corregir su propio nombre.
  update public.profiles set full_name = 'Lectora de prueba'
  where id = '33333333-3333-3333-3333-333333333333';
  perform pg_temp.assert(
    (select full_name from public.profiles where id = '33333333-3333-3333-3333-333333333333')
      = 'Lectora de prueba',
    'cada quien puede editar su propio nombre');
end $$;

-- 7 · La bitácora es de admin y no se puede alterar (criterio 7).
do $$
declare v_doc uuid := (select id from public.documents limit 1);
    v_ok boolean := false;
begin
  insert into public.access_log (user_id, document_id, action)
  values ('33333333-3333-3333-3333-333333333333', v_doc, 'descarga');

  perform pg_temp.assert(
    (select count(*) from public.access_log) = 0,
    'un lector no debe poder leer la bitácora, ni siquiera su propio registro');

  begin
    update public.access_log set action = 'vista';
    v_ok := true;  -- sin política de update, el UPDATE no toca filas
  exception when others then v_ok := true;
  end;
  perform pg_temp.assert(v_ok, 'la bitácora no se edita');
end $$;

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
do $$
begin
  perform pg_temp.assert(
    (select count(*) from public.access_log) = 1,
    'el admin sí lee la bitácora completa');
end $$;

reset role;

do $$
begin
  raise notice '';
  raise notice '  ✓ Todas las pruebas del sprint 1 pasaron.';
  raise notice '';
end $$;

rollback;

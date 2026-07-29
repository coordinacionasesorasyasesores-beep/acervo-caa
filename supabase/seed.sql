-- ════════════════════════════════════════════════════════════════
-- Catálogos iniciales. Idempotente: se puede volver a correr.
-- ════════════════════════════════════════════════════════════════

-- ── Lista de acceso ──────────────────────────────────────────────
-- Quién puede entrar y con qué rol. Un correo que no esté aquí no
-- puede darse de alta, ni siquiera pegándole directo al API de
-- Supabase: Cloudflare Access no cubre ese camino.
--
-- El rol se asigna en el momento del alta, así que hay que agregar a
-- la persona ANTES de que se registre. A quien ya se registró se le
-- cambia el rol con un update sobre `profiles`.
insert into public.access_list (email, role, note) values
  ('contacto.ivanserrano@gmail.com', 'admin', 'Administrador inicial')
on conflict (email) do nothing;

-- ── Tipos documentales ───────────────────────────────────────────
insert into public.doc_types (slug, name, position) values
  ('investigacion',    'Investigación',    1),
  ('presentacion',     'Presentación',     2),
  ('base-de-datos',    'Base de datos',    3),
  ('informe',          'Informe',          4),
  ('lamina-grafico',   'Lámina o gráfico', 5),
  ('minuta',           'Minuta',           6),
  ('normativa',        'Normativa',        7),
  ('formato',          'Formato',          8)
on conflict (slug) do nothing;

-- ── Usos ─────────────────────────────────────────────────────────
insert into public.doc_uses (slug, name, position) values
  ('insumo-de-analisis',      'Insumo de análisis',      1),
  ('material-de-capacitacion','Material de capacitación',2),
  ('entregable-oficial',      'Entregable oficial',      3),
  ('referencia',              'Referencia',              4),
  ('documento-de-trabajo',    'Documento de trabajo',    5)
on conflict (slug) do nothing;

-- ── Temas, nivel 1 ───────────────────────────────────────────────
insert into public.topics (slug, name, position) values
  ('salud-servicios',           'Salud y servicios',            1),
  ('infraestructura-obra',      'Infraestructura y obra',       2),
  ('presupuesto-finanzas',      'Presupuesto y finanzas',       3),
  ('derechohabiencia',          'Derechohabiencia y cobertura', 4),
  ('gestion-interna',           'Gestión y recursos internos',  5),
  ('comunicacion',              'Comunicación institucional',   6),
  ('normatividad-planeacion',   'Normatividad y planeación',    7)
on conflict (slug) do nothing;

-- ── Temas, nivel 2 ───────────────────────────────────────────────
insert into public.topics (parent_id, slug, name, position)
select p.id, x.slug, x.name, x.position
from (values
  ('salud-servicios',         'consultas',                 'Consultas',                    1),
  ('salud-servicios',         'camas',                     'Camas',                        2),
  ('salud-servicios',         'medicamentos-insumos',      'Medicamentos e insumos',       3),
  ('salud-servicios',         'personal-medico',           'Personal médico',              4),

  ('infraestructura-obra',    'obra-publica',              'Obra pública',                 1),
  ('infraestructura-obra',    'unidades-medicas',          'Unidades médicas',             2),
  ('infraestructura-obra',    'equipamiento',              'Equipamiento',                 3),

  ('presupuesto-finanzas',    'gasto-ejercido',            'Gasto ejercido',               1),
  ('presupuesto-finanzas',    'programas-inversion',       'Programas de inversión',       2),

  ('derechohabiencia',        'padron',                    'Padrón',                       1),
  ('derechohabiencia',        'acceso-servicios',          'Acceso a servicios',           2),

  ('gestion-interna',         'plantilla-personal',        'Plantilla y personal',         1),
  ('gestion-interna',         'formacion-capacitacion',    'Formación y capacitación',     2),
  ('gestion-interna',         'procedimientos-formatos',   'Procedimientos y formatos',    3),
  ('gestion-interna',         'manuales-guias',            'Manuales y guías',             4),

  ('comunicacion',            'boletines',                 'Boletines',                    1),
  ('comunicacion',            'liderazgos',                'Liderazgos',                   2),
  ('comunicacion',            'redes',                     'Redes',                        3),

  ('normatividad-planeacion', 'programas-institucionales', 'Programas institucionales',    1),
  ('normatividad-planeacion', 'marco-juridico',            'Marco jurídico',               2)
) as x(parent_slug, slug, name, position)
join public.topics p on p.slug = x.parent_slug
on conflict (slug) do nothing;

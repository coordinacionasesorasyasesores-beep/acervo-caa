-- ════════════════════════════════════════════════════════════════
-- Tope de texto para el índice
--
-- Postgres rechaza un tsvector de más de 1 MB. Un concentrado de Excel
-- con decenas de miles de filas lo rebasa sin esfuerzo, y el error
-- aparecería justo al guardar, después de que el archivo ya subió: el
-- peor momento posible.
--
-- Se indexan los primeros 500 000 caracteres, que dan un vector holgado
-- por debajo del límite. El texto completo sigue yendo entero a R2, así
-- que no se pierde nada: solo deja de ser buscable la cola de los
-- documentos muy largos, donde de todos modos casi nunca se busca.
-- ════════════════════════════════════════════════════════════════

create or replace function public.build_version_vector(p_text text)
returns tsvector
language sql
immutable
as $$
  select setweight(to_tsvector('spanish', coalesce(left(p_text, 500000), '')), 'C');
$$;

# Repositorio de Investigaciones — CAA / ISSSTE

Documento maestro del proyecto. Sirve como contexto permanente para Claude Code:
mantenerlo en la raíz del repo y actualizarlo cuando una decisión cambie.

**Estado:** sprints 1, 2 y 4 terminados y verificados en local; sprint 1 además
desplegado en `repositorio-caa`. Sprint 3 escrito pero **sin una sola llamada real a
la API** — falta `ANTHROPIC_API_KEY` y quedó pospuesto a propósito.
**Última actualización:** 29 de julio de 2026 · rev. 6 (sprint 4 terminado).

**Proyecto de Supabase:** `repositorio-caa` · ref `mmqqtpixmjbdaxmvksoz` · us-east-2 ·
organización ISSSTE-FREE_PROJECT (plan gratuito).

---

## 1. Objetivo

Aplicación web donde el equipo de la Coordinación de Asesoras y Asesores (CAA)
del ISSSTE sube, organiza y consulta todas sus investigaciones y documentos de
trabajo: PDF, Word, Excel y presentaciones.

La prioridad, en este orden:

1. Que la información esté **actualizada** — que siempre se sepa cuál es la versión buena.
2. Que subir sea **rápido** — si cuesta trabajo, la gente deja de hacerlo.
3. Que consultar sea **fácil** — buscador y navegación que respondan en segundos.

Todo lo demás (dashboard, datasets, búsqueda semántica) es secundario y va después.

### El problema que resuelve

Hoy los documentos viven en carpetas locales, correos y WhatsApp. Nadie sabe cuál
es la versión vigente de un archivo que ha pasado por catorce revisiones, y la
pregunta "¿quién tiene el Excel actualizado?" se repite cada semana. El sistema
existe para que esa pregunta desaparezca.

### Usuarios

De 5 a 15 personas del equipo de la CAA. Uso interno. No hay acceso público.

---

## 2. Decisiones de arquitectura (cerradas)

Estas decisiones ya se tomaron. No proponer alternativas salvo que algo resulte
técnicamente inviable durante la implementación.

| Capa | Elección | Notas |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind | |
| Hosting app | Cloudflare Pages / Workers | Adaptador OpenNext para Cloudflare |
| Base de datos | Supabase (plan gratuito, organización nueva) | Postgres + Auth + RLS |
| Archivos | Cloudflare R2 | 10 GB gratis, sin cargo por egress |
| Puerta de acceso | Cloudflare Access | Lista de correos institucionales |
| Extracción de texto | En el navegador, al subir | Sin worker de servidor |
| Metadatos automáticos | Claude API (`claude-haiku-4-5`) | Ruta de servidor |
| Respaldo | GitHub Actions → R2, diario | El plan gratuito no incluye backups |

### Por qué el texto se extrae en el navegador

Supabase Edge Functions corre Deno: no se puede instalar LibreOffice ni tesseract.
Montar un worker de conversión implicaría un servidor propio, que es justo lo que
se decidió evitar. La extracción en cliente elimina esa pieza por completo.

Consecuencia aceptada: **no hay previews renderizados de PowerPoint** en la v1
(queda ficha + descarga) y **los PDF escaneados no entran al buscador** hasta que
se agregue OCR. Ambas cosas están en el roadmap, no en F1.

### Límites del plan gratuito a vigilar

- Supabase: 500 MB de base de datos, 5 GB de egress, 2 proyectos activos por organización.
- R2: 10 GB de almacenamiento; sin cargo por egress.
- Al rebasar un límite, Supabase avisa al 80% y después de un periodo de gracia
  puede pasar a solo-lectura o bloquear subidas.

Por eso **el texto crudo completo va a R2**, y el índice de búsqueda solo se genera
para la versión vigente. Sin esa regla, el concentrado con catorce versiones
cargaría catorce veces el mismo texto en la base.

En Postgres quedan dos cosas por versión vigente: el `tsvector` para buscar y un
**`text_excerpt` de ~30 KB** para generar los fragmentos resaltados. El `tsvector`
no es reversible —no se puede reconstruir texto a partir de él—, así que sin el
extracto la búsqueda no podría mostrar el contexto de la coincidencia, que es un
criterio de aceptación. Consecuencia aceptada: si el término solo aparece pasados
los 30 KB, el resultado sale sin fragmento; en ese caso se muestra el resumen del
documento en su lugar, nunca un espacio vacío.

### El índice va partido en dos

`documents.search_vector` guarda título, resumen y etiquetas (pesos A y B);
`versions.search_vector` guarda el contenido del archivo (peso C). No es un
capricho: son dos cosas con **ritmos de cambio distintos**. El contenido de un
archivo no cambia nunca —si cambia, es otra versión—, pero el título sí se
corrige, y a menudo, porque lo propuso Claude y alguien lo ajustó. En un solo
vector combinado, corregir el título obligaría a reconstruirlo entero, y para eso
haría falta el texto completo, que ya no está en la base: está en R2. El índice
quedaría desactualizado en silencio, que es la peor forma de quedar mal.

Partido, cada mitad se mantiene sola: la del documento con un trigger que se
dispara al editar metadatos, la de la versión una sola vez al subir. La consulta
usa las dos (`d.search_vector @@ q or v.search_vector @@ q`), cada una con su
índice GIN.

---

## 3. Modelo de información

### Los tres ejes de clasificación

No confundirlos. Son ejes independientes y cada uno responde una pregunta distinta:

| Eje | Pregunta | Cardinalidad |
|---|---|---|
| Tipo documental | ¿Qué *es*? | Uno |
| Tema | ¿De qué *habla*? | Varios, jerárquico, uno marcado como principal |
| Uso | ¿Para qué *sirve*? | Uno |

Un PPT de capacitación sobre medicamentos es: tipo `presentación`, tema
`salud › medicamentos`, uso `material de capacitación`. **"Capacitación" nunca es
un tema** — si lo fuera, ese documento no aparecería al buscar medicamentos.

Un concentrado de datos puede tener cuatro temas a la vez (salud, obra,
presupuesto, cobertura). Uno es el principal —define dónde vive y cómo se ordena—
y el resto son secundarios.

Regla de arbitraje: *si le quito el formato, ¿de qué habla?* La respuesta es el tema.

### Las tres entidades del núcleo

**Documento** — la cosa conceptual y estable. Título, temas, responsable, enlace
permanente. Es lo que se cita en un oficio y nunca cambia de URL.

**Versión** — cada archivo concreto que ha existido de ese documento, con su nota
de cambio. Nunca se borra ninguna. Solo una está vigente.

**Dataset** — una hoja de un Excel que un administrador promovió: columnas
mapeadas, unidades declaradas, tema por columna.

Documento y versión son tablas separadas. Mezclarlas es el error que produce
catorce archivos parecidos sin saber cuál abrir.

### Esquema SQL

Resumen legible. **La fuente de verdad son las migraciones** en
`supabase/migrations/`, que además llevan triggers, funciones y políticas RLS.

```sql
-- ── Catálogos (cerrados, solo admin da de alta) ──────────────
create table topics (
  id serial primary key,
  parent_id int references topics(id),
  slug text unique not null,
  name text not null,
  position int default 0
);
create table doc_types (id serial primary key, slug text unique, name text);
create table doc_uses  (id serial primary key, slug text unique, name text);

-- ── Perfiles y roles ─────────────────────────────────────────
-- Quién puede entrar y con qué rol. Un trigger sobre auth.users
-- rechaza el alta de cualquier correo que no esté aquí: el API de
-- Supabase es público y Cloudflare Access no lo cubre.
create table access_list (
  email text primary key,
  role text not null default 'lector'
    check (role in ('lector','cargador','admin')),
  note text, added_by uuid references profiles(id),
  added_at timestamptz default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'lector'
    check (role in ('lector','cargador','admin'))
);
-- La fila la crea un trigger sobre auth.users al registrarse; Supabase
-- Auth no la crea solo. Otro trigger impide que alguien se cambie el
-- rol a sí mismo: RLS filtra filas, no columnas.

-- ── Núcleo ───────────────────────────────────────────────────
create table documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text,
  year int,
  area text,
  source text,
  doc_type_id int not null references doc_types(id),
  doc_use_id int references doc_uses(id),
  primary_topic_id int not null references topics(id),
  owner_id uuid not null references profiles(id),  -- responde por el CONTENIDO
  status text not null default 'publicado'
    check (status in ('borrador','publicado','archivado')),
  current_version_id uuid,
  search_vector tsvector,                          -- pesos A y B: título, resumen, etiquetas
  created_by uuid references profiles(id),         -- quien SUBIÓ el archivo
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table document_topics (
  document_id uuid references documents(id) on delete cascade,
  topic_id int references topics(id),
  primary key (document_id, topic_id)
);

create table document_tags (
  document_id uuid references documents(id) on delete cascade,
  tag text,
  primary key (document_id, tag)
);

create table versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  version_no int not null,
  change_note text,
  storage_key text not null,
  text_key text,                        -- texto crudo completo en R2
  text_excerpt text,                    -- ~30 KB, para ts_headline
  filename text, mime text, size_bytes bigint, checksum text,
  page_count int,
  search_vector tsvector,               -- peso C: solo el contenido del archivo
  upload_status text not null default 'pendiente'
    check (upload_status in ('pendiente','confirmada')),
  uploaded_by uuid references profiles(id),
  uploaded_at timestamptz default now(),
  unique (document_id, version_no)
);

alter table documents add constraint fk_current
  foreign key (current_version_id) references versions(id);

-- ── Datasets ─────────────────────────────────────────────────
create table datasets (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references versions(id) on delete cascade,
  sheet_name text not null,
  notes text,
  curated_by uuid references profiles(id),
  curated_at timestamptz default now()
);
create table dataset_columns (
  id serial primary key,
  dataset_id uuid references datasets(id) on delete cascade,
  column_key text not null,
  label text not null,
  unit text,
  dtype text,
  topic_id int references topics(id),
  notes text
);
create table dataset_rows (
  id bigserial primary key,
  dataset_id uuid references datasets(id) on delete cascade,
  row_no int,
  data jsonb not null
);

-- ── Bitácora ─────────────────────────────────────────────────
create table access_log (
  id bigserial primary key,
  user_id uuid references profiles(id),
  document_id uuid references documents(id),
  version_id uuid references versions(id),
  action text check (action in ('vista','preview','descarga')),
  at timestamptz default now()
);

-- ── Índices ──────────────────────────────────────────────────
create index on versions using gin (search_vector);
create index on documents (primary_topic_id, year desc);
create index on document_topics (topic_id);
create index on dataset_rows using gin (data jsonb_path_ops);
```

### Reglas de negocio

1. Subir una versión nueva mueve `current_version_id`. El enlace permanente, el
   título y los temas del documento no cambian.
2. Nada se borra. Lo que ya no sirve pasa a `status = 'archivado'`: sale de la
   navegación, permanece en la base y sigue accesible por enlace directo.
3. `search_vector` y `text_excerpt` de la versión solo se llenan para la vigente.
   Al cambiar de vigente se limpian los de la anterior y se generan los de la
   nueva. Corolario incómodo pero asumido: **volver a una versión anterior exige
   releer su texto desde R2** con su `text_key`, porque su índice se borró al
   dejar de ser vigente. Si no se relee, la versión queda vigente pero fuera del
   buscador. `set_current_version()` recibe ese texto como parámetro.
4. Campos obligatorios al subir: **título, tipo, tema principal, año, responsable**.
   Cinco, ni uno más. Cada campo obligatorio extra es una razón para no subir nada.
5. El catálogo de temas es cerrado (solo admin). Las etiquetas son libres.
6. Máximo dos niveles de tema: `tema › subtema`. Lo más fino son etiquetas.
7. Un Excel es dataset solo si un admin lo promovió declarando columnas y unidades.
   Los Excel sin promover se ven y se descargan, pero no alimentan nada calculado.
8. **El tema principal también se inserta en `document_topics`**, con un trigger, no
   confiando en el código de aplicación. Sin esto el árbol lateral —que consulta
   `document_topics`— no mostraría el documento bajo su propio tema principal.
   `documents.primary_topic_id` solo indica cuál de todos es el principal.
9. **Crear documento + versión es una sola transacción.** La FK entre `documents` y
   `versions` es circular (documento → versión vigente → documento), así que la alta
   requiere tres statements. Van dentro de una función Postgres
   `create_document_with_version(...)` invocada por RPC; nunca tres llamadas sueltas
   desde el navegador, o un fallo intermedio deja documentos sin versión.
10. **Duplicados por `checksum`.** Si al subir el checksum ya existe en la base, no
    se guarda en silencio: se avisa al usuario y se le ofrecen dos salidas —"ya está
    aquí, ver el documento" o "regístralo como versión nueva de aquel documento".
11. `owner_id` es quien responde por el contenido; `created_by` es quien subió el
    archivo. Suelen ser personas distintas y la interfaz debe pedirlos por separado.

### Catálogos iniciales

**Tipos documentales:** investigación · presentación · base de datos · informe ·
lámina o gráfico · minuta · normativa · formato

**Usos:** insumo de análisis · material de capacitación · entregable oficial ·
referencia · documento de trabajo

**Temas (dos niveles):**

- Salud y servicios — consultas · camas · medicamentos e insumos · personal médico
- Infraestructura y obra — obra pública · unidades médicas · equipamiento
- Presupuesto y finanzas — gasto ejercido · programas de inversión
- Derechohabiencia y cobertura — padrón · acceso a servicios
- Gestión y recursos internos — plantilla y personal · formación y capacitación ·
  procedimientos y formatos · manuales y guías
- Comunicación institucional — boletines · liderazgos · redes
- Normatividad y planeación — programas institucionales · marco jurídico

Nota sobre "Gestión y recursos internos": es para documentos cuyo *asunto* es la
operación interna, no para todo lo que tenga formato de capacitación.

---

## 4. Estructura del proyecto

```
repositorio-caa/
├─ REPOSITORIO_CAA.md          ← este documento
├─ .env.local.example
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/              ← SQL versionado
│  ├─ templates/               ← correo con código de acceso
│  ├─ tests/sprint1.sql        ← reglas 1, 2 y 3 + roles
│  └─ seed.sql                 ← catálogos iniciales
├─ src/
│  ├─ middleware.ts            ← refresco de sesión y puerta al login
│  ├─ app/
│  │  ├─ layout.tsx
│  │  ├─ page.tsx              ← consulta (pantalla principal)
│  │  ├─ login/                ← entrada por código al correo
│  │  ├─ subir/page.tsx
│  │  ├─ doc/[id]/page.tsx     ← ficha + preview + versiones
│  │  ├─ admin/
│  │  │  ├─ temas/page.tsx
│  │  │  ├─ usuarios/page.tsx
│  │  │  └─ datasets/page.tsx  ← promover Excel a dataset
│  │  └─ api/
│  │     ├─ upload-url/route.ts    ← presigned PUT a R2
│  │     ├─ metadata/route.ts      ← Claude API
│  │     └─ download/[id]/route.ts ← presigned GET + bitácora
│  ├─ components/
│  │  ├─ upload/               ← dropzone, formulario de metadatos
│  │  ├─ search/               ← buscador, árbol de temas, facetas
│  │  ├─ preview/              ← PdfPreview, XlsxPreview, DocxPreview
│  │  └─ ui/
│  ├─ lib/
│  │  ├─ auth.ts               ← sesión, roles y guardas de página
│  │  ├─ supabase/             ← clientes browser y server
│  │  ├─ r2.ts                 ← presigned URLs (aws4fetch)
│  │  ├─ extract/              ← pdf.ts, docx.ts, xlsx.ts, pptx.ts
│  │  ├─ claude.ts
│  │  └─ types.ts
│  └─ styles/
└─ scripts/
   └─ backup.ts                ← respaldo a R2 (GitHub Actions)
```

### Librerías

| Uso | Librería |
|---|---|
| Texto y preview de PDF | `pdfjs-dist` |
| Texto y render de Word | `mammoth` |
| Excel (texto, preview, filas) | `xlsx` (SheetJS) |
| Texto de PowerPoint | `jszip` + parseo de XML |
| Firmas S3 para R2 | `aws4fetch` |
| Cliente Claude | `@anthropic-ai/sdk` |

### Variables de entorno

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
ANTHROPIC_API_KEY=
```

Ninguna llave de servicio se expone al cliente. `SUPABASE_SERVICE_ROLE_KEY`,
las credenciales de R2 y la de Anthropic solo se usan en rutas de servidor.

---

## 5. Requisitos funcionales — F1

### 5.1 Subida

Flujo completo, en orden:

1. El usuario arrastra uno o varios archivos (PDF, DOCX, XLSX, PPTX; máx. 50 MB).
2. En el navegador se extrae el texto según el tipo. Si el PDF no tiene capa de
   texto, se marca `text_key = null` y se avisa que no será buscable.
3. Se pide una URL firmada a `/api/upload-url` y el archivo sube **directo a R2**
   desde el navegador. El archivo nunca pasa por el servidor de la app.
4. El texto extraído (primeros ~6,000 tokens) se manda a `/api/metadata`, que
   llama a Claude y devuelve JSON con título, año, área, tema sugerido, resumen y
   etiquetas.
5. Los campos se muestran prellenados con la marca "metadatos sugeridos". El
   usuario corrige lo que haga falta.
6. El usuario elige: documento nuevo, o nueva versión de uno existente
   (con buscador de documentos). Si es versión, puede marcarla como vigente.
7. Al guardar se escriben `documents`, `versions`, `document_topics`,
   `document_tags`, se sube el texto crudo a R2 y se genera el `tsvector`.

Requisitos: subida múltiple, barra de progreso por archivo, reintento si falla, y
que un fallo en el paso 4 no bloquee el guardado (los metadatos se llenan a mano).

### 5.2 Consulta

- Buscador de texto libre sobre título, resumen, etiquetas y contenido.
- Árbol de temas de dos niveles en la barra lateral.
- Facetas acumulables: año, tipo, área, uso, estatus.
- Resultados con **fragmento del texto donde apareció el término**, resaltado.
  No basta con listar títulos.
- Distintivo visual de vigente / histórico / archivado.
- Orden por relevancia o por fecha de actualización.

### 5.3 Ficha del documento

- Metadatos completos y enlace permanente copiable.
- Preview según tipo:
  - **PDF** → visor completo con `pdfjs-dist`.
  - **Excel** → tabla navegable con selector de hojas y filtros por columna.
  - **Word** → render a HTML con `mammoth`.
  - **PowerPoint** → sin preview en F1: ficha, texto extraído y descarga.
- Historial de versiones con nota de cambio, autor y fecha; descarga de cualquiera.
- Descarga por URL firmada de vida corta, registrada en `access_log`.

### 5.4 Administración

- Alta y edición de temas (solo admin).
- Gestión de roles.
- Archivar documentos.
- Promover una hoja de Excel a dataset: mapear columnas, declarar unidades y
  asignar tema por columna.

### 5.5 Búsqueda — implementación

`tsvector` en español, en dos mitades con ritmos de cambio distintos (ver §2).

En `documents`, mantenido por trigger al editar metadatos o etiquetas:

```sql
setweight(to_tsvector('spanish', coalesce(title,'')),   'A') ||
setweight(to_tsvector('spanish', coalesce(summary,'')), 'B') ||
setweight(to_tsvector('spanish', coalesce(tags,'')),    'B')
```

En `versions`, escrito una sola vez al subir:

```sql
setweight(to_tsvector('spanish', coalesce(text_full,'')), 'C')
```

Donde `text_full` es el texto extraído en el navegador, que sirve para construir el
vector y el extracto y luego se descarta: a la base solo entran el vector y el
`text_excerpt`; el texto completo se queda en R2.

La consulta cruza las dos mitades —`d.search_vector @@ q or v.search_vector @@ q`—
con `websearch_to_tsquery('spanish', ...)`, ranking sumando los `ts_rank_cd` de
ambas y fragmentos con `ts_headline` sobre `text_excerpt`.

---

## 6. Seguridad

- **Cloudflare Access** delante de todo, con la lista de correos institucionales.
  Quien no esté en la lista no ve ni la pantalla de inicio.
- **Supabase Auth** para identidad dentro de la app y RLS por rol.
- **Son dos autenticaciones distintas y así se queda en F1.** Access es la reja del
  estacionamiento (una vez cada varios días, por código al correo); Supabase Auth es
  la sesión real que sostiene los roles y la bitácora. El usuario firma dos veces la
  primera vez y casi nunca después. Intercambiar el JWT de Access por una sesión de
  Supabase queda para más adelante, no vale la complejidad en la v1.
- **Cuidado con la recursión en RLS.** Las políticas necesitan leer el rol, que vive
  en `profiles`; si la política de `profiles` consulta `profiles`, Postgres entra en
  recursión infinita. Se resuelve con una función `security definer` —por ejemplo
  `auth_role()`— que devuelva el rol, y todas las políticas la usan a ella.
- **RLS no basta por sí sola: hacen falta los `GRANT`.** Son dos capas distintas —el
  permiso da acceso a la tabla, la política filtra las filas— y sin la primera toda
  consulta responde `permission denied` aunque las políticas estén perfectas.
  A `authenticated` se le otorgan `select, insert, update`; **`delete` no se otorga
  a nadie**, así que la regla 2 queda cerrada por permiso y por ausencia de política.
- **Cloudflare Access no cubre el API de Supabase.** Access protege el dominio de la
  app; `<ref>.supabase.co` responde desde cualquier parte de internet con la llave
  anónima, que por definición es pública porque viaja en el navegador. Con el alta
  abierta, cualquiera podría pedir un código, entrar como `lector` y leer todo lo
  publicado sin acercarse nunca a la reja. Por eso la lista de correos vive **también
  en la base**, en `access_list`, y un trigger sobre `auth.users` aborta el alta de
  quien no esté en ella. La puerta es la misma sin importar por dónde se entre.
- **El primer administrador.** Todo perfil nace con el rol que dice `access_list`, y
  esa lista se siembra **antes** de que la gente se registre: el rol se asigna en el
  momento del alta. A quien ya se registró se le cambia con un `update` sobre
  `profiles`. Sacar a alguien de la lista no borra su perfil ni su historial —le
  cierra la puerta a futuras altas—; para revocarle el acceso hay que cambiarle el
  rol o eliminarlo de `auth.users`.
- Políticas RLS:
  - `lector` — lee documentos publicados y archivados; sin escritura.
  - `cargador` — crea documentos y versiones; edita los propios.
  - `admin` — todo, incluidos catálogos, roles y archivado.
  - El borrador solo lo ve su autor, su responsable y los admins.
  - La bitácora la escribe cualquiera —su propio registro— y solo la lee un admin.
    No admite `update` ni `delete`: un registro de acceso editable no es un registro.
- Los archivos en R2 **no son públicos**. Todo acceso pasa por URL firmada de
  vida corta generada en el servidor, previa verificación de sesión.
- Toda descarga y preview se registra en `access_log`.

---

## 7. Fuera de alcance de F1

No implementar, aunque el esquema los contemple:

- Dashboard de indicadores.
- Consulta de datos en lenguaje natural.
- Búsqueda semántica con embeddings.
- OCR de PDF escaneados.
- Previews renderizados de PowerPoint.
- Comentarios o discusión sobre documentos.
- Carpetas personales. Todo lo que se sube es del área.
- Notificaciones.

### Roadmap posterior

- **F2** — dashboard del acervo: documentos por tema y año, antigüedad y
  documentos sin actualizar, cobertura y huecos, más consultados, actividad
  reciente. Carga masiva del histórico.
- **F3** — datasets: visor tabular avanzado y dashboard de indicadores sobre
  columnas curadas.
- **F4** — embeddings con `pgvector` y respuestas con cita al documento fuente.
  OCR y previews de PPT vía worker asíncrono en máquina local.

---

## 8. Criterios de aceptación de F1

1. Subir un PDF de 20 páginas toma menos de 60 segundos de principio a fin,
   incluyendo la corrección de metadatos.
2. Buscar un término que aparece dentro de un documento lo devuelve con el
   fragmento resaltado, no solo el título.
3. Un Excel de 20+ columnas se consulta como tabla sin descargarlo.
4. Un documento con cuatro temas aparece en las cuatro ramas del árbol.
5. Subir la versión 15 de un documento no rompe su enlace permanente y la 14
   queda consultable marcada como histórica.
6. Un usuario con rol lector no puede subir ni editar nada.
7. Cada descarga queda registrada con usuario, documento y fecha.

---

## 9. Plan de sprints sugerido

| Sprint | Contenido |
|---|---|
| 1 | ✅ Migraciones, catálogos sembrados, auth, roles, RLS, layout base |
| 2 | ✅ Subida: dropzone, extracción en cliente, R2 con URL firmada, guardado |
| 3 | ⏸ Metadatos con Claude API y formulario de confirmación — código escrito, sin probar |
| 4 | ✅ Consulta: buscador FTS, árbol de temas, facetas, fragmentos |
| 5 | Ficha: previews PDF / Excel / Word, versiones, descarga, bitácora |
| 6 | Administración: temas, usuarios, archivado, promoción de datasets |
| 7 | Respaldo automatizado, despliegue en Cloudflare, **carga inicial real** |

**El sprint 3 está escrito pero pospuesto.** La ruta `/api/metadata`, el prompt y el
formulario con la marca de "sugerido" existen y compilan, pero no se ha ejecutado ni
una llamada real: falta la llave de la API y todavía no está decidido cuánto se va a
usar Claude en el proyecto. Nada de esto bloquea nada — sin llave configurada la ruta
responde con un aviso y los metadatos se llenan a mano, que es justo lo que pide §5.1.
Antes de darlo por bueno hay que correr `npx tsx scripts/metadatos.mts` contra archivos
reales y afinar el prompt con lo que salga. Mientras tanto, el orden natural es seguir
con el sprint 4.

**El sprint 7 no cierra con una carga de prueba, sino con contenido de verdad.** Un
buscador vacío no se usa, y lo que no se usa la primera semana no se usa nunca. Van
30 documentos escogidos a mano: los que la gente pregunta hoy. Es una decisión de
adopción, no técnica, y es la que decide si el proyecto vive.

**Pruebas.** No hace falta cobertura amplia, pero las reglas de negocio 1, 2 y 3 sí
necesitan test automatizado: son la premisa del sistema ("nada se borra", "el enlace
permanente nunca cambia") y una regresión ahí es silenciosa y difícil de revertir.

---

## 10. Trampas conocidas

No son decisiones de arquitectura: son cosas que van a aparecer durante la
implementación y que cuestan horas si se descubren sin aviso.

- **CORS en R2.** El PUT directo desde el navegador exige configurar CORS en el
  bucket. Si no, falla sin un mensaje que explique por qué.
- **Extracción en un Web Worker.** Un XLSX de 50 MB parseado en el hilo principal
  congela la pestaña o la mata por falta de memoria. "Sin worker de servidor" no
  impide usar un Web Worker del navegador.
- **Peso del bundle.** `pdfjs-dist` + `xlsx` + `mammoth` + `jszip` suman varios MB.
  Cargarlos con `import()` dinámico y solo en las pantallas que los usan, o la
  consulta —que es la prioridad— arranca lenta.
- **SheetJS no se publica en npm.** Instalarlo desde `cdn.sheetjs.com`; las versiones
  que quedan en npm están viejas y arrastran vulnerabilidades conocidas.
- **`pg_dump` desde GitHub Actions.** Los runners de GitHub no tienen IPv6 y la
  conexión directa de Supabase en el plan gratuito es IPv6. Hay que apuntar al
  Session Pooler, que sí expone IPv4.
- **Archivos huérfanos.** Entre la subida a R2 y el guardado en la base hay una
  ventana: si el navegador se cierra en medio, queda un objeto sin registro. La
  versión se inserta en estado pendiente y se confirma al terminar.
- **Trigger de `updated_at`.** El `default now()` no actualiza nada; hace falta el
  trigger explícito.
- **Fijar la versión del modelo.** `claude-haiku-4-5` funciona como alias, pero
  conviene anclar la versión concreta para que el comportamiento no cambie solo.
- **`dataset_rows` con jsonb** repite las claves de columna en cada fila. Antes de F3
  hay que decidir un límite de filas al promover un Excel.
- **`access_log`** crece sin política de retención. Irrelevante con 15 usuarios, pero
  conviene definir una purga anual antes de que alguien pregunte.
- **El SMTP propio es requisito, no un pendiente de despliegue.** El correo integrado
  de Supabase solo envía a miembros del proyecto y con un tope muy bajo: sirve para
  probar uno mismo, no para quince personas. Y en el plan gratuito con ese proveedor
  **la plantilla no se puede modificar** —`config push` devuelve un 400 explícito—,
  así que tampoco hay código de seis dígitos: llega el enlace mágico de fábrica.
  Configurar un SMTP externo resuelve las dos cosas de un golpe. Mientras tanto la
  pantalla de entrada acepta los dos caminos, enlace o código, y `/auth/confirm`
  recibe al que llegue por el enlace.
- **La versión de Next la manda OpenNext.** El adaptador de Cloudflare solo soporta
  `>=15.5.21 <16 || >=16.2.11`; las versiones intermedias no. Antes de actualizar
  Next hay que revisar el rango del adaptador, no al revés.
- **`service_role` no tiene permiso de tabla.** La migración de grants otorga
  `select, insert, update` a `authenticated` y a nadie más, así que la llave de
  servicio no puede leer ni escribir ninguna tabla del esquema `public`: PostgREST
  responde vacío o con un `permission denied` que en el cliente se ve como "no hay
  datos". Hoy no estorba —la app trabaja siempre con la sesión del usuario, que es
  lo correcto— pero el día que una ruta de servidor necesite la llave de servicio,
  el grant hay que agregarlo a propósito y por tabla, nunca en bloque.
- **Entre `documents` y `versions` hay dos llaves foráneas** (`versions.document_id`
  y `documents.current_version_id`). PostgREST no adivina cuál usar y responde 300
  ante `select('...documents(title)')`. Hay que nombrar la llave:
  `documents!versions_document_id_fkey(title)`. Aparece en cuanto la consulta del
  sprint 4 junte las dos tablas.
- **Una lámina sin texto no avisa.** El extractor de PPTX solo advierte cuando la
  presentación entera viene sin texto. Una donde la mitad de las diapositivas son
  imágenes —el caso normal de un archivo de gráficas— pasa sin advertencia y esas
  láminas no quedan buscables. Verificado con un archivo real: 13 diapositivas, y
  de la 8 a la 13 solo se extrajo el número de lámina.

---

## 11. Convenciones

- Identificadores de código y base de datos en inglés; valores de catálogo,
  etiquetas de interfaz y contenido en español.
- Migraciones SQL versionadas en `supabase/migrations/`, nunca cambios manuales
  desde el panel de Supabase.
- Fechas siempre `timestamptz`.
- Nada de llaves de servicio en código de cliente.
- Cada tabla nueva nace con su política RLS en la misma migración.
- Toda decisión que cambie lo escrito aquí se actualiza en este documento en el
  mismo commit.

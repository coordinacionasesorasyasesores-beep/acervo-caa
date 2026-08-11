# Repositorio de Investigaciones — CAA / ISSSTE

Documento maestro del proyecto. Sirve como contexto permanente para Claude Code:
mantenerlo en la raíz del repo y actualizarlo cuando una decisión cambie.

**Estado:** el acervo está **en producción con contenido real**: 11 documentos
publicados, 23 versiones, 110 MB. Sprints 1, 2, 4, 5 y 6 terminados y verificados.
Sprint 3 escrito pero **sin una sola llamada real a la API** — sigue faltando
`ANTHROPIC_API_KEY`, y por eso la primera carga masiva se catalogó a mano.
**Última actualización:** 11 de agosto de 2026 · rev. 11 (carga masiva, recuperación
de contraseña, ver todo el acervo y título editable).

**Proyecto de Supabase:** `repositorio-caa` · ref `mmqqtpixmjbdaxmvksoz` · us-east-2 ·
organización ISSSTE-FREE_PROJECT (plan gratuito).
**App en producción:** `acervo-caa.vercel.app` · proyecto de Vercel `acervo-caa`.
**Repositorio:** `github.com/coordinacionasesorasyasesores-beep/acervo-caa`.

**Publicar son dos pasos.** Vercel **no** está conectado al repositorio: `git push`
sube el respaldo, y `npx vercel --prod` es lo que despliega. Conectarlo exige
permiso de administrador sobre el repo, que hoy no se tiene — pertenece a otra
cuenta de GitHub y se entra como colaborador con permiso de escritura.

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
| Hosting app | **Vercel** | Cuenta Pro existente; sin costo adicional |
| Base de datos | Supabase (plan gratuito, organización nueva) | Postgres + Auth + RLS |
| Archivos | **Supabase Storage** (API S3) | 1 GB y 5 GB de egress al mes. Migrar a R2 es cambiar cuatro variables |
| Puerta de acceso | **`access_list` en la base** | Un trigger sobre `auth.users` aborta el alta de quien no esté |
| Extracción de texto | En el navegador, al subir | Sin worker de servidor |
| Metadatos automáticos | Claude API (`claude-haiku-4-5`) | Ruta de servidor |
| Entrada | **Correo y contraseña**, cuentas creadas por un admin | Sin SMTP no hay código al correo |
| Respaldo | GitHub Actions → artefacto, diario | El plan gratuito no incluye backups. Exige repo privado |

### Por qué el texto se extrae en el navegador

Supabase Edge Functions corre Deno: no se puede instalar LibreOffice ni tesseract.
Montar un worker de conversión implicaría un servidor propio, que es justo lo que
se decidió evitar. La extracción en cliente elimina esa pieza por completo.

Consecuencia aceptada: **no hay previews renderizados de PowerPoint** en la v1
(queda ficha + descarga) y **los PDF escaneados no entran al buscador** hasta que
se agregue OCR. Ambas cosas están en el roadmap, no en F1.

### Por qué se cambió de Cloudflare a Vercel (rev. 9)

El diseño original era Cloudflare: Workers para la app, R2 para los archivos
y Access como reja. Se cambió por una razón sencilla —**el proyecto no tiene
presupuesto y ya existe una cuenta Pro de Vercel**— y una segunda que hizo el
cambio barato: `src/lib/r2.ts` firma contra un endpoint S3 genérico, y todo el
desarrollo se hizo contra el API S3 de Supabase Storage. No había una sola línea
atada a R2.

Lo que se perdió, dicho sin adornos:

- **El egress ilimitado de R2.** Ahora son 5 GB al mes compartidos con la base.
  Con 600 MB de acervo son unas ocho recorridas completas al mes. Es el límite
  que se toca primero.
- **10 GB de almacenamiento, ahora 1 GB.** Con 600 MB de arranque el margen es
  de 400 MB, y nada se borra nunca: cada versión suma.
- **Cloudflare Access.** Dejó de ser indispensable cuando se descubrió que no
  cubría el API de Supabase y se metió la lista de correos en la base. Esa es la
  puerta que de verdad cierra; Access era el candado del estacionamiento.
  Efecto secundario bueno: se firma una vez en lugar de dos.

Si cualquiera de los dos límites aprieta, el siguiente escalón de Supabase son
$25 USD al mes. Volver a R2 —10 GB y egress gratis, con tarjeta registrada— es
cambiar cuatro variables de entorno y sale más barato.

### Límites del plan gratuito a vigilar

- Supabase: 500 MB de base, **1 GB de archivos**, 5 GB de egress, 2 proyectos activos.
- El proyecto **se pausa a los 7 días sin actividad** y hay que despertarlo desde
  el panel. Ya pasó una vez con `hub-caa`.
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
acervo-caa/
├─ CLAUDE.md                   ← mapa de arranque; se lee solo al abrir un chat
├─ REPOSITORIO_CAA.md          ← este documento
├─ .env.local.example
├─ supabase/
│  ├─ config.toml              ← incluye la lista blanca de redirecciones (§10)
│  ├─ migrations/              ← SQL versionado
│  ├─ templates/               ← correo con código de acceso
│  ├─ tests/sprint1.sql        ← reglas 1, 2 y 3 + roles
│  └─ seed.sql                 ← catálogos iniciales
├─ src/
│  ├─ middleware.ts            ← refresco de sesión y puerta al login
│  ├─ app/
│  │  ├─ page.tsx              ← consulta y portada (una sola pantalla)
│  │  ├─ login/                ← entrada por contraseña + pedir recuperación
│  │  ├─ auth/
│  │  │  ├─ confirm/route.ts   ← aterrizaje de los enlaces del correo
│  │  │  └─ recuperar/         ← elegir contraseña nueva
│  │  ├─ subir/page.tsx
│  │  ├─ doc/[id]/
│  │  │  ├─ page.tsx           ← ficha + preview + versiones
│  │  │  └─ acciones.ts        ← renombrar desde la propia ficha
│  │  ├─ admin/                ← temas, usuarios, documentos, datasets
│  │  └─ api/
│  │     ├─ upload-url/route.ts    ← firma la subida directa
│  │     ├─ metadata/route.ts      ← Claude API
│  │     └─ download/[id]/route.ts ← firma la descarga + bitácora
│  ├─ components/
│  │  ├─ upload/               ← dropzone, formulario de metadatos
│  │  ├─ search/               ← buscador, árbol de temas, facetas, portada
│  │  ├─ preview/              ← Pdf, Xlsx, Docx, Pptx, Texto
│  │  └─ ui/                   ← Shell, Copiable, TituloEditable, iconos
│  └─ lib/
│     ├─ auth.ts               ← sesión y guardas de página (usa next/headers)
│     ├─ roles.ts              ← rótulos de rol, sin código de servidor (§10)
│     ├─ contrasena.ts         ← la regla de los 12 caracteres, en un solo sitio
│     ├─ almacen.ts            ← Supabase Storage por su API nativo
│     ├─ busqueda.ts           ← el estado del buscador vive en la URL
│     ├─ extract/              ← pdf, docx, xlsx, pptx (versiones de navegador)
│     ├─ metadatos.ts          ← prompt y esquema de la sugerencia
│     └─ supabase/             ← clientes browser, server y admin
└─ scripts/                    ← todos con `npx tsx`, nunca `npm run` (§12)
   ├─ comun-carga.mts          ← sesión, catálogos y extractores para Node
   ├─ crear-carpetas.mts       ← árbol de carpetas con los nombres del catálogo
   ├─ preparar-carga.mts       ← carpeta → Excel para revisar
   ├─ cargar.mts               ← Excel revisado → base local
   ├─ promover.mts             ← local → producción, con historial
   ├─ migrar-a-produccion.mts  ← OBSOLETO: fue de un solo uso (§12)
   ├─ backup.mts               ← respaldo diario (GitHub Actions)
   └─ humo-*.mts, extraccion.mts, metadatos.mts   ← pruebas manuales
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
ALMACEN_BUCKET=acervo
ANTHROPIC_API_KEY=
```

Ninguna llave de servicio se expone al cliente: `SUPABASE_SERVICE_ROLE_KEY` y la de
Anthropic solo se usan en rutas de servidor. Las de R2 desaparecieron al pasar el
almacén al API nativo de Supabase — cada secreto que se elimina es uno menos que
alguien puede filtrar y uno menos que nadie va a rotar.

`.env.local` trae **dos bloques**: el local, activo, y el de producción
**comentado a propósito**. Ningún script lo descomenta solo. Los que escriben en
producción —`promover.mts`— exigen las credenciales por variables de entorno en la
línea de comandos: escribir en producción tiene que costar trabajo de teclear.

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
- **Puerta a la lista completa** desde la portada ("Ver los N documentos",
  `/?todos=1`). Buscar supone saber qué se busca; quien llega sin una pregunta
  —o quiere comprobar qué hay— no tenía forma de ver el acervo entero salvo
  adivinar una palabra que apareciera en todo.

  `todos` **no cuenta como filtro** y por eso vive fuera de `hayFiltros()`: si
  contara, aparecería un "Limpiar todo" que no limpia nada y la lista vacía diría
  "nada coincide con tu búsqueda" cuando lo que pasa es que el acervo está vacío.
  Filtrar desde la lista no expulsa a la portada, y limpiar devuelve al listado
  completo, no al inicio.

### 5.3 Ficha del documento

- Metadatos completos y enlace permanente copiable.
- **El título se corrige ahí mismo**, con un lápiz al final del texto
  (`TituloEditable`). En una carga masiva el título lo propone una máquina o se
  deduce del nombre del archivo, así que corregirlo es la edición más frecuente del
  sistema; detrás de un formulario aparte, no se hace. Quien no puede editar no ve
  el lápiz: un botón que no va a funcionar es peor que uno ausente. Quién puede lo
  decide RLS, no la interfaz — ver §6.
- Preview según tipo:
  - **PDF** → visor completo con `pdfjs-dist`.
  - **Excel** → tabla navegable con selector de hojas y filtros por columna.
  - **Word** → render a HTML con `mammoth`.
  - **PowerPoint** → sin render de láminas en F1. El texto extraído se
    reconstruye como láminas (`src/lib/laminas.ts`): se parte por
    `## Diapositiva N`, la primera línea es el título, las cifras seguidas se
    juntan en una fila con su unidad, los rótulos en mayúsculas se distinguen
    de la prosa, la fuente va aparte y las láminas que solo son imagen se
    declaran por número. Ver §10, "Una gráfica de PowerPoint es un muro de
    renglones".
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

### 5.6 Recuperar la contraseña

La nota original decía *"pídele a un administrador que te asigne una nueva"*. Si
quien la olvida **es** el administrador, no hay a quién pedírsela: la única salida
era el panel de Supabase. Con un solo administrador, eso bloquea el sistema entero.
Pasó.

El flujo: `/login` → "¿La olvidaste?" → correo → el enlace aterriza en
`/auth/confirm`, que valida el token en el servidor y deja la sesión en una cookie
→ `/auth/recuperar`, donde la persona elige su contraseña.

Cuatro decisiones que no son evidentes:

- **La pantalla no pide el correo.** Actúa sobre la sesión que el enlace creó, que
  es la prueba de que quien está ahí abrió el correo. Aceptar un identificador por
  el formulario lo convertiría en "cámbiale la contraseña a quien yo diga".
- **`/auth/confirm` manda cualquier enlace de tipo `recovery` a la pantalla de
  contraseña aunque no traiga `next`.** La plantilla de fábrica de Supabase no lo
  incluye, y sin esto la persona entraba pero seguía sin contraseña: entra hoy y
  mañana vuelve a estar bloqueada.
- **`next` se limita a rutas propias**, o el enlace sería un redirector abierto.
- **El tope de correos sí se dice; el resto de los fallos, no.** Callar todo era
  para no revelar qué correos tienen cuenta, pero el tope es del proyecto entero y
  salta igual con un correo inventado: esconderlo no protege nada y manda a vigilar
  una bandeja donde no va a llegar nada.

**Sigue dependiendo del correo, que es frágil** (§10: 2 envíos por hora, solo a
miembros del proyecto). Por eso la garantía real de no quedar fuera son **dos
administradores**, para que uno le asigne contraseña al otro desde
`/admin/usuarios`. El portón de atrás, si ninguno puede entrar, está en `CLAUDE.md`.

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
| 5 | ✅ Ficha: previews PDF / Excel / Word, versiones, descarga, bitácora |
| 6 | ✅ Administración: temas, usuarios, archivado, promoción de datasets |
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
- **El tope son 2 correos por hora y NO se puede subir.** Medido: el envío número
  tres devuelve `429 over_email_send_rate_limit` y se descarta sin avisar a nadie.
  Intentar levantarlo por la API de gestión responde *"Custom SMTP required to
  configure RATE_LIMIT_EMAIL_SENT"*. Es un tope duro del servicio integrado, no un
  ajuste. Dejó a un administrador fuera del sistema una tarde entera. Dos
  consecuencias de diseño: el sistema **no puede depender del correo** para
  recuperar el acceso —de ahí los dos administradores, para que uno le asigne
  contraseña al otro— y cualquier pantalla que mande a "revisa tu correo" tiene que
  distinguir el tope y decirlo (§5.6).
- **`redirectTo` se descarta en silencio si no está en la lista blanca.** Auth no
  falla ni avisa: sustituye la URL por `site_url` y sigue. El enlace llega, valida
  el token y aterriza en el sitio equivocado; el síntoma es una página de error sin
  causa visible y el código parece correcto. Fue lo que rompió la recuperación de
  contraseña. Se comprueba sin mandar correos: `generateLink` con `options.redirectTo`
  y comparar el `redirect_to` que vuelve con el que se pidió. En `config.toml` hay
  que declarar los destinos con `/**` —sin el comodín solo vale la raíz exacta y
  `/auth/confirm?next=…` queda fuera— y en el proyecto alojado, lo mismo en
  Authentication › URL Configuration.
- **`supabase config push` empuja los 242 campos, no solo el que cambiaste.**
  Además `config.toml` es la configuración *local*: empujarla a producción le pone
  la Site URL en `localhost`. Para cambiar dos campos, la API de gestión con un
  PATCH quirúrgico. El token del CLI está en el llavero de macOS bajo `Supabase CLI`.

### Trampas de los scripts de Node

Los extractores viven en `src/lib/extract/` y están escritos **para el navegador**.
Importarlos desde un script falla de tres formas distintas, y ninguna dice lo que
pasa. Por eso `scripts/comun-carga.mts` tiene sus propias versiones.

- **`pdfjs-dist` necesita la build `legacy`.** La normal usa `DOMMatrix` y revienta
  con `DOMMatrix is not defined`, que suena a problema del PDF y no lo es.
  Además, `destroy()` vive en la tarea de carga, no en el documento.
- **`mammoth` en Node quiere `buffer`, no `arrayBuffer`.** Con `arrayBuffer`
  responde `Could not find file in options`, que suena a archivo corrupto. El campo
  `browser` del paquete solo redirige al empaquetar; en Node se carga la otra build.
- **SheetJS no toca el disco sin `XLSX.set_fs(fs)`.** En la build ESM, `readFile` y
  `writeFile` vienen sin enlazar y fallan con `cannot save file`, que parece un
  problema de permisos.
- **Los scripts van con `npx tsx`, no con `npm run`.** npm se come las comillas y
  una ruta con espacios llega partida en dos argumentos.

### Trampas de nombres de archivo

Salieron todas al agrupar versiones de una carpeta real de Windows y macOS.

- **`\b` no dispara junto a un guion bajo.** Es carácter de palabra para una
  expresión regular, así que en `verificacion_v12_1` no se reconoce ni la versión ni
  la fecha. Con nombres de Windows —llenos de guiones bajos— esa sola línea era la
  diferencia entre detectar las familias y no detectar ninguna. Se normalizan los
  separadores a espacios **antes** de aplicar cualquier patrón.
- **`localeCompare` ignora la puntuación en su nivel primario.** Ordenando por
  nombre, `Data ISSSTE 23072026_3 (1).xlsx` le ganaba a `Data ISSSTE 23072026.xlsx`
  —el `_3` pesaba menos que el `.xlsx`— y la copia quedaba antes que el original.
  Para desempatar versiones se compara la raíz del nombre con `<`, que es
  determinista.
- **macOS guarda los nombres en NFD.** La "á" es "a" + acento suelto, así que
  `"Presentación"` escrita en un archivo fuente (NFC) no coincide consigo misma leída
  del disco. Normalizar los dos lados con `.normalize('NFC')` antes de comparar.
- **Las fechas del sistema de archivos no sirven para ordenar versiones.** Al copiar
  una carpeta todas quedan con la fecha de la copia. Lo único que conserva el orden
  real es lo que alguien escribió en el nombre (`230726`, `903 am`).
- **`db:reset` no recrea el bucket de almacenamiento** aunque esté declarado en
  `config.toml`. Hay que crearlo a mano tras un reset, o la primera carga falla con
  `The related resource does not exist`.
- **La versión de Next la manda OpenNext.** El adaptador de Cloudflare solo soporta
  `>=15.5.21 <16 || >=16.2.11`; las versiones intermedias no. Antes de actualizar
  Next hay que revisar el rango del adaptador, no al revés.
- **Un componente de cliente no puede importar de `lib/auth.ts`.** Ese módulo lee
  cookies con `next/headers`, así que basta importar de él una constante inocente
  —el rótulo de un rol— para arrastrar código de servidor al bundle del navegador y
  romper la página entera. El error habla de `next/headers` y del directorio
  `pages/`, no de la constante que uno quería, así que cuesta un rato ver de dónde
  sale. Lo que es común a cliente y servidor vive en `lib/roles.ts`.
- **`useActionState` no propaga el `name`/`value` del botón que envía.** Dos botones
  en el mismo formulario, cada uno con su valor, dejan la acción sin dato y sin
  error: el clic simplemente no hace nada. Un formulario por botón, con el valor en
  un campo oculto.
- **`next build` y `next dev` se pisan.** Los dos escriben en el mismo `.next`, así
  que compilar para producción con el servidor de desarrollo encendido deja la
  pantalla sin estilos y con los chunks rotos. No se rompe nada del código —los
  tokens siguen en `globals.css`— pero el síntoma parece un desastre de diseño y
  manda a buscar el problema donde no está. Si pasa: detener el `dev`, `rm -rf .next`
  y volver a levantarlo.
- **`create or replace function` con otra lista de argumentos no reemplaza:**
  crea una sobrecarga. Con dos firmas del mismo nombre, PostgREST no sabe a cuál
  llamar y responde un error que no menciona la palabra "sobrecarga" por ningún
  lado. Al cambiarle los parámetros a una función hay que tirar la firma anterior
  con `drop function if exists ... (firma vieja)` en la misma migración.
- **Una prueba que siembra datos tiene que borrarlos.** La corrida que deja basura
  hace fallar a la siguiente con totales que no cuadran, y se pierde media hora
  buscando en el buscador un bug que no existe.
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
- **Una gráfica de PowerPoint es un muro de renglones.** Cada etiqueta de un
  gráfico sale como un fragmento suelto en su propio renglón, así que el texto
  extraído de una lámina con datos no se parece a la lámina: son cuarenta
  renglones de `3.62 / consultas / 2.13 / consultas / -41.2% / menos consultas`
  donde había una tabla de tres columnas. `src/lib/laminas.ts` lo rearma, y esas
  reglas son las únicas del proyecto que pueden equivocarse **en silencio**: si
  una decide mal, no falla nada, simplemente el archivo dice algo que no decía.
  Dos casos reales lo enseñan: un "3" que numeraba un apartado se quedaba con
  el encabezado siguiente pegado como si fuera su unidad de medida, y un
  "Caída del" se pegó al `$40,000` anterior en vez de al `79%` que venía
  debajo. De ahí las dos normas: lo que no se reconoce se deja como párrafo, y
  la pantalla describe la forma ("seis cifras seguidas") sin nombrar la
  intención ("escala"). El parser vive en `lib` y no en el componente para
  poder correrlo contra un archivo de verdad sin abrir un navegador.

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

---

## 12. Carga masiva

La pantalla de subida sirve para uno o dos documentos. Un acervo que llega en una
carpeta con cientos de archivos —y con su historial de versiones enredado en los
nombres— necesita otra cosa.

### El flujo

```bash
npm run carga:preparar -- "~/carpeta"   # → carga.xlsx + carga.datos.json
#   revisar y corregir el Excel
npm run carga:cargar   -- carga.xlsx --ensayo
npm run carga:cargar   -- carga.xlsx
#   revisar en la aplicación local, y entonces:
PROD_URL=… PROD_ANON=… PROD_SVC=… npx tsx scripts/promover.mts
```

**La plantilla sale prellenada, no vacía.** Es la decisión de diseño: quien cataloga
corrige mucho más rápido de lo que redacta. Un Excel en blanco para 300 archivos son
varios días de trabajo y una tasa alta de campos vacíos; uno prellenado son unas
horas de revisión. Con `--sin-ia` no se gasta API y se rellena solo con lo que la
ruta y el nombre ya dicen; sin la bandera, Claude lee el texto y propone todo.

**El `.datos.json` no se toca.** Lleva el texto extraído y los checksums para que
cargar no vuelva a procesar todo, y para que nadie edite un checksum en Excel. Viaja
junto al `.xlsx`; si se separan, cargar se detiene.

### Agrupar versiones

Varios archivos son el mismo documento guardado varias veces. Se agrupan por
**nombre de familia** —el nombre sin sus marcas de versión (`v3`, `FINAL`,
`REVISADA`, `(1)`, fechas, horas)— **y extensión**: un `.xlsx` y un `.pptx` que se
llaman parecido no son versiones uno del otro, son el concentrado y la presentación
que salió de él.

El orden lo manda la fecha que **declara el nombre**, no la del sistema de archivos
(ver §10). Dentro del Excel, dos columnas lo hacen explícito:

| Columna | Qué hace |
|---|---|
| `documento` | El agrupador. Filas que lo comparten son un solo documento. |
| `version` | 1, 2, 3… El orden. La última queda vigente. |

Los metadatos van **solo en la fila de la versión 1**: describen al documento, no al
archivo, y repetirlos en seis filas invita a que las seis se contradigan.

**El detector se equivoca separando de más, a propósito.** Un documento partido en
dos se nota al revisar; dos documentos fundidos esconden uno en el historial del
otro y nadie lo vuelve a ver. Cuando hace falta unir dos familias que el detector
separó, `--unir "familia1|xlsx + familia2|xlsx"` lo declara por escrito para esa
carga, sin aflojar la regla general.

### Propiedades que importan más que la velocidad

- **Reanudable.** Cada fila que se logra guarda su uuid en la columna `id`. Volver a
  correr salta lo hecho, así que si truena en la 140 de 300 se corrige y se
  reintenta sin duplicar. Una versión que falló dentro de un documento ya creado
  también se reintenta: no se salta el grupo entero por tener `id` en la primera fila.
- **Explica.** La fila que no pasa validación deja el motivo en la columna `nota`,
  en la misma hoja donde está el error. Nadie tiene que leer la terminal.
- **Detecta duplicados dos veces.** Por checksum dentro de la carpeta y contra lo ya
  cargado, al preparar y otra vez al cargar: entre los dos pasos alguien pudo subir
  el mismo archivo por la aplicación.

### Promover a producción

`scripts/promover.mts`. **`migrar-a-produccion.mts` quedó obsoleto**: fue una
herramienta de un solo uso que aplana el responsable al usuario que corre el script
y deduplica por título. El nuevo conserva el responsable de cada documento
—buscándolo por correo en producción— y copia las versiones en orden, de modo que el
historial llega igual que en local. Es idempotente por título.

**El acervo solo agrega versiones hacia adelante.** No se puede insertar una versión
anterior a las que ya existen. Si producción ya tiene el archivo final de un
historial que se va a cargar completo, el orden queda al revés; en ese caso se carga
en local desde cero y se promueve, que es justo el camino de arriba.

### Lo que no entra

PDF, DOCX, XLSX y PPTX, hasta 50 MB. Los formatos viejos (`.doc`, `.xls`, `.ppt`),
las imágenes sueltas y los comprimidos quedan fuera y aparecen en la hoja
`rechazados` con el motivo. **Un PDF escaneado entra pero no es buscable**: no tiene
capa de texto, así que Claude tampoco puede proponerle metadatos. El script lo avisa
al terminar, porque si el acervo es papel digitalizado eso deja de ser un detalle y
se vuelve una conversación sobre OCR.

---

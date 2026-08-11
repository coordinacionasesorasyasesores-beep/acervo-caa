# Acervo CAA — arranque

Repositorio documental de la Coordinación de Asesoras y Asesores del ISSSTE.
Next.js 15 + Supabase. Todo en español: interfaz, comentarios y commits.

**Lee `REPOSITORIO_CAA.md` antes de tocar nada.** Es el documento maestro:
decisiones cerradas, esquema, reglas de negocio y trampas conocidas. Este
archivo solo es el mapa para empezar.

## Qué es

Un archivo documental interno, no un gestor de archivos. Responde una
pregunta: *"¿quién tiene el Excel actualizado?"*. De ahí salen sus tres
promesas: el enlace permanente no cambia aunque el documento pase por
catorce versiones, nada se borra nunca, y se busca por lo que dice adentro
del archivo y no solo por su título.

## Estado (11 de agosto de 2026)

**En producción y funcionando:** 11 documentos publicados, 23 versiones,
110 MB. Cuatro documentos con historial: el concentrado del ISSSTE con seis
versiones, y con dos cada uno el histórico de anuarios, la presentación del
neoliberalismo y las gráficas.

**Sin estrenar:** la sugerencia de metadatos con Claude. El código está y
funciona, pero falta `ANTHROPIC_API_KEY` en `.env.local` y no se ha hecho
ni una llamada real. Cuesta menos de un centavo de dólar por documento.

## Cómo se levanta

```bash
npx supabase start          # necesita Docker Desktop abierto
npm run dev                 # http://localhost:3000
```

`.env.local` trae dos bloques: el local activo y el de **producción
comentado a propósito**, para que ningún script lo tome por accidente. Los
scripts que escriben en producción piden las credenciales por variables de
entorno; teclearlas tiene que costar trabajo.

## Los dos entornos

| | Local | Producción |
|---|---|---|
| Supabase | `127.0.0.1:54321` | ref `mmqqtpixmjbdaxmvksoz` |
| App | `localhost:3000` | `acervo-caa.vercel.app` |
| Para qué | Probar y revisar cargas | Lo real |

**Vercel no despliega desde git.** Publicar son dos pasos: `git push` y
después `npx vercel --prod`. Conectar el repositorio para que despliegue
solo está pendiente y necesita permiso de administrador en GitHub, que hoy
no se tiene: el repo pertenece a la cuenta `coordinacionasesorasyasesores-beep`
y se entra como colaborador.

## Carga masiva

Dos comandos. El primero recorre una carpeta, extrae el texto, propone
metadatos y agrupa las versiones; el segundo carga lo revisado.

```bash
npm run carga:preparar -- "~/carpeta" [--sin-ia] [--unir "familia1 + familia2"]
npm run carga:cargar   -- carga.xlsx [--ensayo]
```

Sale un `.xlsx` que una persona revisa y un `.datos.json` hermano que no se
toca: lleva el texto extraído y los checksums para que cargar no vuelva a
procesar todo. Los dos viajan juntos.

Para promover a producción, `scripts/promover.mts`. **No uses
`migrar-a-produccion.mts`**: fue de un solo uso, aplana el responsable y
deduplica por título.

Detalle completo en `REPOSITORIO_CAA.md` §12.

## Lo que muerde

Cuatro cosas que ya costaron horas. La lista larga está en §10 del
documento maestro.

- **Los extractores del navegador no corren en Node.** `pdfjs-dist` pide la
  build `legacy`; `mammoth` quiere `buffer` y no `arrayBuffer`; SheetJS no
  toca el disco sin `XLSX.set_fs(fs)`. Los tres fallan con errores que
  parecen otra cosa. `scripts/comun-carga.mts` ya tiene las versiones de
  Node; úsalas y no importes de `src/lib/extract/` en un script.
- **`redirectTo` de Supabase Auth se descarta en silencio** si la URL no
  está en la lista blanca: la sustituye por la Site URL y no avisa. Es lo
  que rompió la recuperación de contraseña durante una tarde entera.
- **El correo integrado admite 2 envíos por hora** y no se puede subir sin
  SMTP propio: la API lo rechaza explícitamente. Además solo entrega a
  miembros del proyecto de Supabase.
- **`next build` y `next dev` se pisan.** Compilar con el servidor de
  desarrollo encendido deja la pantalla sin estilos y con los chunks rotos.
  Parece un desastre de diseño y no lo es: `rm -rf .next` y levantar otra
  vez.

## Si alguien queda fuera

No hay autoservicio que dependa solo del correo, porque el correo es
frágil. Hay dos administradores justo para esto: **uno le asigna
contraseña al otro** desde `/admin/usuarios`.

Si ninguno puede entrar, el portón de atrás es generar un enlace de un
solo uso con la llave de servicio y abrirlo en el navegador:

```
https://acervo-caa.vercel.app/auth/confirm?token_hash=<hashed_token>&type=recovery
```

El `hashed_token` sale de `auth.admin.generateLink({type:'recovery', email})`,
que **no manda correo** y por lo tanto no toca el tope. Vence en 60 minutos
y sirve una vez. Lleva a la pantalla donde la persona elige su contraseña.

## Al trabajar aquí

- Las migraciones son la única forma de cambiar la base. Nunca el panel.
- Cada tabla nueva nace con su política RLS en la misma migración.
- Los comentarios explican **por qué**, no qué hace la línea de abajo.
- Toda decisión que cambie lo escrito se actualiza en `REPOSITORIO_CAA.md`
  en el mismo commit.

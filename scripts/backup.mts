/**
 * Respaldo diario de la base a R2.
 *
 * El plan gratuito de Supabase no incluye respaldos. Sin esto, un borrado
 * accidental o un problema del proveedor se lleva el acervo entero, y la
 * promesa del proyecto —"que nunca se pierda cuál es la versión buena"—
 * depende de que la base siga ahí.
 *
 * Los archivos no se respaldan aquí: ya viven en R2, que es el respaldo.
 * Lo que se copia es la base, que es lo único que no tiene otra copia.
 *
 *   npx tsx scripts/backup.mts
 *
 * Variables necesarias:
 *   SUPABASE_DB_URL   cadena de conexión, **por el Session Pooler**
 *   R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 *   RESPALDO_DIAS     cuántos conservar (por omisión 30)
 *   PG_DUMP           binario alterno, para probar en local
 */
import { execFileSync } from 'node:child_process'
import { gzipSync } from 'node:zlib'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { borrarObjeto, listarObjetos, subirDesdeServidor } from '../src/lib/r2.ts'

const PREFIJO = 'respaldos/'
const DIAS = Number(process.env.RESPALDO_DIAS ?? 30)

function requerido(nombre: string): string {
  const v = process.env[nombre]
  if (!v) {
    console.error(`Falta la variable ${nombre}.`)
    process.exit(1)
  }
  return v
}

const cadena = requerido('SUPABASE_DB_URL')

// El runner de GitHub no tiene IPv6 y la conexión directa de Supabase en el
// plan gratuito es IPv6: hay que apuntar al Session Pooler, que expone
// IPv4. Es la trampa de la §10 del documento, y falla con un
// "network unreachable" que no menciona IPv6 por ningún lado.
const esLocal = /(?:localhost|127\.0\.0\.1)/.test(cadena)

if (!esLocal && !cadena.includes('pooler.supabase.com')) {
  console.error(
    'SUPABASE_DB_URL no apunta al Session Pooler.\n' +
      'La conexión directa del plan gratuito es solo IPv6 y los runners de\n' +
      'GitHub no la alcanzan. Usa la cadena del pooler (puerto 5432, host\n' +
      'aws-0-<region>.pooler.supabase.com) desde Project Settings → Database.',
  )
  process.exit(1)
}

const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const archivo = join(tmpdir(), `acervo-${sello}.sql`)

// El binario se puede sustituir para probar en local, donde el pg_dump
// del sistema suele ir por detrás del servidor que levanta Supabase.
const PG_DUMP = process.env.PG_DUMP ?? 'pg_dump'

console.log('Volcando la base…')
try {
  execFileSync(
    PG_DUMP,
    [
      cadena,
      // Solo lo nuestro: los esquemas de Supabase los recrea el proyecto.
      // Restaurar `auth` sobre un proyecto nuevo pelea con lo que ya trae.
      '--schema=public',
      '--no-owner',
      '--no-privileges',
      '--file',
      archivo,
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  )
} catch {
  console.error(
    `${PG_DUMP} falló. Suele ser una de tres: no está instalado, la cadena\n` +
      'es incorrecta, o su versión va por detrás de la del servidor (el\n' +
      'mensaje dice "server version mismatch").',
  )
  process.exit(1)
}

const crudo = readFileSync(archivo)
rmSync(archivo, { force: true })

// Un volcado SQL es texto repetitivo: comprime a una fracción, y en R2 se
// paga por lo que se guarda.
const comprimido = gzipSync(crudo, { level: 9 })
const clave = `${PREFIJO}acervo-${sello}.sql.gz`

console.log(
  `Subiendo ${clave} (${(comprimido.length / 1024 / 1024).toFixed(2)} MB, ` +
    `de ${(crudo.length / 1024 / 1024).toFixed(2)} MB en crudo)…`,
)

await subirDesdeServidor(
  clave,
  comprimido.buffer.slice(
    comprimido.byteOffset,
    comprimido.byteOffset + comprimido.byteLength,
  ) as ArrayBuffer,
  'application/gzip',
)

// ── Purga ────────────────────────────────────────────────────────
// Se conservan los últimos N. Sin purga, el respaldo diario se come el
// espacio gratuito de R2 y entonces deja de haber respaldos justo cuando
// el acervo es más grande.
const todos = (await listarObjetos(PREFIJO)).sort()
const sobran = todos.slice(0, Math.max(0, todos.length - DIAS))

for (const viejo of sobran) {
  await borrarObjeto(viejo)
  console.log(`Purgado ${viejo}`)
}

console.log(
  `Listo. ${todos.length - sobran.length} respaldos en R2 ` +
    `(se conservan ${DIAS} días).`,
)

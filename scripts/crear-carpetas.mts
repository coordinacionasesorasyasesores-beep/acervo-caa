/**
 * Crea el árbol de carpetas donde se recopilan los archivos, con los nombres
 * exactos del catálogo de temas.
 *
 *   npx tsx scripts/crear-carpetas.mts "~/Acervo/centro-investigacion"
 *
 * Existe porque quien recopila no programa y no debería tener que adivinar
 * cómo se llaman los temas. Si las carpetas se llaman igual que el catálogo,
 * `preparar-carga.mts` deduce el tema de la ruta y el Excel sale con esa
 * columna ya llena, sin gastar una sola llamada de API. Una carpeta escrita
 * a mano como "Salud" o "presupuestos" no resuelve y deja la celda vacía.
 *
 * No borra nada: si la carpeta ya existe, la deja como está.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { abrirSesion, cargarEnv, leerCatalogos, temasEnOrden } from './comun-carga.mts'

const destino = process.argv[2]
if (!destino) {
  console.error('Uso: npx tsx scripts/crear-carpetas.mts <carpeta>')
  process.exit(1)
}

const raiz = resolve(destino.replace(/^~/, process.env.HOME ?? '~'))

cargarEnv()
const { sb } = await abrirSesion()
const catalogos = await leerCatalogos(sb)

// El nombre del tema tal cual, sin numerar: el prefijo "01 " rompería la
// coincidencia con el catálogo, que es lo único que hace útil al árbol.
// Solo se limpia lo que un sistema de archivos no admite.
const seguro = (nombre: string) => nombre.replace(/[/:\\]/g, '-').trim()

let creadas = 0
const crear = (ruta: string) => {
  if (existsSync(ruta)) return
  mkdirSync(ruta, { recursive: true })
  creadas++
}

crear(raiz)

for (const tema of temasEnOrden(catalogos.topics)) {
  if (tema.parent_id === null) {
    crear(join(raiz, seguro(tema.name)))
  } else {
    const padre = catalogos.topics.find((t) => t.id === tema.parent_id)!
    crear(join(raiz, seguro(padre.name), seguro(tema.name)))
  }
}

// Para lo que no encaja en ningún tema. Con guion bajo y no con punto: el
// recorrido de preparar-carga ignora lo que empieza con punto.
crear(join(raiz, '_Sin clasificar'))

const leeme = `CÓMO GUARDAR LOS ARCHIVOS EN ESTA CARPETA
=========================================

1. Guarda cada archivo dentro de la subcarpeta del tema del que habla.
   El tema es DE QUÉ HABLA el documento, no qué formato tiene ni para qué
   sirve. Si le quitas el formato, ¿de qué habla? Eso es el tema.

   Cuando hay subcarpeta específica, úsala:
     Salud y servicios / Camas / censo de camas 2025.xlsx
   Si solo alcanza para el tema general, déjalo en la carpeta de arriba:
     Salud y servicios / panorama general.pdf

2. Si no sabes dónde va, ponlo en "_Sin clasificar". No es un problema:
   ese dato se llena después en el Excel. Es mejor eso que ponerlo en una
   carpeta que no le corresponde.

3. No cambies los nombres de las carpetas ni crees carpetas nuevas.
   Están escritas igual que el catálogo del sistema; si se cambia una
   letra, el tema deja de reconocerse y hay que llenarlo a mano.

4. Solo entran cuatro formatos: PDF, Word (.docx), Excel (.xlsx) y
   PowerPoint (.pptx). Máximo 50 MB por archivo.

   Los formatos viejos (.doc, .xls, .ppt) NO entran: ábrelos y guárdalos
   como .docx, .xlsx o .pptx. Las fotos y los archivos comprimidos (.zip)
   tampoco entran.

5. El nombre del archivo ayuda. "censo de camas 2025.xlsx" permite
   proponer título y año solos; "documento1_v3_FINAL.xlsx" no.
   No hace falta que quede perfecto: se corrige después en el Excel.

6. Si el mismo archivo está en dos lugares, no importa: el sistema
   detecta la copia y se queda con una sola.

Cuando termines, avisa. El siguiente paso genera un Excel con una fila
por archivo, ya con lo que se pudo deducir, para que lo revises.
`

const rutaLeeme = join(raiz, 'LEEME.txt')
if (!existsSync(rutaLeeme)) writeFileSync(rutaLeeme, leeme)

console.log(`\n${raiz}`)
console.log(`  ${creadas} carpeta(s) creada(s), ${existsSync(rutaLeeme) ? 'LEEME.txt listo' : ''}`)
console.log(`\nEntrégale esta carpeta a quien va a recopilar. Cuando termine:`)
console.log(`  npx tsx scripts/preparar-carga.mts "${raiz}" --sin-ia`)

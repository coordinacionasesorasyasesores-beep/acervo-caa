/**
 * Pasa archivos reales por los extractores y enseña qué texto sale.
 *
 * Los extractores corren en el navegador, pero su lógica no depende del DOM,
 * así que en Node se pueden probar con archivos pesados de verdad sin montar
 * un navegador. Sirve para contestar la única pregunta que importa de esta
 * capa: ¿lo que se va a indexar se parece a lo que dice el documento?
 *
 *   npm run prueba:extraccion -- "~/Downloads/CONCENTRADO.xlsx" "~/Downloads/laminas.pptx"
 */
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { extraerPptx } from '../src/lib/extract/pptx.ts'
import { extraerXlsx } from '../src/lib/extract/xlsx.ts'
import { extraerDocx } from '../src/lib/extract/docx.ts'

const rutas = process.argv.slice(2)
if (rutas.length === 0) {
  console.error('Uso: npm run prueba:extraccion -- <archivo> [archivo...]')
  process.exit(1)
}

/** Tope de Postgres para `to_tsvector`. Pasarlo revienta el guardado. */
const TOPE_TSVECTOR = 1024 * 1024

for (const ruta of rutas) {
  const buf = readFileSync(ruta)
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  const ext = ruta.toLowerCase().split('.').pop()

  const extraer = ext === 'pptx' ? extraerPptx : ext === 'docx' ? extraerDocx : extraerXlsx

  const t0 = performance.now()
  const r = await extraer(ab)
  const ms = Math.round(performance.now() - t0)
  const bytes = Buffer.byteLength(r.texto, 'utf8')

  console.log(`\n═══ ${basename(ruta)} ═══`)
  console.log('  peso archivo:  ', (buf.length / 1024 / 1024).toFixed(2), 'MB')
  console.log('  tiempo:        ', ms, 'ms')
  console.log('  páginas/hojas: ', r.paginas)
  console.log('  caracteres:    ', r.texto.length.toLocaleString('es-MX'))
  console.log(
    '  bytes utf8:    ',
    bytes.toLocaleString('es-MX'),
    bytes > TOPE_TSVECTOR ? '⚠️  pasa 1 MB: el tsvector se acota' : '',
  )
  console.log('  advertencia:   ', r.advertencia ?? '(ninguna)')
  console.log('  ── primeros 900 caracteres ──')
  console.log(r.texto.slice(0, 900).replace(/^/gm, '  │ '))
  console.log('  ── últimos 300 ──')
  console.log(r.texto.slice(-300).replace(/^/gm, '  │ '))
}

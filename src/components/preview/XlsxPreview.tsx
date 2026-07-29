'use client'

import { useEffect, useMemo, useState } from 'react'
import { useArchivo } from './useArchivo'
import { Cargando, Fallo } from './Estados'

/**
 * Tabla navegable de un Excel: selector de hojas y filtro por columna.
 *
 * El caso que manda es el concentrado del ISSSTE —cuatro hojas, decenas de
 * columnas— y lo que se hace con él es buscar una fila: "¿cuántas camas
 * había en 1994?". Por eso el filtro va por columna y no una caja global:
 * la pregunta siempre es sobre una columna concreta.
 */
const MAX_FILAS = 500

type Celda = string | number | boolean | Date | null

export function XlsxPreview({ versionId }: { versionId: string }) {
  const { datos, error, cargando } = useArchivo(versionId)
  const [hojas, setHojas] = useState<string[]>([])
  const [activa, setActiva] = useState('')
  const [filas, setFilas] = useState<Celda[][]>([])
  const [problema, setProblema] = useState<string | null>(null)
  const [filtros, setFiltros] = useState<Record<number, string>>({})
  const [truncada, setTruncada] = useState(false)

  useEffect(() => {
    if (!datos) return
    let cancelado = false

    async function leer() {
      try {
        const XLSX = await import('xlsx')
        const libro = XLSX.read(datos!, { type: 'array', cellDates: true })
        if (cancelado) return

        setHojas(libro.SheetNames)
        const nombre = activa && libro.SheetNames.includes(activa) ? activa : libro.SheetNames[0]
        setActiva(nombre)

        const hoja = libro.Sheets[nombre]
        const todas = XLSX.utils.sheet_to_json<Celda[]>(hoja, {
          header: 1,
          blankrows: false,
          defval: '',
        })

        const inicio = filaDeEncabezado(todas)
        const utiles = todas.slice(inicio)
        setTruncada(utiles.length > MAX_FILAS)
        setFilas(utiles.slice(0, MAX_FILAS))
      } catch (e) {
        if (!cancelado) {
          setProblema(e instanceof Error ? e.message : 'No se pudo leer el libro.')
        }
      }
    }

    void leer()
    return () => {
      cancelado = true
    }
  }, [datos, activa])

  const encabezado = filas[0] ?? []
  const cuerpo = useMemo(() => {
    const activos = Object.entries(filtros).filter(([, v]) => v.trim())
    if (activos.length === 0) return filas.slice(1)

    return filas.slice(1).filter((fila) =>
      activos.every(([i, v]) =>
        texto(fila[Number(i)]).toLowerCase().includes(v.trim().toLowerCase()),
      ),
    )
  }, [filas, filtros])

  if (error || problema) return <Fallo>{error ?? problema}</Fallo>
  if (cargando || filas.length === 0) return <Cargando>Abriendo el libro…</Cargando>

  return (
    <div>
      {hojas.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {hojas.map((h) => (
            <button
              key={h}
              onClick={() => {
                setActiva(h)
                setFiltros({})
              }}
              className={`rounded border px-2.5 py-1 text-xs transition-colors ${
                h === activa
                  ? 'border-acento bg-acento-suave font-medium text-acento'
                  : 'border-linea bg-white hover:bg-papel'
              }`}
            >
              {h}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-linea bg-white">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 bg-papel">
            <tr>
              {encabezado.map((c, i) => (
                <th
                  key={i}
                  className="border-b border-linea px-2 py-1.5 text-left align-top font-medium whitespace-nowrap"
                >
                  <div className="max-w-64 truncate" title={texto(c)}>
                    {texto(c) || <span className="text-tinta-suave">—</span>}
                  </div>
                  <input
                    value={filtros[i] ?? ''}
                    onChange={(e) => setFiltros({ ...filtros, [i]: e.target.value })}
                    placeholder="filtrar"
                    aria-label={`Filtrar por ${texto(c) || `columna ${i + 1}`}`}
                    className="mt-1 w-full min-w-20 rounded border border-linea px-1 py-0.5 text-xs font-normal outline-none focus:border-acento"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cuerpo.map((fila, f) => (
              <tr key={f} className="even:bg-papel/50">
                {encabezado.map((_, i) => (
                  <td key={i} className="border-b border-linea/60 px-2 py-1 whitespace-nowrap">
                    <div className="max-w-64 truncate" title={texto(fila[i])}>
                      {texto(fila[i])}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-1.5 text-xs text-tinta-suave">
        {cuerpo.length.toLocaleString('es-MX')} de{' '}
        {(filas.length - 1).toLocaleString('es-MX')} filas
        {truncada && ` · la vista previa muestra las primeras ${MAX_FILAS.toLocaleString('es-MX')}; descarga el archivo para verlo completo`}
      </p>
    </div>
  )
}

/**
 * Encuentra dónde empiezan de verdad las columnas.
 *
 * Casi ningún Excel real empieza con la fila de encabezados: arriba hay un
 * título, a veces una nota de qué consolida y una fila en blanco. Tomar la
 * primera fila como encabezado deja la tabla rotulada "DATA ISSSTE —
 * CONCENTRADO FINAL" y una hilera de guiones, que es peor que no rotular.
 *
 * La regla es la que usaría cualquiera mirando la hoja: la primera fila
 * con varias celdas llenas es la de los nombres de columna. Se buscan solo
 * en las diez primeras para no confundir una fila de datos completa con un
 * encabezado en una hoja que sí empieza limpia.
 */
function filaDeEncabezado(filas: Celda[][]): number {
  const anchoMax = Math.max(...filas.slice(0, 20).map((f) => f.length), 0)
  if (anchoMax < 3) return 0

  for (let i = 0; i < Math.min(filas.length, 10); i++) {
    const llenas = filas[i].filter((c) => texto(c).trim() !== '').length
    if (llenas >= Math.max(3, anchoMax * 0.6)) return i
  }
  return 0
}

function texto(c: Celda | undefined): string {
  if (c === null || c === undefined) return ''
  if (c instanceof Date) return c.toISOString().slice(0, 10)
  return String(c)
}

'use client'

import { useEffect, useState, useTransition } from 'react'
import { temasEnOrden, type Topic } from '@/lib/catalogos'
import { useArchivo } from '@/components/preview/useArchivo'
import { promover, type ColumnaDeclarada } from './acciones'

/**
 * El formulario de promoción.
 *
 * El Excel se lee en el navegador —el mismo camino que en la subida— y se
 * enseñan las primeras filas de cada hoja para que quien declara las
 * columnas esté mirando los datos mientras lo hace. Declarar unidades de
 * memoria, con el archivo cerrado, es como se cuelan los errores que
 * después nadie encuentra.
 */

const UNIDADES = [
  'personas', 'unidades', 'camas', 'consultas', 'piezas', 'recetas',
  'pesos', 'miles de pesos', 'millones de pesos', 'pesos de 2025',
  'metros cuadrados', 'porcentaje', 'año', 'índice',
]

const TIPOS = [
  { valor: 'numero', nombre: 'Número' },
  { valor: 'texto', nombre: 'Texto' },
  { valor: 'fecha', nombre: 'Fecha' },
  { valor: 'categoria', nombre: 'Categoría' },
]

type Celda = string | number | boolean | Date | null

export function Promotor({
  versionId,
  titulo,
  filename,
  topics,
}: {
  versionId: string
  titulo: string
  filename: string
  topics: Topic[]
}) {
  const [abierto, setAbierto] = useState(false)

  if (!abierto) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-linea bg-white px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-sm">{titulo}</p>
          <p className="mt-0.5 truncate text-xs text-tinta-suave">{filename}</p>
        </div>
        <button
          onClick={() => setAbierto(true)}
          className="shrink-0 rounded border border-linea px-2.5 py-1 text-xs transition-colors hover:bg-papel"
        >
          Promover una hoja
        </button>
      </div>
    )
  }

  return (
    <Formulario
      versionId={versionId}
      titulo={titulo}
      topics={topics}
      cerrar={() => setAbierto(false)}
    />
  )
}

function Formulario({
  versionId,
  titulo,
  topics,
  cerrar,
}: {
  versionId: string
  titulo: string
  topics: Topic[]
  cerrar: () => void
}) {
  const { datos, error, cargando } = useArchivo(versionId)
  const [hojas, setHojas] = useState<string[]>([])
  const [activa, setActiva] = useState('')
  const [filas, setFilas] = useState<Celda[][]>([])
  const [declaradas, setDeclaradas] = useState<Record<number, Partial<ColumnaDeclarada>>>({})
  const [notas, setNotas] = useState('')
  const [problema, setProblema] = useState<string | null>(null)
  const [listo, setListo] = useState(false)
  const [insistiendo, setInsistiendo] = useState(false)
  const [enviando, empezar] = useTransition()

  const temas = temasEnOrden(topics)

  // Se lee el libro una sola vez, cuando llegan los bytes, y se releen las
  // filas al cambiar de hoja. En un efecto y no durante el render: un
  // `setState` en pleno render vuelve a renderizar, que vuelve a leer, que
  // vuelve a llamar a `setState`.
  useEffect(() => {
    if (!datos) return
    let cancelado = false

    void (async () => {
      try {
        const XLSX = await import('xlsx')
        const libro = XLSX.read(datos, { type: 'array', cellDates: true })
        if (cancelado) return

        setHojas(libro.SheetNames)
        const hoja = activa && libro.SheetNames.includes(activa)
          ? activa
          : libro.SheetNames[0]
        if (hoja !== activa) setActiva(hoja)

        setFilas(
          XLSX.utils.sheet_to_json<Celda[]>(libro.Sheets[hoja], {
            header: 1,
            blankrows: false,
            defval: '',
          }),
        )
      } catch (e) {
        if (!cancelado) {
          setProblema(e instanceof Error ? e.message : 'No se pudo leer el libro.')
        }
      }
    })()

    return () => {
      cancelado = true
    }
  }, [datos, activa])

  const inicio = filaDeEncabezado(filas)
  const encabezado = filas[inicio] ?? []
  const muestra = filas.slice(inicio + 1, inicio + 4)

  function cambiar(i: number, campo: keyof ColumnaDeclarada, valor: unknown) {
    setDeclaradas((prev) => ({ ...prev, [i]: { ...prev[i], [campo]: valor } }))
    // Si acaba de escribir una unidad, la advertencia ya no aplica.
    if (insistiendo) {
      setInsistiendo(false)
      setProblema(null)
    }
  }

  function guardar() {
    const columnas: ColumnaDeclarada[] = []
    const usadas = new Set<string>()

    encabezado.forEach((c, i) => {
      const d = declaradas[i]
      // Una columna sin etiqueta es una columna que el admin decidió no
      // declarar: se queda fuera del dataset en vez de entrar sin nombre.
      const label = (d?.label ?? String(c ?? '')).trim()
      if (!label) return

      let key = aClave(label)
      while (usadas.has(key)) key = `${key}_${usadas.size}`
      usadas.add(key)

      columnas.push({
        column_key: key,
        label,
        unit: d?.unit?.trim() || null,
        dtype: d?.dtype ?? null,
        topic_id: d?.topic_id ?? null,
        position: i,
      })
    })

    if (columnas.length === 0) {
      setProblema('Declara al menos una columna con etiqueta.')
      return
    }

    // Promover es, por definición, declarar unidades (regla 7). Sin una
    // sola unidad en veintitrés columnas, lo que se está guardando es la
    // hoja tal cual, y entonces no hay dataset: hay una copia. No se
    // bloquea —"Año" y "Notas" no tienen unidad, y puede haber hojas que
    // de verdad sean todo texto— pero sí se pregunta una vez.
    if (!columnas.some((c) => c.unit) && !insistiendo) {
      setInsistiendo(true)
      setProblema(
        'No declaraste ninguna unidad. Un número sin unidad no se puede sumar sin equivocarse: es lo que separa 6,050,345 pesos de 6,050,345 miles de pesos. Vuelve a pulsar si de verdad esta hoja no lleva unidades.',
      )
      return
    }

    const indices = new Map(columnas.map((c) => [c.position, c.column_key]))
    const cuerpo = filas.slice(inicio + 1).map((fila) => {
      const obj: Record<string, unknown> = {}
      indices.forEach((clave, i) => {
        const v = fila[i]
        obj[clave] = v instanceof Date ? v.toISOString().slice(0, 10) : (v ?? null)
      })
      return obj
    })

    setProblema(null)
    empezar(async () => {
      const r = await promover(versionId, activa, notas, columnas, cuerpo)
      if (r.error) setProblema(r.error)
      else setListo(true)
    })
  }

  return (
    <div className="rounded-lg border border-acento/40 bg-white p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium">{titulo}</h3>
        <button
          onClick={cerrar}
          className="text-xs text-tinta-suave hover:text-tinta"
        >
          Cerrar
        </button>
      </div>

      {listo ? (
        <p className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
          Hoja «{activa}» promovida. Aparece arriba, en las ya promovidas.
        </p>
      ) : error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : cargando ? (
        <p className="animate-pulse text-sm text-tinta-suave">Abriendo el libro…</p>
      ) : (
        <>
          {hojas.length > 1 && (
            <div className="mb-3 flex flex-wrap gap-1">
              {hojas.map((h) => (
                <button
                  key={h}
                  onClick={() => {
                    setActiva(h)
                    setDeclaradas({})
                    setInsistiendo(false)
                    setProblema(null)
                  }}
                  className={`rounded border px-2.5 py-1 text-xs transition-colors ${
                    h === activa
                      ? 'border-acento bg-acento-suave font-medium text-acento'
                      : 'border-linea hover:bg-papel'
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>
          )}

          <div className="max-h-96 overflow-auto rounded border border-linea">
            <table className="min-w-full text-xs">
              <tbody>
                {encabezado.map((c, i) => {
                  const d = declaradas[i] ?? {}
                  const nombreDefecto = String(c ?? '').trim()

                  return (
                    <tr key={i} className="border-b border-linea last:border-0">
                      <td className="w-80 border-r border-linea bg-papel px-2 py-1.5 align-top">
                        <input
                          defaultValue={nombreDefecto}
                          onChange={(e) => cambiar(i, 'label', e.target.value)}
                          placeholder="(sin declarar)"
                          title={nombreDefecto}
                          className="w-full rounded border border-linea px-1.5 py-1 outline-none focus:border-acento"
                        />
                        {/* El nombre original completo, entero y sin cortar.
                            El concentrado trae dos columnas que empiezan
                            igual —"Gasto en obra pública (miles de pesos) —
                            ANTERIOR" y "— NUEVO"— y dentro de un campo de
                            texto se ven idénticas: quien declara no puede
                            saber cuál está declarando. */}
                        {nombreDefecto && (
                          <p className="mt-1 text-[11px] leading-snug break-words text-tinta-suave">
                            {nombreDefecto}
                          </p>
                        )}
                        <p className="mt-0.5 truncate text-[11px] text-tinta-suave italic">
                          ej.: {muestra.map((f) => textoDe(f[i])).filter(Boolean).slice(0, 2).join(' · ') || '—'}
                        </p>
                      </td>
                      <td className="px-2 py-1.5 align-top">
                        <div className="flex flex-wrap gap-1.5">
                          <input
                            list="unidades-caa"
                            value={d.unit ?? ''}
                            onChange={(e) => cambiar(i, 'unit', e.target.value)}
                            placeholder="unidad"
                            className="w-36 rounded border border-linea px-1.5 py-1 outline-none focus:border-acento"
                          />
                          <select
                            value={d.dtype ?? ''}
                            onChange={(e) => cambiar(i, 'dtype', e.target.value || null)}
                            className="rounded border border-linea px-1.5 py-1 outline-none focus:border-acento"
                          >
                            <option value="">tipo</option>
                            {TIPOS.map((t) => (
                              <option key={t.valor} value={t.valor}>
                                {t.nombre}
                              </option>
                            ))}
                          </select>
                          <select
                            value={d.topic_id ?? ''}
                            onChange={(e) =>
                              cambiar(i, 'topic_id', Number(e.target.value) || null)
                            }
                            className="max-w-48 rounded border border-linea px-1.5 py-1 outline-none focus:border-acento"
                          >
                            <option value="">tema</option>
                            {temas.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.parent_id ? `  ${t.name}` : t.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <datalist id="unidades-caa">
            {UNIDADES.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="min-w-56 flex-1">
              <span className="text-sm font-medium">Nota de la curaduría</span>
              <input
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Qué se decidió al declarar: exclusiones, supuestos, de dónde salen los datos"
                className="mt-1 w-full rounded border border-linea px-2.5 py-1.5 text-sm outline-none focus:border-acento"
              />
            </label>
            <button
              onClick={guardar}
              disabled={enviando || filas.length === 0}
              className="rounded bg-acento px-3.5 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {enviando
                ? 'Promoviendo…'
                : insistiendo
                  ? 'Promover sin unidades'
                  : `Promover «${activa}»`}
            </button>
          </div>

          <p className="mt-1.5 text-xs text-tinta-suave">
            Se guardan {Math.max(filas.length - inicio - 1, 0).toLocaleString('es-MX')}{' '}
            filas. Las columnas sin etiqueta se quedan fuera.
          </p>

          {problema && <p className="mt-2 text-sm text-red-700">{problema}</p>}
        </>
      )}
    </div>
  )
}

/** Misma heurística que el previsualizador: el título no es el encabezado. */
function filaDeEncabezado(filas: Celda[][]): number {
  const anchoMax = Math.max(...filas.slice(0, 20).map((f) => f.length), 0)
  if (anchoMax < 3) return 0
  for (let i = 0; i < Math.min(filas.length, 10); i++) {
    const llenas = filas[i].filter((c) => textoDe(c).trim() !== '').length
    if (llenas >= Math.max(3, anchoMax * 0.6)) return i
  }
  return 0
}

function textoDe(c: Celda | undefined): string {
  if (c === null || c === undefined) return ''
  if (c instanceof Date) return c.toISOString().slice(0, 10)
  return String(c)
}

function aClave(texto: string): string {
  return (
    texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50) || 'columna'
  )
}

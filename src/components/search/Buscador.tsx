'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { urlCon, type Filtros } from '@/lib/busqueda'

/**
 * La caja de búsqueda, con sugerencias mientras se escribe.
 *
 * Los resultados **no** se recalculan con cada tecla: eso haría brincar la
 * lista debajo del cursor mientras la persona todavía está formulando lo
 * que quiere. Lo que sí aparece por tecla es un desplegable de sugerencias
 * —documentos concretos y temas— igual que en cualquier buscador. La
 * consulta completa se dispara al Enter o al elegir una sugerencia.
 *
 * La distinción importa: sugerir es barato y ayuda a formular; recalcular
 * la página es caro y estorba mientras se escribe.
 *
 * Se consulta directo a Postgres desde el navegador, sin ruta intermedia.
 * La función es SECURITY INVOKER, así que RLS sigue mandando: nadie ve
 * sugerido un documento que no podría abrir.
 */

const MINIMO = 2
const ESPERA = 140

type Sugerencia = {
  tipo: 'documento' | 'tema'
  id: string
  etiqueta: string
  detalle: string | null
  cuantos: number | null
}

export function Buscador({
  filtros,
  tamano = 'barra',
}: {
  filtros: Filtros
  tamano?: 'portada' | 'barra'
}) {
  const router = useRouter()
  const [texto, setTexto] = useState(filtros.q)
  const [enfocado, setEnfocado] = useState(false)
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([])
  const [abierto, setAbierto] = useState(false)
  const [resaltada, setResaltada] = useState(-1)
  const campo = useRef<HTMLInputElement>(null)
  const contenedor = useRef<HTMLDivElement>(null)

  const esPortada = tamano === 'portada'

  useEffect(() => setTexto(filtros.q), [filtros.q])

  // Barra diagonal para saltar al buscador desde cualquier parte, salvo si
  // ya se está escribiendo en otro campo.
  useEffect(() => {
    function alTeclear(e: KeyboardEvent) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const a = document.activeElement
      if (
        a instanceof HTMLInputElement ||
        a instanceof HTMLTextAreaElement ||
        a instanceof HTMLSelectElement
      ) {
        return
      }
      e.preventDefault()
      campo.current?.focus()
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [])

  // Un clic fuera cierra el desplegable. Sin esto se queda abierto sobre
  // el contenido, tapando justo lo que la persona iba a leer.
  useEffect(() => {
    function alClicar(e: MouseEvent) {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', alClicar)
    return () => document.removeEventListener('mousedown', alClicar)
  }, [])

  // Las sugerencias, con freno. Sin el retardo, escribir "derechohabientes"
  // dispara dieciséis consultas y llegan desordenadas; con 140 ms se
  // dispara una por pausa real de tecleo.
  useEffect(() => {
    const termino = texto.trim()
    if (termino.length < MINIMO || termino === filtros.q) {
      setSugerencias([])
      return
    }

    let cancelado = false
    const temporizador = setTimeout(async () => {
      const { data } = await createClient().rpc('sugerencias', {
        p_query: termino,
        p_limit: 6,
      })
      if (cancelado) return
      setSugerencias((data ?? []) as Sugerencia[])
      setResaltada(-1)
      setAbierto(true)
    }, ESPERA)

    return () => {
      cancelado = true
      clearTimeout(temporizador)
    }
  }, [texto, filtros.q])

  function buscar(valor: string) {
    setAbierto(false)
    router.push(urlCon(filtros, { q: valor.trim(), pagina: 1 }))
  }

  function elegir(s: Sugerencia) {
    setAbierto(false)
    if (s.tipo === 'documento') {
      router.push(`/doc/${s.id}`)
    } else {
      router.push(urlCon(filtros, { temas: [Number(s.id)], q: '', pagina: 1 }))
    }
  }

  function alTeclearCampo(e: React.KeyboardEvent<HTMLInputElement>) {
    const hayLista = abierto && sugerencias.length > 0

    if (e.key === 'ArrowDown' && hayLista) {
      e.preventDefault()
      setResaltada((i) => (i + 1) % sugerencias.length)
      return
    }
    if (e.key === 'ArrowUp' && hayLista) {
      e.preventDefault()
      setResaltada((i) => (i <= 0 ? sugerencias.length - 1 : i - 1))
      return
    }
    if (e.key === 'Enter') {
      // Con una sugerencia resaltada, Enter la abre. Sin ninguna, busca lo
      // escrito: la tecla hace lo que la persona está mirando.
      if (hayLista && resaltada >= 0) elegir(sugerencias[resaltada])
      else buscar(texto)
      return
    }
    if (e.key === 'Escape') {
      if (abierto) setAbierto(false)
      else if (texto) {
        setTexto('')
        buscar('')
      } else campo.current?.blur()
    }
  }

  const hayLista = abierto && sugerencias.length > 0

  return (
    <div className="relative" ref={contenedor}>
      {esPortada && (
        <div
          aria-hidden
          className={`pointer-events-none absolute -inset-2 rounded-full bg-oro/20 blur-xl transition-opacity duration-300 ${
            enfocado ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}

      <div className="relative">
        <input
          ref={campo}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onFocus={() => setEnfocado(true)}
          onBlur={() => setEnfocado(false)}
          onKeyDown={alTeclearCampo}
          placeholder={
            esPortada ? 'Buscar en el acervo' : 'Buscar por título, resumen o contenido…'
          }
          aria-label="Buscar en el acervo"
          role="combobox"
          aria-expanded={hayLista}
          aria-controls="lista-sugerencias"
          aria-autocomplete="list"
          aria-activedescendant={resaltada >= 0 ? `sugerencia-${resaltada}` : undefined}
          autoComplete="off"
          autoFocus={esPortada}
          className={
            esPortada
              ? 'w-full rounded-2xl border border-white/10 bg-papel py-5 pr-32 pl-6 text-base text-tinta shadow-[0_18px_50px_-20px_rgba(0,0,0,0.75)] outline-none placeholder:text-tinta-suave/70 sm:text-lg'
              : 'w-full rounded-full border border-linea bg-white py-2 pr-24 pl-4 text-sm text-tinta outline-none placeholder:text-tinta-suave/70 focus:border-acento focus:ring-2 focus:ring-acento-suave'
          }
        />

        <div
          className={`absolute inset-y-0 flex items-center gap-1 ${
            esPortada ? 'right-3' : 'right-1.5'
          }`}
        >
          {texto && (
            <button
              onClick={() => {
                setTexto('')
                buscar('')
              }}
              className="px-2 text-tinta-suave transition-colors hover:text-tinta"
              aria-label="Limpiar la búsqueda"
            >
              ×
            </button>
          )}
          <button
            onClick={() => buscar(texto)}
            className={
              esPortada
                ? 'rounded-xl bg-acento px-5 py-2.5 text-sm font-medium text-white transition-transform hover:scale-[1.02] active:scale-[0.98]'
                : 'rounded-full bg-acento px-3 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90'
            }
          >
            Buscar
          </button>
        </div>
      </div>

      {hayLista && (
        <ul
          id="lista-sugerencias"
          role="listbox"
          aria-label="Sugerencias"
          className={`absolute right-0 left-0 z-50 overflow-hidden border border-linea bg-white shadow-[0_20px_50px_-15px_rgba(18,51,46,0.45)] ${
            esPortada ? 'mt-2 rounded-2xl' : 'mt-1.5 rounded-xl'
          }`}
        >
          {sugerencias.map((s, i) => (
            <li key={`${s.tipo}-${s.id}`} role="none">
              <button
                id={`sugerencia-${i}`}
                role="option"
                aria-selected={i === resaltada}
                onMouseEnter={() => setResaltada(i)}
                onClick={() => elegir(s)}
                className={`flex w-full items-baseline gap-2.5 px-4 py-2.5 text-left transition-colors ${
                  i === resaltada ? 'bg-acento-suave' : 'hover:bg-papel'
                }`}
              >
                {/* El tipo se dice, no se dibuja con un icono: "tema" y
                    "documento" llevan a sitios distintos y conviene que se
                    lea, no que se adivine. */}
                <span className="w-16 shrink-0 text-[10px] tracking-wide text-tinta-suave uppercase">
                  {s.tipo}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-sm ${
                      s.tipo === 'documento' ? 'font-serif text-[0.95rem]' : ''
                    }`}
                  >
                    {s.etiqueta}
                  </span>
                  {(s.detalle || s.cuantos !== null) && (
                    <span className="mt-0.5 block text-xs text-tinta-suave">
                      {s.detalle ??
                        `${s.cuantos} documento${s.cuantos === 1 ? '' : 's'}`}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}

          <li role="none" className="border-t border-linea">
            <button
              onClick={() => buscar(texto)}
              className="w-full px-4 py-2 text-left text-xs text-tinta-suave transition-colors hover:bg-papel"
            >
              Buscar «{texto.trim()}» en todo el contenido
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}

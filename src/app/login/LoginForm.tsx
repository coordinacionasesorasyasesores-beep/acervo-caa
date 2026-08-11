'use client'

import { useActionState, useState } from 'react'
import { entrar, pedirRecuperacion } from './actions'

const estadoInicial = {} as { error?: string; email?: string }
const recuperacionInicial = {} as { error?: string; aviso?: string }

export function LoginForm({ errorInicial }: { errorInicial?: string }) {
  const [estado, accion, entrando] = useActionState(entrar, estadoInicial)
  const [olvidada, setOlvidada] = useState(false)
  const error = estado.error ?? errorInicial

  if (olvidada) return <Recuperar volver={() => setOlvidada(false)} />

  return (
    <>
      <div className="rounded-2xl border border-jade/40 bg-papel p-6 shadow-[0_2px_40px_-12px_rgba(0,0,0,0.6)]">
        <form action={accion} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium">
              Correo institucional
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              autoFocus
              defaultValue={estado.email ?? ''}
              placeholder="nombre@issste.gob.mx"
              className="mt-1 w-full rounded border border-linea px-3 py-2 text-sm outline-none focus:border-acento focus:ring-2 focus:ring-acento-suave"
            />
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="password" className="block text-sm font-medium">
                Contraseña
              </label>
              <button
                type="button"
                onClick={() => setOlvidada(true)}
                className="text-xs text-acento underline-offset-2 hover:underline"
              >
                ¿La olvidaste?
              </button>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="mt-1 w-full rounded border border-linea px-3 py-2 text-sm outline-none focus:border-acento focus:ring-2 focus:ring-acento-suave"
            />
          </div>

          <button
            type="submit"
            disabled={entrando}
            className="w-full rounded bg-acento py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {entrando ? 'Entrando…' : 'Entrar'}
          </button>

          {error && (
            <p className="text-sm leading-relaxed text-carmin" role="alert">
              {error}
            </p>
          )}
        </form>
      </div>

      <p className="mt-4 text-center text-xs leading-relaxed text-niebla">
        Las cuentas las crea un administrador del área.
      </p>
    </>
  )
}

/**
 * Pedir el enlace de recuperación.
 *
 * Ocupa el lugar del formulario en vez de abrirse debajo: son dos tareas
 * distintas —entrar y recuperar— y tenerlas juntas invita a teclear la
 * contraseña en el campo equivocado.
 */
function Recuperar({ volver }: { volver: () => void }) {
  const [estado, pedir, pidiendo] = useActionState(
    pedirRecuperacion,
    recuperacionInicial,
  )

  return (
    <>
      <div className="rounded-2xl border border-jade/40 bg-papel p-6 shadow-[0_2px_40px_-12px_rgba(0,0,0,0.6)]">
        {estado.aviso ? (
          <>
            <h2 className="mb-1 text-sm font-medium">Revisa tu correo</h2>
            <p className="text-xs leading-relaxed text-tinta-suave">{estado.aviso}</p>
          </>
        ) : (
          <form action={pedir} className="space-y-4">
            <div>
              <label htmlFor="email-rec" className="block text-sm font-medium">
                Tu correo
              </label>
              <p className="mt-1 mb-1.5 text-xs leading-relaxed text-tinta-suave">
                Te llega un enlace para poner una contraseña nueva.
              </p>
              <input
                id="email-rec"
                name="email"
                type="email"
                autoComplete="username"
                required
                autoFocus
                placeholder="nombre@issste.gob.mx"
                className="w-full rounded border border-linea px-3 py-2 text-sm outline-none focus:border-acento focus:ring-2 focus:ring-acento-suave"
              />
            </div>

            <button
              type="submit"
              disabled={pidiendo}
              className="w-full rounded bg-acento py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {pidiendo ? 'Enviando…' : 'Enviar enlace'}
            </button>

            {estado.error && (
              <p className="text-sm leading-relaxed text-carmin" role="alert">
                {estado.error}
              </p>
            )}
          </form>
        )}
      </div>

      <p className="mt-4 text-center text-xs leading-relaxed text-niebla">
        <button onClick={volver} className="underline underline-offset-2 hover:text-oro-claro">
          Volver a la entrada
        </button>
      </p>
    </>
  )
}

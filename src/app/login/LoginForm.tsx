'use client'

import { useActionState } from 'react'
import { entrar } from './actions'

const estadoInicial = {} as { error?: string; email?: string }

export function LoginForm({ errorInicial }: { errorInicial?: string }) {
  const [estado, accion, entrando] = useActionState(entrar, estadoInicial)
  const error = estado.error ?? errorInicial

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
            <label htmlFor="password" className="block text-sm font-medium">
              Contraseña
            </label>
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

      {/* Sin autoservicio de contraseña: no hay correo saliente con el que
          mandar un enlace de recuperación. Decirlo aquí evita que alguien
          busque un "olvidé mi contraseña" que no existe. */}
      <p className="mt-4 text-center text-xs leading-relaxed text-niebla">
        Las cuentas las crea un administrador del área. Si olvidaste tu
        contraseña, pídele que te asigne una nueva.
      </p>
    </>
  )
}

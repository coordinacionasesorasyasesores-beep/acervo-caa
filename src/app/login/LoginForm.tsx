'use client'

import { useActionState } from 'react'
import { enviarCodigo, verificarCodigo } from './actions'

const estadoInicial = {} as { error?: string; enviado?: boolean; email?: string }

export function LoginForm({ errorInicial }: { errorInicial?: string }) {
  const [envio, accionEnviar, enviando] = useActionState(enviarCodigo, estadoInicial)
  const [verif, accionVerificar, verificando] = useActionState(verificarCodigo, envio)

  const yaEnviado = envio.enviado || verif.enviado
  const email = verif.email ?? envio.email ?? ''
  const error = verif.error ?? envio.error ?? errorInicial

  return (
    <>
      <div className="rounded-lg border border-linea bg-white p-6">
        {!yaEnviado ? (
          <form action={accionEnviar} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium">
                Correo institucional
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                autoFocus
                className="mt-1.5 w-full rounded border border-linea px-3 py-2 text-sm outline-none focus:border-acento focus:ring-2 focus:ring-acento-suave"
              />
            </div>
            <button
              type="submit"
              disabled={enviando}
              className="w-full rounded bg-acento px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {enviando ? 'Enviando…' : 'Enviar acceso al correo'}
            </button>
          </form>
        ) : (
          <form action={accionVerificar} className="space-y-4">
            <input type="hidden" name="email" value={email} />
            <div>
              <p className="text-sm">
                Te mandamos un correo a <span className="font-medium">{email}</span>.
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-tinta-suave">
                Si trae un enlace, ábrelo y ya estás dentro. Si trae un código de
                seis dígitos, escríbelo aquí. Vence en una hora.
              </p>
              <label htmlFor="token" className="mt-4 block text-sm font-medium">
                Código de acceso
              </label>
              <input
                id="token"
                name="token"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                className="mt-1.5 w-full rounded border border-linea px-3 py-2 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-acento focus:ring-2 focus:ring-acento-suave"
              />
            </div>
            <button
              type="submit"
              disabled={verificando}
              className="w-full rounded bg-acento px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {verificando ? 'Comprobando…' : 'Entrar'}
            </button>
          </form>
        )}

        {error && (
          <p role="alert" className="mt-4 text-sm leading-relaxed text-red-700">
            {error}
          </p>
        )}
      </div>

      <p className="mt-6 text-xs leading-relaxed text-tinta-suave">
        El acceso es interno. Si tu correo no está dado de alta, pide a un
        administrador del área que te agregue.
      </p>
    </>
  )
}

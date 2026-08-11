'use client'

import { useActionState } from 'react'
import { fijarContrasena, type Resultado } from './acciones'
import { MIN_CONTRASENA } from '@/lib/contrasena'

const inicial: Resultado = { error: null }

export function FormularioContrasena() {
  const [estado, guardar, guardando] = useActionState(fijarContrasena, inicial)

  return (
    <form action={guardar} className="space-y-4">
      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          Contraseña nueva
        </label>
        <input
          id="password"
          name="password"
          type="password"
          // `new-password` y no `current-password`: es lo que le dice al
          // gestor de contraseñas que ofrezca generar una y guardarla, en
          // vez de rellenar la vieja que justamente ya no sirve.
          autoComplete="new-password"
          required
          autoFocus
          minLength={MIN_CONTRASENA}
          className="mt-1 w-full rounded border border-linea px-3 py-2 text-sm outline-none focus:border-acento focus:ring-2 focus:ring-acento-suave"
        />
        <p className="mt-1 text-xs text-tinta-suave">
          Al menos {MIN_CONTRASENA} caracteres.
        </p>
      </div>

      <div>
        <label htmlFor="password2" className="block text-sm font-medium">
          Repítela
        </label>
        <input
          id="password2"
          name="password2"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_CONTRASENA}
          className="mt-1 w-full rounded border border-linea px-3 py-2 text-sm outline-none focus:border-acento focus:ring-2 focus:ring-acento-suave"
        />
      </div>

      <button
        type="submit"
        disabled={guardando}
        className="w-full rounded bg-acento py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {guardando ? 'Guardando…' : 'Guardar y entrar'}
      </button>

      {estado.error && (
        <p className="text-sm leading-relaxed text-carmin" role="alert">
          {estado.error}
        </p>
      )}
    </form>
  )
}

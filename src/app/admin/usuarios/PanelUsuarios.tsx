'use client'

import { useActionState, useState } from 'react'
import { ROLES, ROLE_LABEL, ROLE_PUEDE, type Role } from '@/lib/roles'
import { BotonConfirmar } from '@/components/ui/BotonConfirmar'
import {
  agregarALista,
  cambiarRol,
  quitarDeLista,
  type Resultado,
} from './acciones'

const inicial: Resultado = { error: null }

type Perfil = { id: string; full_name: string | null; role: Role }
type Entrada = { email: string; role: Role; note: string | null; added_at: string }

export function PanelUsuarios({
  yo,
  perfiles,
  lista,
}: {
  yo: string
  perfiles: Perfil[]
  lista: Entrada[]
}) {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-2 text-xs font-semibold tracking-wide text-tinta-suave uppercase">
          Personas registradas
        </h2>
        <ul className="divide-y divide-linea rounded-lg border border-linea bg-white">
          {perfiles.map((p) => (
            <FilaPerfil key={p.id} perfil={p} soyYo={p.id === yo} />
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold tracking-wide text-tinta-suave uppercase">
          Lista de acceso
        </h2>
        <NuevoCorreo />
        <ul className="mt-3 divide-y divide-linea rounded-lg border border-linea bg-white">
          {lista.map((e) => (
            <FilaLista key={e.email} entrada={e} />
          ))}
          {lista.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-tinta-suave">
              La lista está vacía: nadie puede registrarse.
            </li>
          )}
        </ul>
      </section>
    </div>
  )
}

function FilaPerfil({ perfil, soyYo }: { perfil: Perfil; soyYo: boolean }) {
  const [estado, cambiar, cambiando] = useActionState(cambiarRol, inicial)

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-2.5">
      <span className="min-w-0 flex-1 text-sm">
        {perfil.full_name ?? <span className="text-tinta-suave">Sin nombre</span>}
        {soyYo && <span className="ml-2 text-xs text-tinta-suave">(tú)</span>}
      </span>

      {soyYo ? (
        // El trigger `guard_role_change` lo impide en la base; deshabilitarlo
        // aquí evita que alguien descubra la regla a base de errores.
        <span
          className="text-xs text-tinta-suave"
          title="Nadie puede cambiarse el rol a sí mismo: es la forma de que no quede el proyecto sin administradores por accidente."
        >
          {ROLE_LABEL[perfil.role]} · no puedes cambiarte el rol
        </span>
      ) : (
        <form action={cambiar} className="flex items-center gap-2">
          <input type="hidden" name="id" value={perfil.id} />
          <select
            name="role"
            defaultValue={perfil.role}
            disabled={cambiando}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            title={ROLE_PUEDE[perfil.role]}
            className="rounded border border-linea px-2 py-1 text-sm outline-none focus:border-acento disabled:opacity-50"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </form>
      )}

      {estado.error && <span className="text-xs text-red-700">{estado.error}</span>}
    </li>
  )
}

function FilaLista({ entrada }: { entrada: Entrada }) {
  const [estado, quitar, quitando] = useActionState(quitarDeLista, inicial)

  return (
    <li className="px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-0 flex-1 text-sm">
          {entrada.email}
          <span className="ml-2 text-xs text-tinta-suave">
            entra como {ROLE_LABEL[entrada.role].toLowerCase()}
            {entrada.note ? ` · ${entrada.note}` : ''}
          </span>
        </span>

        <form action={quitar}>
          <input type="hidden" name="email" value={entrada.email} />
          <BotonConfirmar
            pregunta="¿Quitar de la lista?"
            enviando={quitando}
            className="text-xs text-tinta-suave underline-offset-2 hover:text-red-700 hover:underline"
          >
            Quitar
          </BotonConfirmar>
        </form>
      </div>

      {estado.error && <p className="mt-1 text-xs text-red-700">{estado.error}</p>}
      {estado.aviso && <p className="mt-1 text-xs text-tinta-suave">{estado.aviso}</p>}
    </li>
  )
}

function NuevoCorreo() {
  const [estado, agregar, agregando] = useActionState(agregarALista, inicial)
  const [abierto, setAbierto] = useState(false)

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="rounded border border-linea bg-white px-3 py-1.5 text-sm transition-colors hover:bg-papel"
      >
        Autorizar un correo
      </button>
    )
  }

  return (
    <form action={agregar} className="rounded-lg border border-linea bg-white p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-56 flex-1">
          <span className="text-sm font-medium">Correo</span>
          <input
            name="email"
            type="email"
            required
            autoFocus
            placeholder="nombre@issste.gob.mx"
            className="mt-1 w-full rounded border border-linea px-2.5 py-1.5 text-sm outline-none focus:border-acento"
          />
        </label>

        <label>
          <span className="text-sm font-medium">Entra como</span>
          <select
            name="role"
            defaultValue="lector"
            className="mt-1 w-full rounded border border-linea px-2.5 py-1.5 text-sm outline-none focus:border-acento"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>

        <label className="min-w-40 flex-1">
          <span className="text-sm font-medium">Nota</span>
          <input
            name="note"
            placeholder="Área o quién lo pidió"
            className="mt-1 w-full rounded border border-linea px-2.5 py-1.5 text-sm outline-none focus:border-acento"
          />
        </label>

        <button
          type="submit"
          disabled={agregando}
          className="rounded bg-acento px-3.5 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {agregando ? 'Guardando…' : 'Autorizar'}
        </button>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="px-1.5 py-1.5 text-sm text-tinta-suave hover:text-tinta"
        >
          Cancelar
        </button>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-tinta-suave">
        El rol se asigna en el momento del alta: si la persona ya se
        registró, cámbiaselo arriba en lugar de aquí.
      </p>

      {estado.error && <p className="mt-2 text-sm text-red-700">{estado.error}</p>}
      {estado.aviso && <p className="mt-2 text-sm text-tinta-suave">{estado.aviso}</p>}
    </form>
  )
}

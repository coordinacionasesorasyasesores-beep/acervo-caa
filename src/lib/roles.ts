/**
 * Los roles, sin nada de servidor alrededor.
 *
 * Viven aparte de `auth.ts` a propósito: ese módulo importa `next/headers`
 * para leer las cookies de la sesión, y cualquier componente de cliente que
 * quisiera el nombre legible de un rol arrastraba código de servidor al
 * bundle del navegador. El error que produce ("You're importing a component
 * that needs next/headers") no menciona el rótulo que uno quería usar, así
 * que cuesta un rato entender de dónde salió.
 */

export type Role = 'lector' | 'cargador' | 'admin'

export const ROLES: Role[] = ['lector', 'cargador', 'admin']

export const ROLE_LABEL: Record<Role, string> = {
  lector: 'Lector',
  cargador: 'Cargador',
  admin: 'Administrador',
}

/** Lo que puede hacer cada rol, en una línea, para la interfaz. */
export const ROLE_PUEDE: Record<Role, string> = {
  lector: 'Consulta y descarga.',
  cargador: 'Consulta, descarga y sube documentos.',
  admin: 'Todo, incluidos catálogos, roles y archivado.',
}

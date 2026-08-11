/**
 * La regla de la contraseña, en un solo sitio.
 *
 * Vivía dentro de las acciones de administración, que son un módulo
 * `'use server'`: de ahí solo se pueden exportar funciones asíncronas, así
 * que la regla no podía compartirse y la pantalla de recuperación habría
 * tenido que reescribirla. Dos copias de una regla de seguridad terminan
 * discrepando, y la que se relaja primero es la que decide.
 */

/**
 * Doce, no ocho. Aquí la contraseña no se teclea a diario —se entrega en
 * persona o se fija una vez tras recuperarla— así que el costo de que sea
 * larga lo paga quien la escribe una vez, y el beneficio lo cobra el
 * acervo entero.
 */
export const MIN_CONTRASENA = 12

/** Devuelve el problema, o null si la contraseña sirve. */
export function revisarContrasena(p: string): string | null {
  if (p.length < MIN_CONTRASENA) {
    return `La contraseña necesita al menos ${MIN_CONTRASENA} caracteres.`
  }
  return null
}

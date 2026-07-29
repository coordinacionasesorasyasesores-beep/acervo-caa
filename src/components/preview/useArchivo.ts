'use client'

import { useEffect, useState } from 'react'

/**
 * Trae los bytes de una versión al navegador.
 *
 * Dos saltos: la ruta de servidor verifica la sesión, registra el acceso y
 * devuelve una URL firmada de vida corta; después el navegador baja el
 * archivo del almacén directo, sin pasar por el servidor de la app. Con
 * archivos de 40 MB y quince personas, hacerlo de intermediario sería pagar
 * ancho de banda y latencia para no ganar nada.
 */
export function useArchivo(versionId: string, tipo: 'archivo' | 'texto' = 'archivo') {
  const [datos, setDatos] = useState<ArrayBuffer | null>(null)
  const [texto, setTexto] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false

    async function traer() {
      try {
        const query = tipo === 'texto' ? '?texto=1' : '?preview=1'
        const res = await fetch(`/api/download/${versionId}${query}`)
        const cuerpo = await res.json()
        if (!res.ok) throw new Error(cuerpo.error ?? 'No se pudo abrir el archivo.')

        const archivo = await fetch(cuerpo.url)
        if (!archivo.ok) throw new Error('El almacén no entregó el archivo.')

        if (tipo === 'texto') {
          const t = await archivo.text()
          if (!cancelado) setTexto(t)
        } else {
          const b = await archivo.arrayBuffer()
          if (!cancelado) setDatos(b)
        }
      } catch (e) {
        if (!cancelado) {
          setError(e instanceof Error ? e.message : 'No se pudo abrir el archivo.')
        }
      }
    }

    void traer()
    return () => {
      cancelado = true
    }
  }, [versionId, tipo])

  return { datos, texto, error, cargando: !datos && !texto && !error }
}

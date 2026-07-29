export function Cargando({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-linea bg-white px-6 py-10 text-center">
      <p className="animate-pulse text-sm text-tinta-suave">{children}</p>
    </div>
  )
}

/**
 * Un preview que falla no es el fin del mundo: el archivo sigue ahí y se
 * puede descargar. Por eso el mensaje dice qué pasó y no bloquea nada.
 */
export function Fallo({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-sm text-amber-900">
        No se pudo mostrar la vista previa. {children}
      </p>
      <p className="mt-1 text-xs text-amber-900/80">
        El archivo está bien; puedes descargarlo con el botón de arriba.
      </p>
    </div>
  )
}

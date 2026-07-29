import type { Metadata } from 'next'
import { Instrument_Sans, Newsreader } from 'next/font/google'
import './globals.css'

/**
 * Dos familias, dos trabajos.
 *
 * Instrument Sans lleva la interfaz: un grotesco de formas cerradas que
 * aguanta el interletrado apretado de los titulares sin deshacerse.
 * Newsreader lleva los títulos de documento y el logotipo, porque el
 * contenido de este sistema son documentos, y una serif de lectura
 * anuncia lo que la cosa es antes de que nadie lea una palabra.
 */
const ui = Instrument_Sans({
  subsets: ['latin'],
  variable: '--fuente-ui',
  display: 'swap',
})

const documento = Newsreader({
  subsets: ['latin'],
  variable: '--fuente-documento',
  display: 'swap',
  style: ['normal', 'italic'],
})

export const metadata: Metadata = {
  title: 'Acervo CAA',
  description:
    'Acervo de investigaciones y documentos de trabajo de la Coordinación de Asesoras y Asesores del ISSSTE.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${ui.variable} ${documento.variable}`}>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  )
}
